import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error - mjs module
import { checkGuard, evaluateRules, findRepoRoot, loadRules } from "../core/guard/guard-core.mjs";
// @ts-expect-error - mjs module
import { normalize } from "../core/guard/normalize.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const fixturesDir = path.join(here, "fixtures");

describe("H-05: normalize.mjs multi-runtime normalization", () => {
  it("normalizes Claude Code Bash and Read payloads", () => {
    const bash = normalize({ tool_name: "Bash", tool_input: { command: "git status" } });
    expect(bash.runtime).toBe("claude-code");
    expect(bash.kind).toBe("shell");
    expect(bash.command).toBe("git status");

    const read = normalize({
      tool_name: "Read",
      tool_input: { file_path: "src/index.ts", limit: 50 },
    });
    expect(read.kind).toBe("read");
    expect(read.filePath).toBe("src/index.ts");
    expect(read.limit).toBe(50);
    expect(read.isBounded).toBe(true);
  });

  it("normalizes OpenCode in-process plugin payloads", () => {
    const bash = normalize({
      input: { tool: "bash" },
      output: { args: { command: "npm test" } },
    });
    expect(bash.runtime).toBe("opencode");
    expect(bash.kind).toBe("shell");
    expect(bash.command).toBe("npm test");

    const write = normalize({
      input: { tool: "edit" },
      output: { args: { filePath: "src/utils.ts", oldString: "a", newString: "b" } },
    });
    expect(write.runtime).toBe("opencode");
    expect(write.kind).toBe("write");
    expect(write.targetPath).toBe("src/utils.ts");
    expect(write.isEdit).toBe(true);
  });

  it("normalizes Antigravity toolCall payloads", () => {
    const run = normalize({
      toolCall: { name: "run_command", args: { CommandLine: "echo hello" } },
    });
    expect(run.runtime).toBe("antigravity");
    expect(run.kind).toBe("shell");
    expect(run.command).toBe("echo hello");

    const view = normalize({
      toolCall: {
        name: "view_file",
        args: { AbsolutePath: "/path/to/file.ts", StartLine: 1, EndLine: 100 },
      },
    });
    expect(view.runtime).toBe("antigravity");
    expect(view.kind).toBe("read");
    expect(view.filePath).toBe("/path/to/file.ts");
    expect(view.limit).toBe(100);
    expect(view.isBounded).toBe(true);

    const write = normalize({
      toolCall: {
        name: "write_to_file",
        args: { TargetFile: "new.ts", CodeContent: "export const x = 1;" },
      },
    });
    expect(write.runtime).toBe("antigravity");
    expect(write.kind).toBe("write");
    expect(write.targetPath).toBe("new.ts");
  });
});

describe("H-05: Gemini CLI bounded reads with fixtures", () => {
  it("normalizes gemini-cli fixtures directly from disk", () => {
    const preShell = JSON.parse(
      readFileSync(path.join(fixturesDir, "gemini-cli", "pre-shell.json"), "utf8")
    );
    const normShell = normalize(preShell);
    expect(normShell.runtime).toBe("gemini-cli");
    expect(normShell.kind).toBe("shell");
    expect(normShell.command).toBe("echo h00");

    const preRead = JSON.parse(
      readFileSync(path.join(fixturesDir, "gemini-cli", "pre-read.json"), "utf8")
    );
    const normRead = normalize(preRead);
    expect(normRead.runtime).toBe("gemini-cli");
    expect(normRead.kind).toBe("read");
    expect(normRead.filePath).toBe("sample.txt");

    const preWrite = JSON.parse(
      readFileSync(path.join(fixturesDir, "gemini-cli", "pre-write.json"), "utf8")
    );
    const normWrite = normalize(preWrite);
    expect(normWrite.runtime).toBe("gemini-cli");
    expect(normWrite.kind).toBe("write");
    expect(normWrite.targetPath).toBe("out.txt");
  });

  it("treats read_file with start_line and end_line as bounded", () => {
    const bounded = normalize({
      tool_name: "read_file",
      tool_input: { file_path: "src/big.ts", start_line: 10, end_line: 150 },
    });
    expect(bounded.isBounded).toBe(true);
    expect(bounded.limit).toBe(141);

    const unbounded = normalize({
      tool_name: "read_file",
      tool_input: { file_path: "src/big.ts", start_line: 1, end_line: 500 },
    });
    expect(unbounded.isBounded).toBe(false);
    expect(unbounded.limit).toBe(500);
  });

  it("extracts paths from read_many_files with include", () => {
    const norm = normalize({
      tool_name: "read_many_files",
      tool_input: { include: ["src/a.ts", "package-lock.json"] },
    });
    expect(norm.kind).toBe("read_many");
    expect(norm.paths).toEqual(["src/a.ts", "package-lock.json"]);

    const evaluated = evaluateRules(norm, { repoRoot });
    expect(evaluated.allowed).toBe(false);
    expect(evaluated.ruleId).toBe("fs.bloatware");
  });
});

