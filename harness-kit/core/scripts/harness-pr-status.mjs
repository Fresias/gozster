#!/usr/bin/env node
// Read-only PR status summary (seal, behind, checks, labels, review, merge-check, next step) and single-call --wait-checks.
//
// Usage:
//   node harness-kit/core/scripts/harness-pr-status.mjs [<pr|branch>] [--json] [--wait-checks [--timeout 30m]] [--help]
//
// Output: <= 25 lines in text mode, ending with a single "Próximo paso:" line.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main as mergeCheckMain, parseSealBlock } from "./harness-merge-check.mjs";

export const PR_VIEW_FIELDS =
  "number,url,state,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,reviewDecision,labels,statusCheckRollup,body,changedFiles,mergedAt";

export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
export const MAX_TEXT_LINES = 25;

const USAGE = `harness-pr-status — Resumen de estado de PR (solo lectura)

Uso:
  node harness-kit/core/scripts/harness-pr-status.mjs [<pr|rama>] [--json] [--wait-checks [--timeout 30m]]

Opciones:
  <pr|rama>          Número, URL o rama de la PR (por defecto: PR de la rama actual)
  --json             Salida estructurada JSON (seal, behind, checks, labels, review, mergeCheck, next)
  --wait-checks      Espera checks en una sola llamada bloqueante (gh pr checks --watch --interval 30)
  --timeout <dur>    Límite de espera para --wait-checks (ej. 30m, 90s, 1h; por defecto 30m)
  -h, --help         Muestra esta ayuda
`;

/** Parse a duration string like "30m", "90s", "1h", "500ms", or plain seconds into milliseconds. */
export function parseDurationMs(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = (m[2] || "s").toLowerCase();
  const mult = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000;
  return Math.round(value * mult);
}

/** Parse CLI arguments. */
export function parseArgs(argv) {
  const opts = {
    selector: "",
    json: false,
    waitChecks: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
    error: "",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      opts.help = true;
    } else if (a === "--json") {
      opts.json = true;
    } else if (a === "--wait-checks") {
      opts.waitChecks = true;
    } else if (a === "--timeout") {
      const next = argv[++i];
      const ms = parseDurationMs(next);
      if (!ms) {
        opts.error = `Invalid --timeout value: "${next || ""}" (expected e.g. 30m, 90s, 1h)`;
        return opts;
      }
      opts.timeoutMs = ms;
    } else if (a.startsWith("--timeout=")) {
      const raw = a.slice("--timeout=".length);
      const ms = parseDurationMs(raw);
      if (!ms) {
        opts.error = `Invalid --timeout value: "${raw}" (expected e.g. 30m, 90s, 1h)`;
        return opts;
      }
      opts.timeoutMs = ms;
    } else if (a.startsWith("-")) {
      opts.error = `Unknown option: ${a}`;
      return opts;
    } else if (!opts.selector) {
      opts.selector = a;
    }
  }
  return opts;
}

function defaultRunGh(args) {
  const opts = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  if (process.platform === "win32") {
    return execFileSync(`gh ${args.map((a) => `"${a}"`).join(" ")}`, { ...opts, shell: true });
  }
  return execFileSync("gh", args, opts);
}

/** Spawn a command with an internal timeout that terminates the child process cleanly. */
export function spawnWithTimeout(command, args, timeoutMs, options = {}) {
  return new Promise((resolve) => {
    const useShell = Boolean(options.shell);
    const child = useShell
      ? spawn(`${command} ${args.map((a) => `"${a}"`).join(" ")}`, {
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
          cwd: options.cwd,
        })
      : spawn(command, args, {
          stdio: ["ignore", "pipe", "pipe"],
          cwd: options.cwd,
        });

    let timedOut = false;
    let settled = false;
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    const killChild = () => {
      try {
        if (process.platform === "win32" && child.pid) {
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        } else {
          child.kill("SIGTERM");
        }
      } catch {}
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killChild();
    }, timeoutMs);
    timer.unref?.();

    const finish = (code, errMsg = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code: typeof code === "number" ? code : 1,
        timedOut,
        stdout,
        stderr: stderr || errMsg,
      });
    };

    child.on("error", (err) => finish(1, err?.message || String(err)));
    child.on("close", (code) => finish(code));
  });
}

