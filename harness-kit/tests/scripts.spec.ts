import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// H-04 — Scripts deterministas de inicialización y verificación C7:
// harness-init.sh, harness-gate.sh y sello .harness/complete.json.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const initScript = path.resolve(here, "..", "core", "scripts", "harness-init.sh").replace(/\\/g, "/");
const gateScript = path.resolve(here, "..", "core", "scripts", "harness-gate.sh").replace(/\\/g, "/");
const learnScript = path.resolve(here, "..", "core", "scripts", "harness-learn.sh").replace(/\\/g, "/");

const gitBashWin = "C:\\Program Files\\Git\\bin\\bash.exe";
const bashBin = process.platform === "win32" && existsSync(gitBashWin) ? gitBashWin : "bash";
const bashEnv =
  process.platform === "win32" && existsSync(gitBashWin)
    ? {
        ...process.env,
        PATH: `C:\\Program Files\\Git\\bin;C:\\Program Files\\Git\\usr\\bin;${process.env.PATH ?? ""}`,
      }
    : process.env;

function runBash(
  scriptPath: string,
  args: string[] = [],
  cwd: string = repoRoot,
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(bashBin, [scriptPath, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: bashEnv,
    });
    return { code: 0, stdout: stdout.trim(), stderr: "" };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      code: typeof e.status === "number" ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString().trim() : "",
      stderr: e.stderr ? e.stderr.toString().trim() : "",
    };
  }
}

let tempRepos: string[] = [];

function createTempGitRepo(): { dir: string; migrationsDir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "harness-gate-test-"));
  tempRepos.push(dir);

  const git = (cmd: string[]) =>
    execFileSync("git", cmd, { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });

  git(["init"]);
  git(["config", "user.name", "Tester"]);
  git(["config", "user.email", "tester@users.noreply.github.com"]);

  // Configurar .gitignore para ignorar .harness/
  writeFileSync(path.join(dir, ".gitignore"), ".harness/\nnode_modules/\n");

  // Configurar supabase/migrations inicial
  const migrationsDir = path.join(dir, "supabase", "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  writeFileSync(path.join(migrationsDir, "20260101000000_initial.sql"), "-- initial migration\n");

  // Configurar harness/ con project.json
  const overlayDir = path.join(dir, "harness");
  mkdirSync(overlayDir, { recursive: true });
  writeFileSync(
    path.join(overlayDir, "project.json"),
    JSON.stringify(
      {
        name: "testproject",
        runtimes: ["antigravity", "claude-code", "gemini-cli", "opencode"],
        gate: "node -e 'process.exit(0)'",
      },
      null,
      2,
    ),
  );

  git(["add", "."]);
  git(["commit", "-m", "initial commit"]);
  git(["branch", "-M", "main"]);

  // Simular origin/main como ref remota
  git(["update-ref", "refs/remotes/origin/main", "HEAD"]);

  // Rama de feature
  git(["checkout", "-b", "feature/test-gate"]);

  return { dir, migrationsDir };
}

afterEach(() => {
  for (const dir of tempRepos) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  tempRepos = [];
});

describe("H-04: harness-init.sh", () => {
  it("ejecuta en una llamada y produce salida compacta <= 10 líneas", () => {
    const res = runBash(initScript, [], repoRoot);
    expect(res.code).toBe(0);
    const lines = res.stdout.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(res.stdout).toContain("git identity:");
    expect(res.stdout).toContain("dependencies:");
    expect(res.stdout).toContain("harness drift:");
  });

  it("escribe .harness/scope.json cuando se provee --scope", () => {
    const { dir } = createTempGitRepo();
    const res = runBash(initScript, ["--scope", "auth,backend"], dir);
    expect(res.code).toBe(0);

    const scopeFile = path.join(dir, ".harness", "scope.json");
    expect(existsSync(scopeFile)).toBe(true);

    const parsed = JSON.parse(readFileSync(scopeFile, "utf8")) as { scope: string[] };
    expect(parsed.scope).toEqual(["auth", "backend"]);
  });
});

