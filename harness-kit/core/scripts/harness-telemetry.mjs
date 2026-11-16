#!/usr/bin/env node
/**
 * Aggregates guard telemetry (<git common dir>/harness/telemetry/events.jsonl) into a summary:
 *   [RUNTIME]     events, sessions and blocks per rule for each runtime
 *   [ACTION]      tool calls per kind
 *   [OBSERVATION] blocks and injections per rule, median & p90 time-to-first-edit
 *   [ERROR]       sessions with more than 3 repeated blocks of the same rule
 *
 * Usage:
 *   node harness-kit/core/scripts/harness-telemetry.mjs [events.jsonl] [--since <ISO>] [--until <ISO>] [--json]
 * Defaults to the guard's telemetry dir for the current directory (see resolveTelemetryDir).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTelemetryDir } from "../guard/telemetry.mjs";

const REPEATED_BLOCK_THRESHOLD = 3;
// Max entries per list in the text summary, keeping it within 40 lines.
const LIST_MAX = 5;
const SYNTHETIC_SESSION_RE = /^(?:canary|synthetic|qa-canary)(?:[-:_].*)?$/i;

/** Returns true when an event comes from a canary or synthetic run and must be excluded. */
export function isExcludedEvent(e) {
  if (!e || typeof e !== "object") return true;
  if (e.synthetic === true || e.canary === true) return true;
  return SYNTHETIC_SESSION_RE.test(String(e.session || ""));
}

/**
 * Filter events excluding canary/synthetic sessions and applying optional [since, until) bounds.
 * @param {object[]} events
 * @param {{ since?: string | null, until?: string | null }} [options]
 */
export function filterEvents(events, options = {}) {
  const list = Array.isArray(events) ? events : [];
  const sinceMs = options.since != null ? Date.parse(options.since) : null;
  const untilMs = options.until != null ? Date.parse(options.until) : null;
  return list.filter((e) => {
    if (isExcludedEvent(e)) return false;
    if (sinceMs !== null || untilMs !== null) {
      const ts = Date.parse(e?.ts);
      if (!Number.isFinite(ts)) return false;
      if (sinceMs !== null && ts < sinceMs) return false;
      if (untilMs !== null && ts >= untilMs) return false;
    }
    return true;
  });
}

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
 * @param {{ since?: string | null, until?: string | null }} [options]
 */
export function summarize(events, options = {}) {
  const list = filterEvents(events, options);

  const actionsByKind = {};
  const blocksByRule = {};
  const injectionsByRule = {};
  // Per-runtime events, distinct sessions and blocks by rule.
  const runtimes = new Map();
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

    const runtime = e.runtime || "unknown";
    let r = runtimes.get(runtime);
    if (!r) {
      r = { events: 0, sessions: new Set(), blocksByRule: {} };
      runtimes.set(runtime, r);
    }
    r.events++;
    r.sessions.add(session);

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
      r.blocksByRule[e.rule] = (r.blocksByRule[e.rule] || 0) + 1;
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

  const byRuntime = Object.fromEntries(
    [...runtimes]
      .sort((a, b) => b[1].events - a[1].events)
      .map(([name, r]) => [
        name,
        { events: r.events, sessions: r.sessions.size, blocksByRule: byCountDesc(r.blocksByRule) },
      ]),
  );

  return {
    totalEvents: list.length,
    totalSessions: sessions.size,
    byRuntime,
    actionsByKind: byCountDesc(actionsByKind),
    blocksByRule: byCountDesc(blocksByRule),
    injectionsByRule: byCountDesc(injectionsByRule),
    timeToFirstEdit: {
      count: ttfe.length,
      medianMs: ttfe.length ? percentile(ttfe, 50) : null,
      p90Ms: ttfe.length ? percentile(ttfe, 90) : null,
    },
    repeatedBlockSessions,
    ppcTrigger: evaluatePpcTrigger(list, 2),
  };
}

/**
 * Evaluates telemetry for repeated failures and signals whether a PPC probe should be triggered.
 * Trigger criteria: >= threshold repeated blocks on the same rule in a session.
 */
export function evaluatePpcTrigger(events, threshold = 2) {
  const list = filterEvents(events);
  const sessionRuleBlocks = new Map();

  for (const e of list) {
    if (e.decision === "block" && e.rule) {
      const sess = e.session || "default";
      const key = `${sess}::${e.rule}`;
      sessionRuleBlocks.set(key, (sessionRuleBlocks.get(key) || 0) + 1);
    }
  }

  const triggers = [];
  for (const [key, count] of sessionRuleBlocks.entries()) {
    if (count >= threshold) {
      const [session, rule] = key.split("::");
      triggers.push({
        session,
        rule,
        block_count: count,
        recommendation: `Repeated failures (${count} blocks on '${rule}'). Trigger harness-proposer or run harness-probe.mjs --batch.`,
      });
    }
  }

  return {
    should_trigger: triggers.length > 0,
    threshold,
    triggers,
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
  lines.push("[RUNTIME] Events, sessions and blocks by runtime:");
  pushCounts(
    lines,
    Object.entries(summary.byRuntime || {}).map(([name, r]) => {
      const blocks = Object.entries(r.blocksByRule).map(([rule, n]) => `${rule}=${n}`).join(" ");
      return [`${name}  sessions ${r.sessions}  blocks ${blocks || "-"}`, r.events];
    }),
  );

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
  let asJson = false;
  let since = null;
  let until = null;
  let fileArg = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") {
      asJson = true;
    } else if (a === "--since") {
      if (i + 1 >= args.length) {
        process.stderr.write("Missing value for --since\n");
        process.exit(1);
      }
      since = args[++i];
    } else if (a.startsWith("--since=")) {
      since = a.slice("--since=".length);
    } else if (a === "--until") {
      if (i + 1 >= args.length) {
        process.stderr.write("Missing value for --until\n");
        process.exit(1);
      }
      until = args[++i];
    } else if (a.startsWith("--until=")) {
      until = a.slice("--until=".length);
    } else if (a.startsWith("-")) {
      process.stderr.write(`Unknown option: ${a}\n`);
      process.exit(1);
    } else if (fileArg === null) {
      fileArg = a;
    } else {
      process.stderr.write(`Unexpected argument: ${a}\n`);
      process.exit(1);
    }
  }

  if (since !== null && (!since || Number.isNaN(Date.parse(since)))) {
    process.stderr.write(`Invalid ISO date for --since: ${since}\n`);
    process.exit(1);
  }
  if (until !== null && (!until || Number.isNaN(Date.parse(until)))) {
    process.stderr.write(`Invalid ISO date for --until: ${until}\n`);
    process.exit(1);
  }

  if (fileArg !== null && !existsSync(fileArg)) {
    process.stderr.write(`Telemetry file not found: ${fileArg}\n`);
    process.exit(1);
  }

  const file = fileArg || path.join(resolveTelemetryDir(process.cwd()), "events.jsonl");

  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    process.stderr.write(`No telemetry found at ${file}\n`);
    process.exit(fileArg !== null ? 1 : 0);
  }

  const summary = summarize(parseJsonl(text), { since, until });
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
