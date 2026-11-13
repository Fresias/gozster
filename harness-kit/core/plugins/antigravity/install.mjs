#!/usr/bin/env node
// Installs the user-level guard for Antigravity (idempotent).
//
// Usage: node harness-kit/core/plugins/antigravity/install.mjs [--home <dir>] [--check]
//   - copies dispatch.mjs to <home>/.claude/hooks/harness-dispatch-antigravity.mjs, next to the kit shared with
//     the Claude Code dispatcher (<home>/.claude/hooks/harness-kit/, kept equal to origin/main by shared/kit.mjs)
//   - adds the "harness-kit-user-guard" PreToolUse hook to <home>/.gemini/config/hooks.json (agy's global
//     customization root). Its name differs from the project hook, so the workspace one never overrides it.
//   - --check: exit 1 if not installed or out of date (no writes)
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installLocal, isInstalled } from "../shared/kit.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const home = args.includes("--home") ? args[args.indexOf("--home") + 1] : os.homedir();
const check = args.includes("--check");

const NAME = "harness-kit-user-guard";
const kitDir = path.resolve(here, "..", "..", "..");
const hooksDir = path.join(home, ".claude", "hooks");
const target = path.join(hooksDir, "harness-dispatch-antigravity.mjs");
const hooksPath = path.join(home, ".gemini", "config", "hooks.json");
// node, not bash: agy runs hooks with `cmd /c` on Windows, where the first bash on PATH can be WSL.
const command = `node "${target.replace(/\\/g, "/")}"`;
const { tools } = JSON.parse(readFileSync(path.join(kitDir, "core", "runtimes", "antigravity.json"), "utf8"));
const matcher = ["shell", "read", "write"].flatMap((k) => tools[k] ?? []).map((t) => t.name).join("|");
const entry = { enabled: true, PreToolUse: [{ matcher, hooks: [{ type: "command", command, timeout: 10 }] }] };

const hooks = existsSync(hooksPath) ? JSON.parse(readFileSync(hooksPath, "utf8")) : {};
const hookOk = JSON.stringify(hooks[NAME]) === JSON.stringify(entry);

if (check) {
  const ok = hookOk && isInstalled(hooksDir, kitDir, "harness-dispatch-antigravity.mjs");
  process.stdout.write(
    ok ? "antigravity user guard: installed\n" : "antigravity user guard: MISSING or differs from this checkout (run install.mjs from main)\n",
  );
  process.exit(ok ? 0 : 1);
}

mkdirSync(hooksDir, { recursive: true });
const kitChanged = installLocal(hooksDir, kitDir, "harness-dispatch-antigravity.mjs");
if (!hookOk) {
  mkdirSync(path.dirname(hooksPath), { recursive: true });
  if (existsSync(hooksPath)) copyFileSync(hooksPath, `${hooksPath}.bak-harness`);
  writeFileSync(hooksPath, JSON.stringify({ ...hooks, [NAME]: entry }, null, 2) + "\n", "utf8");
}
process.stdout.write(`antigravity user guard: ${!hookOk || kitChanged ? "installed" : "already installed"} (${hooksPath})\n`);
