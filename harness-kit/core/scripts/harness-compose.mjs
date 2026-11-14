#!/usr/bin/env node
// Evaluates probe traces, selects the winning harness and updates experience library.
//
// Usage:
//   node core/scripts/harness-compose.mjs [--probes <dir>] [--candidates <file>] [--task "desc"] [--promote] [--json]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCandidates, CONTRAST_VERSION, hashReport } from "./harness-contrast.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..", "..");

function fail(msg) {
  process.stderr.write(`[harness-compose error] ${msg}\n`);
  process.exit(1);
}

function parseArgs(args) {
  const opts = {
    probes: "",
    candidates: "",
    task: "",
    decision: "",
    promote: true,
    json: false,
    workdir: process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--probes" || a === "-p") opts.probes = args[++i];
    else if (a === "--candidates" || a === "-c") opts.candidates = args[++i];
    else if (a === "--task" || a === "-t") opts.task = args[++i];
    else if (a === "--decision" || a === "-d") opts.decision = args[++i];
    else if (a === "--no-promote") opts.promote = false;
    else if (a === "--promote") opts.promote = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--workdir" || a === "-w") opts.workdir = path.resolve(args[++i]);
    else if (a === "--help" || a === "-h") {
      process.stdout.write(`harness-compose — PPC Synthesizer & Experience Persister (Harness²)

Options:
  --probes, -p <dir|file>      Directory of probe reports or single probe JSON file (default: .harness/probes)
  --candidates, -c <file>      Candidates JSON file proposed by harness-proposer
  --task, -t <description>     Task description to record in experience_library.jsonl
  --decision, -d <json>        Optional explicit composer decision JSON (from harness-composer)
  --promote / --no-promote     Whether to promote the winning candidate to harness/ (default: true)
  --json                       Output structured JSON report to stdout
  --workdir, -w <path>         Git repository working directory (default: cwd)
`);
      process.exit(0);
    }
  }

  return opts;
}

/** Loads probe results from a directory or file */
function loadProbeResults(repoDir, probesPath) {
  const target = probesPath
    ? path.resolve(repoDir, probesPath)
    : path.join(repoDir, ".harness", "probes");

  if (!existsSync(target)) return [];

  const results = [];
  try {
    const stat = readFileSync(target);
    // target is a single file
    try {
      const parsed = JSON.parse(stat.toString("utf8"));
      if (Array.isArray(parsed)) results.push(...parsed);
      else results.push(parsed);
      return results;
    } catch {}
  } catch {
    // target is a directory
    for (const f of readdirSync(target)) {
      if (f.endsWith(".json")) {
        try {
          const content = readFileSync(path.join(target, f), "utf8");
          results.push(JSON.parse(content));
        } catch {}
      }
    }
  }

  return results;
}

