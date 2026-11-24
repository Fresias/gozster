#!/usr/bin/env node
/**
 * Aggregates guard telemetry (<git common dir>/harness/telemetry/events.jsonl) into a summary:
 *   [RUNTIME]     events, sessions and blocks per rule for each runtime
 *   [ACTION]      tool calls per kind (from L-002 onward compare `totalActions`, L-001: 24,315)
 *   [OBSERVATION] blocks, injections, TTFE, calls before first edit, active time and durations
 *   [ERROR]       sessions with more than 3 repeated blocks of the same rule
 *
 * Usage:
 *   node harness-kit/core/scripts/harness-telemetry.mjs [events.jsonl]
 *     [--since <ISO>] [--until <ISO>] [--idle-min <N>] [--json]
 *     [--exclude-kind <kind>]... [--exclude-rule <id>]...
 *     [--deep [--top <N>] [--out <DIR>] [--repo <DIR>] [--no-examples]]
 *     [--help]
 * Defaults to the guard's telemetry dir for the current directory (see resolveTelemetryDir).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTelemetryDir } from "../guard/telemetry.mjs";
import { commandSignature, runDeepDive } from "../lib/telemetry-deep.mjs";

const REPEATED_BLOCK_THRESHOLD = 3;
// Max entries per list in the text summary, keeping it within 40 lines.
const LIST_MAX = 5;
const DEFAULT_IDLE_MIN = 15;
const GAP_CALIBRATION_MINS = [2, 5, 10, 15, 30, 60];
const TOP_DURATION_SIGS = 10;
const SYNTHETIC_SESSION_RE = /^(?:canary|synthetic|qa-canary)(?:[-:_].*)?$/i;

/** Returns true when an event comes from a canary or synthetic run and must be excluded. */
export function isExcludedEvent(e) {
  if (!e || typeof e !== "object") return true;
  if (e.synthetic === true || e.canary === true) return true;
  return SYNTHETIC_SESSION_RE.test(String(e.session || ""));
}