/** Wait for PR checks using a single blocking `gh pr checks --watch --interval 30` call (never passes --timeout to gh). */
export function defaultWaitChecks(args, timeoutMs) {
  return spawnWithTimeout("gh", args, timeoutMs, { shell: process.platform === "win32" });
}

function loadProject(repoRoot) {
  try {
    const p = path.join(repoRoot, "harness", "project.json");
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  } catch {}
  return {};
}

function resolveRepoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.cwd();
  }
}

class MergeCheckExit extends Error {
  constructor(code) {
    super(`merge-check exit ${code}`);
    this.code = code;
  }
}

/** Execute harness-merge-check.mjs `main(argv, deps)` in read-only `--json` mode (never `--post-status`). */
export function runMergeCheckReadOnly(selector, pr, deps = {}) {
  if (typeof deps.runMergeCheck === "function") {
    return deps.runMergeCheck(selector, pr);
  }
  const mergeMain = deps.mergeCheckMain || mergeCheckMain;
  const baseRunGh = deps.runGh || defaultRunGh;
  const cachedRunGh = (args) => {
    if (
      Array.isArray(args) &&
      args[0] === "pr" &&
      args[1] === "view" &&
      pr &&
      Number.isInteger(pr.changedFiles)
    ) {
      return JSON.stringify(pr);
    }
    return baseRunGh(args);
  };

  const origExit = process.exit;
  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);
  let out = "";
  let err = "";

  process.exit = (code = 0) => {
    throw new MergeCheckExit(code);
  };
  process.stdout.write = (chunk) => {
    out += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    return true;
  };
  process.stderr.write = (chunk) => {
    err += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    return true;
  };

  try {
    mergeMain([String(selector), "--json"], { runGh: cachedRunGh });
  } catch (e) {
    if (!(e instanceof MergeCheckExit)) {
      err += (err ? "\n" : "") + String(e?.message || e);
    }
  } finally {
    process.exit = origExit;
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  }

  const trimmed = out.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        mergeable: Boolean(parsed.mergeable),
        issue: parsed.issue || null,
        harnessFiles: Array.isArray(parsed.harness_files) ? parsed.harness_files : [],
        authorizedBy: parsed.authorized_by || null,
        delegatedBy: parsed.delegated_by || null,
        errors: Array.isArray(parsed.errors) ? parsed.errors : [],
      };
    } catch {}
  }

  const fallbackErrors = err
    .split(/\r?\n/)
    .map((l) => l.replace(/^-\s*/, "").trim())
    .filter((l) => l && !l.startsWith("[harness-merge-check"));

  return {
    mergeable: false,
    issue: null,
    harnessFiles: [],
    authorizedBy: null,
    delegatedBy: null,
    errors: fallbackErrors.length > 0 ? fallbackErrors : ["merge-check: no disponible"],
  };
}

function entryTimestampMs(item) {
  let best = null;
  for (const field of ["completedAt", "startedAt", "createdAt", "updatedAt"]) {
    const raw = item?.[field];
    if (typeof raw === "string" && raw.trim()) {
      const ts = Date.parse(raw);
      if (Number.isFinite(ts) && (best === null || ts > best)) best = ts;
    }
  }
  return best;
}

function isNewerRollupEntry(candidate, current) {
  if (candidate.ts !== null && current.ts !== null) {
    if (candidate.ts !== current.ts) return candidate.ts > current.ts;
    return candidate.index > current.index;
  }
  if (candidate.ts !== null) return true;
  if (current.ts !== null) return false;
  return candidate.index > current.index;
}

