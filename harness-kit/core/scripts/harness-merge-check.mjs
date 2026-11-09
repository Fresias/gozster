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
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
 */
export function evaluateMerge({ pr, project, lessonText }) {
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
    const ppc = lessons.find((e) => e.ppc && e.ppc.winner_id && e.ppc.probe_passed === true);
    if (!ppc) errors.push("ppc: no Propose-Probe-Compose record (harness-compose.mjs --task <ISSUE> after harness-probe.mjs).");
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

  const result = evaluateMerge({ pr, project, lessonText });
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
