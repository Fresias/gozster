import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

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

    const report = JSON.parse(stdout);
    expect(report.candidate_id).toBe("test-cand-1");
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
      const report = JSON.parse(err.stdout);
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
    expect(parsed.passed).toBe(true);
    expect(parsed.candidate_id).toBe("cand-syntax");
  });
});
