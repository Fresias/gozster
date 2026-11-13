// GOZS-513 — Guard instalado sincronizado con origin/main y guard de usuario para Antigravity.
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..");
const repoRoot = path.resolve(kitDir, "..");
const sharedPath = path.join(kitDir, "core", "plugins", "shared", "kit.mjs");
const kit = await import(pathToFileURL(sharedPath).href);

const temps: string[] = [];
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));
function temp(prefix: string): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(d);
  return d;
}
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8", stdio: "pipe" }).trim();
const junction = (target: string, link: string) =>
  execFileSync(process.execPath, ["-e", `require("fs").symlinkSync(${JSON.stringify(target)}, ${JSON.stringify(link)}, "junction")`]);

/** <workdir>/repo: a git repo whose origin/main holds this checkout's kit (Multica layout). */
function consumer(): { workdir: string; repo: string; main: string } {
  const workdir = temp("gs-workdir-");
  const repo = path.join(workdir, "repo");
  for (const p of kit.KIT_PARTS) cpSync(path.join(kitDir, p), path.join(repo, "harness-kit", p), { recursive: true });
  mkdirSync(path.join(repo, "harness"));
  writeFileSync(path.join(repo, "harness", "project.json"), JSON.stringify({ name: "c", runtimes: [], gate: "npm test" }));
  git(repo, "init", "-q");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "kit");
  git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
  return { workdir, repo, main: git(repo, "rev-parse", "HEAD") };
}

function install(home: string, runtime = "claude-code") {
  execFileSync(process.execPath, [path.join(kitDir, "core", "plugins", runtime, "install.mjs"), "--home", home], { stdio: "pipe" });
  return path.join(home, ".claude", "hooks");
}

