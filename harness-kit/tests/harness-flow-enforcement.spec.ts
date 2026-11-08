import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error - mjs module
import { evaluateRules } from "../core/guard/guard-core.mjs";
// @ts-expect-error - mjs module
import { normalize } from "../core/guard/normalize.mjs";
// @ts-expect-error - mjs module
import { evaluateMerge, isHarnessPath, issueFromBranch, parseSealBlock } from "../core/scripts/harness-merge-check.mjs";

// GOZS-428 — Harness² flow enforcement. Gherkin:
//   GIVEN a PR branch <type>/<n>-slug WHEN the gate runs without harness/experience/<ISSUE>.jsonl THEN it fails.
//   GIVEN gh pr merge WHEN seal != PR head, lesson missing, or harness files without label + PPC THEN blocked.
//   GIVEN a write to harness sources (Write/Edit/Bash/PowerShell) on a non-harness branch THEN blocked.
//   GIVEN an overlay with BOM, control chars or non-UTF-8 THEN render fails with file + line.

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.resolve(here, "..", "core", "scripts");
const gateScript = path.join(scripts, "harness-gate.sh").replace(/\\/g, "/");
const learnScript = path.join(scripts, "harness-learn.sh").replace(/\\/g, "/");
const renderScript = path.join(scripts, "harness-render.mjs");
const gitBashWin = "C:\\Program Files\\Git\\bin\\bash.exe";
const bashBin = process.platform === "win32" && existsSync(gitBashWin) ? gitBashWin : "bash";

const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
function temp(prefix: string): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

function run(cmd: string, args: string[], cwd: string): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** Temp repo with issue_prefix, on branch `branch`. */
function repo(branch: string): string {
  const dir = temp("harness-flow-");
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init");
  git("config", "user.name", "Tester");
  git("config", "user.email", "tester@users.noreply.github.com");
  writeFileSync(path.join(dir, ".gitignore"), ".harness/\n");
  mkdirSync(path.join(dir, "harness"));
  writeFileSync(
    path.join(dir, "harness", "project.json"),
    JSON.stringify({ name: "t", runtimes: [], issue_prefix: "PROJ", gate: "node -e 'process.exit(0)'" }),
  );
  git("add", ".");
  git("commit", "-m", "init");
  git("branch", "-M", "main");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("checkout", "-b", branch);
  return dir;
}

describe("Learner obligatorio: el gate no sella sin la lección del issue", () => {
  it("GIVEN feature/77-x sin lección THEN el gate falla y pide harness-learn.sh", () => {
    const dir = repo("feature/77-x");
    const res = run(bashBin, [gateScript], dir);
    expect(res.code).toBe(1);
    expect(res.out).toContain("missing lesson for PROJ-77");
    expect(existsSync(path.join(dir, ".harness", "complete.json"))).toBe(false);
  });

  it("GIVEN la lección registrada (issue derivado de la rama) THEN el gate sella con issue y --pr-block imprime el bloque", () => {
    const dir = repo("feature/77-x");
    const learn = run(bashBin, [learnScript, "--lesson", "Usar el bloque del sello en el PR"], dir);
    expect(learn.code).toBe(0);
    const file = path.join(dir, "harness", "experience", "PROJ-77.jsonl");
    const entry = JSON.parse(readFileSync(file, "utf8").trim());
    expect(entry).toMatchObject({ task: "PROJ-77", proposal: "pre-merge", lesson: "Usar el bloque del sello en el PR" });

    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-m", "learn"], { cwd: dir });
    expect(run(bashBin, [gateScript], dir).code).toBe(0);
    const seal = JSON.parse(readFileSync(path.join(dir, ".harness", "complete.json"), "utf8"));
    expect(seal.issue).toBe("PROJ-77");
    expect(seal.worktree_clean).toBe(true);

    const block = run(bashBin, [gateScript, "--pr-block"], dir);
    expect(block.code).toBe(0);
    expect(parseSealBlock(block.out)).toMatchObject({ head: seal.head, fingerprint: seal.fingerprint });
  });

  it("GIVEN la misma lección dos veces THEN se registra una sola vez (idempotente)", () => {
    const dir = repo("fix/5-y");
    run(bashBin, [learnScript, "--lesson", "L1"], dir);
    const second = run(bashBin, [learnScript, "--lesson", "L1"], dir);
    expect(second.out).toContain("idempotent");
    const rows = readFileSync(path.join(dir, "harness", "experience", "PROJ-5.jsonl"), "utf8").trim().split("\n");
    expect(rows).toHaveLength(1);
  });

  it("GIVEN harness-learn.sh sin --lesson THEN falla (el subject del commit no es una lección)", () => {
    const dir = repo("fix/5-y");
    expect(run(bashBin, [learnScript], dir).code).toBe(1);
  });

  it("GIVEN un sello sobre worktree sucio THEN --pr-block se niega", () => {
    const dir = repo("main-work");
    expect(run(bashBin, [gateScript], dir).code).toBe(0);
    writeFileSync(path.join(dir, "x.txt"), "dirty\n");
    expect(run(bashBin, [gateScript], dir).code).toBe(0);
    expect(run(bashBin, [gateScript, "--pr-block"], dir).code).toBe(1);
  });
});

