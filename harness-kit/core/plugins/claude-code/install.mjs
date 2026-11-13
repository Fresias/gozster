#!/usr/bin/env node
// Installs the user-level guard dispatcher for Claude Code (idempotent).
//
// Usage: node harness-kit/core/plugins/claude-code/install.mjs [--home <dir>] [--check]
//   - copies dispatch.mjs to <home>/.claude/hooks/harness-dispatch.mjs and the kit (core + adapters) to
//     <home>/.claude/hooks/harness-kit/: the dispatcher runs THAT guard and then keeps it equal to origin/main
//     on its own (shared/kit.mjs syncKit), so run install.mjs from main once
//   - adds PreToolUse/PostToolUse hooks (Bash|PowerShell|Read|Write|Edit|NotebookEdit) to <home>/.claude/settings.json
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

const hooksDir = path.join(home, ".claude", "hooks");
const target = path.join(hooksDir, "harness-dispatch.mjs");
const settingsPath = path.join(home, ".claude", "settings.json");
const command = `node "${target.replace(/\\/g, "/")}"`;
const MATCHERS = {
  PreToolUse: "Bash|PowerShell|Read|Write|Edit|NotebookEdit",
  PostToolUse: "Bash|PowerShell|Write|Edit|NotebookEdit",
};

const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
const kitDir = path.resolve(here, "..", "..", "..");

function installed(event) {
  return (settings.hooks?.[event] || []).some(
    (h) => h.matcher === MATCHERS[event] && (h.hooks || []).some((x) => x.command === command),
  );
}

if (check) {
  const ok = isInstalled(hooksDir, kitDir, "harness-dispatch.mjs") && installed("PreToolUse") && installed("PostToolUse");
  process.stdout.write(
    ok ? "claude-code user guard: installed\n" : "claude-code user guard: MISSING or differs from this checkout (run install.mjs from main)\n",
  );
  process.exit(ok ? 0 : 1);
}

mkdirSync(hooksDir, { recursive: true });
const kitChanged = installLocal(hooksDir, kitDir, "harness-dispatch.mjs");

let changed = false;
settings.hooks = settings.hooks || {};
for (const event of Object.keys(MATCHERS)) {
  const list = (settings.hooks[event] = settings.hooks[event] || []);
  // Drop stale dispatcher entries (old matcher), keep every unrelated hook.
  const kept = list.filter((h) => !(h.hooks || []).some((x) => String(x.command).includes("harness-dispatch.mjs")) || h.matcher === MATCHERS[event]);
  if (kept.length !== list.length) changed = true;
  settings.hooks[event] = kept;
  if (!installed(event)) {
    kept.push({ matcher: MATCHERS[event], hooks: [{ type: "command", command }] });
    changed = true;
  }
}
if (changed) {
  if (existsSync(settingsPath)) copyFileSync(settingsPath, `${settingsPath}.bak-harness`);
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}
process.stdout.write(`claude-code user guard: ${changed || kitChanged ? "installed" : "already installed"} (${target})\n`);
