import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error - mjs module
import { ensureBaseline } from "../core/scripts/harness-probe.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..");
const probeScript = path.join(kitDir, "core", "scripts", "harness-probe.mjs");
const proposerDoc = path.join(kitDir, "core", "subagents", "harness-proposer.md");

describe("Harness² Subagente: harness-proposer", () => {
  it("declara frontmatter válido con name y description", () => {
    expect(existsSync(proposerDoc)).toBe(true);
    const content = readFileSync(proposerDoc, "utf8");
    expect(content).toMatch(/^---\r?\nname:\s*harness-proposer\r?\ndescription:/m);
  });

  it("documenta los 8 componentes editables y la inviolabilidad del Hard Core", () => {
    const content = readFileSync(proposerDoc, "utf8");
    expect(content).toContain("system_prompt");
    expect(content).toContain("guardrails");
    expect(content).toContain("memory");
    expect(content).toContain("tool_guidance");
    expect(content).toContain("subagents");
    expect(content).toContain("skills");
    expect(content).toContain("scripts");
    expect(content).toContain("plugins");
    expect(content).toContain("Hard Core");
  });
});

describe("Harness² Runner: harness-probe (aislamiento en ramas efímeras)", () => {
  let tempRepo: string | undefined;

  afterEach(() => {
    if (tempRepo && existsSync(tempRepo)) {
      rmSync(tempRepo, { recursive: true, force: true });
      tempRepo = undefined;
    }
  });

  function setupTestRepo(): string {
    tempRepo = mkdtempSync(path.join(tmpdir(), "harness-probe-repo-"));

    // git init
    execFileSync("git", ["init", "-b", "main"], { cwd: tempRepo });
    execFileSync("git", ["config", "user.name", "Tester"], { cwd: tempRepo });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: tempRepo });

    // Initial harness setup
    const overlay = path.join(tempRepo, "harness");
    mkdirSync(overlay, { recursive: true });

    writeFileSync(
      path.join(overlay, "harness.json"),
      JSON.stringify({ kit: "harness-kit", version: "2.0.0", out: ".harness" }),
    );
    writeFileSync(
      path.join(overlay, "project.json"),
      JSON.stringify({
        name: "probe-test",
        runtimes: ["antigravity"],
        gate: "node -e 'process.exit(0)'",
      }),
    );
    writeFileSync(path.join(overlay, "tool_guidance.local.md"), "# Initial Guidance\n");
    writeFileSync(path.join(tempRepo, ".gitignore"), ".harness/\n");

    execFileSync("git", ["add", "."], { cwd: tempRepo });
    execFileSync("git", ["commit", "-m", "chore: initial commit"], { cwd: tempRepo });

    return tempRepo;
  }

  it("ejecuta un probe exitoso en rama efímera y limpia la rama al finalizar", () => {
    const repo = setupTestRepo();

    const candidate = {
      candidate_id: "test-cand-1",
      mutations: [
        {
          target_component: "tool_guidance",
          file: "harness/tool_guidance.local.md",
          action: "append",
          content: "- probe test guidance added.",
        },
      ],
    };

    const stdout = execFileSync(
      process.execPath,
      [
        probeScript,
        "--workdir",
        repo,
        "--candidate",
        JSON.stringify(candidate),
        "--probe-cmd",
        "node -e 'process.exit(0)'",
        "--json",
      ],
      { encoding: "utf8" },
    );

    const reports = JSON.parse(stdout);
    expect(Array.isArray(reports)).toBe(true);
    expect(reports).toHaveLength(2);
    expect(reports[0].candidate_id).toBe("baseline");
    const report = reports.find((r: any) => r.candidate_id === "test-cand-1");
    expect(report.passed).toBe(true);
    expect(report.exit_code).toBe(0);
    expect(report.branch_kept).toBe(false);

    // Verifica que el repo regresó a la rama main y no dejó ramas efímeras
    const currentBranch = execFileSync("git", ["-C", repo, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
    }).trim();
    expect(currentBranch).toBe("main");

    const branches = execFileSync("git", ["-C", repo, "branch"], { encoding: "utf8" });
    expect(branches).not.toContain("probe/");
  });

  it("detecta fallos en el comando de probe y reporta passed=false sin romper el repo", () => {
    const repo = setupTestRepo();

    const candidate = {
      candidate_id: "test-failing-cand",
      mutations: [
        {
          file: "harness/tool_guidance.local.md",
          action: "append",
          content: "- failing rule.",
        },
      ],
    };

    try {
      execFileSync(
        process.execPath,
        [
          probeScript,
          "--workdir",
          repo,
          "--candidate",
          JSON.stringify(candidate),
          "--probe-cmd",
          "node -e 'process.stderr.write(\"intentional probe failure\\n\"); process.exit(1)'",
          "--json",
        ],
        { encoding: "utf8" },
      );
      expect.unreachable("debería lanzar exit code 1");
    } catch (err: any) {
      expect(err.status).toBe(1);
      const reports = JSON.parse(err.stdout);
      expect(Array.isArray(reports)).toBe(true);
      const report = reports.find((r: any) => r.candidate_id === "test-failing-cand");
      expect(report.passed).toBe(false);
      expect(report.exit_code).toBe(1);
      expect(report.stderr_preview).toContain("intentional probe failure");

      // El repo debe haber vuelto a main
      const currentBranch = execFileSync("git", ["-C", repo, "rev-parse", "--abbrev-ref", "HEAD"], {
        encoding: "utf8",
      }).trim();
      expect(currentBranch).toBe("main");
    }
  });

  it("impide mutaciones fuera del directorio harness/ por seguridad", () => {
    const repo = setupTestRepo();

    const maliciousCandidate = {
      candidate_id: "malicious-cand",
      mutations: [
        {
          file: "core/guard/rules.json",
          action: "replace",
          content: "{}",
        },
      ],
    };

    expect(() => {
      execFileSync(
        process.execPath,
        [
          probeScript,
          "--workdir",
          repo,
          "--candidate",
          JSON.stringify(maliciousCandidate),
          "--probe-cmd",
          "node -e 'process.exit(0)'",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
    }).toThrow();
  });

  it("resuelve el pipeline sintáctico universal con --syntax-only", () => {
    const repo = setupTestRepo();
    const candidateFile = path.join(repo, "candidate.json");
    writeFileSync(
      candidateFile,
      JSON.stringify({
        candidate_id: "cand-syntax",
        target_component: "tool_guidance",
        file: "harness/tool_guidance.local.md",
        action: "append",
        content: "- syntax invariant rule.",
      }),
    );

    const out = execFileSync(
      process.execPath,
      [probeScript, "--workdir", repo, "--candidate", candidateFile, "--syntax-only", "--probe-cmd", "node -e 'process.exit(0)'", "--json"],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    const cand = parsed.find((r: any) => r.candidate_id === "cand-syntax");
    expect(cand.passed).toBe(true);
    expect(cand.candidate_id).toBe("cand-syntax");
  });

  it("ejecuta múltiples candidatos en modo --batch y produce array de resultados", () => {
    const repo = setupTestRepo();
    const batchFile = path.join(repo, "batch.json");
    writeFileSync(
      batchFile,
      JSON.stringify([
        {
          candidate_id: "batch-1",
          mutations: [
            {
              target_component: "tool_guidance",
              file: "harness/tool_guidance.local.md",
              action: "append",
              content: "- rule batch 1",
            },
          ],
        },
        {
          candidate_id: "batch-2",
          mutations: [
            {
              target_component: "tool_guidance",
              file: "harness/tool_guidance.local.md",
              action: "append",
              content: "- rule batch 2",
            },
          ],
        },
      ]),
    );

    const out = execFileSync(
      process.execPath,
      [probeScript, "--workdir", repo, "--batch", batchFile, "--probe-cmd", "node -e 'process.exit(0)'", "--json"],
      { encoding: "utf8" },
    );
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].candidate_id).toBe("batch-1");
    expect(parsed[1].candidate_id).toBe("batch-2");
    expect(parsed[0].passed).toBe(true);
    expect(parsed[1].passed).toBe(true);
  });

  describe("sin la lista de git stash compartida", () => {
    const git = (repo: string, ...args: string[]) =>
      execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
    const candidate = JSON.stringify({
      candidate_id: "stash-free",
      mutations: [{ file: "harness/tool_guidance.local.md", action: "append", content: "- probe rule" }],
    });

    function runProbeIn(repo: string, probeCmd: string) {
      const report = path.join(mkdtempSync(path.join(tmpdir(), "harness-probe-report-")), "r.json");
      try {
        execFileSync(
          process.execPath,
          [probeScript, "--workdir", repo, "--candidate", candidate, "--probe-cmd", probeCmd, "--report", report, "--json"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
      } catch (err: any) {
        expect(err.status).toBe(1);
      } finally {
        rmSync(path.dirname(report), { recursive: true, force: true });
      }
    }

    function snapshot(repo: string) {
      return {
        head: git(repo, "rev-parse", "HEAD"),
        branch: git(repo, "rev-parse", "--abbrev-ref", "HEAD"),
        status: git(repo, "status", "--porcelain", "--untracked-files=all"),
        staged: git(repo, "diff", "--cached"),
        unstaged: git(repo, "diff"),
        guidance: readFileSync(path.join(repo, "harness", "tool_guidance.local.md"), "utf8"),
        untracked: readFileSync(path.join(repo, "notes.txt"), "utf8"),
        stash: git(repo, "stash", "list", "--format=%H"),
      };
    }

    function dirtyRepoWithForeignStash(): string {
      const repo = setupTestRepo();
      writeFileSync(path.join(repo, "harness", "tool_guidance.local.md"), "# Foreign agent WIP\n");
      git(repo, "stash", "push", "-m", "foreign-agent");
      writeFileSync(path.join(repo, "harness", "tool_guidance.local.md"), "# Initial Guidance\n- unstaged edit\n");
      writeFileSync(path.join(repo, "harness", "staged.md"), "staged new file\n");
      git(repo, "add", "harness/staged.md");
      writeFileSync(path.join(repo, "notes.txt"), "untracked\n");
      return repo;
    }

    it.each([
      ["con éxito", "node -e 'process.exit(0)'"],
      ["con error", "node -e 'process.exit(1)'"],
    ])("deja intactos la lista de stash, el índice y el worktree (%s)", (_label, probeCmd) => {
      const repo = dirtyRepoWithForeignStash();
      const before = snapshot(repo);
      expect(before.stash.trim().split("\n")).toHaveLength(1);

      runProbeIn(repo, probeCmd);

      expect(snapshot(repo)).toEqual(before);
      expect(git(repo, "branch", "--list", "probe/*")).toBe("");
    });

    it("con worktree limpio no crea commits ni stash residuales", () => {
      const repo = setupTestRepo();
      const headBefore = git(repo, "rev-parse", "HEAD");

      runProbeIn(repo, "node -e 'process.exit(0)'");

      expect(git(repo, "rev-parse", "HEAD")).toBe(headBefore);
      expect(git(repo, "stash", "list")).toBe("");
      expect(git(repo, "status", "--porcelain", "--untracked-files=all")).toBe("");
      expect(git(repo, "rev-list", "--all").trim().split("\n")).toHaveLength(1);
    });
  });

  describe("ensureBaseline", () => {
    it("si recibe 1 candidato, antepone el baseline para permitir evaluación contrastiva", () => {
      const candidates = [{ candidate_id: "cand-1", target_component: "tool_guidance", mutations: [] }];
      const res = ensureBaseline(candidates);
      expect(res).toHaveLength(2);
      expect(res[0].candidate_id).toBe("baseline");
      expect(res[1].candidate_id).toBe("cand-1");
    });

    it("si recibe múltiples candidatos o ya incluye baseline, no altera la lista", () => {
      const candidates = [
        { candidate_id: "baseline", target_component: "baseline", mutations: [] },
        { candidate_id: "cand-1", target_component: "tool_guidance", mutations: [] },
      ];
      const res = ensureBaseline(candidates);
      expect(res).toHaveLength(2);
      expect(res[0].candidate_id).toBe("baseline");
    });
  });
});