describe("harness-merge-check: sello == HEAD del PR, lección y PPC", () => {
  const project = { issue_prefix: "PROJ", gate: "npm test" };
  const head = "a".repeat(40);
  const seal = `<!-- harness-seal: ${JSON.stringify({ head, fingerprint: "0123456789abcdef", gate: "npm test", worktree_clean: true })} -->`;
  const lesson = JSON.stringify({ task: "PROJ-12", lesson: "x" }) + "\n";
  const base = {
    headRefName: "feature/12-foo",
    headRefOid: head,
    body: `Resumen\n\n${seal}`,
    files: [{ path: "src/a.ts" }, { path: "harness/experience/PROJ-12.jsonl" }],
    labels: [],
  };

  it("GIVEN sello, lección y sin archivos del harness THEN mergeable", () => {
    expect(evaluateMerge({ pr: base, project, lessonText: lesson })).toMatchObject({ mergeable: true, issue: "PROJ-12" });
  });

  it("GIVEN un PR sin bloque de sello THEN bloqueado", () => {
    const r = evaluateMerge({ pr: { ...base, body: "sin sello" }, project, lessonText: lesson });
    expect(r.mergeable).toBe(false);
    expect(r.errors.join()).toContain("seal:");
  });

  it("GIVEN el sello de otro commit THEN bloqueado (sello != HEAD del PR)", () => {
    const r = evaluateMerge({ pr: { ...base, headRefOid: "b".repeat(40) }, project, lessonText: lesson });
    expect(r.errors.join()).toContain("!= PR head");
  });

  it("GIVEN un PR sin la lección del issue THEN bloqueado (learner obligatorio)", () => {
    const r = evaluateMerge({ pr: { ...base, files: [{ path: "src/a.ts" }] }, project, lessonText: null });
    expect(r.errors.join()).toContain("learn:");
  });

  it("GIVEN un PR de feature que toca harness/ THEN bloqueado por rama, label y PPC", () => {
    const pr = { ...base, files: [...base.files, { path: "harness/systemprompt.md" }, { path: ".gemini/settings.json" }] };
    const r = evaluateMerge({ pr, project, lessonText: lesson });
    expect(r.mergeable).toBe(false);
    expect(r.harness_files).toEqual(["harness/systemprompt.md", ".gemini/settings.json"]);
    const all = r.errors.join("\n");
    expect(all).toContain("non-harness branch");
    expect(all).toContain("harness-authorized");
    expect(all).toContain("ppc:");
  });

  it("GIVEN rama harness + label + registro PPC con probe aprobado THEN mergeable", () => {
    const ppcLesson = JSON.stringify({ task: "PROJ-12", lesson: "x", ppc: { winner_id: "c1", probe_passed: true } }) + "\n";
    const pr = {
      ...base,
      headRefName: "chore/12-harness-fix",
      files: [...base.files, { path: "harness-kit/core/guard/guard-core.mjs" }],
      labels: [{ name: "harness-authorized" }],
    };
    expect(evaluateMerge({ pr, project, lessonText: ppcLesson }).mergeable).toBe(true);
  });

  it("GIVEN un PPC sin probe aprobado (solo decisión explícita) THEN bloqueado", () => {
    const ppcLesson = JSON.stringify({ task: "PROJ-12", lesson: "x", ppc: { winner_id: "c1", probe_passed: false } }) + "\n";
    const pr = { ...base, headRefName: "chore/12-harness-fix", files: [...base.files, { path: "harness/x.md" }], labels: [{ name: "harness-authorized" }] };
    expect(evaluateMerge({ pr, project, lessonText: ppcLesson }).errors.join()).toContain("ppc:");
  });

  it("clasifica rutas e issues", () => {
    expect(isHarnessPath("harness/experience/PROJ-1.jsonl")).toBe(false);
    expect(isHarnessPath("AGENTS.md")).toBe(true);
    expect(isHarnessPath("src/harness/x.ts")).toBe(false);
    expect(issueFromBranch("fix/412-cta", "GOZS")).toBe("GOZS-412");
    expect(issueFromBranch("main", "GOZS")).toBe("");
  });
});

