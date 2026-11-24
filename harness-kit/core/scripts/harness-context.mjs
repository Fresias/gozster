#!/usr/bin/env node
// Task orientation in one read-only call: branch, issue, PR, related lessons, latest migration and scope.
//
// Usage:
//   node harness-kit/core/scripts/harness-context.mjs [--issue <PREFIX-n>] [--max-lines 150] [--json] [--help]
//
// Each section degrades to a single line when its source (git, Multica CLI, gh, network) is missing; exit code is 0.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEFAULT_MAX_LINES = 150;
export const FETCH_FRESH_MS = 10 * 60 * 1000;
export const MAX_LESSONS = 5;
export const SECTION_LIMITS = { rama: 25, issue: 45, pr: 25, lecciones: MAX_LESSONS, migraciones: 2, scope: 10 };
const SECTION_TITLES = {
  rama: "Rama",
  issue: "Issue",
  pr: "PR",
  lecciones: "Lecciones relacionadas",
  migraciones: "Migraciones",
  scope: "Scope",
};

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..", "..");
const MULTICA_CTX = path.join(kitDir, "adapters", "multica", "scripts", "multica-ctx.mjs");
const PR_STATUS = path.join(here, "harness-pr-status.mjs");

const USAGE = `harness-context — Orientación inicial de la tarea en una sola llamada (solo lectura)

Uso:
  node harness-kit/core/scripts/harness-context.mjs [--issue <PREFIX-n>] [--max-lines 150] [--json]

Secciones: Rama, Issue (multica-ctx), PR (harness-pr-status), Lecciones relacionadas, Migraciones, Scope.
Si falta Multica, gh o la red, la sección indica qué falta y el script termina con código 0.

Opciones:
  --issue <id>       Issue (PREFIX-n o n). Por defecto se toma del nombre de la rama.
  --max-lines <N>    Tope total de líneas de texto (por defecto 150)
  --json             Objeto con una clave por sección
  -h, --help         Muestra esta ayuda
`;

export function parseArgs(argv) {
  const opts = { issue: null, maxLines: DEFAULT_MAX_LINES, json: false, help: false, error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--issue") opts.issue = argv[++i] ?? null;
    else if (a.startsWith("--issue=")) opts.issue = a.slice("--issue=".length);
    else if (a === "--max-lines" || a.startsWith("--max-lines=")) {
      const raw = a === "--max-lines" ? argv[++i] : a.slice("--max-lines=".length);
      const n = Number.parseInt(String(raw), 10);
      if (Number.isFinite(n) && n > 0) opts.maxLines = n;
      else opts.error = `--max-lines inválido: ${raw}`;
    } else opts.error = `argumento desconocido: ${a}`;
  }
  return opts;
}

/** Normalize `--issue` (PREFIX-n or n) or derive the issue key from a branch name like `feature/701-x`. */
export function resolveIssueKey(explicit, branch, prefix) {
  const pfx = String(prefix || "").toUpperCase();
  const norm = (n) => (pfx ? `${pfx}-${n}` : String(n));
  if (explicit) {
    const s = String(explicit).trim();
    if (/^\d+$/.test(s)) return norm(s);
    return s.toUpperCase();
  }
  if (!branch) return null;
  if (pfx) {
    const m = branch.match(new RegExp(`(?:^|[/_-])${pfx}-(\\d+)`, "i"));
    if (m) return norm(m[1]);
  }
  const m = branch.match(/(?:^|\/)(\d+)(?:-|$)/);
  return m ? norm(m[1]) : null;
}

function capLines(lines, max, hint) {
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max - 1), `… (${lines.length - max + 1} líneas más${hint ? `; ${hint}` : ""})`];
}

function oneLine(text, max = 160) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function firstLine(err) {
  return oneLine(String(err?.stderr || err?.message || err).split(/\r?\n/).find((l) => l.trim()) || "error", 200);
}

function defaultRunGit(cwd) {
  return (args, extra = {}) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: extra.timeout ?? 15000,
    }).replace(/\s+$/, "");
}

function loadProject(repoRoot) {
  try {
    return JSON.parse(readFileSync(path.join(repoRoot, "harness", "project.json"), "utf8"));
  } catch {
    return {};
  }
}

// ---------- Rama ----------