describe("H-05: Acceptance Criteria — Edit on supabase/migrations/ and AGENTS.md", () => {
  let tmp: string;
  let existingMigration: string;
  let newMigration: string;

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "gozs-h05-"));
    const migDir = path.join(tmp, "supabase", "migrations");
    mkdirSync(migDir, { recursive: true });
    existingMigration = path.join(migDir, "20261019_existing.sql");
    writeFileSync(existingMigration, "-- existing migration\n");
    newMigration = path.join(migDir, "20261020_brand_new.sql");
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("GIVEN Edit sobre supabase/migrations/<existente>.sql THEN se bloquea (db.append-only)", () => {
    const editPayload = {
      tool_name: "Edit",
      tool_input: {
        file_path: existingMigration,
        old_string: "-- existing",
        new_string: "-- modified",
      },
    };
    const res = checkGuard(editPayload, { repoRoot: tmp });
    expect(res.allowed).toBe(false);
    expect(res.ruleId).toBe("db.append-only");
    expect(res.reason).toContain("Modifying existing migrations in supabase/migrations/ is forbidden");
  });

  it("GIVEN Write/Edit sobre un archivo nuevo en supabase/migrations/ THEN se permite", () => {
    const writeNewPayload = {
      tool_name: "Write",
      tool_input: {
        file_path: newMigration,
        content: "-- brand new migration",
      },
    };
    const res = checkGuard(writeNewPayload, { repoRoot: tmp });
    expect(res.allowed).toBe(true);
  });

  it("GIVEN Edit sobre AGENTS.md THEN se bloquea con mensaje indicando editar harness/ y correr render", () => {
    const editAgents = {
      tool_name: "Edit",
      tool_input: {
        file_path: path.join(tmp, "AGENTS.md"),
        old_string: "old",
        new_string: "new",
      },
    };
    const res = checkGuard(editAgents, { repoRoot: tmp });
    expect(res.allowed).toBe(false);
    expect(res.ruleId).toBe("harness.agents-render");
    expect(res.reason).toContain("Editing AGENTS.md directly is forbidden. Edit files under harness/ and run harness-render.mjs to generate AGENTS.md.");
  });
});

describe("H-05: Rules equivalence and coverage", () => {
  it("loads rules from core, adapters, and local overlay", () => {
    const rules = loadRules({ repoRoot });
    expect(rules.length).toBeGreaterThanOrEqual(15);

    const ids = new Set(rules.map((r: { id: string }) => r.id));
    expect(ids).toContain("fs.bloatware");
    expect(ids).toContain("fs.env-leak");
    expect(ids).toContain("read.oversize");
    expect(ids).toContain("shell.cat-lockfile");
    expect(ids).toContain("shell.env-leak");
    expect(ids).toContain("git.force-push");
    expect(ids).toContain("git.reset-hard");
    expect(ids).toContain("git.clean-force");
    expect(ids).toContain("git.checkout-all");
    expect(ids).toContain("git.restore-all");
    expect(ids).toContain("git.branch-force-delete");
    expect(ids).toContain("shell.rm-rf");
    expect(ids).toContain("shell.pipe-to-shell");
    expect(ids).toContain("fs.protected");
    expect(ids).toContain("multica.comment-bounded");
    expect(ids).toContain("multica.issue-bounded");
    expect(ids).toContain("multica.search-bounded");
    expect(ids).toContain("multica.daemon-protect");
    expect(ids).toContain("db.append-only");
    expect(ids).toContain("harness.agents-render");
  });
});

