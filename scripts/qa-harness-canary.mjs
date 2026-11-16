#!/usr/bin/env node
/**
 * scripts/qa-harness-canary.mjs
 *
 * Verificación repetible de canarios del guard de Harness² (GOZSter).
 * Simula las entradas de cada runtime (claude-code y antigravity) contra el guard
 * del repo (--target repo) o contra los dispatchers instalados (--target installed).
 *
 * Casos: Tabla 6.4 de QA-PLAN-HARNESS.md (D1-D10, P1-P6 y S1).
 * Solo built-ins de Node.js. Ninguna acción destructiva o real es ejecutada.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

/**
 * Filtra reportes de sonda válidos, ignorando JSONs temporales de vitest (bug P1 de GOZS-528).
 * @param {string[]} files
 * @returns {string[]}
 */
export function filterProbeReports(files) {
  return files.filter((f) => {
    const base = path.basename(f);
    return !base.startsWith("vitest-") && base.endsWith(".json");
  });
}

/**
 * Mapea el texto del motivo de bloqueo al ruleId canónico.
 * @param {string} reason
 * @returns {string}
 */
export function mapReasonToRule(reason) {
  let str = String(reason || "").trim();
  str = str.replace(/^Blocked by [^:]+:\s*/i, "");
  if (/package-lock\.json/i.test(str)) return "fs.bloatware";
  if (/env files/i.test(str) || /\.env/i.test(str)) return "shell.env-leak";
  if (/copia instalada|installed guard|user hooks/i.test(str)) return "read.guard-installed";
  if (/\.git/i.test(str) || /tamper with the sandbox/i.test(str)) return "fs.protected";
  if (/Recablear el repo|worktree|renombrar ramas|repo-rewire/i.test(str)) return "git.repo-rewire";
  if (/Force\/destructive push|Force pushing|force-push/i.test(str)) return "git.force-push";
  if (/Recursive force delete|rm\s+-rf/i.test(str)) return "shell.rm-rf";
  if (/AGENTS\.md/i.test(str)) return "harness.agents-render";
  if (/protected harness source|Harness sources/i.test(str)) return "harness.authorized-only";
  if (/user\.email|GH007/i.test(str)) return "git.gh007-noreply";
  return "unknown";
}

/**
 * Definición de casos canarios según Tabla 6.4 de QA-PLAN-HARNESS.md
 */
