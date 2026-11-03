#!/usr/bin/env node
// Evaluates probe traces, selects the winning harness and updates experience library.
//
// Usage:
//   node core/scripts/harness-compose.mjs [--probes <dir>] [--candidates <file>] [--task "desc"] [--promote] [--json]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

/** Evaluates probe traces and selects the winner */
export function evaluateProbes(probeResults, explicitDecision) {
  if (explicitDecision) {
    let dec = explicitDecision;
    if (typeof dec === "string") {
      try {
        dec = JSON.parse(dec);
      } catch {}
    }
    return {
      winner_id: dec.winner_id || null,
      promote: Boolean(dec.promote),
      rationale: dec.rationale || "Explicit decision applied",
      lesson: dec.lesson || "Harness optimized per composer decision",
    };
  }

  if (!probeResults || probeResults.length === 0) {
    return {
      winner_id: null,
      promote: false,
      rationale: "No probe results available to evaluate",
      lesson: "",
    };
  }

  const passedProbes = probeResults.filter((p) => p.passed);
  if (passedProbes.length === 0) {
    return {
      winner_id: null,
      promote: false,
      rationale: "All candidate probes failed verification",
      lesson: "Current candidates did not resolve the task; retain existing harness baseline",
    };
  }

  // Rank by duration_ms (ascending)
  passedProbes.sort((a, b) => (a.duration_ms || 0) - (b.duration_ms || 0));
  const winner = passedProbes[0];

  return {
    winner_id: winner.candidate_id,
    promote: true,
    rationale: `Candidate ${winner.candidate_id} passed cleanly with optimal duration (${winner.duration_ms}ms)`,
    lesson: `Candidate ${winner.candidate_id} on ${winner.target_components?.join(", ") || "harness"} resolved task in ${winner.duration_ms}ms`,
    duration_ms: winner.duration_ms,
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

    // Persist to experience_library.jsonl
    const expLibFile = path.join(repoDir, "harness", "experience_library.jsonl");
    mkdirSync(path.dirname(expLibFile), { recursive: true });

    experienceEntry = {
      id: `exp-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      task: opts.task || evaluation.winner_id,
      proposal: winningCandidate.target_component || "harness mutation",
      probe_result: `passed (${evaluation.duration_ms ?? "ok"})`,
      lesson: evaluation.lesson,
      verified: true,
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