export function buildBranchSection({ runGit, now, statMtimeMs }) {
  const lines = [];
  let branch = null;
  try {
    branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch (err) {
    return { status: "missing", branch: null, lines: [`git no disponible: ${firstLine(err)}`] };
  }

  try {
    const st = runGit(["status", "-sb"]).split(/\r?\n/).filter(Boolean);
    lines.push(...capLines(st, 8, "git status -s"));
  } catch (err) {
    lines.push(`git status falló: ${firstLine(err)}`);
  }

  // Fetch origin/main only when FETCH_HEAD is older than FETCH_FRESH_MS.
  // In a worktree `git fetch` writes <git-dir>/FETCH_HEAD, not <git-common-dir>/FETCH_HEAD: take the newest of both.
  let fetchNote = "";
  try {
    const dirs = new Set();
    for (const flag of ["--git-dir", "--git-common-dir"]) {
      try {
        dirs.add(runGit(["rev-parse", flag]));
      } catch {}
    }
    const mtimes = [...dirs].map((d) => statMtimeMs(path.join(d, "FETCH_HEAD"))).filter((m) => m !== null);
    const mtime = mtimes.length ? Math.max(...mtimes) : null;
    if (mtime === null || now() - mtime > FETCH_FRESH_MS) {
      try {
        runGit(["fetch", "--quiet", "origin", "main"], { timeout: 20000 });
        fetchNote = " (fetch recién hecho)";
      } catch (err) {
        fetchNote = ` (sin fetch: ${firstLine(err)})`;
      }
    } else {
      fetchNote = " (fetch < 10 min, no se repite)";
    }
  } catch {}

  let mergeBase = null;
  try {
    const [behind, ahead] = runGit(["rev-list", "--left-right", "--count", "origin/main...HEAD"]).split(/\s+/);
    lines.push(`vs origin/main: ${ahead} adelante, ${behind} atrás${fetchNote}`);
    mergeBase = runGit(["merge-base", "origin/main", "HEAD"]);
  } catch (err) {
    lines.push(`origin/main no disponible: ${firstLine(err)}`);
  }

  if (mergeBase) {
    try {
      const stat = runGit(["diff", "--stat", mergeBase]).split(/\r?\n/).filter(Boolean);
      if (stat.length === 0) lines.push("diff vs merge-base: (sin cambios)");
      else if (stat.length <= 13) lines.push("diff vs merge-base:", ...stat);
      else lines.push("diff vs merge-base:", ...stat.slice(0, 11), `… (${stat.length - 12} archivos más)`, stat[stat.length - 1]);
    } catch (err) {
      lines.push(`git diff --stat falló: ${firstLine(err)}`);
    }
  }

  return { status: "ok", branch, merge_base: mergeBase, lines: capLines(lines, SECTION_LIMITS.rama) };
}

// ---------- Issue ----------

export function formatIssueCtx(ctx) {
  const iss = ctx.issue || {};
  const lines = [`${iss.identifier} [${iss.status}] ${iss.title}`];
  const meta = [`asignado=${iss.assignee}`];
  if (iss.priority) meta.push(`prioridad=${iss.priority}`);
  if (iss.parent_issue_id) meta.push(`padre=${iss.parent_issue_id}`);
  lines.push(meta.join(" | "));
  const desc = String(iss.description || "").split("\n");
  const shown = desc.slice(0, 20);
  lines.push(`Descripción (${shown.length}/${iss.description_lines_total ?? desc.length} líneas):`, ...shown);
  const roots = ctx.roots || { total: 0, items: [] };
  lines.push(`Comentarios: ${roots.total} hilos`);
  if (ctx.thread && ctx.thread.items?.length) {
    lines.push(`Último hilo ${ctx.thread.id} (últimas ${Math.min(3, ctx.thread.items.length)} de ${ctx.thread.total}):`);
    for (const e of ctx.thread.items.slice(-3)) lines.push(`- ${e.author}: ${oneLine(e.content, 160)}`);
  }
  const children = ctx.children || { total: 0, items: [] };
  if (children.total > 0) {
    lines.push(`Sub-issues (${children.total}):`);
    for (const c of children.items.slice(0, 5)) lines.push(`- ${c.identifier} [${c.status}] ${oneLine(c.title, 100)}`);
  }
  const prs = ctx.pull_requests || [];
  if (prs.length > 0) {
    lines.push(`PRs vinculadas (${prs.length}):`);
    for (const pr of prs.slice(0, 3)) lines.push(`- ${pr.number ? `#${pr.number}` : pr.id} [${pr.state}] ${oneLine(pr.title, 100)}`);
  }
  return lines;
}

export async function buildIssueSection(issueKey, { fetchIssue }) {
  if (!issueKey) {
    return { status: "missing", key: null, title: null, lines: ["sin issue: la rama no tiene número; usá --issue <id>"] };
  }
  if (!fetchIssue) {
    return { status: "missing", key: issueKey, title: null, lines: [`${issueKey}: multica-ctx no está instalado (sección omitida)`] };
  }
  try {
    const ctx = await fetchIssue(issueKey);
    const lines = capLines(formatIssueCtx(ctx), SECTION_LIMITS.issue - 1);
    lines.push(`Detalle: node harness-kit/adapters/multica/scripts/multica-ctx.mjs ${issueKey}`);
    return { status: "ok", key: issueKey, title: ctx?.issue?.title ?? null, data: ctx, lines };
  } catch (err) {
    return { status: "missing", key: issueKey, title: null, lines: [`${issueKey}: CLI de Multica no disponible (${firstLine(err)})`] };
  }
}

// ---------- PR ----------

export async function buildPrSection({ runPrStatus }) {
  if (!runPrStatus) return { status: "missing", lines: ["harness-pr-status no está instalado (sección omitida)"] };
  try {
    const res = await runPrStatus();
    if (res.exitCode === 0 && res.data) {
      return { status: "ok", data: res.data, lines: capLines(String(res.text).replace(/\s+$/, "").split(/\r?\n/), SECTION_LIMITS.pr) };
    }
    const msg = String(res.stderr || "").trim();
    if (/no (open )?pull requests? found/i.test(msg)) return { status: "none", lines: ["sin PR para esta rama"] };
    return { status: "missing", lines: [`gh no disponible o sin red: ${oneLine(msg.replace(/^\[harness-pr-status error\]\s*/, ""), 200) || "error desconocido"}`] };
  } catch (err) {
    return { status: "missing", lines: [`gh no disponible: ${firstLine(err)}`] };
  }
}

// ---------- Lecciones ----------

const STOPWORDS = new Set([
  "chore", "feature", "fix", "para", "desde", "sobre", "entre", "contra", "sin", "con", "una", "las", "los", "del",
  "que", "por", "como", "tarea", "issue", "harness",
]);

export function titleKeywords(title, max = 6) {
  const words = String(title || "")
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .split(/[^\p{L}\p{N}-]+/u)
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w.length >= 6 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].slice(0, max);
}

export function findLessons(repoRoot, issueKey, keywords, limit = MAX_LESSONS) {
  const dir = path.join(repoRoot, "harness", "experience");
  if (!existsSync(dir)) return { status: "missing", items: [], lines: ["sin harness/experience/"] };
  const key = String(issueKey || "").toUpperCase();
  const kws = keywords.map((k) => k.toLowerCase());
  const hits = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".jsonl")) continue;
    let content = "";
    try {
      content = readFileSync(path.join(dir, file), "utf8");
    } catch {
      continue;
    }
    for (const raw of content.split(/\r?\n/)) {
      if (!raw.trim()) continue;
      let rec;
      try {
        rec = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!rec?.lesson) continue;
      const task = String(rec.task || file.replace(/\.jsonl$/, ""));
      const hay = `${rec.lesson} ${(rec.tags || []).join(" ")}`.toLowerCase();
      const own = key && task.toUpperCase() === key;
      // Technical tokens (with "-") weigh 2; plain words 1. Unrelated lessons need >= 2 points.
      const score = kws.reduce((acc, k) => acc + (hay.includes(k) ? (/-/.test(k) ? 2 : 1) : 0), 0);
      if (!own && score < 2) continue;
      hits.push({ task, lesson: String(rec.lesson), score: score + (own ? 100 : 0), ts: String(rec.timestamp || ""), file: `harness/experience/${file}` });
    }
  }
  hits.sort((a, b) => b.score - a.score || b.ts.localeCompare(a.ts));
  const items = hits.slice(0, limit);
  const lines = items.length
    ? items.map((h) => `- ${h.task}: ${oneLine(h.lesson, 180)}`)
    : [`(ninguna para ${key || "el issue"}${kws.length ? ` ni ${kws.join(", ")}` : ""})`];
  return { status: items.length ? "ok" : "none", keywords: kws, items, lines };
}

