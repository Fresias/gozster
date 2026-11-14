#!/usr/bin/env node
// Contrasts candidate harness probe reports and selects winning configuration (Harness²).
//
// Usage:
//   node core/scripts/harness-contrast.mjs --reports <file.json|dir> [--strict-scope] [--json]

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONTRAST_VERSION = "1.0.0";

/** Canonical JSON representation: recursively sorted object keys. */
export function canonicalJson(val) {
  if (Array.isArray(val)) return `[${val.map(canonicalJson).join(",")}]`;
  if (val !== null && typeof val === "object") {
    const keys = Object.keys(val).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(val[k])}`).join(",")}}`;
  }
  return JSON.stringify(val);
}

/** Computes SHA256 hex digest of the canonical JSON of a report. */
export function hashReport(report) {
  return createHash("sha256").update(canonicalJson(report), "utf8").digest("hex");
}

function fail(msg) {
  process.stderr.write(`[harness-contrast error] ${msg}\n`);
  process.exit(1);
}

function parseArgs(args) {
  const opts = {
    reports: "",
    strictScope: false,
    json: false,
    out: "",
    workdir: process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--reports" || a === "-r") opts.reports = args[++i];
    else if (a === "--strict-scope") opts.strictScope = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--out" || a === "-o") opts.out = args[++i];
    else if (a === "--workdir" || a === "-w") opts.workdir = path.resolve(args[++i]);
    else if (a === "--help" || a === "-h") {
      process.stdout.write(`harness-contrast — Candidate Probe Contraster & Selector (Harness²)

Options:
  --reports, -r <file|dir>   Path to JSON report array or directory of probe-*.json
  --strict-scope             Enforce hard reject if any candidate modified out-of-scope files
  --out, -o <path>           Write contrast report to specified path
  --json                     Output structured JSON report to stdout
  --workdir, -w <path>       Working directory (default: cwd)
`);
      process.exit(0);
    }
  }

  if (!opts.reports) fail("missing required argument: --reports <file|dir>");
  return opts;
}

export function loadReports(reportsInput) {
  const resolved = path.resolve(reportsInput);
  if (!existsSync(resolved)) {
    // Try parsing as raw JSON
    try {
      const parsed = JSON.parse(reportsInput);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      fail(`reports path not found: ${reportsInput}`);
    }
  }

  if (existsSync(resolved) && !existsSync(path.join(resolved, "..")) /* directory check */) {
    // Check if directory
  }

  try {
    const stat = readFileSync(resolved, "utf8");
    const parsed = JSON.parse(stat);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    // If it's a directory, load all probe-*.json
    try {
      const entries = readdirSync(resolved).filter((f) => f.endsWith(".json"));
      const list = [];
      for (const e of entries) {
        try {
          const item = JSON.parse(readFileSync(path.join(resolved, e), "utf8"));
          if (Array.isArray(item)) list.push(...item);
          else list.push(item);
        } catch {}
      }
      if (list.length > 0) return list;
    } catch {}
    fail(`failed to load reports from ${reportsInput}: ${err.message}`);
  }
}

