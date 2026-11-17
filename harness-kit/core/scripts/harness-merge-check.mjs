#!/usr/bin/env node
// Merge gate: PR seal == PR head, issue lesson in the PR, PPC + label for harness changes.
//
// Usage:
//   node harness-kit/core/scripts/harness-merge-check.mjs <pr-number|url|branch> [--json] [--post-status]
//   --post-status is for CI only: branch protection requires the status from the GitHub Actions app.
//   node harness-kit/core/scripts/harness-merge-check.mjs --pr-json <file> [--lesson-file <file>] [--json]
//
// The guard runs this before `gh pr merge`. Exit 0 = mergeable, exit 1 = blocked.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCandidates, hashReport } from "./harness-contrast.mjs";
import { evaluateProbes } from "./harness-compose.mjs";

/** Paths whose change is a harness mutation (needs PPC + authorization). */
export function isHarnessPath(rel) {
  const p = String(rel).replace(/\\/g, "/");
  if (p.startsWith("harness/experience/")) return false;
  return /^(harness|harness-kit|\.github|\.claude|\.agents|\.gemini|\.opencode)\//.test(p) || /^(AGENTS|CLAUDE)\.md$/.test(p);
}

/** Issue id from a branch `<type>/<n>-slug` and the project prefix. */
export function issueFromBranch(branch, prefix) {
  const m = String(branch || "").match(/^[a-z]+\/(\d+)-/);
  return m && prefix ? `${prefix}-${m[1]}` : "";
}

/** Seal block written by `harness-gate.sh --pr-block`. */
export function parseSealBlock(body) {
  const m = String(body || "").match(/<!--\s*harness-seal:\s*(\{[\s\S]*?\})\s*-->/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function parseLessons(text) {
  return String(text || "")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    });
}

function parseJsonArrays(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // gh api --paginate concatenates JSON arrays across pages: [...][...]
    const items = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let start = -1;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === "\"") inString = false;
        continue;
      }
      if (ch === "\"") {
        inString = true;
      } else if (ch === "[") {
        if (depth === 0) start = i;
        depth++;
      } else if (ch === "]") {
        depth--;
        if (depth === 0 && start >= 0) {
          const chunk = JSON.parse(trimmed.slice(start, i + 1));
          if (Array.isArray(chunk)) items.push(...chunk);
          start = -1;
        }
      }
    }
    if (depth !== 0 || start >= 0) throw new SyntaxError("Malformed paginated JSON array");
    return items;
  }
}

/** Parse NDJSON or GitHub issue events JSON into sorted { event, label, actor, created_at } entries. */
export function parseEventsText(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return [];
  const rawEvents = trimmed.startsWith("[")
    ? parseJsonArrays(trimmed)
    : trimmed
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => JSON.parse(l));

  return rawEvents
    .map((e) => ({
      event: e?.event || "",
      label: typeof e?.label === "string" ? e.label : e?.label?.name || "",
      actor: typeof e?.actor === "string" ? e.actor : e?.actor?.login || "",
      created_at: e?.created_at || "",
    }))
    .filter((e) => (e.event === "labeled" || e.event === "unlabeled") && e.label === "harness-authorized")
    .sort((a, b) => {
      const ta = Date.parse(a.created_at);
      const tb = Date.parse(b.created_at);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      return String(a.created_at).localeCompare(String(b.created_at));
    });
}

/**
 * Verify that `harness-authorized` was applied by `authorizers.owner` (fail-closed).
 * Only the owner may authorize; agent accounts (e.g. AgentsMultica) are rejected.
 */
