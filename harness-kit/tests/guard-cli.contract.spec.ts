import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// H-06 — Flecha result (PostToolUse / AfterTool) en runtimes que la soporten
// Criterios de aceptación (Gherkin):
// 1. GIVEN un fixture post de Bash con GH007 THEN la salida inyecta el comando con el email noreply según el contrato del runtime.
// 2. GIVEN Write sobre una migración nueva THEN se inyecta el recordatorio de npx vitest run tests/db/.
// 3. GIVEN un runtime unsupported THEN no se genera post-hook y surface.spec.ts lo documenta.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const guardCliPath = path.resolve(here, "..", "core", "guard", "guard-cli.mjs");
const guardShPath = path.resolve(repoRoot, ".claude", "hooks", "guard.sh");

const gitBashWin = "C:\\Program Files\\Git\\bin\\bash.exe";
const bashBin = process.platform === "win32" && existsSync(gitBashWin) ? gitBashWin : "bash";
const bashEnv =
  process.platform === "win32" && existsSync(gitBashWin)
    ? {
        ...process.env,
        PATH: `C:\\Program Files\\Git\\bin;C:\\Program Files\\Git\\usr\\bin;${process.env.PATH ?? ""}`,
      }
    : process.env;

function runGuardCli(payload: unknown, args: string[] = []): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [guardCliPath, ...args], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
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