export function evaluateCandidates(reports, options = {}) {
  if (!Array.isArray(reports) || reports.length === 0) {
    return {
      evaluated_at: new Date().toISOString(),
      total_candidates: 0,
      consensus_files: [],
      winner_id: null,
      winner_score: null,
      winner: null,
      contrast_matrix: [],
    };
  }

  const strictScope = Boolean(options.strictScope);

  // File consensus tracking
  const fileTouchCounts = new Map();
  for (const r of reports) {
    const touched = r.files_touched || [];
    for (const f of touched) {
      fileTouchCounts.set(f, (fileTouchCounts.get(f) || 0) + 1);
    }
  }

  const consensusFiles = [...fileTouchCounts.entries()]
    .filter(([_, count]) => count >= 2)
    .map(([file]) => file);

  const matrix = reports.map((r) => {
    const candidateId = r.candidate_id || "unknown";
    const passed = Boolean(r.passed);
    const durationMs = Number(r.duration_ms) || 0;
    const outOfScope = r.out_of_scope_files || [];
    const inScope = r.in_scope_files || [];
    const touched = r.files_touched || [];

    let disqualified = false;
    let reason = "";

    if (!passed) {
      disqualified = true;
      reason = r.stderr_preview || "gate check failed";
    } else if ((strictScope || r.strict_scope_violation) && outOfScope.length > 0) {
      disqualified = true;
      reason = `strict scope violation: ${outOfScope.join(", ")}`;
    }

    // Score calculation
    let score = passed ? 1000 : 0;

    // Penalty for duration (faster probes preferred, -10 pts per 100ms)
    score -= Math.round(durationMs / 10);

    // Penalty for out-of-scope files in flexible mode (-200 pts per foreign file)
    score -= outOfScope.length * 200;

    // Penalty for blocks / friction in telemetry (-50 pts per block)
    if (r.telemetry && r.telemetry.blocks) {
      score -= r.telemetry.blocks * 50;
    }

    // Consensus bonus (+50 pts for touching files confirmed by consensus)
    for (const f of touched) {
      if (consensusFiles.includes(f)) score += 50;
    }

    return {
      candidate_id: candidateId,
      passed,
      disqualified,
      reason,
      score,
      duration_ms: durationMs,
      in_scope_count: inScope.length,
      out_of_scope_count: outOfScope.length,
      out_of_scope_files: outOfScope,
      files_touched: touched,
      telemetry: r.telemetry || null,
      report_ref: r,
    };
  });

  // Sort candidates
  matrix.sort((a, b) => {
    if (a.disqualified && !b.disqualified) return 1;
    if (!a.disqualified && b.disqualified) return -1;
    return b.score - a.score;
  });

  // Assign ranks
  matrix.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  const qualified = matrix.filter((m) => !m.disqualified);
  let winner = null;
  let warning = "";

  if (qualified.length > 0) {
    winner = qualified[0];
  } else if (!strictScope && matrix.some((m) => m.passed && m.out_of_scope_count > 0)) {
    // If flexible mode and all passed candidates had out-of-scope files, select best passed with warning
    const bestPassed = matrix.filter((m) => m.passed).sort((a, b) => b.score - a.score)[0];
    if (bestPassed) {
      winner = bestPassed;
      warning = "all candidates touched out-of-scope files; selected lowest friction candidate under flexible mode";
    }
  }

  const result = {
    contrast_version: CONTRAST_VERSION,
    evaluated_at: new Date().toISOString(),
    total_candidates: matrix.length,
    consensus_files: consensusFiles,
    winner_id: winner ? winner.candidate_id : null,
    winner_score: winner ? winner.score : null,
    winner: winner ? winner.report_ref : null,
    warning: warning || undefined,
    strict_scope: strictScope,
    contrast_matrix: matrix.map(({ report_ref, ...rest }) => rest),
  };

  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const opts = parseArgs(process.argv.slice(2));
  const reports = loadReports(opts.reports);
  const result = evaluateCandidates(reports, { strictScope: opts.strictScope });

  if (opts.out) {
    mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
    writeFileSync(path.resolve(opts.out), JSON.stringify(result, null, 2) + "\n", "utf8");
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`\n=== Harness² Candidate Contrast Matrix ===\n`);
    for (const c of result.contrast_matrix) {
      const status = c.disqualified ? `[DISQUALIFIED: ${c.reason}]` : `Score: ${c.score}`;
      process.stdout.write(`Rank #${c.rank}: ${c.candidate_id} (${c.duration_ms}ms) -> ${status} (out-of-scope: ${c.out_of_scope_count})\n`);
    }
    if (result.winner_id) {
      process.stdout.write(`\nWinner: ${result.winner_id} (Score: ${result.winner_score})\n`);
    } else {
      process.stdout.write(`\nNo winning candidate qualified.\n`);
    }
    if (result.warning) process.stdout.write(`Warning: ${result.warning}\n`);
  }

  process.exit(result.winner_id ? 0 : 1);
}
