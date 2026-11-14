/**
 * telemetry.mjs
 * Deterministic, privacy-safe guard telemetry. Emits one event per guard
 * invocation to <git common dir>/harness/telemetry/events.jsonl, shared by every
 * worktree of the same clone. No PII, no secrets:
 * `sk-…` and `eyJ…` tokens are redacted and `cmd` is truncated to 120 chars.
 * Writes are best-effort and never throw into the guard hot path.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const CMD_MAX = 120;

/**
 * Strips ANSI escape sequences (colors, styles, cursor codes) from text.
 * @param {string} raw
 * @returns {string}
 */
export function stripAnsi(raw) {
  return String(raw || "").replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

/**
 * Redact secrets from text:
 * - OpenAI-style keys: sk-...
 * - JWT / Supabase keys: eyJ...
 * - GitHub classic and fine-grained tokens: gh[pousr]_... and github_pat_...
 * - URL credentials: ://user:secret@host -> ://[REDACTED]@host
 * - Authorization headers: Authorization: (token|Bearer|Basic) <value> -> Authorization: <type> [REDACTED]
 * @param {string} raw
 * @returns {string}
 */
export function redactSecrets(raw) {
  let s = String(raw || "");
  // URL credentials: ://usuario:secreto@ -> ://[REDACTED]@
  s = s.replace(/:\/\/[^/\s:@]+:[^/\s@]+@/g, "://[REDACTED]@");
  // Authorization headers: Authorization: (token|Bearer|Basic) <valor> -> Authorization: <tipo> [REDACTED]
  s = s.replace(/(Authorization:\s*(?:token|Bearer|Basic))\s+[^\s"'\\]+/gi, "$1 [REDACTED]");
  // GitHub classic and fine-grained tokens
  s = s.replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "gh*_[REDACTED]");
  s = s.replace(/github_pat_[A-Za-z0-9_]{20,}/g, "github_pat_[REDACTED]");
  // OpenAI-style keys: sk-<16+ token chars>
  s = s.replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-[REDACTED]");
  // JWT / Supabase keys: eyJ<base64url header>.<...>
  s = s.replace(/eyJ[A-Za-z0-9_\-.]{10,}/g, "eyJ[REDACTED]");
  return s;
}

/**
 * Sanitizes command outputs and probe previews:
 * 1. Strips ANSI escape codes.
 * 2. Redacts tokens, keys, credentials, and authorization headers.
 * 3. Enmascara rutas absolutas locales preservando las rutas relativas al repo y el diagnóstico.
 * @param {string} raw
 * @param {string} [repoDir]
 * @returns {string}
 */
export function sanitizePreview(raw, repoDir = "") {
  let s = stripAnsi(raw);
  s = redactSecrets(s);

  if (repoDir) {
    const normFwd = repoDir.replace(/\\/g, "/");
    const normBack = repoDir.replace(/\//g, "\\");
    const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(escape(normFwd) + "[/\\\\]?", "gi"), "[repo]/");
    s = s.replace(new RegExp(escape(normBack) + "[/\\\\]?", "gi"), "[repo]/");
  }

  // Mask common absolute home/user path prefixes while keeping repository/subpath and test info intact
  s = s.replace(/(?:[A-Za-z]:)?[\/\\]Users[\/\\][^\/\s"':;<>]+[\/\\]/gi, "[USER_HOME]/");
  s = s.replace(/\/home\/[^\/\s"':;<>]+[\/\\]/gi, "[USER_HOME]/");

  // Clean up any redundant slashes introduced by replacement
  s = s.replace(/\[repo\]\/[/\\\\]+/g, "[repo]/");
  s = s.replace(/\[USER_HOME\]\/[/\\\\]+/g, "[USER_HOME]/");

  return s;
}

/**
 * Redact secrets and bound the length of a command/path string.
 * Collapses whitespace first so each event stays a single JSONL line, then
 * redacts secrets, then truncates — so a secret near the tail is scrubbed
 * before the cut, never leaked by truncation.
 * @param {string} raw
 * @returns {string}
 */
export function redactCmd(raw) {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  s = redactSecrets(s);
  if (s.length > CMD_MAX) s = s.slice(0, CMD_MAX);
  return s;
}

/**
 * Resolve a stable session id from the raw hook payload across runtimes,
 * falling back to an env override or "unknown".
 * @param {object} raw
 * @returns {string}
 */
function resolveSession(raw) {
  const candidate =
    raw?.session_id ??
    raw?.sessionId ??
    raw?.session?.id ??
    raw?.input?.session_id ??
    process.env.HARNESS_SESSION_ID;
  return candidate ? String(candidate) : "unknown";
}

// Git common dir per repoRoot, resolved once per process (null when not a git repo).
const commonDirs = new Map();

/**
 * Resolve the telemetry directory: HARNESS_TELEMETRY_DIR, else
 * `$(git rev-parse --git-common-dir)/harness/telemetry` (shared by all worktrees
 * of a clone, survives worktree deletion), else <repoRoot>/.harness/telemetry.
 * @param {string} [repoRoot]
 * @returns {string}
 */
export function resolveTelemetryDir(repoRoot = process.cwd()) {
  if (process.env.HARNESS_TELEMETRY_DIR) return process.env.HARNESS_TELEMETRY_DIR;
  if (!commonDirs.has(repoRoot)) {
    let dir = null;
    try {
      const out = execFileSync("git", ["rev-parse", "--git-common-dir"], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2000,
      }).trim();
      if (out) dir = path.resolve(repoRoot, out);
    } catch {
      // Not a git repo (or git unavailable): use the in-repo fallback.
    }
    commonDirs.set(repoRoot, dir);
  }
  const commonDir = commonDirs.get(repoRoot);
  return commonDir
    ? path.join(commonDir, "harness", "telemetry")
    : path.join(repoRoot, ".harness", "telemetry");
}

/**
 * Build a telemetry event from a normalized call and the guard result.
 * @param {object} normalized Output of normalize()
 * @param {object} result Output of evaluateRules()
 * @param {Date} [now]
 * @returns {object}
 */
export function buildEvent(normalized, result, now = new Date()) {
  return {
    ts: now.toISOString(),
    session: resolveSession(normalized?.raw),
    runtime: normalized?.runtime || "",
    phase: normalized?.phase || "",
    kind: normalized?.kind || "",
    tool: normalized?.tool || "",
    decision: result?.allowed === false ? "block" : "allow",
    rule: result?.ruleId || null,
    inject: result?.inject === true,
    cmd: redactCmd(normalized?.command || normalized?.targetPath || normalized?.filePath || ""),
  };
}

/**
 * Append a telemetry event for a guard invocation. Pre-phase calls are always
 * recorded (one per tool call, every allow/block decision); post-phase calls
 * only when they inject context (e.g. GH007), so actions are not double-counted.
 * Best-effort: any failure is swallowed so telemetry can never break the guard.
 * @param {object} normalized
 * @param {object} result
 * @param {{ repoRoot?: string, dir?: string, now?: Date }} [options]
 */
export function recordEvent(normalized, result, options = {}) {
  try {
    if (process.env.HARNESS_TELEMETRY === "0") return;
    if (normalized?.phase && normalized.phase !== "pre" && result?.inject !== true) return;

    const dir = options.dir || resolveTelemetryDir(options.repoRoot || process.cwd());

    mkdirSync(dir, { recursive: true });
    const event = buildEvent(normalized, result, options.now);
    appendFileSync(path.join(dir, "events.jsonl"), JSON.stringify(event) + "\n");
  } catch {
    // Telemetry is best-effort; never surface errors into the guard.
  }
}
