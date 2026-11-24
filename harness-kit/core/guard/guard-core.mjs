/**
 * guard-core.mjs
 * Core evaluation engine for the harness guard (D6).
 * Single shared implementation used by guard-cli.mjs, guard.sh (shim),
 * and OpenCode plugins.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalize } from "./normalize.mjs";

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
        return {
          allowed: false,
          ruleId: "read.oversize",
          reason:
            "File has >300 lines. To prevent context token waste, search with rg/Grep first or call Read with offset and limit (<=300 lines).",
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

const gitBashWin = "C:\\Program Files\\Git\\bin\\bash.exe";

/** Reuses `harness-gate.sh --verify` (single seal_valid implementation). */
function sealValid(repoRoot) {
  const script = path.join(here, "..", "scripts", "harness-gate.sh").replace(/\\/g, "/");
  const bash = process.platform === "win32" && existsSync(gitBashWin) ? gitBashWin : "bash";
  const res = spawnSync(bash, [script, "--verify"], { cwd: repoRoot, encoding: "utf8" });
  return res.status === 0;
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

const SHELL_WRITE_VERB =
  /((^|[\s;&|(])(cp|mv|install|dd|truncate|chmod|tee|rm|touch|ln|patch)\s|sed\s+-i|perl\s+-p?i|git\s+(apply|am|checkout\s+\S+\s+--|restore\s+--source)|Set-Content|Add-Content|Out-File|New-Item|Copy-Item|Move-Item|Remove-Item|Rename-Item|Clear-Content|WriteAll(Text|Bytes|Lines)|\[IO\.File\])/i;
// Same verbs minus copy-like ones (cp/install/ln/Copy-Item): those only write their LAST argument.
const HARNESS_WRITE_VERB =
  /((^|[\s;&|(])(mv|dd|truncate|chmod|tee|rm|touch|patch)\s|sed\s+(?:-[a-zA-Z0-9]+\s+)*(?:-[a-zA-Z]*i|--in-place)\b|perl\s+(?:-[a-zA-Z0-9]+\s+)*-[a-zA-Z]*i\b|git\s+(apply|am|checkout\s+\S+\s+--|restore\s+--source)|Set-Content|Add-Content|Out-File|New-Item|Move-Item|Remove-Item|Rename-Item|Clear-Content|WriteAll(Text|Bytes|Lines)|\[IO\.File\])/i;
const HARNESS_GENERATORS = /^(harness-render\.mjs|harness-compose\.mjs|bootstrap\.mjs)$/i;
const SEGMENT_SPLIT = /;|&&|\|\||\||\n/;
const COMMAND_WRAPPERS = /^(node|npx|bun|env|xargs|command|&)$/i;

const PYTHON_WRITE_API = new RegExp(
  [
    "\\bopen\\s*\\((?:[^;)]|\\([^)]*\\))*?(?:,\\s*(?:mode\\s*=\\s*)?|\\bmode\\s*=\\s*)[\"'][waxr+bt]*[wax+][waxr+bt]*[\"']",
    "\\.(?:write_text|write_bytes|writelines|unlink|rename|replace|mkdir|rmdir|touch|symlink_to|hardlink_to|chmod)\\s*\\(",
    "\\b(?:os\\.(?:remove|unlink|rename|replace|rmdir|makedirs|mkdir|write|chmod|symlink|link|truncate|open)|shutil\\.(?:copy|copy2|copyfile|copytree|move|rmtree))\\s*\\(",
  ].join("|")
);
const NODE_WRITE_API = new RegExp(
  [
    "\\b(?:writeFileSync|writeFile|appendFileSync|appendFile|writeSync|createWriteStream|renameSync|rename|unlinkSync|unlink|rmSync|rmdirSync|rmdir|copyFileSync|copyFile|cpSync|mkdirSync|mkdir|truncateSync|truncate|chmodSync|chmod|symlinkSync|symlink|linkSync|link)\\s*\\(",
    "(?:\\bfs(?:Promises)?|\\bpromises|\\bfsp|require\\s*\\(\\s*[\"'](?:node:)?fs(?:\\/promises)?[\"']\\s*\\))\\.(?:write|rm|cp)\\s*\\(",
    "(?:^|[^\\w.])rm\\s*\\(",
    "\\b(?:openSync|fs\\.open|promises\\.open)\\s*\\((?:[^;)]|\\([^)]*\\))*?,\\s*[\"'][wax+]",
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
const INLINE_WRAPPERS = /^(npx|env|xargs|command|&)$/i;

function extractInlineInterpreter(seg) {
  const tokens = tokenizeShellSegment(seg);
  let i = 0;
  while (
    i < tokens.length &&
    (INLINE_WRAPPERS.test(tokens[i]) || /^\w+=/.test(tokens[i]) || (i > 0 && tokens[i].startsWith("-")))
  ) {
    i++;
  }
  if (i >= tokens.length) return null;
  const bin = tokens[i].split(/[/\\]/).pop().replace(/\.exe$/i, "").toLowerCase();

  let kind = null;
  if (/^(ba|z|da)?sh$/.test(bin)) kind = "shell";
  else if (/^python(\d+(\.\d+)*)?$/.test(bin)) kind = "python";
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
      if (/^-(?:c|command)$/i.test(t)) return tokens[j + 1] ? { kind, code: tokens.slice(j + 1).join(" ") } : null;
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

/** True if the shell command writes a protected harness source of repoRoot. */
function shellWritesHarness(cmd, repoRoot, depth = 0) {
  if (depth > 5) return false;
  const cleaned = stripHeredocBodies(cmd);
  const target = harnessPathPattern(repoRoot);
  const ref = new RegExp(target, "i");
  if (!ref.test(cleaned)) return false;
  for (const seg of splitShellSegments(cleaned)) {
    if (!ref.test(seg)) continue;
    if (hasUnquotedHarnessRedirect(seg, ref)) return true;
    const inline = extractInlineInterpreter(seg);
    if (inline) {
      if (inline.kind === "shell" || inline.kind === "pwsh") {
        if (shellWritesHarness(inline.code, repoRoot, depth + 1)) return true;
      } else {
        const targetsHarness = ref.test(inline.code) || (/\bargv\b/i.test(inline.code) && ref.test(seg));
        if (targetsHarness) {
          if (inline.kind === "python" && PYTHON_WRITE_API.test(inline.code)) return true;
          if (inline.kind === "node" && NODE_WRITE_API.test(inline.code)) return true;
          if (inline.kind === "perl" && PERL_WRITE_API.test(inline.code)) return true;
          if (inline.kind === "ruby" && RUBY_WRITE_API.test(inline.code)) return true;
        }
      }
    }
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

/** Body text a gh pr create will publish (inline --body or --body-file). */
function prBodyText(cmd, repoRoot) {
  const m = cmd.match(/--body-file[\s=]+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (m) {
    const file = m[1] || m[2] || m[3];
    for (const f of [file, path.resolve(repoRoot, file)]) {
      try {
        return readFileSync(f, "utf8");
      } catch {}
    }
    return "";
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
        const num = Number(colonMatch[2]);
        total += Number.isFinite(num) ? (isMs ? num / 1000 : num) : Infinity;
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
        const num = Number(next);
        total += Number.isFinite(num) ? num / 1000 : Infinity;
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
        const num = Number(next);
        return Number.isFinite(num) ? num : Infinity;
      }
      const inline = a.match(/^\/t:(.+)$/i);
      if (inline) {
        const num = Number(inline[1]);
        return Number.isFinite(num) ? num : Infinity;
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
        const count = Number(next);
        return Number.isFinite(count) ? Math.max(0, count - 1) : Infinity;
      }
      const inline = a.match(/^[-/]n:?(\d+)$/i);
      if (inline) {
        const count = Number(inline[1]);
        return Number.isFinite(count) ? Math.max(0, count - 1) : Infinity;
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
function evaluateShellPolling(cmd) {
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

/** Evaluate shell commands. */
function evaluateShell(call, repoRoot) {
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

  // Writing to harness hooks or runtime settings (the agent memory dir is not protected)
  const cmdNoMemory = cmd.replace(
    /(?:(["'])([^"']*\.claude[/\\]projects[/\\][^/\\]+[/\\]memory[/\\][^"']*)\1|([^\s"']*\.claude[/\\]projects[/\\][^/\\\s"']+[/\\]memory[/\\][^\s"']*))/gi,
    (match, q, pQuoted, pUnquoted) => {
      const p = pQuoted || pUnquoted;
      if (/\.\.|%2e/i.test(p)) return match;
      const norm = path.posix.normalize(p.replace(/\\/g, "/"));
      if (!isAgentMemoryPath(norm)) return match;
      return "";
    }
  );
  if (
    /(?:(?:^|[/\\"'`\s>])\.git(?:[/\\"'`\s;|&>]|$)|(\.claude|\.agents|\.gemini|\.opencode)[/\\])/i.test(cmdNoMemory)
  ) {
    // Redirect INTO a protected path, or a write verb (bash/PowerShell); plain text mentions stay allowed.
    if (
      />>?\s*["']?[^\s|&;]*((?:^|[/\\"'`\s>])\.git([/\\"'`\s;|&>]|$)|(\.claude|\.agents|\.gemini|\.opencode)[/\\])/i.test(cmdNoMemory) ||
      SHELL_WRITE_VERB.test(cmdNoMemory)
    ) {
      return {
        allowed: false,
        ruleId: "fs.protected",
        reason:
          "Writing to .git, .git/hooks or .claude/ is forbidden (would tamper with the sandbox).",
      };
    }
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

  // gh pr create requires a valid gate seal AND the seal block in the PR body
  // gh segments of another repository (--repo owner/name) are governed by that repository's own harness;
  // the seal and merge rules apply to the remaining segments (a --repo elsewhere exempts nothing).
  const ownCmd = cmd.split(/;|&&|\|\||\||\n/).filter((seg) => !targetsOtherRepo(seg, repoRoot)).join(" ; ");
  if (/(^|[;&|(\s])gh\s+pr\s+create(\s|$)/.test(ownCmd)) {
    if (!sealValid(repoRoot)) {
      return {
        allowed: false,
        ruleId: "pr.requires-seal",
        reason:
          "No valid gate seal (.harness/complete.json missing or stale for HEAD + diff). Run harness-kit/core/scripts/harness-gate.sh before gh pr create.",
      };
    }
    let fingerprint = "";
    try {
      fingerprint = JSON.parse(readFileSync(path.join(repoRoot, ".harness", "complete.json"), "utf8")).fingerprint || "";
    } catch {}
    const body = prBodyText(cmd, repoRoot);
    if (!fingerprint || !body.includes("harness-seal:") || !body.includes(fingerprint)) {
      return {
        allowed: false,
        ruleId: "pr.requires-seal",
        reason:
          "PR body must contain the seal block: run `bash harness-kit/core/scripts/harness-gate.sh --pr-block` and paste its output into the --body-file.",
      };
    }
  }

  // gh pr merge (or the REST merge endpoint) requires harness-merge-check: seal == PR head, lesson, PPC
  const mergeCmd = ownCmd.match(/(^|[;&|(\s])gh\s+pr\s+merge((?:\s+[^;&|]*)?)/);
  const apiMerge = ownCmd.match(/gh\s+api\s+[^;&|]*pulls\/(\d+)\/merge/);
  // The harness/merge-check status is posted only by harness-merge-check.mjs, never by hand.
  if (/gh\s+api\s+[^;&|]*statuses\//i.test(cmd) && /harness\/merge-check/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "pr.merge-check",
      reason: "The harness/merge-check status is posted only by harness-merge-check.mjs --post-status.",
    };
  }
  if (mergeCmd || apiMerge) {
    const selector = apiMerge
      ? apiMerge[1]
      : (mergeCmd[2] || "").trim().split(/\s+/).find((a) => a && !a.startsWith("-")) || "";
    const reasons = mergeCheck(selector, repoRoot);
    if (reasons) {
      return {
        allowed: false,
        ruleId: "pr.merge-check",
        reason: `Merge blocked by harness-merge-check.mjs:\n${reasons}`,
      };
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
  const resolved = path.isAbsolute(target) ? target : path.resolve(repoRoot, target);
  const rel = path.relative(repoRoot, resolved).replace(/\\/g, "/");
  if (generatedArtifacts(repoRoot).has(rel)) {
    return {
      allowed: false,
      ruleId: "write.generated",
      reason: `${rel} is a generated artifact: edit \`harness/\` or \`harness-kit/\` and run render (node harness-kit/core/scripts/harness-render.mjs).`,
    };
  }

  // Protect the remaining runtime harness directories
  if (/(^|\/)\.(agents|gemini|opencode)\//.test(norm)) return tamper;

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

  return { allowed: true, inject: false };
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
