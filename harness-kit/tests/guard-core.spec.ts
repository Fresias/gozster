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
// @ts-expect-error - mjs module
import { buildEvent } from "../core/guard/telemetry.mjs";

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
      "grep -i token ~/.claude/hooks/guard.sh",
      "rg -n export ~/.claude/hooks/",
      "Select-String secret ~/.gemini/config/hooks.json",
      "findstr foo C:\\Users\\user\\.claude\\hooks\\guard.sh",
    ]) {
      const res = shell(cmd);
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe("read.guard-installed");
    }
  });

  it("GIVEN comandos encadenados o pipeados como 'git branch --show-current && git commit -m x' y 'git branch -vv | grep -m 1 main' WHEN corre el guard THEN permite (no falso positivo en git.repo-rewire)", () => {
    expect(shell("git branch --show-current && git commit -m x").allowed).toBe(true);
    expect(shell("git branch -vv | grep -m 1 main").allowed).toBe(true);
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

describe("GOZS-562: bloquear escrituras por shell e intérpretes inline a rutas protegidas", () => {
  const feature = mkdtempSync(path.join(tmpdir(), "guard-562-feature-"));
  const harnessBranch = mkdtempSync(path.join(tmpdir(), "guard-562-harness-"));
  const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, stdio: "pipe" });

  beforeAll(() => {
    const repos: Array<[string, string]> = [
      [feature, "feature/562-non-harness"],
      [harnessBranch, "chore/562-harness-guard-shell-inline"],
    ];
    for (const [dir, branch] of repos) {
      git(dir, "init");
      git(dir, "checkout", "-b", branch);
      git(dir, "-c", "user.name=T", "-c", "user.email=t@users.noreply.github.com", "commit", "--allow-empty", "-m", "init");
    }
  });

  afterAll(() => {
    rmSync(feature, { recursive: true, force: true });
    rmSync(harnessBranch, { recursive: true, force: true });
  });

  const shellFeature = (command: string) => evaluateRules({ kind: "shell", command }, { repoRoot: feature });
  const shellHarness = (command: string) => evaluateRules({ kind: "shell", command }, { repoRoot: harnessBranch });
  const target = "harness-kit/core/scripts/harness-merge-check.mjs";

  const tableCases = [
    `sed -i 's/a/b/' ${target}`,
    `sed -i 's/a && b/c/' ${target}`,
    `sed -i 's/a\\|b/c/' ${target}`,
    `echo x > ${target}`,
    `python3 -c "open('${target}','w').write('x')"`,
    `node -e "require('fs').writeFileSync('${target}','x')"`,
  ];

  for (const command of tableCases) {
    it(`GIVEN rama no-harness WHEN ${command} THEN bloquea con harness.authorized-only`, () => {
      const res = shellFeature(command);
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe("harness.authorized-only");
    });

    it(`GIVEN rama autorizada chore/562-harness-guard-shell-inline WHEN ${command} THEN permite`, () => {
      expect(shellHarness(command).allowed).toBe(true);
    });
  }

  for (const command of [
    `python -c "from pathlib import Path; Path('harness/project.json').write_text('x')"`,
    `node -e "require('fs').appendFileSync('.github/workflows/ci.yml','x')"`,
    `node --eval="require('fs').renameSync('a','harness/b')"`,
    `node -p "require('fs').unlinkSync('${target}')"`,
    `perl -e "open(my $f, '>', 'harness/a.txt'); print $f 'x'"`,
    `ruby -e "File.write('harness/a.txt', 'x')"`,
    `bash -c "sed -i 's/a && b/c/' ${target}"`,
    `sh -c "python3 -c \\"open('${target}','w').write('x')\\""`,
    `sed -i s/a\\|b/c/ ${target}`,
    `cp /tmp/x.mjs "harness-kit/core/scripts/my file.mjs"`,
  ]) {
    it(`GIVEN rama no-harness WHEN variante inline/shell ${command} THEN bloquea con harness.authorized-only`, () => {
      const res = shellFeature(command);
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe("harness.authorized-only");
    });
  }

  for (const command of [
    `rg -n "rm -f" harness-kit/core/guard/guard-core.mjs`,
    `grep -n "Set-Content" harness/project.json`,
    `rg -n "x > harness/" src/`,
    `rg -n "a;node harness-render.mjs" harness/`,
    `sed -n 's/a && b/c/p' ${target}`,
    `python3 -c "print(open('harness/project.json').read())"`,
    `python3 -c "print(open('harness/project.json','r').read())"`,
    `node -e "process.stdout.write(require('fs').readFileSync('harness/project.json','utf8'))"`,
    `ruby -e "puts File.read('harness/project.json')"`,
    `echo x > /tmp/scratch.txt`,
    `cat > /tmp/notes.md <<'EOF'\n> ${target}\nopen('harness/x','w').write('x')\nEOF`,
    `echo x >> harness/experience/GOZS-562.jsonl`,
    `python3 -c "open('harness/experience/GOZS-562.jsonl','a').write('x\\n')"`,
    `node harness-kit/core/scripts/harness-render.mjs --check`,
    `node harness-kit/core/scripts/harness-compose.mjs --task GOZS-562 --no-promote`,
  ]) {
    it(`GIVEN rama no-harness WHEN comando permitido/lectura ${command.split("\n")[0]} THEN permite`, () => {
      expect(shellFeature(command).allowed).toBe(true);
    });
  }
});