describe("H-04: harness-gate.sh — Append-Only en migraciones", () => {
  it("GIVEN una migración modificada WHEN se corre el gate THEN exit 1 listándola", () => {
    const { dir, migrationsDir } = createTempGitRepo();
    const initialMigration = path.join(migrationsDir, "20260101000000_initial.sql");

    // Modificar migración existente
    writeFileSync(initialMigration, "-- modified migration!\n");

    const res = runBash(gateScript, [], dir);
    expect(res.code).toBe(1);
    const output = res.stderr || res.stdout;
    expect(output).toContain("Migrations are strictly append-only");
    expect(output).toContain("20260101000000_initial.sql");
  });

  it("GIVEN una migración borrada WHEN se corre el gate THEN exit 1 listándola", () => {
    const { dir, migrationsDir } = createTempGitRepo();
    const initialMigration = path.join(migrationsDir, "20260101000000_initial.sql");

    rmSync(initialMigration);

    const res = runBash(gateScript, [], dir);
    expect(res.code).toBe(1);
    const output = res.stderr || res.stdout;
    expect(output).toContain("Migrations are strictly append-only");
    expect(output).toContain("20260101000000_initial.sql");
  });

  it("GIVEN una nueva migración añadida (append-only) WHEN se corre el gate THEN pasa exit 0", () => {
    const { dir, migrationsDir } = createTempGitRepo();
    const newMigration = path.join(migrationsDir, "20260102000000_new_table.sql");

    writeFileSync(newMigration, "-- new migration added\n");

    const res = runBash(gateScript, [], dir);
    expect(res.code).toBe(0);
  });
});

describe("H-04: harness-gate.sh — Sello .harness/complete.json e invalidación", () => {
  it("GIVEN el gate verde THEN existe .harness/complete.json con fingerprint válido de 16 caracteres", () => {
    const { dir } = createTempGitRepo();
    const res = runBash(gateScript, [], dir);
    expect(res.code).toBe(0);

    const completePath = path.join(dir, ".harness", "complete.json");
    expect(existsSync(completePath)).toBe(true);

    const seal = JSON.parse(readFileSync(completePath, "utf8")) as {
      kit_version: string;
      head: string;
      worktree_clean: boolean;
      fingerprint: string;
      gate: string;
      passed_at: string;
    };

    expect(seal.kit_version).toBe("2.0.0");
    expect(seal.head).toMatch(/^[a-f0-9]{40}$/);
    expect(typeof seal.worktree_clean).toBe("boolean");
    expect(seal.fingerprint).toMatch(/^[a-f0-9]{16}$/);
    expect(seal.fingerprint.length).toBe(16);
    expect(seal.gate).toBe("node -e 'process.exit(0)'");
    expect(Date.parse(seal.passed_at)).not.toBeNaN();
  });

  it("GIVEN el gate verde THEN verify reporta seal_valid = true", () => {
    const { dir } = createTempGitRepo();
    runBash(gateScript, [], dir);

    const verifyRes = runBash(gateScript, ["--verify"], dir);
    expect(verifyRes.code).toBe(0);

    const result = JSON.parse(verifyRes.stdout) as { seal_valid: boolean; fingerprint: string };
    expect(result.seal_valid).toBe(true);
  });

  it("GIVEN un cambio en un archivo después del gate WHEN se evalúa el sello THEN seal_valid da falso", () => {
    const { dir } = createTempGitRepo();
    runBash(gateScript, [], dir);

    // Modificar un archivo en el repo tras el gate
    writeFileSync(path.join(dir, "README.md"), "# Tampered content\n");

    const verifyRes = runBash(gateScript, ["--verify"], dir);
    expect(verifyRes.code).toBe(1);

    const result = JSON.parse(verifyRes.stdout) as { seal_valid: boolean; current: string; fingerprint: string };
    expect(result.seal_valid).toBe(false);
    expect(result.current).not.toBe(result.fingerprint);
  });

  it("falla el gate si el comando configurado en project.json falla", () => {
    const { dir } = createTempGitRepo();
    writeFileSync(
      path.join(dir, "harness", "project.json"),
      JSON.stringify({ name: "failproject", runtimes: [], gate: "node -e 'process.exit(2)'" }),
    );

    const res = runBash(gateScript, [], dir);
    expect(res.code).toBe(2);
  });

  it("H-13: harness-learn.sh registra lecciones en harness/experience/<ISSUE>.jsonl", () => {
    const { dir } = createTempGitRepo();
    const expLib = path.join(dir, "harness", "experience", "GOZS-999.jsonl");

    const res = runBash(
      learnScript,
      ["--issue", "GOZS-999", "--lesson", "Prueba de aprendizaje autonomo", "--tags", "db,test"],
      dir,
    );
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("[harness-learn OK]");

    expect(existsSync(expLib)).toBe(true);
    const content = readFileSync(expLib, "utf8");
    expect(content).toContain("GOZS-999");
    expect(content).toContain("Prueba de aprendizaje autonomo");
    expect(content).toContain('"tags":["db","test"]');
  });
});
