#!/usr/bin/env node
// Antigravity (agy) user-level hook, loaded from ~/.gemini/config/hooks.json: agy only finds the project
// .agents/hooks.json walking up from its cwd, and Multica starts it in <workdir>/, above the repo (GOZS-513).
// Runs the guard of the repo a tool call touches with node (no bash: under cmd /c the first bash on PATH can be WSL).
// Installed by install.mjs into ~/.claude/hooks/ next to the shared kit, which it keeps equal to origin/main.
// Contract: core/runtimes/antigravity.json (stdout {"decision"}, exit 0). Fail-open only on its own internal errors.
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ALLOW = JSON.stringify({ decision: "allow" }) + "\n";
const POST_OK = "{}\n";
const cliArgs = process.argv.slice(2);
const cliPost =
  cliArgs.includes("--phase=post") ||
  (cliArgs.includes("--phase") && cliArgs[cliArgs.indexOf("--phase") + 1] === "post");
const here = path.dirname(fileURLToPath(import.meta.url));
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
    process.stdout.write(cliPost ? POST_OK : ALLOW);
    process.exit(0);
  }
  const isPost =
    cliPost ||
    payload?.hookEventName === "PostToolUse" ||
    (payload && Object.prototype.hasOwnProperty.call(payload, "error"));
  const args = payload?.toolCall?.args || {};
  // The hook cwd is ~/.gemini/config: the session directory is workspacePaths[0].
  const sessionDir = payload?.workspacePaths?.[0] || payload?.cwd || "";
  const repo = resolveRepo(args.Cwd || sessionDir, [args.AbsolutePath, args.Path, args.TargetFile]);
  if (!repo) {
    process.stdout.write(isPost ? POST_OK : ALLOW);
    process.exit(0);
  }
  if (installedKit) syncKit(repo, here);
  const installed = installedKit ? path.join(here, GUARD) : "";
  const guard = installed && existsSync(installed) ? installed : path.join(repo, GUARD);

  const hasProjectHooks = existsSync(path.join(repo, ".agents", "hooks.json"));
  const suppressTelemetry = Boolean(guard === installed && sessionDir && same(sessionDir, repo) && hasProjectHooks);

  const guardArgs = [guard, "--runtime", "antigravity"];
  if (isPost) guardArgs.push("--phase", "post");

  const res = spawnSync(process.execPath, guardArgs, {
    cwd: repo,
    input: raw,
    encoding: "utf8",
    env: suppressTelemetry ? { ...process.env, HARNESS_TELEMETRY: "0" } : process.env,
  });
  if (isPost) {
    // Antigravity PostToolUse must always return {} and never disrupt the tool call.
    process.stdout.write(POST_OK);
    process.exit(0);
  }
  if (res.error || res.status !== 0 || !res.stdout) {
    process.stdout.write(ALLOW);
    process.exit(0);
  }
  process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  process.exit(0);
});
