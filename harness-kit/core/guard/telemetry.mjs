/**
 * telemetry.mjs
 * Deterministic, privacy-safe guard telemetry. Emits one event per guard
 * invocation to <git common dir>/harness/telemetry/events.jsonl, shared by every
 * worktree of the same clone. No PII, no secrets:
 * local paths are relativized (<repo>, <workdir>, ~), `sk-…`, `eyJ…`, GitHub
 * tokens and credentials are redacted, and `cmd` is bounded to 300 chars.
 * Writes are best-effort and never throw into the guard hot path.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const CMD_MAX = 300;

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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTrailingSep(p) {
  return String(p || "").replace(/[\\/]+$/, "");
}

function normalizeSlashes(p) {
  return stripTrailingSep(p).replace(/\\/g, "/");
}

function isRootPath(p) {
  return !p || p === "/" || /^[A-Za-z]:$/.test(p);
}

/**
 * Cross-platform parent directory extraction: normalizes `\` -> `/` before calling
 * `path.posix.dirname` so Windows-style paths resolve their parent identically on Linux/macOS.
 * @param {string} p
 * @returns {string}
 */
function parentDirCrossPlatform(p) {
  const norm = normalizeSlashes(p);
  if (!norm || isRootPath(norm)) return "";
  const parent = stripTrailingSep(path.posix.dirname(norm));
  if (!parent || parent === "." || parent === norm) return "";
  return parent;
}

/**
 * Build a case-insensitive regex matching an absolute path prefix regardless of
 * `\` or `/` separators (plus MSYS `/c/...` form for Windows drive paths).
 * @param {string} prefix
 * @returns {RegExp | null}
 */
function buildPrefixRegex(prefix) {
  const clean = stripTrailingSep(prefix);
  if (isRootPath(clean)) return null;
  const parts = clean.split(/[\\/]+/).filter(Boolean);
  if (parts.length === 0) return null;

  const isDrive = /^[A-Za-z]:$/.test(parts[0]);
  const isPosixAbs = clean.startsWith("/");
  let body;
  if (isDrive) {
    const driveLetter = parts[0][0];
    const rest = parts.slice(1).map(escapeRegex).join("[/\\\\]");
    const drivePat = `(?:${escapeRegex(driveLetter)}:|/${escapeRegex(driveLetter)})`;
    body = rest ? `${drivePat}[/\\\\]${rest}` : drivePat;
  } else {
    body = (isPosixAbs ? "/" : "") + parts.map(escapeRegex).join("[/\\\\]");
  }
  return new RegExp(`${body}(?=$|[/\\\\\\s"'\`;|&<>)\\]}:,])`, "gi");
}

/**
 * Relativize absolute local paths in telemetry text (case-insensitive, `\` or `/`):
 * - `repoRoot` -> `<repo>`
 * - `path.dirname(repoRoot)` (Multica workdir) -> `<workdir>`
 * - `os.homedir()` -> `~` (normalizing `~\` -> `~/`)
 * Runs BEFORE secret redaction and truncation.
 * @param {string} text
 * @param {string} [repoRoot]
 * @returns {string}
 */
export function relativizeForTelemetry(text, repoRoot = "") {
  let s = String(text || "");
  if (!s) return "";

  const cleanRepo = normalizeSlashes(repoRoot);
  const home = normalizeSlashes(os.homedir());
  const workdir = cleanRepo ? parentDirCrossPlatform(cleanRepo) : "";

  const replacements = [];
  if (cleanRepo && !isRootPath(cleanRepo)) {
    replacements.push({ prefix: cleanRepo, token: "<repo>" });
  }
  if (
    workdir &&
    !isRootPath(workdir) &&
    workdir.toLowerCase() !== cleanRepo.toLowerCase() &&
    workdir.toLowerCase() !== home.toLowerCase()
  ) {
    replacements.push({ prefix: workdir, token: "<workdir>" });
  }
  if (home && !isRootPath(home)) {
    replacements.push({ prefix: home, token: "~" });
  }

  // Apply longest prefixes first so <repo> wins over <workdir> and ~.
  replacements.sort((a, b) => b.prefix.length - a.prefix.length);

  for (const { prefix, token } of replacements) {
    const re = buildPrefixRegex(prefix);
    if (!re) continue;
    s = s.replace(re, token);
  }

  // Ensure home-relative paths use forward slash (~/...) without leaking username.
  s = s.replace(/~\\/g, "~/");

  return s;
}

/**
 * Relativize a file path (read/write/search):
 * - Inside `repoRoot`: relative path with `/` (e.g. `src/components/coach/coach-studio-view.tsx`).
 * - Outside `repoRoot`: apply `relativizeForTelemetry` and normalize separators to `/`.
 * @param {string} filePath
 * @param {string} [repoRoot]
 * @returns {string}
 */
function relativizeFilePath(filePath, repoRoot = "") {
  const raw = String(filePath || "").trim();
  if (!raw) return "";

  const normPath = raw.replace(/\\/g, "/");
  const cleanRepo = stripTrailingSep(repoRoot).replace(/\\/g, "/");

  if (cleanRepo) {
    const repoLower = cleanRepo.toLowerCase();
    const pathLower = normPath.toLowerCase();
    if (pathLower.startsWith(repoLower + "/")) {
      return normPath.slice(cleanRepo.length + 1);
    }
    if (pathLower === repoLower) {
      return "<repo>";
    }
  }

  return relativizeForTelemetry(raw, repoRoot).replace(/\\/g, "/");
}

/**
 * Relativize a working directory path (`cwd`) with `<repo>`, `<workdir>`, `~`
 * and forward slashes.
 * @param {string} cwd
 * @param {string} [repoRoot]
 * @returns {string}
 */
