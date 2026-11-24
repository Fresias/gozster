#!/usr/bin/env node
// Validate UTF-8 (no BOM, no U+FFFD), post a Multica issue comment via --content-file, optionally update status, and clean up.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_CLI_ATTEMPTS = 2;

export function printHelp() {
  return [
    "multica-post — Validate UTF-8 (no BOM / no U+FFFD), post comment, optionally change status, and delete temp file",
    "",
    "Usage:",
    "  node harness-kit/adapters/multica/scripts/multica-post.mjs <ISSUE> --file <path> [--parent <id>] [--status <status>] [--keep] [--json]",
    "",
    "Options:",
    "  --file <path>          UTF-8 file (without BOM or U+FFFD) containing the comment body (required)",
    "  --parent <id>          Parent comment ID when replying inside an existing thread",
    "  --status <status>      Optional issue status to set after posting (e.g. in_review, in_progress, blocked)",
    "  --keep                 Keep the comment file on disk after a successful post (default: delete on success)",
    "  --allow-external-file  Forward --allow-external-file to multica issue comment add",
    "  --json                 Print compact JSON summary to stdout",
    "  -h, --help             Show this help message",
  ].join("\n");
}

export function resolveMulticaCli(env = process.env) {
  const configured = typeof env.MULTICA_CLI_PATH === "string" ? env.MULTICA_CLI_PATH.trim() : "";
  return configured || "multica";
}

