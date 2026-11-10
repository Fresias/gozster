import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const guardPath = path.join(repoRoot, ".claude", "hooks", "guard.sh").replace(/\\/g, "/");
const gitBashWin = "C:\\Program Files\\Git\\bin\\bash.exe";
const bashBin = process.platform === "win32" && existsSync(gitBashWin) ? gitBashWin : "bash";
const bashEnv =
  process.platform === "win32" && existsSync(gitBashWin)
    ? {
        ...process.env,
        PATH: `C:\\Program Files\\Git\\bin;C:\\Program Files\\Git\\usr\\bin;${process.env.PATH ?? ""}`,
      }
    : process.env;

/** Invoke guard.sh with a hook payload on stdin; return exit code and output. */
function runGuard(
  payload: unknown,
  args: string[] = [],
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(bashBin, [guardPath, ...args], {
      input: JSON.stringify(payload),
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
      stderr: e.stderr ? e.stderr.toString() : "",
    };
  }
}

const bashPayload = (command: string) => ({ tool_name: "Bash", tool_input: { command } });
const readPayload = (file_path: string, limit?: number) => ({
  tool_name: "Read",
  tool_input: limit === undefined ? { file_path } : { file_path, limit },
});

describe("AGENTS.md", () => {
  const agents = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");

  it("exists and is under 150 lines", () => {
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.split("\n").length).toBeLessThan(150);
  });

  it("documents the real package.json scripts", () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts).toHaveProperty("typecheck");
    expect(pkg.scripts).toHaveProperty("test");
    expect(pkg.scripts).toHaveProperty("seed:mynter");

    for (const cmd of [
      "npm ci",
      "npm run dev",
      "npm run build",
      "npm run typecheck",
      "npm test",
      "npx vitest run",
      "npm run seed:mynter",
    ]) {
      expect(agents, `AGENTS.md should document "${cmd}"`).toContain(cmd);
    }
  });
});

describe("guard.sh — destructive command blocking", () => {
  it.each([
    ["git push --force", "git push --force origin main"],
    ["git push origin +main", "git push origin +main"],
    ["git reset --hard", "git reset --hard HEAD~3"],
    ["rm -rf", "rm -rf build"],
    ["cat .env", "cat .env"],
  ])("blocks (exit 2): %s", (_label, command) => {
    expect(runGuard(bashPayload(command)).code).toBe(2);
  });
});

describe("guard.sh — multica anti-waste rules", () => {
  it("blocks comment list without --compact/--roots-only", () => {
    expect(runGuard(bashPayload("multica issue comment list 123 --output json")).code).toBe(2);
  });

  it("allows a bounded comment list", () => {
    expect(
      runGuard(
        bashPayload("multica issue comment list 123 --roots-only --summary --compact --output json"),
      ).code,
    ).toBe(0);
  });

  it("blocks issue list without --limit", () => {
    expect(runGuard(bashPayload("multica issue list --output json")).code).toBe(2);
  });

  it("allows an issue list with --limit", () => {
    expect(runGuard(bashPayload("multica issue list --limit 10 --output json")).code).toBe(0);
  });

  it("blocks issue search without --project", () => {
    expect(runGuard(bashPayload("multica issue search 'bug'")).code).toBe(2);
  });

  it("allows an issue search with --project", () => {
    expect(runGuard(bashPayload("multica issue search 'bug' --project p-123")).code).toBe(0);
  });
});

describe("guard.sh — Read token-waste rules", () => {
  let tmp: string;
  let bigFile: string;
  let smallFile: string;

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "gozs-guard-"));
    bigFile = path.join(tmp, "big.txt");
    smallFile = path.join(tmp, "small.txt");
    writeFileSync(bigFile, Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join("\n") + "\n");
    writeFileSync(smallFile, Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n") + "\n");
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  const posix = (p: string) => p.replace(/\\/g, "/");

  it("blocks Read without limit on a >300-line file", () => {
    expect(runGuard(readPayload(posix(bigFile))).code).toBe(2);
  });

  it("allows Read with limit=150 on that same file", () => {
    expect(runGuard(readPayload(posix(bigFile), 150)).code).toBe(0);
  });

  it("allows Read without limit on a <=300-line file", () => {
    expect(runGuard(readPayload(posix(smallFile))).code).toBe(0);
  });
});