/** Group statusCheckRollup entries into OK, failed (with names), and pending (with names), deduplicating by latest run per check. */
export function classifyChecks(rollup) {
  const latestByKey = new Map();
  const list = Array.isArray(rollup) ? rollup : [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") continue;
    const isStatusContext = typeof item.state === "string" && !item.status;
    const name = String(item.name || item.context || "unknown").trim();
    const key = `${isStatusContext ? "status" : "check"}:${name}`;
    const candidate = { item, name, isStatusContext, ts: entryTimestampMs(item), index: i };
    const existing = latestByKey.get(key);
    if (!existing || isNewerRollupEntry(candidate, existing)) {
      latestByKey.set(key, candidate);
    }
  }

  const okNames = [];
  const failed = [];
  const pending = [];

  for (const { item, name, isStatusContext } of latestByKey.values()) {
    if (isStatusContext) {
      const st = item.state.toUpperCase();
      if (st === "SUCCESS") okNames.push(name);
      else if (st === "PENDING" || st === "EXPECTED") pending.push(name);
      else failed.push(name);
      continue;
    }
    const status = String(item.status || "").toUpperCase();
    const conclusion = String(item.conclusion || "").toUpperCase();
    if (status && status !== "COMPLETED") {
      pending.push(name);
    } else if (conclusion === "SUCCESS" || conclusion === "NEUTRAL" || conclusion === "SKIPPED") {
      okNames.push(name);
    } else if (!conclusion || conclusion === "PENDING") {
      pending.push(name);
    } else {
      failed.push(name);
    }
  }

  return {
    total: okNames.length + failed.length + pending.length,
    ok: okNames.length,
    failed,
    pending,
  };
}

function isMissingAuthzLabelError(msg) {
  return /^authz:\s*missing label harness-authorized/i.test(msg) || /^harness:\s*missing label/i.test(msg);
}

function isMergeCheckName(name) {
  const n = String(name || "").trim().toLowerCase();
  return n === "harness/merge-check" || n === "harness² merge check" || n === "harness2 merge check";
}