export function evaluateAuthorization({ events, labels, authorizers }) {
  const warnings = [];
  const owner = authorizers && typeof authorizers.owner === "string" ? authorizers.owner.trim() : "";
  if (!owner) {
    return {
      authorized: false,
      by: null,
      delegated_by: null,
      error: "authz: project.json has no authorizers.owner",
      warnings,
    };
  }

  const normalizedLabels = (labels || [])
    .map((l) => (typeof l === "string" ? l : l?.name))
    .filter(Boolean);
  if (!normalizedLabels.includes("harness-authorized")) {
    return {
      authorized: false,
      by: null,
      delegated_by: null,
      error: `authz: missing label harness-authorized (only @${owner} can authorize)`,
      warnings,
    };
  }

  const relevant = [...(events || [])]
    .filter((e) => e && e.label === "harness-authorized" && (e.event === "labeled" || e.event === "unlabeled"))
    .sort((a, b) => {
      const ta = Date.parse(a.created_at);
      const tb = Date.parse(b.created_at);
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });

  let activeActor = null;
  for (const ev of relevant) {
    if (ev.event === "labeled") {
      activeActor = ev.actor ? String(ev.actor).trim() : null;
    } else if (ev.event === "unlabeled") {
      activeActor = null;
    }
  }

  if (!activeActor) {
    return {
      authorized: false,
      by: null,
      delegated_by: null,
      error: "authz: no labeled event found",
      warnings,
    };
  }

  if (activeActor.toLowerCase() === owner.toLowerCase()) {
    return {
      authorized: true,
      by: activeActor,
      delegated_by: null,
      error: null,
      warnings,
    };
  }

  return {
    authorized: false,
    by: null,
    delegated_by: null,
    error: `authz: harness-authorized added by @${activeActor}, not an authorizer`,
    warnings,
  };
}

const VALID_CONTRAST_V2_VERDICTS = new Set(["behavioral", "duration", "tie"]);

// Corte histórico inmutable cubierto por R11 (PRs mergeados con contraste 1.0.0 antes de contrast_version 2.0.0).
// No determinar legacy por ausencia de `verdict` ni confiando en `timestamp` auto-declarado en el JSONL.
const LEGACY_R11_V1_RECORDS = Object.freeze({
  "GOZS-521": Object.freeze({
    id: "exp-mwfxvwtq",
    reports_sha256: Object.freeze({
      baseline: "283e94732d5c3b8e2ad438a06e36227d1f2d7da0a936f0783364fd1d689e691f",
      "c1-ppc-verifiable": "87b1689b268cb4ac4ba270267e5363e893e8df86e113d6323dfc93d0984f528b",
    }),
  }),
  "GOZS-522": Object.freeze({
    id: "exp-mwg1b2o1",
    reports_sha256: Object.freeze({
      baseline: "d79aa4ad24cd312bc4b9c47183a14f977f83ae9cbd00c5159dd19d5c1419999e",
      "c1-guard-bot-noreply": "3c66c7113afe011f9c140077b2fa5a1f41943ba6ce2adb88c14a80e536c5fb65",
    }),
  }),
  "GOZS-524": Object.freeze({
    id: "exp-mwgaqzey",
    reports_sha256: Object.freeze({
      baseline: "ebbbc91744994b51c4fd6af9a72e25e54a1d305093c25a375540de8b2fe7ed2e",
      "c1-guard-git-protection": "4a447821d9f6158f75aedc1aeedf47ed8a6d35b0953e9eef4d0e1a213213b676",
    }),
  }),
  "GOZS-525": Object.freeze({
    id: "exp-mwgeg5od",
    reports_sha256: Object.freeze({
      baseline: "0499ff3ce0c2b0df0c2139a898c2c6b6b8743bf4946230566e1cf84093cb8e11",
      "c1-exp-lib-filter": "878d83e9144900c4751de97600f5ed11803b52ebc652a3aaccb3ff24651a1404",
    }),
  }),
  "GOZS-529": Object.freeze({
    id: "exp-mwgnyg8x",
    reports_sha256: Object.freeze({
      baseline: "068208b47e043da61fc7a1fef03cf15b3b6374a99240f02949088c87cbc2080f",
      "c1-harness-ci-debt": "83d7dea81643f0dfe35f42dfcdd112413a205b2a2b6611263a14399caf80e03a",
    }),
  }),
});