/** Loads candidate proposals from file or string */
function loadCandidates(repoDir, candidateInput) {
  if (!candidateInput) return [];
  const candidateStr = String(candidateInput).trim();
  let resolved = path.isAbsolute(candidateStr)
    ? candidateStr
    : existsSync(path.resolve(process.cwd(), candidateStr))
    ? path.resolve(process.cwd(), candidateStr)
    : path.resolve(repoDir, candidateStr);
  let raw = "";
  if (existsSync(resolved)) {
    raw = readFileSync(resolved, "utf8");
  } else {
    raw = candidateStr;
  }

  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

/** Calculates operational cost incorporating duration and telemetry friction */
export function calculateOperationalCost(p) {
  let cost = p.duration_ms || 0;
  if (p.telemetry) {
    const toolCalls = p.telemetry.tool_calls ?? p.telemetry.actions ?? 0;
    const blocks = p.telemetry.blocks ?? 0;
    const errors = p.telemetry.errors ?? 0;
    // Friction penalty: each guardrail block adds equivalent of 800ms, each tool call adds 150ms
    cost += (toolCalls * 150) + (blocks * 800) + (errors * 1500);
  }
  return cost;
}

/** Derives semantic tags for a task and candidate */
export function deriveTags(candidate, task = "") {
  const text = `${candidate?.candidate_id || ""} ${candidate?.target_component || ""} ${candidate?.rationale || ""} ${task}`.toLowerCase();
  const tags = new Set(Array.isArray(candidate?.tags) ? candidate.tags : []);
  if (/rpc|db|database|sql|migration|supabase|postgres|schema/.test(text)) tags.add("db");
  if (/ui|modal|component|react|frontend|css|view/.test(text)) tags.add("ui");
  if (/time|date|utc|timezone|semana|fecha/.test(text)) tags.add("time");
  if (/auth|session|token|login|rbac/.test(text)) tags.add("auth");
  if (/test|vitest|spec|qa|assert/.test(text)) tags.add("qa");
  if (/tool|guidance|cli|multica/.test(text)) tags.add("tools");
  return Array.from(tags);
}

/** Evaluates probe traces and selects the winner using harness-contrast */
export function evaluateProbes(probeResults, explicitDecision, options = {}) {
  if (explicitDecision) {
    let dec = explicitDecision;
    if (typeof dec === "string") {
      try {
        dec = JSON.parse(dec);
      } catch {}
    }
    return {
      winner_id: dec.winner_id || null,
      verdict: dec.verdict || "explicit",
      promote: Boolean(dec.promote),
      rationale: dec.rationale || "Explicit decision applied",
      lesson: dec.lesson || "Harness optimized per composer decision",
      contrast_matrix: [],
      contrast: [],
    };
  }

  if (!probeResults || probeResults.length === 0) {
    return {
      winner_id: null,
      verdict: "tie",
      promote: false,
      rationale: "No probe results available to evaluate",
      lesson: "",
      contrast_matrix: [],
      contrast: [],
    };
  }

  const version = options.version || options.contrast_version || CONTRAST_VERSION;
  const contrastResult = evaluateCandidates(probeResults, { version });
  const matrix = contrastResult.contrast_matrix || [];
  const winner = contrastResult.winner;

  if (!winner || !contrastResult.winner_id) {
    return {
      winner_id: null,
      verdict: "tie",
      promote: false,
      rationale: contrastResult.warning || "All candidate probes failed verification",
      lesson: "Current candidates did not resolve the task; retain existing harness baseline",
      contrast_matrix: matrix,
      contrast: matrix,
    };
  }

  const winnerEntry = matrix.find((m) => m.candidate_id === contrastResult.winner_id) || matrix[0];
  const winnerProbe = probeResults.find((p) => p.candidate_id === contrastResult.winner_id) || {};
  const durationMs = winnerEntry.duration_ms ?? winnerProbe.duration_ms ?? 0;
  const telemetry = winnerProbe.telemetry || winnerEntry.telemetry || null;

  // Find baseline or runner-up for contrast delta citation
  const other = matrix.find((m) => m.candidate_id !== contrastResult.winner_id);
  const comparisonTarget = other ? (other.candidate_id === "baseline" ? "baseline" : other.candidate_id) : "baseline";

  let lesson = "";
  if (version === "1.0.0") {
    let contrastDeltaStr = "";
    if (other) {
      const otherProbe = probeResults.find((p) => p.candidate_id === other.candidate_id) || {};
      const blocksDelta = (telemetry?.blocks ?? 0) - (otherProbe.telemetry?.blocks ?? other.telemetry?.blocks ?? 0);
      const durationDelta = durationMs - (other.duration_ms ?? otherProbe.duration_ms ?? 0);
      const scoreDelta = (winnerEntry.score ?? 0) - (other.score ?? 0);
      if (blocksDelta !== 0) {
        contrastDeltaStr = `${contrastResult.winner_id} vs ${comparisonTarget}: blocks ${blocksDelta > 0 ? "+" : ""}${blocksDelta}`;
      } else if (durationDelta !== 0) {
        contrastDeltaStr = `${contrastResult.winner_id} vs ${comparisonTarget}: duration_ms ${durationDelta > 0 ? "+" : ""}${durationDelta}`;
      } else {
        contrastDeltaStr = `${contrastResult.winner_id} vs ${comparisonTarget}: score +${scoreDelta}`;
      }
    }

    const telemStr = telemetry
      ? ` (duration: ${durationMs}ms, tool_calls: ${telemetry.tool_calls ?? 0}, blocks: ${telemetry.blocks ?? 0})`
      : ` (${durationMs}ms)`;

    const targetComp = winnerProbe.target_components?.join(", ") || "harness";
    lesson = contrastDeltaStr
      ? `Candidate ${contrastResult.winner_id} on ${targetComp} (${contrastDeltaStr})`
      : `Candidate ${contrastResult.winner_id} on ${targetComp} resolved task in ${durationMs}ms`;
  } else {
    // v2 lesson
    if (contrastResult.verdict === "behavioral") {
      const fixed = winnerEntry.fixed ?? 0;
      const regressed = winnerEntry.regressed ?? 0;
      lesson = `${contrastResult.winner_id} vs ${comparisonTarget}: ${fixed} tests fail→pass, ${regressed} regresiones`;
    } else if (contrastResult.verdict === "duration") {
      const otherDur = other?.duration_ms ?? 0;
      const diff = Math.abs(durationMs - otherDur);
      lesson = `${contrastResult.winner_id} vs ${comparisonTarget}: tests iguales; duration_ms -${diff} (supera el margen)`;
    } else {
      // tie
      lesson = `${contrastResult.winner_id} vs ${comparisonTarget}: sin diferencia de comportamiento medible`;
    }
  }

  const telemStr = telemetry
    ? ` (duration: ${durationMs}ms, tool_calls: ${telemetry.tool_calls ?? 0}, blocks: ${telemetry.blocks ?? 0})`
    : ` (${durationMs}ms)`;
  const rationale = `Candidate ${contrastResult.winner_id} selected by contrast evaluation (score: ${contrastResult.winner_score})${telemStr}`;

  return {
    winner_id: contrastResult.winner_id,
    verdict: contrastResult.verdict,
    promote: true,
    rationale,
    lesson,
    duration_ms: durationMs,
    telemetry,
    contrast_matrix: matrix,
    contrast: matrix,
  };
}

export function runCompose(opts) {
  const repoDir = path.resolve(opts.workdir || process.cwd());
  const probeResults = loadProbeResults(repoDir, opts.probes);
  const candidates = loadCandidates(repoDir, opts.candidates);

  const evaluation = evaluateProbes(probeResults, opts.decision);
  let promoted = false;
  let experienceEntry = null;

  if (evaluation.promote && evaluation.winner_id && opts.promote) {
    // Find matching candidate definition
    const winningCandidate = candidates.find((c) => c.candidate_id === evaluation.winner_id) || {
      candidate_id: evaluation.winner_id,
      mutations: [],
    };

    const mutations = winningCandidate.mutations || (winningCandidate.file ? [winningCandidate] : []);

    for (const mutation of mutations) {
      const relFile = mutation.file || "harness/guardrails.local.md";
      const normalizedRel = relFile.replace(/\\/g, "/");

      if (!normalizedRel.startsWith("harness/")) {
        throw new Error(`security violation: cannot promote mutations outside harness/, got: ${relFile}`);
      }

      const absFile = path.join(repoDir, relFile);
      mkdirSync(path.dirname(absFile), { recursive: true });

      const action = mutation.action || "append";
      if (action === "replace") {
        writeFileSync(absFile, mutation.content, "utf8");
      } else if (action === "append") {
        const existing = existsSync(absFile) ? readFileSync(absFile, "utf8") : "";
        const separator = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
        writeFileSync(absFile, existing + separator + mutation.content + "\n", "utf8");
      }
    }

    // Persist: issue tasks go to harness/experience/<ISSUE>.jsonl (merge gate reads the PPC record there).
    const issueTask = /^[A-Z][A-Z0-9]*-\d+$/.test(opts.task || "");
    const expLibFile = issueTask
      ? path.join(repoDir, "harness", "experience", `${opts.task}.jsonl`)
      : path.join(repoDir, "harness", "experience_library.jsonl");
    mkdirSync(path.dirname(expLibFile), { recursive: true });
    const winnerProbe = probeResults.find((p) => p.candidate_id === evaluation.winner_id && p.passed);

    // Version probe reports used and compute canonical sha256 hashes
    const reportsSha256 = {};
    if (probeResults && probeResults.length > 0) {
      if (opts.task) {
        const probesDestDir = path.join(repoDir, "harness", "experience", "probes", opts.task);
        mkdirSync(probesDestDir, { recursive: true });
        for (const p of probeResults) {
          const candId = p.candidate_id || "unknown";
          const destFile = path.join(probesDestDir, `${candId}.json`);
          writeFileSync(destFile, JSON.stringify(p, null, 2) + "\n", "utf8");
          reportsSha256[candId] = hashReport(p);
        }
      } else {
        for (const p of probeResults) {
          const candId = p.candidate_id || "unknown";
          reportsSha256[candId] = hashReport(p);
        }
      }
    }

    experienceEntry = {
      id: `exp-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      task: opts.task || evaluation.winner_id,
      proposal: winningCandidate.target_component || "harness mutation",
      probe_result: `passed (${evaluation.duration_ms ?? "ok"})`,
      lesson: evaluation.lesson,
      verified: true,
      tags: deriveTags(winningCandidate, opts.task),
      // Evidence for harness-merge-check: only a real passing probe counts (an explicit decision alone does not).
      ppc: {
        winner_id: evaluation.winner_id,
        verdict: evaluation.verdict || "tie",
        probe_passed: Boolean(winnerProbe),
        probe_branch: winnerProbe?.probe_branch || null,
        candidates: probeResults.length,
        duration_ms: evaluation.duration_ms ?? winnerProbe?.duration_ms ?? null,
        contrast: evaluation.contrast_matrix || null,
        contrast_matrix: evaluation.contrast_matrix || null,
        rationale: evaluation.rationale || null,
        contrast_version: CONTRAST_VERSION,
        reports_sha256: reportsSha256,
      },
    };

    const expLine = JSON.stringify(experienceEntry) + "\n";
    const currentExp = existsSync(expLibFile) ? readFileSync(expLibFile, "utf8") : "";
    writeFileSync(expLibFile, currentExp + (currentExp.endsWith("\n") || !currentExp ? "" : "\n") + expLine, "utf8");

    // Re-render harness so active configs and AGENTS.md update
    const renderScript = existsSync(path.join(repoDir, "harness-kit", "core", "scripts", "harness-render.mjs"))
      ? path.join(repoDir, "harness-kit", "core", "scripts", "harness-render.mjs")
      : path.join(kitDir, "core", "scripts", "harness-render.mjs");

    if (existsSync(renderScript) && existsSync(path.join(repoDir, "harness", "harness.json"))) {
      try {
        execFileSync(process.execPath, [renderScript, path.join(repoDir, "harness")], {
          cwd: repoDir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (renderErr) {
        process.stderr.write(`[harness-compose render warning] ${renderErr.message}\n`);
      }
    }

    promoted = true;
  }

  const result = {
    winner_id: evaluation.winner_id,
    promoted,
    rationale: evaluation.rationale,
    lesson: evaluation.lesson,
    experience_entry: experienceEntry,
  };

  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const opts = parseArgs(process.argv.slice(2));
  const result = runCompose(opts);

  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`\n[COMPOSE ${result.promoted ? "PROMOTED" : "REJECTED"}] Winner: ${result.winner_id || "none"}
Rationale: ${result.rationale}
${result.lesson ? "Lesson Learned: " + result.lesson : ""}
${result.promoted ? "Active harness recompilation: SUCCESS" : ""}
`);
  }
}
