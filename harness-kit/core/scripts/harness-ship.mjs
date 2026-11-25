#!/usr/bin/env node
// Opens or updates the PR in one call: lesson -> commit -> gate (seal) -> --pr-block in body -> push -> gh pr create/edit.
//
// Usage:
//   node harness-kit/core/scripts/harness-ship.mjs --lesson "<texto>" --title "<título>" --body-file <ruta>
//       [--base main] [--draft] [--issue GOZS-n]
//
// Never force-pushes, never uses --no-verify, never merges. Idempotent: a second run does not duplicate
// the lesson or the seal block, and skips the gate when the seal is already valid for HEAD.

import { spawnSync } from "node:child_process";
import { ghShellCommand, ghSpawnOptions, resolveGhInvocation } from "../lib/gh-exec.mjs";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBash } from "../guard/guard-core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const TAIL_LINES = 40;
const BRANCH_RE = /^[a-z]+\/(\d+)-[\w.-]+$/;

const USAGE = `harness-ship — lección → gate → sello → PR en una sola llamada

Uso:
  node harness-kit/core/scripts/harness-ship.mjs --lesson "<texto>" --title "<título>" --body-file <ruta>
      [--base main] [--draft] [--issue GOZS-n]

  --lesson     Lección para harness/experience/<ISSUE>.jsonl (opcional si ya está registrada)
  --title      Título de la PR (se usa solo al crearla)
  --body-file  Cuerpo de la PR; el bloque del sello se agrega o reemplaza solo. Ponelo fuera del repo.
  --base       Rama base (por defecto: main)
  --draft      Crea la PR como borrador
  --issue      Id del issue (por defecto: se deriva de la rama <tipo>/<n>-slug + issue_prefix)
`;

/** Parse CLI arguments. */
export function parseArgs(argv) {
  const opts = { lesson: "", title: "", bodyFile: "", base: "main", draft: false, issue: "", help: false, error: "" };
  const valued = { "--lesson": "lesson", "--title": "title", "--body-file": "bodyFile", "--base": "base", "--issue": "issue" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const flag = a.startsWith("--") && eq > 0 ? a.slice(0, eq) : a;
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--draft") opts.draft = true;
    else if (valued[flag]) {
      const value = eq > 0 && flag !== a ? a.slice(eq + 1) : argv[++i];
      if (value === undefined || value === "") {
        opts.error = `Falta el valor de ${flag}.`;
        return opts;
      }
      opts[valued[flag]] = value;
    } else {
      opts.error = `Argumento desconocido: ${a}`;
      return opts;
    }
  }
  if (!opts.help && !opts.title) opts.error = "Falta --title.";
  else if (!opts.help && !opts.bodyFile) opts.error = "Falta --body-file.";
  return opts;
}

/** Remove any previous seal block and append the new one (idempotent). */
export function upsertSealBlock(body, block) {
  const kept = String(body || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => !/^<!-- harness-seal: .* -->$/.test(l) && !/^Harness seal: `[^`]+` on `/.test(l));
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  const head = kept.join("\n");
  return `${head}${head ? "\n\n" : ""}${block.trim()}\n`;
}

/** Last n lines of a command's combined output. */
export function tail(text, n = TAIL_LINES) {
  return String(text || "").replace(/\s+$/, "").split(/\r?\n/).slice(-n).join("\n");
}

export { ghShellCommand };

function defaultRun(cmd, args, opts = {}) {
  const base = { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts };
  let res;
  if (cmd === "gh") {
    const inv = resolveGhInvocation(args);
    res = spawnSync(inv.command, inv.args, ghSpawnOptions(inv, base));
  } else {
    res = spawnSync(cmd, args, base);
  }
  return { status: res.status ?? 1, stdout: res.stdout || "", stderr: res.stderr || (res.error ? String(res.error.message) : "") };
}

function loadProject(repoRoot) {
  try {
    return JSON.parse(readFileSync(path.join(repoRoot, "harness", "project.json"), "utf8"));
  } catch {
    return {};
  }
}

