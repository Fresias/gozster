/**
 * telemetry-deep.mjs — Análisis profundo de la telemetría del guard.
 *
 * Módulo versionado (invocado vía `harness-telemetry.mjs --deep`).
 * Reutiliza `filterEvents`, `summarize`, `isExcludedEvent` y `pairPrePostEvents`
 * de `harness-kit/core/scripts/harness-telemetry.mjs`, y aprovecha los campos
 * de fidelidad v2: rutas completas/relativizadas, `start`/`limit`/`bounded`,
 * `cwd`, `kind: "search"`, `id`, `ok` y duración medida (`post.ts - pre.ts`).
 *
 * Sin dependencias externas. Node >= 18. Windows y Linux. UTF-8 sin BOM.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { detectGhPrCommands, evaluateShellPolling, isAntigravityBrainPath } from "../guard/guard-core.mjs";
import { CMD_MAX, TELEMETRY_SCHEMA, resolveTelemetryDir } from "../guard/telemetry.mjs";
import {
  filterEvents,
  isExcludedEvent,
  pairPrePostEvents,
  parseJsonl,
  percentile,
  summarize,
} from "../scripts/harness-telemetry.mjs";

export const VERSION = "2.1.0";
export const LEGACY_CMD_MAX = 120;
export const V2_CMD_MAX = 300;
export const DEFAULT_GATE_MIN_SEC = 60;
const DUP_WINDOW_MS = 10 * 60 * 1000;
const JSON_TOP = 100;
const CUT_SIG_PREFIX = "(cortado a ";

// ───────────────────────────── utilidades ─────────────────────────────

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15000,
    }).trim();
  } catch {
    return null;
  }
}

function stats(values) {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return {
    n: s.length,
    p50: s.length ? percentile(s, 50) : null,
    p90: s.length ? percentile(s, 90) : null,
    p95: s.length ? percentile(s, 95) : null,
    max: s.length ? s[s.length - 1] : null,
    sum: s.reduce((a, b) => a + b, 0),
  };
}

function inc(m, k, by = 1) {
  m.set(k, (m.get(k) || 0) + by);
}
function addTo(m, k, v) {
  let a = m.get(k);
  if (!a) {
    a = [];
    m.set(k, a);
  }
  a.push(v);
}
function addSet(m, k, v) {
  let a = m.get(k);
  if (!a) {
    a = new Set();
    m.set(k, a);
  }
  a.add(v);
}
function top(m, n) {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, n);
}

const r1 = (x) => (x == null || !Number.isFinite(x) ? "–" : String(Math.round(x * 10) / 10));
const sec = (ms) => (ms == null ? "–" : r1(ms / 1000));
const mins = (ms) => (ms == null ? "–" : r1(ms / 60000));
const hrs = (ms) => (ms == null ? "–" : r1(ms / 3600000));
const pc = (a, b) => (b ? `${r1((100 * a) / b)}%` : "–");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ───────────────────────────── parseo de shell ─────────────────────────────

/**
 * Parte un comando en tramos (&&, ||, ;, |, salto de línea y bloques { } de bash/PowerShell)
 * respetando comillas y ${VAR}.
 */
function splitTopLevel(cmd) {
  const out = [];
  let cur = "";
  let q = null;
  let piped = false;
  const push = (nextPiped) => {
    const t = cur.trim();
    if (t) out.push({ text: t, piped });
    cur = "";
    piped = nextPiped;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      cur += c;
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      cur += c;
      continue;
    }
    if (c === "$" && cmd[i + 1] === "{") {
      const end = cmd.indexOf("}", i + 2);
      const stop = end < 0 ? cmd.length : end + 1;
      cur += cmd.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (c === "{" || c === "}") {
      push(false);
      continue;
    }
    if (c === ";" || c === "\n") {
      push(false);
      continue;
    }
    if (c === "&" && cmd[i + 1] === "&") {
      push(false);
      i++;
      continue;
    }
    if (c === "|" && cmd[i + 1] === "|") {
      push(false);
      i++;
      continue;
    }
    if (c === "|") {
      push(true);
      continue;
    }
    cur += c;
  }
  push(false);
  return out;
}

function tokenize(s) {
  const out = [];
  let cur = "";
  let q = null;
  let has = false;
  for (const c of s) {
    if (q) {
      if (c === q) q = null;
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (has || cur) {
        out.push(cur);
        cur = "";
        has = false;
      }
      continue;
    }
    cur += c;
  }
  if (has || cur) out.push(cur);
  return out;
}

const TRIVIAL = new Set([
  "cd",
  "set-location",
  "sl",
  "pushd",
  "popd",
  "chdir",
  "echo",
  "printf",
  "write-output",
  "write-host",
  "export",
  "set",
  "true",
  "false",
  ":",
  "clear",
  "cls",
  "$env",
  "(control)",
]);
const CD = new Set(["cd", "set-location", "sl", "pushd", "chdir"]);
const LIMITERS = new Set([
  "head",
  "tail",
  "select-object",
  "select",
  "wc",
  "measure-object",
  "grep",
  "rg",
  "findstr",
  "select-string",
  "sls",
  "out-null",
]);
const PIPE_HELPERS = new Set([
  "foreach-object",
  "%",
  "where-object",
  "?",
  "sort",
  "sort-object",
  "uniq",
  "cut",
  "awk",
  "xargs",
  "tr",
  "jq",
  "format-table",
  "ft",
  "out-string",
  "convertfrom-json",
  "tee",
  "tee-object",
]);
const CONTROL_ONLY = new Set(["for", "foreach", "done", "fi", "esac", "case", "function", "in", "[", "[[", "test"]);
const CONTROL_PREFIX = new Set(["do", "then", "else", "if", "elif", "while", "until", "!", "try", "catch", "finally"]);
const VIEW_PROGS = new Set(["cat", "type", "get-content", "gc", "head", "tail", "sed", "less", "more", "bat", "nl"]);
const VALUE_FLAGS = new Set([
  "--reporter",
  "--outputFile",
  "--outputfile",
  "-t",
  "--testNamePattern",
  "--project",
  "--config",
  "-c",
  "--root",
  "-r",
  "--dir",
  "--pool",
  "--environment",
  "--shard",
  "--maxWorkers",
  "--minWorkers",
]);

function baseProg(t) {
  return String(t)
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    .toLowerCase()
    .replace(/\.(exe|cmd|bat|ps1)$/, "");
}
function firstNonFlag(t, start) {
  for (let i = start; i < t.length; i++) if (t[i] && !t[i].startsWith("-")) return [t[i], i];
  return [null, -1];
}
function hasPositional(t, start) {
  for (let i = start; i < t.length; i++) {
    const x = t[i];
    if (x === "--") continue;
    if (/^\d?>|^[<>]/.test(x)) break;
    if (x.startsWith("-")) {
      if (VALUE_FLAGS.has(x)) i++;
      continue;
    }
    if (["run", "watch", "related", "bench", "dev"].includes(x)) continue;
    return true;
  }
  return false;
}
function npxSig(t) {
  let [pkg, i] = firstNonFlag(t, 1);
  if (!pkg) return "npx";
  pkg = pkg.replace(/(.)@[^/]*$/, "$1");
  const name = baseProg(pkg);
  if (name === "vitest") return `npx vitest ${hasPositional(t, i + 1) ? "<archivo>" : "(suite completa)"}`;
  if (["playwright", "supabase", "next", "prisma", "tsx"].includes(name)) {
    const [sub] = firstNonFlag(t, i + 1);
    return sub && /^[a-z][a-z:-]*$/.test(sub) ? `npx ${name} ${sub}` : `npx ${name}`;
  }
  return `npx ${name}`;
}

