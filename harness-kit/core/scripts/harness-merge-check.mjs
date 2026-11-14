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

/**
 * Pure evaluation. pr: { headRefName, headRefOid, body, files:[{path}], labels:[{name}] }.
 * lessonText: content of harness/experience/<ISSUE>.jsonl at the PR head (or null).
 * probeReports: optional array of probe report objects.
 */
export function evaluateMerge({ pr, project, lessonText, probeReports }) {
  const errors = [];
  const files = (pr.files || []).map((f) => f.path);
  const labels = (pr.labels || []).map((l) => l.name);
  const issue = issueFromBranch(pr.headRefName, project.issue_prefix);

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
    if (!labels.includes("harness-authorized")) errors.push("harness: missing label `harness-authorized` (PM/Gabriel authorization).");
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

        const contrastVersion = ppc.contrast_version || "1.0.0";
        if (contrastVersion !== "2.0.0" && contrastVersion !== "1.0.0") {
          errors.push(`ppc: contrast_version desconocido: ${contrastVersion}`);
        }

        // Los PRs nuevos tienen que usar 2.0.0. La implementación 1.0.0 se conserva solo para poder verificar registros existentes (como GOZS-522)
        const issueNum = issue ? parseInt(issue.replace(/\D/g, ""), 10) : 0;
        const isLegacyIssue = issue === "GOZS-522" || (issueNum > 0 && issueNum < 526);
        if (!isLegacyIssue && contrastVersion !== "2.0.0") {
          errors.push(`ppc: PRs nuevos deben usar contrast_version 2.0.0 (encontrado ${contrastVersion}).`);
        }

        // Recalcular evaluateCandidates con la versión correspondiente
        const recalculated = evaluateCandidates(reports, { version: contrastVersion });
        if (recalculated.winner_id !== ppc.winner_id) {
          errors.push(`ppc: winner_id mismatch: expected ${recalculated.winner_id}, got ${ppc.winner_id}`);
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

  return { mergeable: errors.length === 0, issue, harness_files: harnessFiles, errors };
}

function gh(args) {
  const opts = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  // Windows: gh may be a .cmd/.bat shim that execFile cannot spawn without a shell.
  if (process.platform === "win32") return execFileSync(`gh ${args.map((a) => `"${a}"`).join(" ")}`, { ...opts, shell: true });
  return execFileSync("gh", args, opts);
}

function main(argv) {
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
    const ppcErrors = evalResult.errors.filter((e) => !e.startsWith("seal:") && !e.startsWith("harness: missing label"));
    if (ppcErrors.length > 0) {
      process.stderr.write(`[harness-gate error] Harness PPC verification failed:\n- ${ppcErrors.join("\n- ")}\n`);
      process.exit(1);
    }

    process.stdout.write(`[harness-gate] Harness PPC verified for ${issue} (${localProbeReports.length} probes recalculated).\n`);
    process.exit(0);
  }

  let pr;
  let lessonText = null;
  if (val("--pr-json")) {
    pr = JSON.parse(readFileSync(val("--pr-json"), "utf8"));
    if (val("--lesson-file") && existsSync(val("--lesson-file"))) lessonText = readFileSync(val("--lesson-file"), "utf8");
  } else {
    const selector = argv.find((a) => !a.startsWith("--"));
    if (!selector) {
      process.stderr.write("usage: harness-merge-check.mjs <pr> [--json]\n");
      process.exit(2);
    }
    pr = JSON.parse(gh(["pr", "view", selector, "--json", "headRefName,headRefOid,body,files,labels"]));
    const issue = issueFromBranch(pr.headRefName, project.issue_prefix);
    if (issue) {
      try {
        lessonText = gh(["api", "-H", "Accept: application/vnd.github.raw", `repos/{owner}/{repo}/contents/harness/experience/${issue}.jsonl?ref=${pr.headRefOid}`]);
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
              content = gh(["api", "-H", "Accept: application/vnd.github.raw", `repos/{owner}/{repo}/contents/${pf.path}?ref=${pr.headRefOid}`]);
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

  const result = evaluateMerge({ pr, project, lessonText, probeReports });
  // Commit status on the PR head: visible evidence, and a required check once branch protection exists.
  if (argv.includes("--post-status") && pr.headRefOid) {
    const state = result.mergeable ? "success" : "failure";
    const description = (result.mergeable ? "seal, lesson and PPC verified" : result.errors[0] || "blocked").slice(0, 140);
    try {
      gh(["api", "-X", "POST", `repos/{owner}/{repo}/statuses/${pr.headRefOid}`, "-f", `state=${state}`, "-f", "context=harness/merge-check", "-f", `description=${description}`]);
    } catch (err) {
      process.stderr.write(`[harness-merge-check] could not post status: ${String(err.message || err).split("\n")[0]}\n`);
    }
  }
  if (json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  else if (result.mergeable) process.stdout.write(`[harness-merge-check OK] ${result.issue}: seal, lesson${result.harness_files.length ? ", PPC and authorization" : ""} verified.\n`);
  else process.stderr.write(`[harness-merge-check BLOCKED]\n- ${result.errors.join("\n- ")}\n`);
  process.exit(result.mergeable ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2));
}