function normalizeStringList(input) {
  if (!input) return [];
  const raw = input instanceof Set ? [...input] : Array.isArray(input) ? input : [input];
  const out = [];
  const seen = new Set();
  for (const v of raw) {
    const s = String(v ?? "").trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/**
 * Filter events excluding canary/synthetic sessions, optional [since, until) bounds,
 * and optional excluded kinds (dropping both actions and their paired `post` events).
 * @param {object[]} events
 * @param {{ since?: string | null, until?: string | null, excludeKinds?: string[] | Set<string> | null }} [options]
 */
export function filterEvents(events, options = {}) {
  const list = Array.isArray(events) ? events : [];
  const sinceMs = options.since != null ? Date.parse(options.since) : null;
  const untilMs = options.until != null ? Date.parse(options.until) : null;
  const excludeKindSet = new Set(normalizeStringList(options.excludeKinds));

  const inWindow = list.filter((e) => {
    if (isExcludedEvent(e)) return false;
    if (sinceMs !== null || untilMs !== null) {
      const ts = Date.parse(e?.ts);
      if (!Number.isFinite(ts)) return false;
      if (sinceMs !== null && ts < sinceMs) return false;
      if (untilMs !== null && ts >= untilMs) return false;
    }
    return true;
  });

  if (excludeKindSet.size === 0) return inWindow;

  // Track ids of excluded pre events so paired post events are dropped even if they omit `kind`.
  const excludedPreIds = new Set();
  for (const e of inWindow) {
    if (e?.phase !== "post" && excludeKindSet.has(e?.kind || "other")) {
      const id = e?.id != null ? String(e.id).trim() : "";
      if (id) excludedPreIds.add(`${e?.session || "unknown"}\u0000${id}`);
    }
  }

  return inWindow.filter((e) => {
    if (excludeKindSet.has(e?.kind || "other")) return false;
    if (e?.phase === "post") {
      const id = e?.id != null ? String(e.id).trim() : "";
      if (id && excludedPreIds.has(`${e?.session || "unknown"}\u0000${id}`)) return false;
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
 * Pair pre/post events to measure execution durations (`post.ts - pre.ts`).
 * - Primary match: identical non-empty `id` (`tool_use_id`) within the same session.
 * - Fallback match (when `id` is missing on pre or post): same `(session, tool, cmd)`
 *   with the nearest subsequent unmatched `post` (`post.ts >= pre.ts`).
 * @param {object[]} events Filtered event list
 */
export function pairPrePostEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const records = list.map((event, index) => ({
    event,
    index,
    ts: Date.parse(event?.ts),
    session: event?.session || "unknown",
    tool: event?.tool || "",
    cmd: String(event?.cmd || ""),
    id: event?.id != null ? String(event.id).trim() : "",
    isPost: event?.phase === "post",
    isBlocked: event?.decision === "block",
  }));

  // Chronological order; on timestamp tie, place pre before post to allow 0 ms pairing.
  records.sort((a, b) => {
    const at = Number.isFinite(a.ts) ? a.ts : Infinity;
    const bt = Number.isFinite(b.ts) ? b.ts : Infinity;
    if (at !== bt) return at - bt;
    if (a.isPost !== b.isPost) return a.isPost ? 1 : -1;
    return a.index - b.index;
  });

  const preRecs = records.filter((r) => !r.isPost && !r.isBlocked);
  const postRecs = records.filter((r) => r.isPost);

  const matchedPre = new Set();
  const matchedPost = new Set();
  const pairs = [];

  // Pass 1: exact match by (session, id)
  const preById = new Map();
  for (const pre of preRecs) {
    if (!pre.id) continue;
    const key = `${pre.session}\u0000${pre.id}`;
    let q = preById.get(key);
    if (!q) {
      q = [];
      preById.set(key, q);
    }
    q.push(pre);
  }

  for (const post of postRecs) {
    if (!post.id || !Number.isFinite(post.ts)) continue;
    const q = preById.get(`${post.session}\u0000${post.id}`);
    if (!q) continue;
    const pre = q.find((cand) => !matchedPre.has(cand.index) && Number.isFinite(cand.ts) && post.ts >= cand.ts);
    if (!pre) continue;
    matchedPre.add(pre.index);
    matchedPost.add(post.index);
    pairs.push({
      pre: pre.event,
      post: post.event,
      preIndex: pre.index,
      postIndex: post.index,
      durationMs: post.ts - pre.ts,
      matchedBy: "id",
      ok: typeof post.event.ok === "boolean" ? post.event.ok : null,
    });
  }

  // Pass 2: fallback match by (session, tool, cmd) to nearest subsequent unmatched post
  const postsByKey = new Map();
  for (const post of postRecs) {
    if (matchedPost.has(post.index) || !Number.isFinite(post.ts)) continue;
    const key = `${post.session}\u0000${post.tool}\u0000${post.cmd}`;
    let q = postsByKey.get(key);
    if (!q) {
      q = [];
      postsByKey.set(key, q);
    }
    q.push(post);
  }

  for (const pre of preRecs) {
    if (matchedPre.has(pre.index) || !Number.isFinite(pre.ts)) continue;
    const key = `${pre.session}\u0000${pre.tool}\u0000${pre.cmd}`;
    const q = postsByKey.get(key);
    if (!q) continue;
    const post = q.find(
      (cand) =>
        !matchedPost.has(cand.index) &&
        cand.ts >= pre.ts &&
        !(pre.id && cand.id), // Never fallback-match two calls that carry distinct explicit ids.
    );
    if (!post) continue;
    matchedPre.add(pre.index);
    matchedPost.add(post.index);
    pairs.push({
      pre: pre.event,
      post: post.event,
      preIndex: pre.index,
      postIndex: post.index,
      durationMs: post.ts - pre.ts,
      matchedBy: "fallback",
      ok: typeof post.event.ok === "boolean" ? post.event.ok : null,
    });
  }

  return pairs;
}

/**
 * Summarize telemetry events.
 * Note: `totalEvents` counts all events (actions + post events). From L-002 onward,
 * compare `totalActions` (`phase !== "post"`, L-001 baseline: 24,315) because post hooks
 * add `phase: "post"` entries to `events.jsonl`.
 * @param {object[]} events
 * @param {{
 *   since?: string | null,
 *   until?: string | null,
 *   idleMin?: number,
 *   excludeKinds?: string[] | Set<string> | null,
 *   excludeRules?: string[] | Set<string> | null,
 * }} [options]
 */
export function summarize(events, options = {}) {
  const idleMin = options.idleMin ?? DEFAULT_IDLE_MIN;
  if (!Number.isFinite(idleMin) || idleMin <= 0) {
    throw new Error(`Invalid idleMin: ${idleMin}`);
  }
  const idleThresholdMs = idleMin * 60_000;
  const excludedKinds = normalizeStringList(options.excludeKinds);
  const excludedRules = normalizeStringList(options.excludeRules);
  const excludedRuleSet = new Set(excludedRules);

  const list = filterEvents(events, options);

  const actionsByKind = {};
  const blocksByRule = {};
  const injectionsByRule = {};
  let totalActions = 0;
  let totalBlocks = 0;
  let postEvents = 0;
  let outcomesEvaluated = 0;
  let outcomesFailed = 0;

  // Per-runtime events, distinct sessions and blocks by rule.
  const runtimes = new Map();
  // Per-session bookkeeping for TTFE, active time, callsBeforeFirstEdit and repeated-block detection.
  const sessions = new Map();

  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const session = e.session || "unknown";
    let s = sessions.get(session);
    if (!s) {
      s = { start: null, firstEdit: null, blocksByRule: {}, actions: [] };
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

    // Post-phase events record outcomes/injections on an already-counted call, not new actions.
    if (e.phase === "post") {
      postEvents++;
      if (typeof e.ok === "boolean") {
        outcomesEvaluated++;
        if (e.ok === false) outcomesFailed++;
      }
    } else {
      totalActions++;
      const kind = e.kind || "other";
      actionsByKind[kind] = (actionsByKind[kind] || 0) + 1;
      s.actions.push({ ts, index: i, kind, decision: e.decision });
    }

    if (e.inject === true && e.rule) {
      injectionsByRule[e.rule] = (injectionsByRule[e.rule] || 0) + 1;
    }

    if (e.decision === "block" && e.rule && !excludedRuleSet.has(e.rule)) {
      totalBlocks++;
      blocksByRule[e.rule] = (blocksByRule[e.rule] || 0) + 1;
      s.blocksByRule[e.rule] = (s.blocksByRule[e.rule] || 0) + 1;
      r.blocksByRule[e.rule] = (r.blocksByRule[e.rule] || 0) + 1;
    }
  }

  // Time-to-first-edit per session (ms), active time per session, gap calibration, and callsBeforeFirstEdit.
  const ttfe = [];
  const callsBeforeFirstEdit = [];
  const sessionActives = [];
  const allGaps = [];
  const gapsOverMin = Object.fromEntries(GAP_CALIBRATION_MINS.map((m) => [m, 0]));
  let totalActiveMs = 0;

  for (const s of sessions.values()) {
    if (s.start !== null && s.firstEdit !== null && s.firstEdit >= s.start) {
      ttfe.push(s.firstEdit - s.start);
    }

    s.actions.sort((a, b) => {
      const at = Number.isFinite(a.ts) ? a.ts : 0;
      const bt = Number.isFinite(b.ts) ? b.ts : 0;
      return at - bt || a.index - b.index;
    });

    const firstAllowedWrite = s.actions.findIndex((a) => a.kind === "write" && a.decision !== "block");
    if (firstAllowedWrite >= 0) {
      callsBeforeFirstEdit.push(firstAllowedWrite);
    }

    let activeMs = 0;
    for (let i = 0; i + 1 < s.actions.length; i++) {
      const a = s.actions[i];
      const b = s.actions[i + 1];
      if (!Number.isFinite(a.ts) || !Number.isFinite(b.ts)) continue;
      const gap = b.ts - a.ts;
      allGaps.push(gap);
      for (const m of GAP_CALIBRATION_MINS) {
        if (gap > m * 60_000) gapsOverMin[m]++;
      }
      if (gap <= idleThresholdMs) {
        activeMs += gap;
      }
    }
    sessionActives.push(activeMs);
    totalActiveMs += activeMs;
  }

  ttfe.sort((a, b) => a - b);
  callsBeforeFirstEdit.sort((a, b) => a - b);
  sessionActives.sort((a, b) => a - b);

  // Durations from pre/post pairs.
  const pairs = pairPrePostEvents(list);
  const allDurations = [];
  const durationsByKind = new Map();
  const durationsBySig = new Map();
  let pairedById = 0;
  let pairedByFallback = 0;

  for (const pair of pairs) {
    if (pair.matchedBy === "id") pairedById++;
    else pairedByFallback++;
    const ms = pair.durationMs;
    allDurations.push(ms);

    const kind = pair.pre.kind || "other";
    let kArr = durationsByKind.get(kind);
    if (!kArr) {
      kArr = [];
      durationsByKind.set(kind, kArr);
    }
    kArr.push(ms);

    const sig = commandSignature(pair.pre.cmd, { kind });
    let sRec = durationsBySig.get(sig);
    if (!sRec) {
      sRec = { values: [], totalMs: 0, failed: 0 };
      durationsBySig.set(sig, sRec);
    }
    sRec.values.push(ms);
    sRec.totalMs += ms;
    if (pair.ok === false) sRec.failed++;
  }

  allDurations.sort((a, b) => a - b);
  const byKindDurations = Object.fromEntries(
    [...durationsByKind.entries()]
      .map(([kind, vals]) => {
        vals.sort((a, b) => a - b);
        const totalMs = vals.reduce((acc, v) => acc + v, 0);
        return [
          kind,
          {
            count: vals.length,
            p50Ms: percentile(vals, 50),
            p90Ms: percentile(vals, 90),
            totalMs,
          },
        ];
      })
      .sort((a, b) => b[1].totalMs - a[1].totalMs),
  );

  const topSignaturesByTotalMs = [...durationsBySig.entries()]
    .map(([signature, rec]) => {
      rec.values.sort((a, b) => a - b);
      return {
        signature,
        count: rec.values.length,
        totalMs: rec.totalMs,
        p50Ms: percentile(rec.values, 50),
        p90Ms: percentile(rec.values, 90),
        failed: rec.failed,
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs || a.signature.localeCompare(b.signature))
    .slice(0, TOP_DURATION_SIGS);

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

  const blocksPerSession = sessions.size > 0 ? Math.round((totalBlocks / sessions.size) * 100) / 100 : 0;

  return {
    totalEvents: list.length,
    totalActions,
    postEvents,
    totalSessions: sessions.size,
    blocksPerSession,
    excludedKinds,
    excludedRules,
    byRuntime,
    actionsByKind: byCountDesc(actionsByKind),
    blocksByRule: byCountDesc(blocksByRule),
    injectionsByRule: byCountDesc(injectionsByRule),
    timeToFirstEdit: {
      count: ttfe.length,
      medianMs: ttfe.length ? percentile(ttfe, 50) : null,
      p90Ms: ttfe.length ? percentile(ttfe, 90) : null,
    },
    callsBeforeFirstEdit: {
      count: callsBeforeFirstEdit.length,
      p50: callsBeforeFirstEdit.length ? percentile(callsBeforeFirstEdit, 50) : null,
      p90: callsBeforeFirstEdit.length ? percentile(callsBeforeFirstEdit, 90) : null,
    },
    activeTimeMs: {
      idleThresholdMin: idleMin,
      totalMs: totalActiveMs,
      p50Ms: sessionActives.length ? percentile(sessionActives, 50) : null,
      p90Ms: sessionActives.length ? percentile(sessionActives, 90) : null,
      sessionCount: sessionActives.length,
      totalGaps: allGaps.length,
      gapsOverMin,
    },
    durations: {
      pairedCount: pairs.length,
      pairedById,
      pairedByFallback,
      totalMs: allDurations.reduce((acc, v) => acc + v, 0),
      p50Ms: allDurations.length ? percentile(allDurations, 50) : null,
      p90Ms: allDurations.length ? percentile(allDurations, 90) : null,
      byKind: byKindDurations,
      topSignaturesByTotalMs,
      outcomes: {
        evaluated: outcomesEvaluated,
        failed: outcomesFailed,
        failureRate: outcomesEvaluated > 0 ? outcomesFailed / outcomesEvaluated : null,
      },
    },
    repeatedBlockSessions,
    ppcTrigger: evaluatePpcTrigger(list, 2, { excludeRules: excludedRules }),
  };
}

/**
 * Evaluates telemetry for repeated failures and signals whether a PPC probe should be triggered.
 * Trigger criteria: >= threshold repeated blocks on the same rule in a session.
 */
export function evaluatePpcTrigger(events, threshold = 2, options = {}) {
  const list = filterEvents(events, options);
  const excludedRuleSet = new Set(normalizeStringList(options.excludeRules));
  const sessionRuleBlocks = new Map();

  for (const e of list) {
    if (e.decision === "block" && e.rule && !excludedRuleSet.has(e.rule)) {
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

function round1(n) {
  return Math.round(n * 10) / 10;
}

/** Render a human-readable summary (<= 40 lines). */
export function formatSummary(summary) {
  const lines = [];
  const totalActions = summary.totalActions ?? Object.values(summary.actionsByKind || {}).reduce((a, b) => a + b, 0);
  const postEvents = summary.postEvents ?? Math.max(0, summary.totalEvents - totalActions);
  const act = summary.activeTimeMs;
  const activePart = act
    ? `  active ${round1(act.totalMs / 3_600_000)}h (p50 ${act.p50Ms != null ? round1(act.p50Ms / 60_000) : 0}m, idle<=${act.idleThresholdMin}m)`
    : "";

  const excludedKinds = summary.excludedKinds || [];
  const excludedRules = summary.excludedRules || [];
  const filterTags = [];
  if (excludedKinds.length > 0) filterTags.push(`excluidos: ${excludedKinds.join(", ")}`);
  if (excludedRules.length > 0) filterTags.push(`reglas excluidas: ${excludedRules.join(", ")}`);
  const filterSuffix = filterTags.length > 0 ? `  (${filterTags.join(" · ")})` : "";
  const totalBlocks = Object.values(summary.blocksByRule || {}).reduce((a, b) => a + b, 0);
  const bps = summary.blocksPerSession ?? (summary.totalSessions > 0 ? Math.round((totalBlocks / summary.totalSessions) * 100) / 100 : 0);

  lines.push(`Harness telemetry summary${filterSuffix}`);
  lines.push(`  events:   ${summary.totalEvents}  (actions ${totalActions}, post ${postEvents})`);
  lines.push(`  sessions: ${summary.totalSessions}${activePart}`);

  lines.push("");
  lines.push("[RUNTIME] Events, sessions and blocks by runtime:");
  pushCounts(
    lines,
    Object.entries(summary.byRuntime || {}).map(([name, r]) => {
      const blocks = Object.entries(r.blocksByRule)
        .map(([rule, n]) => `${rule}=${n}`)
        .join(" ");
      return [`${name}  sessions ${r.sessions}  blocks ${blocks || "-"}`, r.events];
    }),
  );

  lines.push("");
  lines.push("[ACTION] Tool calls by kind:");
  pushCounts(lines, Object.entries(summary.actionsByKind));

  lines.push("");
  lines.push("[OBSERVATION]");
  lines.push(`  Blocks by rule (${totalBlocks} total, ${bps}/session):`);
  pushCounts(lines, Object.entries(summary.blocksByRule));
  lines.push("  Injections by rule:");
  pushCounts(lines, Object.entries(summary.injectionsByRule));
  const t = summary.timeToFirstEdit;
  lines.push(
    t.count
      ? `  Time-to-first-edit (ms): sessions ${t.count}  median ${t.medianMs}  p90 ${t.p90Ms}`
      : "  Time-to-first-edit (ms): (no edits recorded)",
  );
  const cbfe = summary.callsBeforeFirstEdit;
  const dur = summary.durations;
  const extraParts = [];
  if (cbfe && cbfe.count > 0) {
    extraParts.push(`calls-before-1st-edit p50=${round1(cbfe.p50)} p90=${round1(cbfe.p90)}`);
  }
  if (dur && (dur.pairedCount > 0 || dur.outcomes?.evaluated > 0)) {
    const failPct = dur.outcomes?.failureRate != null ? `${round1(dur.outcomes.failureRate * 100)}%` : "n/a";
    extraParts.push(`paired=${dur.pairedCount} dur-p50=${dur.p50Ms != null ? Math.round(dur.p50Ms) : 0}ms fail=${failPct}`);
  }
  if (extraParts.length > 0) {
    lines.push(`  Metrics: ${extraParts.join("  |  ")}`);
  }

  lines.push("");
  lines.push(`[ERROR] Sessions with > ${REPEATED_BLOCK_THRESHOLD} repeated blocks:`);
  pushCounts(
    lines,
    summary.repeatedBlockSessions.map((r) => [`${r.session}  ${r.rule}`, r.count]),
  );

  return lines.join("\n");
}

// --- CLI ---------------------------------------------------------------

function printUsage() {
  process.stdout.write(
    [
      "Usage: node harness-kit/core/scripts/harness-telemetry.mjs [events.jsonl] [options]",
      "",
      "Options:",
      "  --since <ISO>           Inclusive lower timestamp bound",
      "  --until <ISO>           Exclusive upper timestamp bound",
      "  --idle-min <N>          Inactivity gap threshold in minutes (default: 15)",
      "  --exclude-kind <kind>   Exclude actions of this kind and their post events (repeatable)",
      "  --exclude-rule <id>     Exclude this rule from block counts (action still counts; repeatable)",
      "  --json                  Output JSON to stdout",
      "  --deep                  Run deep-dive report (writes deep-dive.md and deep-dive.json)",
      "  --top <N>               Ranking length for --deep (default: 20)",
      "  --out <DIR>             Output directory for --deep (default: <telemetryDir>/deep-dive)",
      "  --repo <DIR>            Repository root for --deep (default: cwd)",
      "  --no-examples           Omit raw command examples in --deep report",
      "  -h, --help              Show this help message",
      "",
    ].join("\n"),
  );
}

/**
 * Parse and strictly validate CLI arguments.
 * @param {string[]} args
 */
export function parseCliArgs(args) {
  const opts = {
    help: false,
    asJson: false,
    deep: false,
    since: null,
    until: null,
    idleMin: DEFAULT_IDLE_MIN,
    excludeKinds: [],
    excludeRules: [],
    top: 20,
    out: null,
    repo: null,
    examples: true,
    fileArg: null,
  };

  const fail = (message) => {
    const err = new Error(message);
    err.isCliError = true;
    throw err;
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = a.indexOf("=");
    const flag = a.startsWith("--") && eq > 0 ? a.slice(0, eq) : a;
    const inline = a.startsWith("--") && eq > 0 ? a.slice(eq + 1) : null;

    const readValue = (name) => {
      if (inline !== null) return inline;
      if (i + 1 >= args.length) fail(`Missing value for ${name}`);
      return args[++i];
    };

    if (flag === "-h" || flag === "--help") {
      opts.help = true;
    } else if (flag === "--json" && inline === null) {
      opts.asJson = true;
    } else if (flag === "--deep" && inline === null) {
      opts.deep = true;
    } else if (flag === "--no-examples" && inline === null) {
      opts.examples = false;
    } else if (flag === "--since") {
      opts.since = readValue("--since");
    } else if (flag === "--until") {
      opts.until = readValue("--until");
    } else if (flag === "--idle-min" || flag === "--gap-cap-min") {
      const rawVal = readValue(flag);
      const parsed = rawVal.trim() === "" ? NaN : Number(rawVal);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        fail(`Invalid number for ${flag}: ${rawVal} (must be > 0)`);
      }
      opts.idleMin = parsed;
    } else if (flag === "--exclude-kind") {
      const rawVal = readValue("--exclude-kind").trim();
      if (!rawVal) fail("Missing value for --exclude-kind");
      if (!opts.excludeKinds.includes(rawVal)) opts.excludeKinds.push(rawVal);
    } else if (flag === "--exclude-rule") {
      const rawVal = readValue("--exclude-rule").trim();
      if (!rawVal) fail("Missing value for --exclude-rule");
      if (!opts.excludeRules.includes(rawVal)) opts.excludeRules.push(rawVal);
    } else if (flag === "--top") {
      const rawVal = readValue("--top");
      if (!/^\d+$/.test(rawVal.trim())) {
        fail(`Invalid integer for --top: ${rawVal} (must be >= 1)`);
      }
      const parsed = Number.parseInt(rawVal, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        fail(`Invalid integer for --top: ${rawVal} (must be >= 1)`);
      }
      opts.top = parsed;
    } else if (flag === "--out") {
      const rawVal = readValue("--out");
      if (!rawVal.trim()) fail("Missing value for --out");
      opts.out = rawVal;
    } else if (flag === "--repo") {
      const rawVal = readValue("--repo");
      if (!rawVal.trim()) fail("Missing value for --repo");
      opts.repo = rawVal;
    } else if (a.startsWith("-")) {
      fail(`Unknown option: ${a}`);
    } else if (opts.fileArg === null) {
      opts.fileArg = a;
    } else {
      fail(`Unexpected argument: ${a}`);
    }
  }

  if (!opts.help) {
    if (opts.since !== null && (!opts.since || Number.isNaN(Date.parse(opts.since)))) {
      fail(`Invalid ISO date for --since: ${opts.since}`);
    }
    if (opts.until !== null && (!opts.until || Number.isNaN(Date.parse(opts.until)))) {
      fail(`Invalid ISO date for --until: ${opts.until}`);
    }
  }

  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseCliArgs(argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err?.message || err}\n`);
    process.exit(1);
  }

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  if (opts.fileArg !== null && !existsSync(opts.fileArg)) {
    process.stderr.write(`Telemetry file not found: ${opts.fileArg}\n`);
    process.exit(1);
  }

  const baseDir = opts.repo ? path.resolve(opts.repo) : process.cwd();
  const file = opts.fileArg || path.join(resolveTelemetryDir(baseDir), "events.jsonl");

  if (opts.deep) {
    if (!existsSync(file)) {
      process.stderr.write(`No telemetry found at ${file}\n`);
      process.exit(opts.fileArg !== null ? 1 : 0);
    }
    const report = runDeepDive({
      file,
      since: opts.since,
      until: opts.until,
      idleMin: opts.idleMin,
      excludeKinds: opts.excludeKinds,
      excludeRules: opts.excludeRules,
      top: opts.top,
      out: opts.out,
      examples: opts.examples,
      repoRoot: baseDir,
    });
    if (opts.asJson) {
      process.stdout.write(JSON.stringify(report.json, null, 2) + "\n");
    } else {
      const cov = report.json.coverage;
      const crossLabel = report.crossCheck.matches ? "coincide con harness-telemetry" : "NO coincide con harness-telemetry";
      const errPart = report.json.errors ? ` · ${report.json.errors.length} sección(es) con error` : "";
      const exclPart = opts.excludeKinds.length ? ` · excluidos: ${opts.excludeKinds.join(", ")}` : "";
      const rulePart = opts.excludeRules.length ? ` · reglas excluidas: ${opts.excludeRules.join(", ")}` : "";
      process.stdout.write(
        `[deep-dive] ${cov.events} eventos · ${cov.actions} acciones · ${cov.sessions} sesiones · ${crossLabel}${exclPart}${rulePart}${errPart}\n` +
          `[deep-dive] Reporte: ${report.mdPath}\n[deep-dive] Detalle: ${report.jsonPath}\n`,
      );
    }
    return;
  }

  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    process.stderr.write(`No telemetry found at ${file}\n`);
    process.exit(opts.fileArg !== null ? 1 : 0);
  }

  const summary = summarize(parseJsonl(text), {
    since: opts.since,
    until: opts.until,
    idleMin: opts.idleMin,
    excludeKinds: opts.excludeKinds,
    excludeRules: opts.excludeRules,
  });
  if (opts.asJson) {
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } else {
    process.stdout.write(formatSummary(summary) + "\n");
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv);
}
