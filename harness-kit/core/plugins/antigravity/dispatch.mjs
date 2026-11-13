#!/usr/bin/env node
// Antigravity (agy) user-level hook, loaded from ~/.gemini/config/hooks.json: agy only finds the project
// .agents/hooks.json walking up from its cwd, and Multica starts it in <workdir>/, above the repo (GOZS-513).
// Runs the guard of the repo a tool call touches with node (no bash: under cmd /c the first bash on PATH can be WSL).
// Installed by install.mjs into ~/.claude/hooks/ next to the shared kit, which it keeps equal to origin/main.
// Contract: core/runtimes/antigravity.json (stdout {"decision"}, exit 0). Fail-open only on its own internal errors.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ALLOW = JSON.stringify({ decision: "allow" }) + "\n";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoShared = path.join(here, "..", "shared", "kit.mjs");
const installedKit = existsSync(repoShared) ? "" : path.join(here, "harness-kit");
// A concurrent sync swaps the installed kit with two renames: wait out that instant.
for (let i = 0; installedKit && i < 50 && !existsSync(installedKit); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
const { GUARD, resolveRepo, syncKit } = await import(
  pathToFileURL(installedKit ? path.join(installedKit, "core", "plugins", "shared", "kit.mjs") : repoShared).href
);

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stdout.write(ALLOW);
    process.exit(0);
  }
  const args = payload?.toolCall?.args || {};
  // The hook cwd is ~/.gemini/config: the session directory is workspacePaths[0].
  const repo = resolveRepo(args.Cwd || payload?.workspacePaths?.[0], [args.AbsolutePath, args.Path, args.TargetFile]);
  if (!repo) {
    process.stdout.write(ALLOW);
    process.exit(0);
  }
  if (installedKit) syncKit(repo, here);
  const installed = installedKit ? path.join(here, GUARD) : "";
  const guard = installed && existsSync(installed) ? installed : path.join(repo, GUARD);

  const res = spawnSync(process.execPath, [guard, "--runtime", "antigravity"], { cwd: repo, input: raw, encoding: "utf8" });
  if (res.error || res.status !== 0 || !res.stdout) {
    process.stdout.write(ALLOW);
    process.exit(0);
  }
  process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  process.exit(0);
});