export function getCanaryCases(root, home) {
  const targetHooksPath = path.join(home, ".claude", "hooks", "harness-kit", "core", "guard", "rules.json");

  return [
    // Deben bloquearse (D1 - D10)
    {
      id: "D1",
      action: "Leer package-lock.json (5 líneas)",
      tool: "read",
      expected: "deny",
      rule_expected: "fs.bloatware",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Read",
          tool_input: { file_path: "package-lock.json", offset: 1, limit: 5 },
        },
        "antigravity": {
          toolCall: {
            name: "view_file",
            args: { AbsolutePath: path.resolve(root, "package-lock.json"), StartLine: 1, EndLine: 5 },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "D2",
      action: "cat .env.qa-canary",
      tool: "shell",
      expected: "deny",
      rule_expected: "shell.env-leak",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "cat .env.qa-canary" },
        },
        "antigravity": {
          toolCall: {
            name: "run_command",
            args: { CommandLine: "cat .env.qa-canary" },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "D3",
      action: "Leer <home>/.claude/hooks/harness-kit/core/guard/rules.json",
      tool: "read",
      expected: "deny",
      rule_expected: "read.guard-installed",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Read",
          tool_input: { file_path: targetHooksPath, offset: 1, limit: 20 },
        },
        "antigravity": {
          toolCall: {
            name: "view_file",
            args: { AbsolutePath: targetHooksPath, StartLine: 1, EndLine: 20 },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "D4",
      action: "Escribir qa-canary/.git con gitdir: none",
      tool: "write",
      expected: "deny",
      rule_expected: "fs.protected",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Write",
          tool_input: { file_path: "qa-canary/.git", content: "gitdir: none" },
        },
        "antigravity": {
          toolCall: {
            name: "write_file",
            args: { Path: "qa-canary/.git", Content: "gitdir: none" },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "D5",
      action: "git -C qa-canary-repo branch -m qa-x",
      tool: "shell",
      expected: "deny",
      rule_expected: "git.repo-rewire",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "git -C qa-canary-repo branch -m qa-x" },
        },
        "antigravity": {
          toolCall: {
            name: "run_command",
            args: { CommandLine: "git -C qa-canary-repo branch -m qa-x" },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "D6",
      action: "git -C qa-canary-repo worktree add ../qa-wt",
      tool: "shell",
      expected: "deny",
      rule_expected: "git.repo-rewire",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "git -C qa-canary-repo worktree add ../qa-wt" },
        },
        "antigravity": {
          toolCall: {
            name: "run_command",
            args: { CommandLine: "git -C qa-canary-repo worktree add ../qa-wt" },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "D7",
      action: "git push --force origin refs/heads/qa-canary-inexistente",
      tool: "shell",
      expected: "deny",
      rule_expected: "git.force-push",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "git push --force origin refs/heads/qa-canary-inexistente" },
        },
        "antigravity": {
          toolCall: {
            name: "run_command",
            args: { CommandLine: "git push --force origin refs/heads/qa-canary-inexistente" },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "D8",
      action: "rm -rf qa-canary-inexistente",
      tool: "shell",
      expected: "deny",
      rule_expected: "shell.rm-rf",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "rm -rf qa-canary-inexistente" },
        },
        "antigravity": {
          toolCall: {
            name: "run_command",
            args: { CommandLine: "rm -rf qa-canary-inexistente" },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "D9",
      action: "Escribir AGENTS.md con su mismo contenido",
      tool: "write",
      expected: "deny",
      rule_expected: "harness.agents-render",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Write",
          tool_input: { file_path: "AGENTS.md", content: "-- agents render --" },
        },
        "antigravity": {
          toolCall: {
            name: "write_file",
            args: { Path: "AGENTS.md", Content: "-- agents render --" },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "D10",
      action: "Escribir harness/systemprompt.md en rama no autorizada",
      tool: "write",
      expected: "deny",
      rule_expected: "harness.authorized-only",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Write",
          tool_input: { file_path: "harness/systemprompt.md", content: "# prompt" },
        },
        "antigravity": {
          toolCall: {
            name: "write_file",
            args: { Path: "harness/systemprompt.md", Content: "# prompt" },
          },
          workspacePaths: [root],
        },
      },
    },

    // Deben permitirse (P1 - P6)
    {
      id: "P1",
      action: "rg -n evaluateCandidates harness-kit/core/scripts/harness-compose.mjs",
      tool: "shell",
      expected: "allow",
      rule_expected: "-",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "rg -n evaluateCandidates harness-kit/core/scripts/harness-compose.mjs" },
        },
        "antigravity": {
          toolCall: {
            name: "run_command",
            args: { CommandLine: "rg -n evaluateCandidates harness-kit/core/scripts/harness-compose.mjs" },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "P2",
      action: "Leer harness-kit/core/guard/guard-core.mjs, líneas 1 a 20",
      tool: "read",
      expected: "allow",
      rule_expected: "-",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Read",
          tool_input: { file_path: "harness-kit/core/guard/guard-core.mjs", offset: 1, limit: 20 },
        },
        "antigravity": {
          toolCall: {
            name: "view_file",
            args: { AbsolutePath: path.resolve(root, "harness-kit/core/guard/guard-core.mjs"), StartLine: 1, EndLine: 20 },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "P3",
      action: "git -C qa-canary-repo checkout -b qa-canary-tmp && git -C qa-canary-repo branch -a",
      tool: "shell",
      expected: "allow",
      rule_expected: "-",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "git -C qa-canary-repo checkout -b qa-canary-tmp && git -C qa-canary-repo branch -a" },
        },
        "antigravity": {
          toolCall: {
            name: "run_command",
            args: { CommandLine: "git -C qa-canary-repo checkout -b qa-canary-tmp && git -C qa-canary-repo branch -a" },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "P4",
      action: "Escribir qa-canary/.gitignore",
      tool: "write",
      expected: "allow",
      rule_expected: "-",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Write",
          tool_input: { file_path: "qa-canary/.gitignore", content: "node_modules\n" },
        },
        "antigravity": {
          toolCall: {
            name: "write_file",
            args: { Path: "qa-canary/.gitignore", Content: "node_modules\n" },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "P5",
      action: "git -C qa-canary-repo config user.email 356475546+AgentsMultica@users.noreply.github.com",
      tool: "shell",
      expected: "allow",
      rule_expected: "-",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "git -C qa-canary-repo config user.email 356475546+AgentsMultica@users.noreply.github.com" },
        },
        "antigravity": {
          toolCall: {
            name: "run_command",
            args: { CommandLine: "git -C qa-canary-repo config user.email 356475546+AgentsMultica@users.noreply.github.com" },
          },
          workspacePaths: [root],
        },
      },
    },
    {
      id: "P6",
      action: "node harness-kit/core/scripts/harness-render.mjs --check",
      tool: "shell",
      expected: "allow",
      rule_expected: "-",
      payloads: {
        "claude-code": {
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "node harness-kit/core/scripts/harness-render.mjs --check" },
        },
        "antigravity": {
          toolCall: {
            name: "run_command",
            args: { CommandLine: "node harness-kit/core/scripts/harness-render.mjs --check" },
          },
          workspacePaths: [root],
        },
      },
    },

    // Post-hook simulado (S1)
    {
      id: "S1",
      action: "git push con GH007 sugiere email noreply",
      tool: "post",
      expected: "inject",
      rule_expected: "git.gh007-noreply",
      payloads: {
        "claude-code": {
          hook_event_name: "PostToolUse",
          tool_name: "Bash",
          tool_input: { command: "git push origin main" },
          tool_response: {
            stdout: "",
            stderr: "remote: error: GH007: Your push would publish a private email address.",
            exit_code: 1,
          },
        },
        "antigravity": null, // Antigravity no admite post-hook -> n/a
      },
    },
  ];
}

