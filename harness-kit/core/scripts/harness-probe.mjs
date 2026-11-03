#!/usr/bin/env node
// Runs candidate harness probes on isolated ephemeral git branches (Harness² PPC).
//
// Usage:
//   node core/scripts/harness-probe.mjs --candidate <file.json|raw_json> [--probe-cmd "cmd"] [--keep-branch] [--json]
//   node core/scripts/harness-probe.mjs --batch <candidates.json> [--strict-scope] [--json]

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..", "..");

function fail(msg) {
  process.stderr.write(`[harness-probe error] ${msg}\n`);
  process.exit(1);
}

function parseArgs(args) {
  const opts = {
    candidate: "",
    batch: "",
    probeCmd: "",
    keepBranch: false,
    json: false,
    workdir: process.cwd(),
    report: "",
    syntaxOnly: false,
    strictScope: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--candidate" || a === "-c") opts.candidate = args[++i];
    else if (a === "--batch" || a === "-b") opts.batch = args[++i];
    else if (a === "--probe-cmd" || a === "-p") opts.probeCmd = args[++i];
    else if (a === "--keep-branch") opts.keepBranch = true;
    else if (a === "--syntax-only") opts.syntaxOnly = true;
    else if (a === "--strict-scope") opts.strictScope = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--workdir" || a === "-w") opts.workdir = path.resolve(args[++i]);
    else if (a === "--report") opts.report = args[++i];
    else if (a === "--help" || a === "-h") {
      process.stdout.write(`harness-probe — Isolated Ephemeral Branch Probe Runner (Harness²)

Options:
  --candidate, -c <file|json>  Path to candidate JSON file or raw JSON string
  --batch, -b <file|json>      Path to batch candidates JSON array
  --probe-cmd, -p <command>    Command to execute as probe (default: project.json gate)
  --syntax-only                Run universal syntactic pipeline (typecheck + lint + build)
  --strict-scope               Enforce hard reject if mutations touch files outside .harness/scope.json
  --keep-branch                Do not delete ephemeral probe branch upon completion
  --json                       Output structured JSON report to stdout
  --report <path>              Save report to specified path
  --workdir, -w <path>         Git repository working directory (default: cwd)
`);
      process.exit(0);
    }
  }

  if (!opts.candidate && !opts.batch) fail("missing required argument: --candidate <file|json> or --batch <file|json>");
  return opts;
}

function runGit(repoDir, args) {
  try {
    return execFileSync("git", ["-C", repoDir, ...args], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const stderr = err?.stderr?.toString()?.trim() || err?.message || String(err);
    throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
  }
}

function normalizeCandidate(parsed) {
  if (typeof parsed !== "object" || parsed === null) {
    fail("invalid candidate format: expected object");
  }
  if (parsed.mutations && Array.isArray(parsed.mutations)) return parsed;
  return {
    candidate_id: parsed.candidate_id || `candidate-${Date.now().toString(36)}`,
    mutations: [parsed],
    probe_cmd: parsed.probe_cmd,
    strict_scope: parsed.strict_scope,
    telemetry: parsed.telemetry,
  };
}

/** Parses candidate data into an array of normalized candidates */
export function loadCandidates(candidateInput) {
  if (Array.isArray(candidateInput)) {
    return candidateInput.map(normalizeCandidate);
  }
  if (typeof candidateInput === "object" && candidateInput !== null) {
    if (Array.isArray(candidateInput.candidates)) return candidateInput.candidates.map(normalizeCandidate);
    if (candidateInput.mutations && Array.isArray(candidateInput.mutations)) return [candidateInput];
    return [normalizeCandidate(candidateInput)];
  }

  let raw = String(candidateInput).trim();
  if (existsSync(candidateInput)) {
    raw = readFileSync(candidateInput, "utf8").trim();
  }

  // Strip markdown code fences if present
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(`failed to parse candidate JSON: ${err.message}`);
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) fail("candidate array is empty");
    if (parsed.every((item) => item.candidate_id || (item.mutations && Array.isArray(item.mutations)))) {
      return parsed.map(normalizeCandidate);
    }
    return [{
      candidate_id: `candidate-${Date.now().toString(36)}`,
      mutations: parsed,
    }];
  }

  if (typeof parsed === "object" && parsed !== null) {
    if (Array.isArray(parsed.candidates)) return parsed.candidates.map(normalizeCandidate);
    return [normalizeCandidate(parsed)];
  }

  fail("invalid candidate format: expected object or array");
}

export function loadCandidate(candidateInput) {
  const list = loadCandidates(candidateInput);
  return list[0];
}