export function parseArgs(argv) {
  const opts = {
    help: false,
    issue: null,
    file: null,
    parent: null,
    status: null,
    keep: false,
    allowExternalFile: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else if (arg === "--keep") {
      opts.keep = true;
    } else if (arg === "--allow-external-file") {
      opts.allowExternalFile = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--file") {
      opts.file = argv[++i] ?? null;
    } else if (arg.startsWith("--file=")) {
      opts.file = arg.slice("--file=".length);
    } else if (arg === "--parent") {
      opts.parent = argv[++i] ?? null;
    } else if (arg.startsWith("--parent=")) {
      opts.parent = arg.slice("--parent=".length);
    } else if (arg === "--status") {
      opts.status = argv[++i] ?? null;
    } else if (arg.startsWith("--status=")) {
      opts.status = arg.slice("--status=".length);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!opts.issue) {
      opts.issue = arg;
    } else {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }

  return opts;
}

export function validateCommentFile(filePath) {
  if (!filePath || !existsSync(filePath)) {
    throw new Error(`Comment file does not exist: ${filePath || "(empty)"}`);
  }
  const stat = statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Comment path is not a regular file: ${filePath}`);
  }

  const buf = readFileSync(filePath);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    throw new Error(`File "${filePath}" contains a UTF-8 BOM (EF BB BF). Re-save as UTF-8 without BOM before posting.`);
  }
  if (
    buf.length >= 2 &&
    ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))
  ) {
    throw new Error(`File "${filePath}" contains a UTF-16 BOM. Re-save as UTF-8 without BOM before posting.`);
  }

  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    throw new Error(`File "${filePath}" is not valid UTF-8. Re-save as UTF-8 without BOM before posting.`);
  }

  if (decoded.includes("\uFFFD")) {
    throw new Error(`File "${filePath}" contains Unicode replacement character (U+FFFD), indicating encoding corruption.`);
  }

  if (decoded.trim().length === 0) {
    throw new Error(`File "${filePath}" is empty.`);
  }

  return decoded;
}

function summarizeError(err) {
  const stderr = typeof err?.stderr === "string"
    ? err.stderr
    : Buffer.isBuffer(err?.stderr)
      ? err.stderr.toString("utf8")
      : "";
  const raw = stderr.trim() || (typeof err?.message === "string" ? err.message.trim() : String(err));
  const firstLines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 4).join(" | ");
  return firstLines.slice(0, 320) || "unknown CLI error";
}

function invokeBinary(execFileSyncFn, cliPath, args, cwd, env) {
  const lower = cliPath.toLowerCase();
  const baseOpts = {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  };
  if (lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".js")) {
    return execFileSyncFn(process.execPath, [cliPath, ...args], baseOpts);
  }
  if (process.platform === "win32" && (lower.endsWith(".cmd") || lower.endsWith(".bat"))) {
    return execFileSyncFn(cliPath, args, { ...baseOpts, shell: true });
  }
  return execFileSyncFn(cliPath, args, baseOpts);
}

export function runCli(args, deps = {}) {
  const env = deps.env ?? process.env;
  const cwd = deps.cwd ?? process.cwd();
  const execFileSyncFn = deps.execFileSyncFn ?? execFileSync;
  const cliPath = deps.cliPath ?? resolveMulticaCli(env);
  const maxAttempts = Math.min(MAX_CLI_ATTEMPTS, Number(deps.maxAttempts) || MAX_CLI_ATTEMPTS);

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const stdout = invokeBinary(execFileSyncFn, cliPath, args, cwd, env);
      return typeof stdout === "string" ? stdout : String(stdout ?? "");
    } catch (err) {
      lastErr = err;
    }
  }

  const exitCode = typeof lastErr?.status === "number" && lastErr.status !== 0 ? lastErr.status : 1;
  const wrapped = new Error(`multica ${args.slice(0, 3).join(" ")} failed after ${maxAttempts} attempts: ${summarizeError(lastErr)}`);
  wrapped.exitCode = exitCode;
  throw wrapped;
}

function extractCommentId(rawStdout) {
  const trimmed = String(rawStdout ?? "").trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    const id = parsed?.id ?? parsed?.comment?.id ?? parsed?.data?.id;
    if (id) return String(id);
  } catch {
    const match = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (match) return match[0];
  }
  return "";
}

export function main(argv = process.argv.slice(2), deps = {}) {
  const opts = parseArgs(argv);
  if (opts.help) {
    return { code: 0, stdout: printHelp(), stderr: "" };
  }

  if (!opts.issue) {
    return { code: 1, stdout: "", stderr: "Error: missing <ISSUE> argument. Run with --help." };
  }
  if (!opts.file) {
    return { code: 1, stdout: "", stderr: "Error: missing required --file <path> option. Run with --help." };
  }

  const cwd = deps.cwd ?? process.cwd();
  const resolvedFile = path.isAbsolute(opts.file) ? opts.file : path.resolve(cwd, opts.file);

  // Step 1: validate UTF-8 without BOM or U+FFFD before invoking the CLI.
  validateCommentFile(resolvedFile);

  // Step 2: post comment with --content-file.
  const commentArgs = ["issue", "comment", "add", opts.issue, "--content-file", opts.file, "--output", "json"];
  if (opts.parent) commentArgs.push("--parent", opts.parent);
  if (opts.allowExternalFile) commentArgs.push("--allow-external-file");

  const commentOut = runCli(commentArgs, deps);
  const commentId = extractCommentId(commentOut);
  if (!commentId) {
    const err = new Error("Comment post succeeded without returning a comment ID; keeping local file.");
    err.exitCode = 1;
    throw err;
  }

  // Step 3: optionally update issue status in the same invocation.
  if (opts.status) {
    runCli(["issue", "status", opts.issue, opts.status], deps);
  }

  // Step 4: delete temp file only when all steps succeeded (unless --keep).
  let fileDeleted = false;
  if (!opts.keep) {
    unlinkSync(resolvedFile);
    fileDeleted = true;
  }

  if (opts.json) {
    return {
      code: 0,
      stdout: JSON.stringify({
        ok: true,
        issue: opts.issue,
        comment_id: commentId,
        status: opts.status ?? null,
        file_deleted: fileDeleted,
      }),
      stderr: "",
    };
  }

  const parts = [`comment_id: ${commentId}`];
  if (opts.status) parts.push(`status: ${opts.status}`);
  parts.push(`file: ${fileDeleted ? "deleted" : "kept"}`);
  return { code: 0, stdout: parts.join(" | "), stderr: "" };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    const res = main(process.argv.slice(2));
    if (res.stdout) process.stdout.write(res.stdout + "\n");
    if (res.stderr) process.stderr.write(res.stderr + "\n");
    process.exit(res.code);
  } catch (err) {
    const code = typeof err?.exitCode === "number" && err.exitCode !== 0 ? err.exitCode : 1;
    process.stderr.write(`Error: ${err?.message ?? String(err)}\n`);
    process.exit(code);
  }
}