/**
 * Ejecuta la suite de canarios.
 */
export function runCanarySuite(options = {}) {
  const runtime = options.runtime || "claude-code";
  const target = options.target || "repo";
  const home = options.home || os.homedir();
  const allowPending = options.allowPending || false;
  const mockMismatch = options.mockMismatch || false;

  const cases = getCanaryCases(repoRoot, home);
  const results = [];

  let dispatcherFile = "";
  let execCwd = repoRoot;
  let execArgs = [];
  let execPath = process.execPath;

  if (target === "installed") {
    execCwd = path.dirname(repoRoot); // Parent dir in Multica layout
    const hooksDir = path.join(home, ".claude", "hooks");
    const dispatcherName = runtime === "antigravity" ? "harness-dispatch-antigravity.mjs" : "harness-dispatch.mjs";
    dispatcherFile = path.join(hooksDir, dispatcherName);

    if (!existsSync(dispatcherFile)) {
      // Dispatches not installed -> all rows fail as not_installed
      for (const c of cases) {
        results.push({
          id: c.id,
          expected: c.expected,
          actual: "not_installed",
          rule_expected: c.rule_expected,
          rule_actual: "not_installed",
          pass: false,
        });
      }
      return results;
    }

    execArgs = [dispatcherFile];
  } else {
    // target === "repo"
    execCwd = repoRoot;
    const guardCli = path.join(repoRoot, "harness-kit", "core", "guard", "guard-cli.mjs");
    execArgs = [guardCli, "--runtime", runtime];
  }

  for (const c of cases) {
    if (c.id === "S1" && runtime === "antigravity") {
      // Antigravity does not support post-hook injection; remains n/a
      results.push({
        id: c.id,
        expected: "n/a",
        actual: "n/a",
        rule_expected: "n/a",
        rule_actual: "n/a",
        pass: true,
      });
      continue;
    }

    const payload = c.payloads[runtime];
    if (!payload) {
      results.push({
        id: c.id,
        expected: c.expected,
        actual: "n/a",
        rule_expected: c.rule_expected,
        rule_actual: "n/a",
        pass: true,
      });
      continue;
    }

    const res = spawnSync(execPath, execArgs, {
      cwd: execCwd,
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, HARNESS_TELEMETRY: "0", HARNESS_SESSION_ID: "canary" },
    });

    let actualDecision = "error";
    let actualRule = "-";

    if (runtime === "claude-code") {
      if (c.id === "S1") {
        if (res.status === 0) {
          try {
            const parsed = JSON.parse(res.stdout || "{}");
            if (parsed.hookSpecificOutput?.additionalContext?.includes("git config --worktree user.email")) {
              actualDecision = "inject";
              actualRule = "git.gh007-noreply";
            } else {
              actualDecision = "allow";
              actualRule = "-";
            }
          } catch {
            actualDecision = "allow";
            actualRule = "-";
          }
        }
      } else {
        if (res.status === 0) {
          actualDecision = "allow";
          actualRule = "-";
        } else if (res.status === 2) {
          actualDecision = "deny";
          actualRule = mapReasonToRule(res.stderr);
        }
      }
    } else {
      // antigravity
      if (res.status === 0) {
        try {
          const parsed = JSON.parse(res.stdout || "{}");
          if (parsed.decision === "allow") {
            actualDecision = "allow";
            actualRule = "-";
          } else if (parsed.decision === "deny") {
            actualDecision = "deny";
            actualRule = mapReasonToRule(parsed.reason);
          }
        } catch {
          actualDecision = "error";
          actualRule = "error";
        }
      }
    }

    if (mockMismatch && c.id === "D1") {
      actualRule = "mock.mismatch";
    }

    let pass = false;
    let expectedDecision = c.expected;
    let expectedRule = c.rule_expected;

    if (c.id === "D10" && target === "repo") {
      let isHarnessBranch = false;
      try {
        const br = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
        if (br.status === 0 && /^(feature|fix|chore)\/\d+-harness-/.test(br.stdout.trim())) {
          isHarnessBranch = true;
        }
      } catch {}
      if (isHarnessBranch) {
        // En ramas autorizadas de harness, la mutación en harness/ está explícitamente permitida.
        expectedDecision = "allow";
        expectedRule = "-";
      }
    }

    if (actualDecision === "not_installed") {
      pass = false;
    } else if (allowPending && actualRule === "pending") {
      pass = true;
    } else if (expectedDecision === "allow") {
      pass = actualDecision === "allow";
    } else if (expectedDecision === "deny") {
      pass = actualDecision === "deny" && actualRule === expectedRule;
    } else if (expectedDecision === "inject") {
      pass = actualDecision === "inject" && actualRule === expectedRule;
    }

    results.push({
      id: c.id,
      expected: expectedDecision,
      actual: actualDecision,
      rule_expected: expectedRule,
      rule_actual: actualRule,
      pass,
    });
  }

  return results;
}