describe("GOZS-774: lectura acotada por runtime (read.oversize) y fs.protected limitado al repo", () => {
  const workRepo = mkdtempSync(path.join(tmpdir(), "guard-774-"));
  const bigRel = "src/big-module.ts";
  const bigAbs = path.join(workRepo, bigRel);

  beforeAll(() => {
    mkdirSync(path.dirname(bigAbs), { recursive: true });
    writeFileSync(bigAbs, Array.from({ length: 1840 }, (_, i) => `export const line${i + 1} = ${i + 1};`).join("\n") + "\n");
  });

  afterAll(() => rmSync(workRepo, { recursive: true, force: true }));

  it("GIVEN antigravity.json WHEN se inspecciona read_file THEN declara Path, bound StartLine/EndLine y extra ByteOffset", () => {
    const ag = JSON.parse(
      readFileSync(path.join(repoRoot, "harness-kit", "core", "runtimes", "antigravity.json"), "utf8"),
    ) as { tools: { read: Array<{ name: string; path: string; bound?: string[]; extra?: string[] }> } };
    const readFileTool = ag.tools.read.find((t) => t.name === "read_file");
    expect(readFileTool).toEqual({
      name: "read_file",
      path: "Path",
      bound: ["StartLine", "EndLine"],
      extra: ["ByteOffset"],
    });
  });

  it("GIVEN read_file de Antigravity sin rango sobre un archivo de 1.840 líneas WHEN pre THEN bloquea con ruta relativa, 1840 líneas, StartLine/EndLine y rg -n -C 20", () => {
    const res = checkGuard(
      { toolCall: { name: "read_file", args: { Path: bigAbs } } },
      { repoRoot: workRepo },
    );
    expect(res.allowed).toBe(false);
    expect(res.ruleId).toBe("read.oversize");
    expect(res.reason).toContain(bigRel);
    expect(res.reason).toContain("1840 líneas");
    expect(res.reason).toContain("StartLine");
    expect(res.reason).toContain("EndLine");
    expect(res.reason).toContain("rg -n -C 20");
    expect(res.reason).not.toContain("offset");
  });

  it("GIVEN read_file de Antigravity con StartLine: 1, EndLine: 300 sobre 1.840 líneas WHEN pre THEN permite; con EndLine: 301 bloquea", () => {
    const ok = checkGuard(
      { toolCall: { name: "read_file", args: { Path: bigAbs, StartLine: 1, EndLine: 300 } } },
      { repoRoot: workRepo },
    );
    expect(ok.allowed).toBe(true);

    const okMiddle = checkGuard(
      { toolCall: { name: "read_file", args: { Path: bigAbs, StartLine: 100, EndLine: 399 } } },
      { repoRoot: workRepo },
    );
    expect(okMiddle.allowed).toBe(true);

    const over = checkGuard(
      { toolCall: { name: "read_file", args: { Path: bigAbs, StartLine: 1, EndLine: 301 } } },
      { repoRoot: workRepo },
    );
    expect(over.allowed).toBe(false);
    expect(over.ruleId).toBe("read.oversize");
    expect(over.reason).toContain("StartLine");

    const overMiddle = checkGuard(
      { toolCall: { name: "read_file", args: { Path: bigAbs, StartLine: 100, EndLine: 400 } } },
      { repoRoot: workRepo },
    );
    expect(overMiddle.allowed).toBe(false);
    expect(overMiddle.ruleId).toBe("read.oversize");
  });

  it("GIVEN Read de Claude Code sin limit sobre un archivo grande WHEN pre THEN bloquea con ruta relativa, líneas y offset/limit", () => {
    const res = checkGuard(
      { tool_name: "Read", tool_input: { file_path: bigAbs } },
      { repoRoot: workRepo },
    );
    expect(res.allowed).toBe(false);
    expect(res.ruleId).toBe("read.oversize");
    expect(res.reason).toContain(bigRel);
    expect(res.reason).toContain("1840 líneas");
    expect(res.reason).toContain("offset");
    expect(res.reason).toContain("limit");
    expect(res.reason).toContain("Grep");
  });

  it("GIVEN otros runtimes sin rango sobre un archivo grande WHEN pre THEN devuelve mensaje genérico con ruta, líneas y límite 300/200", () => {
    for (const payload of [
      { tool_name: "read_file", tool_input: { file_path: bigAbs } },
      { input: { tool: "read" }, output: { args: { filePath: bigAbs } } },
    ]) {
      const res = checkGuard(payload, { repoRoot: workRepo });
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe("read.oversize");
      expect(res.reason).toContain(bigRel);
      expect(res.reason).toContain("1840 líneas");
      expect(res.reason).toContain("300");
      expect(res.reason).toContain("200");
    }
  });

  it("GIVEN write_file en ~/.gemini/antigravity-cli/brain/<id>/scratch/x.mjs WHEN pre THEN se permite", () => {
    for (const p of [
      "~/.gemini/antigravity-cli/brain/abc-123/scratch/x.mjs",
      "C:\\Users\\user\\.gemini\\antigravity-cli\\brain\\abc-123\\scratch\\x.mjs",
      "/home/user/.gemini/antigravity-cli/brain/abc-123/scratch/x.mjs",
    ]) {
      const res = checkGuard(
        { toolCall: { name: "write_file", args: { Path: p, Content: "console.log(1);" } } },
        { repoRoot: workRepo },
      );
      expect(res.allowed, p).toBe(true);
    }
  });

  it("GIVEN Get-Content y comandos sobre ~/.gemini/antigravity-cli/brain/** o menciones con escritura a otro destino WHEN pre THEN se permite", () => {
    for (const cmd of [
      '$j = Get-Content "~/.gemini/antigravity-cli/brain/abc-123/.system_generated/steps/48/output.txt"',
      '$j = Get-Content "C:\\Users\\user\\.gemini\\antigravity-cli\\brain\\abc-123\\.system_generated\\steps\\48\\output.txt"; Set-Content ./out.txt $j',
      'echo x > ~/.gemini/antigravity-cli/brain/abc-123/scratch/x.mjs',
      'Set-Content "~/.gemini/antigravity-cli/brain/abc-123/scratch/x.mjs" "console.log(1)"',
      'echo "revisar .gemini/config/hooks.json" > ./notes.md',
      'echo "revisar .gemini/settings.json" && rm ./reply.md',
      'Set-Content -Path ./out.txt -Value "mención .gemini/config/hooks.json"',
      'cp .agents/hooks.json ./backup.json',
    ]) {
      const res = evaluateRules({ kind: "shell", command: cmd }, { repoRoot: workRepo });
      expect(res.allowed, cmd).toBe(true);
    }
  });

  it("GIVEN escrituras a .agents/hooks.json del repo, ~/.gemini/config/**, otras rutas fuera del repo o traversal desde brain WHEN pre THEN bloquea con fs.protected", () => {
    for (const targetPath of [
      path.join(workRepo, ".agents", "hooks.json"),
      ".agents/hooks.json",
      path.join(workRepo, ".gemini", "antigravity-cli", "brain", "abc", "scratch", "x.mjs"),
      "~/.gemini/config/hooks.json",
      "~/.gemini/config/settings.json",
      "C:\\Users\\user\\.gemini\\config\\hooks.json",
      "~/.gemini/antigravity-cli/brain/abc/../../config/hooks.json",
      "~/.gemini/antigravity-cli/brain/abc/%2e%2e/%2e%2e/config/hooks.json",
      "~/.gemini/settings.json",
      "~/.agents/hooks.json",
      "~/.opencode/plugins/x.ts",
    ]) {
      const res = evaluateRules({ kind: "write", targetPath }, { repoRoot: workRepo });
      expect(res.allowed, targetPath).toBe(false);
      expect(res.ruleId, targetPath).toBe("fs.protected");
    }
  });

  it("GIVEN comandos shell que escriben a ~/.gemini/config/hooks.json, .claude/, .agents/ o traversal desde brain WHEN pre THEN bloquea con fs.protected", () => {
    for (const command of [
      "echo x > ~/.gemini/config/hooks.json",
      "Set-Content .claude/settings.json x",
      "Set-Content -Path .agents/hooks.json -Value x",
      "echo x > .agents/hooks.json",
      "cp ./x.json ~/.gemini/config/hooks.json",
      "echo x > ~/.gemini/antigravity-cli/brain/abc/../../config/hooks.json",
      "echo x > ~/.gemini/antigravity-cli/brain/abc/%2e%2e/%2e%2e/config/hooks.json",
      "Set-Content ~/.gemini/config/settings.json x",
    ]) {
      const res = evaluateRules({ kind: "shell", command }, { repoRoot: workRepo });
      expect(res.allowed, command).toBe(false);
      expect(res.ruleId, command).toBe("fs.protected");
    }
  });
});

