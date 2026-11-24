import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

function runGuardCli(
  payload: unknown,
  args: string[] = [],
  cwd: string = repoRoot,
  extraEnv?: Record<string, string>,
): { code: number; stdout: string; stderr: string } {
  const env = extraEnv ? { ...process.env, ...extraEnv } : process.env;
  try {
    const stdout = execFileSync(process.execPath, [guardCliPath, ...args], {
      cwd,
      input: typeof payload === "string" ? payload : JSON.stringify(payload),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env,
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

    it("GIVEN GH007 sin email en salida WHEN corre guard-cli THEN inyecta el email de project.json", () => {
      const payload = {
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: {
          command: "git push origin main",
        },
        tool_response: {
          stdout: "",
          stderr: "remote: error: GH007: Your push would publish a private email address.",
          exit_code: 1,
        },
      };

      const res = runGuardCli(payload);
      expect(res.code).toBe(0);

      const parsed = JSON.parse(res.stdout);
      expect(parsed).toHaveProperty("hookSpecificOutput");
      expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
      expect(parsed.hookSpecificOutput.additionalContext).toContain("git config --worktree user.email 356475546+AgentsMultica@users.noreply.github.com");
    });

    it("GIVEN GH007 sin email y sin configuración WHEN corre guard-cli THEN el aviso no contiene Fresias y explica cómo configurar bot_noreply_email", () => {
      const tempDir = mkdtempSync(path.join(tmpdir(), "guard-cli-empty-"));
      try {
        mkdirSync(path.join(tempDir, ".git"));
        const payload = {
          hook_event_name: "PostToolUse",
          tool_name: "Bash",
          tool_input: {
            command: "git push origin main",
          },
          tool_response: {
            stdout: "",
            stderr: "remote: error: GH007: Your push would publish a private email address.",
            exit_code: 1,
          },
        };

        const res = runGuardCli(payload, [], tempDir);
        expect(res.code).toBe(0);

        const parsed = JSON.parse(res.stdout);
        expect(parsed).toHaveProperty("hookSpecificOutput");
        expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
        expect(parsed.hookSpecificOutput.additionalContext).not.toContain("6156087+Fresias");
        expect(parsed.hookSpecificOutput.additionalContext).toContain("bot_noreply_email");
        expect(parsed.hookSpecificOutput.additionalContext).toContain("harness/project.json");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
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

  describe("H-07: GIVEN un bloqueo del guard en fase pre", () => {
    it("THEN en Claude Code / CLI general incluye [<ruleId>] en el mensaje de bloqueo por stderr (exit 2)", () => {
      const res = runGuardCli({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: {
          command: "git push --force origin main",
        },
      });
      expect(res.code).toBe(2);
      expect(res.stderr).toContain("Blocked by .claude/hooks/guard.sh: [git.force-push]");
      expect(res.stderr).toContain("Force/destructive push is forbidden");
    });

    it("THEN en Antigravity incluye [<ruleId>] en el campo reason del JSON de rechazo", () => {
      const res = runGuardCli(
        {
          toolCall: {
            name: "read_file",
            args: {
              Path: "package-lock.json",
            },
          },
        },
        ["--runtime", "antigravity", "--phase", "pre"],
      );
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.decision).toBe("deny");
      expect(parsed.reason).toContain("Blocked by .claude/hooks/guard.sh: [fs.bloatware]");
      expect(parsed.reason).toContain("Reading package-lock.json is forbidden");
    });
  });

  describe("GOZS-768: telemetría pre/post con id, ok, cwd, rutas relativas, search y resiliencia de post", () => {
    it("GIVEN Claude Code ejecuta Bash pre y post (PostToolUse y PostToolUseFailure) WHEN termina THEN registra pre y post con mismo id y ok", () => {
      const telemetryDir = mkdtempSync(path.join(tmpdir(), "guard-cli-tel-cc-"));
      try {
        const env = { HARNESS_TELEMETRY: "1", HARNESS_TELEMETRY_DIR: telemetryDir };
        const pre = runGuardCli(
          {
            session_id: "sess-cc-1",
            cwd: repoRoot,
            hook_event_name: "PreToolUse",
            tool_name: "Bash",
            tool_input: { command: "echo hi" },
            tool_use_id: "toolu_cc_1",
          },
          ["--runtime", "claude-code"],
          repoRoot,
          env,
        );
        expect(pre.code).toBe(0);

        const postOk = runGuardCli(
          {
            session_id: "sess-cc-1",
            cwd: repoRoot,
            hook_event_name: "PostToolUse",
            tool_name: "Bash",
            tool_input: { command: "echo hi" },
            tool_response: { stdout: "hi", stderr: "", interrupted: false },
            tool_use_id: "toolu_cc_1",
          },
          ["--runtime", "claude-code"],
          repoRoot,
          env,
        );
        expect(postOk.code).toBe(0);
        expect(JSON.parse(postOk.stdout)).toEqual({});

        const postFail = runGuardCli(
          {
            session_id: "sess-cc-1",
            cwd: repoRoot,
            hook_event_name: "PostToolUseFailure",
            tool_name: "Bash",
            tool_input: { command: "exit 1" },
            error: "Exit code 1",
            is_interrupt: false,
            tool_use_id: "toolu_cc_2",
          },
          ["--runtime", "claude-code"],
          repoRoot,
          env,
        );
        expect(postFail.code).toBe(0);
        expect(JSON.parse(postFail.stdout)).toEqual({});

        const lines = readFileSync(path.join(telemetryDir, "events.jsonl"), "utf8")
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l));
        expect(lines).toHaveLength(3);
        expect(lines[0]).toMatchObject({ phase: "pre", id: "toolu_cc_1", cwd: "<repo>", cmd: "echo hi" });
        expect(lines[1]).toMatchObject({ phase: "post", id: "toolu_cc_1", cwd: "<repo>", ok: true });
        expect(lines[2]).toMatchObject({ phase: "post", id: "toolu_cc_2", cwd: "<repo>", ok: false });
      } finally {
        rmSync(telemetryDir, { recursive: true, force: true });
      }
    });

    it("GIVEN Antigravity ejecuta run_command WHEN termina THEN registra post con id y ok y responde {} sin alterar resultado", () => {
      const telemetryDir = mkdtempSync(path.join(tmpdir(), "guard-cli-tel-ag-"));
      try {
        const env = { HARNESS_TELEMETRY: "1", HARNESS_TELEMETRY_DIR: telemetryDir };
        const workdir = path.dirname(repoRoot);
        const okRes = runGuardCli(
          {
            conversationId: "conv-ag-1",
            hookEventName: "PostToolUse",
            workspacePaths: [workdir],
            error: "",
            toolCall: { id: "call_ag_1", name: "run_command", args: { CommandLine: "git status" } },
          },
          ["--runtime", "antigravity", "--phase", "post"],
          repoRoot,
          env,
        );
        expect(okRes.code).toBe(0);
        expect(JSON.parse(okRes.stdout)).toEqual({});

        const failRes = runGuardCli(
          {
            conversationId: "conv-ag-1",
            hookEventName: "PostToolUse",
            workspacePaths: [workdir],
            error: "file does not exist",
            toolCall: { id: "call_ag_2", name: "read_file", args: { Path: path.join(repoRoot, "missing.txt") } },
          },
          ["--runtime", "antigravity", "--phase", "post"],
          repoRoot,
          env,
        );
        expect(failRes.code).toBe(0);
        expect(JSON.parse(failRes.stdout)).toEqual({});

        const lines = readFileSync(path.join(telemetryDir, "events.jsonl"), "utf8")
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l));
        expect(lines).toHaveLength(2);
        expect(lines[0]).toMatchObject({ runtime: "antigravity", phase: "post", id: "call_ag_1", cwd: "<workdir>", ok: true });
        expect(lines[1]).toMatchObject({ runtime: "antigravity", phase: "post", id: "call_ag_2", cmd: "missing.txt", ok: false });
      } finally {
        rmSync(telemetryDir, { recursive: true, force: true });
      }
    });

    it("GIVEN Claude Code Grep sobre .env.local WHEN pre THEN bloquea con fs.env-leak y exit 2; Grep normal permite y registra kind='search'", () => {
      const telemetryDir = mkdtempSync(path.join(tmpdir(), "guard-cli-tel-grep-"));
      try {
        const env = { HARNESS_TELEMETRY: "1", HARNESS_TELEMETRY_DIR: telemetryDir };
        const allowed = runGuardCli(
          {
            session_id: "sess-grep",
            cwd: repoRoot,
            hook_event_name: "PreToolUse",
            tool_name: "Grep",
            tool_input: { pattern: "CMD_MAX", path: path.join(repoRoot, "harness-kit", "core", "guard", "telemetry.mjs") },
            tool_use_id: "toolu_grep_ok",
          },
          ["--runtime", "claude-code"],
          repoRoot,
          env,
        );
        expect(allowed.code).toBe(0);

        const blocked = runGuardCli(
          {
            session_id: "sess-grep",
            cwd: repoRoot,
            hook_event_name: "PreToolUse",
            tool_name: "Grep",
            tool_input: { pattern: "SECRET", path: path.join(repoRoot, ".env.local") },
            tool_use_id: "toolu_grep_env",
          },
          ["--runtime", "claude-code"],
          repoRoot,
          env,
        );
        expect(blocked.code).toBe(2);
        expect(blocked.stderr).toContain("[fs.env-leak]");

        const lines = readFileSync(path.join(telemetryDir, "events.jsonl"), "utf8")
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l));
        expect(lines).toHaveLength(2);
        expect(lines[0]).toMatchObject({
          kind: "search",
          decision: "allow",
          cmd: "CMD_MAX harness-kit/core/guard/telemetry.mjs",
        });
        expect(lines[1]).toMatchObject({
          kind: "search",
          decision: "block",
          rule: "fs.env-leak",
        });
      } finally {
        rmSync(telemetryDir, { recursive: true, force: true });
      }
    });

    it("GIVEN el hook post falla (ruta de telemetría no escribible o stdin corrupto) WHEN se ejecuta THEN devuelve {} y exit 0 sin afectar la tool", () => {
      const tmp = mkdtempSync(path.join(tmpdir(), "guard-cli-failpost-"));
      try {
        const blockingFile = path.join(tmp, "not-a-dir");
        writeFileSync(blockingFile, "x");
        const env = { HARNESS_TELEMETRY: "1", HARNESS_TELEMETRY_DIR: path.join(blockingFile, "nested") };

        const res1 = runGuardCli("{invalid json", ["--runtime", "antigravity", "--phase", "post"], repoRoot, env);
        expect(res1.code).toBe(0);
        expect(JSON.parse(res1.stdout)).toEqual({});

        const res2 = runGuardCli(
          { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "echo ok" }, tool_response: { stdout: "ok" } },
          ["--runtime", "claude-code", "--phase", "post"],
          repoRoot,
          env,
        );
        expect(res2.code).toBe(0);
        expect(JSON.parse(res2.stdout)).toEqual({});
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});