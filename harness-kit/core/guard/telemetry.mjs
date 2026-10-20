/**
 * telemetry.mjs
 * Deterministic, privacy-safe guard telemetry. Emits one event per guard
 * invocation to .harness/telemetry/events.jsonl. No PII, no secrets:
 * `sk-…` and `eyJ…` tokens are redacted and `cmd` is truncated to 120 chars.
 * Writes are best-effort and never throw into the guard hot path.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const CMD_MAX = 120;

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
  // OpenAI-style keys: sk-<20+ token chars>
  s = s.replace(/sk-[A-Za-z0-9_-]{16,}/g, "sk-[REDACTED]");
  // JWT / Supabase keys: eyJ<base64url header>.<...>
  s = s.replace(/eyJ[A-Za-z0-9_\-.]{10,}/g, "eyJ[REDACTED]");
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
    cmd: redactCmd(normalized?.command || normalized?.targetPath || normalized?.filePath || ""),
  };
}

/**
 * Append a telemetry event for a guard invocation. Only pre-phase calls are
 * recorded (one per tool call), which carries every allow/block decision and
 * write without double-counting the post-phase pass. Best-effort: any failure
 * is swallowed so telemetry can never break the guard.
 * @param {object} normalized
 * @param {object} result
 * @param {{ repoRoot?: string, dir?: string, now?: Date }} [options]
 */
export function recordEvent(normalized, result, options = {}) {
  try {
    if (process.env.HARNESS_TELEMETRY === "0") return;
    if (normalized?.phase && normalized.phase !== "pre") return;

    const dir =
      options.dir ||
      process.env.HARNESS_TELEMETRY_DIR ||
      path.join(options.repoRoot || process.cwd(), ".harness", "telemetry");

    mkdirSync(dir, { recursive: true });
    const event = buildEvent(normalized, result, options.now);
    appendFileSync(path.join(dir, "events.jsonl"), JSON.stringify(event) + "\n");
  } catch {
    // Telemetry is best-effort; never surface errors into the guard.
  }
}