describe("GOZS-773: regla estricta shell.polling (> 5 s) y registro shell.wait", () => {
  const shell = (command: string) => evaluateRules({ kind: "shell", command });

  it("GIVEN Start-Sleep 20; gh pr checks 636 WHEN pre THEN se bloquea con shell.polling", () => {
    const res = shell("Start-Sleep 20; gh pr checks 636");
    expect(res.allowed).toBe(false);
    expect(res.ruleId).toBe("shell.polling");
    expect(res.reason).toContain("harness-pr-status.mjs");
    expect(res.reason).toContain("--wait-checks");
  });

  it("GIVEN while ($true) { Start-Sleep 30; gh run view 123 } WHEN pre THEN se bloquea con shell.polling", () => {
    const res = shell("while ($true) { Start-Sleep 30; gh run view 123 }");
    expect(res.allowed).toBe(false);
    expect(res.ruleId).toBe("shell.polling");
  });

  it("GIVEN Start-Sleep 15 (solo, sin verificación local) WHEN pre THEN se bloquea con shell.polling", () => {
    const res = shell("Start-Sleep 15");
    expect(res.allowed).toBe(false);
    expect(res.ruleId).toBe("shell.polling");
  });

  for (const cmd of [
    "Start-Sleep -Seconds 10",
    "Start-Sleep -s 6",
    "Start-Sleep -Milliseconds 6000",
    "Start-Sleep -Milliseconds -100",
    "Start-Sleep -Seconds:-5",
    "Start-Sleep -Milliseconds:-100",
    "sleep 10",
    "sleep 1m",
    "timeout /t 10",
    "timeout /t -1",
    "timeout /t:-1",
    "timeout /T 15 /nobreak",
    "ping -n 10 127.0.0.1",
    "ping -n -1 127.0.0.1",
    "Start-Sleep 3; gh pr view 636",
    "sleep 2 && gh run list",
    "Start-Sleep 2; gh run watch 999",
    "Start-Sleep 2; multica issue get 01a20b11",
    'Start-Sleep 2; & "$env:MULTICA_CLI_PATH" issue wakeup runs 01a20b11',
    "sleep 3; multica issue list --limit 5",
    "while true; do sleep 3; done",
    "for i in 1 2 3; do sleep 2; done",
    "until gh pr checks 1; do sleep 5; done",
    "Start-Sleep 3; Start-Sleep 3",
    "Start-Sleep 10; curl https://example.com",
    "while ($true) { Start-Sleep 10; Invoke-WebRequest http://localhost:3000 }",
  ]) {
    it(`GIVEN espera prohibida '${cmd}' WHEN pre THEN se bloquea con shell.polling`, () => {
      const res = shell(cmd);
      expect(res.allowed).toBe(false);
      expect(res.ruleId).toBe("shell.polling");
    });
  }

  it("GIVEN Start-Sleep 10; Invoke-WebRequest http://localhost:3000 WHEN pre THEN se permite y registra shell.wait", () => {
    const res = shell("Start-Sleep 10; Invoke-WebRequest http://localhost:3000");
    expect(res.allowed).toBe(true);
    expect(res.ruleId).toBe("shell.wait");
  });

  it("GIVEN Start-Sleep 5 (<= 5 s, sin polling ni bucle) WHEN pre THEN se permite y registra shell.wait", () => {
    const res = shell("Start-Sleep 5");
    expect(res.allowed).toBe(true);
    expect(res.ruleId).toBe("shell.wait");
  });

  for (const cmd of [
    "Start-Sleep -Seconds 5",
    "Start-Sleep -Milliseconds 5000",
    "sleep 3",
    "timeout /t 5",
    "ping -n 6 127.0.0.1",
    "sleep 10 && curl -sf http://127.0.0.1:3000/api/health",
    "Start-Sleep 8; Test-NetConnection -ComputerName localhost -Port 3000",
    "Start-Sleep 8; Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3000",
    "Start-Sleep 10; $r = Invoke-WebRequest http://localhost:3000",
  ]) {
    it(`GIVEN espera permitida '${cmd}' WHEN pre THEN se permite con ruleId shell.wait`, () => {
      const res = shell(cmd);
      expect(res.allowed).toBe(true);
      expect(res.ruleId).toBe("shell.wait");
    });
  }

  it("GIVEN rg -n \"Start-Sleep\" docs o timeout 60 npx vitest run x.spec.ts WHEN pre THEN se permiten sin ruleId", () => {
    for (const cmd of [
      'rg -n "Start-Sleep" docs',
      "timeout 60 npx vitest run x.spec.ts",
      'echo "Start-Sleep 20; gh pr checks 636"',
      'git commit -m "chore: block Start-Sleep 30"',
      "ping -n 10 8.8.8.8",
    ]) {
      const res = shell(cmd);
      expect(res.allowed).toBe(true);
      expect(res.ruleId).toBeUndefined();
    }
  });

  it("GIVEN Start-Sleep 2; rm -rf build WHEN pre THEN no saltea reglas destructivas previas", () => {
    const res = shell("Start-Sleep 2; rm -rf build");
    expect(res.allowed).toBe(false);
    expect(res.ruleId).toBe("shell.rm-rf");
  });

  it("GIVEN telemetría buildEvent sobre shell.wait, shell.polling y allow sin espera THEN registra rule correctamente", () => {
    const waitCall = normalize({ toolCall: { name: "run_command", args: { CommandLine: "Start-Sleep 5" } } }, { runtime: "antigravity", phase: "pre" });
    const waitEvt = buildEvent(waitCall, evaluateRules(waitCall));
    expect(waitEvt.decision).toBe("allow");
    expect(waitEvt.rule).toBe("shell.wait");

    const pollCall = normalize({ toolCall: { name: "run_command", args: { CommandLine: "Start-Sleep 15" } } }, { runtime: "antigravity", phase: "pre" });
    const pollEvt = buildEvent(pollCall, evaluateRules(pollCall));
    expect(pollEvt.decision).toBe("block");
    expect(pollEvt.rule).toBe("shell.polling");

    const plainCall = normalize({ toolCall: { name: "run_command", args: { CommandLine: 'rg -n "Start-Sleep" docs' } } }, { runtime: "antigravity", phase: "pre" });
    const plainEvt = buildEvent(plainCall, evaluateRules(plainCall));
    expect(plainEvt.decision).toBe("allow");
    expect(plainEvt.rule).toBeNull();
  });
});

