#!/usr/bin/env node
// Notifies Multica webhook on lesson debt threshold (>=8).
//
// Usage:
//   node harness-kit/core/scripts/harness-debt-notify.mjs [--workdir <dir>] [--prev-ref <ref>] [--threshold <n>] [--json]

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateDebt } from "./harness-propose.mjs";

const DEFAULT_THRESHOLD = 8;
const OK_WEBHOOK_STATUSES = new Set(["accepted", "duplicate", "ignored", "skipped"]);

function parseArgs(args) {
  const opts = {
    workdir: process.cwd(),
    prevRef: "HEAD^",
    prevWorkdir: "",
    threshold: DEFAULT_THRESHOLD,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--workdir" || a === "-w") opts.workdir = path.resolve(args[++i]);
    else if (a === "--prev-ref") opts.prevRef = args[++i];
    else if (a === "--prev-workdir") opts.prevWorkdir = path.resolve(args[++i]);
    else if (a === "--threshold") opts.threshold = parseInt(args[++i], 10);
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") {
      process.stdout.write(`harness-debt-notify — Lesson Debt Threshold Notifier (Harness²)

Options:
  --workdir, -w <dir>     Repository root directory (default: cwd)
  --prev-ref <git-ref>    Previous git commit ref to compare against (default: HEAD^)
  --prev-workdir <dir>    Explicit previous harness directory (skips git archive)
  --threshold <n>         Notification threshold (default: 8)
  --json                  Output structured JSON result to stdout
`);
      process.exit(0);
    }
  }

  return opts;
}

/** Replaces any occurrence of secret in text with [REDACTED] */
export function sanitizeMessage(text, secret) {
  const str = String(text ?? "");
  if (!secret) return str;
  return str.split(secret).join("[REDACTED]");
}

/** Resolves commit SHA from GITHUB_SHA or git rev-parse HEAD */
export function getGitHeadSha(workdir, env = process.env) {
  if (env.GITHUB_SHA && env.GITHUB_SHA.trim()) {
    return env.GITHUB_SHA.trim();
  }
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: workdir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "unknown";
  }
}

/** Builds GitHub Actions run URL from environment variables */
export function getGitHubRunUrl(env = process.env) {
  const server = env.GITHUB_SERVER_URL?.trim();
  const repo = env.GITHUB_REPOSITORY?.trim();
  const runId = env.GITHUB_RUN_ID?.trim();
  if (server && repo && runId) {
    return `${server}/${repo}/actions/runs/${runId}`;
  }
  return "";
}