/** Compute structured PR status and the single recommended next step. */
export function analyzePrStatus({ pr, mergeCheck, project = {}, waitResult = null }) {
  const owner =
    project?.authorizers && typeof project.authorizers.owner === "string" && project.authorizers.owner.trim()
      ? project.authorizers.owner.trim()
      : "Fresias";

  const parsedSeal = parseSealBlock(pr?.body);
  const prHead = pr?.headRefOid ? String(pr.headRefOid) : null;
  const sealHead = parsedSeal?.head ? String(parsedSeal.head) : null;
  const sealValid = Boolean(parsedSeal && prHead && sealHead === prHead);
  const sealStale = Boolean(parsedSeal && prHead && sealHead !== prHead);
  const seal = {
    present: Boolean(parsedSeal),
    valid: sealValid,
    stale: sealStale,
    status: !parsedSeal ? "missing" : sealStale ? "stale" : "ok",
    head: sealHead,
    prHead,
    fingerprint: parsedSeal?.fingerprint || null,
    worktreeClean: parsedSeal?.worktree_clean ?? null,
  };

  const mergeStateStatus = String(pr?.mergeStateStatus || "UNKNOWN");
  const behind = mergeStateStatus === "BEHIND";
  const checks = classifyChecks(pr?.statusCheckRollup);
  const labelNames = (Array.isArray(pr?.labels) ? pr.labels : [])
    .map((l) => (typeof l === "string" ? l : l?.name))
    .filter(Boolean);
  const labels = {
    names: labelNames,
    harnessAuthorized: labelNames.includes("harness-authorized"),
  };
  const review = pr?.reviewDecision ? String(pr.reviewDecision) : "NONE";

  const normalizedMergeCheck = {
    mergeable: Boolean(mergeCheck?.mergeable),
    issue: mergeCheck?.issue || null,
    harnessFiles: Array.isArray(mergeCheck?.harnessFiles)
      ? mergeCheck.harnessFiles
      : Array.isArray(mergeCheck?.harness_files)
        ? mergeCheck.harness_files
        : [],
    authorizedBy: mergeCheck?.authorizedBy ?? mergeCheck?.authorized_by ?? null,
    errors: Array.isArray(mergeCheck?.errors) ? mergeCheck.errors : [],
  };

  const onlyMissingAuthzLabel =
    !normalizedMergeCheck.mergeable &&
    normalizedMergeCheck.errors.length > 0 &&
    normalizedMergeCheck.errors.every(isMissingAuthzLabelError);

  const nonMergeCheckFailed = checks.failed.filter((name) => !isMergeCheckName(name));

  let next;
  if (pr?.state === "MERGED") {
    next = "PR ya mergeada";
  } else if (pr?.state === "CLOSED") {
    next = "PR cerrada";
  } else if (behind) {
    next = `actualizar la rama con ${pr?.baseRefName || "main"} y volver a sellar`;
  } else if (mergeStateStatus === "DIRTY") {
    next = `resolver conflictos con ${pr?.baseRefName || "main"} y volver a sellar`;
  } else if (sealStale) {
    next = "sello viejo: volver a sellar (harness-gate.sh y actualizar --pr-block)";
  } else if (!seal.present) {
    next = "generar sello (harness-gate.sh y pegar --pr-block)";
  } else if (nonMergeCheckFailed.length > 0) {
    next = `corregir el check ${nonMergeCheckFailed[0]}`;
  } else if (checks.pending.length > 0) {
    next = "esperar checks: `--wait-checks`";
  } else if (onlyMissingAuthzLabel) {
    next = `falta harness-authorized (solo @${owner})`;
  } else if (checks.failed.length > 0) {
    next =
      normalizedMergeCheck.errors.length > 0
        ? `corregir merge-check: ${normalizedMergeCheck.errors[0]}`
        : `corregir el check ${checks.failed[0]}`;
  } else if (normalizedMergeCheck.errors.length > 0) {
    next = `corregir merge-check: ${normalizedMergeCheck.errors[0]}`;
  } else if (review === "CHANGES_REQUESTED") {
    next = "atender cambios solicitados en la revisión";
  } else if (review === "APPROVED") {
    next = "listo para mergear";
  } else {
    next = "listo para aprobar";
  }

  const out = {
    pr: {
      number: pr?.number ?? null,
      url: pr?.url || "",
      state: pr?.state || "UNKNOWN",
      isDraft: Boolean(pr?.isDraft),
      headRefName: pr?.headRefName || "",
      headRefOid: prHead,
      baseRefName: pr?.baseRefName || "main",
      mergeStateStatus,
    },
    seal,
    behind,
    checks,
    labels,
    review,
    mergeCheck: normalizedMergeCheck,
    next,
  };
  if (waitResult) {
    out.wait = {
      timedOut: Boolean(waitResult.timedOut),
      exitCode: waitResult.code,
    };
  }
  return out;
}

function summarizeList(items, limit = 4) {
  if (items.length <= limit) return items.join(", ");
  return `${items.slice(0, limit).join(", ")} (+${items.length - limit} más)`;
}