function hook(file: string, payload: unknown): { code: number; out: string; err: string } {
  try {
    const out = execFileSync(process.execPath, [file], { input: JSON.stringify(payload), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return { code: 0, out, err: "" };
  } catch (e) {
    const x = e as { status?: number; stdout?: string; stderr?: string };
    return { code: x.status ?? 1, out: x.stdout ?? "", err: x.stderr ?? "" };
  }
}
const bash = (workdir: string, command: string) => ({ hook_event_name: "PreToolUse", cwd: workdir, tool_name: "Bash", tool_input: { command } });
const rulesRel = path.join("harness-kit", "adapters", "multica", "rules.json");
const dropSearchBounded = (file: string) =>
  writeFileSync(file, JSON.stringify(JSON.parse(readFileSync(file, "utf8")).filter((r: { id: string }) => r.id !== "multica.search-bounded"), null, 2));

describe("resolveRepo compartido (shared/kit.mjs)", () => {
  const { workdir, repo } = consumer();
  it("GIVEN cwd = workdir de Multica THEN resuelve el único repo hijo", () => {
    expect(kit.resolveRepo(workdir, [])).toBe(repo);
  });
  it("GIVEN cwd dentro del repo THEN sube hasta la raíz", () => {
    expect(kit.resolveRepo(path.join(repo, "harness-kit", "core"), [])).toBe(repo);
  });
  it("GIVEN una ruta de archivo dentro del repo y cwd ajeno THEN gana la ruta", () => {
    expect(kit.resolveRepo(temp("gs-elsewhere-"), [path.join(repo, "harness", "project.json")])).toBe(repo);
  });
  it("GIVEN un directorio sin repo con guard THEN vacío", () => {
    expect(kit.resolveRepo(temp("gs-none-"), [])).toBe("");
  });
  it("lo usan ambos dispatchers, sin copia propia", () => {
    for (const rt of ["claude-code", "antigravity"]) {
      const src = readFileSync(path.join(kitDir, "core", "plugins", rt, "dispatch.mjs"), "utf8");
      expect(src).toContain("resolveRepo");
      expect(src).not.toMatch(/function (upward|child|hasGuard)/);
    }
  });
});

describe("Sync del kit instalado desde origin/main (dispatcher de Claude Code)", () => {
  it("GIVEN copia instalada sin multica.search-bounded y origin/main con ella WHEN una tool call THEN reinstala y bloquea en esa misma llamada", () => {
    const { workdir, main } = consumer();
    const hooks = install(temp("gs-home-"));
    dropSearchBounded(path.join(hooks, rulesRel));
    const r = hook(path.join(hooks, "harness-dispatch.mjs"), bash(workdir, "multica issue search foo"));
    expect(r.code).toBe(2);
    expect(r.err).toContain(`synced from origin/main (checkout -> ${main.slice(0, 7)})`);
    expect(r.err).toContain("--project");
    expect(readFileSync(path.join(hooks, rulesRel), "utf8")).toContain("multica.search-bounded");
  });

  it("GIVEN un harness-dispatch.mjs instalado distinto del de origin/main WHEN corre el sync THEN también se reemplaza", () => {
    const { repo } = consumer();
    const hooks = install(temp("gs-home-"));
    const installed = path.join(hooks, "harness-dispatch.mjs");
    writeFileSync(installed, readFileSync(installed, "utf8") + "// viejo\n");
    expect(kit.syncKit(repo, hooks, () => {})).toBe("synced");
    expect(readFileSync(installed, "utf8")).toBe(readFileSync(path.join(repo, "harness-kit", "core", "plugins", "claude-code", "dispatch.mjs"), "utf8"));
  });

  it("GIVEN una rama de trabajo con rules.json debilitado WHEN una tool call THEN aplica la versión de origin/main", () => {
    const { workdir, repo } = consumer();
    git(repo, "checkout", "-q", "-b", "feature/1-x");
    dropSearchBounded(path.join(repo, rulesRel));
    git(repo, "commit", "-qam", "debilitar");
    const hooks = install(temp("gs-home-"));
    dropSearchBounded(path.join(hooks, rulesRel)); // instalado también viejo: solo origin/main lo trae
    expect(hook(path.join(hooks, "harness-dispatch.mjs"), bash(workdir, "multica issue search foo")).code).toBe(2);
  });

  it("GIVEN un repo sin origin/main WHEN una tool call THEN usa la copia instalada y no falla", () => {
    const { workdir, repo } = consumer();
    git(repo, "update-ref", "-d", "refs/remotes/origin/main");
    const hooks = install(temp("gs-home-"));
    dropSearchBounded(path.join(hooks, rulesRel));
    expect(kit.syncKit(repo, hooks, () => {})).toBe("skipped");
    const blocked = hook(path.join(hooks, "harness-dispatch.mjs"), bash(workdir, "cd repo && git branch -D foo"));
    expect(blocked.code).toBe(2);
    expect(hook(path.join(hooks, "harness-dispatch.mjs"), bash(workdir, "multica issue search foo --project p1")).code).toBe(0);
  });

  it("GIVEN dos tool calls con el mismo sha de origin/main THEN compara hashes una sola vez", () => {
    const { repo } = consumer();
    const hooks = install(temp("gs-home-"));
    expect(kit.syncKit(repo, hooks, () => {})).toBe("unchanged");
    expect(kit.syncKit(repo, hooks, () => {})).toBe("cached");
    // Un sha nuevo de main vuelve a comparar.
    writeFileSync(path.join(repo, "x.txt"), "x");
    git(repo, "add", "x.txt");
    git(repo, "commit", "-qm", "x");
    git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
    expect(kit.syncKit(repo, hooks, () => {})).toBe("unchanged");
  });

  it("GIVEN dos procesos que reinstalan en paralelo THEN la copia queda completa, consistente y sin temporales", async () => {
    const hooks = temp("gs-race-");
    const script = `
      const kit = await import(${JSON.stringify(pathToFileURL(sharedPath).href)});
      const files = kit.readKit(${JSON.stringify(kitDir)});
      for (let i = 0; i < 8; i++) kit.installKit(${JSON.stringify(hooks)}, files, { source: "t", sha: String(i) });`;
    const runOne = () =>
      new Promise<number>((resolve) => spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: "ignore" }).on("exit", (c) => resolve(c ?? 1)));
    expect(await Promise.all([runOne(), runOne()])).toEqual([0, 0]);
    expect(kit.kitHash(kit.readKit(path.join(hooks, "harness-kit")))).toBe(kit.kitHash(kit.readKit(kitDir)));
    expect(existsSync(path.join(hooks, "harness-kit", kit.MARKER))).toBe(true);
    expect(readdirSync(hooks)).toEqual(["harness-kit"]);
  }, 60000);
});