describe("Guard: PowerShell cubierto y fuentes del harness protegidas por rama", () => {
  const unauthorized = repo("feature/9-feat");
  const authorized = repo("chore/9-harness-fix");

  it("GIVEN el tool PowerShell de Claude Code THEN se normaliza como shell", () => {
    const n = normalize({ hook_event_name: "PreToolUse", tool_name: "PowerShell", tool_input: { command: "git status" } });
    expect(n.kind).toBe("shell");
    expect(n.command).toBe("git status");
  });

  it("GIVEN Remove-Item -Recurse -Force THEN shell.rm-rf", () => {
    const r = evaluateRules({ kind: "shell", command: "Remove-Item -Recurse -Force node_modules" }, { repoRoot: unauthorized });
    expect(r.ruleId).toBe("shell.rm-rf");
  });

  it("GIVEN Get-Content .env THEN shell.env-leak", () => {
    expect(evaluateRules({ kind: "shell", command: "Get-Content .env" }, { repoRoot: unauthorized }).ruleId).toBe("shell.env-leak");
  });

  it("GIVEN código que lee process.env / $env: THEN no es acceso a un archivo .env", () => {
    expect(evaluateRules({ kind: "shell", command: "type gh; node -e 'console.log(process.env.PATH)'" }, { repoRoot: unauthorized }).allowed).toBe(true);
    expect(evaluateRules({ kind: "shell", command: "Get-ChildItem $env:TEMP" }, { repoRoot: unauthorized }).allowed).toBe(true);
  });

  it("GIVEN Set-Content sobre .claude/ THEN fs.protected", () => {
    const r = evaluateRules({ kind: "shell", command: "Set-Content .claude/settings.json '{}'" }, { repoRoot: unauthorized });
    expect(r.ruleId).toBe("fs.protected");
  });

  const blocked: Array<Record<string, string>> = [
    { kind: "write", targetPath: "harness/systemprompt.md" },
    { kind: "write", targetPath: "harness-kit/core/guard/rules.json" },
    { kind: "write", targetPath: ".github/workflows/ci.yml" },
    { kind: "shell", command: "Set-Content -Path harness/guardrails.local.md -Value x" },
    { kind: "shell", command: "echo x >> harness/tool_guidance.local.md" },
    { kind: "shell", command: "sed -i 's/a/b/' harness-kit/core/scripts/harness-gate.sh" },
    { kind: "shell", command: "node harness-kit/core/scripts/harness-render.mjs" },
  ];
  for (const call of blocked) {
    it(`GIVEN rama de feature WHEN ${call.command ?? call.targetPath} THEN harness.authorized-only`, () => {
      expect(evaluateRules(call, { repoRoot: unauthorized }).ruleId).toBe("harness.authorized-only");
    });
    it(`GIVEN rama chore/<#>-harness-* WHEN ${call.command ?? call.targetPath} THEN permitido`, () => {
      expect(evaluateRules(call, { repoRoot: authorized }).allowed).toBe(true);
    });
  }

  it("GIVEN la ruta absoluta del repo WHEN se escribe en harness/ desde shell THEN harness.authorized-only", () => {
    const abs = path.join(unauthorized, "harness", "guardrails.local.md").replace(/\\/g, "/");
    expect(evaluateRules({ kind: "shell", command: `echo x >> "${abs}"` }, { repoRoot: unauthorized }).ruleId).toBe("harness.authorized-only");
  });

  it("GIVEN cp con destino en harness/ THEN harness.authorized-only", () => {
    expect(evaluateRules({ kind: "shell", command: "cp /tmp/x.md harness/guardrails.local.md" }, { repoRoot: unauthorized }).ruleId).toBe("harness.authorized-only");
  });

  it("GIVEN git push seguido de gh api -F THEN no es force push (flags por segmento)", () => {
    const cmd = 'git push -q origin chore/9-harness-fix; gh api -X PATCH repos/o/r/pulls/1 -F "body=@b.md"';
    expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: authorized }).allowed).toBe(true);
  });

  for (const cmd of ["git push -f origin x", "git push -uf origin x", "git push --force-with-lease", "git push origin +main", "echo ok && git push -f"]) {
    it(`GIVEN "${cmd}" THEN git.force-push`, () => {
      expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: authorized }).ruleId).toBe("git.force-push");
    });
  }

  it("GIVEN rm de un archivo con guiones en el nombre THEN no es rm -rf", () => {
    const cmd = "npx vitest run a/zz-upstream-check.spec.ts; rm a/harness-flow-enforcement.spec.ts";
    expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: authorized }).allowed).toBe(true);
  });

  for (const cmd of ["rm -rf dist", "rm -r -f dist", "rm -fr dist", "rm --recursive --force dist", "ls && rm -Rf dist"]) {
    it(`GIVEN "${cmd}" THEN shell.rm-rf`, () => {
      expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: authorized }).ruleId).toBe("shell.rm-rf");
    });
  }

  it("GIVEN gh pr create/merge --repo de OTRO repositorio THEN no aplica el sello de este repo", () => {
    const dir = repo("chore/7-harness-x");
    execFileSync("git", ["remote", "add", "origin", "https://github.com/acme/app.git"], { cwd: dir });
    const other = "gh pr create --repo acme/kit --base main --head b --title t --body-file none.md";
    expect(evaluateRules({ kind: "shell", command: other }, { repoRoot: dir }).allowed).toBe(true);
    expect(evaluateRules({ kind: "shell", command: "gh pr merge 3 --repo acme/kit --squash" }, { repoRoot: dir }).allowed).toBe(true);
    const same = "gh pr create --repo acme/app --base main --head b --title t --body-file none.md";
    expect(evaluateRules({ kind: "shell", command: same }, { repoRoot: dir }).ruleId).toBe("pr.requires-seal");
    const spoof = "gh pr merge 3 -R acme/kit --repo acme/app --squash";
    expect(evaluateRules({ kind: "shell", command: spoof }, { repoRoot: dir }).ruleId).toBe("pr.merge-check");
  });

  it("GIVEN publicar a mano el status harness/merge-check THEN pr.merge-check", () => {
    const cmd = "gh api -X POST repos/o/r/statuses/abc -f state=success -f context=harness/merge-check";
    expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: unauthorized }).ruleId).toBe("pr.merge-check");
  });

  const open: Array<Record<string, string>> = [
    // QA GOZS-429: copiar DESDE harness/ es una lectura; rutas harness/ fuera del repo no son el harness.
    { kind: "shell", command: "cp harness/guardrails.local.md /tmp/copy.md" },
    { kind: "shell", command: "mkdir -p /tmp/qa/harness && printf x > /tmp/qa/harness/guardrails.local.md" },
    { kind: "shell", command: "node harness-kit/core/scripts/harness-render.mjs --check /tmp/qa/harness" },
    { kind: "write", targetPath: "harness/experience/PROJ-9.jsonl" },
    { kind: "shell", command: "bash harness-kit/core/scripts/harness-learn.sh --lesson x" },
    { kind: "shell", command: "node harness-kit/core/scripts/harness-render.mjs --check" },
    { kind: "shell", command: "npx vitest run harness-kit/tests" },
    { kind: "shell", command: "cat harness/guardrails.local.md > /tmp/copy.md" },
  ];
  for (const call of open) {
    it(`GIVEN rama de feature WHEN ${call.command ?? call.targetPath} THEN permitido (lecturas, --check y lecciones)`, () => {
      expect(evaluateRules(call, { repoRoot: unauthorized }).allowed).toBe(true);
    });
  }
});

