#!/usr/bin/env node
// Claude Code user-level hook: runs the guard of the harness repo a tool call touches, also when the
// session starts outside the repo (Multica: <workdir>/<repo>/), where .claude/settings.json is never loaded.
// Installed by install.mjs into ~/.claude/hooks/ next to the kit it runs, which it keeps equal to origin/main.
// Fail-open only on its own internal errors.
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Installed: ~/.claude/hooks/harness-dispatch.mjs + ~/.claude/hooks/harness-kit/. In a checkout: the kit's own copy.
const repoShared = path.join(here, "..", "shared", "kit.mjs");
const installedKit = existsSync(repoShared) ? "" : path.join(here, "harness-kit");
// A concurrent sync swaps the installed kit with two renames: wait out that instant.
for (let i = 0; installedKit && i < 50 && !existsSync(installedKit); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
const { GUARD, resolveRepo, syncKit } = await import(
  pathToFileURL(installedKit ? path.join(installedKit, "core", "plugins", "shared", "kit.mjs") : repoShared).href
);

function same(a, b) {
  try {
    return realpathSync(a).toLowerCase() === realpathSync(b).toLowerCase();
  } catch {
    return false;
  }
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }
  const input = payload?.tool_input || {};
  const repo = resolveRepo(payload?.cwd, [input.file_path, input.notebook_path, input.path]);
  if (!repo) process.exit(0);
  // Prefer the installed kit, synced from origin/main (never from the working branch): a stale or edited guard
  // on the agent's branch must not weaken the rules.
  if (installedKit) syncKit(repo, here);
  const installed = installedKit ? path.join(here, GUARD) : "";
  const guard = installed && existsSync(installed) ? installed : path.join(repo, GUARD);
  // Without an installed kit, the project hook already runs when the session was opened inside the repo.
  const projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (guard !== installed && projectDir && same(projectDir, repo) && existsSync(path.join(repo, ".claude", "settings.json"))) process.exit(0);

  const res = spawnSync(process.execPath, [guard, "--runtime", "claude-code"], {
    cwd: repo,
    input: raw,
    encoding: "utf8",
  });
  if (res.error || res.status === null) process.exit(0);
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  process.exit(res.status);
});