describe("GOZS-768: normalize.mjs (cwd, startLine, search, toolUseId, post ok/error) y evaluateSearch", () => {
  it("normaliza Read de Claude Code con offset y limit y expone cwd y toolUseId", () => {
    const norm = normalize({
      hook_event_name: "PreToolUse",
      cwd: "/ws/gozster",
      tool_name: "Read",
      tool_input: { file_path: "/ws/gozster/src/a.ts", offset: 100, limit: 200 },
      tool_use_id: "toolu_abc",
    });
    expect(norm.kind).toBe("read");
    expect(norm.startLine).toBe(100);
    expect(norm.limit).toBe(200);
    expect(norm.isBounded).toBe(true);
    expect(norm.cwd).toBe("/ws/gozster");
    expect(norm.toolUseId).toBe("toolu_abc");
    expect(norm.ok).toBeUndefined();
  });

  it("normaliza Grep y Glob de Claude Code como kind='search'", () => {
    const grep = normalize({
      hook_event_name: "PreToolUse",
      cwd: "/ws/gozster",
      tool_name: "Grep",
      tool_input: { pattern: "foo", path: "src/index.ts" },
      tool_use_id: "toolu_g1",
    });
    expect(grep.runtime).toBe("claude-code");
    expect(grep.kind).toBe("search");
    expect(grep.pattern).toBe("foo");
    expect(grep.filePath).toBe("src/index.ts");
    expect(grep.toolUseId).toBe("toolu_g1");

    const glob = normalize({
      hook_event_name: "PreToolUse",
      cwd: "/ws/gozster",
      tool_name: "Glob",
      tool_input: { pattern: "**/*.ts" },
      tool_use_id: "toolu_g2",
    });
    expect(glob.kind).toBe("search");
    expect(glob.pattern).toBe("**/*.ts");
    expect(glob.filePath).toBe("");
  });

  it("normaliza PostToolUse y PostToolUseFailure en Claude Code exponiendo ok y id", () => {
    const okPost = normalize({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "echo ok" },
      tool_response: { stdout: "ok", stderr: "", interrupted: false },
      tool_use_id: "toolu_ok",
    });
    expect(okPost.phase).toBe("post");
    expect(okPost.ok).toBe(true);
    expect(okPost.toolUseId).toBe("toolu_ok");

    const failPost = normalize({
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: "exit 1" },
      error: "Exit code 1",
      is_interrupt: false,
      tool_use_id: "toolu_fail",
    });
    expect(failPost.phase).toBe("post");
    expect(failPost.ok).toBe(false);
    expect(failPost.toolUseId).toBe("toolu_fail");

    const interruptedPost = normalize({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "sleep 10" },
      tool_response: { stdout: "", stderr: "", interrupted: true },
      tool_use_id: "toolu_int",
    });
    expect(interruptedPost.phase).toBe("post");
    expect(interruptedPost.ok).toBe(false);

    const exitCodePost = normalize({
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "false" },
      tool_response: { stdout: "", stderr: "fail", exit_code: 1 },
      tool_use_id: "toolu_ec",
    });
    expect(exitCodePost.phase).toBe("post");
    expect(exitCodePost.ok).toBe(false);
  });

  it("normaliza PostToolUse en Antigravity con workspacePaths[0], toolCall.id y error", () => {
    const okAg = normalize({
      hookEventName: "PostToolUse",
      conversationId: "conv-ag",
      workspacePaths: ["C:\\ws\\workdir"],
      error: "",
      toolCall: { id: "call_1", name: "run_command", args: { CommandLine: "pwd" } },
    });
    expect(okAg.runtime).toBe("antigravity");
    expect(okAg.phase).toBe("post");
    expect(okAg.cwd).toBe("C:\\ws\\workdir");
    expect(okAg.toolUseId).toBe("call_1");
    expect(okAg.ok).toBe(true);

    const errAg = normalize({
      conversationId: "conv-ag",
      workspacePaths: ["C:\\ws\\workdir"],
      error: "file does not exist",
      toolCall: { id: "call_2", name: "read_file", args: { Path: "C:\\ws\\workdir\\missing.txt" } },
    });
    expect(errAg.phase).toBe("post");
    expect(errAg.ok).toBe(false);
    expect(errAg.error).toBe("file does not exist");
  });

  it("GIVEN una búsqueda Grep sobre una ruta ordinaria o package-lock.json WHEN pre THEN se permite", () => {
    expect(
      checkGuard({ tool_name: "Grep", tool_input: { pattern: "foo", path: "src/index.ts" } }, { repoRoot }).allowed,
    ).toBe(true);
    expect(
      checkGuard({ tool_name: "Grep", tool_input: { pattern: "vitest", path: "package-lock.json" } }, { repoRoot }).allowed,
    ).toBe(true);
    expect(
      checkGuard({ tool_name: "Glob", tool_input: { pattern: "**/*.ts" } }, { repoRoot }).allowed,
    ).toBe(true);
  });

  it("GIVEN una búsqueda Grep sobre .env.local o *.pem/*.key WHEN pre THEN bloquea con la misma regla que una lectura (fs.env-leak / read.sensitive)", () => {
    const envRead = checkGuard({ tool_name: "Read", tool_input: { file_path: ".env.local" } }, { repoRoot });
    const envSearch = checkGuard({ tool_name: "Grep", tool_input: { pattern: "SECRET", path: ".env.local" } }, { repoRoot });
    expect(envSearch.allowed).toBe(false);
    expect(envSearch.ruleId).toBe(envRead.ruleId);
    expect(envSearch.ruleId).toBe("fs.env-leak");

    const keySearch = checkGuard({ tool_name: "Grep", tool_input: { pattern: "BEGIN", path: "certs/server.key" } }, { repoRoot });
    expect(keySearch.allowed).toBe(false);
    expect(keySearch.ruleId).toBe("read.sensitive");

    const exampleSearch = checkGuard({ tool_name: "Grep", tool_input: { pattern: "URL", path: ".env.example" } }, { repoRoot });
    expect(exampleSearch.allowed).toBe(true);
  });
});