describe("Render: gate de encoding del overlay", () => {
  function overlay(): string {
    const ws = temp("harness-enc-");
    const o = path.join(ws, "harness");
    mkdirSync(o);
    writeFileSync(path.join(o, "harness.json"), JSON.stringify({ kit: "harness-kit", version: "2.0.0", out: ".harness" }));
    writeFileSync(path.join(o, "project.json"), JSON.stringify({ name: "enc", runtimes: [], gate: "npm test" }));
    writeFileSync(path.join(o, "systemprompt.md"), "# Enc\n\nok\n");
    return o;
  }
  const render = (o: string) => run(process.execPath, [renderScript, o], path.dirname(o));

  it("GIVEN un overlay limpio THEN render OK", () => {
    expect(render(overlay()).code).toBe(0);
  });

  const defects: Array<[string, Buffer, string]> = [
    ["BOM", Buffer.from("\ufeff# Enc\n", "utf8"), "BOM"],
    ["BEL de PowerShell `a", Buffer.from("- Zero demo (\u0007ssertNoDemo)\n", "utf8"), "U+0007"],
    ["BS de PowerShell `b", Buffer.from("- set \u0008locked\n", "utf8"), "U+0008"],
    ["ISO-8859", Buffer.from("- expl\u00edcitos\n", "latin1"), "invalid UTF-8"],
    ["U+FFFD", Buffer.from("- expl\ufffdcitos\n", "utf8"), "U+fffd"],
  ];
  for (const [name, bytes, msg] of defects) {
    it(`GIVEN guardrails.local.md con ${name} THEN render falla indicando el defecto`, () => {
      const o = overlay();
      writeFileSync(path.join(o, "guardrails.local.md"), bytes);
      const r = render(o);
      expect(r.code).toBe(1);
      expect(r.out).toContain("guardrails.local.md");
      expect(r.out).toContain(msg);
    });
  }

  it("GIVEN systemprompt.md con BOM THEN el nombre del proyecto no se vuelve '#' (regresión PR #410)", () => {
    const o = overlay();
    writeFileSync(path.join(o, "project.json"), JSON.stringify({ name: "enc", runtimes: ["gemini-cli"], gate: "npm test" }));
    writeFileSync(path.join(o, "systemprompt.md"), "# EncName — Guidelines\n\n## Section\n");
    expect(render(o).code).toBe(0);
    const settings = readFileSync(path.join(path.dirname(o), ".gemini", "settings.json"), "utf8");
    expect(settings).toContain("EncName security");
    expect(settings).not.toContain('"# ');
  });

  it("GIVEN harness/experience/<ISSUE>.jsonl con task distinto al archivo THEN render falla", () => {
    const o = overlay();
    mkdirSync(path.join(o, "experience"));
    writeFileSync(path.join(o, "experience", "PROJ-1.jsonl"), JSON.stringify({ task: "PROJ-2", lesson: "x" }) + "\n");
    expect(render(o).code).toBe(1);
  });
});

