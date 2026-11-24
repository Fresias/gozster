/**
 * guard-core.mjs
 * Core evaluation engine for the harness guard (D6).
 * Single shared implementation used by guard-cli.mjs, guard.sh (shim),
 * and OpenCode plugins.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalize } from "./normalize.mjs";
import { extractStdinInterpreterInvocations, inlineHeredocSubstitutions, parseHeredocs, skipCommandWrappers } from "./heredoc.mjs";
import { resolveSession, resolveTelemetryDir } from "./telemetry.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Cache of loaded rules keyed by repoRoot. */
const rulesCache = new Map();

/** Find repository root walking up from a starting directory. */
export function findRepoRoot(startDir = process.cwd()) {
  let curr = path.resolve(startDir);
  while (true) {
    if (
      existsSync(path.join(curr, ".git")) ||
      existsSync(path.join(curr, "harness", "harness.json")) ||
      existsSync(path.join(curr, "package.json"))
    ) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(here, "../../..");
}

/**
 * Load all rule definitions from core, adapters, and local overlay.
 */
export function loadRules(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  if (options.rules) return options.rules;
  if (rulesCache.has(repoRoot)) return rulesCache.get(repoRoot);

  const rules = [];

  // 1. Core rules
  const coreRulesPath = path.join(here, "rules.json");
  if (existsSync(coreRulesPath)) {
    try {
      const data = JSON.parse(readFileSync(coreRulesPath, "utf8"));
      if (Array.isArray(data)) rules.push(...data);
    } catch {}
  }

  // 2. Adapter rules
  const adaptersDir = path.resolve(here, "../..", "adapters");
  if (existsSync(adaptersDir)) {
    try {
      for (const entry of readdirSync(adaptersDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const adapterRules = path.join(adaptersDir, entry.name, "rules.json");
          if (existsSync(adapterRules)) {
            const data = JSON.parse(readFileSync(adapterRules, "utf8"));
            if (Array.isArray(data)) rules.push(...data);
          }
        }
      }
    } catch {}
  }

  // 3. Local overlay rules
  const localRulesPath = path.join(repoRoot, "harness", "rules.local.json");
  if (existsSync(localRulesPath)) {
    try {
      const data = JSON.parse(readFileSync(localRulesPath, "utf8"));
      if (Array.isArray(data)) rules.push(...data);
    } catch {}
  }

  rulesCache.set(repoRoot, rules);
  return rules;
}

/** Optional `forbidden_reads` list from harness/project.json (dirs end with "/"). */
function loadForbiddenReads(repoRoot) {
  try {
    const cfg = JSON.parse(readFileSync(path.join(repoRoot, "harness", "project.json"), "utf8"));
    return Array.isArray(cfg.forbidden_reads) ? cfg.forbidden_reads : [];
  } catch {
    return [];
  }
}

/** Check sensitive file path for leaks and bloatware. */
function checkSensitivePath(filePath, repoRoot) {
  if (!filePath) return null;
  const base = path.basename(filePath);

  if (base === "package-lock.json") {
    return {
      allowed: false,
      ruleId: "fs.bloatware",
      reason:
        "Reading package-lock.json is forbidden (huge, low-signal). Use rg/Grep for the specific dependency.",
    };
  }

  if (base.startsWith(".env")) {
    const allowed = [".env.example", ".env.sample", ".env.template"];
    if (!allowed.includes(base)) {
      return {
        allowed: false,
        ruleId: "fs.env-leak",
        reason:
          "Reading env files is forbidden (may contain secrets). Only .env.example/.sample/.template are allowed.",
      };
    }
  }

  const norm = "/" + filePath.replace(/\\/g, "/");
  const forbidden = loadForbiddenReads(repoRoot).some((entry) =>
    entry.endsWith("/") ? norm.includes("/" + entry) : norm.endsWith("/" + entry),
  );
  if (/\.(pem|key)$/i.test(base) || forbidden) {
    return {
      allowed: false,
      ruleId: "read.sensitive",
      reason:
        "Reading key/certificate files (*.pem, *.key) or paths listed in forbidden_reads is forbidden.",
    };
  }

  return null;
}

/** Count lines in a file efficiently. */
function countLines(fullPath) {
  try {
    const stat = statSync(fullPath);
    if (!stat.isFile()) return 0;
    const buf = readFileSync(fullPath);
    let lines = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 10) lines++;
    }
    // If the file doesn't end with a newline but has content, count last line
    if (buf.length > 0 && buf[buf.length - 1] !== 10) lines++;
    return lines;
  } catch {
    return 0;
  }
}

/** Format runtime-specific read.oversize message with relative path and exact line count. */
function formatOversizeReason(displayPath, lines, runtime) {
  if (runtime === "antigravity") {
    return `\`${displayPath}\` tiene ${lines} líneas (> 300). Usá \`read_file\` con \`StartLine\` y \`EndLine\` (máximo 300, rango inclusivo; recomendado 200) o buscá con contexto: \`rg -n -C 20 <patrón> ${displayPath}\`.`;
  }
  if (runtime === "claude-code") {
    return `\`${displayPath}\` tiene ${lines} líneas (> 300). Usá \`Read\` con \`offset\` y \`limit\` (máximo 300; recomendado 200) o buscá primero con \`Grep\`.`;
  }
  return `\`${displayPath}\` tiene ${lines} líneas (> 300). Usá una lectura acotada por rango de líneas (máximo 300; recomendado 200) o buscá primero con contexto: \`rg -n -C 20 <patrón> ${displayPath}\`.`;
}

/** Evaluate native search requests (Grep/Glob): allowed unless targeting a sensitive path. */
function evaluateSearch(call, repoRoot) {
  const target = call.filePath || "";
  if (!target) return { allowed: true };

  if (isInstalledGuardPath(target)) {
    return {
      allowed: false,
      ruleId: "read.guard-installed",
      reason:
        "La copia instalada del guard no se lee ni se modifica. El código fuente está en harness-kit/core/guard/ del repo.",
    };
  }

  const sensitive = checkSensitivePath(target, repoRoot);
  if (sensitive && (sensitive.ruleId === "fs.env-leak" || sensitive.ruleId === "read.sensitive")) {
    return sensitive;
  }

  return { allowed: true };
}

/** Evaluate read requests. */
function evaluateRead(call, options, repoRoot) {
  if (isInstalledGuardPath(call.filePath)) {
    return {
      allowed: false,
      ruleId: "read.guard-installed",
      reason:
        "La copia instalada del guard no se lee ni se modifica. El código fuente está en harness-kit/core/guard/ del repo.",
    };
  }

  const sensitive = checkSensitivePath(call.filePath, repoRoot);
  if (sensitive) return sensitive;

  if (call.filePath) {
    const resolved = path.isAbsolute(call.filePath)
      ? call.filePath
      : path.resolve(repoRoot, call.filePath);

    if (existsSync(resolved)) {
      const lines = countLines(resolved);
      if (lines > 300 && !call.isBounded) {
        const rel = path.relative(repoRoot, resolved).replace(/\\/g, "/");
        const displayPath =
          rel && rel !== ".." && !rel.startsWith("../") && !path.isAbsolute(rel)
            ? rel
            : call.filePath.replace(/\\/g, "/");
        return {
          allowed: false,
          ruleId: "read.oversize",
          reason: formatOversizeReason(displayPath, lines, call.runtime),
        };
      }
    }
  }

  return { allowed: true };
}

/** Evaluate read_many requests. */
function evaluateReadMany(call, repoRoot) {
  if (Array.isArray(call.paths)) {
    for (const p of call.paths) {
      if (isInstalledGuardPath(p)) {
        return {
          allowed: false,
          ruleId: "read.guard-installed",
          reason:
            "La copia instalada del guard no se lee ni se modifica. El código fuente está en harness-kit/core/guard/ del repo.",
        };
      }
      const sensitive = checkSensitivePath(p, repoRoot);
      if (sensitive) return sensitive;
    }
  }
  return { allowed: true };
}

/**
 * Lines a `cat`/`head`/`tail` segment would print from a >300-line file, or 0.
 * Covers `-n N`, `-nN`, `--lines=N`, `-N`, `head -n -K` and `tail -n +N`.
 */
