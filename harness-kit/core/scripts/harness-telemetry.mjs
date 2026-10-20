#!/usr/bin/env node
/**
 * harness-telemetry.mjs
 * Aggregates guard telemetry (.harness/telemetry/events.jsonl) into a summary:
 *   [ACTION]      tool calls per kind
 *   [OBSERVATION] blocks and injections per rule, median & p90 time-to-first-edit
 *   [ERROR]       sessions with more than 3 repeated blocks of the same rule
 *
 * Usage:
 *   node harness-kit/core/scripts/harness-telemetry.mjs [events.jsonl] [--json]
 * Defaults to .harness/telemetry/events.jsonl under the current directory.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPEATED_BLOCK_THRESHOLD = 3;
// Max entries per list in the text summary, keeping it within 40 lines.
const LIST_MAX = 5;

/** Parse JSONL text into event objects, skipping blank/invalid lines. */
export function parseJsonl(text) {
  const events = [];
  for (const line of String(text || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed lines rather than abort the whole summary.
    }
  }
  return events;
}

/**
 * Linear-interpolation percentile (numpy default). `sorted` must be ascending.
 * @param {number[]} sorted
 * @param {number} p 0..100
 */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/**
 * Summarize telemetry events.
 * @param {object[]} events
 */
export function summarize(events) {
  const list = Array.isArray(events) ? events : [];

  const actionsByKind = {};
  const blocksByRule = {};
  const injectionsByRule = {};
  // Per-session bookkeeping for TTFE and repeated-block detection.
  const sessions = new Map();

  for (const e of list) {
    const session = e.session || "unknown";
    let s = sessions.get(session);
    if (!s) {
      s = { start: null, firstEdit: null, blocksByRule: {} };
      sessions.set(session, s);
    }

    const ts = Date.parse(e.ts);
    if (Number.isFinite(ts)) {
      if (s.start === null || ts < s.start) s.start = ts;
      if (e.kind === "write" && (s.firstEdit === null || ts < s.firstEdit)) {
        s.firstEdit = ts;
      }
    }

    // Post-phase events are injections on an already-counted call, not new actions.
    if (e.phase !== "post") {
      const kind = e.kind || "other";
      actionsByKind[kind] = (actionsByKind[kind] || 0) + 1;
    }

    if (e.inject === true && e.rule) {
      injectionsByRule[e.rule] = (injectionsByRule[e.rule] || 0) + 1;
    }

    if (e.decision === "block" && e.rule) {
      blocksByRule[e.rule] = (blocksByRule[e.rule] || 0) + 1;
      s.blocksByRule[e.rule] = (s.blocksByRule[e.rule] || 0) + 1;
    }
  }

  // Time-to-first-edit per session (ms), only where both start and an edit exist.
  const ttfe = [];
  for (const s of sessions.values()) {
    if (s.start !== null && s.firstEdit !== null && s.firstEdit >= s.start) {
      ttfe.push(s.firstEdit - s.start);
    }
  }
  ttfe.sort((a, b) => a - b);

  // Sessions with more than 3 repeated blocks of the same rule.
  const repeatedBlockSessions = [];
  for (const [session, s] of sessions) {
    for (const [rule, count] of Object.entries(s.blocksByRule)) {
      if (count > REPEATED_BLOCK_THRESHOLD) {
        repeatedBlockSessions.push({ session, rule, count });
      }
    }
  }
  repeatedBlockSessions.sort((a, b) => b.count - a.count);

  const byCountDesc = (obj) => Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]));

  return {
    totalEvents: list.length,
    totalSessions: sessions.size,
    actionsByKind: byCountDesc(actionsByKind),
    blocksByRule: byCountDesc(blocksByRule),
    injectionsByRule: byCountDesc(injectionsByRule),
    timeToFirstEdit: {
      count: ttfe.length,
      medianMs: ttfe.length ? percentile(ttfe, 50) : null,
      p90Ms: ttfe.length ? percentile(ttfe, 90) : null,
    },
    repeatedBlockSessions,
  };
}

/** Push up to LIST_MAX "count  label" lines, plus an overflow marker. */
function pushCounts(lines, entries) {
  if (entries.length === 0) {
    lines.push("    (none)");
    return;
  }
  for (const [label, count] of entries.slice(0, LIST_MAX)) lines.push(`    ${count}  ${label}`);
  if (entries.length > LIST_MAX) lines.push(`    ... +${entries.length - LIST_MAX} more`);
}

/** Render a human-readable summary (<= 40 lines). */
export function formatSummary(summary) {
  const lines = [];
  lines.push("Harness telemetry summary");
  lines.push(`  events:   ${summary.totalEvents}`);
  lines.push(`  sessions: ${summary.totalSessions}`);

  lines.push("");
  lines.push("[ACTION] Tool calls by kind:");
  pushCounts(lines, Object.entries(summary.actionsByKind));

  lines.push("");
  lines.push("[OBSERVATION]");
  lines.push("  Blocks by rule:");
  pushCounts(lines, Object.entries(summary.blocksByRule));
  lines.push("  Injections by rule:");
  pushCounts(lines, Object.entries(summary.injectionsByRule));
  const t = summary.timeToFirstEdit;
  lines.push(
    t.count
      ? `  Time-to-first-edit (ms): sessions ${t.count}  median ${t.medianMs}  p90 ${t.p90Ms}`
      : "  Time-to-first-edit (ms): (no edits recorded)",
  );

  lines.push("");
  lines.push(`[ERROR] Sessions with > ${REPEATED_BLOCK_THRESHOLD} repeated blocks:`);
  pushCounts(
    lines,
    summary.repeatedBlockSessions.map((r) => [`${r.session}  ${r.rule}`, r.count]),
  );

  return lines.join("\n");
}

// --- CLI ---------------------------------------------------------------
function main(argv) {
  const args = argv.slice(2);
  const asJson = args.includes("--json");
  const fileArg = args.find((a) => !a.startsWith("--"));
  const file = fileArg || path.join(process.cwd(), ".harness", "telemetry", "events.jsonl");

  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    process.stderr.write(`No telemetry found at ${file}\n`);
    process.exit(0);
  }

  const summary = summarize(parseJsonl(text));
  if (asJson) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    process.stdout.write(formatSummary(summary) + "\n");
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv);
}