describe("Claude Code user dispatcher: el guard aplica aunque la sesión arranque fuera del repo (workdir Multica)", () => {
  const kitDir = path.resolve(here, "..");
  const dispatch = path.join(kitDir, "core", "plugins", "claude-code", "dispatch.mjs");
  // Layout Multica: <workdir>/<repo>/ con el kit en <repo>/harness-kit (junction: sin privilegios en Windows).
  // Independiente del layout: sirve igual en el repo del kit y en un consumidor.
  const workdir = temp("harness-workdir-");
  const consumer = path.join(workdir, "repo");
  mkdirSync(path.join(consumer, "harness"), { recursive: true });
  writeFileSync(path.join(consumer, "harness", "project.json"), JSON.stringify({ name: "c", runtimes: [], gate: "npm test" }));
  execFileSync("git", ["init", "-q"], { cwd: consumer });
  execFileSync(process.execPath, ["-e", `require("fs").symlinkSync(${JSON.stringify(kitDir)}, ${JSON.stringify(path.join(consumer, "harness-kit"))}, "junction")`]);

  function hook(cwd: string, tool_name: string, tool_input: Record<string, unknown>): { code: number; out: string } {
    try {
      const out = execFileSync(process.execPath, [dispatch], {
        input: JSON.stringify({ hook_event_name: "PreToolUse", cwd, tool_name, tool_input }),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
      });
      return { code: 0, out };
    } catch (err) {
      const e = err as { status?: number; stderr?: string };
      return { code: e.status ?? 1, out: e.stderr ?? "" };
    }
  }

  it("GIVEN cwd = workdir y Bash `git branch -D` THEN bloquea (exit 2)", () => {
    const r = hook(workdir, "Bash", { command: "cd repo && git branch -D foo" });
    expect(r.code).toBe(2);
    expect(r.out).toContain("git branch -D is forbidden");
  });

  it("GIVEN cwd = workdir y PowerShell Remove-Item -Recurse -Force THEN bloquea (exit 2)", () => {
    expect(hook(workdir, "PowerShell", { command: "Remove-Item -Recurse -Force repo\src" }).code).toBe(2);
  });

  it("GIVEN cwd = workdir y Read de un .env del repo THEN bloquea", () => {
    expect(hook(workdir, "Read", { file_path: path.join(workdir, "repo", ".env.local") }).code).toBe(2);
  });

  it("GIVEN un comando inocuo THEN permite (exit 0)", () => {
    expect(hook(workdir, "Bash", { command: "git status" }).code).toBe(0);
  });

  it("GIVEN una copia suelta del kit sin .git en el workdir THEN no se toma como repo (exit 0)", () => {
    const stray = temp("harness-stray-");
    execFileSync(process.execPath, ["-e", `require("fs").symlinkSync(${JSON.stringify(kitDir)}, ${JSON.stringify(path.join(stray, "harness-kit"))}, "junction")`]);
    expect(hook(stray, "Bash", { command: "git branch -D foo" }).code).toBe(0);
  });

  it("GIVEN un directorio sin harness THEN no interviene (exit 0)", () => {
    expect(hook(temp("no-harness-"), "Bash", { command: "git branch -D foo" }).code).toBe(0);
  });
});

describe("fs.protected en shell: redirección hacia la ruta, no menciones en texto", () => {
  const dir = repo("feature/3-z");
  it("GIVEN echo x > .claude/settings.json THEN fs.protected", () => {
    expect(evaluateRules({ kind: "shell", command: "echo x > .claude/settings.json" }, { repoRoot: dir }).ruleId).toBe("fs.protected");
  });
  it("GIVEN Set-Content sobre .gemini/ THEN fs.protected", () => {
    expect(evaluateRules({ kind: "shell", command: "Set-Content .gemini/settings.json x" }, { repoRoot: dir }).ruleId).toBe("fs.protected");
  });
  it("GIVEN un mensaje de commit que menciona .claude/ y contiene <slug> THEN permitido", () => {
    const cmd = 'git commit -m "docs: la config .claude/ se carga solo en <repo>"';
    expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: dir }).allowed).toBe(true);
  });
});