function runGuardSh(payload: unknown, args: string[] = []): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(bashBin, [guardShPath, ...args], {
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

describe("H-06: Flecha result (PostToolUse / AfterTool) contracts", () => {
  describe("GIVEN un fixture post de Bash con GH007", () => {
    const gh007Error =
      "remote: error: GH007: Your push would publish a private email address.\n" +
      "remote: To push, you must use 6156087+Fresias@users.noreply.github.com\n" +
      "To github.com:Fresias/gozster.git\n ! [remote rejected] main -> main (push declined due to email privacy restrictions)";

    it("THEN Claude Code PostToolUse inyecta el comando git config con email noreply", () => {
      const payload = {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: {
          command: "git push origin main",
        },
        tool_response: {
          stdout: "",
          stderr: gh007Error,
          exit_code: 1,
        },
      };

      const res = runGuardCli(payload);
      expect(res.code).toBe(0);

      const parsed = JSON.parse(res.stdout);
      expect(parsed).toHaveProperty("hookSpecificOutput");
      expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
      expect(parsed.hookSpecificOutput.additionalContext).toContain("git config --worktree user.email 6156087+Fresias@users.noreply.github.com");
    });

    it("THEN Gemini CLI AfterTool inyecta el comando git config con email noreply", () => {
      const payload = {
        hook_event_name: "AfterTool",
        tool_name: "run_shell_command",
        tool_input: {
          command: "git push origin main",
        },
        tool_response: {
          llmContent: gh007Error,
          returnDisplay: gh007Error,
        },
      };

      const res = runGuardCli(payload, ["--runtime", "gemini-cli"]);
      expect(res.code).toBe(0);

      const parsed = JSON.parse(res.stdout);
      expect(parsed).toHaveProperty("hookSpecificOutput");
      expect(parsed.hookSpecificOutput.hookEventName).toBe("AfterTool");
      expect(parsed.hookSpecificOutput.additionalContext).toContain("git config --worktree user.email 6156087+Fresias@users.noreply.github.com");
    });

    it("THEN via guard.sh shim también inyecta el comando git config en Claude Code", () => {
      const payload = {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: {
          command: "git push",
        },
        tool_response: {
          stderr: "GH007: push rejected",
        },
      };

      const res = runGuardSh(payload);
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
      expect(parsed.hookSpecificOutput.additionalContext).toContain("git config --worktree user.email");
    });
  });

  describe("GIVEN Write sobre una migración nueva", () => {
    it("THEN Claude Code inyecta el recordatorio de npx vitest run tests/db/", () => {
      const payload = {
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        tool_input: {
          file_path: "supabase/migrations/20261020000000_create_example.sql",
          content: "-- create table example...",
        },
        tool_response: {
          type: "create",
          filePath: "supabase/migrations/20261020000000_create_example.sql",
        },
      };

      const res = runGuardCli(payload);
      expect(res.code).toBe(0);

      const parsed = JSON.parse(res.stdout);
      expect(parsed).toHaveProperty("hookSpecificOutput");
      expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
      expect(parsed.hookSpecificOutput.additionalContext).toContain("npx vitest run tests/db/");
    });

    it("THEN Gemini CLI write_file inyecta el recordatorio de npx vitest run tests/db/", () => {
      const payload = {
        hook_event_name: "AfterTool",
        tool_name: "write_file",
        tool_input: {
          file_path: "supabase/migrations/20261020000000_create_example.sql",
          content: "-- create table example...",
        },
        tool_response: {
          llmContent: "Successfully wrote to supabase/migrations/20261020000000_create_example.sql",
        },
      };

      const res = runGuardCli(payload, ["--runtime", "gemini-cli"]);
      expect(res.code).toBe(0);

      const parsed = JSON.parse(res.stdout);
      expect(parsed).toHaveProperty("hookSpecificOutput");
      expect(parsed.hookSpecificOutput.hookEventName).toBe("AfterTool");
      expect(parsed.hookSpecificOutput.additionalContext).toContain("npx vitest run tests/db/");
    });

    it("THEN Write sobre un archivo ordinario no inyecta nada (retorna {})", () => {
      const payload = {
        hook_event_name: "PostToolUse",
        tool_name: "Write",
        tool_input: {
          file_path: "src/utils/math.ts",
          content: "export const add = (a, b) => a + b;",
        },
        tool_response: {
          type: "create",
        },
      };

      const res = runGuardCli(payload);
      expect(res.code).toBe(0);
      expect(JSON.parse(res.stdout)).toEqual({});
    });
  });

  // GOZS-85 — reglas result remediate.* (§4.5)
  describe("GIVEN un post de shell con cd fallido o salida > 20.000 chars", () => {
    const cwdLost = "bash: cd: gozster: No such file or directory";

    it("THEN Claude Code PostToolUse inyecta la remediación de cwd", () => {
      const res = runGuardCli({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "cd gozster" },
        tool_response: { stdout: "", stderr: cwdLost, exit_code: 1 },
      });
      expect(res.code).toBe(0);
      expect(JSON.parse(res.stdout).hookSpecificOutput.additionalContext).toBe(
        "cwd persists between Bash calls; run `pwd` and use absolute paths.",
      );
    });

    it("THEN Gemini CLI AfterTool inyecta la remediación de cwd", () => {
      const res = runGuardCli(
        {
          hook_event_name: "AfterTool",
          tool_name: "run_shell_command",
          tool_input: { command: "cd gozster" },
          tool_response: { llmContent: cwdLost, returnDisplay: cwdLost },
        },
        ["--runtime", "gemini-cli"],
      );
      expect(res.code).toBe(0);
      expect(JSON.parse(res.stdout).hookSpecificOutput.additionalContext).toContain("cwd persists between Bash calls");
    });

    it("THEN Claude Code PostToolUse inyecta la remediación de salida acotada", () => {
      const res = runGuardCli({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "cat big.log" },
        tool_response: { stdout: "x".repeat(20001), stderr: "", exit_code: 0 },
      });
      expect(res.code).toBe(0);
      expect(JSON.parse(res.stdout).hookSpecificOutput.additionalContext).toContain("Tool output exceeded 20,000 characters");
    });
  });

  describe("GIVEN un runtime unsupported (Antigravity)", () => {
    it("THEN guard-cli responde {} con exit 0 sin inventar workarounds", () => {
      const payload = {
        toolCall: {
          name: "run_command",
          args: {
            CommandLine: "git push origin main",
          },
        },
        tool_response: {
          stdout: "GH007: private email",
        },
      };

      const res = runGuardCli(payload, ["--runtime", "antigravity", "--phase", "post"]);
      expect(res.code).toBe(0);
      expect(JSON.parse(res.stdout)).toEqual({});
    });
  });
});