describe("multi-runtime hook configs", () => {
  it(".agents/hooks.json wires gozster-guard for Antigravity", () => {
    const cfg = JSON.parse(readFileSync(path.join(repoRoot, ".agents", "hooks.json"), "utf8"));
    const entry = cfg["gozster-guard"].PreToolUse[0];
    expect(cfg["gozster-guard"].enabled).toBe(true);
    expect(entry.matcher).toBe("run_command|view_file|write_to_file|replace_file_content|multi_replace_file_content");
    expect(entry.hooks[0].command).toBe('bash -c "exec bash \\"$(git rev-parse --show-toplevel)/.claude/hooks/guard.sh\\" --runtime antigravity"');
  });

  it(".gemini/settings.json loads AGENTS.md, disables YOLO and wires BeforeTool", () => {
    const cfg = JSON.parse(readFileSync(path.join(repoRoot, ".gemini", "settings.json"), "utf8"));
    const entry = cfg.hooks.BeforeTool[0];
    expect(cfg.context.fileName).toBe("AGENTS.md");
    expect(cfg.security.disableYoloMode).toBe(true);
    expect(entry.matcher).toBe("^(run_shell_command|read_file|read_many_files|write_file|replace)$");
    expect(entry.hooks[0].command).toBe("bash .claude/hooks/guard.sh --runtime gemini-cli");
  });
});

describe("guard.sh — multi-runtime payloads and output contracts", () => {
  let tmp: string;
  let bigFile: string;

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "gozs-guard-rt-"));
    bigFile = path.join(tmp, "big.txt").replace(/\\/g, "/");
    writeFileSync(bigFile, Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join("\n") + "\n");
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  describe("Claude Code", () => {
    it("blocks with exit 2 and stderr", () => {
      const r = runGuard(bashPayload("git push --force"));
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("Blocked by .claude/hooks/guard.sh");
    });

    it("allows with exit 0 and {} on stdout", () => {
      const r = runGuard(bashPayload("npm test"));
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({});
    });
  });

  describe("Gemini CLI (--runtime gemini-cli)", () => {
    const gemini = ["--runtime", "gemini-cli"];
    const shell = (command: string) => ({ tool_name: "run_shell_command", tool_input: { command } });

    it("blocks run_shell_command with exit 2 and stderr", () => {
      const r = runGuard(shell("cat .env"), gemini);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain("Blocked by .claude/hooks/guard.sh");
    });

    it("allows run_shell_command with exit 0 and {} on stdout", () => {
      const r = runGuard(shell("multica issue list --limit 10 --output json"), gemini);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({});
    });

    it("blocks read_file without limit on a >300-line file", () => {
      const r = runGuard({ tool_name: "read_file", tool_input: { absolute_path: bigFile } }, gemini);
      expect(r.code).toBe(2);
    });

    it("allows read_file with limit=100 on that file", () => {
      const r = runGuard({ tool_name: "read_file", tool_input: { file_path: bigFile, limit: 100 } }, gemini);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({});
    });

    it("blocks read_many_files including package-lock.json", () => {
      const r = runGuard(
        { tool_name: "read_many_files", tool_input: { paths: ["src/lib/utils.ts", "package-lock.json"] } },
        gemini,
      );
      expect(r.code).toBe(2);
    });
  });

  describe("Antigravity (--runtime antigravity)", () => {
    const ag = ["--runtime", "antigravity"];
    const runCommand = (CommandLine: string) => ({ toolCall: { name: "run_command", args: { CommandLine } } });
    const viewFile = (args: Record<string, unknown>) => ({ toolCall: { name: "view_file", args } });

    it("denies run_command via stdout JSON with exit 0", () => {
      const r = runGuard(runCommand("rm -rf build"), ag);
      expect(r.code).toBe(0);
      const out = JSON.parse(r.stdout) as { decision: string; reason: string };
      expect(out.decision).toBe("deny");
      expect(out.reason).toContain("rm -rf");
    });

    it("allows run_command via stdout JSON with exit 0", () => {
      const r = runGuard(runCommand("multica issue comment list 123 --roots-only --summary --compact --output json"), ag);
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({ decision: "allow" });
    });

    it("denies view_file without a line range on a >300-line file", () => {
      const r = runGuard(viewFile({ AbsolutePath: bigFile }), ag);
      expect(JSON.parse(r.stdout).decision).toBe("deny");
    });

    it("allows view_file with StartLine/EndLine spanning <=300 lines", () => {
      const r = runGuard(viewFile({ AbsolutePath: bigFile, StartLine: 1, EndLine: 150 }), ag);
      expect(JSON.parse(r.stdout)).toEqual({ decision: "allow" });
    });

    it("denies view_file with a range wider than 300 lines", () => {
      const r = runGuard(viewFile({ AbsolutePath: bigFile, StartLine: 50, EndLine: 400 }), ag);
      expect(JSON.parse(r.stdout).decision).toBe("deny");
    });

    it("auto-detects Antigravity from toolCall without --runtime", () => {
      const r = runGuard(runCommand("git reset --hard"));
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout).decision).toBe("deny");
    });
  });
});