/**
 * Run the ship flow. deps (for tests): run(cmd, args, {cwd}) -> {status, stdout, stderr}, repoRoot, project,
 * bash, readFile, writeFile, exists, log, err.
 * Returns { exitCode, url, fingerprint }.
 */
export async function main(argv, deps = {}) {
  const log = deps.log || ((s) => process.stdout.write(`${s}\n`));
  const err = deps.err || ((s) => process.stderr.write(`${s}\n`));
  const opts = parseArgs(argv);
  if (opts.help) {
    log(USAGE);
    return { exitCode: 0 };
  }
  if (opts.error) {
    err(`ERROR: ${opts.error}\n\n${USAGE}`);
    return { exitCode: 2 };
  }

  const run = deps.run || defaultRun;
  const readFile = deps.readFile || ((f) => readFileSync(f, "utf8"));
  const writeFile = deps.writeFile || ((f, s) => writeFileSync(f, s, "utf8"));
  const exists = deps.exists || existsSync;
  const fail = (msg, code = 1) => {
    err(`ERROR: ${msg}`);
    return { exitCode: code };
  };

  let repoRoot = deps.repoRoot;
  if (!repoRoot) {
    const top = run("git", ["rev-parse", "--show-toplevel"]);
    if (top.status !== 0) return fail("no es un repositorio git.");
    repoRoot = top.stdout.trim();
  }
  const git = (...args) => run("git", args, { cwd: repoRoot });
  const project = deps.project || loadProject(repoRoot);
  const bash = deps.bash || resolveBash();
  const scripts = (deps.scriptsDir || here).replace(/\\/g, "/");
  const sh = (script, ...args) => run(bash, [`${scripts}/${script}`, ...args], { cwd: repoRoot });

  // 1. Branch <type>/<n>-slug and clean tree (only the lesson file may be pending)
  const branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
  const m = branch.match(BRANCH_RE);
  if (!m) return fail(`la rama "${branch}" no cumple <tipo>/<n>-<slug> (ej. chore/781-harness-ship).`);
  const issue = opts.issue || (project.issue_prefix ? `${project.issue_prefix}-${m[1]}` : "");
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(issue)) return fail(`no se pudo resolver el issue (obtuve "${issue}"). Usá --issue <PREFIJO-N>.`);
  const lessonRel = `harness/experience/${issue}.jsonl`;
  const dirty = git("status", "--porcelain").stdout.split("\n").filter((l) => l.trim());
  const foreign = dirty.filter((l) => l.slice(3).trim().replace(/^"|"$/g, "") !== lessonRel);
  if (foreign.length) {
    return fail(`hay cambios sin commitear fuera de la lección:\n${foreign.slice(0, 10).join("\n")}\nCommitealos (o mové el --body-file fuera del repo) y volvé a correr.`);
  }

  // 2. Behind origin/<base>? Stop before committing the lesson.
  const fetch = git("fetch", "--quiet", "origin", opts.base);
  if (fetch.status !== 0) return fail(`git fetch origin ${opts.base} falló:\n${tail(fetch.stderr, 10)}`);
  const behind = Number(git("rev-list", "--count", `HEAD..origin/${opts.base}`).stdout.trim() || "0");
  if (behind > 0) {
    return fail(
      `la rama está ${behind} commit(s) atrás de origin/${opts.base}. Actualizala antes de sellar:\n` +
        `  git merge origin/${opts.base}   (resolvé conflictos y commiteá)\n` +
        `y volvé a correr harness-ship.mjs. No se commiteó la lección ni se corrió el gate.`,
    );
  }

  // 3-4. Lesson, then its own commit (never --no-verify)
  if (opts.lesson) {
    const learn = sh("harness-learn.sh", "--lesson", opts.lesson, "--issue", issue);
    if (learn.status !== 0) return fail(`harness-learn.sh falló:\n${tail(learn.stdout + learn.stderr)}`);
  }
  if (git("status", "--porcelain", "--", lessonRel).stdout.trim()) {
    const add = git("add", "--", lessonRel);
    const commit = add.status === 0 ? git("commit", "-m", `docs(learn): lección ${issue}`) : add;
    if (commit.status !== 0) return fail(`no se pudo commitear la lección:\n${tail(commit.stdout + commit.stderr)}`);
    log(`[harness-ship] Lección commiteada (${lessonRel}).`);
  }

  // 5. Gate (skipped when the seal is already valid for HEAD + clean tree)
  if (sh("harness-gate.sh", "--verify").status === 0) {
    log("[harness-ship] Sello vigente para HEAD: no se vuelve a correr el gate.");
  } else {
    log("[harness-ship] Corriendo harness-gate.sh…");
    const gate = sh("harness-gate.sh", "--base", `origin/${opts.base}`);
    if (gate.status !== 0) {
      err(`[harness-ship] El gate falló (código ${gate.status}). Últimas ${TAIL_LINES} líneas:\n${tail(gate.stdout + gate.stderr)}`);
      return { exitCode: gate.status || 1 };
    }
  }

  // 6. Seal block into --body-file
  const block = sh("harness-gate.sh", "--pr-block");
  if (block.status !== 0) return fail(`harness-gate.sh --pr-block falló:\n${tail(block.stdout + block.stderr)}`);
  const bodyPath = path.resolve(opts.bodyFile);
  writeFile(bodyPath, upsertSealBlock(exists(bodyPath) ? readFile(bodyPath) : "", block.stdout));

  // 7. Push (never forced)
  const push = git("push", "-u", "origin", branch);
  if (push.status !== 0) return fail(`git push falló:\n${tail(push.stdout + push.stderr, 15)}`);

  // 8. Re-verify (the pre-hook does not see this script's gh call), then edit or create
  if (sh("harness-gate.sh", "--verify").status !== 0) {
    return fail("el sello dejó de ser válido después del push (¿cambió el árbol?). Volvé a correr harness-ship.mjs.");
  }
  const list = run("gh", ["pr", "list", "--head", branch, "--state", "open", "--json", "number,url"], { cwd: repoRoot });
  if (list.status !== 0) return fail(`gh pr list falló:\n${tail(list.stderr, 10)}`);
  let existing = null;
  try {
    existing = JSON.parse(list.stdout || "[]")[0] || null;
  } catch {}
  let url = "";
  if (existing) {
    // REST instead of `gh pr edit`: the latter also queries org/project fields and fails without read:org.
    const patch = ["api", "-X", "PATCH", `repos/{owner}/{repo}/pulls/${existing.number}`, "-F", `body=@${bodyPath}`, "--silent"];
    const edit = run("gh", patch, { cwd: repoRoot });
    if (edit.status !== 0) return fail(`gh api PATCH pulls/${existing.number} falló:\n${tail(edit.stderr, 10)}`);
    url = existing.url;
    log(`[harness-ship] PR #${existing.number} actualizada (cuerpo con el sello nuevo).`);
  } else {
    const args = ["pr", "create", "--title", opts.title, "--body-file", bodyPath, "--base", opts.base];
    if (opts.draft) args.push("--draft");
    const create = run("gh", args, { cwd: repoRoot });
    if (create.status !== 0) return fail(`gh pr create falló:\n${tail(create.stderr, 10)}`);
    url = create.stdout.trim().split(/\s+/).pop() || "";
    log("[harness-ship] PR creada.");
  }

  // 9. URL + fingerprint
  let fingerprint = "";
  try {
    fingerprint = JSON.parse(readFile(path.join(repoRoot, ".harness", "complete.json"))).fingerprint || "";
  } catch {}
  log(`PR: ${url}`);
  log(`Sello: ${fingerprint}`);
  return { exitCode: 0, url, fingerprint };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(({ exitCode }) => process.exit(exitCode));
}