/** Format human-readable summary, strictly capped at <= 25 lines and ending with "Próximo paso:". */
export function formatPrStatus(data) {
  const lines = [];
  const draftTag = data.pr.isDraft ? " [DRAFT]" : "";
  lines.push(
    `PR #${data.pr.number ?? "?"} [${data.pr.state}]${draftTag} — ${data.pr.headRefName} -> ${data.pr.baseRefName}`,
  );
  if (data.pr.url) lines.push(`URL: ${data.pr.url}`);

  if (data.wait?.timedOut) {
    lines.push("Espera: tiempo límite agotado (--timeout); resumen del estado actual.");
  }

  const shortHead = data.seal.prHead ? data.seal.prHead.slice(0, 7) : "?";
  const shortSeal = data.seal.head ? data.seal.head.slice(0, 7) : "?";
  if (data.seal.status === "ok") {
    lines.push(`Sello: ok (${shortSeal})`);
  } else if (data.seal.status === "stale") {
    lines.push(`Sello: sello viejo (${shortSeal} != ${shortHead})`);
  } else {
    lines.push("Sello: ausente");
  }

  lines.push(
    data.behind
      ? `Rama: atrasada respecto de ${data.pr.baseRefName} (BEHIND)`
      : `Rama: ${data.pr.mergeStateStatus === "DIRTY" ? "conflictos (DIRTY)" : `al día (${data.pr.mergeStateStatus})`}`,
  );

  const failedPart =
    data.checks.failed.length > 0
      ? `${data.checks.failed.length} fallidos (${summarizeList(data.checks.failed, 3)})`
      : "0 fallidos";
  const pendingPart =
    data.checks.pending.length > 0
      ? `${data.checks.pending.length} pendientes (${summarizeList(data.checks.pending, 3)})`
      : "0 pendientes";
  lines.push(`Checks: ${data.checks.ok} OK, ${failedPart}, ${pendingPart}`);

  const labelSummary =
    data.labels.names.length > 0 ? summarizeList(data.labels.names, 6) : "ninguna";
  lines.push(
    `Etiquetas: ${labelSummary}${data.labels.harnessAuthorized ? "" : " (sin harness-authorized)"}`,
  );
  lines.push(`Revisión: ${data.review}`);

  if (data.mergeCheck.mergeable) {
    lines.push("Merge-check: OK");
  } else {
    lines.push(`Merge-check: BLOQUEADO (${data.mergeCheck.errors.length})`);
    const maxErrLines = Math.max(0, MAX_TEXT_LINES - lines.length - 2);
    const shown = data.mergeCheck.errors.slice(0, Math.min(5, maxErrLines));
    for (const e of shown) {
      lines.push(`  - ${e}`);
    }
    const omitted = data.mergeCheck.errors.length - shown.length;
    if (omitted > 0 && lines.length < MAX_TEXT_LINES - 1) {
      lines.push(`  - ... (+${omitted} más)`);
    }
  }

  lines.push(`Próximo paso: ${data.next}`);
  return lines.slice(0, MAX_TEXT_LINES).join("\n") + "\n";
}

/** Main entry point (dependency-injectable for tests). */
export async function main(argv, deps = {}) {
  const writeStdout = deps.writeStdout || ((s) => process.stdout.write(s));
  const writeStderr = deps.writeStderr || ((s) => process.stderr.write(s));
  const opts = parseArgs(argv);

  if (opts.help) {
    writeStdout(USAGE);
    return { exitCode: 0, data: null, text: USAGE };
  }
  if (opts.error) {
    writeStderr(`[harness-pr-status error] ${opts.error}\n`);
    return { exitCode: 2, data: null, text: "" };
  }

  const runGh = deps.runGh || defaultRunGh;
  const waitChecks = deps.waitChecks || defaultWaitChecks;
  const repoRoot = deps.repoRoot || resolveRepoRoot();
  const project = deps.project || loadProject(repoRoot);

  let waitResult = null;
  if (opts.waitChecks) {
    const watchArgs = [
      "pr",
      "checks",
      ...(opts.selector ? [opts.selector] : []),
      "--watch",
      "--interval",
      "30",
    ];
    waitResult = await waitChecks(watchArgs, opts.timeoutMs);
  }

  let pr;
  try {
    const viewArgs = [
      "pr",
      "view",
      ...(opts.selector ? [opts.selector] : []),
      "--json",
      PR_VIEW_FIELDS,
    ];
    pr = JSON.parse(runGh(viewArgs));
  } catch (err) {
    const msg = String(err?.stderr || err?.message || err).split(/\r?\n/)[0];
    writeStderr(`[harness-pr-status error] No se pudo consultar la PR: ${msg}\n`);
    return { exitCode: 1, data: null, text: "" };
  }

  const mcSelector = pr?.number != null ? String(pr.number) : opts.selector;
  const mergeCheck = runMergeCheckReadOnly(mcSelector, pr, {
    runGh,
    runMergeCheck: deps.runMergeCheck,
    mergeCheckMain: deps.mergeCheckMain,
  });

  const data = analyzePrStatus({ pr, mergeCheck, project, waitResult });
  const text = opts.json ? JSON.stringify(data, null, 2) + "\n" : formatPrStatus(data);
  writeStdout(text);

  const exitCode = waitResult?.timedOut ? 124 : 0;
  return { exitCode, data, text };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(({ exitCode }) => process.exit(exitCode));
}