/** Firma normalizada de un tramo: programa + subcomando, sin argumentos. */
function segSig(text, depth = 0) {
  const t = tokenize(text);
  while (t.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0])) t.shift();
  if (t[0] === "&" || t[0] === ".") t.shift();
  if (t.length && /^\$(env:)?multi/i.test(t[0]) && t[1] !== "=") t[0] = "multica";
  if (t.length && /^\$env:/i.test(t[0])) return "$env";
  if (t.length && /^\$[A-Za-z_][\w:]*$/.test(t[0]) && t[1] === "=") return "$env";
  if (t.length) t[0] = t[0].replace(/^\(+/, "");
  while (t.length && !t[0]) t.shift();
  if (t[0] === "&" || t[0] === ".") t.shift();
  if (!t.length) return null;
  const kw = t[0].toLowerCase();
  if (CONTROL_ONLY.has(kw)) return "(control)";
  if (CONTROL_PREFIX.has(kw)) return t.length > 1 && depth < 6 ? segSig(t.slice(1).join(" "), depth + 1) : null;
  const p = baseProg(t[0]);
  if (["time", "env", "command", "exec"].includes(p) && t.length > 1) return segSig(t.slice(1).join(" "), depth);
  if (["bash", "sh", "zsh"].includes(p)) {
    const ci = t.indexOf("-c");
    if (ci > 0 && t[ci + 1] && depth < 3) return mainOf(t[ci + 1], depth + 1).main;
    const [script] = firstNonFlag(t, 1);
    return script ? `bash ${baseProg(script)}` : p;
  }
  if (p === "powershell" || p === "pwsh") {
    const ci = t.findIndex((x) => /^-(c|command)$/i.test(x));
    if (ci > 0 && depth < 3) return mainOf(t.slice(ci + 1).join(" "), depth + 1).main;
    const fi = t.findIndex((x) => /^-(f|file)$/i.test(x));
    if (fi > 0 && t[fi + 1]) return `pwsh ${baseProg(t[fi + 1])}`;
    return p;
  }
  if (p === "cmd") {
    const ci = t.findIndex((x) => /^\/c$/i.test(x));
    if (ci > 0 && depth < 3) return mainOf(t.slice(ci + 1).join(" "), depth + 1).main;
    return p;
  }
  switch (p) {
    case "git": {
      let i = 1;
      while (i < t.length && t[i].startsWith("-")) {
        i += ["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(t[i]) ? 2 : 1;
      }
      const sub = t[i];
      if (!sub) return "git";
      const rest = t.slice(i + 1);
      if (["worktree", "stash", "remote", "submodule", "notes", "bisect", "sparse-checkout"].includes(sub)) {
        const [s2] = firstNonFlag(t, i + 1);
        return s2 && /^[a-z-]+$/.test(s2) ? `git ${sub} ${s2}` : `git ${sub}`;
      }
      if (sub === "branch" && rest.some((x) => ["-D", "-d", "--delete"].includes(x))) return "git branch -d/-D";
      if (sub === "branch" && rest.some((x) => x === "-m" || x === "-M")) return "git branch -m";
      if (sub === "push" && rest.some((x) => /^(--force|--force-with-lease|-f)$/.test(x) || /^\+/.test(x))) {
        return "git push (forzado)";
      }
      if (sub === "reset" && rest.includes("--hard")) return "git reset (hard)";
      return `git ${sub}`;
    }
    case "npm":
    case "pnpm":
    case "yarn": {
      const [sub, i] = firstNonFlag(t, 1);
      if (!sub) return p;
      if (sub === "run" || sub === "run-script") {
        const [script, j] = firstNonFlag(t, i + 1);
        if (!script) return `${p} run`;
        const targeted = /^test/.test(script) && hasPositional(t, j + 1);
        return `${p} run ${script}${targeted ? " <archivo>" : ""}`;
      }
      if (sub === "test" || sub === "t") return `${p} test${hasPositional(t, i + 1) ? " <archivo>" : ""}`;
      if (sub === "exec" || sub === "x") return npxSig(t.slice(i));
      if (["i", "install", "add", "ci"].includes(sub)) return `${p} ${sub === "i" ? "install" : sub}`;
      return `${p} ${sub}`;
    }
    case "npx":
    case "bunx":
    case "pnpx":
      return npxSig(t);
    case "node": {
      if (t.some((x) => ["-e", "--eval", "-p", "--print"].includes(x))) return "node -e";
      const [script] = firstNonFlag(t, 1);
      if (!script) return "node";
      const base = baseProg(script);
      if (base === "harness-pr-status.mjs" && t.some((x) => x === "--wait-checks" || x.startsWith("--wait-checks="))) {
        return "node harness-pr-status.mjs --wait-checks";
      }
      if (base === "multica-ctx.mjs" && t.some((x) => x === "--agents" || x.startsWith("--agents="))) {
        return "node multica-ctx.mjs --agents";
      }
      return `node ${base}`;
    }
    case "python":
    case "python3":
    case "py": {
      if (t.includes("-c")) return "python -c";
      const [script] = firstNonFlag(t, 1);
      return script ? `python ${baseProg(script)}` : "python";
    }
    case "gh":
    case "multica": {
      const [a, i] = firstNonFlag(t, 1);
      if (!a) return p;
      const [b] = firstNonFlag(t, i + 1);
      return b && a !== "api" && /^[a-z][a-z-]*$/.test(b) ? `${p} ${a} ${b}` : `${p} ${a}`;
    }
    case "sed":
      return t.some((x) => /^-i/.test(x) || x === "--in-place") ? "sed -i" : "sed";
    case "ri":
      return "remove-item";
    default:
      return p;
  }
}

function isPathish(x) {
  if (!x || x.startsWith("-") || /^\d+(,\d+)?p?$/.test(x)) return false;
  return /[\\/]/.test(x) || /\.[A-Za-z0-9]{1,8}$/.test(x);
}
function viewTarget(text) {
  const t = tokenize(text);
  let last = null;
  for (let i = 1; i < t.length; i++) if (isPathish(t[i])) last = t[i];
  return last;
}

/** Firma principal de un comando completo + métricas de encadenamiento. */
export function mainOf(cmd, depth = 0) {
  const subs = [];
  const flat = String(cmd || "").replace(/\$\(([^()]*)\)/g, (_m, inner) => {
    subs.push(inner);
    return "__SUB__";
  });
  const segs = splitTopLevel(flat);
  const sigs = [];
  let main = null;
  let firstAny = null;
  let limited = false;
  let cdPrefix = false;
  const views = [];
  segs.forEach((s, idx) => {
    const sig = segSig(s.text, depth);
    if (!sig) return;
    sigs.push(sig);
    if (idx === 0 && segs.length > 1 && CD.has(sig)) cdPrefix = true;
    if (!firstAny && sig !== "(control)") firstAny = sig;
    const head = sig.split(" ")[0];
    if (s.piped && LIMITERS.has(head)) {
      limited = true;
      return;
    }
    if (s.piped && PIPE_HELPERS.has(head)) return;
    if (!main && !TRIVIAL.has(sig)) main = sig;
    if (VIEW_PROGS.has(head) && sig !== "sed -i") {
      const tgt = viewTarget(s.text);
      if (tgt) views.push(tgt);
    }
  });
  if (depth < 3) {
    for (const inner of subs) {
      const r = mainOf(inner, depth + 1);
      sigs.push(...r.sigs);
      views.push(...r.views);
      if (!main && !TRIVIAL.has(r.main) && r.main !== "(vacío)") main = r.main;
    }
  }
  return { main: main || firstAny || "(vacío)", sigs, count: segs.length + subs.length, cdPrefix, limited, views };
}

/**
 * Devuelve la firma principal de un evento (comando de shell o kind de herramienta).
 * Usada por `summarize` para el top de firmas por duración y por el análisis profundo.
 */
export function commandSignature(cmd, options = {}) {
  const kind = options.kind || "shell";
  if (kind !== "shell") return kind || "other";
  const raw = String(cmd || "");
  const cmdMax = options.cmdMax || CMD_MAX;
  const trunc = raw.length >= cmdMax;
  const p = mainOf(raw);
  if (trunc && (TRIVIAL.has(p.main) || p.main === "(vacío)")) {
    return `${CUT_SIG_PREFIX}${cmdMax} car.)`;
  }
  return p.main;
}

const FAMILY_RULES = [
  ["comando cortado (solo cd/entorno visible)", (s) => s.startsWith(CUT_SIG_PREFIX)],
  ["gh", (s) => s === "gh" || s.startsWith("gh ") || /\bharness-pr-status(?:\.mjs)?\b/.test(s)],
  ["multica", (s) => s.startsWith("multica") || /\bmultica-(?:ctx|post)(?:\.mjs)?\b/.test(s)],
  ["arnés (harness-*)", (s) => /harness[-_]/.test(s)],
  ["búsqueda", (s) => /^(rg|grep|egrep|fgrep|findstr|select-string|sls|ag|ack|git grep)$/.test(s)],
  ["tests", (s) => /^(npm|pnpm|yarn) (test|run test)/.test(s) || /^npx (vitest|playwright)/.test(s)],
  [
    "build/typecheck/lint",
    (s) => /^(npm|pnpm|yarn) run (build|typecheck|type-check|lint|check)/.test(s) || /^npx (tsc|eslint|next)/.test(s),
  ],
  ["git", (s) => s.startsWith("git ")],
  [
    "operaciones de archivos",
    (s) =>
      /^(rm|remove-item|del|rmdir|rd|mv|move-item|cp|copy-item|mkdir|new-item|touch|set-content|out-file|add-content|sed -i|rename-item)$/.test(
        s,
      ),
  ],
  ["ver archivo por shell", (s) => VIEW_PROGS.has(s.split(" ")[0])],
  ["listar archivos", (s) => /^(ls|dir|tree|find|fd|get-childitem|gci|test-path|resolve-path|get-item)$/.test(s)],
  ["dependencias", (s) => /^(npm|pnpm|yarn) (install|ci|add)/.test(s)],
  ["supabase/db", (s) => /supabase|psql/.test(s)],
  ["node/python/scripts", (s) => /^(node|python|npx|pwsh|bash)\b/.test(s)],
  ["cd/entorno", (s) => TRIVIAL.has(s)],
];

export function family(sig) {
  if (!sig) return "otro";
  for (const [name, test] of FAMILY_RULES) if (test(sig)) return name;
  return "otro";
}

function isReadOnly(e) {
  if (e._kind === "read" || e._kind === "read_many" || e._kind === "search") return true;
  if (e._kind !== "shell") return false;
  const s = e._sig;
  return (
    ["búsqueda", "listar archivos", "ver archivo por shell"].includes(e._fam) ||
    /^git (status|diff|log|show|branch|rev-parse|ls-files|remote|config|blame|describe)$/.test(s) ||
    /^multica \S+ (get|list|view|show|status|search)$/.test(s) ||
    /\bmultica-ctx(?:\.mjs)?\b/.test(s) ||
    /\bharness-pr-status(?:\.mjs)?\b/.test(s) ||
    /^gh \S+ (view|list|checks|status|diff)$/.test(s) ||
    s === "gh api"
  );
}

const LITERAL_FAMS = new Set(["búsqueda", "ver archivo por shell"]);
const LITERAL_SIGS = new Set(["git commit", "echo", "printf", "write-output", "write-host"]);
const NEVER_LITERAL = new Set([
  "read.guard-installed",
  "read.oversize",
  "shell.oversize-cat",
  "fs.protected",
  "db.append-only",
]);

export function looksLiteral(e, rule) {
  if (e._kind !== "shell" || NEVER_LITERAL.has(rule)) return false;
  if (rule === "pr.requires-seal") {
    const rawCmd = e._cmd ?? e.cmd ?? "";
    if (rawCmd) {
      return !detectGhPrCommands(rawCmd).some((m) => m.action === "pr.create");
    }
    return e._fam === "búsqueda" || e._sig === "git commit" || e._sig === "echo" || e._sig === "write-output";
  }
  if (rule === "pr.merge-check") {
    const rawCmd = e._cmd ?? e.cmd ?? "";
    if (rawCmd) {
      if (/gh\s+api\s+[^;&|]*statuses\//i.test(rawCmd) && /harness\/merge-check/i.test(rawCmd)) return false;
      return !detectGhPrCommands(rawCmd).some((m) => m.action === "pr.merge" || m.action === "api.merge");
    }
    return e._fam === "búsqueda" || e._sig === "git commit" || e._sig === "echo" || e._sig === "write-output";
  }
  if (rule.startsWith("pr.")) {
    return e._fam === "búsqueda" || e._sig === "git commit" || e._sig === "echo" || e._sig === "write-output";
  }
  if (LITERAL_FAMS.has(e._fam) || LITERAL_SIGS.has(e._sig)) return true;
  if (e._fam === "multica" || e._fam === "gh") return true;
  return false;
}

// ───────────────────────────── rutas ─────────────────────────────

/**
 * `prepareCmd` colapsa saltos de línea en espacios: con `gh pr merge … gh pr create …` el detector
 * estructural ve solo el merge (sus args absorben el resto) y no corre la red de seguridad.
 * Si detecta alguna invocación `gh`, reevalúa cada cola que empieza en un `gh` posterior (GOZS-804).
 */
function hasRealPrCreate(cmd) {
  const found = detectGhPrCommands(cmd);
  if (found.some((m) => m.action === "pr.create")) return true;
  if (found.length === 0) return false;
  const starts = [...cmd.matchAll(/\bgh\s/g)].map((m) => m.index).slice(1, 9);
  return starts.some((at) => detectGhPrCommands(cmd.slice(at)).some((m) => m.action === "pr.create"));
}

/**
 * Clasifica un evento de bloqueo para el total comparable (C4), aplicado de forma idéntica a ambas ventanas.
 * Excluye:
 * - reglas que no existían en la línea base (`shell.polling`);
 * - bloqueos sobre `kind: "search"` (no registrados en la línea base);
 * - clases de falso positivo eliminadas por definición:
 *   - `pr.requires-seal` sin invocación real según `detectGhPrCommands`;
 *   - `fs.protected` sobre la carpeta de borradores de Antigravity o sobre lecturas de `~/.claude/projects/<project>/tool-results/`.
 * Devuelve `{ comparable: boolean, reason: string | null }`.
 */
export function classifyComparableBlock(e) {
  if (!e || e.decision !== "block") return { comparable: false, reason: "notBlock" };
  const rule = e.rule || "";
  if (rule === "shell.polling") return { comparable: false, reason: "newRules" };
  if ((e.kind || e._kind) === "search") return { comparable: false, reason: "searchKind" };
  const cmd = String(e.cmd ?? e._cmd ?? "");
  if (rule === "pr.requires-seal") {
    const isReal = hasRealPrCreate(cmd);
    if (!isReal) return { comparable: false, reason: "prSealLiterals" };
  }
  if (rule === "fs.protected") {
    if (isAntigravityBrainPath(cmd) || /\.gemini[/\\]antigravity(?:-cli)?[/\\]brain(?:[/\\]|$)/i.test(cmd)) {
      return { comparable: false, reason: "fsProtectedFp" };
    }
    if (cmd.length === LEGACY_CMD_MAX && /\.gemini[/\\]a[ntigravity\-clibrain/\\]*$/i.test(cmd)) {
      return { comparable: false, reason: "fsProtectedFp" };
    }
    if (/\.claude[/\\]projects[/\\][^/\\\s"']+[/\\]tool-results[/\\]/i.test(cmd)) {
      const kind = e.kind || e._kind || "";
      const looksWrite =
        /\b(?:write_text|write_bytes|writeFileSync|writeFile|appendFileSync|appendFile)\b/.test(cmd) ||
        /\bopen\s*\([^)]*["'][wax+]/.test(cmd) ||
        />\s*[^\s|&;]*tool-results/i.test(cmd);
      if (kind === "read" || !looksWrite) {
        return { comparable: false, reason: "fsProtectedFp" };
      }
    }
  }
  return { comparable: true, reason: null };
}

/** True cuando un bloqueo cuenta en la métrica comparable entre ventanas (C4). */
export function isComparableBlock(e) {
  return classifyComparableBlock(e).comparable;
}

function maskText(s, repoRoot) {
  let x = String(s || "").replace(/\\/g, "/");
  if (repoRoot) x = x.replace(new RegExp(escapeRe(repoRoot.replace(/\\/g, "/")), "gi"), "<repo>");
  x = x.replace(/[A-Za-z]:\/Users\/[^/\s"']+/gi, "~").replace(/\/(?:home|Users)\/[^/\s"']+/g, "~");
  x = x.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>");
  x = x.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");
  x = x.replace(/\b[0-9a-f]{24,}\b/gi, "<hex>").replace(/\b[A-Za-z0-9_-]{36,}\b/g, "<largo>");
  return x;
}

function short(s, max = 90) {
  let x = String(s ?? "–");
  if (x.length > max) x = `${x.slice(0, max - 1)}…`;
  return x.replace(/`/g, "'").replace(/\n/g, " ");
}

function cell(s, max = 90) {
  return short(s, max).replace(/\|/g, "\\|");
}

function isAbsolutePathStr(s) {
  return /^[A-Za-z]:\//.test(s) || s.startsWith("/");
}

/**
 * Normaliza una ruta de evento:
 * - Si ya viene completa/relativizada (formato v2: ruta relativa al repo, `<repo>/...`,
 *   `<workdir>/...` o `~/...`), la toma directamente sin heurísticas de recorte.
 * - Solo aplica el escaneo heurístico por segmentos para rutas absolutas legacy (L-001).
 */
function makePathNormalizer(root, topSet) {
  const cache = new Map();
  return (p) => {
    if (!p) return { rel: "(sin ruta)", inRepo: false, exists: false, complete: false };
    if (cache.has(p)) return cache.get(p);
    const s = String(p)
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/\\/g, "/")
      .replace(/^file:\/\/\/?/i, "");

    let out;
    if (s === "<repo>") {
      out = { rel: "<repo>", inRepo: true, exists: true, complete: true };
    } else if (s.startsWith("<repo>/")) {
      const rel = s.slice("<repo>/".length);
      out = { rel, inRepo: true, exists: existsSync(path.join(root, rel)), complete: true };
    } else if (s.startsWith("<workdir>/") || s === "<workdir>" || s.startsWith("~/") || s === "~") {
      out = { rel: s, inRepo: false, exists: false, complete: true };
    } else if (!isAbsolutePathStr(s)) {
      const cleanRel = s.replace(/^\.\//, "");
      const firstSeg = cleanRel.split("/")[0];
      const exists = existsSync(path.join(root, cleanRel));
      const inRepo = exists || topSet.has(firstSeg) || (!cleanRel.startsWith("..") && !cleanRel.startsWith("(fuera"));
      out = { rel: cleanRel, inRepo, exists, complete: true };
    } else {
      // Ruta absoluta legacy (L-001): busca un prefijo del árbol del repo.
      const segs = s.split("/").filter(Boolean);
      let found = null;
      let fallback = null;
      for (let i = 0; i < segs.length; i++) {
        if (!topSet.has(segs[i])) continue;
        const cand = segs.slice(i).join("/");
        if (!fallback) fallback = cand;
        if (existsSync(path.join(root, cand))) {
          found = cand;
          break;
        }
      }
      if (found) out = { rel: found, inRepo: true, exists: true, complete: false };
      else if (fallback) out = { rel: fallback, inRepo: true, exists: false, complete: false };
      else {
        const m = maskText(s, root).split("/").filter(Boolean);
        out = { rel: `(fuera del repo) …/${m.slice(-4).join("/")}`, inRepo: false, exists: false, complete: false };
      }
    }
    cache.set(p, out);
    return out;
  };
}

function makeLineCounter(root) {
  const cache = new Map();
  return (rel) => {
    if (cache.has(rel)) return cache.get(rel);
    let n = null;
    try {
      const abs = path.join(root, rel);
      const st = statSync(abs);
      if (st.isFile() && st.size < 8_000_000) {
        const t = readFileSync(abs, "utf8");
        n = t.length === 0 ? 0 : t.split("\n").length - (t.endsWith("\n") ? 1 : 0);
      }
    } catch {
      n = null;
    }
    cache.set(rel, n);
    return n;
  };
}

function isV2Event(e) {
  if (!e || typeof e !== "object") return false;
  const cmd = String(e.cmd || "");
  return (
    e.cwd !== undefined ||
    e.id !== undefined ||
    e.bounded !== undefined ||
    e.start !== undefined ||
    e.limit !== undefined ||
    e.ok !== undefined ||
    e.kind === "search" ||
    cmd.length > LEGACY_CMD_MAX ||
    cmd.startsWith("<repo>") ||
    cmd.startsWith("<workdir>") ||
    cmd.startsWith("~/")
  );
}

// ───────────────────────────── análisis profundo ─────────────────────────────

/**
 * Ejecuta el análisis profundo en memoria sobre una lista de eventos crudos,
 * reutilizando `filterEvents`, `summarize` y `pairPrePostEvents` de `harness-telemetry.mjs`.
 *
 * @param {object[]} rawEvents
 * @param {{
 *   since?: string | null,
 *   until?: string | null,
 *   idleMin?: number,
 *   top?: number,
 *   examples?: boolean,
 *   repoRoot?: string,
 *   file?: string,
 *   invalidLines?: number,
 *   ledgerPath?: string | null,
 * }} [options]
 */
export function analyzeDeep(rawEvents, options = {}) {
  const raw = Array.isArray(rawEvents) ? rawEvents : [];
  const since = options.since ?? null;
  const until = options.until ?? null;
  const idleMin = options.idleMin ?? 15;
  const minSchema = options.minSchema != null ? Number(options.minSchema) : null;
  const gateMinSec = options.gateMinSec ?? DEFAULT_GATE_MIN_SEC;
  const excludeKinds = Array.isArray(options.excludeKinds)
    ? [...new Set(options.excludeKinds.map((x) => String(x || "").trim()).filter(Boolean))]
    : [];
  const excludeRules = Array.isArray(options.excludeRules)
    ? [...new Set(options.excludeRules.map((x) => String(x || "").trim()).filter(Boolean))]
    : [];
  const excludeRulesSet = new Set(excludeRules);
  const topN = options.top ?? 20;
  const examples = options.examples !== false;
  const cwd = path.resolve(options.repoRoot || process.cwd());
  const gitRoot = git(["rev-parse", "--show-toplevel"], cwd);
  const root = gitRoot || cwd;
  const displayFile = options.file || "(en memoria)";
  const invalid = options.invalidLines ?? 0;
  const capMs = idleMin * 60000;

  const topSet = new Set(
    (git(["ls-tree", "--name-only", "HEAD"], root) || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const relOf = makePathNormalizer(root, topSet);
  const linesOf = makeLineCounter(root);
  const ex = (s) => (examples ? short(maskText(s, root), 100) : "(oculto)");

  // ── filtro reutilizado de harness-telemetry.mjs
  const nonSynthetic = raw.filter((e) => !isExcludedEvent(e));
  const excluded = raw.length - nonSynthetic.length;
  const inWindow = filterEvents(raw, { since, until });
  const outOfWindow = nonSynthetic.length - inWindow.length;
  const afterKind = excludeKinds.length > 0 ? filterEvents(raw, { since, until, excludeKinds }) : inWindow;
  const excludedByKind = inWindow.length - afterKind.length;
  const sessionsBeforeSchema = new Set(afterKind.map((e) => e.session || "unknown")).size;
  const filtered =
    minSchema != null && Number.isFinite(minSchema) && minSchema > 0
      ? filterEvents(raw, { since, until, excludeKinds, minSchema })
      : afterKind;
  const sessionsAfterSchema = new Set(filtered.map((e) => e.session || "unknown")).size;
  const excludedEventsBySchema = afterKind.length - filtered.length;
  const excludedSessionsBySchema = sessionsBeforeSchema - sessionsAfterSchema;

  // ── cruce obligatorio con summarize()
  const official = summarize(raw, { since, until, idleMin, excludeKinds, excludeRules, minSchema });

  // ── emparejamiento pre/post reutilizado
  const pairs = pairPrePostEvents(filtered);
  const pairByPreIdx = new Map();
  for (const p of pairs) {
    pairByPreIdx.set(p.preIndex, p);
  }

  // ── detección v1 (120 car.) vs v2 (300 car.) vs v3 (1000 car. + v: 3 + cmdLen)
  const datasetHasV3 = filtered.some((e) => typeof e?.v === "number" && e.v >= 3);
  const datasetHasV2 = datasetHasV3 || filtered.some(isV2Event);
  const effectiveCmdMax = datasetHasV3 ? CMD_MAX : datasetHasV2 ? V2_CMD_MAX : LEGACY_CMD_MAX;

  const events = filtered.map((e, idx) => {
    const ev = { ...e, _i: idx, _t: Date.parse(e.ts) };
    ev._kind = ev.kind || "other";
    ev._post = ev.phase === "post";
    ev._block = ev.decision === "block";
    ev._cmd = String(ev.cmd || "");
    ev._v2 = (typeof ev.v === "number" && ev.v >= 2) || isV2Event(ev);
    ev._schema = typeof ev.v === "number" ? ev.v : ev._v2 ? 2 : 1;
    const limit = ev._schema >= 3 ? CMD_MAX : ev._schema === 2 ? V2_CMD_MAX : LEGACY_CMD_MAX;
    ev._cmdMax = limit;
    ev._trunc = typeof ev.cmdLen === "number" ? ev.cmdLen > ev._cmd.length : ev._cmd.length >= limit;

    const paired = pairByPreIdx.get(idx);
    ev._durMs = paired ? paired.durationMs : null;
    ev._ok = paired ? paired.ok : typeof ev.ok === "boolean" ? ev.ok : null;

    if (ev._kind === "shell") {
      const p = mainOf(ev._cmd);
      ev._sig = ev._trunc && (TRIVIAL.has(p.main) || p.main === "(vacío)") ? `${CUT_SIG_PREFIX}${limit} car.)` : p.main;
      ev._segs = p.sigs;
      ev._chain = p.count;
      ev._cd = p.cdPrefix;
      ev._startsWithCd =
        (p.sigs.length > 0 && CD.has(p.sigs[0])) || /^\s*(?:cd|chdir|pushd|set-location|sl)\b/i.test(ev._cmd);
      ev._limited = p.limited;
      ev._hasPipe = splitTopLevel(ev._cmd).some((s) => s.piped);
      ev._views = p.views.map((v) => relOf(v));
      ev._fam = family(ev._sig);
      ev._usesWorkdirAbs = /<(?:workdir|repo)>/i.test(ev._cmd);
      const poll = evaluateShellPolling(ev._cmd);
      ev._activeWait = poll?.ruleId === "shell.polling";
      ev._shortWait = poll?.ruleId === "shell.wait";
    } else if (["read", "write", "read_many"].includes(ev._kind)) {
      const r = relOf(ev._cmd);
      // Quita la heurística de ruta recortada cuando el evento ya viene completo (< limit).
      ev._path = ev._trunc ? `(ruta cortada) ${r.rel}` : r.rel;
      ev._inRepo = r.inRepo;
      ev._exists = r.exists;
      ev._completePath = r.complete && !ev._trunc;
      ev._sig = ev._kind;
      ev._fam = ev._kind;
    } else if (ev._kind === "search") {
      ev._sig = "search";
      ev._fam = "búsqueda nativa";
      ev._path = ev._cmd;
    } else {
      ev._sig = ev._kind;
      ev._fam = ev._kind;
    }
    return ev;
  });

  const tokOf = (e) => `${e._block ? "✗" : ""}${e._kind === "shell" ? e._sig : e._kind}`;

  // ── sesiones ordenadas y huecos entre llamadas
  const sessions = new Map();
  for (const e of events) {
    const k = e.session || "unknown";
    let s = sessions.get(k);
    if (!s) {
      s = { id: k, all: [], rts: new Map() };
      sessions.set(k, s);
    }
    s.all.push(e);
    inc(s.rts, e.runtime || "unknown");
  }
  for (const s of sessions.values()) {
    s.all.sort((a, b) => (Number.isFinite(a._t) ? a._t : 0) - (Number.isFinite(b._t) ? b._t : 0) || a._i - b._i);
    s.actions = s.all.filter((e) => !e._post);
    s.runtime = top(s.rts, 1)[0][0];
    s.actions.forEach((a, i) => {
      const b = s.actions[i + 1];
      a._gap = b && Number.isFinite(a._t) && Number.isFinite(b._t) ? b._t - a._t : null;
      a._idle = a._gap != null && a._gap > capMs;
      a._pos = i;
      a._sess = s;
    });
    s.firstWrite = s.actions.findIndex((e) => e._kind === "write" && !e._block);
    s.start = s.actions[0]?._t;
    s.end = s.actions.at(-1)?._t;
    s.active = s.actions.reduce((acc, e) => acc + (e._gap != null && !e._idle ? e._gap : 0), 0);
  }
  const S = [...sessions.values()];
  const actions = S.flatMap((s) => s.actions);
  const postCount = events.length - actions.length;
  const totalActiveMs = S.reduce((acc, s) => acc + s.active, 0);
  const shell = actions.filter((e) => e._kind === "shell");
  const rtCount = new Map();
  for (const e of events) inc(rtCount, e.runtime || "unknown");
  const RTS = top(rtCount, 3).map(([k]) => k);
  const usable = (e) => e._gap != null && !e._idle && !e._block;

  const deepTtfeValues = S.filter((s) => s.firstWrite >= 0)
    .map((s) => s.actions[s.firstWrite]._t - s.start)
    .filter(Number.isFinite);
  const deepTtfeStats = stats(deepTtfeValues);
  const ttfeMatches =
    official.timeToFirstEdit.count === deepTtfeStats.n &&
    (deepTtfeStats.n === 0 || Math.round(official.timeToFirstEdit.medianMs) === Math.round(deepTtfeStats.p50));

  // ── cruce obligatorio con summarize()
  const crossCheck = {
    totalEvents: official.totalEvents,
    totalActions: official.totalActions,
    postEvents: official.postEvents,
    totalSessions: official.totalSessions,
    activeTimeMs: official.activeTimeMs.totalMs,
    timeToFirstEdit: official.timeToFirstEdit,
    callsBeforeFirstEdit: official.callsBeforeFirstEdit,
    matches:
      official.totalEvents === events.length &&
      official.totalActions === actions.length &&
      official.postEvents === postCount &&
      official.totalSessions === sessions.size &&
      Math.round(official.activeTimeMs.totalMs) === Math.round(totalActiveMs) &&
      ttfeMatches,
  };

  // ── cruce opcional con LEDGER L-001
  let ledger = null;
  try {
    const lp = options.ledgerPath !== undefined ? options.ledgerPath : path.join(root, "docs", "harness-library", "LEDGER.json");
    if (lp && existsSync(lp)) {
      const L = JSON.parse(readFileSync(lp, "utf8"));
      const l1 = (L.entries || []).find((x) => x.id === "L-001");
      if (l1?.metrics?.before?.totalEvents != null) {
        ledger = {
          window: l1.window?.before,
          totalEvents: l1.metrics.before.totalEvents,
          totalSessions: l1.metrics.before.totalSessions,
        };
      }
    }
  } catch {
    ledger = null;
  }

  // ── construcción del reporte
  const md = [];
  const J = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    window: { since, until },
    filters: { excludeKinds, excludeRules, minSchema, gateMinSec },
    idleMin,
    gapCapMin: idleMin,
    cmdMax: effectiveCmdMax,
    hasV2Fields: datasetHasV2,
    hasV3Fields: datasetHasV3,
    telemetrySchema: TELEMETRY_SCHEMA,
  };
  const H = (t) => md.push("", `## ${t}`, "");
  const P = (...t) => md.push(...t);
  const T = (headers, rows) => {
    if (!rows.length) {
      md.push("_(sin datos)_");
      return;
    }
    md.push(
      `| ${headers.join(" | ")} |`,
      `|${headers.map(() => "---").join("|")}|`,
      ...rows.map((r) => `| ${r.map((c) => cell(c ?? "–", 110)).join(" | ")} |`),
    );
  };
  const section = (name, fn) => {
    try {
      fn();
    } catch (err) {
      md.push("", `> Error en la sección «${name}»: ${err?.message}`);
      (J.errors ||= []).push({ section: name, error: String(err?.stack || err) });
    }
  };

  P(
    `# Telemetría del guard — análisis profundo (v${VERSION})`,
    "",
    `Ventana: \`${since || "(inicio)"}\` → \`${until || "(fin)"}\` · generado ${J.generatedAt} · inactividad desde ${idleMin} min · ranking de ${topN}.`,
    "",
    "**Cómo leer los tiempos:** cuando existen pares pre/post, la **duración medida** es `post.ts − pre.ts`. Además se informa el **hueco activo** hasta la siguiente acción de la misma sesión (ejecución + razonamiento, excluyendo huecos mayores al umbral de inactividad).",
  );

  // 0. Cobertura
  section("cobertura", () => {
    H("0. Cobertura y validación");
    const allowedActions = actions.filter((e) => !e._block).length;
    const pairedCount = official.durations.pairedCount;
    const outcomes = official.durations.outcomes;
    P(
      `- Archivo: \`${cell(maskText(displayFile, root), 120)}\` · líneas JSON válidas: ${raw.length} · inválidas: ${invalid}`,
      `- Excluidos (canario/sintético): ${excluded} · fuera de ventana: ${outOfWindow}${excludeKinds.length ? ` · excluidos: ${excludeKinds.join(", ")} (${excludedByKind} eventos)` : ""}${excludeRules.length ? ` · reglas excluidas: ${excludeRules.join(", ")}` : ""}${minSchema != null ? ` · min-schema v >= ${minSchema}: ${excludedSessionsBySchema} sesiones excluidas (${excludedEventsBySchema} eventos)` : ""}`,
      `- **Eventos en ventana: ${events.length}** (acciones: ${actions.length}, post/inyecciones: ${postCount}) · **sesiones: ${sessions.size}** · **bloqueos/sesión: ${official.blocksPerSession}**`,
      `- **Tiempo activo total (umbral ${idleMin} min): ${hrs(totalActiveMs)} h**`,
      `- Cruce obligatorio con \`summarize\`: ${crossCheck.matches ? "**coincide**" : "**NO coincide**"} (eventos ${crossCheck.totalEvents}, acciones ${crossCheck.totalActions}, post ${crossCheck.postEvents}, sesiones ${crossCheck.totalSessions})`,
    );
    if (ledger) {
      P(
        `- Cruce con LEDGER L-001 (${ledger.window?.start} → ${ledger.window?.end}): eventos ${ledger.totalEvents}, sesiones ${ledger.totalSessions} → ${ledger.totalEvents === events.length && ledger.totalSessions === sessions.size ? "**coincide**" : "difiere (normal si la ventana no es la misma)"}`,
      );
    }
    const trunc = shell.filter((e) => e._trunc).length;
    P(`- Comandos de shell que llegan truncados a ${effectiveCmdMax} caracteres: ${trunc} de ${shell.length} (${pc(trunc, shell.length)}).`);

    // C5: % de acciones permitidas con duración medida por runtime y en total
    const durCovByRt = {};
    const rtNames = [...new Set(actions.map((e) => e.runtime || "unknown"))];
    const durCovRows = [];
    for (const rt of [...rtNames, "(todas)"]) {
      const subset = rt === "(todas)" ? actions : actions.filter((e) => (e.runtime || "unknown") === rt);
      const allowedSub = subset.filter((e) => !e._block);
      const pairedSub = allowedSub.filter((e) => e._durMs != null);
      const pctNum = allowedSub.length > 0 ? Math.round((pairedSub.length / allowedSub.length) * 1000) / 10 : 0;
      durCovByRt[rt] = {
        allowedActions: allowedSub.length,
        pairedDurations: pairedSub.length,
        pct: pctNum,
      };
      durCovRows.push([rt, allowedSub.length, pairedSub.length, `${pctNum.toFixed(1)}%`]);
    }
    if (pairedCount > 0 || outcomes.evaluated > 0 || datasetHasV2) {
      P(
        `- Pares pre/post con duración medida: **${pairedCount}** de ${allowedActions} acciones permitidas (${pc(pairedCount, allowedActions)}) · por \`id\`: ${official.durations.pairedById}, por fallback: ${official.durations.pairedByFallback}.`,
        `- Resultados \`ok\` registrados en post: ${outcomes.evaluated} · fallos (\`ok === false\`): ${outcomes.failed} (${outcomes.failureRate != null ? `${r1(outcomes.failureRate * 100)}%` : "–"}).`,
        "",
        "Cobertura de duración medida por runtime:",
        "",
      );
      T(["runtime", "acciones permitidas", "con duración medida", "% cobertura"], durCovRows);
    }

    const cwdMap = new Map();
    for (const e of actions) {
      if (e.cwd) inc(cwdMap, e.cwd);
    }
    if (cwdMap.size > 0) {
      P("", "Distribución de `cwd` en acciones:", "");
      T(["cwd", "acciones", "%"], top(cwdMap, 10).map(([k, v]) => [k, v, pc(v, actions.length)]));
    }

    P("", "Tools registradas por runtime:", "");
    const m = new Map();
    for (const e of events) inc(m, `${e.runtime || "unknown"}\u0000${e.tool || "?"}\u0000${e._kind}${e._post ? " (post)" : ""}`);
    T(["runtime", "tool", "kind", "eventos"], top(m, 40).map(([k, v]) => [...k.split("\u0000"), v]));

    const hasNativeSearch = actions.some((e) => e._kind === "search");
    P(
      "",
      hasNativeSearch
        ? "> Cobertura: incluye shell, lectura, escritura y búsquedas nativas (`kind: \"search\"`). Subagentes y MCP no se registran."
        : "> Punto ciego: los hooks de esta ventana solo cubren shell, lectura y escritura. Búsquedas nativas (Grep/Glob, grep_search, find_by_name, list_dir), subagentes y MCP no se registran.",
    );

    J.coverage = {
      file: maskText(displayFile, root),
      validLines: raw.length,
      invalid,
      excluded,
      outOfWindow,
      excludedByKind,
      excludedSessionsBySchema,
      excludedEventsBySchema,
      minSchema,
      excludeKinds,
      excludeRules,
      events: events.length,
      actions: actions.length,
      allowedActions,
      post: postCount,
      sessions: sessions.size,
      blocksPerSession: official.blocksPerSession,
      activeTimeMs: totalActiveMs,
      crossCheck,
      ledger,
      cmdMax: effectiveCmdMax,
      truncatedShell: trunc,
      shell: shell.length,
      pairedDurations: pairedCount,
      durationCoverageByRuntime: durCovByRt,
      outcomes,
      byCwd: Object.fromEntries(top(cwdMap, 20)),
    };
  });

  // 1. Sesiones
  section("sesiones", () => {
    H("1. Forma de las sesiones");
    const groups = new Map();
    for (const s of S) addTo(groups, s.runtime, s);
    const rows = [];
    const jrows = {};
    for (const [rt, list] of [...[...groups].sort((a, b) => b[1].length - a[1].length), ["(todas)", S]]) {
      const ev = stats(list.map((s) => s.actions.length));
      const dur = stats(list.map((s) => (Number.isFinite(s.end) && Number.isFinite(s.start) ? s.end - s.start : NaN)));
      const act = stats(list.map((s) => s.active));
      const w = list.filter((s) => s.firstWrite >= 0);
      const ttfe = stats(w.map((s) => s.actions[s.firstWrite]._t - s.start));
      const before = stats(w.map((s) => s.firstWrite));
      const writes = stats(list.map((s) => s.actions.filter((e) => e._kind === "write").length));
      rows.push([
        rt,
        list.length,
        r1(ev.p50),
        r1(ev.p90),
        ev.max,
        mins(dur.p50),
        mins(dur.p90),
        mins(act.p50),
        mins(act.p90),
        hrs(act.sum),
        pc(w.length, list.length),
        r1(writes.p50),
        mins(ttfe.p50),
        mins(ttfe.p90),
        r1(before.p50),
        r1(before.p90),
      ]);
      jrows[rt] = {
        sessions: list.length,
        calls: ev,
        durationMs: dur,
        activeMs: act,
        withEdit: w.length,
        writes,
        ttfeMs: ttfe,
        callsBeforeFirstEdit: before,
      };
    }
    T(
      [
        "runtime",
        "sesiones",
        "llamadas p50",
        "llamadas p90",
        "máx",
        "duración p50 (min)",
        "duración p90",
        "activo p50 (min)",
        "activo p90",
        "activo total (h)",
        "con edición",
        "ediciones p50",
        "TTFE p50 (min)",
        "TTFE p90",
        "llamadas antes de 1ª edición p50",
        "p90",
      ],
      rows,
    );
    const buckets = [
      [1, 10],
      [11, 30],
      [31, 100],
      [101, 300],
      [301, Infinity],
    ];
    P("", "Sesiones por cantidad de llamadas:", "");
    T(
      ["llamadas", "sesiones", "% sesiones", "% de todas las llamadas"],
      buckets.map(([a, b]) => {
        const l = S.filter((s) => s.actions.length >= a && s.actions.length <= b);
        return [
          b === Infinity ? `${a}+` : `${a}–${b}`,
          l.length,
          pc(l.length, S.length),
          pc(
            l.reduce((x, s) => x + s.actions.length, 0),
            actions.length,
          ),
        ];
      }),
    );
    P("", "_TTFE y llamadas antes de la 1ª edición se miden hasta la primera escritura permitida (definición unificada con `summarize`)._");
    J.sessions = jrows;
  });

  // 2. Shell
  section("shell", () => {
    H(`2. Shell: qué son los ${shell.length} comandos`);
    const fam = new Map();
    const famT = new Map();
    const famS = new Map();
    for (const e of shell) {
      inc(fam, e._fam);
      addSet(famS, e._fam, e.session);
      if (usable(e)) inc(famT, e._fam, e._gap);
    }
    const totalT = [...famT.values()].reduce((a, b) => a + b, 0);
    T(
      ["familia", "comandos", "% shell", "sesiones", "tiempo (h)", "% tiempo shell"],
      top(fam, 30).map(([k, v]) => [k, v, pc(v, shell.length), famS.get(k).size, hrs(famT.get(k) || 0), pc(famT.get(k) || 0, totalT)]),
    );

    const sig = new Map();
    const sigS = new Map();
    const sigRt = new Map();
    const sigG = new Map();
    const sigD = new Map();
    const sigB = new Map();
    const sigFail = new Map();
    for (const e of shell) {
      inc(sig, e._sig);
      addSet(sigS, e._sig, e.session);
      inc(sigRt, `${e._sig}\u0000${e.runtime}`);
      if (usable(e)) addTo(sigG, e._sig, e._gap);
      if (e._durMs != null) addTo(sigD, e._sig, e._durMs);
      if (e._block) inc(sigB, e._sig);
      if (e._ok === false) inc(sigFail, e._sig);
    }
    const hasDur = sigD.size > 0;
    P("", `Top ${topN} firmas (comando principal de cada llamada):`, "");
    const sigRows = top(sig, JSON_TOP).map(([k, v]) => {
      const g = stats(sigG.get(k) || []);
      const d = stats(sigD.get(k) || []);
      return {
        sig: k,
        count: v,
        sessions: sigS.get(k).size,
        byRuntime: Object.fromEntries(RTS.map((rt) => [rt, sigRt.get(`${k}\u0000${rt}`) || 0])),
        gapP50: g.p50,
        gapP90: g.p90,
        totalMs: g.sum,
        durP50: d.p50,
        durP90: d.p90,
        durTotalMs: d.sum,
        durCount: d.n,
        failed: sigFail.get(k) || 0,
        blocked: sigB.get(k) || 0,
      };
    });
    T(
      hasDur
        ? ["firma", "llamadas", "% shell", "sesiones", ...RTS, "dur p50 (s)", "dur p90 (s)", "fallos", "hueco p50 (s)", "total (min)", "bloqueadas"]
        : ["firma", "llamadas", "% shell", "sesiones", ...RTS, "hueco p50 (s)", "p90 (s)", "total (min)", "bloqueadas"],
      sigRows.slice(0, topN).map((r) =>
        hasDur
          ? [r.sig, r.count, pc(r.count, shell.length), r.sessions, ...RTS.map((rt) => r.byRuntime[rt]), sec(r.durP50), sec(r.durP90), r.failed, sec(r.gapP50), mins(r.totalMs), r.blocked]
          : [r.sig, r.count, pc(r.count, shell.length), r.sessions, ...RTS.map((rt) => r.byRuntime[rt]), sec(r.gapP50), sec(r.gapP90), mins(r.totalMs), r.blocked],
      ),
    );

    P("", `Top ${topN} firmas por tiempo total (candidatos a acelerar o cachear):`, "");
    T(
      ["firma", "llamadas", "hueco p50 (s)", "p90 (s)", "total (min)"],
      [...sigRows]
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, topN)
        .map((r) => [r.sig, r.count, sec(r.gapP50), sec(r.gapP90), mins(r.totalMs)]),
    );

    const seg = new Map();
    for (const e of shell) for (const s of e._segs) inc(seg, s);
    P("", "Tramos dentro de comandos encadenados (cuenta cada parte de `a && b | c`):", "");
    T(["firma de tramo", "apariciones"], top(seg, topN));

    const chained = shell.filter((e) => e._chain > 1);
    const cd = shell.filter((e) => e._cd).length;
    const lim = shell.filter((e) => e._limited).length;
    const workdirAbs = shell.filter((e) => e._usesWorkdirAbs).length;

    // B5: cwd perdido aproximado (cd / Set-Location al inicio con ok === false), por runtime
    const cwdLostByRt = new Map();
    let cwdLostTotal = 0;
    for (const e of shell) {
      if (e._startsWithCd && e._ok === false) {
        cwdLostTotal++;
        inc(cwdLostByRt, e.runtime || "unknown");
      }
    }

    // B6: intentos de espera activa (> 5 s sin check local, bloqueados o no), por runtime
    const activeWaitEvents = shell.filter((e) => e._activeWait);
    const activeWaitSessions = new Set(activeWaitEvents.map((e) => e.session));
    const activeWaitBlocked = activeWaitEvents.filter((e) => e._block).length;
    const activeWaitExecuted = activeWaitEvents.length - activeWaitBlocked;
    const activeWaitByRtMap = new Map();
    for (const e of activeWaitEvents) {
      const rt = e.runtime || "unknown";
      let rec = activeWaitByRtMap.get(rt);
      if (!rec) {
        rec = { total: 0, blocked: 0, executed: 0, sessions: new Set() };
        activeWaitByRtMap.set(rt, rec);
      }
      rec.total++;
      if (e._block) rec.blocked++;
      else rec.executed++;
      rec.sessions.add(e.session);
    }
    const activeWaitByRt = Object.fromEntries(
      [...activeWaitByRtMap.entries()].map(([rt, rec]) => [
        rt,
        { total: rec.total, blocked: rec.blocked, executed: rec.executed, sessions: rec.sessions.size },
      ]),
    );

    P(
      "",
      `- Encadenados: ${chained.length} (${pc(chained.length, shell.length)}) · tramos promedio en encadenados: ${r1(chained.reduce((a, e) => a + e._chain, 0) / (chained.length || 1))}`,
      `- Empiezan con cd/Set-Location: ${cd} (${pc(cd, shell.length)}). Es la señal de que el agente no confía en su directorio de trabajo.`,
      `- Con limitador de salida (\`| head\`, \`Select-Object\`, \`wc\`, \`grep\`…): ${lim} (${pc(lim, shell.length)}).`,
    );
    if (datasetHasV2 || workdirAbs > 0) {
      P(`- Con referencia a ruta absoluta del workdir/repo (\`<workdir>\` o \`<repo>\`): ${workdirAbs} (${pc(workdirAbs, shell.length)}).`);
    }
    if (cwdLostTotal > 0 || official.durations.outcomes.evaluated > 0) {
      const rtDetail = [...cwdLostByRt.entries()].map(([rt, n]) => `${rt}: ${n}`).join(", ") || "0";
      P(`- Cwd perdido aproximado (\`cd\`/\`Set-Location\` con \`ok=false\`): ${cwdLostTotal} (${rtDetail}).`);
    }
    const waitRtDetail =
      Object.entries(activeWaitByRt)
        .map(([rt, r]) => `${rt}: ${r.total} (bloqueados ${r.blocked}, ejecutados ${r.executed}, ${r.sessions} ses.)`)
        .join(" · ") || "0";
    // C5: lecturas por Bash en Claude Code únicamente (principales: grep, sed -n, cat; secundarias: head, tail, rg), con y sin pipe
    const bashReadPrimaryByTool = { grep: 0, "sed -n": 0, cat: 0 };
    const bashReadSecondaryByTool = { head: 0, tail: 0, rg: 0 };
    let primaryPipe = 0;
    let primaryNoPipe = 0;
    let secondaryPipe = 0;
    let secondaryNoPipe = 0;
    for (const e of shell) {
      if ((e.runtime || "") !== "claude-code") continue;
      let primaryKey = null;
      if (e._sig === "grep" || e._sig === "egrep" || e._sig === "fgrep") primaryKey = "grep";
      else if (e._sig === "sed") primaryKey = "sed -n";
      else if (e._sig === "cat") primaryKey = "cat";

      if (primaryKey) {
        bashReadPrimaryByTool[primaryKey]++;
        if (e._hasPipe) primaryPipe++;
        else primaryNoPipe++;
        continue;
      }
      if (e._sig === "head" || e._sig === "tail" || e._sig === "rg") {
        bashReadSecondaryByTool[e._sig]++;
        if (e._hasPipe) secondaryPipe++;
        else secondaryNoPipe++;
      }
    }
    const bashReadPrimaryTotal = primaryPipe + primaryNoPipe;
    const bashReadSecondaryTotal = secondaryPipe + secondaryNoPipe;
    const bashReads = {
      runtime: "claude-code",
      primary: {
        total: bashReadPrimaryTotal,
        withPipe: primaryPipe,
        withoutPipe: primaryNoPipe,
        byTool: bashReadPrimaryByTool,
      },
      secondary: {
        total: bashReadSecondaryTotal,
        withPipe: secondaryPipe,
        withoutPipe: secondaryNoPipe,
        byTool: bashReadSecondaryByTool,
      },
      total: bashReadPrimaryTotal + bashReadSecondaryTotal,
      withPipe: primaryPipe + secondaryPipe,
      withoutPipe: primaryNoPipe + secondaryNoPipe,
    };

    P(
      `- Intentos de espera activa (\`shell.polling\`, > 5 s sin check local, bloqueados o no): **${activeWaitEvents.length}** en ${activeWaitSessions.size} sesiones (bloqueados: ${activeWaitBlocked}, ejecutados: ${activeWaitExecuted}) · ${waitRtDetail}.`,
      `- Lecturas por Bash en Claude Code (C5): **${bashReads.primary.total}** principales (\`grep\` ${bashReadPrimaryByTool.grep}, \`sed -n\` ${bashReadPrimaryByTool["sed -n"]}, \`cat\` ${bashReadPrimaryByTool.cat}; con pipe: ${primaryPipe}, sin pipe: ${primaryNoPipe}) · **${bashReads.secondary.total}** secundarias (\`head\` ${bashReadSecondaryByTool.head}, \`tail\` ${bashReadSecondaryByTool.tail}, \`rg\` ${bashReadSecondaryByTool.rg}; con pipe: ${secondaryPipe}, sin pipe: ${secondaryNoPipe}) · total: **${bashReads.total}**.`,
    );
    J.shell = {
      families: Object.fromEntries(top(fam, 50)),
      familyTimeMs: Object.fromEntries(top(famT, 50)),
      signatures: sigRows,
      segments: Object.fromEntries(top(seg, JSON_TOP)),
      chained: chained.length,
      cdPrefix: cd,
      limited: lim,
      workdirRefs: workdirAbs,
      absPathRefs: workdirAbs,
      cwdLostApprox: {
        total: cwdLostTotal,
        byRuntime: Object.fromEntries(cwdLostByRt),
      },
      activeWaits: {
        total: activeWaitEvents.length,
        blocked: activeWaitBlocked,
        executed: activeWaitExecuted,
        sessions: activeWaitSessions.size,
        byRuntime: activeWaitByRt,
      },
      bashReads,
    };
  });

  // 3. Lecturas
  section("lecturas", () => {
    const rd = actions.filter((e) => e._kind === "read" || e._kind === "read_many");
    H(`3. Lecturas (${rd.length})`);
    const f = new Map();
    const fS = new Map();
    const fBlk = new Map();
    const fInRepo = new Map();
    const reread = new Map();
    let rereads = 0;
    let exactRangeRereads = 0;
    let distinctRangeChunks = 0;
    let boundedCount = 0;
    let unboundedCount = 0;

    for (const s of S) {
      const seen = new Map();
      const seenRanges = new Map();
      for (const e of s.actions) {
        if (e._kind !== "read" && e._kind !== "read_many") continue;
        inc(f, e._path);
        addSet(fS, e._path, s.id);
        if (!fInRepo.has(e._path)) fInRepo.set(e._path, e._inRepo);
        if (e.bounded === true) boundedCount++;
        else if (e.bounded === false) unboundedCount++;
        if (e._block) {
          inc(fBlk, e._path);
          continue;
        }
        const c = (seen.get(e._path) || 0) + 1;
        seen.set(e._path, c);
        if (c > 1) {
          rereads++;
          inc(reread, e._path);
          if (e.start !== undefined || e.limit !== undefined || e.bounded !== undefined) {
            const rangeKey = `${e._path}\u0000${e.start ?? ""}\u0000${e.limit ?? ""}\u0000${e.bounded ?? ""}`;
            if (seenRanges.has(rangeKey)) exactRangeRereads++;
            else distinctRangeChunks++;
          }
        }
        if (e.start !== undefined || e.limit !== undefined || e.bounded !== undefined) {
          const rangeKey = `${e._path}\u0000${e.start ?? ""}\u0000${e.limit ?? ""}\u0000${e.bounded ?? ""}`;
          seenRanges.set(rangeKey, (seenRanges.get(rangeKey) || 0) + 1);
        }
      }
    }

    const allowed = rd.filter((e) => !e._block).length;
    const hasRangeFields = boundedCount + unboundedCount > 0;
    if (hasRangeFields) {
      P(
        `- Relecturas del mismo archivo en la misma sesión: ${rereads} de ${allowed} lecturas permitidas (${pc(rereads, allowed)}) · mismo rango exacto: **${exactRangeRereads}** · rangos distintos (paginación): ${distinctRangeChunks}.`,
        `- Lecturas acotadas (\`bounded: true\`): **${boundedCount}** (${pc(boundedCount, boundedCount + unboundedCount)}) · sin acotar (\`bounded: false\`): ${unboundedCount}.`,
      );
    } else {
      P(
        `- Relecturas del mismo archivo en la misma sesión: ${rereads} de ${allowed} lecturas permitidas (${pc(rereads, allowed)}). Incluye lecturas por rangos distintos del mismo archivo: el rango no se registra.`,
      );
    }
    const ext = rd.filter((e) => !e._inRepo).length;
    const cut = rd.filter((e) => e._trunc).length;
    P(
      `- Lecturas fuera del repo: ${ext} (${pc(ext, rd.length)}).`,
      `- Rutas cortadas a ${effectiveCmdMax} caracteres: ${cut} (${pc(cut, rd.length)}).`,
      "",
    );
    const rows = top(f, JSON_TOP).map(([k, v]) => {
      const inRepo = fInRepo.get(k) === true;
      const lines = inRepo && !k.startsWith("(ruta cortada)") ? linesOf(k) : null;
      return { file: k, reads: v, sessions: fS.get(k).size, rereads: reread.get(k) || 0, blocked: fBlk.get(k) || 0, lines };
    });
    T(
      ["archivo", "lecturas", "sesiones", "relecturas", "bloqueadas", "líneas hoy"],
      rows.slice(0, topN).map((r) => [r.file, r.reads, r.sessions, r.rereads, r.blocked, r.lines ?? "–"]),
    );
    const dir = new Map();
    for (const e of rd) {
      let k;
      if (!e._inRepo) {
        k = "(fuera del repo)";
      } else {
        const clean = e._path.replace(/^\(ruta cortada\) /, "");
        const parts = clean.split("/");
        k = parts.length === 1 ? "(raíz)" : parts.slice(0, parts.length > 2 ? 2 : 1).join("/");
      }
      inc(dir, k);
    }
    P("", "Lecturas por carpeta:", "");
    T(["carpeta", "lecturas", "%"], top(dir, topN).map(([k, v]) => [k, v, pc(v, rd.length)]));
    const distinct = [...new Set(rd.filter((e) => e._inRepo && e._exists && !e._trunc).map((e) => e._path))];
    const ls = stats(distinct.map((p) => linesOf(p)).filter((x) => x != null));
    const over = distinct.filter((p) => (linesOf(p) || 0) > 300).length;
    P(
      "",
      `- Archivos distintos leídos (que existen hoy): ${distinct.length} · líneas p50 ${r1(ls.p50)}, p90 ${r1(ls.p90)}, p95 ${r1(ls.p95)}, máx ${ls.max ?? "–"} · con más de 300 líneas: ${over} (${pc(over, distinct.length)}).`,
    );
    J.reads = {
      total: rd.length,
      allowed,
      rereads,
      exactRangeRereads,
      distinctRangeChunks,
      bounded: boundedCount,
      unbounded: unboundedCount,
      truncatedPaths: cut,
      external: ext,
      files: rows,
      byDir: Object.fromEntries(top(dir, JSON_TOP)),
      distinctFiles: distinct.length,
      lineStats: ls,
      over300: over,
    };
  });

  // 4. Escrituras
  section("escrituras", () => {
    const wr = actions.filter((e) => e._kind === "write");
    H(`4. Escrituras (${wr.length})`);
    const f = new Map();
    const fS = new Map();
    const perSess = new Map();
    const tool = new Map();
    for (const e of wr) {
      inc(f, e._path);
      addSet(fS, e._path, e.session);
      inc(perSess, `${e.session}\u0000${e._path}`);
      inc(tool, `${e.runtime}\u0000${e.tool}`);
    }
    const churn = new Map();
    for (const [k, v] of perSess) {
      const p = k.split("\u0000")[1];
      if (v > (churn.get(p) || 0)) churn.set(p, v);
    }
    const rows = top(f, JSON_TOP).map(([k, v]) => ({
      file: k,
      writes: v,
      sessions: fS.get(k).size,
      maxInOneSession: churn.get(k) || 0,
    }));
    T(
      ["archivo", "escrituras", "sesiones", "máx en una sesión"],
      rows.slice(0, topN).map((r) => [r.file, r.writes, r.sessions, r.maxInOneSession]),
    );
    P("", "Escrituras por tool:", "");
    T(["runtime", "tool", "escrituras"], top(tool, 15).map(([k, v]) => [...k.split("\u0000"), v]));
    const churnStats = stats([...perSess.values()]);
    P("", `- Ediciones del mismo archivo dentro de una sesión: p50 ${r1(churnStats.p50)}, p90 ${r1(churnStats.p90)}, máx ${churnStats.max ?? "–"}.`);
    J.writes = { total: wr.length, files: rows, byTool: Object.fromEntries(top(tool, 30)), churn: churnStats };
  });

  // 5. Búsqueda y exploración (shell + nativa kind: "search")
  section("busqueda", () => {
    H("5. Búsqueda y exploración (shell y nativa)");
    const fams = ["búsqueda", "listar archivos", "ver archivo por shell"];
    const rows = [];
    for (const fm of fams) {
      const per = S.map((s) => s.actions.filter((e) => e._kind === "shell" && e._fam === fm).length);
      const pre = S.filter((s) => s.firstWrite > 0).map(
        (s) => s.actions.slice(0, s.firstWrite).filter((e) => e._kind === "shell" && e._fam === fm).length,
      );
      const st = stats(per);
      const sp = stats(pre);
      rows.push([fm, st.sum, r1(st.p50), r1(st.p90), st.max, r1(sp.p50), r1(sp.p90)]);
    }
    const nativeSearch = actions.filter((e) => e._kind === "search");
    if (nativeSearch.length > 0) {
      const perNative = S.map((s) => s.actions.filter((e) => e._kind === "search").length);
      const preNative = S.filter((s) => s.firstWrite > 0).map(
        (s) => s.actions.slice(0, s.firstWrite).filter((e) => e._kind === "search").length,
      );
      const st = stats(perNative);
      const sp = stats(preNative);
      rows.push(["búsqueda nativa (search)", st.sum, r1(st.p50), r1(st.p90), st.max, r1(sp.p50), r1(sp.p90)]);
    }
    T(["familia", "total", "por sesión p50", "p90", "máx", "antes de 1ª edición p50", "p90"], rows);

    const nativeByTool = new Map();
    if (nativeSearch.length > 0) {
      for (const e of nativeSearch) inc(nativeByTool, `${e.runtime || "unknown"}\u0000${e.tool || "?"}`);
      P("", "Búsquedas nativas (`kind: \"search\"`) por runtime y tool:", "");
      T(["runtime", "tool", "llamadas"], top(nativeByTool, 15).map(([k, v]) => [...k.split("\u0000"), v]));
    }

    const views = new Map();
    const viewInRepo = new Map();
    for (const e of shell) {
      for (const v of e._views || []) {
        inc(views, v.rel);
        if (!viewInRepo.has(v.rel)) viewInRepo.set(v.rel, v.inRepo);
      }
    }
    P("", "Archivos más vistos por shell (cat/Get-Content/sed -n/head/tail):", "");
    T(
      ["archivo", "veces", "líneas hoy"],
      top(views, topN).map(([k, v]) => [k, v, viewInRepo.get(k) ? (linesOf(k) ?? "–") : "–"]),
    );
    J.search = {
      perFamily: rows,
      nativeTotal: nativeSearch.length,
      nativeByTool: Object.fromEntries(top(nativeByTool, 20)),
      shellViews: Object.fromEntries(top(views, JSON_TOP)),
    };
  });

  // 6. Repeticiones
  section("repeticiones", () => {
    H("6. Llamadas repetidas (mismo comando o archivo en la misma sesión)");
    const deltas = [];
    const dupKey = new Map();
    const dupFam = new Map();
    let dupAllowed = 0;
    let dupBlocked = 0;
    let backToBack = 0;
    let dupRO = 0;
    for (const s of S) {
      const lastOk = new Map();
      const lastAny = new Map();
      let prev = null;
      for (const e of s.actions) {
        const key = `${e._kind}\u0000${e._cmd}`;
        if (prev === key) backToBack++;
        if (e._block) {
          const la = lastAny.get(key);
          if (la != null && Number.isFinite(e._t) && e._t - la <= DUP_WINDOW_MS) dupBlocked++;
        } else {
          const lt = lastOk.get(key);
          if (lt != null && Number.isFinite(e._t)) {
            const d = e._t - lt;
            deltas.push(d);
            if (d <= DUP_WINDOW_MS) {
              dupAllowed++;
              inc(dupKey, `${e._kind === "shell" ? e._sig : e._kind}\u0000${e._kind === "shell" ? e._cmd : e._path}`);
              inc(dupFam, e._kind === "shell" ? e._fam : e._kind);
              if (isReadOnly(e)) dupRO++;
            }
          }
          lastOk.set(key, e._t);
        }
        lastAny.set(key, e._t);
        prev = key;
      }
    }
    P(
      `- Repeticiones permitidas dentro de ${DUP_WINDOW_MS / 60000} min: **${dupAllowed}** (${pc(dupAllowed, actions.length)} de todas las acciones) · de solo lectura (candidatas a caché): **${dupRO}**`,
      `- Reintentos de llamadas bloqueadas: ${dupBlocked} · llamadas idénticas consecutivas: ${backToBack}`,
      "",
    );
    T(["familia", "repeticiones"], top(dupFam, 15));
    P("", "Lo que más se repite (firma · comando o archivo):", "");
    T(
      ["firma", "comando / archivo", "repeticiones"],
      top(dupKey, topN).map(([k, v]) => {
        const [a, b] = k.split("\u0000");
        return [a, a === "read" || a === "read_many" ? b : ex(b), v];
      }),
    );
    const sens = [1, 5, 10, 30, 60].map((m) => [`${m} min`, deltas.filter((d) => d <= m * 60000).length]);
    P("", "Sensibilidad de la ventana de repetición:", "");
    T(["ventana", "repeticiones permitidas"], sens);
    J.repeats = {
      allowedWithin10m: dupAllowed,
      readOnly: dupRO,
      blockedRetries: dupBlocked,
      backToBack,
      byFamily: Object.fromEntries(top(dupFam, 50)),
      sensitivity: Object.fromEntries(sens),
    };
  });

  // 7. Secuencias
  section("secuencias", () => {
    H("7. Secuencias frecuentes (candidatas a macro-tools)");
    const ng = { 2: new Map(), 3: new Map(), 4: new Map() };
    const macros = new Map();
    const readRuns = [];
    const sameRuns = new Map();
    for (const s of S) {
      const col = [];
      const runs = [];
      for (const e of s.actions) {
        const t = tokOf(e);
        if (col.at(-1) === t) runs[runs.length - 1]++;
        else {
          col.push(t);
          runs.push(1);
        }
      }
      col.forEach((t, i) => {
        if (t === "read") readRuns.push(runs[i]);
        else if (runs[i] > 1 && !["write", "read", "search"].includes(t)) inc(sameRuns, t, runs[i] - 1);
      });
      for (const n of [2, 3, 4]) {
        for (let i = 0; i + n <= col.length; i++) {
          const g = col.slice(i, i + n);
          const key = g.join(" → ");
          inc(ng[n], key);
          if (n >= 3 && g.every((x) => !x.startsWith("✗") && !["read", "write", "read_many", "search", "other"].includes(x))) {
            inc(macros, key);
          }
        }
      }
    }
    P("_Las corridas consecutivas de la misma llamada se agrupan en un solo paso. «✗» marca una llamada bloqueada._", "");
    for (const n of [2, 3, 4]) {
      P(`Top ${n}-gramas:`, "");
      T(["secuencia", "veces"], top(ng[n], n === 2 ? topN : Math.ceil(topN * 0.75)));
      P("");
    }
    P("Secuencias de solo shell, 3 o 4 pasos (lo más directo para convertir en un único script):", "");
    T(["secuencia", "veces"], top(macros, topN).filter(([, v]) => v >= 2));
    // B8: pasos búsqueda ↔ lectura (rg/grep por shell y Grep/Glob nativa, por separado y sumados, por runtime)
    const makeTrans = () => ({ forward: 0, reverse: 0, total: 0, byRuntime: new Map() });
    const srShell = makeTrans();
    const srNative = makeTrans();
    const srTotal = makeTrans();
    const recordTrans = (bucket, dir, rt) => {
      bucket[dir]++;
      bucket.total++;
      inc(bucket.byRuntime, rt);
    };
    const searchKindOf = (e) => {
      if (e._block) return null;
      if (e._kind === "read" || e._kind === "read_many") return "read";
      if (e._kind === "search") return "native";
      if (e._kind === "shell" && e._fam === "búsqueda") return "shell";
      return "other";
    };
    for (const s of S) {
      const rt = s.runtime || "unknown";
      for (let i = 0; i + 1 < s.actions.length; i++) {
        const a = searchKindOf(s.actions[i]);
        const b = searchKindOf(s.actions[i + 1]);
        if (a === "shell" && b === "read") {
          recordTrans(srShell, "forward", rt);
          recordTrans(srTotal, "forward", rt);
        } else if (a === "read" && b === "shell") {
          recordTrans(srShell, "reverse", rt);
          recordTrans(srTotal, "reverse", rt);
        } else if (a === "native" && b === "read") {
          recordTrans(srNative, "forward", rt);
          recordTrans(srTotal, "forward", rt);
        } else if (a === "read" && b === "native") {
          recordTrans(srNative, "reverse", rt);
          recordTrans(srTotal, "reverse", rt);
        }
      }
    }
    const serializeTrans = (tr) => ({
      forward: tr.forward,
      reverse: tr.reverse,
      total: tr.total,
      byRuntime: Object.fromEntries(tr.byRuntime),
    });

    P("", "Pasos búsqueda ↔ lectura (por separado y sumados, por runtime):", "");
    T(
      ["tipo", "búsqueda → lectura", "lectura → búsqueda", "total", ...RTS],
      [
        ["shell (rg/grep ↔ lectura)", srShell.forward, srShell.reverse, srShell.total, ...RTS.map((rt) => srShell.byRuntime.get(rt) || 0)],
        ["nativa (Grep/Glob ↔ Read)", srNative.forward, srNative.reverse, srNative.total, ...RTS.map((rt) => srNative.byRuntime.get(rt) || 0)],
        ["total búsqueda ↔ lectura", srTotal.forward, srTotal.reverse, srTotal.total, ...RTS.map((rt) => srTotal.byRuntime.get(rt) || 0)],
      ],
    );

    const rr = stats(readRuns);
    P(
      "",
      `- Lecturas seguidas sin otra acción en medio: p50 ${r1(rr.p50)}, p90 ${r1(rr.p90)}, máx ${rr.max ?? "–"}. Si el p90 es alto, conviene una lectura por lotes o un «context pack».`,
      "",
      "Mismo comando repetido seguido (llamadas extra):",
      "",
    );
    T(["firma", "llamadas extra"], top(sameRuns, 15));
    J.sequences = {
      bigrams: Object.fromEntries(top(ng[2], JSON_TOP)),
      trigrams: Object.fromEntries(top(ng[3], JSON_TOP)),
      fourgrams: Object.fromEntries(top(ng[4], JSON_TOP)),
      shellMacros: Object.fromEntries(top(macros, JSON_TOP)),
      readRuns: rr,
      sameCommandRuns: Object.fromEntries(top(sameRuns, 50)),
      searchReadTransitions: {
        shell: serializeTrans(srShell),
        native: serializeTrans(srNative),
        total: serializeTrans(srTotal),
      },
    };
  });

  // 8. Tiempos (huecos activos + duraciones medidas pre/post + tasa de fallos)
  section("tiempos", () => {
    H("8. Tiempos y duraciones");
    const usableSum = actions.filter(usable).reduce((a, e) => a + e._gap, 0);
    const rows = [];
    for (const k of ["shell", "read", "write", "search", "read_many", "other"]) {
      const l = actions.filter((e) => e._kind === k);
      if (!l.length) continue;
      const g = stats(l.filter(usable).map((e) => e._gap));
      rows.push([k, l.length, sec(g.p50), sec(g.p90), hrs(g.sum), pc(g.sum, usableSum)]);
    }
    T(["tipo", "llamadas", "hueco p50 (s)", "p90 (s)", "total (h)", "% del tiempo activo"], rows);

    if (official.durations.pairedCount > 0) {
      P("", "Duración medida por pares pre/post (`post.ts − pre.ts`) por tipo:", "");
      T(
        ["tipo", "pares", "duración p50 (s)", "p90 (s)", "total (min)"],
        Object.entries(official.durations.byKind).map(([k, d]) => [k, d.count, sec(d.p50Ms), sec(d.p90Ms), mins(d.totalMs)]),
      );
      if (official.durations.topSignaturesByTotalMs.length > 0) {
        P("", "Top firmas por duración medida total:", "");
        T(
          ["firma", "pares", "duración p50 (s)", "p90 (s)", "total (min)", "fallos"],
          official.durations.topSignaturesByTotalMs
            .slice(0, topN)
            .map((r) => [r.signature, r.count, sec(r.p50Ms), sec(r.p90Ms), mins(r.totalMs), r.failed]),
        );
      }
      const o = official.durations.outcomes;
      P(
        "",
        `- Tasa de fallos (\`ok === false\`): ${o.failed} de ${o.evaluated} (${o.failureRate != null ? `${r1(o.failureRate * 100)}%` : "–"}).`,
      );
    }

    const gaps = actions.filter((e) => e._gap != null).map((e) => e._gap);
    const longGaps = [2, 5, 10, 15, 30, 60].map((m) => ({
      min: m,
      count: official.activeTimeMs.gapsOverMin[m] ?? gaps.filter((g) => g > m * 60000).length,
    }));
    P("", "Huecos largos (para calibrar el umbral de inactividad):", "");
    T(["mayor a", "huecos", "% de huecos"], longGaps.map((g) => [`${g.min} min`, g.count, pc(g.count, gaps.length)]));

    P("", "Qué consume el tiempo antes de la primera edición (sesiones con edición):", "");
    const preC = new Map();
    const preT = new Map();
    const preFiles = new Map();
    const preFileInRepo = new Map();
    const preShell = new Map();
    const withW = S.filter((s) => s.firstWrite > 0);
    for (const s of withW) {
      const seen = new Set();
      for (const e of s.actions.slice(0, s.firstWrite)) {
        const k = e._block ? "(bloqueada)" : e._kind === "shell" ? e._fam : e._kind;
        inc(preC, k);
        if (e._gap != null && !e._idle) inc(preT, k, e._gap);
        if ((e._kind === "read" || e._kind === "read_many") && !e._block && !seen.has(e._path)) {
          seen.add(e._path);
          inc(preFiles, e._path);
          if (!preFileInRepo.has(e._path)) preFileInRepo.set(e._path, e._inRepo);
        }
        if (e._kind === "shell" && !e._block) inc(preShell, e._sig);
      }
    }
    const totC = [...preC.values()].reduce((a, b) => a + b, 0);
    const totT = [...preT.values()].reduce((a, b) => a + b, 0);
    T(
      ["tipo/familia", "llamadas", "% llamadas", "tiempo (h)", "% tiempo"],
      top(preC, 20).map(([k, v]) => [k, v, pc(v, totC), hrs(preT.get(k) || 0), pc(preT.get(k) || 0, totT)]),
    );
    P(
      "",
      `Archivos que se leen antes de la primera edición (en cuántas de las ${withW.length} sesiones). Los que aparecen en la mayoría son candidatos a un «context pack»:`,
      "",
    );
    T(
      ["archivo", "sesiones", "% sesiones", "líneas hoy"],
      top(preFiles, topN).map(([k, v]) => [k, v, pc(v, withW.length), preFileInRepo.get(k) ? (linesOf(k) ?? "–") : "–"]),
    );
    P("", "Comandos de shell antes de la primera edición:", "");
    T(["firma", "llamadas"], top(preShell, topN));
    J.timing = {
      byKind: rows,
      measuredDurations: official.durations,
      longGaps,
      preFirstEdit: {
        calls: Object.fromEntries(top(preC, 50)),
        timeMs: Object.fromEntries(top(preT, 50)),
        files: Object.fromEntries(top(preFiles, JSON_TOP)),
        shell: Object.fromEntries(top(preShell, JSON_TOP)),
        sessions: withW.length,
      },
    };
  });

  // 9. Bloqueos
  const ruleData = new Map();
  section("bloqueos", () => {
    H("9. Bloqueos: costo y recuperación");
    for (const s of S) {
      const a = s.actions;
      for (let i = 0; i < a.length; i++) {
        const b = a[i];
        if (!b._block) continue;
        const rule = b.rule || "(sin regla)";
        if (excludeRulesSet.has(rule)) continue;
        let R = ruleData.get(rule);
        if (!R) {
          R = {
            blocks: 0,
            sessions: new Set(),
            rt: new Map(),
            trig: new Map(),
            next: new Map(),
            examples: new Set(),
            immediate: 0,
            recCalls: [],
            recMs: [],
            unrecovered: 0,
            lostMs: 0,
            literal: 0,
            perSession: new Map(),
          };
          ruleData.set(rule, R);
        }
        R.blocks++;
        R.sessions.add(s.id);
        inc(R.rt, b.runtime);
        inc(R.perSession, s.id);
        inc(R.trig, b._kind === "shell" ? b._sig : b._path);
        if (R.examples.size < 3) R.examples.add(b._cmd);
        const nx = a[i + 1];
        inc(R.next, nx ? tokOf(nx) : "(fin de sesión)");
        if (nx && nx._block && nx.rule === b.rule) R.immediate++;
        let j = i + 1;
        while (j < a.length && (a[j]._block || a[j]._kind !== b._kind)) j++;
        if (j < a.length && Number.isFinite(a[j]._t) && Number.isFinite(b._t)) {
          R.recCalls.push(j - i);
          const dt = a[j]._t - b._t;
          R.recMs.push(dt);
          R.lostMs += Math.min(dt, capMs);
        } else R.unrecovered++;
        if (looksLiteral(b, rule)) R.literal++;
      }
    }
    const rules = [...ruleData.entries()].sort((x, y) => y[1].blocks - x[1].blocks);
    T(
      [
        "regla",
        "bloqueos",
        "sesiones",
        ...RTS,
        "repite de inmediato",
        "llamadas hasta recuperar p50",
        "tiempo hasta recuperar p50 (s)",
        "p90 (s)",
        "sin recuperar",
        "min perdidos (est.)",
        "posibles literales",
      ],
      rules.map(([k, R]) => {
        const rc = stats(R.recCalls);
        const rm = stats(R.recMs);
        return [
          k,
          R.blocks,
          R.sessions.size,
          ...RTS.map((rt) => R.rt.get(rt) || 0),
          R.immediate,
          r1(rc.p50),
          sec(rm.p50),
          sec(rm.p90),
          R.unrecovered,
          mins(R.lostMs),
          R.literal,
        ];
      }),
    );
    // C4: bloqueos comparables («legítimos»), misma función en ambas ventanas
    const compExcl = { newRules: 0, searchKind: 0, prSealLiterals: 0, fsProtectedFp: 0 };
    const compByRtMap = new Map();
    let compTotal = 0;
    let rawBlocksTotal = 0;
    for (const s of S) {
      const rt = s.runtime || "unknown";
      let rtRec = compByRtMap.get(rt);
      if (!rtRec) {
        rtRec = { sessions: 0, total: 0, rawTotal: 0 };
        compByRtMap.set(rt, rtRec);
      }
      rtRec.sessions++;
      for (const e of s.actions) {
        if (!e._block) continue;
        rawBlocksTotal++;
        rtRec.rawTotal++;
        const res = classifyComparableBlock(e);
        if (res.comparable) {
          compTotal++;
          rtRec.total++;
        } else if (res.reason && res.reason in compExcl) {
          compExcl[res.reason]++;
        }
      }
    }
    const compPerSess = sessions.size > 0 ? Math.round((compTotal / sessions.size) * 100) / 100 : 0;
    const rawPerSess = sessions.size > 0 ? Math.round((rawBlocksTotal / sessions.size) * 100) / 100 : 0;
    const compByRuntime = Object.fromEntries(
      [...compByRtMap.entries()].map(([rt, r]) => [
        rt,
        {
          total: r.total,
          perSession: r.sessions > 0 ? Math.round((r.total / r.sessions) * 100) / 100 : 0,
          rawTotal: r.rawTotal,
          rawPerSession: r.sessions > 0 ? Math.round((r.rawTotal / r.sessions) * 100) / 100 : 0,
          sessions: r.sessions,
        },
      ]),
    );

    const totalLost = rules.reduce((acc, [, R]) => acc + R.lostMs, 0);
    P(
      "",
      `- **Bloqueos comparables (C4):** **${compTotal}** (${compPerSess}/sesión) sobre ${rawBlocksTotal} totales (${rawPerSess}/sesión) — excluidos: reglas nuevas (\`shell.polling\`): ${compExcl.newRules}, \`kind: "search"\`: ${compExcl.searchKind}, menciones literales \`pr.requires-seal\`: ${compExcl.prSealLiterals}, FPs \`fs.protected\` (borradores/tool-results): ${compExcl.fsProtectedFp}.`,
      `- Tiempo total estimado entre un bloqueo y la siguiente llamada permitida del mismo tipo: **${hrs(totalLost)} h** (cada caso se corta en ${idleMin} min).`,
      "- «Posibles literales»: bloqueos cuyo comando principal es una búsqueda, un `cat`, un commit, un `echo` o un comentario en multica/gh. Probablemente el texto peligroso estaba dentro de un argumento: candidatos a falso positivo (como H-05).",
    );
    J.comparableBlocks = {
      total: compTotal,
      perSession: compPerSess,
      rawTotal: rawBlocksTotal,
      rawPerSession: rawPerSess,
      excluded: compExcl,
      byRuntime: compByRuntime,
    };
    for (const [k, R] of rules.slice(0, 10)) {
      P("", `### ${k}`, "");
      P(`- Disparadores: ${top(R.trig, 6).map(([t, v]) => `\`${short(t, 70)}\` ×${v}`).join(" · ")}`);
      P(`- Qué hace el agente justo después: ${top(R.next, 4).map(([t, v]) => `\`${short(t, 50)}\` ×${v}`).join(" · ")}`);
      const ps = stats([...R.perSession.values()]);
      P(`- Bloqueos por sesión afectada: p50 ${r1(ps.p50)}, p90 ${r1(ps.p90)}, máx ${ps.max}`);
      if (examples) P(`- Ejemplos: ${[...R.examples].map((x) => `\`${ex(x)}\``).join(" · ")}`);
    }
    J.blocks = Object.fromEntries(
      rules.map(([k, R]) => [
        k,
        {
          blocks: R.blocks,
          sessions: R.sessions.size,
          byRuntime: Object.fromEntries(R.rt),
          triggers: Object.fromEntries(top(R.trig, 30)),
          next: Object.fromEntries(top(R.next, 15)),
          immediateRepeat: R.immediate,
          recoveryCalls: stats(R.recCalls),
          recoveryMs: stats(R.recMs),
          unrecovered: R.unrecovered,
          lostMs: R.lostMs,
          possibleLiteral: R.literal,
          perSession: stats([...R.perSession.values()]),
        },
      ]),
    );
  });

  // 9b. read.oversize en detalle
  section("read.oversize", () => {
    const blocked = actions.filter((e) => e._block && e.rule === "read.oversize");
    if (!blocked.length) return;
    H("9b. read.oversize en detalle");
    const files = new Map();
    const fileInRepo = new Map();
    let laterOk = 0;
    const attempts = new Map();
    for (const b of blocked) {
      inc(files, b._path);
      if (!fileInRepo.has(b._path)) fileInRepo.set(b._path, b._inRepo);
      inc(attempts, `${b.session}\u0000${b._path}`);
      if (b._sess.actions.slice(b._pos + 1).some((x) => x._kind === "read" && !x._block && x._path === b._path)) laterOk++;
    }
    const at = stats([...attempts.values()]);
    P(
      `- Bloqueos: ${blocked.length} · el mismo archivo se termina leyendo bien más tarde en la sesión: ${laterOk} (${pc(laterOk, blocked.length)})`,
      `- Intentos bloqueados por (sesión, archivo): p50 ${r1(at.p50)}, p90 ${r1(at.p90)}, máx ${at.max}`,
      "",
    );
    T(
      ["archivo", "bloqueos", "líneas hoy"],
      top(files, topN).map(([k, v]) => [k, v, fileInRepo.get(k) && !k.startsWith("(ruta cortada)") ? (linesOf(k) ?? "–") : "–"]),
    );
    const withLines = blocked.map((b) => (b._inRepo && !b._trunc ? linesOf(b._path) : null)).filter((x) => x != null);
    P("", `Simulación del umbral (sobre ${withLines.length} bloqueos con archivo medible hoy; supone que la lectura no tenía rango):`, "");
    T(
      ["umbral de líneas", "bloqueos que se evitarían", "%", "líneas extra que entrarían al contexto"],
      [400, 500, 800, 1000, 1500].map((th) => {
        const l = withLines.filter((n) => n <= th);
        return [th, l.length, pc(l.length, withLines.length), l.reduce((a, b) => a + b, 0)];
      }),
    );
    const okBig = actions.filter(
      (e) =>
        e._kind === "read" &&
        !e._block &&
        e._inRepo &&
        !e._trunc &&
        (e.bounded === true || (e.bounded === undefined && (linesOf(e._path) || 0) > 300)),
    );
    P(
      "",
      `- Lecturas permitidas acotadas o de archivos > 300 líneas: ${okBig.length} sobre ${new Set(okBig.map((e) => e._path)).size} archivos.`,
    );
    J.readOversize = {
      blocked: blocked.length,
      laterOk,
      attempts: at,
      files: Object.fromEntries(top(files, JSON_TOP)),
      boundedReadsOfBigFiles: okBig.length,
    };
  });

  // 9c. pr.requires-seal en detalle
  section("pr.requires-seal", () => {
    const allSealBlocks = actions.filter((e) => e._block && e.rule === "pr.requires-seal");
    const sess = S.filter((s) => s.actions.some((e) => e._block && e.rule === "pr.requires-seal"));
    if (!sess.length) return;
    H("9c. pr.requires-seal en detalle");

    // B7: separar `gh pr create` en posición de comando de menciones literales usando el detector de A3
    let cmdPosCount = 0;
    let literalCount = 0;
    const sealRtMap = new Map();
    for (const b of allSealBlocks) {
      const isCmd = detectGhPrCommands(b._cmd).some((m) => m.action === "pr.create");
      const rt = b.runtime || "unknown";
      let rec = sealRtMap.get(rt);
      if (!rec) {
        rec = { total: 0, commandPosition: 0, literalMentions: 0 };
        sealRtMap.set(rt, rec);
      }
      rec.total++;
      if (isCmd) {
        cmdPosCount++;
        rec.commandPosition++;
      } else {
        literalCount++;
        rec.literalMentions++;
      }
    }
    const sealByRuntime = Object.fromEntries(sealRtMap);

    // C2: helper predicates shared across pr.requires-seal (9c), gate (11) and adoption (14)
    const hasAnyPost = postCount > 0;
    const isHarnessGateEv = (e) => e._kind === "shell" && (e._segs || []).some((x) => /harness-gate/.test(x));
    const isHarnessShipEv = (e) => e._kind === "shell" && (e._segs || []).some((x) => /harness-ship/.test(x));
    const isGateRunEv = (e) =>
      isHarnessGateEv(e) || (isHarnessShipEv(e) && (e._durMs == null || e._durMs >= gateMinSec * 1000));
    const isPrCreateEv = (e) =>
      e._kind === "shell" &&
      !e._block &&
      ((e._segs || []).some((x) => x === "gh pr create") ||
        (isHarnessShipEv(e) && (e._ok === true || (e._ok === null && !hasAnyPost))));

    const toOk = [];
    const gates = [];
    let never = 0;
    let staleLearn = 0;
    for (const s of sess) {
      const a = s.actions;
      const f = a.findIndex((e) => e._block && e.rule === "pr.requires-seal");
      const ok = a.findIndex((e, i) => i > f && isPrCreateEv(e));
      if (ok < 0) never++;
      else {
        toOk.push(a[ok]._t - a[f]._t);
        gates.push(a.slice(f, ok).filter(isGateRunEv).length);
      }
      let lastGate = -1;
      let learnAfterGate = false;
      for (let i = 0; i < a.length; i++) {
        const segs = a[i]._segs || [];
        if (isGateRunEv(a[i])) {
          lastGate = i;
          learnAfterGate = false;
        }
        if (segs.some((x) => /harness-learn/.test(x)) && lastGate >= 0) learnAfterGate = true;
        if (a[i]._block && a[i].rule === "pr.requires-seal" && learnAfterGate) {
          staleLearn++;
          break;
        }
      }
    }
    const t = stats(toOk);
    const g = stats(gates);
    const rtSplitStr =
      Object.entries(sealByRuntime)
        .map(([rt, r]) => `${rt}: ${r.commandPosition} comando / ${r.literalMentions} literal`)
        .join(" · ") || "–";
    P(
      `- Bloqueos \`pr.requires-seal\`: **${allSealBlocks.length}** total — **${cmdPosCount}** con \`gh pr create\` en posición de comando · **${literalCount}** menciones literales (${rtSplitStr})`,
      `- Sesiones con el bloqueo: ${sess.length} · nunca lograron crear PR en la misma sesión: ${never}`,
      `- Desde el primer bloqueo hasta la creación de PR exitosa: p50 ${mins(t.p50)} min, p90 ${mins(t.p90)} min`,
      `- Corridas de gate (\`harness-gate\`/\`harness-ship\`) entre el bloqueo y el éxito: p50 ${r1(g.p50)}, p90 ${r1(g.p90)}, máx ${g.max ?? "–"}`,
      `- Sesiones donde \`harness-learn\` corrió después del gate y antes del bloqueo (orden que deja el sello viejo): ${staleLearn}`,
    );
    J.prSeal = {
      sessions: sess.length,
      totalBlocks: allSealBlocks.length,
      commandPosition: cmdPosCount,
      literalMentions: literalCount,
      byRuntime: sealByRuntime,
      never,
      msToSuccess: t,
      gateRunsBetween: g,
      staleLearnPattern: staleLearn,
    };
  });

  // 10. Inyecciones
  section("inyecciones", () => {
    const inj = events.filter((e) => e.inject === true);
    if (!inj.length) return;
    H(`10. Inyecciones (${inj.length})`);
    const by = new Map();
    for (const e of inj) {
      const k = e.rule || "(sin regla)";
      let r = by.get(k);
      if (!r) {
        r = { n: 0, trig: new Map(), ex: new Set() };
        by.set(k, r);
      }
      r.n++;
      inc(r.trig, e._kind === "shell" ? e._sig : e._path || e._kind);
      if (r.ex.size < 2) r.ex.add(e._cmd);
    }
    T(
      ["regla", "inyecciones", "disparadores principales", "ejemplo"],
      [...by]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([k, r]) => [
          k,
          r.n,
          top(r.trig, 4)
            .map(([t, v]) => `${t} ×${v}`)
            .join(", "),
          examples ? ex([...r.ex][0]) : "(oculto)",
        ]),
    );
    J.injections = Object.fromEntries([...by].map(([k, r]) => [k, { count: r.n, triggers: Object.fromEntries(top(r.trig, 20)) }]));
  });

  // 11. Gate y tests
  section("gate", () => {
    H("11. Gate, tests y build");
    const hasAnyPost = postCount > 0;
    const isHarnessGateEv = (e) => e._kind === "shell" && (e._segs || []).some((x) => /harness-gate/.test(x));
    const isHarnessShipEv = (e) => e._kind === "shell" && (e._segs || []).some((x) => /harness-ship/.test(x));
    // C2: harness-ship cuenta como corrida del gate solo si duró >= gateMinSec s, o sin duración (v1) como cota superior.
    const isGateRunEv = (e) =>
      isHarnessGateEv(e) || (isHarnessShipEv(e) && (e._durMs == null || e._durMs >= gateMinSec * 1000));
    // C2: sesión que crea PR tiene un `gh pr create` permitido o un `harness-ship.mjs` con `ok=true` (o sin post en v1).
    const isPrCreateEv = (e) =>
      e._kind === "shell" &&
      !e._block &&
      ((e._segs || []).some((x) => x === "gh pr create") ||
        (isHarnessShipEv(e) && (e._ok === true || (e._ok === null && !hasAnyPost))));
    const gateUpperBound = shell.some((e) => isHarnessShipEv(e) && e._durMs == null);

    const segTest = (fn) => (e) => (e._segs || []).some(fn);
    const classes = [
      ["harness-gate.sh", isHarnessGateEv],
      ["harness-ship.mjs", isHarnessShipEv],
      ["gate (harness-gate + harness-ship)", isGateRunEv],
      ["harness-learn.sh", segTest((x) => /harness-learn/.test(x))],
      ["npm test (suite completa)", segTest((x) => /^(npm|pnpm|yarn) (test|run test)$/.test(x))],
      ["npm test <archivo>", segTest((x) => /^(npm|pnpm|yarn) (test|run test\S*) <archivo>$/.test(x))],
      ["npx vitest (suite completa)", segTest((x) => x === "npx vitest (suite completa)")],
      ["npx vitest <archivo>", segTest((x) => x === "npx vitest <archivo>")],
      ["typecheck", segTest((x) => /^(npm|pnpm|yarn) run (typecheck|type-check)/.test(x) || x === "npx tsc")],
      ["lint", segTest((x) => /^(npm|pnpm|yarn) run lint/.test(x) || x === "npx eslint")],
      ["build", segTest((x) => /^(npm|pnpm|yarn) run build/.test(x) || x === "npx next build")],
      ["e2e/playwright", segTest((x) => /^npx playwright/.test(x) || /run (e2e|test:e2e)/.test(x))],
      ["gh pr create", segTest((x) => x === "gh pr create")],
      ["creación de PR (gh pr create + harness-ship)", isPrCreateEv],
    ];
    const hasDur = official.durations.pairedCount > 0;
    const rows = [];
    const jr = {};
    for (const [name, test] of classes) {
      const ev = shell.filter(test);
      if (!ev.length) {
        rows.push(hasDur ? [name, 0, 0, "–", "–", "–", "–", "–", "–", "–", 0] : [name, 0, 0, "–", "–", "–", "–", "–", "–", 0]);
        continue;
      }
      const per = new Map();
      for (const e of ev) inc(per, e.session);
      const ps = stats([...per.values()]);
      const g = stats(ev.filter(usable).map((e) => e._gap));
      const d = stats(ev.filter((e) => e._durMs != null).map((e) => e._durMs));
      const blocked = ev.filter((e) => e._block).length;
      rows.push(
        hasDur
          ? [name, ev.length, per.size, r1(ps.p50), r1(ps.p90), ps.max, sec(d.p50), sec(g.p50), sec(g.p90), hrs(g.sum), blocked]
          : [name, ev.length, per.size, r1(ps.p50), r1(ps.p90), ps.max, sec(g.p50), sec(g.p90), hrs(g.sum), blocked],
      );
      jr[name] = { calls: ev.length, sessions: per.size, perSession: ps, gapMs: g, durationMs: d, blocked };
    }
    T(
      hasDur
        ? ["acción", "llamadas", "sesiones", "por sesión p50", "p90", "máx", "dur p50 (s)", "hueco p50 (s)", "p90 (s)", "total (h)", "bloqueadas"]
        : ["acción", "llamadas", "sesiones", "por sesión p50", "p90", "máx", "hueco p50 (s)", "p90 (s)", "total (h)", "bloqueadas"],
      rows,
    );

    // C2: corridas del gate por sesión que crea PR (`gh pr create` permitido o `harness-ship.mjs` con `ok=true`)
    const prSessions = S.filter((s) => s.actions.some(isPrCreateEv));
    const gateCountsInPr = prSessions.map((s) => s.actions.filter(isGateRunEv).length);
    const gatePerPrSession = stats(gateCountsInPr);
    const boundNote = gateUpperBound
      ? "cota superior: hay llamadas `harness-ship.mjs` sin duración medida"
      : `\`harness-ship.mjs\` cuenta como gate solo si duró ≥ ${gateMinSec} s`;
    P(
      "",
      `- Sesiones que crean PR (\`gh pr create\` permitido o \`harness-ship.mjs\` con \`ok=true\`): **${prSessions.length}** · corridas del gate en esas sesiones: ${gatePerPrSession.sum} (p50 **${r1(gatePerPrSession.p50)}**, p90 ${r1(gatePerPrSession.p90)}, máx ${gatePerPrSession.max ?? "–"}; ${boundNote}).`,
      "_El hueco después de un gate o de una suite completa aproxima su duración (más el razonamiento siguiente). Si es mayor al umbral de inactividad, no se cuenta._",
    );
    jr._prCreatingSessions = {
      sessions: prSessions.length,
      gateRuns: gatePerPrSession,
      gateMinSec,
      upperBound: gateUpperBound,
    };
    J.gate = jr;
  });

  // 12. Multica y gh
  section("multica-gh", () => {
    H("12. Multica y gh");
    const ev = shell.filter((e) => e._fam === "multica" || e._fam === "gh");
    const sig = new Map();
    const sigS = new Map();
    const dups = new Map();
    for (const s of S) {
      const last = new Map();
      for (const e of s.actions) {
        if (e._kind !== "shell" || (e._fam !== "multica" && e._fam !== "gh") || e._block) continue;
        const lt = last.get(e._cmd);
        if (lt != null && e._t - lt <= DUP_WINDOW_MS) inc(dups, e._sig);
        last.set(e._cmd, e._t);
      }
    }
    for (const e of ev) {
      inc(sig, e._sig);
      addSet(sigS, e._sig, e.session);
    }
    const sg = new Map();
    for (const e of ev) if (usable(e)) addTo(sg, e._sig, e._gap);

    const isPrQuerySig = (s) =>
      s === "gh pr view" ||
      s === "gh pr list" ||
      s === "gh pr checks" ||
      s === "gh pr diff" ||
      s === "gh api" ||
      s === "node harness-pr-status.mjs" ||
      s === "node harness-pr-status.mjs --wait-checks";
    const isChecksSig = (s) =>
      s === "gh pr checks" || s === "gh run view" || s === "node harness-pr-status.mjs --wait-checks";

    const multicaEv = shell.filter((e) => e._fam === "multica");
    const agentListEv = multicaEv.filter(
      (e) =>
        e._sig === "multica agent list" ||
        e._sig === "node multica-ctx.mjs --agents" ||
        (/^multica agent\b/.test(e._sig) && /\blist\b/.test(e._cmd)),
    );
    const prQueryEv = ev.filter((e) => isPrQuerySig(e._sig));
    const checksEv = ev.filter((e) => isChecksSig(e._sig));
    let checksRepeated10m = 0;
    for (const [k, v] of dups.entries()) {
      if (isChecksSig(k)) checksRepeated10m += v;
    }
    const multicaPerSess = sessions.size > 0 ? Math.round((multicaEv.length / sessions.size) * 100) / 100 : 0;
    const prQueryPerSess = sessions.size > 0 ? Math.round((prQueryEv.length / sessions.size) * 100) / 100 : 0;

    P(
      `- Llamadas a Multica (CLI + \`multica-ctx\`/\`multica-post\`): **${multicaEv.length}** (${multicaPerSess}/sesión) · \`multica agent list\`: **${agentListEv.length}** en ${new Set(agentListEv.map((e) => e.session)).size} sesiones.`,
      `- Consultas sobre PRs (\`gh pr view/list/checks/diff\`, \`gh api\`, \`harness-pr-status\`): **${prQueryEv.length}** (${prQueryPerSess}/sesión).`,
      `- Consultas de checks (\`gh pr checks\`, \`gh run view\`, \`harness-pr-status --wait-checks\`): **${checksEv.length}** · repetidas en < 10 min: **${checksRepeated10m}**.`,
      "",
    );
    T(
      ["firma", "llamadas", "sesiones", "repetidas en < 10 min", "hueco p50 (s)"],
      top(sig, topN).map(([k, v]) => [k, v, sigS.get(k).size, dups.get(k) || 0, sec(stats(sg.get(k) || []).p50)]),
    );
    J.multicaGh = {
      signatures: Object.fromEntries(top(sig, JSON_TOP)),
      repeatedWithin10m: Object.fromEntries(top(dups, JSON_TOP)),
      multicaTotal: multicaEv.length,
      multicaPerSession: multicaPerSess,
      multicaAgentList: {
        calls: agentListEv.length,
        sessions: new Set(agentListEv.map((e) => e.session)).size,
      },
      prQueries: {
        total: prQueryEv.length,
        perSession: prQueryPerSess,
      },
      checksQueries: {
        total: checksEv.length,
        repeatedWithin10m: checksRepeated10m,
      },
    };
  });

  // 13. Parámetros
  section("parametros", () => {
    H("13. Datos para calibrar parámetros del harness");
    const pairsPerRule = [];
    for (const R of ruleData.values()) pairsPerRule.push(...R.perSession.values());
    const dist = [
      ["1", (c) => c === 1],
      ["2", (c) => c === 2],
      ["3", (c) => c === 3],
      ["4–5", (c) => c >= 4 && c <= 5],
      ["6+", (c) => c >= 6],
    ];
    P("Bloqueos de la misma regla por sesión (para el umbral de `repeatedBlockSessions`, hoy > 3, y el disparador de PPC, hoy >= 2):", "");
    T(["bloqueos de la misma regla en una sesión", "pares (sesión, regla)"], dist.map(([k, fn]) => [k, pairsPerRule.filter(fn).length]));
    const trunc = shell.filter((e) => e._trunc).length;
    const truncChained = shell.filter((e) => e._trunc && e._chain > 1).length;
    P(
      "",
      `- \`CMD_MAX\` (${effectiveCmdMax}): ${pc(trunc, shell.length)} de los comandos de shell se truncan (${truncChained} son encadenados).`,
      "- El umbral de `read.oversize` está simulado en la sección 9b. El umbral de inactividad, en la sección 8. La ventana de repetición, en la sección 6.",
    );
    if (datasetHasV2) {
      const allowedActions = actions.filter((e) => !e._block).length;
      P(
        `- Cobertura de fidelidad L-002: ${pc(official.durations.pairedCount, allowedActions)} de acciones permitidas con duración medida, ${actions.filter((e) => e._kind === "search").length} búsquedas nativas (\`kind: "search"\`).`,
      );
    } else {
      P(
        "- Ventana legacy (L-001): sin campos de fidelidad `01+02` (`id`, `ok`, `bounded`, `cwd`, `kind: \"search\"`).",
      );
    }
    J.parameters = {
      sameRulePerSession: Object.fromEntries(dist.map(([k, fn]) => [k, pairsPerRule.filter(fn).length])),
      cmdMax: effectiveCmdMax,
      truncatedShell: trunc,
      truncatedChained: truncChained,
    };
  });

  // 14. Adopción de intervenciones (C7)
  section("adopcion", () => {
    H("14. Adopción de intervenciones");
    const pctNum = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

    // 1. % de sesiones que empiezan con harness-context
    const isContextEv = (e) => e && e._kind === "shell" && (e._segs || []).some((x) => /harness-context/.test(x));
    const startsWithContext = S.filter((s) => isContextEv(s.actions[0])).length;
    const anyContext = S.filter((s) => s.actions.some(isContextEv)).length;

    // 2. % de sesiones que crean PR con harness-ship vs gh pr create
    const hasAnyPost = postCount > 0;
    const isShipPrEv = (e) =>
      e._kind === "shell" &&
      !e._block &&
      (e._segs || []).some((x) => /harness-ship/.test(x)) &&
      (e._ok === true || (e._ok === null && !hasAnyPost));
    const isGhPrEv = (e) => e._kind === "shell" && !e._block && (e._segs || []).some((x) => x === "gh pr create");
    const shipPrSess = S.filter((s) => s.actions.some(isShipPrEv)).length;
    const ghPrSess = S.filter((s) => s.actions.some(isGhPrEv)).length;
    const totalPrSess = S.filter((s) => s.actions.some((e) => isShipPrEv(e) || isGhPrEv(e))).length;

    // 3. Parte de las llamadas a Multica que pasa por multica-ctx / multica-post
    const multicaAll = shell.filter((e) => e._fam === "multica");
    const multicaHelpers = multicaAll.filter((e) => /\bmultica-(?:ctx|post)(?:\.mjs)?\b/.test(e._sig)).length;
    const multicaRaw = multicaAll.length - multicaHelpers;

    // 4. Parte de las consultas de PR que pasa por harness-pr-status
    const isPrQuerySig = (s) =>
      s === "gh pr view" ||
      s === "gh pr list" ||
      s === "gh pr checks" ||
      s === "gh pr diff" ||
      s === "gh api" ||
      s === "node harness-pr-status.mjs" ||
      s === "node harness-pr-status.mjs --wait-checks";
    const prQueryAll = shell.filter((e) => isPrQuerySig(e._sig));
    const prStatusHelpers = prQueryAll.filter((e) => /harness-pr-status/.test(e._sig)).length;
    const prStatusRaw = prQueryAll.length - prStatusHelpers;

    // 5. Claude Code: Read / Grep / Glob contra lecturas por Bash
    const ccActions = actions.filter((e) => (e.runtime || "") === "claude-code");
    const ccNativeRead = ccActions.filter((e) => e._kind === "read" || e._kind === "read_many").length;
    const ccNativeSearch = ccActions.filter((e) => e._kind === "search").length;
    const ccNativeTotal = ccNativeRead + ccNativeSearch;
    const ccBashPrimary = J.shell?.bashReads?.primary?.total ?? 0;
    const ccBashAll = J.shell?.bashReads?.total ?? 0;

    const adoption = {
      harnessContext: {
        startsCount: startsWithContext,
        anyCount: anyContext,
        totalSessions: S.length,
        startsPct: pctNum(startsWithContext, S.length),
        anyPct: pctNum(anyContext, S.length),
      },
      prCreation: {
        withShip: shipPrSess,
        withGhPrCreate: ghPrSess,
        totalSessions: totalPrSess,
        shipPct: pctNum(shipPrSess, totalPrSess),
      },
      multicaHelpers: {
        helperCalls: multicaHelpers,
        rawCliCalls: multicaRaw,
        totalCalls: multicaAll.length,
        helperPct: pctNum(multicaHelpers, multicaAll.length),
      },
      prStatusHelper: {
        helperCalls: prStatusHelpers,
        rawGhCalls: prStatusRaw,
        totalCalls: prQueryAll.length,
        helperPct: pctNum(prStatusHelpers, prQueryAll.length),
      },
      claudeCodeNativeVsBash: {
        nativeRead: ccNativeRead,
        nativeSearch: ccNativeSearch,
        nativeTotal: ccNativeTotal,
        bashReadsPrimary: ccBashPrimary,
        bashReadsAll: ccBashAll,
        nativeSharePct: pctNum(ccNativeTotal, ccNativeTotal + ccBashPrimary),
        nativeShareAllPct: pctNum(ccNativeTotal, ccNativeTotal + ccBashAll),
      },
    };

    T(
      ["intervención", "adoptado", "total / alternativa", "% adopción"],
      [
        ["Sesiones que empiezan con `harness-context`", `${startsWithContext} (en cualquier paso: ${anyContext})`, S.length, `${adoption.harnessContext.startsPct.toFixed(1)}%`],
        ["Sesiones que crean PR con `harness-ship` vs `gh pr create`", shipPrSess, `${totalPrSess} (\`gh pr create\`: ${ghPrSess})`, `${adoption.prCreation.shipPct.toFixed(1)}%`],
        ["Llamadas Multica vía `multica-ctx`/`multica-post`", multicaHelpers, `${multicaAll.length} (CLI directo: ${multicaRaw})`, `${adoption.multicaHelpers.helperPct.toFixed(1)}%`],
        ["Consultas de PR vía `harness-pr-status`", prStatusHelpers, `${prQueryAll.length} (\`gh\` directo: ${prStatusRaw})`, `${adoption.prStatusHelper.helperPct.toFixed(1)}%`],
        ["Claude Code: `Read`/`Grep`/`Glob` vs Bash (`grep`/`sed -n`/`cat`)", `${ccNativeTotal} (${ccNativeRead} Read + ${ccNativeSearch} Search)`, `${ccNativeTotal + ccBashPrimary} (Bash: ${ccBashPrimary}, +sec: ${ccBashAll})`, `${adoption.claudeCodeNativeVsBash.nativeSharePct.toFixed(1)}%`],
      ],
    );
    J.adoption = adoption;
  });

  return {
    markdown: `${md.join("\n")}\n`,
    json: J,
    crossCheck,
  };
}

// ───────────────────────────── comparación entre ventanas (C8) ─────────────────────────────

/**
 * Resolve a dot/bracket path inside a deep-dive JSON report (e.g. `sessions.(todas).calls.p50`,
 * `blocks["read.oversize"].blocks`, or `["blocks", "read.oversize", "blocks"]`).
 */
function lookupPath(obj, spec) {
  if (obj == null || spec == null) return null;
  let segments;
  if (Array.isArray(spec)) {
    segments = spec;
  } else {
    segments = [];
    const s = String(spec);
    let cur = "";
    let inBracket = false;
    let quote = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inBracket) {
        if (quote) {
          if (ch === quote) quote = null;
          else cur += ch;
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === "]") {
          segments.push(cur);
          cur = "";
          inBracket = false;
        } else {
          cur += ch;
        }
      } else if (ch === "[") {
        if (cur) {
          segments.push(cur);
          cur = "";
        }
        inBracket = true;
      } else if (ch === ".") {
        if (cur) {
          segments.push(cur);
          cur = "";
        }
      } else {
        cur += ch;
      }
    }
    if (cur) segments.push(cur);
  }
  let cur = obj;
  for (const key of segments) {
    if (cur == null || typeof cur !== "object") return null;
    cur = cur[key];
  }
  return typeof cur === "number" && Number.isFinite(cur) ? cur : null;
}

/** Resolve a numeric metric value from a deep-dive JSON using path, ratio, or sumPaths. */
export function resolveMetricValue(reportJson, metricDef) {
  if (!reportJson || !metricDef) return null;
  if (metricDef.numeratorPath && metricDef.denominatorPath) {
    const num = lookupPath(reportJson, metricDef.numeratorPath) ?? 0;
    const den = lookupPath(reportJson, metricDef.denominatorPath);
    if (den == null || den === 0) return null;
    const scale = metricDef.scale ?? 100;
    return Math.round((num / den) * scale * 100) / 100;
  }
  if (Array.isArray(metricDef.sumPaths)) {
    let total = 0;
    let found = false;
    for (const p of metricDef.sumPaths) {
      const v = lookupPath(reportJson, p);
      if (v != null) {
        total += v;
        found = true;
      }
    }
    return found ? total : metricDef.defaultIfMissing ?? null;
  }
  const v = lookupPath(reportJson, metricDef.path);
  if (v != null) return v;
  return metricDef.defaultIfMissing ?? null;
}

const DEFAULT_COMPARE_METRICS = [
  { id: "calls_p50_total", label: "Llamadas por sesión (p50)", runtime: "(todas)", path: "sessions.(todas).calls.p50", target: { type: "observe" } },
  { id: "cbfe_p50_total", label: "Llamadas antes de 1ª edición (p50)", runtime: "(todas)", path: "sessions.(todas).callsBeforeFirstEdit.p50", target: { type: "observe" } },
  { id: "ttfe_p50_total", label: "TTFE (p50, ms)", runtime: "(todas)", path: "sessions.(todas).ttfeMs.p50", target: { type: "observe" } },
  { id: "blocks_comparable", label: "Bloqueos comparables por sesión", runtime: "(todas)", path: "comparableBlocks.perSession", target: { type: "observe" } },
];

function evaluateTarget(baseVal, candVal, deltaPct, target) {
  if (!target || target.type === "observe") return "observada";
  if (candVal == null) return "sin datos";
  if (target.type === "rel_pct") {
    if (baseVal == null || baseVal === 0 || deltaPct == null) return "sin base";
    return target.deltaPct < 0
      ? deltaPct <= target.deltaPct ? "cumplida" : "pendiente"
      : deltaPct >= target.deltaPct ? "cumplida" : "pendiente";
  }
  if (target.type === "max") {
    const ok = target.strict ? candVal < target.value : candVal <= target.value;
    return ok ? "cumplida" : "pendiente";
  }
  if (target.type === "min") {
    const ok = target.strict ? candVal > target.value : candVal >= target.value;
    return ok ? "cumplida" : "pendiente";
  }
  if (target.type === "exact") {
    return candVal === target.value ? "cumplida" : "pendiente";
  }
  return "observada";
}

function formatTargetLabel(target, unit = "") {
  if (!target || target.type === "observe") return "observada";
  const u = unit === "%" ? "%" : "";
  if (target.type === "rel_pct") return `${target.deltaPct > 0 ? "+" : ""}${target.deltaPct}%`;
  if (target.type === "max") return `${target.strict ? "<" : "≤"} ${target.value}${u}`;
  if (target.type === "min") return `${target.strict ? ">" : "≥"} ${target.value}${u}`;
  if (target.type === "exact") return `= ${target.value}${u}`;
  return "observada";
}

/**
 * Compare a candidate deep-dive JSON report against a baseline deep-dive JSON report
 * using declarative metrics/targets (project-agnostic; targets live outside core).
 */
export function compareDeepReports(baselineJson, candidateJson, targetsConfig = null) {
  const baselineLabel = targetsConfig?.baselineLabel || "baseline";
  const candidateLabel = targetsConfig?.candidateLabel || "candidato";
  const metricDefs = Array.isArray(targetsConfig?.metrics) && targetsConfig.metrics.length > 0
    ? targetsConfig.metrics
    : DEFAULT_COMPARE_METRICS;

  const rows = metricDefs.map((m) => {
    const baseVal = resolveMetricValue(baselineJson, m);
    const candVal = resolveMetricValue(candidateJson, m);
    let deltaPct = null;
    if (baseVal != null && candVal != null && baseVal !== 0) {
      deltaPct = Math.round(((candVal - baseVal) / baseVal) * 1000) / 10;
    }
    const status = evaluateTarget(baseVal, candVal, deltaPct, m.target);
    return {
      id: m.id,
      label: m.label,
      runtime: m.runtime || "(todas)",
      unit: m.unit || "",
      baseline: baseVal,
      candidate: candVal,
      deltaPct,
      targetLabel: formatTargetLabel(m.target, m.unit || ""),
      status,
      note: m.note || "",
    };
  });

  return { baselineLabel, candidateLabel, rows };
}

function fmtCompVal(v, unit) {
  if (v == null) return "–";
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "ms") return `${Math.round(v)} ms`;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/** Format the comparison result as a Markdown table. */
export function formatComparisonMarkdown(comparison) {
  const lines = [
    `## Comparación ${comparison.baselineLabel} vs. ${comparison.candidateLabel}`,
    "",
    `| métrica | runtime | ${comparison.baselineLabel} | ${comparison.candidateLabel} | delta % | meta | estado |`,
    "|---|---|---|---|---|---|---|",
  ];
  for (const r of comparison.rows) {
    const deltaStr = r.deltaPct == null ? "–" : `${r.deltaPct > 0 ? "+" : ""}${r.deltaPct.toFixed(1)}%`;
    lines.push(
      `| ${r.label} | ${r.runtime} | ${fmtCompVal(r.baseline, r.unit)} | ${fmtCompVal(r.candidate, r.unit)} | ${deltaStr} | ${r.targetLabel} | ${r.status} |`,
    );
  }
  return lines.join("\n");
}

/**
 * Ejecuta el análisis profundo desde un archivo JSONL y escribe `deep-dive.md` y `deep-dive.json`
 * en `outDir` (por defecto `<git common dir>/harness/telemetry/deep-dive/`, no versionada).
 *
 * @param {{
 *   file?: string | null,
 *   since?: string | null,
 *   until?: string | null,
 *   idleMin?: number,
 *   minSchema?: number | null,
 *   gateMinSec?: number,
 *   compare?: string | null,
 *   targets?: string | null,
 *   excludeKinds?: string[],
 *   excludeRules?: string[],
 *   top?: number,
 *   out?: string | null,
 *   examples?: boolean,
 *   repoRoot?: string | null,
 * }} [options]
 */
export function runDeepDive(options = {}) {
  const repoCwd = path.resolve(options.repoRoot || process.cwd());
  const telemetryDir = resolveTelemetryDir(repoCwd);
  const file = options.file ? path.resolve(options.file) : path.join(telemetryDir, "events.jsonl");

  const rawText = readFileSync(file, "utf8");
  let invalidLines = 0;
  for (const line of String(rawText).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      JSON.parse(trimmed);
    } catch {
      invalidLines++;
    }
  }
  const rawEvents = parseJsonl(rawText);

  const result = analyzeDeep(rawEvents, {
    since: options.since ?? null,
    until: options.until ?? null,
    idleMin: options.idleMin ?? 15,
    minSchema: options.minSchema ?? null,
    gateMinSec: options.gateMinSec ?? DEFAULT_GATE_MIN_SEC,
    excludeKinds: options.excludeKinds ?? [],
    excludeRules: options.excludeRules ?? [],
    top: options.top ?? 20,
    examples: options.examples !== false,
    repoRoot: repoCwd,
    file,
    invalidLines,
  });

  let comparison = null;
  let comparisonMarkdown = "";
  if (options.compare) {
    const baselineJson = JSON.parse(readFileSync(path.resolve(options.compare), "utf8"));
    const targetsConfig = options.targets ? JSON.parse(readFileSync(path.resolve(options.targets), "utf8")) : null;
    comparison = compareDeepReports(baselineJson, result.json, targetsConfig);
    comparisonMarkdown = formatComparisonMarkdown(comparison);
    result.json.comparison = comparison;
    result.markdown = `${result.markdown}\n${comparisonMarkdown}\n`;
  }

  const outDir = path.resolve(options.out || path.join(telemetryDir, "deep-dive"));
  mkdirSync(outDir, { recursive: true });
  const mdPath = path.join(outDir, "deep-dive.md");
  const jsonPath = path.join(outDir, "deep-dive.json");
  writeFileSync(mdPath, result.markdown, "utf8");
  writeFileSync(jsonPath, `${JSON.stringify(result.json, null, 2)}\n`, "utf8");

  return {
    ...result,
    comparison,
    comparisonMarkdown,
    file,
    outDir,
    mdPath,
    jsonPath,
  };
}