describe("Antigravity: hook de proyecto regenerado", () => {
  const ag = JSON.parse(readFileSync(path.join(repoRoot, ".agents", "hooks.json"), "utf8"))["gozster-guard"].PreToolUse[0];
  it("el matcher cubre read_file, write_file y edit_file", () => {
    for (const t of ["read_file", "write_file", "edit_file"]) expect(t).toMatch(new RegExp(`^(?:${ag.matcher})$`));
  });
  it("el comando no depende de bash (cmd /c puede resolver WSL)", () => {
    expect(ag.hooks[0].command).not.toMatch(/\bbash\b/);
    expect(ag.hooks[0].command).toMatch(/^node /);
  });
});

describe("Antigravity: guard de usuario (~/.gemini/config/hooks.json)", () => {
  // Layout Multica: agy arranca en <workdir>/, el repo está en <workdir>/gozster (junction a este checkout).
  const workdir = temp("gs-agy-");
  const repo = path.join(workdir, "gozster");
  junction(repoRoot, repo);
  const dispatch = path.join(kitDir, "core", "plugins", "antigravity", "dispatch.mjs");
  const fixture = (name: string, toolCall: unknown) => {
    const f = JSON.parse(readFileSync(path.join(kitDir, "tests", "fixtures", "antigravity", `${name}.json`), "utf8"));
    return { ...f, workspacePaths: [workdir], toolCall };
  };
  const decide = (payload: unknown) => {
    const r = hook(dispatch, payload);
    expect(r.code).toBe(0);
    return JSON.parse(r.out);
  };

  it("GIVEN agy iniciado en <workdir>/ WHEN run_command `cat package-lock.json` THEN deny", () => {
    const d = decide(fixture("pre-shell", { name: "run_command", args: { CommandLine: "cat package-lock.json" } }));
    expect(d.decision).toBe("deny");
  });
  it("GIVEN read_file sobre un archivo de entorno THEN deny", () => {
    expect(decide(fixture("pre-read", { name: "read_file", args: { Path: path.join(repo, ".env.local") } })).decision).toBe("deny");
  });
  it("GIVEN write_file / edit_file sobre un archivo generado THEN deny (write.generated)", () => {
    const target = path.join(repo, "AGENTS.md");
    for (const toolCall of [
      { name: "write_file", args: { Path: target, Content: "x", Overwrite: true } },
      { name: "edit_file", args: { Path: target, Target: "a", Replacement: "b" } },
    ]) {
      const d = decide(fixture("pre-write", toolCall));
      expect(d.decision).toBe("deny");
      expect(d.reason).toMatch(/generate/i);
    }
  });
  it("GIVEN una tool inocua THEN allow", () => {
    expect(decide(fixture("pre-shell", { name: "run_command", args: { CommandLine: "git status" } })).decision).toBe("allow");
  });
  it("GIVEN un directorio sin repo THEN allow sin intervenir", () => {
    const d = decide({ workspacePaths: [temp("gs-agy-none-")], toolCall: { name: "run_command", args: { CommandLine: "rm -rf x" } } });
    expect(d.decision).toBe("allow");
  });

  it("install.mjs registra un hook propio con node (sin bash) y el dispatcher instalado aplica el kit instalado", () => {
    const home = temp("gs-agy-home-");
    const hooks = install(home, "antigravity");
    const cfg = JSON.parse(readFileSync(path.join(home, ".gemini", "config", "hooks.json"), "utf8"));
    const entry = cfg["harness-kit-user-guard"].PreToolUse[0];
    expect(cfg["gozster-guard"]).toBeUndefined();
    expect(entry.hooks[0].command).toMatch(/^node ".*harness-dispatch-antigravity\.mjs"$/);
    for (const t of ["run_command", "view_file", "read_file", "write_file", "edit_file"]) expect(t).toMatch(new RegExp(`^(?:${entry.matcher})$`));
    execFileSync(process.execPath, [path.join(kitDir, "core", "plugins", "antigravity", "install.mjs"), "--home", home, "--check"], { stdio: "pipe" });
    const r = hook(path.join(hooks, "harness-dispatch-antigravity.mjs"), fixture("pre-shell", { name: "run_command", args: { CommandLine: "git reset --hard" } }));
    expect(JSON.parse(r.out).decision).toBe("deny");
  });
});