// ---------- Migraciones / Scope ----------

export function latestMigration(repoRoot) {
  const dir = path.join(repoRoot, "supabase", "migrations");
  if (!existsSync(dir)) return { status: "none", latest: null, lines: ["sin supabase/migrations/"] };
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) return { status: "none", latest: null, lines: ["supabase/migrations/ vacío"] };
  const latest = files[files.length - 1];
  return {
    status: "ok",
    latest,
    total: files.length,
    lines: [`última: supabase/migrations/${latest} (${files.length} en total; la nueva debe tener versión mayor)`],
  };
}

export function readScope(repoRoot) {
  const p = path.join(repoRoot, ".harness", "scope.json");
  if (!existsSync(p)) return { status: "none", lines: ["sin .harness/scope.json"] };
  try {
    const data = JSON.parse(readFileSync(p, "utf8"));
    return { status: "ok", data, lines: capLines(JSON.stringify(data, null, 1).split("\n"), SECTION_LIMITS.scope) };
  } catch (err) {
    return { status: "missing", lines: [`.harness/scope.json inválido: ${firstLine(err)}`] };
  }
}

// ---------- Defaults that touch Multica / gh ----------

async function defaultFetchIssue(env) {
  if (!existsSync(MULTICA_CTX)) return null;
  const mod = await import(pathToFileURL(MULTICA_CTX).href);
  return (issueKey) => mod.fetchIssueContext({ issue: issueKey, thread: null }, { env });
}