describe("H-05: Performance SLA (p95 < 150 ms)", () => {
  it("evaluates in-process with p95 < 150 ms over 50 iterations", () => {
    const samplePayload = {
      tool_name: "Bash",
      tool_input: { command: "git status" },
    };

    const durations: number[] = [];
    for (let i = 0; i < 50; i++) {
      const start = performance.now();
      checkGuard(samplePayload, { repoRoot });
      durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    const p95Index = Math.floor(durations.length * 0.95);
    const p95 = durations[p95Index];

    expect(p95).toBeLessThan(150);
  });
});

// GOZS-85 — post.outside-scope (warn, nunca bloquea) y reglas Supabase en su adapter (D4).
describe("GOZS-85: post.outside-scope y adapter supabase", () => {
  const scoped = mkdtempSync(path.join(tmpdir(), "guard-scope-"));
  const unscoped = mkdtempSync(path.join(tmpdir(), "guard-noscope-"));
  mkdirSync(path.join(scoped, ".harness"));
  writeFileSync(path.join(scoped, ".harness", "scope.json"), JSON.stringify({ scope: ["src/lib", "docs/"] }));
  afterAll(() => {
    rmSync(scoped, { recursive: true, force: true });
    rmSync(unscoped, { recursive: true, force: true });
  });
  const post = (targetPath: string, root: string) =>
    evaluateRules({ phase: "post", kind: "write", targetPath }, { repoRoot: root });

  it("GIVEN scope.json WHEN se escribe fuera THEN avisa sin bloquear", () => {
    const res = post("src/app/page.tsx", scoped);
    expect(res.allowed).toBe(true);
    expect(res.ruleId).toBe("post.outside-scope");
    expect(res.context).toContain("src/app/page.tsx is outside the declared scope");
  });

  it("GIVEN scope.json WHEN se escribe dentro (prefijo de carpeta) THEN no avisa", () => {
    expect(post("src/lib/utils.ts", scoped).inject).toBe(false);
    expect(post(path.join(scoped, "docs", "a.md"), scoped).inject).toBe(false);
    expect(post("src/library.ts", scoped).ruleId).toBe("post.outside-scope");
  });

  it("GIVEN sin scope.json THEN la regla no aplica", () => {
    expect(post("src/app/page.tsx", unscoped).inject).toBe(false);
  });

  it("GIVEN adapters/supabase/rules.json THEN define db.* y rules.local.json ya no", () => {
    const ids = (file: string) =>
      (JSON.parse(readFileSync(path.join(repoRoot, file), "utf8")) as Array<{ id: string }>).map((r) => r.id);
    expect(ids("harness-kit/adapters/supabase/rules.json")).toEqual(["db.append-only", "db.migration-test-reminder"]);
    expect(ids("harness/rules.local.json")).not.toContain("db.append-only");
    expect(ids("harness/rules.local.json")).not.toContain("db.migration-test-reminder");
  });
});

describe("GOZS-514: sin falsos positivos en lecturas del harness, GH007 y heredocs", () => {
  const feature = mkdtempSync(path.join(tmpdir(), "guard-514-"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: feature, stdio: "pipe" });
  beforeAll(() => {
    git("init");
    git("checkout", "-b", "feature/9-feat");
    git("-c", "user.name=T", "-c", "user.email=t@users.noreply.github.com", "commit", "--allow-empty", "-m", "x");
  });
  afterAll(() => rmSync(feature, { recursive: true, force: true }));
  const shell = (command: string) => evaluateRules({ kind: "shell", command }, { repoRoot: feature });
  const post = (command: string, output: string) =>
    evaluateRules({ phase: "post", kind: "shell", command, output }, { repoRoot: feature });
  const scripts = "harness-kit/core/scripts";

  for (const command of [
    `grep -n x ${scripts}/harness-compose.mjs`,
    `sed -n 1,20p ${scripts}/harness-render.mjs`,
    `ls ${scripts}/bootstrap.mjs`,
    `node ${scripts}/harness-compose.mjs --task GOZS-1 --no-promote`,
  ]) {
    it(`GIVEN rama no-harness WHEN ${command} THEN permite`, () => {
      expect(shell(command).allowed).toBe(true);
    });
  }

  for (const command of [
    `node ${scripts}/harness-render.mjs`,
    `./${scripts}/harness-render.mjs`,
    `npx node ${scripts}/harness-render.mjs`,
    `bash -c "node ${scripts}/harness-render.mjs"`,
    `echo x | xargs node ${scripts}/harness-render.mjs`,
    `node ${scripts}/harness-compose.mjs --task X`,
  ]) {
    it(`GIVEN rama no-harness WHEN ${command} THEN harness.authorized-only`, () => {
      expect(shell(command).ruleId).toBe("harness.authorized-only");
    });
  }

  it("GIVEN cat de rules.json cuya salida contiene gh007 WHEN post-hook THEN no inyecta", () => {
    expect(post("cat harness-kit/core/guard/rules.json", '{ "id": "git.gh007-noreply" }').inject).toBeFalsy();
  });

  it("GIVEN un comando que solo menciona GH007 WHEN post-hook THEN no inyecta", () => {
    expect(post("grep -n GH007 harness-kit/core/guard/guard-core.mjs", "").inject).toBeFalsy();
  });

  it("GIVEN git push cuya salida contiene GH007 WHEN post-hook THEN inyecta el email noreply", () => {
    const res = post(
      "git add . && git -C repo push origin feature/9-feat",
      "remote: error: GH007: Your push would publish a private email address.\nremote: use 1+u@users.noreply.github.com"
    );
    expect(res.ruleId).toBe("git.gh007-noreply");
    expect(res.inject).toBe(true);
    expect(res.context).toContain("1+u@users.noreply.github.com");
  });

  it("GIVEN GH007 sin email y bot_noreply_email en project.json WHEN post-hook THEN inyecta el email configurado", () => {
    const customRepo = mkdtempSync(path.join(tmpdir(), "guard-proj-"));
    try {
      const harnessDir = path.join(customRepo, "harness");
      mkdirSync(harnessDir, { recursive: true });
      writeFileSync(
        path.join(harnessDir, "project.json"),
        JSON.stringify({ name: "demo", bot_noreply_email: "custom-bot@users.noreply.github.com" })
      );
      const res = evaluateRules(
        {
          phase: "post",
          kind: "shell",
          command: "git push origin main",
          output: "remote: error: GH007: Your push would publish a private email address.",
        },
        { repoRoot: customRepo }
      );
      expect(res.ruleId).toBe("git.gh007-noreply");
      expect(res.inject).toBe(true);
      expect(res.context).toContain("custom-bot@users.noreply.github.com");
    } finally {
      rmSync(customRepo, { recursive: true, force: true });
    }
  });

  it("GIVEN GH007 sin email y sin configuración WHEN post-hook THEN no contiene Fresias y explica cómo configurar bot_noreply_email", () => {
    const emptyRepo = mkdtempSync(path.join(tmpdir(), "guard-empty-"));
    try {
      const res = evaluateRules(
        {
          phase: "post",
          kind: "shell",
          command: "git push origin main",
          output: "remote: error: GH007: Your push would publish a private email address.",
        },
        { repoRoot: emptyRepo }
      );
      expect(res.ruleId).toBe("git.gh007-noreply");
      expect(res.inject).toBe(true);
      expect(res.context).not.toContain("6156087+Fresias");
      expect(res.context).toContain("bot_noreply_email");
      expect(res.context).toContain("harness/project.json");
    } finally {
      rmSync(emptyRepo, { recursive: true, force: true });
    }
  });

  it("GIVEN heredoc que escribe un .md mencionando archivos de entorno WHEN guard THEN permite", () => {
    const command = "cat > notes.md <<'EOF'\nNunca leer .env ni .env.local; cat .env está bloqueado.\nEOF";
    expect(shell(command).allowed).toBe(true);
  });

  it("GIVEN cat sobre un archivo de entorno real WHEN guard THEN bloquea", () => {
    expect(shell("cat .env.local").ruleId).toBe("shell.env-leak");
    expect(shell("cat > out.md <<'EOF'\nx\nEOF\ncat .env").ruleId).toBe("shell.env-leak");
  });
});

describe("GOZS-524: protección de .git, bloqueo de repo-rewire y lectura del guard instalado", () => {
  const repoDir = mkdtempSync(path.join(tmpdir(), "guard-524-"));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: repoDir, stdio: "pipe" });

  beforeAll(() => {
    git("init");
    git("checkout", "-b", "chore/524-harness-guard-git-protection");
    git("-c", "user.name=T", "-c", "user.email=t@users.noreply.github.com", "commit", "--allow-empty", "-m", "init");
  });

  afterAll(() => rmSync(repoDir, { recursive: true, force: true }));

  const shell = (command: string) => evaluateRules({ kind: "shell", command }, { repoRoot: repoDir });
  const write = (targetPath: string) => evaluateRules({ kind: "write", targetPath }, { repoRoot: repoDir });
  const read = (filePath: string, isBounded = true) => evaluateRules({ kind: "read", filePath, isBounded }, { repoRoot: repoDir });

  it("GIVEN una herramienta de escritura con destino C:/x/workdir/.git (archivo) WHEN corre el guard THEN bloquea con fs.protected", () => {
    const res = write("C:/x/workdir/.git");
    expect(res.allowed).toBe(false);
    expect(res.ruleId).toBe("fs.protected");
  });

  it("GIVEN Set-Content -Path ..\\otra\\.git -Value 'gitdir: X' WHEN corre el guard THEN bloquea con fs.protected", () => {
    const res = shell('Set-Content -Path ..\\otra\\.git -Value "gitdir: X"');
    expect(res.allowed).toBe(false);
    expect(res.ruleId).toBe("fs.protected");
  });

  it("GIVEN echo x > .git/config WHEN corre el guard THEN bloquea con fs.protected", () => {
    const res = shell("echo x > .git/config");
    expect(res.allowed).toBe(false);
    expect(res.ruleId).toBe("fs.protected");
  });

  it("GIVEN escrituras a .gitignore, .gitattributes, .github/workflows/ci.yml (en rama de harness) WHEN corre el guard THEN fs.protected no las bloquea", () => {
    for (const p of [".gitignore", ".gitattributes", ".github/workflows/ci.yml"]) {
      const res = write(p);
      expect(res.ruleId).not.toBe("fs.protected");
      expect(res.allowed).toBe(true);
    }
  });

  it("GIVEN git commit -m x y git config --worktree user.email a@b WHEN corre el guard THEN permite", () => {
    expect(shell("git commit -m x").allowed).toBe(true);
    expect(shell("git config --worktree user.email a@b").allowed).toBe(true);
  });

  it("GIVEN git worktree add ../x, git branch -m nueva, git -C repo branch -M x, git config core.hooksPath /tmp/h WHEN corre el guard THEN bloquea con git.repo-rewire", () => {
    for (const cmd of [
      "git worktree add ../x",
      "git branch -m nueva",
      "git -C repo branch -M x",
      "git config core.hooksPath /tmp/h",
      "git -c core.hooksPath=/tmp/h commit",
    ]) {
      const res = shell(cmd);
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe("git.repo-rewire");
      expect(res.reason).toContain("Recablear el repo (worktrees, renombrar ramas, hooksPath) está prohibido para agentes");
    }
  });

  it("GIVEN git checkout -b chore/1-harness-x origin/main y git branch -a WHEN corre el guard THEN permite", () => {
    expect(shell("git checkout -b chore/1-harness-x origin/main").allowed).toBe(true);
    expect(shell("git branch -a").allowed).toBe(true);
  });

  it("GIVEN una lectura de C:/Users/user/.claude/hooks/harness-kit/core/guard/guard-core.mjs (o ~/.claude/hooks/...) WHEN corre el guard THEN bloquea con read.guard-installed", () => {
    for (const p of [
      "C:/Users/user/.claude/hooks/harness-kit/core/guard/guard-core.mjs",
      "~/.claude/hooks/guard.sh",
      "C:\\Users\\user\\.gemini\\config\\hooks.json",
      "~/.gemini/config/hooks.json",
    ]) {
      const res = read(p);
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe("read.guard-installed");
      expect(res.reason).toContain("La copia instalada del guard no se lee ni se modifica");
    }
    for (const cmd of [
      "cat ~/.claude/hooks/harness-kit/core/guard/guard-core.mjs",
      "Get-Content ~/.gemini/config/hooks.json",
      "type C:\\Users\\user\\.claude\\hooks\\guard.sh",
      "[IO.File]::ReadAllText('C:/Users/user/.claude/hooks/guard.sh')",
      "node -e \"fs.readFileSync('~/.claude/hooks/guard-core.mjs')\"",
    ]) {
      const res = shell(cmd);
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe("read.guard-installed");
    }
  });

  it("GIVEN una lectura de harness-kit/core/guard/guard-core.mjs del repo, con rango WHEN corre el guard THEN permite", () => {
    const res = read("harness-kit/core/guard/guard-core.mjs", true);
    expect(res.allowed).toBe(true);
  });

  it("GIVEN una lectura de ~/.claude/projects/<p>/memory/x.md WHEN corre el guard THEN permite (la memoria del agente sigue accesible)", () => {
    const res = read("~/.claude/projects/gozster/memory/x.md", true);
    expect(res.allowed).toBe(true);
    expect(shell("cat ~/.claude/projects/gozster/memory/x.md").allowed).toBe(true);
  });
});