function oversizeCatLines(cmd, repoRoot) {
  for (const seg of cmd.split(/[|;&\n]+/)) {
    const tokens = seg.trim().split(/\s+/).map((t) => t.replace(/^["']|["']$/g, ""));
    const bin = tokens[0];
    if (bin !== "cat" && bin !== "head" && bin !== "tail") continue;

    let count = bin === "cat" ? null : "10";
    const files = [];
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (/^\d*[<>]/.test(t)) {
        if (/^\d*[<>]+$/.test(t)) i++; // redirection target is not an input
        continue;
      }
      if (bin !== "cat") {
        const m = t.match(/^(?:-n|--lines=?)(.*)$/) || t.match(/^-(\d+)$/);
        if (m) {
          count = m[1] || tokens[++i] || "10";
          continue;
        }
      }
      if (t && !t.startsWith("-")) files.push(t);
    }

    for (const f of files) {
      const lines = countLines(path.isAbsolute(f) ? f : path.resolve(repoRoot, f));
      if (lines <= 300) continue;
      const n = Math.abs(parseInt(count, 10)) || 0;
      let shown;
      if (count === null) shown = lines;
      else if (bin === "head" && count.startsWith("-")) shown = lines - n;
      else if (bin === "tail" && count.startsWith("+")) shown = lines - n + 1;
      else shown = Math.min(n, lines);
      if (shown > 300) return shown;
    }
  }
  return 0;
}

export const gitBashWin = "C:\\Program Files\\Git\\bin\\bash.exe";

/** Bash used for harness .sh scripts: Git Bash on Windows (never WSL `bash`), plain `bash` elsewhere. */
export function resolveBash(platform = process.platform, exists = existsSync) {
  return platform === "win32" && exists(gitBashWin) ? gitBashWin : "bash";
}

/** Reuses `harness-gate.sh --verify` (single seal_valid implementation). */
function sealValid(repoRoot) {
  const script = path.join(here, "..", "scripts", "harness-gate.sh").replace(/\\/g, "/");
  const res = spawnSync(resolveBash(), [script, "--verify"], { cwd: repoRoot, encoding: "utf8" });
  return res.status === 0;
}

const SHIP_HINT = "`node harness-kit/core/scripts/harness-ship.mjs --lesson \"…\" --title \"…\" --body-file <ruta>`";

/**
 * Why `gh pr create` is blocked by pr.requires-seal (null = seal valid and body carries it).
 * Cases: no seal, seal of another commit, same commit but tree/diff changed, body without the seal block.
 */
export function sealDiagnosis(repoRoot, body, valid = sealValid(repoRoot)) {
  let seal = null;
  try {
    seal = JSON.parse(readFileSync(path.join(repoRoot, ".harness", "complete.json"), "utf8"));
  } catch {}
  if (!valid) {
    if (!seal || !seal.fingerprint) {
      return `No corriste el gate (.harness/complete.json no existe). Usá ${SHIP_HINT} (o bash harness-kit/core/scripts/harness-gate.sh).`;
    }
    const res = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
    const head = res.status === 0 ? res.stdout.trim() : "";
    const sealHead = String(seal.head || "");
    if (head && sealHead && sealHead !== head) {
      return `El sello es de ${sealHead.slice(0, 7)} y HEAD es ${head.slice(0, 7)}: hubo commits después del gate (por ejemplo, la lección). Usá ${SHIP_HINT} o volvé a correr bash harness-kit/core/scripts/harness-gate.sh.`;
    }
    return `Hay cambios sin commitear o el diff cambió desde el gate (sello de ${sealHead.slice(0, 7)} = HEAD). Commiteá y usá ${SHIP_HINT} o volvé a correr bash harness-kit/core/scripts/harness-gate.sh.`;
  }
  const fingerprint = (seal && seal.fingerprint) || "";
  if (!fingerprint || !body.includes("harness-seal:") || !body.includes(fingerprint)) {
    return "Agregá al --body-file la salida de `bash harness-kit/core/scripts/harness-gate.sh --pr-block` (harness-ship.mjs lo hace solo).";
  }
  return null;
}

/** Current git branch of the repo ("" if unknown). */
function currentBranch(repoRoot) {
  const res = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : "";
}

/** Agent memory files (Claude Code: ~/.claude/projects/<project>/memory/...). */
export function isAgentMemoryPath(p) {
  const raw = String(p || "").replace(/\\/g, "/");
  if (/\.\.|%2e/i.test(raw)) return false;
  const norm = path.posix.normalize(raw);
  return /(^|\/)\.claude\/projects\/[^/]+\/memory(\/.*)?$/i.test(norm);
}

/** Installed guard files (~/.claude/hooks/... or ~/.gemini/config/hooks.json). */
export function isInstalledGuardPath(p) {
  if (!p) return false;
  const raw = String(p || "").replace(/\\/g, "/");
  const norm = path.posix.normalize(raw);
  return (
    /(^|\/)\.claude\/hooks(\/|$)/i.test(norm) ||
    /(^|\/)\.gemini\/config\/hooks\.json$/i.test(norm)
  );
}

function expandHome(p) {
  const s = String(p || "");
  if (s === "~") return homedir();
  if (s.startsWith("~/") || s.startsWith("~\\")) {
    return path.join(homedir(), s.slice(2));
  }
  return s;
}

function isWindowsDrivePath(p) {
  return /^[a-zA-Z]:[/\\]/.test(String(p || ""));
}

function isPathInsideRepo(target, repoRoot) {
  const raw = String(target || "");
  if (!raw) return false;
  if (raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\")) {
    const expanded = path.resolve(expandHome(raw));
    const rel = path.relative(path.resolve(repoRoot), expanded).replace(/\\/g, "/");
    return rel !== ".." && !rel.startsWith("../") && !path.isAbsolute(rel) && !isWindowsDrivePath(rel);
  }
  const fwd = raw.replace(/\\/g, "/");
  if (isWindowsDrivePath(fwd) && !isWindowsDrivePath(repoRoot)) {
    return false;
  }
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(repoRoot, raw);
  const rel = path.relative(path.resolve(repoRoot), resolved).replace(/\\/g, "/");
  return rel !== ".." && !rel.startsWith("../") && !path.isAbsolute(rel) && !isWindowsDrivePath(rel);
}

/** Antigravity CLI scratch/artifacts dir (~/.gemini/antigravity-cli/brain/...). */
export function isAntigravityBrainPath(p) {
  const raw = String(p || "").replace(/\\/g, "/");
  if (/\.\.|%2e/i.test(raw)) return false;
  const norm = path.posix.normalize(raw);
  return /(^|\/)\.gemini\/antigravity-cli\/brain(\/|$)/i.test(norm);
}

/** User-level Gemini/Antigravity config dir (~/.gemini/config/**). */
export function isGeminiConfigPath(p) {
  if (!p) return false;
  const raw = String(p).replace(/\\/g, "/");
  const norm = path.posix.normalize(raw);
  return /(^|\/)\.gemini\/config(\/|$)/i.test(norm) || /(^|\/)\.gemini\/config(\/|$)/i.test(raw);
}

const PROTECTED_SHELL_PATH_RE =
  /(?:(?:^|[/\\"'`\s>=:])\.git(?:[/\\"'`\s;|&>]|$)|(\.claude|\.agents|\.gemini|\.opencode)[/\\])/i;

/** Claude Code tool-results files (~/.claude/projects/<project>/tool-results/...): read-only inputs. */
export function isToolResultsPath(p) {
  const raw = String(p || "").replace(/\\/g, "/");
  if (/\.\.|%2e/i.test(raw)) return false;
  const norm = path.posix.normalize(raw);
  return /(^|\/)\.claude\/projects\/[^/]+\/tool-results(\/.*)?$/i.test(norm);
}

/**
 * Remove tool-results paths (outside quotes or as a whole quoted word) so they do not count as an
 * `argv` destination; rejects `..` and `%2e` like isAgentMemoryPath. Linear: matches start only at
 * token boundaries.
 */
function stripToolResultsPaths(cmd) {
  const s = String(cmd || "");
  if (!/tool-results/i.test(s)) return s;
  return s.replace(
    /(?:(["'])([^"'\s]*\.claude[/\\]projects[/\\][^/\\\s"']+[/\\]tool-results[/\\][^"'\s]*)\1|(?<![^\s"'<>|&;=])([^\s"'<>|&;=]*\.claude[/\\]projects[/\\][^/\\\s"'<>|&;=]+[/\\]tool-results[/\\][^\s"'<>|&;=]*))/gi,
    (match, q, pQuoted, pUnquoted) => (isToolResultsPath(pQuoted || pUnquoted) ? "" : match)
  );
}

function stripWritableAgentPaths(cmd, repoRoot) {
  let s = String(cmd || "");
  // Shortcut + token-boundary anchors keep this linear on large payloads (`gh api -f body=…`, big JSON).
  if (/\.claude[/\\]projects/i.test(s)) {
    s = s.replace(
      /(?:(["'])([^"']*\.claude[/\\]projects[/\\][^/\\]+[/\\]memory[/\\][^"']*)\1|(?<![^\s"'<>|&;=])([^\s"'<>|&;=]*\.claude[/\\]projects[/\\][^/\\\s"'<>|&;=]+[/\\]memory[/\\][^\s"'<>|&;=]*))/gi,
      (match, q, pQuoted, pUnquoted) => {
        const p = pQuoted || pUnquoted;
        if (/\.\.|%2e/i.test(p)) return match;
        const norm = path.posix.normalize(p.replace(/\\/g, "/"));
        if (!isAgentMemoryPath(norm)) return match;
        return "";
      }
    );
  }
  if (!/\.gemini[/\\]antigravity-cli/i.test(s)) return s;
  return s
    .replace(
      /(?:(["'])([^"']*\.gemini[/\\]antigravity-cli[/\\]brain[/\\][^"']*)\1|(?<![^\s"'<>|&;=])([^\s"'<>|&;=]*\.gemini[/\\]antigravity-cli[/\\]brain[/\\][^\s"'<>|&;=]*))/gi,
      (match, q, pQuoted, pUnquoted) => {
        const p = pQuoted || pUnquoted;
        if (/\.\.|%2e/i.test(p)) return match;
        if (isPathInsideRepo(p, repoRoot)) return match;
        const norm = path.posix.normalize(p.replace(/\\/g, "/"));
        if (!isAntigravityBrainPath(norm)) return match;
        return "";
      }
    );
}

function isProtectedShellTarget(rawToken) {
  let t = String(rawToken || "").trim().replace(/^["']|["']$/g, "");
  if (!t) return false;
  // Unwrap flag=value or PowerShell -Path:value (without splitting Windows drive C:\...)
  const flagAssign = t.match(/^--?[a-zA-Z][\w-]*[:=](.+)$/);
  if (flagAssign) {
    t = flagAssign[1].replace(/^["']|["']$/g, "");
  } else if (/^[a-zA-Z_]\w*=(.+)$/.test(t)) {
    t = t.slice(t.indexOf("=") + 1).replace(/^["']|["']$/g, "");
  }
  if (!t || isAgentMemoryPath(t)) return false;
  const fwd = t.replace(/\\/g, "/");
  const norm = path.posix.normalize(fwd);
  return (
    /(^|\/)\.git(\/|$)/i.test(norm) ||
    /(^|\/)\.git(\/|$)/i.test(fwd) ||
    /(^|\/)\.(claude|agents|gemini|opencode)(\/|$)/i.test(norm) ||
    /(^|\/)\.(claude|agents|gemini|opencode)\//i.test(fwd)
  );
}

function hasUnquotedProtectedRedirect(seg) {
  let quote = null;
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < seg.length) {
        i++;
        continue;
      }
      if (ch === '"') quote = null;
      continue;
    }
    if (ch === "\\" && i + 1 < seg.length) {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === ">") {
      if (seg[i + 1] === ">") i++;
      let j = i + 1;
      while (j < seg.length && /\s/.test(seg[j])) j++;
      let target = "";
      let tq = null;
      while (j < seg.length) {
        const c = seg[j];
        if (tq) {
          if (tq === '"' && c === "\\" && j + 1 < seg.length) target += seg[++j];
          else if (c === tq) tq = null;
          else target += c;
        } else if (c === "'" || c === '"') {
          tq = c;
        } else if (/[\s;|&<>]/.test(c)) {
          break;
        } else {
          target += c;
        }
        j++;
      }
      if (target && isProtectedShellTarget(target)) return true;
    }
  }
  return false;
}

/**
 * Read balanced parenthesized call arguments starting at the `(` index.
 * Returns `{ inner, end }` (where `end` is the index just after `)`), or null if unclosed.
 */
function readBalancedParens(code, openIdx) {
  let depth = 0;
  let quote = null;
  let triple = false;
  for (let i = openIdx; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (triple) {
        if (code.slice(i, i + 3) === quote.repeat(3)) {
          quote = null;
          triple = false;
          i += 2;
        }
        continue;
      }
      if (ch === "\\" && quote !== "`" && i + 1 < code.length) {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if ((ch === "'" || ch === '"') && code.slice(i, i + 3) === ch.repeat(3)) {
      quote = ch;
      triple = true;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return { inner: code.slice(openIdx + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** Split top-level comma-separated arguments inside a call/list expression. */
function splitTopLevelArgs(expr) {
  const parts = [];
  let cur = "";
  let depth = 0;
  let quote = null;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (quote) {
      cur += ch;
      if (ch === "\\" && i + 1 < expr.length) {
        cur += expr[++i];
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      cur += ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      cur += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Unquote a single Python/JS string literal (`"..."`, `'...'`, `` `...` ``, with optional Python prefix). */
function unquoteCodeString(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^[rRuUbBfF]{0,2}(["'`])([\s\S]*)\1$/);
  if (!m) return null;
  const q = m[1];
  const body = m[2];
  if (q === "`") return body;
  return body.replace(/\\(["'\\nrt])/g, (_, c) => {
    if (c === "n") return "\n";
    if (c === "r") return "\r";
    if (c === "t") return "\t";
    return c;
  });
}

/** Quote a shell token when reconstructing a command from an argv array literal. */
function shellQuoteArg(arg) {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/** Extract a shell command string from a string literal or array-of-strings literal. */
function parseShellArgExpr(expr) {
  const s = String(expr || "").trim();
  const str = unquoteCodeString(s);
  if (str !== null) return str;
  if ((s.startsWith("[") && s.endsWith("]")) || (s.startsWith("(") && s.endsWith(")"))) {
    const items = splitTopLevelArgs(s.slice(1, -1));
    const vals = [];
    for (const item of items) {
      const u = unquoteCodeString(item);
      if (u !== null) vals.push(u);
    }
    if (vals.length > 0) return vals.map(shellQuoteArg).join(" ");
  }
  return null;
}

/**
 * Extract shell commands launched from inline/stdin Python or Node code (A2b):
 * - Python: `os.system(...)`, `os.popen(...)`, `subprocess.run/call/check_call/check_output/Popen(...)`
 * - Node: `child_process.exec/execSync/execFile/execFileSync/spawn/spawnSync(...)`
 */
function extractInterpreterShellCommands(code, kind) {
  const s = String(code || "");
  const cmds = [];
  if (kind === "python") {
    const hasSubprocessImport = /\bfrom\s+subprocess\s+import\b/.test(s);
    const hasOsImport = /\bfrom\s+os\s+import\b/.test(s);
    const callRe =
      /(?<![.\w])(?:os\.(?:system|popen)|subprocess\.(?:run|call|check_call|check_output|Popen))\s*\(|(?<![.\w])(system|popen|run|call|check_call|check_output|Popen)\s*\(/g;
    let m;
    while ((m = callRe.exec(s)) !== null) {
      if (m[1]) {
        const bare = m[1];
        if ((bare === "system" || bare === "popen") && !hasOsImport) continue;
        if (bare !== "system" && bare !== "popen" && !hasSubprocessImport) continue;
      }
      const openIdx = m.index + m[0].length - 1;
      const balanced = readBalancedParens(s, openIdx);
      if (!balanced) continue;
      const args = splitTopLevelArgs(balanced.inner);
      if (!args.length) continue;
      let firstArg = args[0];
      const kwMatch = firstArg.match(/^(?:args|cmd|command)\s*=\s*([\s\S]+)$/);
      if (kwMatch) firstArg = kwMatch[1];
      const extracted = parseShellArgExpr(firstArg);
      if (extracted) cmds.push(extracted);
    }
  } else if (kind === "node") {
    const hasCpRef = /\bchild_process\b/.test(s);
    const callRe =
      /(?:(?:\b(?:child_process|cp)|require\s*\(\s*["'](?:node:)?child_process["']\s*\))\s*\.\s*(execSync|execFileSync|spawnSync|execFile|exec|spawn)|(?<![.\w])(execSync|execFileSync|spawnSync|execFile|exec|spawn))\s*\(/g;
    let m;
    while ((m = callRe.exec(s)) !== null) {
      const fnName = m[1] || m[2];
      if (m[2] && (fnName === "exec" || fnName === "execFile" || fnName === "spawn") && !hasCpRef) continue;
      const openIdx = m.index + m[0].length - 1;
      const balanced = readBalancedParens(s, openIdx);
      if (!balanced) continue;
      const args = splitTopLevelArgs(balanced.inner);
      if (!args.length) continue;
      if (fnName === "exec" || fnName === "execSync") {
        const extracted = parseShellArgExpr(args[0]);
        if (extracted) cmds.push(extracted);
      } else {
        // execFile / execFileSync / spawn / spawnSync: (file, [args], ...)
        const bin = unquoteCodeString(args[0]);
        if (bin) {
          const rest = args[1] ? parseShellArgExpr(args[1]) : "";
          cmds.push(rest ? `${shellQuoteArg(bin)} ${rest}` : shellQuoteArg(bin));
        }
      }
    }
  }
  return cmds;
}

/**
 * Strip path string literals that appear ONLY inside explicit read-only calls
 * in inline Python/Node scripts so reading a protected path while writing elsewhere
 * does not trigger `fs.protected`. Write-mode calls remain untouched.
 */
function stripInlineReadOnlyLiterals(code, kind) {
  let s = String(code || "");
  if (kind === "python") {
    // Path("...").read_text( / Path("...").read_bytes( (with optional .expanduser()/.resolve())
    // Replace ONLY the path literal inside Path(...), leaving read_text/read_bytes arguments untouched.
    s = s.replace(
      /(?<![.\w])((?:pathlib\.)?Path\s*\(\s*)[rRuUbB]?(["'])((?:\\.|(?!\2)[^\\])*)\2(\s*\)(?:\s*\.\s*(?:expanduser|resolve)\s*\(\s*\))*\s*\.\s*(?:read_text|read_bytes)\s*\()/g,
      '$1""$4'
    );
    // Path("...").open() or Path("...").open("r"|"rb"|"rt", ...) with safe read-only kwargs (no nested calls).
    // Never strip Path("...").open("w"|"a"|"x"|"r+"...).
    s = s.replace(
      /(?<![.\w])((?:pathlib\.)?Path\s*\(\s*)[rRuUbB]?(["'])((?:\\.|(?!\2)[^\\])*)\2(\s*\)(?:\s*\.\s*(?:expanduser|resolve)\s*\(\s*\))*\s*\.\s*open\s*\(\s*(?:(?:(?:mode\s*=\s*)?["'](?:r|rb|rt|br|tr)["']|(?:encoding|errors|newline|buffering)\s*=\s*(?:["'][^"']*["']|[^,()]+))(?:\s*,\s*(?:(?:mode\s*=\s*)?["'](?:r|rb|rt|br|tr)["']|(?:encoding|errors|newline|buffering)\s*=\s*(?:["'][^"']*["']|[^,()]+)))*)?\s*\))/g,
      '$1""$4'
    );
    // Builtin open("...") or builtins.open / io.open("...", "r"|"rb"|"rt") with optional os.path.expanduser(...) and safe kwargs.
    // Restrict strictly to builtin/builtins/io open so qualified calls like shelve.open(...), dbm.open(...), os.open(...) are never stripped.
    s = s.replace(
      /(?<![.\w])((?:(?:builtins|io)\.)?open\s*\(\s*)(?:os\.path\.expanduser\s*\(\s*[rRuUbB]?(["'])((?:\\.|(?!\2)[^\\])*)\2\s*\)|[rRuUbB]?(["'])((?:\\.|(?!\4)[^\\])*)\4)(\s*(?:,\s*(?:(?:mode\s*=\s*)?["'](?:r|rb|rt|br|tr)["']|(?:encoding|errors|newline|buffering)\s*=\s*(?:["'][^"']*["']|[^,)]+)))*\s*\))/g,
      '$1""$6'
    );
  } else if (kind === "node") {
    // readFileSync("...", ...) / readFile("...", ...) — strip only the first (path) literal argument
    // ONLY when the options do NOT pass a mutating flag (`w`, `a`, `x`, `+`) (A2b).
    const rfRe = /\b(?:readFileSync|readFile)\s*\(/g;
    let out = "";
    let last = 0;
    let m;
    while ((m = rfRe.exec(s)) !== null) {
      const openIdx = s.indexOf("(", m.index);
      const balanced = readBalancedParens(s, openIdx);
      if (!balanced) continue;
      if (/\bflag["']?\s*:\s*["'`][^"'`]*[wax+][^"'`]*["'`]/.test(balanced.inner)) {
        continue;
      }
      const replacedInner = balanced.inner
        .replace(/^(\s*)(["'])((?:\\.|(?!\2)[^\\])*)\2/, '$1""')
        .replace(/^(\s*)`([^`$]*)`/, "$1``");
      out += s.slice(last, openIdx + 1) + replacedInner + ")";
      last = balanced.end;
      rfRe.lastIndex = balanced.end;
    }
    s = out + s.slice(last);
  }
  return s;
}

/** Evaluate an inline/stdin interpreter invocation for writes to protected paths (.git/.claude/etc.). */
function interpreterWritesProtected(inline, seg, repoRoot, depth) {
  if (inline.kind === "shell" || inline.kind === "pwsh") {
    return shellWritesProtected(inline.code, repoRoot, depth + 1);
  }
  const subShells = extractInterpreterShellCommands(inline.code, inline.kind);
  for (const subCmd of subShells) {
    if (shellWritesProtected(subCmd, repoRoot, depth + 1)) return true;
  }
  const codeSafe = stripInlineReadOnlyLiterals(stripWritableAgentPaths(inline.code, repoRoot), inline.kind);
  const targetsProtected =
    PROTECTED_SHELL_PATH_RE.test(codeSafe) ||
    (/\bargv\b/i.test(inline.code) && PROTECTED_SHELL_PATH_RE.test(stripToolResultsPaths(stripWritableAgentPaths(seg, repoRoot))));
  if (targetsProtected) {
    if (inline.kind === "python" && PYTHON_WRITE_API.test(inline.code)) return true;
    if (inline.kind === "node" && NODE_WRITE_API.test(inline.code)) return true;
    if (inline.kind === "perl" && PERL_WRITE_API.test(inline.code)) return true;
    if (inline.kind === "ruby" && RUBY_WRITE_API.test(inline.code)) return true;
  }
  return false;
}

/** True if a shell command writes to a protected runtime/git path (.git, .claude, .agents, .gemini, .opencode). */
function shellWritesProtected(rawCmd, repoRoot, depth = 0) {
  if (depth > 5) return false;
  const cmd = inlineHeredocSubstitutions(rawCmd);

  // A2: evaluate interpreter bodies fed via stdin (heredocs or `echo ... | bash`, `cat <<EOF | python3`, etc.)
  for (const inv of extractStdinInterpreterInvocations(cmd)) {
    if (interpreterWritesProtected(inv, cmd, repoRoot, depth)) return true;
  }

  const cleaned = stripWritableAgentPaths(parseHeredocs(cmd).strippedAll, repoRoot);
  if (!PROTECTED_SHELL_PATH_RE.test(cleaned)) return false;

  for (const seg of splitShellSegments(cleaned)) {
    if (!PROTECTED_SHELL_PATH_RE.test(seg)) continue;
    if (hasUnquotedProtectedRedirect(seg)) return true;

    const inline = extractInlineInterpreter(seg);
    if (inline && interpreterWritesProtected(inline, seg, repoRoot, depth)) return true;

    const unquoted = stripQuotedLiterals(seg);
    if (/WriteAll(Text|Bytes|Lines)|\[IO\.File\]::(Write|Append|Delete|Move|Copy|Create|Replace)/i.test(unquoted)) {
      return true;
    }

    const tokens = tokenizeShellSegment(seg);

    // Copy-like verbs: only the destination matters.
    if (/(^|[\s;&|(])(cp|install|ln|Copy-Item)\s/i.test(unquoted)) {
      const destFlags = /^(-t|--target-directory|-dest(ination)?)$/i;
      let explicitDest = "";
      for (let i = 0; i < tokens.length; i++) {
        if (destFlags.test(tokens[i]) && tokens[i + 1]) {
          explicitDest = tokens[i + 1];
          break;
        }
        if (/^(--target-directory=|-dest(ination)?:)/i.test(tokens[i])) {
          explicitDest = tokens[i];
          break;
        }
      }
      if (explicitDest) {
        if (isProtectedShellTarget(explicitDest)) return true;
      } else {
        const last = tokens.filter((a) => !a.startsWith("-")).pop() || "";
        if (isProtectedShellTarget(last)) return true;
      }
    }

    // PowerShell mutating cmdlets: check path/target arguments (ignore -Value/-Encoding/-ItemType payloads).
    if (
      /(^|[\s;&|(])(Set-Content|Add-Content|Out-File|New-Item|Clear-Content|Remove-Item|Move-Item|Rename-Item)\b/i.test(
        unquoted
      )
    ) {
      const cmdIdx = tokens.findIndex((t) =>
        /^(Set-Content|Add-Content|Out-File|New-Item|Clear-Content|Remove-Item|Move-Item|Rename-Item)$/i.test(t)
      );
      const start = cmdIdx >= 0 ? cmdIdx + 1 : 1;
      for (let i = start; i < tokens.length; i++) {
        const t = tokens[i];
        if (/^-(Value|Encoding|ItemType|Filter|Include|Exclude)$/i.test(t)) {
          i++;
          continue;
        }
        if (/^-(Value|Encoding|ItemType|Filter|Include|Exclude):/i.test(t)) continue;
        if (/^-[a-zA-Z]+$/.test(t)) continue;
        if (isProtectedShellTarget(t)) return true;
      }
    }

    // dd: check of=<target>.
    if (/(^|[\s;&|(])dd\s/i.test(unquoted)) {
      for (const t of tokens) {
        if (/^of=/i.test(t) && isProtectedShellTarget(t)) return true;
      }
    }

    // Other mutating shell verbs: block if any target argument in this segment is protected.
    if (
      /(^|[\s;&|(])(mv|truncate|chmod|tee|rm|touch|patch)\s|sed\s+(?:-[a-zA-Z0-9]+\s+)*(?:-[a-zA-Z]*i|--in-place)\b|perl\s+(?:-[a-zA-Z0-9]+\s+)*-[a-zA-Z]*i\b|git\s+(apply|am|checkout\s+\S+\s+--|restore\s+--source)/i.test(
        unquoted
      )
    ) {
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (/^-[a-zA-Z]+$/.test(t)) continue;
        if (isProtectedShellTarget(t)) return true;
      }
    }
  }

  return false;
}

/** Harness mutations are allowed only on an authorized harness branch: <type>/<issue-#>-harness-<slug>. */
export function harnessBranchAuthorized(branch) {
  return /^(feature|fix|chore)\/\d+-harness-/.test(String(branch || ""));
}

/** Protected harness sources (lessons in harness/experience/ stay writable by every agent). */
export function isProtectedHarnessPath(rel) {
  const p = String(rel || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.startsWith("harness/experience/")) return false;
  return /^(harness|harness-kit|\.github)\//.test(p);
}

// Copy-like verbs (cp/install/ln/Copy-Item) are handled separately because they only write their destination.
const HARNESS_WRITE_VERB =
  /((^|[\s;&|(])(mv|dd|truncate|chmod|tee|rm|touch|patch)\s|sed\s+(?:-[a-zA-Z0-9]+\s+)*(?:-[a-zA-Z]*i|--in-place)\b|perl\s+(?:-[a-zA-Z0-9]+\s+)*-[a-zA-Z]*i\b|git\s+(apply|am|checkout\s+\S+\s+--|restore\s+--source)|Set-Content|Add-Content|Out-File|New-Item|Move-Item|Remove-Item|Rename-Item|Clear-Content|WriteAll(Text|Bytes|Lines)|\[IO\.File\])/i;
const HARNESS_GENERATORS = /^(harness-render\.mjs|harness-compose\.mjs|bootstrap\.mjs)$/i;
const SEGMENT_SPLIT = /;|&&|\|\||\||\n/;
const COMMAND_WRAPPERS = /^(node|npx|bun|env|xargs|command|&)$/i;

const PYTHON_WRITE_API = new RegExp(
  [
    "\\bopen\\s*\\((?:[^;)]|\\([^)]*\\))*?(?:,\\s*(?:mode\\s*=\\s*)?|\\bmode\\s*=\\s*)[\"'][waxr+bt]*[wax+][waxr+bt]*[\"']",
    "\\.open\\s*\\(\\s*(?:mode\\s*=\\s*)?[\"'][waxr+bt]*[wax+][waxr+bt]*[\"']",
    "\\b(?:shelve|dbm)\\.open\\s*\\((?![^)]*,\\s*(?:flag\\s*=\\s*)?[\"']r[\"'])",
    "\\.(?:write_text|write_bytes|writelines|unlink|rename|replace|mkdir|rmdir|touch|symlink_to|hardlink_to|chmod)\\s*\\(",
    "\\b(?:os\\.(?:remove|unlink|rename|replace|rmdir|makedirs|mkdir|write|chmod|symlink|link|truncate|open)|shutil\\.(?:copy|copy2|copyfile|copytree|move|rmtree))\\s*\\(",
  ].join("|")
);
const NODE_WRITE_API = new RegExp(
  [
    "\\b(?:writeFileSync|writeFile|appendFileSync|appendFile|writeSync|createWriteStream|renameSync|rename|unlinkSync|unlink|rmSync|rmdirSync|rmdir|copyFileSync|copyFile|cpSync|mkdirSync|mkdir|truncateSync|truncate|chmodSync|chmod|symlinkSync|symlink|linkSync|link)\\s*\\(",
    "(?:\\bfs(?:Promises)?|\\bpromises|\\bfsp|require\\s*\\(\\s*[\"'](?:node:)?fs(?:\\/promises)?[\"']\\s*\\))\\.(?:write|rm|cp)\\s*\\(",
    "(?:^|[^\\w.])rm\\s*\\(",
    "\\b(?:openSync|fs\\.open|promises\\.open)\\s*\\((?:[^;)]|\\([^)]*\\))*?,\\s*[\"'][waxr+]*[wax+][waxr+]*[\"']",
    "\\b(?:readFileSync|readFile)\\s*\\((?:[^;)]|\\([^)]*\\))*?\\bflag[\"']?\\s*:\\s*[\"'`][^\"'`]*[wax+][^\"'`]*[\"'`]",
  ].join("|")
);
const PERL_WRITE_API =
  /\bopen\s*\((?:[^;)]|\([^)]*\))*?(?:,\s*["']\s*(?:>>?|\+>|\+<)|["']\s*>>?)|\b(?:unlink|rename|chmod|symlink|link|truncate|mkdir|rmdir|syswrite|spew)\b(?:\s*\(|\s+["'$@%a-zA-Z])/;
const RUBY_WRITE_API =
  /\b(?:File|IO)\.(?:write|binwrite|delete|unlink|rename|truncate|chmod)\b|\b(?:File|IO)\.open\s*\((?:[^;)]|\([^)]*\))*?,\s*["'][wax+]|\bFileUtils\.(?:rm|rm_f|rm_rf|mv|cp|cp_r|mkdir|mkdir_p|rmdir|touch|chmod|ln|ln_s|install)\b|\bDir\.(?:mkdir|rmdir|delete|unlink)\b/;

/** Split a shell command into segments by `;`, `&&`, `||`, `|`, `|&`, `&`, `\n`, respecting quotes and escapes. */
function splitShellSegments(cmd) {
  const segments = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < cmd.length) {
        cur += ch + cmd[++i];
        continue;
      }
      if (ch === '"') quote = null;
      cur += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < cmd.length) {
      cur += ch + cmd[++i];
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === ";" || ch === "\n") {
      if (cur.trim()) segments.push(cur);
      cur = "";
      continue;
    }
    if (ch === "|") {
      if (cur.trim()) segments.push(cur);
      cur = "";
      if (cmd[i + 1] === "|" || cmd[i + 1] === "&") i++;
      continue;
    }
    if (ch === "&") {
      const prev = cmd[i - 1] || "";
      const next = cmd[i + 1] || "";
      if (prev === ">" || prev === "<" || next === ">") {
        cur += ch;
        continue;
      }
      if (cur.trim()) segments.push(cur);
      cur = "";
      if (next === "&") i++;
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) segments.push(cur);
  return segments;
}

/** Tokenize a single shell segment respecting quotes and escapes (preserves unquoted Windows backslashes). */
function tokenizeShellSegment(seg) {
  const tokens = [];
  let cur = "";
  let inToken = false;
  let quote = null;
  const s = String(seg || "").trim().replace(/^\(+/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < s.length && (s[i + 1] === '"' || s[i + 1] === "\\" || s[i + 1] === "$" || s[i + 1] === "`")) {
        cur += s[++i];
        continue;
      }
      if (ch === '"') quote = null;
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inToken = true;
      continue;
    }
    if (ch === "\\" && i + 1 < s.length && /[\s"'\\;|&<>()$`]/.test(s[i + 1])) {
      cur += s[++i];
      inToken = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inToken) {
        tokens.push(cur);
        cur = "";
        inToken = false;
      }
      continue;
    }
    cur += ch;
    inToken = true;
  }
  if (inToken) tokens.push(cur);
  return tokens;
}

/** Replace quoted literal contents with empty quotes so verb checks do not match search patterns. */
function stripQuotedLiterals(seg) {
  let out = "";
  let quote = null;
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (quote === "'") {
      if (ch === "'") {
        quote = null;
        out += "''";
      }
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < seg.length) {
        i++;
        continue;
      }
      if (ch === '"') {
        quote = null;
        out += '""';
      }
      continue;
    }
    if (ch === "\\" && i + 1 < seg.length) {
      out += ch + seg[++i];
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    out += ch;
  }
  return out;
}

/** Extract inline interpreter invocation `{ kind, code }` from a segment, or null. */
function extractInlineInterpreter(seg) {
  const tokens = tokenizeShellSegment(seg);
  const i = skipCommandWrappers(tokens);
  if (i >= tokens.length) return null;
  const bin = tokens[i].split(/[/\\]/).pop().replace(/\.exe$/i, "").toLowerCase();

  // `eval "..."` / `eval gh pr create --fill`
  if (bin === "eval") {
    let j = i + 1;
    if (tokens[j] === "--") j++;
    if (j >= tokens.length) return null;
    return { kind: "shell", code: tokens.length === j + 1 ? tokens[j] : tokens.slice(j).join(" ") };
  }

  // `cmd /c ...` / `cmd.exe /c "..."`
  if (bin === "cmd") {
    for (let j = i + 1; j < tokens.length; j++) {
      if (/^\/[ck]$/i.test(tokens[j])) {
        if (j + 1 >= tokens.length) return null;
        return { kind: "shell", code: tokens.length === j + 2 ? tokens[j + 1] : tokens.slice(j + 1).join(" ") };
      }
    }
    return null;
  }

  // `Invoke-Expression "..."` / `iex "..."`
  if (bin === "invoke-expression" || bin === "iex") {
    let j = i + 1;
    if (tokens[j] && /^-(?:c|command)$/i.test(tokens[j])) j++;
    if (j >= tokens.length) return null;
    return { kind: "pwsh", code: tokens.length === j + 1 ? tokens[j] : tokens.slice(j).join(" ") };
  }

  let kind = null;
  if (/^(ba|z|da)?sh$/.test(bin)) kind = "shell";
  else if (/^python(\d+(\.\d+)*)?$/.test(bin) || bin === "py") kind = "python";
  else if (/^(node(js)?|bun)$/.test(bin)) kind = "node";
  else if (bin === "perl") kind = "perl";
  else if (bin === "ruby") kind = "ruby";
  else if (bin === "pwsh" || bin === "powershell") kind = "pwsh";
  if (!kind) return null;

  for (let j = i + 1; j < tokens.length; j++) {
    const t = tokens[j];
    if (t === "--") break;
    if (kind === "shell") {
      if (/^-[a-zA-Z]*c$/.test(t)) return tokens[j + 1] ? { kind, code: tokens[j + 1] } : null;
      continue;
    }
    if (kind === "pwsh") {
      if (/^-(?:c|command)$/i.test(t)) {
        if (!tokens[j + 1] || tokens[j + 1] === "-") return null;
        return { kind, code: tokens.slice(j + 1).join(" ") };
      }
      continue;
    }
    if (kind === "python") {
      if (/^-[a-zA-Z]*c$/.test(t)) return tokens[j + 1] ? { kind, code: tokens[j + 1] } : null;
      if (/^-c.+/.test(t)) return { kind, code: t.slice(2) };
      continue;
    }
    if (kind === "node") {
      if (/^-(?:e|p|pe|ep)$/.test(t) || t === "--eval" || t === "--print") {
        return tokens[j + 1] ? { kind, code: tokens[j + 1] } : null;
      }
      if (t.startsWith("--eval=") || t.startsWith("--print=")) {
        return { kind, code: t.slice(t.indexOf("=") + 1) };
      }
      if (/^-[ep].+/.test(t) && !/^-[a-zA-Z]+$/.test(t)) return { kind, code: t.slice(2) };
      continue;
    }
    if (kind === "perl") {
      if (/^-[a-zA-Z]*[eE]$/.test(t)) return tokens[j + 1] ? { kind, code: tokens[j + 1] } : null;
      if (/^-[eE].+/.test(t)) return { kind, code: t.slice(2) };
      continue;
    }
    if (kind === "ruby") {
      if (/^-[a-zA-Z]*e$/.test(t)) return tokens[j + 1] ? { kind, code: tokens[j + 1] } : null;
      if (/^-e.+/.test(t)) return { kind, code: t.slice(2) };
      continue;
    }
  }
  return null;
}

/** True when a segment redirects output (`>`, `>>`, `&>`, `&>>`) outside quotes into a protected harness path. */
function hasUnquotedHarnessRedirect(seg, ref) {
  let quote = null;
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < seg.length) {
        i++;
        continue;
      }
      if (ch === '"') quote = null;
      continue;
    }
    if (ch === "\\" && i + 1 < seg.length) {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === ">") {
      if (seg[i + 1] === ">") i++;
      let j = i + 1;
      while (j < seg.length && /\s/.test(seg[j])) j++;
      let target = "";
      let tq = null;
      while (j < seg.length) {
        const c = seg[j];
        if (tq) {
          if (tq === '"' && c === "\\" && j + 1 < seg.length) target += seg[++j];
          else if (c === tq) tq = null;
          else target += c;
        } else if (c === "'" || c === '"') {
          tq = c;
        } else if (/[\s;|&<>]/.test(c)) {
          break;
        } else {
          target += c;
        }
        j++;
      }
      if (target && ref.test(` ${target}`)) return true;
    }
  }
  return false;
}

/** A generator runs only when its script is in command position, never when it is just an argument (grep, sed, ls). */
function runsHarnessGenerator(cmd) {
  return splitShellSegments(cmd).some((seg) => {
    const tokens = tokenizeShellSegment(seg);
    let i = 0;
    while (i < tokens.length && (COMMAND_WRAPPERS.test(tokens[i]) || /^\w+=/.test(tokens[i]) || (i > 0 && tokens[i].startsWith("-")))) i++;
    if (/^(bash|sh)$/i.test(tokens[i] || "") && /^-[a-zA-Z]*c$/.test(tokens[i + 1] || "")) {
      const inner = tokens.length === i + 3 ? tokens[i + 2] : tokens.slice(i + 2).join(" ");
      return runsHarnessGenerator(inner);
    }
    const script = (tokens[i] || "").split(/[/\\]/).pop();
    if (!HARNESS_GENERATORS.test(script)) return false;
    if (/^harness-render/i.test(script)) return !/--check\b/.test(seg);
    if (/^harness-compose/i.test(script)) return !/--no-promote\b/.test(seg);
    return true;
  });
}

/** Heredoc bodies are data written somewhere, not paths read by the command. */
function stripHeredocBodies(cmd) {
  return cmd.replace(/(<<-?\s*(["']?)([A-Za-z_]\w*)\2[^\r\n]*)\r?\n[\s\S]*?\r?\n[ \t]*\3[ \t]*(?=\r?\n|$)/g, "$1");
}
const HARNESS_DIRS = "(harness|harness-kit|\\.github)[/\\\\](?!experience[/\\\\])";

/**
 * Regex for a path INTO this repo's harness sources: repo-relative (`harness/x`, `./harness/x`) or absolute
 * under repoRoot (Windows, forward-slash and Git Bash `/c/...` forms). Paths like /tmp/x/harness/ do not match.
 */
function harnessPathPattern(repoRoot) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const fwd = path.resolve(repoRoot).replace(/\\/g, "/");
  const roots = new Set([fwd, fwd.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`)]);
  const abs = [...roots].map((r) => esc(r).replace(/\//g, "[/\\\\]")).join("|");
  return `(?:(?:^|[\\s"'=(\`])(?:\\.[/\\\\])?|(?:${abs})[/\\\\])${HARNESS_DIRS}`;
}

/** Evaluate an inline/stdin interpreter invocation for writes to protected harness sources. */
function interpreterWritesHarness(inline, seg, ref, repoRoot, depth) {
  if (inline.kind === "shell" || inline.kind === "pwsh") {
    return shellWritesHarness(inline.code, repoRoot, depth + 1);
  }
  const subShells = extractInterpreterShellCommands(inline.code, inline.kind);
  for (const subCmd of subShells) {
    if (shellWritesHarness(subCmd, repoRoot, depth + 1)) return true;
  }
  const codeSafe = stripInlineReadOnlyLiterals(inline.code, inline.kind);
  const targetsHarness = ref.test(codeSafe) || (/\bargv\b/i.test(inline.code) && ref.test(seg));
  if (targetsHarness) {
    if (inline.kind === "python" && PYTHON_WRITE_API.test(inline.code)) return true;
    if (inline.kind === "node" && NODE_WRITE_API.test(inline.code)) return true;
    if (inline.kind === "perl" && PERL_WRITE_API.test(inline.code)) return true;
    if (inline.kind === "ruby" && RUBY_WRITE_API.test(inline.code)) return true;
  }
  return false;
}

/** True if the shell command writes a protected harness source of repoRoot. */
function shellWritesHarness(rawCmd, repoRoot, depth = 0) {
  if (depth > 5) return false;
  const cmd = inlineHeredocSubstitutions(rawCmd);
  const target = harnessPathPattern(repoRoot);
  const ref = new RegExp(target, "i");

  // A2: evaluate interpreter bodies fed via stdin (heredocs or `cat <<EOF | python3`, etc.)
  for (const inv of extractStdinInterpreterInvocations(cmd)) {
    if (interpreterWritesHarness(inv, cmd, ref, repoRoot, depth)) return true;
  }

  const cleaned = parseHeredocs(cmd).strippedAll;
  if (!ref.test(cleaned)) return false;
  for (const seg of splitShellSegments(cleaned)) {
    if (!ref.test(seg)) continue;
    if (hasUnquotedHarnessRedirect(seg, ref)) return true;
    const inline = extractInlineInterpreter(seg);
    if (inline && interpreterWritesHarness(inline, seg, ref, repoRoot, depth)) return true;
    const unquoted = stripQuotedLiterals(seg);
    if (HARNESS_WRITE_VERB.test(unquoted)) return true;
    // cp/install/ln/Copy-Item: only the destination (last argument) matters.
    if (/(^|\s)(cp|install|ln|Copy-Item)\s/i.test(unquoted)) {
      const last = tokenizeShellSegment(seg).filter((a) => !a.startsWith("-")).pop() || "";
      if (ref.test(` ${last}`)) return true;
    }
  }
  return false;
}

/** Read a file relative to cwd or repoRoot; returns "" on error. */
function readBodyFileSafe(file, repoRoot) {
  for (const f of [file, path.resolve(repoRoot, file)]) {
    try {
      return readFileSync(f, "utf8");
    } catch {}
  }
  return "";
}

/** Body text a gh pr create or gh api POST .../pulls will publish (inline --body, --body-file, -f body=..., -F body=@file, --input). */
function prBodyText(cmd, repoRoot) {
  const m = cmd.match(/--body-file[\s=]+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (m) {
    return readBodyFileSafe(m[1] || m[2] || m[3], repoRoot);
  }
  // gh api -F body=@file / --field body=@file
  const apiFile = cmd.match(/(?:^|\s)(?:-F|--field)(?:[\s=]+)["']?body=@([^"'\s]+)["']?/);
  if (apiFile) {
    return readBodyFileSafe(apiFile[1], repoRoot);
  }
  // gh api -f body=... / -F body=... / --raw-field body=... / --field body=...
  const apiInline = cmd.match(/(?:^|\s)(?:-[fF]|--(?:raw-)?field)(?:[\s=]+)(?:"body=([^"]*)"|'body=([^']*)'|body=("[^"]*"|'[^']*'|\S+))/);
  if (apiInline) {
    const val = apiInline[1] ?? apiInline[2] ?? apiInline[3] ?? "";
    return val.replace(/^(["'])([\s\S]*)\1$/, "$2");
  }
  // gh api --input file.json
  const apiInput = cmd.match(/(?:^|\s)--input[\s=]+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (apiInput) {
    const raw = readBodyFileSafe(apiInput[1] || apiInput[2] || apiInput[3], repoRoot);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.body === "string") return parsed.body;
      } catch {}
      return raw;
    }
  }
  return cmd;
}

/** True when a gh pr/api segment has `--repo/-R owner/name` flags and all differ from the origin of repoRoot. */
function targetsOtherRepo(cmd, repoRoot) {
  if (!/(^|[(\s])gh\s+(pr|api)\s/.test(cmd)) return false;
  let repos;
  if (/(^|[(\s])gh\s+api\s/.test(cmd)) {
    // gh api ignores --repo: the target is the `repos/<owner>/<name>/` path ({owner}/{repo} = this repo).
    // Path traversal (`..`, `%2e`) could point the request back at this repo: never exempt it.
    if (/repos\/[^\s"']*(\.\.|%2e)/i.test(cmd)) return false;
    repos = [...cmd.matchAll(/repos\/([\w.-]+\/[\w.-]+)\//g)].map((m) => m[1].toLowerCase());
  } else {
    repos = [...cmd.matchAll(/(?:--repo|\s-R)[\s=]+["']?([\w.-]+\/[\w.-]+)/g)].map((m) => m[1].toLowerCase());
  }
  if (!repos.length) return false;
  const res = spawnSync("git", ["remote", "get-url", "origin"], { cwd: repoRoot, encoding: "utf8" });
  const origin = res.status === 0 ? res.stdout.trim().match(/[/:]([\w.-]+\/[\w.-]+?)(\.git)?$/) : null;
  return Boolean(origin) && repos.every((r) => r !== origin[1].toLowerCase());
}

/**
 * Runs harness-merge-check.mjs for the PR selector; returns "" if mergeable, else the reasons.
 * Verify only: the required `harness/merge-check` status is posted by CI (GitHub Actions app). A status posted
 * here by the user would be newer, would not count for branch protection and would hide the CI one.
 */
function mergeCheck(selector, repoRoot) {
  const script = path.join(here, "..", "scripts", "harness-merge-check.mjs");
  const args = [script];
  if (selector) args.push(selector);
  const res = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" });
  return res.status === 0 ? "" : (res.stderr || res.stdout || "merge check failed").trim();
}

const SHELL_POLLING_MESSAGE =
  "Polling prohibido. Para CI: `node harness-kit/core/scripts/harness-pr-status.mjs <n> --wait-checks` (una sola llamada) o `multica issue wakeup --until-pr checks`. Para hijos/estados: `--until-children-done` / `--until-status`. Para esperar un servidor local en E2E, juntá la espera y la verificación (`Invoke-WebRequest`/`curl`/`Test-NetConnection`/`Get-NetTCPConnection` contra `localhost`) en un solo comando.";

const LOOP_KEYWORDS = new Set(["while", "for", "do", "until", "foreach", "foreach-object"]);
const CLAUSE_PREFIX_KEYWORDS = new Set([
  "do",
  "then",
  "else",
  "elif",
  "try",
  "catch",
  "finally",
  "!",
  "time",
  "command",
  "builtin",
  "exec",
  "until",
]);
const LOCAL_CHECK_PROGRAMS = new Set([
  "invoke-webrequest",
  "curl",
  "test-netconnection",
  "get-nettcpconnection",
]);
const LOCAL_HOST_TOKEN_RE = /^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/.*)?$/i;

/** Split a shell command into clauses by operators and unquoted block braces `{` / `}` (ignoring `${...}`). */
function splitPollingClauses(cmd) {
  const clauses = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      cur += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < cmd.length) {
        cur += ch + cmd[++i];
        continue;
      }
      if (ch === '"') quote = null;
      cur += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < cmd.length) {
      cur += ch + cmd[++i];
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === ";" || ch === "\n" || ch === "}") {
      if (cur.trim()) clauses.push(cur);
      cur = "";
      continue;
    }
    if (ch === "{" && cmd[i - 1] !== "$") {
      if (cur.trim()) clauses.push(cur);
      cur = "";
      continue;
    }
    if (ch === "|") {
      if (cur.trim()) clauses.push(cur);
      cur = "";
      if (cmd[i + 1] === "|" || cmd[i + 1] === "&") i++;
      continue;
    }
    if (ch === "&") {
      const prev = cmd[i - 1] || "";
      const next = cmd[i + 1] || "";
      if (prev === ">" || prev === "<" || next === ">") {
        cur += ch;
        continue;
      }
      if (cur.trim()) clauses.push(cur);
      cur = "";
      if (next === "&") i++;
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) clauses.push(cur);
  return clauses;
}

function parseDurationSecondsToken(raw) {
  const m = String(raw || "").trim().match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)?$/i);
  if (!m) return null;
  const val = Number(m[1]);
  if (!Number.isFinite(val)) return null;
  const unit = (m[2] || "s").toLowerCase();
  if (unit === "ms") return val / 1000;
  if (unit === "m") return val * 60;
  if (unit === "h") return val * 3600;
  if (unit === "d") return val * 86400;
  return val;
}

function programBaseName(token) {
  const cleaned = String(token || "").trim().replace(/^&/, "");
  const base = cleaned.split(/[/\\]/).pop() || "";
  return base.replace(/\.exe$/i, "").toLowerCase();
}

function parseNonNegativeNumber(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const num = Number(s);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

/**
 * Detect wait duration in seconds if a clause's program is a wait command, or null otherwise.
 * Matches: Start-Sleep, sleep, cmd `timeout /t <n>`, and `ping -n <n> 127.0.0.1`.
 */
function parseWaitClauseSeconds(tokens) {
  if (tokens.length === 0) return null;
  const prog = programBaseName(tokens[0]);
  const args = tokens.slice(1);

  if (prog === "start-sleep" || prog === "sleep") {
    if (args.length === 0) return null;
    let total = 0;
    let found = false;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      const lower = a.toLowerCase();
      const colonMatch = lower.match(/^-(seconds?|sec|s|milliseconds?|millis?|ms|m):(.+)$/);
      if (colonMatch) {
        const isMs = colonMatch[1].startsWith("m");
        const num = parseNonNegativeNumber(colonMatch[2]);
        total += num !== null ? (isMs ? num / 1000 : num) : Infinity;
        found = true;
        continue;
      }
      if (/^-(seconds?|sec|s)$/i.test(a)) {
        const next = args[++i];
        const secs = parseDurationSecondsToken(next);
        total += secs === null ? Infinity : secs;
        found = true;
        continue;
      }
      if (/^-(milliseconds?|millis?|ms|m)$/i.test(a)) {
        const next = args[++i];
        const num = parseNonNegativeNumber(next);
        total += num !== null ? num / 1000 : Infinity;
        found = true;
        continue;
      }
      if (a.startsWith("-")) continue;
      const secs = parseDurationSecondsToken(a);
      total += secs === null ? Infinity : secs;
      found = true;
    }
    return found ? total : null;
  }

  // cmd `timeout /t <n>` only; coreutils `timeout <n> <cmd>` does NOT count.
  if (prog === "timeout") {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (/^\/t$/i.test(a)) {
        const next = args[++i];
        const num = parseNonNegativeNumber(next);
        return num !== null ? num : Infinity;
      }
      const inline = a.match(/^\/t:(.+)$/i);
      if (inline) {
        const num = parseNonNegativeNumber(inline[1]);
        return num !== null ? num : Infinity;
      }
    }
    return null;
  }

  // `ping -n <n> 127.0.0.1`
  if (prog === "ping") {
    const targetsLoopback = args.some((a) => a === "127.0.0.1");
    if (!targetsLoopback) return null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (/^[-/]n$/i.test(a)) {
        const next = args[++i];
        const count = parseNonNegativeNumber(next);
        return count !== null ? Math.max(0, count - 1) : Infinity;
      }
      const inline = a.match(/^[-/]n:?(.+)$/i);
      if (inline) {
        const count = parseNonNegativeNumber(inline[1]);
        return count !== null ? Math.max(0, count - 1) : Infinity;
      }
    }
    return null;
  }

  return null;
}

function isStatusPollClause(tokens) {
  if (tokens.length === 0) return false;
  const rawProg = tokens[0];
  const prog = programBaseName(rawProg);
  const args = tokens.slice(1);

  if (prog === "gh") {
    const pos = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-R" || a === "--repo" || a === "--hostname") {
        i++;
        continue;
      }
      if (a.startsWith("-")) continue;
      pos.push(a.toLowerCase());
      if (pos.length >= 2) break;
    }
    if (pos[0] === "pr" && (pos[1] === "checks" || pos[1] === "view")) return true;
    if (pos[0] === "run" && (pos[1] === "view" || pos[1] === "list" || pos[1] === "watch")) return true;
    return false;
  }

  if (prog === "multica" || /MULTICA_CLI_PATH/i.test(rawProg)) {
    for (const a of args) {
      if (a.startsWith("-")) continue;
      const lower = a.toLowerCase();
      if (lower === "get" || lower === "status" || lower === "runs" || lower === "list") return true;
    }
  }

  return false;
}

function isLocalCheckClause(tokens) {
  if (tokens.length < 2) return false;
  const prog = programBaseName(tokens[0]);
  if (!LOCAL_CHECK_PROGRAMS.has(prog)) return false;
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (LOCAL_HOST_TOKEN_RE.test(tok)) return true;
    const eqIdx = tok.search(/[=:]/);
    if (eqIdx > 0 && tok.startsWith("-")) {
      const val = tok.slice(eqIdx + 1);
      if (LOCAL_HOST_TOKEN_RE.test(val)) return true;
    }
  }
  return false;
}

/**
 * Evaluate active waits and polling (`shell.polling` block vs `shell.wait` allow telemetry).
 * Returns null if the command has no wait segment.
 */
export function evaluateShellPolling(cmd) {
  const clean = stripHeredocBodies(cmd);
  const clauses = splitPollingClauses(clean);

  let hasWait = false;
  let totalWaitSeconds = 0;
  let hasLoop = false;
  let hasStatusPoll = false;
  let hasLocalCheck = false;

  for (const clause of clauses) {
    let tokens = tokenizeShellSegment(clause);
    if (tokens.length === 0) continue;

    // Peel leading control keywords, variable assignments, and PowerShell `$x =` assignments.
    let idx = 0;
    while (idx < tokens.length) {
      const t = tokens[idx];
      const lower = t.toLowerCase();
      if (LOOP_KEYWORDS.has(lower)) {
        hasLoop = true;
      }
      if (CLAUSE_PREFIX_KEYWORDS.has(lower)) {
        idx++;
        continue;
      }
      if (/^[A-Za-z_]\w*=/.test(t)) {
        idx++;
        continue;
      }
      if (/^\$[A-Za-z_][\w:]*$/.test(t) && tokens[idx + 1] === "=") {
        idx += 2;
        continue;
      }
      break;
    }

    const effective = tokens.slice(idx);
    if (effective.length === 0) continue;

    const firstLower = effective[0].toLowerCase();
    if (LOOP_KEYWORDS.has(firstLower)) {
      hasLoop = true;
    }

    const waitSecs = parseWaitClauseSeconds(effective);
    if (waitSecs !== null) {
      hasWait = true;
      totalWaitSeconds += waitSecs;
      continue;
    }

    if (isStatusPollClause(effective)) {
      hasStatusPoll = true;
    }
    if (isLocalCheckClause(effective)) {
      hasLocalCheck = true;
    }
  }

  if (!hasWait) return null;

  if (hasStatusPoll || hasLoop || (totalWaitSeconds > 5 && !hasLocalCheck)) {
    return {
      allowed: false,
      ruleId: "shell.polling",
      reason: SHELL_POLLING_MESSAGE,
    };
  }

  return {
    allowed: true,
    ruleId: "shell.wait",
  };
}

/**
 * Strip heredoc bodies (both closed and truncated/unclosed) and PowerShell here-strings
 * line by line, respecting quotes on header lines.
 */
function stripAllHeredocBodies(cmd) {
  return parseHeredocs(cmd).strippedAll;
}

/** Read a `$(...)` command substitution starting at `start` (pointing at `$`), returning `{ content, end }`. */
function readDollarSub(str, start) {
  let i = start + 2; // past "$("
  let depth = 1;
  let quote = null;
  let content = "";
  while (i < str.length && depth > 0) {
    const ch = str[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      content += ch;
      i++;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < str.length) {
        content += ch + str[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        quote = null;
        content += ch;
        i++;
        continue;
      }
      if (ch === "$" && str[i + 1] === "(") {
        const nested = readDollarSub(str, i);
        content += "$(" + nested.content + (nested.closed ? ")" : "");
        i = nested.end;
        continue;
      }
      content += ch;
      i++;
      continue;
    }
    if (ch === "\\" && i + 1 < str.length) {
      content += ch + str[i + 1];
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      content += ch;
      i++;
      continue;
    }
    if (ch === "(") {
      depth++;
      content += ch;
      i++;
      continue;
    }
    if (ch === ")") {
      depth--;
      if (depth === 0) return { content, end: i + 1, closed: true };
      content += ch;
      i++;
      continue;
    }
    content += ch;
    i++;
  }
  return { content, end: i, closed: false };
}

/** Read a backtick command substitution starting at `start` (pointing at `` ` ``). */
function readBacktickSub(str, start, inDoubleQuotes) {
  let i = start + 1;
  let content = "";
  while (i < str.length) {
    const ch = str[i];
    if (ch === "\\" && i + 1 < str.length) {
      const next = str[i + 1];
      if (next === "$" || next === "`" || next === "\\" || (inDoubleQuotes && next === '"')) {
        content += next;
      } else {
        content += ch + next;
      }
      i += 2;
      continue;
    }
    if (ch === "`") {
      return { content, end: i + 1 };
    }
    content += ch;
    i++;
  }
  return { content, end: i };
}

/**
 * Extract top-level segments and any command substitutions (`$(...)` and backticks)
 * outside single quotes (including inside double quotes). Strips shell `#` comments.
 */
function extractShellCommandsAndSubs(cmd) {
  const clean = stripAllHeredocBodies(cmd);
  const subs = [];
  let stripped = "";
  let quote = null;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      stripped += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < clean.length) {
        stripped += ch + clean[i + 1];
        i++;
        continue;
      }
      if (ch === '"') {
        quote = null;
        stripped += ch;
        continue;
      }
      if (ch === "$" && clean[i + 1] === "(") {
        const sub = readDollarSub(clean, i);
        subs.push(sub.content);
        i = sub.end - 1;
        continue;
      }
      if (ch === "`") {
        const sub = readBacktickSub(clean, i, true);
        subs.push(sub.content);
        i = sub.end - 1;
        continue;
      }
      stripped += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < clean.length) {
      stripped += ch + clean[i + 1];
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      stripped += ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /[\s;|&(\n]/.test(clean[i - 1]))) {
      while (i < clean.length && clean[i] !== "\n") i++;
      if (i < clean.length) stripped += "\n";
      continue;
    }
    if (ch === "$" && clean[i + 1] === "(") {
      const sub = readDollarSub(clean, i);
      subs.push(sub.content);
      i = sub.end - 1;
      continue;
    }
    if (ch === "`") {
      const sub = readBacktickSub(clean, i, false);
      subs.push(sub.content);
      i = sub.end - 1;
      continue;
    }
    stripped += ch;
  }
  return { segments: splitShellSegments(stripped), subs };
}

const GH_CMD_PREFIX_KEYWORDS = new Set([
  "if",
  "then",
  "elif",
  "else",
  "do",
  "while",
  "until",
  "!",
  "time",
  "nohup",
  "exec",
  "command",
  "builtin",
  "sudo",
  "env",
  "&",
]);

const GH_PR_MERGE_VALUE_FLAGS = new Set([
  "-b",
  "--body",
  "-F",
  "--body-file",
  "-t",
  "--subject",
  "--author-email",
  "--match-head-commit",
  "-R",
  "--repo",
]);

const START_PROCESS_FLAGS = new Set([
  "-wait",
  "-nonewwindow",
  "-passthru",
  "-workingdirectory",
  "-windowstyle",
  "-verb",
  "-credential",
  "-redirectstandardinput",
  "-redirectstandardoutput",
  "-redirectstandarderror",
  "-useNewEnvironment".toLowerCase(),
  "-loaduserprofile",
  "-environment",
  "-filepath",
  "-argumentlist",
  "-args",
]);

/**
 * Unwrap PowerShell `Start-Process [-FilePath] <bin> [-ArgumentList <args>] ...`
 * into an equivalent token array `[bin, ...args]`, or null if not a Start-Process call.
 */
function unwrapStartProcess(tokens, idx) {
  const bin = tokens[idx].split(/[/\\]/).pop().replace(/\.exe$/i, "").toLowerCase();
  if (bin !== "start-process" && bin !== "saps" && bin !== "start") return null;
  let filePath = "";
  const argTokens = [];
  for (let j = idx + 1; j < tokens.length; j++) {
    const t = tokens[j];
    const tl = t.toLowerCase();
    if (tl === "-filepath") {
      if (tokens[j + 1]) filePath = tokens[++j];
      continue;
    }
    if (tl === "-argumentlist" || tl === "-args") {
      j++;
      while (j < tokens.length) {
        const at = tokens[j];
        if (START_PROCESS_FLAGS.has(at.toLowerCase())) {
          j--;
          break;
        }
        argTokens.push(at);
        j++;
      }
      continue;
    }
    if (START_PROCESS_FLAGS.has(tl)) {
      // Flags with a value argument
      if (tl !== "-wait" && tl !== "-nonewwindow" && tl !== "-passthru" && tl !== "-usenewenvironment" && tl !== "-loaduserprofile") {
        j++;
      }
      continue;
    }
    if (!filePath && !t.startsWith("-")) {
      filePath = t;
    } else if (filePath && !t.startsWith("-") && argTokens.length === 0) {
      // Positional -ArgumentList (`Start-Process gh 'pr','create','--fill'` or `'pr', 'create', '--fill'`)
      argTokens.push(t);
      while (
        j + 1 < tokens.length &&
        (argTokens[argTokens.length - 1].endsWith(",") || tokens[j + 1] === "," || tokens[j + 1].startsWith(","))
      ) {
        const next = tokens[j + 1];
        if (START_PROCESS_FLAGS.has(next.toLowerCase())) break;
        argTokens.push(next);
        j++;
      }
    }
  }
  if (!filePath) return null;
  const flatArgs = [];
  for (const raw of argTokens) {
    const cleaned = raw.replace(/^@\(/, "").replace(/\)$/, "");
    // Comma-separated PowerShell list (`'pr','create','--fill'` -> `pr,create,--fill`)
    const parts = cleaned.includes(",") ? cleaned.split(",") : [cleaned];
    for (const part of parts) {
      const p = part.trim().replace(/^['"]|['"]$/g, "");
      if (!p) continue;
      if (/\s/.test(p) && parts.length === 1 && argTokens.length === 1) {
        flatArgs.push(...tokenizeShellSegment(p));
      } else {
        flatArgs.push(p);
      }
    }
  }
  return [filePath, ...flatArgs];
}

/** Extract PR selector from `gh pr merge` arguments. */
function extractGhMergeSelector(args) {
  for (let a = 0; a < args.length; a++) {
    const tok = args[a];
    if (GH_PR_MERGE_VALUE_FLAGS.has(tok)) {
      a++;
      continue;
    }
    if (tok.startsWith("-")) continue;
    return tok;
  }
  return "";
}

/** Inspect a `gh` token list (`tokens[idx]` is `gh`) and push any PR create/merge/API matches. */
function matchGhTokens(tokens, idx, trimmed, matches) {
  const bin = tokens[idx].split(/[/\\]/).pop().replace(/\.exe$/i, "").toLowerCase();
  if (bin !== "gh") return;

  // Skip optional global flags before subcommand (`gh -R owner/repo pr create`)
  let k = idx + 1;
  while (k < tokens.length && tokens[k].startsWith("-")) {
    if (tokens[k] === "-R" || tokens[k] === "--repo") k += 2;
    else k += 1;
  }

  const subcmd = tokens[k]?.toLowerCase();
  const action = tokens[k + 1]?.toLowerCase();
  if (subcmd === "pr" && (action === "create" || action === "new")) {
    matches.push({ action: "pr.create", segment: trimmed, args: tokens.slice(k + 2) });
  } else if (subcmd === "pr" && action === "merge") {
    const args = tokens.slice(k + 2);
    matches.push({ action: "pr.merge", segment: trimmed, args, selector: extractGhMergeSelector(args) });
  } else if (subcmd === "api") {
    const apiArgs = tokens.slice(k + 1);
    let foundMerge = false;
    for (const a of apiArgs) {
      const m = a.match(/pulls\/(\d+)\/merge/i);
      if (m) {
        matches.push({ action: "api.merge", segment: trimmed, args: apiArgs, selector: m[1] });
        foundMerge = true;
        break;
      }
    }
    if (!foundMerge) {
      // A1: REST PR creation: `gh api` on `repos/<o>/<r>/pulls` (no PR number) with explicit or implicit POST.
      const hasPullsCreateEndpoint = apiArgs.some(
        (a) => !a.startsWith("-") && /^\/?repos\/[^/\s]+\/[^/\s]+\/pulls\/?(?:\?.*)?$/i.test(a)
      );
      if (hasPullsCreateEndpoint) {
        let explicitMethod = null;
        let hasBodyField = false;
        for (let i = 0; i < apiArgs.length; i++) {
          const tok = apiArgs[i];
          if (tok === "-X" || tok === "--method") {
            explicitMethod = (apiArgs[i + 1] || "").toUpperCase();
            i++;
            continue;
          }
          const xm = tok.match(/^(?:-X=?|--method=)(.+)$/i);
          if (xm) {
            explicitMethod = xm[1].toUpperCase();
            continue;
          }
          if (
            tok === "-f" ||
            tok === "-F" ||
            tok === "--field" ||
            tok === "--raw-field" ||
            tok === "--input" ||
            /^-[fF].+/.test(tok) ||
            /^--(?:field|raw-field|input)=/.test(tok)
          ) {
            hasBodyField = true;
          }
        }
        const isPost = explicitMethod ? explicitMethod === "POST" : hasBodyField;
        if (isPost) {
          matches.push({ action: "pr.create", viaApi: true, segment: trimmed, args: apiArgs });
        }
      }
    }
  }
}

/** Strip shell `#` comments outside quotes. */
function stripUnquotedComments(str) {
  let out = "";
  let quote = null;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      out += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === "\\" && i + 1 < str.length) {
        out += ch + str[++i];
        continue;
      }
      if (ch === '"') quote = null;
      out += ch;
      continue;
    }
    if (ch === "\\" && i + 1 < str.length) {
      out += ch + str[++i];
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /[\s;|&(\n]/.test(str[i - 1]))) {
      while (i < str.length && str[i] !== "\n") i++;
      if (i < str.length) out += "\n";
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Detect `gh pr create`, `gh pr merge`, `gh api .../pulls` POST, and `gh api .../pulls/<n>/merge`
 * invocations in real command position (ignoring single quotes, double-quoted literals outside
 * `$(...)`/backticks, and data heredoc bodies; recursing into `bash -c`, `sh -c`, `pwsh -Command`,
 * `eval`, `cmd /c`, `iex`, `Start-Process`, stdin-fed interpreters, and Python/Node shell calls).
 */
export function detectGhPrCommands(rawCmd, depth = 0) {
  if (depth > 5 || !rawCmd) return [];
  // R1: `bash -c "$(cat <<'EOF' … EOF)"`, `eval "$(cat <<EOF …)"` and a bare `$(cat <<EOF …)` run the heredoc body.
  const cmd = inlineHeredocSubstitutions(rawCmd);
  const matches = [];

  // A2: check stdin-fed interpreters (`bash <<EOF`, `cat <<EOF | sh`, `echo "..." | bash`, etc.)
  for (const inv of extractStdinInterpreterInvocations(cmd)) {
    if (inv.kind === "shell" || inv.kind === "pwsh") {
      matches.push(...detectGhPrCommands(inv.code, depth + 1));
    } else if (inv.kind === "python" || inv.kind === "node") {
      for (const subCmd of extractInterpreterShellCommands(inv.code, inv.kind)) {
        matches.push(...detectGhPrCommands(subCmd, depth + 1));
      }
    }
  }

  const { segments, subs } = extractShellCommandsAndSubs(cmd);

  for (const sub of subs) {
    matches.push(...detectGhPrCommands(sub, depth + 1));
  }

  for (const seg of segments) {
    const trimmed = seg.trim().replace(/^[{(\s]+/, "").replace(/[})\s]+$/, "");
    if (!trimmed) continue;

    // Recurse into `bash -c`, `sh -c`, `pwsh -Command`, `eval`, `cmd /c`, `iex`, and Python/Node shell calls.
    const inline = extractInlineInterpreter(trimmed);
    if (inline) {
      if (inline.kind === "shell" || inline.kind === "pwsh") {
        matches.push(...detectGhPrCommands(inline.code, depth + 1));
        continue;
      }
      if (inline.kind === "python" || inline.kind === "node") {
        for (const subCmd of extractInterpreterShellCommands(inline.code, inline.kind)) {
          matches.push(...detectGhPrCommands(subCmd, depth + 1));
        }
      }
    }

    const tokens = tokenizeShellSegment(trimmed);
    const idx = skipCommandWrappers(tokens);
    if (idx >= tokens.length) continue;

    // PowerShell `Start-Process gh -ArgumentList 'pr','create',...`
    const spTokens = unwrapStartProcess(tokens, idx);
    if (spTokens) {
      matchGhTokens(spTokens, 0, spTokens.join(" "), matches);
      const spInline = extractInlineInterpreter(spTokens.join(" "));
      if (spInline && (spInline.kind === "shell" || spInline.kind === "pwsh")) {
        matches.push(...detectGhPrCommands(spInline.code, depth + 1));
      }
      continue;
    }

    matchGhTokens(tokens, idx, trimmed, matches);
  }

  // A1 safety net: if the structural detector found nothing at top level, run the legacy regex
  // on the command stripped of data heredocs, comments, and quoted literals so an unknown wrapper
  // cannot reopen the bypass.
  if (depth === 0 && matches.length === 0) {
    const safeText = stripQuotedLiterals(stripUnquotedComments(parseHeredocs(cmd).strippedAll));
    if (/(^|[;&|(\s])gh(?:\s+(?:-R|--repo)\s+\S+)?\s+pr\s+(?:create|new)(\s|$)/i.test(safeText)) {
      matches.push({ action: "pr.create", segment: cmd, args: [], safetyNet: true });
    } else {
      const mm = safeText.match(/(^|[;&|(\s])gh(?:\s+(?:-R|--repo)\s+\S+)?\s+pr\s+merge((?:\s+[^;&|\n]*)?)/i);
      if (mm) {
        const args = tokenizeShellSegment(mm[2] || "");
        matches.push({ action: "pr.merge", segment: cmd, args, selector: extractGhMergeSelector(args), safetyNet: true });
      } else {
        const am = safeText.match(/(^|[;&|(\s])gh\s+api\s+[^;&|\n]*pulls\/(\d+)\/merge/i);
        if (am) {
          matches.push({ action: "api.merge", segment: cmd, args: [], selector: am[2], safetyNet: true });
        }
      }
    }
  }

  return matches;
}

/** Evaluate shell commands. */
function evaluateShell(call, repoRoot, depth = 0) {
  const cmd = call.command || "";
  if (!cmd) return { allowed: true };

  // Multica comment list
  if (/multica\s+issue\s+comment\s+list/i.test(cmd)) {
    if (/--output[\s=]+json/i.test(cmd)) {
      if (
        !/--compact/i.test(cmd) ||
        !/--roots-only|--summary|--thread|--since/i.test(cmd)
      ) {
        return {
          allowed: false,
          ruleId: "multica.comment-bounded",
          reason:
            "multica issue comment list with --output json must be bounded: multica issue comment list <id> --roots-only --summary --compact --output json",
        };
      }
    }
  } else if (/multica\s+issue\s+list/i.test(cmd)) {
    if (/--output[\s=]+json/i.test(cmd)) {
      if (!/--limit[\s=]+[0-9]+/i.test(cmd)) {
        return {
          allowed: false,
          ruleId: "multica.issue-bounded",
          reason:
            "multica issue list with --output json must include --limit <N> (e.g. --limit 15) to avoid dumping the whole backlog.",
        };
      }
    }
  } else if (/multica\s+issue\s+search/i.test(cmd)) {
    if (!/--project[\s=]+[^\s"']+/i.test(cmd)) {
      return {
        allowed: false,
        ruleId: "multica.search-bounded",
        reason:
          "multica issue search must include --project <id> to bound search scope.",
      };
    }
  }

  // Multica daemon protection
  if (
    /(^|[^\w])(killall|pkill|taskkill)(\s|$)/i.test(cmd) &&
    /multica(\.exe)?/i.test(cmd)
  ) {
    return {
      allowed: false,
      ruleId: "multica.daemon-protect",
      reason:
        "Terminating multica or multica.exe by process name is forbidden (protects the workspace daemon).",
    };
  }

  // Reading installed guard in shell
  if (
    /(\.claude[/\\]hooks([/\\]|$)|\.gemini[/\\]config[/\\]hooks\.json)/i.test(cmd) &&
    (/(^|[^a-zA-Z0-9_-])(cat|type|Get-Content|gc|head|tail|less|more|grep|rg|Select-String|sls|findstr)(\s|$)/i.test(cmd) ||
      /\[IO\.File\]::ReadAll|readFileSync/i.test(cmd) ||
      /<\s*[^|&;]*(\.claude[/\\]hooks|\.gemini[/\\]config[/\\]hooks\.json)/i.test(cmd))
  ) {
    return {
      allowed: false,
      ruleId: "read.guard-installed",
      reason:
        "La copia instalada del guard no se lee ni se modifica. El código fuente está en harness-kit/core/guard/ del repo.",
    };
  }

  // Mass cat package-lock
  if (/(^|[^a-zA-Z0-9_])cat(\s+.*)?package-lock\.json/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "shell.cat-lockfile",
      reason:
        "Do not cat package-lock.json (huge, low-signal). Use rg/Grep for the specific dependency.",
    };
  }

  // Access to .env in shell
  const envCmd = stripHeredocBodies(cmd);
  const stripped = envCmd
    .replace(/\.env\.(example|sample|template)/gi, "")
    // Code references to environment variables are not .env files.
    .replace(/(process|import\.meta)\.env\b/g, "")
    .replace(/\$env:/gi, "");
  if (/\.env([^A-Za-z0-9]|$)/.test(stripped)) {
    if (
      /(^|[^a-zA-Z0-9_-])(cat|less|more|head|tail|bat|nl|tac|xxd|od|strings|source|cp|mv|scp|rsync|dd|ln|openssl|type|gc|Get-Content|Copy-Item|Move-Item|Select-String)(\s|$)/i.test(
        envCmd
      ) ||
      />\s*[^|&;]*\.env([^A-Za-z0-9]|$)/.test(stripped) ||
      /<\s*[^|&;]*\.env([^A-Za-z0-9]|$)/.test(stripped)
    ) {
      return {
        allowed: false,
        ruleId: "shell.env-leak",
        reason:
          "Access to .env files is forbidden (may contain secrets). Only .env.example/.sample/.template are allowed.",
      };
    }
  }

  // Git force push
  // Evaluated per command segment: flags of other commands (e.g. `gh api -F`) are not push flags.
  const pushSegments = cmd
    .split(/;|&&|\|\||\|/)
    .filter((seg) => /(^|[^a-zA-Z0-9_])git(\s+-C\s+[^\s]+)?\s+.*push/i.test(seg));
  if (pushSegments.length > 0) {
    if (
      pushSegments.some(
        (seg) =>
          /--force|--force-with-lease|--mirror|--delete|push\s+.*\s\+[A-Za-z0-9_./-]|push\s+\+[A-Za-z0-9_./-]/i.test(seg) ||
          /(^|\s)-[a-zA-Z]*f[a-zA-Z]*(\s|$)/.test(seg.replace(/^.*?\bpush\b/, " "))
      )
    ) {
      return {
        allowed: false,
        ruleId: "git.force-push",
        reason:
          "Force/destructive push is forbidden (--force/-f/--mirror/--delete/+ref). Pushing to main is exclusive to @PM.",
      };
    }
  }

  // Git destructive commands
  if (/git(\s+-C\s+[^\s]+)?\s+reset(\s+.*)?--hard/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "git.reset-hard",
      reason:
        "git reset --hard is forbidden (destroys committed/uncommitted work).",
    };
  }
  if (/git(\s+-C\s+[^\s]+)?\s+clean(\s+.*)?-[a-zA-Z]*f/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "git.clean-force",
      reason: "git clean -f is forbidden (deletes untracked files).",
    };
  }
  if (/git\s+checkout\s+--\s+\./i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "git.checkout-all",
      reason:
        "git checkout -- . is forbidden (discards all working-tree changes).",
    };
  }
  if (/git\s+restore\s+(--[a-z]+\s+)*\.(\s|$)/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "git.restore-all",
      reason:
        "git restore . is forbidden (discards all working-tree changes).",
    };
  }
  if (/git\s+branch\s+(-[a-zA-Z]*\s+)*-D/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "git.branch-force-delete",
      reason: "git branch -D is forbidden (force-deletes a branch).",
    };
  }

  // Repo rewiring (git worktree, branch rename, core.hooksPath)
  // Evaluated per command segment (split by ;, &&, ||, |) so chaining or piping does not falsely trigger across unrelated commands.
  const rewireSegments = cmd.split(/;|&&|\|\||\|/);
  const isRewire = (seg) =>
    /(^|[^a-zA-Z0-9_])git\b.*?\bworktree\s+(add|move|remove|prune|repair)\b/i.test(seg) ||
    /(^|[^a-zA-Z0-9_])git\b.*?\bbranch\b.*?(\s|^)(-m|-M|--move)(\s|$)/i.test(seg) ||
    /(^|[^a-zA-Z0-9_])git\b.*?(\bconfig\b.*?\bcore\.hooksPath|(\s|^)-c\s*core\.hooksPath=)/i.test(seg);
  if (rewireSegments.some(isRewire)) {
    return {
      allowed: false,
      ruleId: "git.repo-rewire",
      reason:
        "Recablear el repo (worktrees, renombrar ramas, hooksPath) está prohibido para agentes. Si necesitas otra rama, créala con git checkout -b desde origin/main.",
    };
  }

  // rm -rf
  // Flags are separate tokens of the rm segment (file names like harness-flow.md are not flags).
  const rmSegments = cmd.split(/;|&&|\|\||\|/).filter((seg) => /(^|[^a-zA-Z0-9_-])rm(\s|$)/i.test(seg));
  if (rmSegments.length > 0) {
    const tokens = (seg) => seg.replace(/^.*?(^|[^a-zA-Z0-9_-])rm(\s|$)/i, " ").split(/\s+/);
    const isRf = (seg) => {
      const t = tokens(seg);
      const short = t.filter((x) => /^-[a-zA-Z]+$/.test(x)).join("");
      return (/[rR]/.test(short) || t.includes("--recursive")) && (/f/.test(short) || t.includes("--force"));
    };
    if (rmSegments.some(isRf)) {
      return {
        allowed: false,
        ruleId: "shell.rm-rf",
        reason: "Recursive force delete (rm -rf / -r -f / -fr) is forbidden.",
      };
    }
  }

  // PowerShell recursive force delete (Remove-Item/ri/rd/del -Recurse -Force)
  if (
    /(^|[\s;&|(])(Remove-Item|ri|rd|rmdir|del|erase)(\s|$)/i.test(cmd) &&
    /\s-r(ecurse)?\b/i.test(cmd) &&
    /\s-fo(rce)?\b/i.test(cmd)
  ) {
    return {
      allowed: false,
      ruleId: "shell.rm-rf",
      reason: "Recursive force delete (Remove-Item -Recurse -Force) is forbidden.",
    };
  }

  // curl|wget pipe to shell
  if (/(curl|wget)[^|]*\|\s*(sudo\s+)?(sh|bash|zsh)/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "shell.pipe-to-shell",
      reason: "Piping a downloaded script straight into a shell is forbidden.",
    };
  }

  // sudo (enforced in every runtime, not only Claude's permissions.deny)
  if (/(^|[;&|(`])\s*sudo(\s|$)/.test(cmd)) {
    return {
      allowed: false,
      ruleId: "shell.sudo",
      reason: "sudo is forbidden (privilege escalation).",
    };
  }

  // Unbounded cat/head/tail of a >300-line file
  const shown = oversizeCatLines(cmd, repoRoot);
  if (shown) {
    return {
      allowed: false,
      ruleId: "shell.oversize-cat",
      reason: `This would print ${shown} lines of a >300-line file. Search with rg -n first, then print a bounded range (sed -n 'A,Bp', head/tail -n <=300).`,
    };
  }

  // Branch protection / rulesets are configured by Gabriel or the PM by hand, never by an agent command.
  if (
    /(^|[;&|(\s])gh\s+api\s/.test(cmd) &&
    /(branches\/[^/\s"']+\/protection|\/rulesets)/i.test(cmd)
  ) {
    const methodMatch = cmd.match(/(?:-X\s*=?\s*|--method[\s=]+)["']?([a-zA-Z]+)["']?/i);
    const explicitMethod = methodMatch ? methodMatch[1].toUpperCase() : null;
    const isMutating = explicitMethod
      ? explicitMethod !== "GET"
      : /(^|[\s"'])(-[fF]\b|-[fF]\S|--field\b|--raw-field\b|--input\b)/.test(cmd);
    if (isMutating) {
      return {
        allowed: false,
        ruleId: "repo.protection-locked",
        reason: "Changing branch protection or rulesets is forbidden for agents (it would disable the merge gate).",
      };
    }
  }

  // Writing to harness hooks or runtime settings (Claude memory and Antigravity brain outside repo are writable)
  if (shellWritesProtected(cmd, repoRoot)) {
    return {
      allowed: false,
      ruleId: "fs.protected",
      reason:
        "Writing to .git, .git/hooks or .claude/ is forbidden (would tamper with the sandbox).",
    };
  }

  // Harness sources (harness/, harness-kit/, .github/) and generators only on an authorized harness branch
  const touchesHarness = runsHarnessGenerator(cmd) || shellWritesHarness(cmd, repoRoot);
  if (touchesHarness && !harnessBranchAuthorized(currentBranch(repoRoot))) {
    return {
      allowed: false,
      ruleId: "harness.authorized-only",
      reason:
        "Harness sources (harness/, harness-kit/, .github/, render/compose) change only on an authorized branch <type>/<issue-#>-harness-<slug> created by the PM. Lessons go to harness/experience/ via harness-learn.sh.",
    };
  }

  // gh pr create / gh pr merge (only in real command position)
  // gh segments of another repository (--repo owner/name) are governed by that repository's own harness;
  // the seal and merge rules apply to the remaining segments (a --repo elsewhere exempts nothing).
  const ghPrMatches = detectGhPrCommands(cmd).filter((m) => !targetsOtherRepo(m.segment, repoRoot));
  const createMatch = ghPrMatches.find((m) => m.action === "pr.create");
  if (createMatch) {
    const bodyText = /--body-file\b|-F\s+["']?body=@|-f\s+["']?body=|--(?:raw-)?field\s+["']?body=|--input\b/.test(createMatch.segment)
      ? prBodyText(createMatch.segment, repoRoot)
      : prBodyText(cmd, repoRoot);
    const why = sealDiagnosis(repoRoot, bodyText);
    if (why) return { allowed: false, ruleId: "pr.requires-seal", reason: why };
  }

  // The harness/merge-check status is posted only by harness-merge-check.mjs, never by hand.
  if (/gh\s+api\s+[^;&|]*statuses\//i.test(cmd) && /harness\/merge-check/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "pr.merge-check",
      reason: "The harness/merge-check status is posted only by harness-merge-check.mjs --post-status.",
    };
  }
  const mergeMatch = ghPrMatches.find((m) => m.action === "pr.merge" || m.action === "api.merge");
  if (mergeMatch) {
    const reasons = mergeCheck(mergeMatch.selector || "", repoRoot);
    if (reasons) {
      return {
        allowed: false,
        ruleId: "pr.merge-check",
        reason: `Merge blocked by harness-merge-check.mjs:\n${reasons}`,
      };
    }
  }

  // A2 / A2b: evaluate shell commands embedded inside inline/stdin interpreters (os.system,
  // subprocess.run, child_process.execSync, eval, cmd /c, iex, bash <<EOF, echo ... | bash)
  // with the same shell rules as direct invocations.
  if (depth < 5) {
    const nestedShells = [];
    const execCmd = inlineHeredocSubstitutions(cmd);
    for (const inv of extractStdinInterpreterInvocations(execCmd)) {
      if (inv.kind === "shell" || inv.kind === "pwsh") nestedShells.push(inv.code);
      else if (inv.kind === "python" || inv.kind === "node") {
        nestedShells.push(...extractInterpreterShellCommands(inv.code, inv.kind));
      }
    }
    for (const seg of splitShellSegments(parseHeredocs(execCmd).strippedAll)) {
      const inline = extractInlineInterpreter(seg);
      if (!inline) continue;
      if (inline.kind === "shell" || inline.kind === "pwsh") nestedShells.push(inline.code);
      else if (inline.kind === "python" || inline.kind === "node") {
        nestedShells.push(...extractInterpreterShellCommands(inline.code, inline.kind));
      }
    }
    for (const subCmd of nestedShells) {
      if (!subCmd || subCmd.trim() === cmd.trim()) continue;
      const subRes = evaluateShell({ ...call, command: subCmd }, repoRoot, depth + 1);
      if (subRes && subRes.allowed === false) return subRes;
    }
  }

  // Active waits & polling (`shell.polling` block / `shell.wait` telemetry allow)
  const pollingResult = evaluateShellPolling(cmd);
  if (pollingResult) return pollingResult;

  return { allowed: true };
}

/** Generated artifacts as recorded by harness-render.mjs in harness/harness.lock. */
function generatedArtifacts(repoRoot) {
  try {
    const lock = JSON.parse(readFileSync(path.join(repoRoot, "harness", "harness.lock"), "utf8"));
    return new Set([...Object.keys(lock.artifacts || {}), "harness/harness.lock"]);
  } catch {
    return new Set();
  }
}

/** Evaluate write operations (Write, Edit, replace, etc.). */
function evaluateWrite(call, repoRoot) {
  const target = call.targetPath || "";
  if (!target) return { allowed: true };

  const norm = path.posix.normalize(target.replace(/\\/g, "/"));

  // Protect AGENTS.md
  if (norm === "AGENTS.md" || norm.endsWith("/AGENTS.md")) {
    return {
      allowed: false,
      ruleId: "harness.agents-render",
      reason:
        "Editing AGENTS.md directly is forbidden. Edit files under harness/ and run harness-render.mjs to generate AGENTS.md.",
    };
  }

  // Append-only on supabase/migrations/
  if (norm.includes("supabase/migrations/")) {
    const resolved = path.isAbsolute(target)
      ? target
      : path.resolve(repoRoot, target);
    if (existsSync(resolved)) {
      return {
        allowed: false,
        ruleId: "db.append-only",
        reason:
          "Modifying existing migrations in supabase/migrations/ is forbidden (append-only). Create a new migration file instead.",
      };
    }
  }

  const tamper = {
    allowed: false,
    ruleId: "fs.protected",
    reason:
      "Writing to .git/hooks or .claude/ is forbidden (would tamper with the sandbox). Same for .agents/, .gemini/ and .opencode/.",
  };

  // Protect .git, git hooks and Claude settings
  // The agent's memory (~/.claude/projects/<p>/memory/) is writable: it is the memory component, not the sandbox.
  if (
    /(^|\/)\.git(\/|$)/.test(norm) ||
    norm.includes(".git/hooks/") ||
    (norm.includes(".claude/") && (!isAgentMemoryPath(norm) || !isAgentMemoryPath(target)))
  ) {
    return tamper;
  }

  // Generated artifacts (single source: harness.lock written by the render)
  const expanded = expandHome(target);
  const resolved = path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(repoRoot, expanded);
  const rel = path.relative(path.resolve(repoRoot), resolved).replace(/\\/g, "/");
  const insideRepo = isPathInsideRepo(target, repoRoot);
  if (insideRepo && generatedArtifacts(repoRoot).has(rel)) {
    return {
      allowed: false,
      ruleId: "write.generated",
      reason: `${rel} is a generated artifact: edit \`harness/\` or \`harness-kit/\` and run render (node harness-kit/core/scripts/harness-render.mjs).`,
    };
  }

  // Protect installed guard files and ~/.gemini/config/** everywhere (even outside the repo)
  if (isInstalledGuardPath(target) || isGeminiConfigPath(target)) {
    return tamper;
  }

  // Protect the remaining runtime harness directories inside the repo; outside the repo allow only ~/.gemini/antigravity-cli/brain/**
  if (/(^|\/)\.(agents|gemini|opencode)\//i.test(norm)) {
    if (insideRepo || !isAntigravityBrainPath(target)) return tamper;
  }

  // Harness sources: only on an authorized harness branch
  if (isProtectedHarnessPath(rel) && !harnessBranchAuthorized(currentBranch(repoRoot))) {
    return {
      allowed: false,
      ruleId: "harness.authorized-only",
      reason: `${rel} is a protected harness source. It changes only on an authorized branch <type>/<issue-#>-harness-<slug> created by the PM (lessons go to harness/experience/).`,
    };
  }

  return { allowed: true };
}

/** Find noreply email for GH007 command injection. */
export function resolveNoreplyEmail(output, repoRoot) {
  const emailRegex = /([0-9]+\+[\w.-]+@users\.noreply\.github\.com|[a-zA-Z0-9_.+-]+@users\.noreply\.github\.com)/;
  const match = String(output || "").match(emailRegex);
  if (match) return match[1];

  const envEmail = process.env.HARNESS_NOREPLY_EMAIL || process.env.NOREPLY_EMAIL;
  if (envEmail) return envEmail;

  if (repoRoot) {
    const projectPath = path.join(repoRoot, "harness", "project.json");
    if (existsSync(projectPath)) {
      try {
        const proj = JSON.parse(readFileSync(projectPath, "utf8"));
        if (proj && typeof proj.bot_noreply_email === "string" && proj.bot_noreply_email.trim()) {
          return proj.bot_noreply_email.trim();
        }
      } catch {}
    }

    const memoryPath = path.join(repoRoot, "harness", "LongTermMEMORY.md");
    if (existsSync(memoryPath)) {
      try {
        const mem = readFileSync(memoryPath, "utf8");
        const memMatch = mem.match(emailRegex);
        if (memMatch) return memMatch[1];
      } catch {}
    }
  }

  return null;
}

/** Lines a failed cd (bash/sh) or Set-Location (PowerShell 5.1 and 7) print. */
const CWD_LOST_LINE = [
  /^(?:\S*sh(?:: line \d+)?: )?cd: .+: No such file or directory$/,
  /^Set-Location ?: Cannot find path '.+' because it does not exist\.?$/,
];

/**
 * Evaluate result (post-tool) rules.
 */
function evaluatePost(normalizedCall, options = {}, repoRoot = findRepoRoot()) {
  const rules = loadRules({ repoRoot, rules: options.rules });

  // 1. Shell GH007 check
  if (normalizedCall.kind === "shell") {
    const output = normalizedCall.output || "";
    const pushes = (normalizedCall.command || "")
      .split(SEGMENT_SPLIT)
      .some((seg) => /(^|[^\w-])git(\s+-C\s+\S+)?\s+push\b/i.test(seg));
    if (pushes && /GH007/i.test(output)) {
      const email = resolveNoreplyEmail(output, repoRoot);
      const instruction = email
        ? `git config --worktree user.email ${email}`
        : `set "bot_noreply_email" in harness/project.json or run: git config --worktree user.email <noreply-email>`;
      return {
        allowed: true,
        inject: true,
        ruleId: "git.gh007-noreply",
        context: `GitHub Push Protection (GH007) violation detected. Configure your noreply email: ${instruction}`,
      };
    }

    // cwd lost: only real cd/Set-Location errors on their own output line, and only where post injection exists.
    const cwdLost = output.split(/\r?\n/).some((line) => CWD_LOST_LINE.some((re) => re.test(line.trim())));
    if (normalizedCall.runtime === "claude-code" && cwdLost) {
      const rule = rules.find((r) => r.id === "remediate.cwd-lost");
      if (rule) return { allowed: true, inject: true, ruleId: rule.id, context: rule.message || rule.description };
    }
  }

  // 2. Write migration check (reminder to run tests/db/)
  if (normalizedCall.kind === "write") {
    const target = normalizedCall.targetPath || normalizedCall.filePath || "";
    if (/(^|[\\/])supabase[\\/]migrations[\\/][^/\\]+\.sql$/i.test(target)) {
      return {
        allowed: true,
        inject: true,
        ruleId: "db.migration-test-reminder",
        context: "New migration detected in supabase/migrations/. Remember to run tests: npx vitest run tests/db/",
      };
    }

    // Warn (never block) on writes outside .harness/scope.json (written by harness-init.sh --scope).
    const scopeFile = path.join(repoRoot, ".harness", "scope.json");
    if (target && existsSync(scopeFile)) {
      let scope = [];
      try {
        scope = JSON.parse(readFileSync(scopeFile, "utf8")).scope ?? [];
      } catch {}
      const rel = path.relative(repoRoot, path.resolve(repoRoot, target)).replace(/\\/g, "/");
      const inScope = scope.some((s) => {
        const prefix = String(s).replace(/\\/g, "/").replace(/\/+$/, "");
        return rel === prefix || rel.startsWith(prefix + "/");
      });
      if (scope.length && !inScope) {
        return {
          allowed: true,
          inject: true,
          ruleId: "post.outside-scope",
          context: `Warning: ${rel} is outside the declared scope in .harness/scope.json (${scope.join(", ")}).`,
        };
      }
    }
  }

  // 3. User-defined post rules from rules.json or rules.local.json
  for (const rule of rules) {
    if (rule.phase !== "post" && rule.phase !== "result") continue;
    if (rule.target && rule.target !== normalizedCall.kind && rule.target !== "all") continue;
    // Evaluated in code above (git push + output only); its declarative pattern would match any mention.
    if (rule.id === "git.gh007-noreply") continue;

    if (rule.minOutputLength && String(normalizedCall.output || "").length > rule.minOutputLength) {
      return {
        allowed: true,
        inject: true,
        ruleId: rule.id,
        context: rule.message || rule.description,
      };
    }

    if (rule.pathPattern) {
      const target = normalizedCall.targetPath || normalizedCall.filePath || "";
      if (new RegExp(rule.pathPattern, "i").test(target)) {
        return {
          allowed: true,
          inject: true,
          ruleId: rule.id,
          context: rule.message || rule.description,
        };
      }
    }

    if (rule.pattern) {
      const text = `${normalizedCall.command || ""}\n${normalizedCall.output || ""}`;
      if (new RegExp(rule.pattern, "i").test(text)) {
        return {
          allowed: true,
          inject: true,
          ruleId: rule.id,
          context: rule.message || rule.description,
        };
      }
    }
  }

  // 4. Claude Code reading/searching/editing through Bash (after declarative rules: never shadows them)
  const nativeRead = evaluateNativeRead(normalizedCall, repoRoot);
  if (nativeRead) return nativeRead;

  return { allowed: true, inject: false };
}

const NATIVE_READ_MSG =
  "En Claude Code usá `Read` (offset/limit) y `Grep`/`Glob` en lugar de `cat`/`sed`/`grep` por Bash: es una llamada menos de shell y la lectura queda acotada.";
const NATIVE_EDIT_MSG = "Usá `Edit`.";

const NATIVE_READ_LIMITERS = new Set(["head", "tail", "wc", "sort", "uniq", "less", "more"]);

/** First pipeline (quote-aware) split by single `|` before `;`, `\n`, `&&`, `||`, `&`. */
function firstPipelineOf(cmd) {
  const segs = [];
  let start = 0;
  let quote = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"') i++;
      continue;
    }
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === ";" || ch === "\n") {
      segs.push(cmd.slice(start, i));
      return segs;
    }
    if (ch === "|") {
      if (cmd[i + 1] === "|") {
        segs.push(cmd.slice(start, i));
        return segs;
      }
      segs.push(cmd.slice(start, i));
      if (cmd[i + 1] === "&") i++;
      start = i + 1;
      continue;
    }
    if (ch === "&") {
      const prev = cmd[i - 1] || "";
      const next = cmd[i + 1] || "";
      if (prev === ">" || prev === "<" || next === ">") continue;
      segs.push(cmd.slice(start, i));
      return segs;
    }
  }
  segs.push(cmd.slice(start));
  return segs;
}

/** True when a downstream piped segment is a pure output limiter (`head`, `tail`, `wc`, `sort`, `uniq`, `less`, `more`, `Select-Object -First/-Last`). */
function isNativeReadLimiter(seg) {
  const tokens = tokenizeShellSegment(seg);
  if (!tokens.length) return false;
  if (tokens.some((t) => /^(?:1?>|&>)/.test(t))) return false;
  const bin = path.basename(tokens[0].replace(/\\/g, "/")).replace(/\.exe$/i, "").toLowerCase();
  if (NATIVE_READ_LIMITERS.has(bin)) return true;
  if (bin === "select-object" || bin === "select") {
    return tokens.slice(1).some((t) => /^-(?:first|last)$/i.test(t));
  }
  return false;
}

/**
 * Classify the first pipeline of a shell command: "edit" (sed -i), "read" (cat/head/tail/sed -n/grep/rg
 * over repo files, either standalone or piped only to limiters like head/tail/wc/sort/uniq/less/more/
 * Select-Object -First/-Last) or null. Evaluates the command only, never the output.
 */
export function classifyNativeRead(command, repoRoot, cwd) {
  const pipeSegs = firstPipelineOf(String(command || ""));
  const seg = pipeSegs[0] || "";
  const downstream = pipeSegs.slice(1);
  const tokens = tokenizeShellSegment(seg);
  if (!tokens.length) return null;
  const bin = path.basename(tokens[0].replace(/\\/g, "/")).replace(/\.exe$/i, "").toLowerCase();
  const args = tokens.slice(1);

  if (bin === "sed" && args.some((t) => /^-[a-zA-Z]*i/.test(t) || /^--in-place/.test(t))) return "edit";
  if (downstream.length > 0 && !downstream.every(isNativeReadLimiter)) return null;
  // stdout/stdin redirection or heredoc (writing a file, feeding stdin): not a read of repo files
  if (args.some((t) => /^(\d*<|1?>|&>)/.test(t) || t.includes("<<"))) return null;

  const operands = args.filter((t) => !t.startsWith("-") && !/^2>/.test(t));
  let files;
  if (bin === "cat" || bin === "head" || bin === "tail") {
    files = operands.filter((t) => !/^\d+$/.test(t));
    if (!files.length) return null;
  } else if (bin === "sed") {
    if (!args.some((t) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(t) || t === "--quiet" || t === "--silent")) return null;
    files = operands.slice(1);
    if (!files.length) return null;
  } else if (bin === "grep" || bin === "rg") {
    if (!operands.length) return null;
    files = operands.slice(1);
  } else {
    return null;
  }

  const base = path.resolve(cwd || repoRoot);
  const root = path.resolve(repoRoot);
  const insideRepo = files.every((f) => {
    if (/^~/.test(f)) return false;
    const rel = path.relative(root, path.resolve(base, f));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });
  return insideRepo ? "read" : null;
}

/** Atomically claim the once-per-session marker; false when already claimed (or not writable). */
function claimSessionMarker(name, normalizedCall, repoRoot) {
  try {
    const dir = resolveTelemetryDir(repoRoot);
    mkdirSync(dir, { recursive: true });
    const session = resolveSession(normalizedCall.raw).replace(/[^\w.-]/g, "_").slice(0, 120);
    writeFileSync(path.join(dir, `${name}-${session}.flag`), new Date().toISOString(), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

/** remediate.native-read: Claude Code only (post injection), at most once per session. */
function evaluateNativeRead(normalizedCall, repoRoot) {
  if (normalizedCall.kind !== "shell" || normalizedCall.runtime !== "claude-code") return null;
  const kind = classifyNativeRead(normalizedCall.command, repoRoot, normalizedCall.cwd);
  if (!kind || !claimSessionMarker("native-read", normalizedCall, repoRoot)) return null;
  return {
    allowed: true,
    inject: true,
    ruleId: "remediate.native-read",
    context: kind === "edit" ? NATIVE_EDIT_MSG : NATIVE_READ_MSG,
  };
}

/**
 * Main evaluation entry point.
 * @param {object} normalizedCall Output of normalize(payload)
 * @param {object} [options]
 * @returns {{ allowed: boolean, reason?: string, ruleId?: string, inject?: boolean, context?: string }}
 */
export function evaluateRules(normalizedCall, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  if (normalizedCall.phase === "post" || normalizedCall.phase === "result") {
    return evaluatePost(normalizedCall, options, repoRoot);
  }

  switch (normalizedCall.kind) {
    case "shell":
      return evaluateShell(normalizedCall, repoRoot);
    case "read":
      return evaluateRead(normalizedCall, options, repoRoot);
    case "read_many":
      return evaluateReadMany(normalizedCall, repoRoot);
    case "search":
      return evaluateSearch(normalizedCall, repoRoot);
    case "write":
      return evaluateWrite(normalizedCall, repoRoot);
    default:
      return { allowed: true };
  }
}

/**
 * Check guard convenience helper: normalizes raw payload then evaluates rules.
 */
export function checkGuard(rawPayload, options = {}) {
  const normalized = normalize(rawPayload, options);
  return evaluateRules(normalized, options);
}