async function defaultRunPrStatus(deps) {
  if (!existsSync(PR_STATUS)) return null;
  const mod = await import(pathToFileURL(PR_STATUS).href);
  return async () => {
    let stdout = "";
    let stderr = "";
    const res = await mod.main([], {
      repoRoot: deps.repoRoot,
      runGh: deps.runGh,
      writeStdout: (s) => (stdout += s),
      writeStderr: (s) => (stderr += s),
    });
    return { exitCode: res.exitCode, data: res.data, text: res.text || stdout, stderr };
  };
}

// ---------- Main ----------

export function formatText(sections, issueKey, maxLines) {
  const lines = [];
  for (const name of Object.keys(SECTION_TITLES)) {
    const s = sections[name];
    const title = name === "issue" && issueKey ? `${SECTION_TITLES[name]} (${issueKey})` : SECTION_TITLES[name];
    if (lines.length) lines.push("");
    lines.push(`== ${title} ==`, ...s.lines);
  }
  return capLines(lines, maxLines, "usá --max-lines <N> o --json").join("\n") + "\n";
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const writeStdout = deps.writeStdout || ((s) => process.stdout.write(s));
  const writeStderr = deps.writeStderr || ((s) => process.stderr.write(s));
  const opts = parseArgs(argv);
  if (opts.help) {
    writeStdout(USAGE);
    return { exitCode: 0, sections: null, text: USAGE };
  }
  if (opts.error) {
    writeStderr(`[harness-context error] ${opts.error}\n`);
    return { exitCode: 2, sections: null, text: "" };
  }

  const env = deps.env || process.env;
  let repoRoot = deps.repoRoot;
  if (!repoRoot) {
    try {
      repoRoot = defaultRunGit(process.cwd())(["rev-parse", "--show-toplevel"]);
    } catch {
      repoRoot = process.cwd();
    }
  }
  const runGit = deps.runGit || defaultRunGit(repoRoot);
  const now = deps.now || (() => Date.now());
  const statMtimeMs =
    deps.statMtimeMs ||
    ((p) => {
      try {
        return statSync(path.isAbsolute(p) ? p : path.join(repoRoot, p)).mtimeMs;
      } catch {
        return null;
      }
    });
  const project = deps.project || loadProject(repoRoot);

  const rama = buildBranchSection({ runGit, now, statMtimeMs });
  const issueKey = resolveIssueKey(opts.issue, rama.branch, project.issue_prefix);

  const fetchIssue = "fetchIssue" in deps ? deps.fetchIssue : await defaultFetchIssue(env);
  const issue = await buildIssueSection(issueKey, { fetchIssue });

  const runPrStatus = "runPrStatus" in deps ? deps.runPrStatus : await defaultRunPrStatus({ repoRoot, runGh: deps.runGh });
  const pr = await buildPrSection({ runPrStatus });

  const lecciones = findLessons(repoRoot, issueKey, titleKeywords(issue.title));
  const migraciones = latestMigration(repoRoot);
  const scope = readScope(repoRoot);

  const sections = { rama, issue, pr, lecciones, migraciones, scope };
  const text = opts.json ? JSON.stringify(sections, null, 2) + "\n" : formatText(sections, issueKey, opts.maxLines);
  writeStdout(text);
  return { exitCode: 0, sections, text };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    ({ exitCode }) => process.exit(exitCode),
    (err) => {
      process.stderr.write(`[harness-context error] ${err?.message || err}\n`);
      process.exit(0);
    },
  );
}