function isLegacyR11Record(issue, ppcEntry) {
  if (!issue || !Object.prototype.hasOwnProperty.call(LEGACY_R11_V1_RECORDS, issue)) return false;
  const spec = LEGACY_R11_V1_RECORDS[issue];
  const ppc = ppcEntry?.ppc;
  if (!ppc || ppcEntry.id !== spec.id) return false;
  if (ppc.contrast_version !== "1.0.0" || ppc.verdict) return false;
  const hashes = ppc.reports_sha256;
  if (!hashes || typeof hashes !== "object") return false;
  const expectedKeys = Object.keys(spec.reports_sha256);
  const actualKeys = Object.keys(hashes);
  if (actualKeys.length !== expectedKeys.length) return false;
  return expectedKeys.every((k) => hashes[k] === spec.reports_sha256[k]);
}

/**
 * Pure evaluation. pr: { headRefName, headRefOid, body, files:[{path}], labels:[{name}] }.
 * lessonText: content of harness/experience/<ISSUE>.jsonl at the PR head (or null).
 * probeReports: optional array of probe report objects.
 * events: optional sorted array of label events for `harness-authorized`.
 */
export function evaluateMerge({ pr, project, lessonText, probeReports, events }) {
  const errors = [];
  const files = (pr.files || []).map((f) => f.path);
  const labels = (pr.labels || []).map((l) => (typeof l === "string" ? l : l.name));
  const issue = issueFromBranch(pr.headRefName, project.issue_prefix);
  let authorized_by = null;
  let delegated_by = null;

  // 1. Seal: produced by harness-gate.sh on exactly the PR head commit.
  const seal = parseSealBlock(pr.body);
  if (!seal) errors.push("seal: PR body has no `<!-- harness-seal: {...} -->` block (paste `harness-gate.sh --pr-block`).");
  else {
    if (seal.head !== pr.headRefOid) errors.push(`seal: head ${String(seal.head).slice(0, 7)} != PR head ${String(pr.headRefOid).slice(0, 7)} (re-run harness-gate.sh on the final commit).`);
    if (seal.worktree_clean !== true) errors.push("seal: gate ran on a dirty worktree.");
    if (project.gate && seal.gate !== project.gate) errors.push("seal: gate command differs from harness/project.json.");
  }

  // 2. Learner: the lesson travels inside the PR (merge == learned).
  const lessonPath = issue ? `harness/experience/${issue}.jsonl` : "";
  let lessons = [];
  if (!issue) errors.push(`learn: branch "${pr.headRefName}" has no <type>/<issue-#>-slug (or project.json has no issue_prefix).`);
  else if (!files.includes(lessonPath)) errors.push(`learn: PR does not add/update ${lessonPath} (run harness-learn.sh --lesson "...").`);
  else {
    lessons = parseLessons(lessonText).filter(Boolean).filter((e) => e.task === issue && e.lesson);
    if (lessons.length === 0) errors.push(`learn: ${lessonPath} has no valid lesson for ${issue}.`);
  }

  // 3. Harness mutations: explicit authorization + Propose-Probe-Compose evidence.
  const harnessFiles = files.filter(isHarnessPath);
  if (harnessFiles.length > 0) {
    if (!/^[a-z]+\/\d+-harness-/.test(pr.headRefName || "")) errors.push(`harness: ${harnessFiles.length} protected file(s) changed on a non-harness branch (${harnessFiles.slice(0, 3).join(", ")}).`);
    const authz = evaluateAuthorization({
      events: events || [],
      labels,
      authorizers: project?.authorizers,
    });
    if (!authz.authorized) {
      errors.push(authz.error);
    } else {
      authorized_by = authz.by;
      delegated_by = authz.delegated_by;
    }
    const ppcEntry = lessons.find((e) => e.ppc && e.ppc.winner_id && e.ppc.probe_passed === true);
    if (!ppcEntry) {
      errors.push("ppc: no Propose-Probe-Compose record (harness-compose.mjs --task <ISSUE> after harness-probe.mjs).");
    } else {
      const ppc = ppcEntry.ppc;
      if (Number(ppc.candidates ?? 0) < 2) {
        errors.push(`ppc: candidates count must be >= 2 for contrast evaluation (found ${ppc.candidates ?? 1}).`);
      }
      const recordedMatrix = ppc.contrast_matrix || ppc.contrast;
      if (!recordedMatrix || (Array.isArray(recordedMatrix) && recordedMatrix.length === 0)) {
        errors.push("ppc: missing contrast matrix (must include contrast verification from harness-contrast).");
      }

      const reportsSha256 = ppc.reports_sha256;
      if (!reportsSha256 || typeof reportsSha256 !== "object" || Object.keys(reportsSha256).length === 0) {
        errors.push(`ppc: missing reports_sha256 in PPC record for ${issue}.`);
      }

      const reports = Array.isArray(probeReports) ? probeReports : [];
      if (reports.length === 0) {
        errors.push(`ppc: missing probe reports in harness/experience/probes/${issue}/ (found 0 reports).`);
      } else {
        if (reportsSha256 && typeof reportsSha256 === "object") {
          for (const r of reports) {
            const candId = r.candidate_id || "unknown";
            const expectedHash = reportsSha256[candId];
            if (!expectedHash) {
              errors.push(`ppc: report ${candId} not found in reports_sha256.`);
            } else {
              const actualHash = hashReport(r);
              if (actualHash !== expectedHash) {
                errors.push(`ppc: sha256 mismatch for report ${candId}: expected ${expectedHash}, got ${actualHash}`);
              }
            }
          }
          for (const candId of Object.keys(reportsSha256)) {
            if (!reports.some((r) => r.candidate_id === candId)) {
              errors.push(`ppc: missing probe report for candidate ${candId} listed in reports_sha256.`);
            }
          }
        }

        const isLegacyRecord = isLegacyR11Record(issue, ppcEntry);
        const rawContrastVersion = ppc.contrast_version;
        const contrastVersion =
          rawContrastVersion === "1.0.0" || rawContrastVersion === "2.0.0"
            ? rawContrastVersion
            : isLegacyRecord
              ? "1.0.0"
              : "2.0.0";

        if (rawContrastVersion && rawContrastVersion !== "2.0.0" && rawContrastVersion !== "1.0.0") {
          errors.push(`ppc: contrast_version desconocido: ${rawContrastVersion}`);
        }

        if (!isLegacyRecord) {
          if (!rawContrastVersion) {
            errors.push("ppc: PRs nuevos deben usar contrast_version 2.0.0 (encontrado ausente).");
          } else if (rawContrastVersion === "1.0.0") {
            errors.push(`ppc: PRs nuevos deben usar contrast_version 2.0.0 (encontrado ${rawContrastVersion}).`);
          }
          const verdict = typeof ppc.verdict === "string" ? ppc.verdict.trim() : "";
          if (!verdict) {
            errors.push("ppc: PRs nuevos requieren verdict (contrast_version 2.0.0).");
          } else if (!VALID_CONTRAST_V2_VERDICTS.has(verdict)) {
            errors.push(`ppc: verdict inválido "${verdict}" (esperado behavioral, duration o tie).`);
          }
        }

        // Recalcular evaluateCandidates con la versión correspondiente
        const recalculated = evaluateCandidates(reports, { version: contrastVersion });
        if (recalculated.winner_id !== ppc.winner_id) {
          errors.push(`ppc: winner_id mismatch: expected ${recalculated.winner_id}, got ${ppc.winner_id}`);
        }
        if (
          !isLegacyRecord &&
          contrastVersion === "2.0.0" &&
          typeof ppc.verdict === "string" &&
          ppc.verdict.trim() &&
          recalculated.verdict &&
          ppc.verdict.trim() !== recalculated.verdict
        ) {
          errors.push(`ppc: verdict mismatch: expected ${recalculated.verdict}, got ${ppc.verdict.trim()}`);
        }
        if (!isLegacyRecord && contrastVersion !== "2.0.0") {
          const v2Check = evaluateCandidates(reports, { version: "2.0.0" });
          if (v2Check.winner_id !== ppc.winner_id) {
            errors.push(`ppc: bajo reglas v2 el ganador esperado es ${v2Check.winner_id}, pero se registró ${ppc.winner_id}`);
          }
        }

        // Exigir que la matriz (candidate_id, score, passed, fixed) coincida exactamente con el registro
        if (Array.isArray(recordedMatrix)) {
          for (const item of recalculated.contrast_matrix) {
            const recorded = recordedMatrix.find((m) => m.candidate_id === item.candidate_id);
            if (!recorded) {
              errors.push(`ppc: contrast_matrix missing candidate ${item.candidate_id}`);
            } else {
              if (recorded.score !== item.score) {
                errors.push(`ppc: contrast score mismatch for ${item.candidate_id}: expected ${item.score}, got ${recorded.score}`);
              }
              if (Boolean(recorded.passed) !== Boolean(item.passed)) {
                errors.push(`ppc: contrast passed mismatch for ${item.candidate_id}: expected ${item.passed}, got ${recorded.passed}`);
              }
              if (contrastVersion === "2.0.0" && item.fixed !== undefined) {
                if (recorded.fixed !== item.fixed) {
                  errors.push(`ppc: contrast fixed mismatch for ${item.candidate_id}: expected ${item.fixed}, got ${recorded.fixed}`);
                }
              }
            }
          }
        }

        // Exigir que la lesson del registro sea idéntica a la que produce evaluateProbes para esos reportes
        const evaluatedProbes = evaluateProbes(reports, null, { version: contrastVersion });
        if (ppcEntry.lesson !== evaluatedProbes.lesson) {
          errors.push(`ppc: lesson mismatch: expected "${evaluatedProbes.lesson}", got "${ppcEntry.lesson}"`);
        }
      }
    }
  }

  return { mergeable: errors.length === 0, issue, harness_files: harnessFiles, authorized_by, delegated_by, errors };
}