/** Extracts harness/ from prevRef into a temporary directory using git archive (no git worktree) */
export function extractPrevHarnessDir(workdir, prevRef = "HEAD^") {
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", `${prevRef}^{commit}`], {
      cwd: workdir,
      stdio: "ignore",
    });
    execFileSync("git", ["cat-file", "-e", `${prevRef}:harness`], {
      cwd: workdir,
      stdio: "ignore",
    });
  } catch {
    return null;
  }

  const tmpDir = mkdtempSync(path.join(tmpdir(), "harness-debt-prev-"));
  try {
    const tarBuf = execFileSync("git", ["archive", "--format=tar", prevRef, "harness"], {
      cwd: workdir,
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    execFileSync("tar", ["-xf", "-", "-C", tmpDir], {
      input: tarBuf,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return tmpDir;
  } catch {
    rmSync(tmpDir, { recursive: true, force: true });
    return null;
  }
}

/** Computes previous commit unprocessed lesson count without mutating workdir */
export function getPreviousDebtCount(workdir, { prevWorkdir = "", prevRef = "HEAD^" } = {}) {
  if (prevWorkdir) {
    return calculateDebt(prevWorkdir).unprocessed;
  }
  const extractedDir = extractPrevHarnessDir(workdir, prevRef);
  if (!extractedDir) {
    return 0;
  }
  try {
    if (!existsSync(path.join(extractedDir, "harness"))) {
      return 0;
    }
    return calculateDebt(extractedDir).unprocessed;
  } finally {
    rmSync(extractedDir, { recursive: true, force: true });
  }
}

/** Checks threshold crossing (P < threshold <= N) and sends autopilot webhook once */
export async function evaluateAndNotifyDebt({
  workdir,
  prevWorkdir = "",
  prevRef = "HEAD^",
  threshold = DEFAULT_THRESHOLD,
  webhookUrl = process.env.MULTICA_LESSON_DEBT_WEBHOOK_URL,
  commitSha,
  runUrl,
  env = process.env,
  fetchImpl = globalThis.fetch,
  log = (msg) => process.stdout.write(msg),
  warn = (msg) => process.stdout.write(msg),
}) {
  const currentDebt = calculateDebt(workdir);
  const currentCount = currentDebt.unprocessed;
  const prevCount = getPreviousDebtCount(workdir, { prevWorkdir, prevRef });
  const crossed = prevCount < threshold && currentCount >= threshold;

  if (!crossed) {
    log(
      `[harness-debt-notify] Deuda actual: ${currentCount}, previa: ${prevCount} (umbral: ${threshold}). Sin notificación.\n`
    );
    return {
      notified: false,
      crossed: false,
      reason: "threshold_not_crossed",
      prevCount,
      currentCount,
      httpStatus: null,
      deliveryStatus: null,
    };
  }

  const trimmedUrl = typeof webhookUrl === "string" ? webhookUrl.trim() : "";
  if (!trimmedUrl) {
    warn("::warning title=Harness debt::falta MULTICA_LESSON_DEBT_WEBHOOK_URL\n");
    return {
      notified: false,
      crossed: true,
      reason: "missing_secret",
      prevCount,
      currentCount,
      httpStatus: null,
      deliveryStatus: null,
    };
  }

  const sha = commitSha || getGitHeadSha(workdir, env);
  const resolvedRunUrl = runUrl !== undefined ? runUrl : getGitHubRunUrl(env);
  const tasks = (currentDebt.unanalyzedTasks || []).filter(Boolean);
  const payload = {
    event: "harness.lesson_debt.threshold",
    threshold,
    unprocessed: currentCount,
    tasks,
    commit: sha,
    run_url: resolvedRunUrl,
  };

  let res;
  try {
    res = await fetchImpl(trimmedUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `lesson-debt-${threshold}-${sha}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const safeErr = sanitizeMessage(err?.message || String(err), trimmedUrl);
    warn(`::warning title=Harness debt::Error al enviar webhook (${safeErr})\n`);
    return {
      notified: false,
      crossed: true,
      reason: "network_error",
      prevCount,
      currentCount,
      httpStatus: null,
      deliveryStatus: null,
    };
  }

  let parsed = null;
  try {
    const text = await res.text();
    if (text && text.trim()) {
      parsed = JSON.parse(text);
    }
  } catch {
    parsed = null;
  }

  if (res.status === 200) {
    const rawStatus = typeof parsed?.status === "string" ? parsed.status.trim() : "";
    if (rawStatus && !OK_WEBHOOK_STATUSES.has(rawStatus)) {
      warn(
        `::warning title=Harness debt::Respuesta inesperada del webhook (HTTP 200, status=${sanitizeMessage(rawStatus, trimmedUrl)})\n`
      );
      return {
        notified: true,
        crossed: true,
        reason: "unexpected_status",
        prevCount,
        currentCount,
        httpStatus: 200,
        deliveryStatus: rawStatus,
      };
    }

    const deliveryStatus = rawStatus || "accepted";
    log(
      `[harness-debt-notify] Webhook notificado (HTTP 200, ${deliveryStatus}) al cruzar umbral ${threshold}: ${prevCount} -> ${currentCount}.\n`
    );
    return {
      notified: true,
      crossed: true,
      reason: "ok",
      prevCount,
      currentCount,
      httpStatus: 200,
      deliveryStatus,
    };
  }

  warn(
    `::warning title=Harness debt::Webhook respondió HTTP ${res.status} al cruzar umbral ${threshold} (${prevCount} -> ${currentCount})\n`
  );
  return {
    notified: false,
    crossed: true,
    reason: "http_error",
    prevCount,
    currentCount,
    httpStatus: res.status,
    deliveryStatus: null,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = await evaluateAndNotifyDebt({
    workdir: opts.workdir,
    prevWorkdir: opts.prevWorkdir,
    prevRef: opts.prevRef,
    threshold: opts.threshold,
    log: opts.json ? () => {} : (msg) => process.stdout.write(msg),
    warn: (msg) => process.stdout.write(msg),
  });

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
