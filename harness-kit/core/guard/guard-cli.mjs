#!/usr/bin/env node
/**
 * guard-cli.mjs
 * CLI entry point for harness guard. Reads hook payload from stdin,
 * evaluates rules via guard-core.mjs, and prints the runtime-specific response.
 */

import { evaluateRules, findRepoRoot } from "./guard-core.mjs";
import { normalize } from "./normalize.mjs";

let runtime = "";
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--runtime" && i + 1 < args.length) {
    runtime = args[++i];
  } else if (args[i].startsWith("--runtime=")) {
    runtime = args[i].slice("--runtime=".length);
  }
}

let input = "";
process.stdin.setEncoding("utf8");

process.stdin.on("data", (chunk) => {
  input += chunk;
});

process.stdin.on("end", () => {
  let payload = null;
  const trimmed = input.trim();
  if (trimmed) {
    try {
      payload = JSON.parse(trimmed);
    } catch {
      // Invalid JSON input, allow or fail safe
      payload = null;
    }
  }

  const normalized = normalize(payload, { runtime });
  const repoRoot = findRepoRoot();
  const result = evaluateRules(normalized, { repoRoot, runtime: normalized.runtime });

  const effectiveRuntime = normalized.runtime;

  if (effectiveRuntime === "antigravity") {
    if (result.allowed) {
      process.stdout.write(JSON.stringify({ decision: "allow" }) + "\n");
      process.exit(0);
    } else {
      const reason = `Blocked by .claude/hooks/guard.sh: ${result.reason}`;
      process.stdout.write(JSON.stringify({ decision: "deny", reason }) + "\n");
      process.exit(0);
    }
  } else {
    if (result.allowed) {
      process.stdout.write("{}\n");
      process.exit(0);
    } else {
      const reason = `Blocked by .claude/hooks/guard.sh: ${result.reason}`;
      process.stderr.write(reason + "\n");
      process.exit(2);
    }
  }
});