function relativizeCwd(cwd, repoRoot = "") {
  const raw = String(cwd || "").trim();
  if (!raw) return "";
  let out = relativizeForTelemetry(raw, repoRoot).replace(/\\/g, "/");
  if (out.length > 1 && out !== "~/") out = out.replace(/\/+$/, "");
  out = redactSecrets(out);
  if (out.length > CMD_MAX) out = out.slice(0, CMD_MAX);
  return out;
}

/**
 * Relativize paths, redact secrets, and bound the length of a command/path string.
 * Order is strictly: collapse whitespace -> relativize -> redactSecrets -> truncate
 * so a secret near the tail is always scrubbed before the cut, never leaked.
 * @param {string} raw
 * @param {string} [repoRoot]
 * @returns {string}
 */
export function redactCmd(raw, repoRoot = "") {
  let s = String(raw || "").replace(/\s+/g, " ").trim();
  s = relativizeForTelemetry(s, repoRoot);
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
export function resolveSession(raw) {
  const candidate =
    raw?.session_id ??
    raw?.sessionId ??
    raw?.conversationId ??
    raw?.session?.id ??
    raw?.input?.session_id ??
    raw?.input?.sessionID ??
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
 * Preserves existing fields and adds optional fidelity/post fields only when present.
 * @param {object} normalized Output of normalize()
 * @param {object} result Output of evaluateRules()
 * @param {Date | { now?: Date, repoRoot?: string }} [nowOrOptions]
 * @param {{ repoRoot?: string }} [maybeOptions]
 * @returns {object}
 */
export function buildEvent(normalized, result, nowOrOptions = new Date(), maybeOptions = {}) {
  let now = new Date();
  let repoRoot = "";
  if (nowOrOptions instanceof Date) {
    now = nowOrOptions;
    repoRoot = maybeOptions?.repoRoot || "";
  } else if (nowOrOptions && typeof nowOrOptions === "object") {
    now = nowOrOptions.now instanceof Date ? nowOrOptions.now : new Date();
    repoRoot = nowOrOptions.repoRoot || "";
  }

  const kind = normalized?.kind || "";
  let cmd = "";
  if (kind === "search") {
    const pat = redactSecrets(
      relativizeForTelemetry(String(normalized?.pattern || "").replace(/\s+/g, " ").trim(), repoRoot),
    );
    const rawPath = String(normalized?.filePath || "").replace(/\s+/g, " ").trim();
    const relPath = rawPath ? redactSecrets(relativizeFilePath(rawPath, repoRoot)) : "";
    cmd = relPath ? (pat ? `${pat} ${relPath}` : relPath) : pat;
    if (cmd.length > CMD_MAX) cmd = cmd.slice(0, CMD_MAX);
  } else if (kind === "read" || kind === "write") {
    const rawPath = normalized?.targetPath || normalized?.filePath || "";
    let relPath = relativizeFilePath(String(rawPath).replace(/\s+/g, " ").trim(), repoRoot);
    relPath = redactSecrets(relPath);
    if (relPath.length > CMD_MAX) relPath = relPath.slice(0, CMD_MAX);
    cmd = relPath;
  } else {
    cmd = redactCmd(normalized?.command || normalized?.targetPath || normalized?.filePath || "", repoRoot);
  }

  const event = {
    ts: now.toISOString(),
    session: resolveSession(normalized?.raw),
    runtime: normalized?.runtime || "",
    phase: normalized?.phase || "",
    kind,
    tool: normalized?.tool || "",
    decision: result?.allowed === false ? "block" : "allow",
    rule: result?.ruleId || null,
    inject: result?.inject === true,
    cmd,
  };

  if (kind === "read") {
    if (typeof normalized?.startLine === "number") event.start = normalized.startLine;
    if (typeof normalized?.limit === "number") event.limit = normalized.limit;
    if (typeof normalized?.isBounded === "boolean") event.bounded = normalized.isBounded;
  }

  const rawCwd =
    normalized?.cwd ||
    (normalized?.runtime === "antigravity"
      ? normalized?.raw?.workspacePaths?.[0] || normalized?.raw?.cwd
      : normalized?.raw?.cwd) ||
    "";
  const cwd = relativizeCwd(rawCwd, repoRoot);
  if (cwd) event.cwd = cwd;

  const callId =
    normalized?.toolUseId ||
    normalized?.raw?.tool_use_id ||
    normalized?.raw?.toolCall?.id ||
    normalized?.raw?.input?.callID ||
    "";
  if (callId) event.id = String(callId);

  if (normalized?.phase === "post" || normalized?.phase === "result") {
    if (typeof normalized?.ok === "boolean") {
      event.ok = normalized.ok;
    } else {
      event.ok = true;
    }
  }

  return event;
}

/**
 * Append a telemetry event for a guard invocation. Both pre-phase and post-phase
 * calls are always recorded (pre for actions/blocks, post for duration and ok).
 * Best-effort: any failure is swallowed so telemetry can never break the guard.
 * @param {object} normalized
 * @param {object} result
 * @param {{ repoRoot?: string, dir?: string, now?: Date }} [options]
 */
export function recordEvent(normalized, result, options = {}) {
  try {
    if (process.env.HARNESS_TELEMETRY === "0") return;

    const repoRoot = options.repoRoot || "";
    const dir = options.dir || resolveTelemetryDir(repoRoot || process.cwd());

    mkdirSync(dir, { recursive: true });
    const event = buildEvent(normalized, result, { now: options.now, repoRoot });
    appendFileSync(path.join(dir, "events.jsonl"), JSON.stringify(event) + "\n");
  } catch {
    // Telemetry is best-effort; never surface errors into the guard.
  }
}