function gh(args) {
  const opts = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  // Windows: gh may be a .cmd/.bat shim that execFile cannot spawn without a shell.
  if (process.platform === "win32") return execFileSync(`gh ${args.map((a) => `"${a}"`).join(" ")}`, { ...opts, shell: true });
  return execFileSync("gh", args, opts);
}

const VALUE_FLAGS = new Set(["--pr-json", "--lesson-file", "--events-file", "--event-action", "--probes-dir", "--probes-file"]);

function findSelector(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.has(a)) {
      i++;
      continue;
    }
    if (!a.startsWith("--")) return a;
  }
  return undefined;
}

export function main(argv, deps = {}) {
  const runGh = deps.runGh || gh;
  const json = argv.includes("--json");
  const val = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : "";
  };
  let root;
  try {
    root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  } catch {
    root = process.cwd();
  }
  const project = JSON.parse(readFileSync(path.join(root, "harness", "project.json"), "utf8"));

  if (argv.includes("--local")) {
    let branch = "";
    try {
      branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    } catch {}
    const issue = issueFromBranch(branch, project.issue_prefix);

    let baseRef = "origin/main";
    try {
      execFileSync("git", ["rev-parse", "--verify", baseRef], { cwd: root, stdio: "ignore" });
    } catch {
      baseRef = "main";
    }

    let diffFiles = [];
    try {
      const diff1 = execFileSync("git", ["diff", "--name-only", `${baseRef}...HEAD`], { cwd: root, encoding: "utf8" });
      const diff2 = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
      const diff3 = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" });
      diffFiles = [...new Set((diff1 + "\n" + diff2 + "\n" + diff3).split("\n").map((f) => f.trim()).filter(Boolean))];
    } catch {
      diffFiles = [];
    }

    const harnessFiles = diffFiles.filter(isHarnessPath);
    if (harnessFiles.length === 0 || !issue) {
      process.exit(0);
    }

    if (!/^[a-z]+\/\d+-harness-/.test(branch)) {
      process.stderr.write(`[harness-gate error] ${harnessFiles.length} protected harness file(s) changed on a non-harness branch: ${branch}\n`);
      process.exit(1);
    }

    const lessonPath = path.join(root, "harness", "experience", `${issue}.jsonl`);
    if (!existsSync(lessonPath)) {
      process.stderr.write(`[harness-gate error] Missing lesson file: ${lessonPath}\n`);
      process.exit(1);
    }
    const localLessonText = readFileSync(lessonPath, "utf8");

    const probesDir = path.join(root, "harness", "experience", "probes", issue);
    let localProbeReports = [];
    if (existsSync(probesDir)) {
      localProbeReports = readdirSync(probesDir).filter((f) => f.endsWith(".json")).map((f) => {
        try { return JSON.parse(readFileSync(path.join(probesDir, f), "utf8")); } catch { return null; }
      }).filter(Boolean);
    }

    const mockPr = {
      headRefName: branch,
      headRefOid: "HEAD",
      body: "<!-- harness-seal: {} -->",
      files: diffFiles.map((p) => ({ path: p })),
      labels: [{ name: "harness-authorized" }],
    };

    const evalResult = evaluateMerge({ pr: mockPr, project, lessonText: localLessonText, probeReports: localProbeReports });
    const ppcErrors = evalResult.errors.filter(
      (e) => !e.startsWith("seal:") && !e.startsWith("harness: missing label") && !e.startsWith("authz:")
    );
    if (ppcErrors.length > 0) {
      process.stderr.write(`[harness-gate error] Harness PPC verification failed:\n- ${ppcErrors.join("\n- ")}\n`);
      process.exit(1);
    }

    process.stdout.write(`[harness-gate] Harness PPC verified for ${issue} (${localProbeReports.length} probes recalculated).\n`);
    process.exit(0);
  }

  let pr;
  let lessonText = null;
  const selector = findSelector(argv);
  const prJsonPath = val("--pr-json");
  if (prJsonPath) {
    pr = JSON.parse(readFileSync(prJsonPath, "utf8"));
    if (val("--lesson-file") && existsSync(val("--lesson-file"))) lessonText = readFileSync(val("--lesson-file"), "utf8");
  } else {
    if (!selector) {
      process.stderr.write("usage: harness-merge-check.mjs <pr> [--json]\n");
      process.exit(2);
    }
    pr = JSON.parse(runGh(["pr", "view", selector, "--json", "number,headRefName,headRefOid,body,files,labels"]));
    const issue = issueFromBranch(pr.headRefName, project.issue_prefix);
    if (issue) {
      try {
        lessonText = runGh(["api", "-H", "Accept: application/vnd.github.raw", `repos/{owner}/{repo}/contents/harness/experience/${issue}.jsonl?ref=${pr.headRefOid}`]);
      } catch {
        lessonText = null;
      }
    }
  }

  let probeReports = [];
  if (val("--probes-dir")) {
    const dir = path.resolve(val("--probes-dir"));
    if (existsSync(dir)) {
      probeReports = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => {
        try { return JSON.parse(readFileSync(path.join(dir, f), "utf8")); } catch { return null; }
      }).filter(Boolean);
    }
  } else if (val("--probes-file")) {
    const file = path.resolve(val("--probes-file"));
    if (existsSync(file)) {
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8"));
        probeReports = Array.isArray(parsed) ? parsed : [parsed];
      } catch {}
    }
  } else {
    const issue = issueFromBranch(pr.headRefName, project.issue_prefix);
    if (issue) {
      const localProbesDir = path.join(root, "harness", "experience", "probes", issue);
      if (existsSync(localProbesDir)) {
        probeReports = readdirSync(localProbesDir).filter((f) => f.endsWith(".json")).map((f) => {
          try { return JSON.parse(readFileSync(path.join(localProbesDir, f), "utf8")); } catch { return null; }
        }).filter(Boolean);
      }
      if (probeReports.length === 0 && pr && pr.files) {
        const probeFiles = (pr.files || []).filter((f) => {
          const p = f.path.replace(/\\/g, "/");
          return p.startsWith(`harness/experience/probes/${issue}/`) && p.endsWith(".json");
        });
        for (const pf of probeFiles) {
          let content = null;
          if (pr.headRefOid) {
            try {
              content = execFileSync("git", ["show", `${pr.headRefOid}:${pf.path}`], { cwd: root, encoding: "utf8" });
            } catch {}
          }
          if (!content) {
            try {
              content = runGh(["api", "-H", "Accept: application/vnd.github.raw", `repos/{owner}/{repo}/contents/${pf.path}?ref=${pr.headRefOid}`]);
            } catch {}
          }
          if (content) {
            try {
              probeReports.push(JSON.parse(content));
            } catch {}
          }
        }
      }
    }
  }

  const harnessFiles = (pr.files || []).map((f) => f.path).filter(isHarnessPath);
  const hasAuthorizedLabel = (pr.labels || []).some((l) => (typeof l === "string" ? l : l?.name) === "harness-authorized");
  const eventAction = val("--event-action");
  const prNumber = pr.number || (/^\d+$/.test(String(selector || "")) ? Number(selector) : null);

  let revokeError = null;
  let revokedOnSync = false;
  if (eventAction === "synchronize" && harnessFiles.length > 0 && hasAuthorizedLabel) {
    try {
      if (!prNumber) throw new Error("missing PR number");
      runGh(["api", "-X", "DELETE", `repos/{owner}/{repo}/issues/${prNumber}/labels/harness-authorized`]);
      process.stdout.write("[harness-merge-check] harness-authorized revoked: new commits require re-authorization\n");
      pr = {
        ...pr,
        labels: (pr.labels || []).filter((l) => (typeof l === "string" ? l : l?.name) !== "harness-authorized"),
      };
      revokedOnSync = true;
    } catch {
      revokeError = "authz: could not revoke stale authorization";
    }
  }

  let events = [];
  const eventsFile = val("--events-file");
  if (eventsFile) {
    try {
      events = parseEventsText(readFileSync(eventsFile, "utf8"));
    } catch (err) {
      process.stderr.write(`[harness-merge-check] could not read events file: ${String(err.message || err).split("\n")[0]}\n`);
      process.exit(1);
    }
  } else if (!prJsonPath && harnessFiles.length > 0 && !revokeError && !revokedOnSync) {
    try {
      if (!prNumber) throw new Error("missing PR number");
      const rawEvents = runGh(["api", "--paginate", `repos/{owner}/{repo}/issues/${prNumber}/events?per_page=100`]);
      events = parseEventsText(rawEvents);
    } catch (err) {
      process.stderr.write(`[harness-merge-check] could not fetch PR events: ${String(err.message || err).split("\n")[0]}\n`);
      process.exit(1);
    }
  }

  const result = evaluateMerge({ pr, project, lessonText, probeReports, events });
  if (revokeError) {
    result.mergeable = false;
    result.authorized_by = null;
    result.delegated_by = null;
    result.errors = [revokeError, ...result.errors.filter((e) => !e.startsWith("authz:"))];
  }

  // Commit status on the PR head: visible evidence, and a required check once branch protection exists.
  if (argv.includes("--post-status") && pr.headRefOid) {
    const state = result.mergeable ? "success" : "failure";
    const okMsg = result.authorized_by
      ? `seal, lesson, PPC verified; authorized by @${result.authorized_by}`
      : "seal, lesson and PPC verified";
    const description = (result.mergeable ? okMsg : result.errors[0] || "blocked").slice(0, 140);
    try {
      runGh(["api", "-X", "POST", `repos/{owner}/{repo}/statuses/${pr.headRefOid}`, "-f", `state=${state}`, "-f", "context=harness/merge-check", "-f", `description=${description}`]);
    } catch (err) {
      process.stderr.write(`[harness-merge-check] could not post status: ${String(err.message || err).split("\n")[0]}\n`);
    }
  }
  if (json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else if (result.mergeable) process.stdout.write(`[harness-merge-check OK] ${result.issue}: seal, lesson${result.harness_files.length ? `, PPC and authorization (authorized by @${result.authorized_by})` : ""} verified.\n`);
  else process.stderr.write(`[harness-merge-check BLOCKED]\n- ${result.errors.join("\n- ")}\n`);
  process.exit(result.mergeable ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
