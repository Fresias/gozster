#!/usr/bin/env node
// Claude Code user-level hook: runs the guard of the harness repo a tool call touches, also when the
// session starts outside the repo (Multica: <workdir>/<repo>/), where .claude/settings.json is never loaded.
// Installed by install.mjs into ~/.claude/hooks/. Fail-open only on its own internal errors.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";

const GUARD = path.join("harness-kit", "core", "guard", "guard-cli.mjs");

function hasGuard(dir) {
  return existsSync(path.join(dir, GUARD));
}

/** Walk up from dir to the first ancestor that contains the harness guard. */
function upward(dir) {
  let cur = path.resolve(dir);
  for (;;) {
    if (hasGuard(cur)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return "";
    cur = parent;
  }
}

/** Single child repo with a guard (Multica workdir layout). */
function child(dir) {
  try {
    const found = readdirSync(dir, { withFileTypes: true })
      .filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith("."))
      .map((e) => path.join(dir, e.name))
      .filter(hasGuard);
    return found.length === 1 ? found[0] : "";
  } catch {
    return "";
  }
}

export function resolveRepo(payload) {
  const cwd = payload?.cwd || process.cwd();
  const input = payload?.tool_input || {};
  for (const p of [input.file_path, input.notebook_path, input.path]) {
    if (typeof p === "string" && p) {
      const hit = upward(path.dirname(path.resolve(cwd, p)));
      if (hit) return hit;
    }
  }
  return upward(cwd) || child(cwd);
}

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
  const repo = resolveRepo(payload);
  if (!repo) process.exit(0);
  // The project hook already runs when the session was opened inside the repo itself.
  const projectDir = process.env.CLAUDE_PROJECT_DIR || "";
  if (projectDir && same(projectDir, repo) && existsSync(path.join(repo, ".claude", "settings.json"))) process.exit(0);

  const res = spawnSync(process.execPath, [path.join(repo, GUARD), "--runtime", "claude-code"], {
    cwd: repo,
    input: raw,
    encoding: "utf8",
  });
  if (res.error || res.status === null) process.exit(0);
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  process.exit(res.status);
});