// CLI Execution if invoked directly
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  let runtime = "claude-code";
  let target = "repo";
  let json = false;
  let allowPending = false;
  let home = os.homedir();
  let mockMismatch = false;

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runtime" && i + 1 < argv.length) runtime = argv[++i];
    else if (a.startsWith("--runtime=")) runtime = a.slice("--runtime=".length);
    else if (a === "--target" && i + 1 < argv.length) target = argv[++i];
    else if (a.startsWith("--target=")) target = a.slice("--target=".length);
    else if (a === "--home" && i + 1 < argv.length) home = argv[++i];
    else if (a.startsWith("--home=")) home = a.slice("--home=".length);
    else if (a === "--json") json = true;
    else if (a === "--allow-pending") allowPending = true;
    else if (a === "--mock-mismatch") mockMismatch = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Uso: node scripts/qa-harness-canary.mjs [opciones]
Opciones:
  --runtime claude-code|antigravity  Runtime objetivo (default: claude-code)
  --target repo|installed            Guard de repo o dispatchers instalados (default: repo)
  --json                             Salida en formato JSON
  --allow-pending                    Permite reglas marcadas como pendientes
  --home <dir>                       Directorio HOME alternativo (para tests)
  -h, --help                         Muestra esta ayuda`);
      process.exit(0);
    }
  }

  const results = runCanarySuite({ runtime, target, home, allowPending, mockMismatch });

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.log(`\n=== QA HARNESS CANARY [runtime: ${runtime}, target: ${target}] ===\n`);
    console.log(
      "ID".padEnd(6) +
      "Expected".padEnd(12) +
      "Actual".padEnd(14) +
      "Rule Expected".padEnd(25) +
      "Rule Actual".padEnd(25) +
      "Pass"
    );
    console.log("-".repeat(88));
    for (const r of results) {
      console.log(
        r.id.padEnd(6) +
        r.expected.padEnd(12) +
        r.actual.padEnd(14) +
        r.rule_expected.padEnd(25) +
        r.rule_actual.padEnd(25) +
        (r.pass ? "OK" : "FAIL")
      );
    }
    const passed = results.filter((r) => r.pass).length;
    const failed = results.filter((r) => !r.pass).length;
    console.log("\n" + "-".repeat(88));
    console.log(`Total: ${results.length} | Pasaron: ${passed} | Fallaron: ${failed}\n`);
  }

  const allPassed = results.every((r) => r.pass);
  process.exit(allPassed ? 0 : 1);
}