describe("GOZS-780: remediate.cwd-lost solo sobre la salida y solo en Claude Code", () => {
  const post = (output: string, runtime = "claude-code", command = "cd foo") =>
    evaluateRules({ phase: "post", kind: "shell", runtime, command, output }, { repoRoot });

  it("GIVEN el texto del error dentro de un JSON o archivo mostrado WHEN evaluatePost THEN no inyecta", () => {
    expect(post('{ "pattern": "cd: x: No such file or directory" }', "claude-code", "cat rules.json").inject).toBeFalsy();
    expect(post("  - cd: x: No such file or directory en docs", "claude-code", "cat notes.md").inject).toBeFalsy();
    expect(post("", "claude-code", "grep -n 'cd: .*: No such file or directory' rules.json").inject).toBeFalsy();
  });

  it("GIVEN un cd que falla en Bash en Claude Code WHEN evaluatePost THEN inyecta el mensaje nuevo sin rutas absolutas", () => {
    for (const output of [
      "bash: line 1: cd: foo: No such file or directory",
      "/usr/bin/bash: line 3: cd: foo: No such file or directory",
      "cd: foo: No such file or directory",
    ]) {
      const res = post(output);
      expect(res.ruleId).toBe("remediate.cwd-lost");
      expect(res.inject).toBe(true);
      expect(res.context).toContain("rutas relativas");
      expect(res.context).not.toMatch(/absolute paths/i);
    }
  });

  it("GIVEN un Set-Location que falla en PowerShell 5.1 o 7 en Claude Code WHEN evaluatePost THEN inyecta el mensaje nuevo", () => {
    for (const output of [
      "Set-Location : Cannot find path 'C:\w\gozster' because it does not exist.\r\nAt line:1 char:1",
      "Set-Location: Cannot find path 'C:\w\gozster' because it does not exist.",
    ]) {
      const res = post(output, "claude-code", "Set-Location gozster");
      expect(res.ruleId).toBe("remediate.cwd-lost");
      expect(res.inject).toBe(true);
    }
  });

  it("GIVEN un fallo de Set-Location en Antigravity WHEN evaluatePost THEN no inyecta contexto", () => {
    const res = post("Set-Location : Cannot find path 'C:\w\gozster' because it does not exist.", "antigravity", "Set-Location gozster");
    expect(res.inject).toBeFalsy();
  });

  it("GIVEN rules.json WHEN se carga THEN remediate.cwd-lost no tiene pattern declarativo", () => {
    const rule = loadRules({ repoRoot }).find((r: { id: string }) => r.id === "remediate.cwd-lost");
    expect(rule).toBeDefined();
    expect(rule.pattern).toBeUndefined();
    expect(rule.message).not.toMatch(/absolute paths/i);
  });
});