export function runProbe(opts) {
  const repoDir = path.resolve(opts.workdir || process.cwd());
  const candidate = loadCandidate(opts.candidate);
  const candidateId = candidate.candidate_id || "cand-0";

  // Check git repository
  try {
    runGit(repoDir, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    fail(`not a git repository: ${repoDir}`);
  }

  const originalBranch = runGit(repoDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = runGit(repoDir, ["status", "--porcelain"]);
  let stashed = false;

  if (status.length > 0) {
    try {
      runGit(repoDir, ["stash", "push", "-u", "-m", `harness-probe-auto-${Date.now()}`]);
      stashed = true;
    } catch (e) {
      fail(`working directory has unstaged changes and could not be stashed: ${e.message}`);
    }
  }

  const timestamp = Date.now().toString(36);
  const probeBranch = `probe/${candidateId.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-${timestamp}`;

  // Resolve probe command
  let probeCmd = opts.probeCmd || candidate.probe_cmd;
  if (!probeCmd) {
    const projectJsonPath = path.join(repoDir, "harness", "project.json");
    if (existsSync(projectJsonPath)) {
      try {
        const pj = JSON.parse(readFileSync(projectJsonPath, "utf8"));
        probeCmd = opts.syntaxOnly
          ? (pj.syntax_gate || "npm run typecheck && npm run lint && npm run build")
          : (pj.gate || pj.syntax_gate);
      } catch {}
    }
  }
  if (!probeCmd) {
    probeCmd = opts.syntaxOnly
      ? "npm run typecheck && npm run lint && npm run build"
      : "npm test";
  }

  let probeResult = null;
  let branchCreated = false;

  try {
    // 1. Create and checkout ephemeral branch
    runGit(repoDir, ["checkout", "-b", probeBranch]);
    branchCreated = true;

    // 2. Apply mutations (only allowed inside harness/)
    for (const mutation of candidate.mutations) {
      const relFile = mutation.file || "harness/guardrails.local.md";
      const normalizedRel = relFile.replace(/\\/g, "/");

      // Hard safety check: mutation cannot target files outside harness/ or core/guard/
      if (!normalizedRel.startsWith("harness/")) {
        throw new Error(`security violation: mutations can only target files inside harness/, got: ${relFile}`);
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
      } else {
        throw new Error(`unsupported mutation action: ${action}`);
      }
    }

    // 3. Render new harness on the ephemeral branch
    const renderScript = existsSync(path.join(repoDir, "harness-kit", "core", "scripts", "harness-render.mjs"))
      ? path.join(repoDir, "harness-kit", "core", "scripts", "harness-render.mjs")
      : path.join(kitDir, "core", "scripts", "harness-render.mjs");

    let renderFailed = false;
    let renderError = "";
    if (existsSync(renderScript) && existsSync(path.join(repoDir, "harness", "harness.json"))) {
      try {
        execFileSync(process.execPath, [renderScript, path.join(repoDir, "harness")], {
          cwd: repoDir,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (renderErr) {
        renderFailed = true;
        renderError = renderErr?.stderr?.toString()?.trim() || renderErr?.message || String(renderErr);
      }
    }

    // 3b. Commit mutations on ephemeral branch so switching back cleanly wipes all ephemeral additions
    try {
      runGit(repoDir, ["add", "-A"]);
      runGit(repoDir, ["commit", "--no-verify", "-m", `chore(probe): candidate ${candidateId}`]);
    } catch {}

    if (renderFailed) {
      probeResult = {
        candidate_id: candidateId,
        probe_branch: probeBranch,
        probe_cmd: probeCmd,
        passed: false,
        exit_code: 1,
        duration_ms: 0,
        target_components: candidate.mutations.map((m) => m.target_component || m.file || "harness"),
        timestamp: new Date().toISOString(),
        stdout_preview: "",
        stderr_preview: `harness-render failed: ${renderError}`,
        files_touched: [],
        in_scope_files: [],
        out_of_scope_files: [],
        strict_scope: Boolean(opts.strictScope),
        strict_scope_violation: false,
        branch_kept: Boolean(opts.keepBranch),
      };
    } else {
      // 4. Execute probe command
      const startTime = Date.now();
      const probeExec = spawnSync(probeCmd, {
        cwd: repoDir,
        shell: true,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const durationMs = Date.now() - startTime;

      const stdout = probeExec.stdout || "";
      const stderr = probeExec.stderr || "";
      const exitCode = probeExec.status ?? (probeExec.error ? 1 : 0);

      // Check for telemetry events during probe execution
      let telemetry = candidate.telemetry || null;
      const telemFile = path.join(repoDir, ".harness", "telemetry", "events.jsonl");
      if (existsSync(telemFile)) {
        try {
          const telemLines = readFileSync(telemFile, "utf8").split("\n").filter((l) => l.trim().length > 0);
          let toolCalls = 0;
          let blocks = 0;
          for (const l of telemLines) {
            try {
              const ev = JSON.parse(l);
              if (ev.phase !== "post") toolCalls++;
              if (ev.decision === "block") blocks++;
            } catch {}
          }
          telemetry = { tool_calls: toolCalls, blocks, total_events: telemLines.length };
        } catch {}
      }

      // Compute files touched between original branch and ephemeral probe branch
      let filesTouched = [];
      try {
        const diffOut = runGit(repoDir, ["diff", "--name-only", `${originalBranch}...HEAD`]);
        filesTouched = diffOut.split(/\r?\n/).map((f) => f.trim()).filter(Boolean);
      } catch {
        filesTouched = candidate.mutations.map((m) => m.file || "harness");
      }

      // Check scope against .harness/scope.json or harness/scope.json
      let inScopeFiles = [];
      let outOfScopeFiles = [];
      let strictScope = Boolean(opts.strictScope || candidate.strict_scope);
      const scopeFilePaths = [
        path.join(repoDir, ".harness", "scope.json"),
        path.join(repoDir, "harness", "scope.json"),
      ];
      let activeScope = [];
      for (const sp of scopeFilePaths) {
        if (existsSync(sp)) {
          try {
            const sc = JSON.parse(readFileSync(sp, "utf8"));
            if (Array.isArray(sc.scope)) activeScope = sc.scope;
            if (sc.strict === true) strictScope = true;
            break;
          } catch {}
        }
      }

      if (activeScope.length > 0) {
        for (const ft of filesTouched) {
          const norm = ft.replace(/\\/g, "/");
          if (norm.startsWith("harness/") || norm.startsWith(".harness/")) {
            inScopeFiles.push(ft);
            continue;
          }
          const matches = activeScope.some((s) => {
            const normS = s.replace(/\\/g, "/");
            return norm === normS || norm.startsWith(normS);
          });
          if (matches) inScopeFiles.push(ft);
          else outOfScopeFiles.push(ft);
        }
      } else {
        inScopeFiles = [...filesTouched];
      }

      let passed = exitCode === 0;
      let strictViolation = false;
      if (strictScope && outOfScopeFiles.length > 0) {
        passed = false;
        strictViolation = true;
      }

      probeResult = {
        candidate_id: candidateId,
        probe_branch: probeBranch,
        probe_cmd: probeCmd,
        passed,
        exit_code: exitCode,
        duration_ms: durationMs,
        target_components: candidate.mutations.map((m) => m.target_component || m.file || "harness"),
        timestamp: new Date().toISOString(),
        stdout_preview: stdout.slice(0, 1000),
        stderr_preview: strictViolation
          ? `[DISQUALIFIED] Strict scope violation: modified ${outOfScopeFiles.join(", ")}`
          : stderr.slice(0, 1000),
        files_touched: filesTouched,
        in_scope_files: inScopeFiles,
        out_of_scope_files: outOfScopeFiles,
        strict_scope: strictScope,
        strict_scope_violation: strictViolation,
        telemetry,
        branch_kept: Boolean(opts.keepBranch),
      };
    }
  } finally {
    // 5. Restore original branch and cleanup
    try {
      runGit(repoDir, ["checkout", originalBranch]);
      if (branchCreated && !opts.keepBranch) {
        runGit(repoDir, ["branch", "-D", probeBranch]);
      }
      if (stashed) {
        runGit(repoDir, ["stash", "pop"]);
      }
    } catch (cleanupErr) {
      process.stderr.write(`[harness-probe cleanup warning] ${cleanupErr.message}\n`);
    }
  }

  // 6. Write report
  const reportPath = opts.report || path.join(repoDir, ".harness", "probes", `probe-${candidateId}.json`);
  try {
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(probeResult, null, 2) + "\n", "utf8");
  } catch {}

  return probeResult;
}

export function runProbeBatch(opts) {
  const candidates = loadCandidates(opts.batch || opts.candidate);
  const results = [];
  for (const c of candidates) {
    const singleOpts = {
      ...opts,
      candidate: c,
      json: false,
      report: opts.report && candidates.length === 1 ? opts.report : "",
    };
    const res = runProbe(singleOpts);
    results.push(res);
  }

  if (opts.report && candidates.length > 1) {
    const p = path.resolve(opts.report);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(results, null, 2) + "\n", "utf8");
  }

  return results;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const opts = parseArgs(process.argv.slice(2));
  const isBatch = Boolean(opts.batch) || (opts.candidate && loadCandidates(opts.candidate).length > 1);

  if (isBatch) {
    const results = runProbeBatch(opts);
    if (opts.json) {
      process.stdout.write(JSON.stringify(results, null, 2) + "\n");
    } else {
      process.stdout.write(`\n=== Harness² Batch Probe Summary (${results.length} candidates) ===\n`);
      for (const r of results) {
        const status = r.passed ? "SUCCESS" : "FAILED";
        process.stdout.write(`- [${status}] ${r.candidate_id}: ${r.duration_ms}ms (out-of-scope: ${r.out_of_scope_files?.length || 0})\n`);
      }
    }
    const allPassed = results.every((r) => r.passed);
    process.exit(allPassed ? 0 : 1);
  } else {
    const result = runProbe(opts);
    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      const status = result.passed ? "SUCCESS" : "FAILED";
      process.stdout.write(`\n[PROBE ${status}] Candidate: ${result.candidate_id} (${result.duration_ms}ms)
Branch: ${result.probe_branch} ${result.branch_kept ? "(kept)" : "(cleaned)"}
Command: ${result.probe_cmd} (exit: ${result.exit_code})
${result.passed ? "Probe passed cleanly." : "Probe failed:\n" + (result.stderr_preview || result.stdout_preview || "").slice(0, 300)}
`);
    }
    process.exit(result.passed ? 0 : 1);
  }
}
