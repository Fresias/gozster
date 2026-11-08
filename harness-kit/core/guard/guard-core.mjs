/**
 * guard-core.mjs
 * Core evaluation engine for the harness guard (D6).
 * Single shared implementation used by guard-cli.mjs, guard.sh (shim),
 * and OpenCode plugins.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalize } from "./normalize.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Cache of loaded rules keyed by repoRoot. */
const rulesCache = new Map();

/** Find repository root walking up from a starting directory. */
export function findRepoRoot(startDir = process.cwd()) {
  let curr = path.resolve(startDir);
  while (true) {
    if (
      existsSync(path.join(curr, ".git")) ||
      existsSync(path.join(curr, "harness", "harness.json")) ||
      existsSync(path.join(curr, "package.json"))
    ) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(here, "../../..");
}

/**
 * Load all rule definitions from core, adapters, and local overlay.
 */
export function loadRules(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();
  if (options.rules) return options.rules;
  if (rulesCache.has(repoRoot)) return rulesCache.get(repoRoot);

  const rules = [];

  // 1. Core rules
  const coreRulesPath = path.join(here, "rules.json");
  if (existsSync(coreRulesPath)) {
    try {
      const data = JSON.parse(readFileSync(coreRulesPath, "utf8"));
      if (Array.isArray(data)) rules.push(...data);
    } catch {}
  }

  // 2. Adapter rules
  const adaptersDir = path.resolve(here, "../..", "adapters");
  if (existsSync(adaptersDir)) {
    try {
      for (const entry of readdirSync(adaptersDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const adapterRules = path.join(adaptersDir, entry.name, "rules.json");
          if (existsSync(adapterRules)) {
            const data = JSON.parse(readFileSync(adapterRules, "utf8"));
            if (Array.isArray(data)) rules.push(...data);
          }
        }
      }
    } catch {}
  }

  // 3. Local overlay rules
  const localRulesPath = path.join(repoRoot, "harness", "rules.local.json");
  if (existsSync(localRulesPath)) {
    try {
      const data = JSON.parse(readFileSync(localRulesPath, "utf8"));
      if (Array.isArray(data)) rules.push(...data);
    } catch {}
  }

  rulesCache.set(repoRoot, rules);
  return rules;
}

/** Optional `forbidden_reads` list from harness/project.json (dirs end with "/"). */
function loadForbiddenReads(repoRoot) {
  try {
    const cfg = JSON.parse(readFileSync(path.join(repoRoot, "harness", "project.json"), "utf8"));
    return Array.isArray(cfg.forbidden_reads) ? cfg.forbidden_reads : [];
  } catch {
    return [];
  }
}

/** Check sensitive file path for leaks and bloatware. */
function checkSensitivePath(filePath, repoRoot) {
  if (!filePath) return null;
  const base = path.basename(filePath);

  if (base === "package-lock.json") {
    return {
      allowed: false,
      ruleId: "fs.bloatware",
      reason:
        "Reading package-lock.json is forbidden (huge, low-signal). Use rg/Grep for the specific dependency.",
    };
  }

  if (base.startsWith(".env")) {
    const allowed = [".env.example", ".env.sample", ".env.template"];
    if (!allowed.includes(base)) {
      return {
        allowed: false,
        ruleId: "fs.env-leak",
        reason:
          "Reading env files is forbidden (may contain secrets). Only .env.example/.sample/.template are allowed.",
      };
    }
  }

  const norm = "/" + filePath.replace(/\\/g, "/");
  const forbidden = loadForbiddenReads(repoRoot).some((entry) =>
    entry.endsWith("/") ? norm.includes("/" + entry) : norm.endsWith("/" + entry),
  );
  if (/\.(pem|key)$/i.test(base) || forbidden) {
    return {
      allowed: false,
      ruleId: "read.sensitive",
      reason:
        "Reading key/certificate files (*.pem, *.key) or paths listed in forbidden_reads is forbidden.",
    };
  }

  return null;
}

/** Count lines in a file efficiently. */
function countLines(fullPath) {
  try {
    const stat = statSync(fullPath);
    if (!stat.isFile()) return 0;
    const buf = readFileSync(fullPath);
    let lines = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 10) lines++;
    }
    // If the file doesn't end with a newline but has content, count last line
    if (buf.length > 0 && buf[buf.length - 1] !== 10) lines++;
    return lines;
  } catch {
    return 0;
  }
}

/** Evaluate read requests. */
function evaluateRead(call, options, repoRoot) {
  const sensitive = checkSensitivePath(call.filePath, repoRoot);
  if (sensitive) return sensitive;

  if (call.filePath) {
    const resolved = path.isAbsolute(call.filePath)
      ? call.filePath
      : path.resolve(repoRoot, call.filePath);

    if (existsSync(resolved)) {
      const lines = countLines(resolved);
      if (lines > 300 && !call.isBounded) {
        return {
          allowed: false,
          ruleId: "read.oversize",
          reason:
            "File has >300 lines. To prevent context token waste, search with rg/Grep first or call Read with offset and limit (<=300 lines).",
        };
      }
    }
  }

  return { allowed: true };
}

/** Evaluate read_many requests. */
function evaluateReadMany(call, repoRoot) {
  if (Array.isArray(call.paths)) {
    for (const p of call.paths) {
      const sensitive = checkSensitivePath(p, repoRoot);
      if (sensitive) return sensitive;
    }
  }
  return { allowed: true };
}

/**
 * Lines a `cat`/`head`/`tail` segment would print from a >300-line file, or 0.
 * Covers `-n N`, `-nN`, `--lines=N`, `-N`, `head -n -K` and `tail -n +N`.
 */
function oversizeCatLines(cmd, repoRoot) {
  for (const seg of cmd.split(/[|;&\n]+/)) {
    const tokens = seg.trim().split(/\s+/).map((t) => t.replace(/^["']|["']$/g, ""));
    const bin = tokens[0];
    if (bin !== "cat" && bin !== "head" && bin !== "tail") continue;

    let count = bin === "cat" ? null : "10";
    const files = [];
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i];
      if (/^\d*[<>]/.test(t)) {
        if (/^\d*[<>]+$/.test(t)) i++; // redirection target is not an input
        continue;
      }
      if (bin !== "cat") {
        const m = t.match(/^(?:-n|--lines=?)(.*)$/) || t.match(/^-(\d+)$/);
        if (m) {
          count = m[1] || tokens[++i] || "10";
          continue;
        }
      }
      if (t && !t.startsWith("-")) files.push(t);
    }

    for (const f of files) {
      const lines = countLines(path.isAbsolute(f) ? f : path.resolve(repoRoot, f));
      if (lines <= 300) continue;
      const n = Math.abs(parseInt(count, 10)) || 0;
      let shown;
      if (count === null) shown = lines;
      else if (bin === "head" && count.startsWith("-")) shown = lines - n;
      else if (bin === "tail" && count.startsWith("+")) shown = lines - n + 1;
      else shown = Math.min(n, lines);
      if (shown > 300) return shown;
    }
  }
  return 0;
}

const gitBashWin = "C:\\Program Files\\Git\\bin\\bash.exe";

/** Reuses `harness-gate.sh --verify` (single seal_valid implementation). */
function sealValid(repoRoot) {
  const script = path.join(here, "..", "scripts", "harness-gate.sh").replace(/\\/g, "/");
  const bash = process.platform === "win32" && existsSync(gitBashWin) ? gitBashWin : "bash";
  const res = spawnSync(bash, [script, "--verify"], { cwd: repoRoot, encoding: "utf8" });
  return res.status === 0;
}

/** Current git branch of the repo ("" if unknown). */
function currentBranch(repoRoot) {
  const res = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  return res.status === 0 ? res.stdout.trim() : "";
}

/** Harness mutations are allowed only on an authorized harness branch: <type>/<issue-#>-harness-<slug>. */
export function harnessBranchAuthorized(branch) {
  return /^(feature|fix|chore)\/\d+-harness-/.test(String(branch || ""));
}

/** Protected harness sources (lessons in harness/experience/ stay writable by every agent). */
export function isProtectedHarnessPath(rel) {
  const p = String(rel || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (p.startsWith("harness/experience/")) return false;
  return /^(harness|harness-kit|\.github)\//.test(p);
}

const HARNESS_REF = /(^|[\s"'=(/\\])(harness|harness-kit|\.github)[/\\](?!experience[/\\])/i;
const SHELL_WRITE_VERB =
  /((^|[\s;&|(])(cp|mv|install|dd|truncate|chmod|tee|rm|touch|ln|patch)\s|sed\s+-i|perl\s+-p?i|git\s+(apply|am|checkout\s+\S+\s+--|restore\s+--source)|Set-Content|Add-Content|Out-File|New-Item|Copy-Item|Move-Item|Remove-Item|Rename-Item|Clear-Content|WriteAll(Text|Bytes|Lines)|\[IO\.File\])/i;
const SHELL_REDIRECT_TO_HARNESS = />>?\s*["']?[^\s|&;]*?(harness|harness-kit|\.github)[/\\](?!experience[/\\])/i;
const HARNESS_GENERATORS = /(harness-render\.mjs(?![^;&|]*--check)|harness-compose\.mjs(?![^;&|]*--no-promote)|bootstrap\.mjs)/i;

/** Body text a gh pr create will publish (inline --body or --body-file). */
function prBodyText(cmd, repoRoot) {
  const m = cmd.match(/--body-file[\s=]+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  if (m) {
    const file = m[1] || m[2] || m[3];
    for (const f of [file, path.resolve(repoRoot, file)]) {
      try {
        return readFileSync(f, "utf8");
      } catch {}
    }
    return "";
  }
  return cmd;
}

/** Runs harness-merge-check.mjs for the PR selector; returns "" if mergeable, else the reasons. */
function mergeCheck(selector, repoRoot) {
  const script = path.join(here, "..", "scripts", "harness-merge-check.mjs");
  const args = [script];
  if (selector) args.push(selector);
  const res = spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8" });
  return res.status === 0 ? "" : (res.stderr || res.stdout || "merge check failed").trim();
}

/** Evaluate shell commands. */
function evaluateShell(call, repoRoot) {
  const cmd = call.command || "";
  if (!cmd) return { allowed: true };

  // Multica comment list
  if (/multica\s+issue\s+comment\s+list/i.test(cmd)) {
    if (/--output[\s=]+json/i.test(cmd)) {
      if (
        !/--compact/i.test(cmd) ||
        !/--roots-only|--summary|--thread|--since/i.test(cmd)
      ) {
        return {
          allowed: false,
          ruleId: "multica.comment-bounded",
          reason:
            "multica issue comment list with --output json must be bounded: multica issue comment list <id> --roots-only --summary --compact --output json",
        };
      }
    }
  } else if (/multica\s+issue\s+list/i.test(cmd)) {
    if (/--output[\s=]+json/i.test(cmd)) {
      if (!/--limit[\s=]+[0-9]+/i.test(cmd)) {
        return {
          allowed: false,
          ruleId: "multica.issue-bounded",
          reason:
            "multica issue list with --output json must include --limit <N> (e.g. --limit 15) to avoid dumping the whole backlog.",
        };
      }
    }
  }

  // Multica daemon protection
  if (
    /(^|[^\w])(killall|pkill|taskkill)(\s|$)/i.test(cmd) &&
    /multica(\.exe)?/i.test(cmd)
  ) {
    return {
      allowed: false,
      ruleId: "multica.daemon-protect",
      reason:
        "Terminating multica or multica.exe by process name is forbidden (protects the workspace daemon).",
    };
  }

  // Mass cat package-lock
  if (/(^|[^a-zA-Z0-9_])cat(\s+.*)?package-lock\.json/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "shell.cat-lockfile",
      reason:
        "Do not cat package-lock.json (huge, low-signal). Use rg/Grep for the specific dependency.",
    };
  }

  // Access to .env in shell
  const stripped = cmd.replace(/\.env\.(example|sample|template)/gi, "");
  if (/\.env([^A-Za-z0-9]|$)/.test(stripped)) {
    if (
      /(^|[^a-zA-Z0-9_-])(cat|less|more|head|tail|bat|nl|tac|xxd|od|strings|source|cp|mv|scp|rsync|dd|ln|openssl|type|gc|Get-Content|Copy-Item|Move-Item|Select-String)(\s|$)/i.test(
        cmd
      ) ||
      />\s*[^|&;]*\.env([^A-Za-z0-9]|$)/.test(stripped) ||
      /<\s*[^|&;]*\.env([^A-Za-z0-9]|$)/.test(stripped)
    ) {
      return {
        allowed: false,
        ruleId: "shell.env-leak",
        reason:
          "Access to .env files is forbidden (may contain secrets). Only .env.example/.sample/.template are allowed.",
      };
    }
  }

  // Git force push
  if (/(^|[^a-zA-Z0-9_])git(\s+-C\s+[^\s]+)?\s+.*push/i.test(cmd)) {
    if (
      /--force|--force-with-lease|--mirror|--delete|(^|\s)-f(\s|$)|push\s+.*\+[A-Za-z0-9_./-]/i.test(
        cmd
      )
    ) {
      return {
        allowed: false,
        ruleId: "git.force-push",
        reason:
          "Force/destructive push is forbidden (--force/-f/--mirror/--delete/+ref). Pushing to main is exclusive to @PM.",
      };
    }
  }

  // Git destructive commands
  if (/git(\s+-C\s+[^\s]+)?\s+reset(\s+.*)?--hard/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "git.reset-hard",
      reason:
        "git reset --hard is forbidden (destroys committed/uncommitted work).",
    };
  }
  if (/git(\s+-C\s+[^\s]+)?\s+clean(\s+.*)?-[a-zA-Z]*f/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "git.clean-force",
      reason: "git clean -f is forbidden (deletes untracked files).",
    };
  }
  if (/git\s+checkout\s+--\s+\./i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "git.checkout-all",
      reason:
        "git checkout -- . is forbidden (discards all working-tree changes).",
    };
  }
  if (/git\s+restore\s+(--[a-z]+\s+)*\.(\s|$)/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "git.restore-all",
      reason:
        "git restore . is forbidden (discards all working-tree changes).",
    };
  }
  if (/git\s+branch\s+(-[a-zA-Z]*\s+)*-D/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "git.branch-force-delete",
      reason: "git branch -D is forbidden (force-deletes a branch).",
    };
  }

  // rm -rf
  if (/(^|[^a-zA-Z0-9_])rm(\s|$)/i.test(cmd)) {
    if (
      /(-[a-zA-Z]*r|--recursive)/i.test(cmd) &&
      /(-[a-zA-Z]*f|--force)/i.test(cmd)
    ) {
      return {
        allowed: false,
        ruleId: "shell.rm-rf",
        reason: "Recursive force delete (rm -rf / -r -f / -fr) is forbidden.",
      };
    }
  }

  // PowerShell recursive force delete (Remove-Item/ri/rd/del -Recurse -Force)
  if (
    /(^|[\s;&|(])(Remove-Item|ri|rd|rmdir|del|erase)(\s|$)/i.test(cmd) &&
    /\s-r(ecurse)?\b/i.test(cmd) &&
    /\s-fo(rce)?\b/i.test(cmd)
  ) {
    return {
      allowed: false,
      ruleId: "shell.rm-rf",
      reason: "Recursive force delete (Remove-Item -Recurse -Force) is forbidden.",
    };
  }

  // curl|wget pipe to shell
  if (/(curl|wget)[^|]*\|\s*(sudo\s+)?(sh|bash|zsh)/i.test(cmd)) {
    return {
      allowed: false,
      ruleId: "shell.pipe-to-shell",
      reason: "Piping a downloaded script straight into a shell is forbidden.",
    };
  }

  // sudo (enforced in every runtime, not only Claude's permissions.deny)
  if (/(^|[;&|(`])\s*sudo(\s|$)/.test(cmd)) {
    return {
      allowed: false,
      ruleId: "shell.sudo",
      reason: "sudo is forbidden (privilege escalation).",
    };
  }

  // Unbounded cat/head/tail of a >300-line file
  const shown = oversizeCatLines(cmd, repoRoot);
  if (shown) {
    return {
      allowed: false,
      ruleId: "shell.oversize-cat",
      reason: `This would print ${shown} lines of a >300-line file. Search with rg -n first, then print a bounded range (sed -n 'A,Bp', head/tail -n <=300).`,
    };
  }

  // Writing to harness hooks or runtime settings
  if (/(\.git[/\\]hooks|\.claude[/\\]|\.agents[/\\]|\.gemini[/\\]|\.opencode[/\\])/i.test(cmd)) {
    if (/>>?/.test(cmd) || SHELL_WRITE_VERB.test(cmd)) {
      return {
        allowed: false,
        ruleId: "fs.protected",
        reason:
          "Writing to .git/hooks or .claude/ is forbidden (would tamper with the sandbox).",
      };
    }
  }

  // Harness sources (harness/, harness-kit/, .github/) and generators only on an authorized harness branch
  const touchesHarness =
    HARNESS_GENERATORS.test(cmd) ||
    SHELL_REDIRECT_TO_HARNESS.test(cmd) ||
    (HARNESS_REF.test(cmd) && SHELL_WRITE_VERB.test(cmd));
  if (touchesHarness && !harnessBranchAuthorized(currentBranch(repoRoot))) {
    return {
      allowed: false,
      ruleId: "harness.authorized-only",
      reason:
        "Harness sources (harness/, harness-kit/, .github/, render/compose) change only on an authorized branch <type>/<issue-#>-harness-<slug> created by the PM. Lessons go to harness/experience/ via harness-learn.sh.",
    };
  }

  // gh pr create requires a valid gate seal AND the seal block in the PR body
  if (/(^|[;&|(\s])gh\s+pr\s+create(\s|$)/.test(cmd)) {
    if (!sealValid(repoRoot)) {
      return {
        allowed: false,
        ruleId: "pr.requires-seal",
        reason:
          "No valid gate seal (.harness/complete.json missing or stale for HEAD + diff). Run harness-kit/core/scripts/harness-gate.sh before gh pr create.",
      };
    }
    let fingerprint = "";
    try {
      fingerprint = JSON.parse(readFileSync(path.join(repoRoot, ".harness", "complete.json"), "utf8")).fingerprint || "";
    } catch {}
    const body = prBodyText(cmd, repoRoot);
    if (!fingerprint || !body.includes("harness-seal:") || !body.includes(fingerprint)) {
      return {
        allowed: false,
        ruleId: "pr.requires-seal",
        reason:
          "PR body must contain the seal block: run `bash harness-kit/core/scripts/harness-gate.sh --pr-block` and paste its output into the --body-file.",
      };
    }
  }

  // gh pr merge (or the REST merge endpoint) requires harness-merge-check: seal == PR head, lesson, PPC
  const mergeCmd = cmd.match(/(^|[;&|(\s])gh\s+pr\s+merge((?:\s+[^;&|]*)?)/);
  const apiMerge = cmd.match(/gh\s+api\s+[^;&|]*pulls\/(\d+)\/merge/);
  if (mergeCmd || apiMerge) {
    const selector = apiMerge
      ? apiMerge[1]
      : (mergeCmd[2] || "").trim().split(/\s+/).find((a) => a && !a.startsWith("-")) || "";
    const reasons = mergeCheck(selector, repoRoot);
    if (reasons) {
      return {
        allowed: false,
        ruleId: "pr.merge-check",
        reason: `Merge blocked by harness-merge-check.mjs:\n${reasons}`,
      };
    }
  }

  return { allowed: true };
}

/** Generated artifacts as recorded by harness-render.mjs in harness/harness.lock. */
function generatedArtifacts(repoRoot) {
  try {
    const lock = JSON.parse(readFileSync(path.join(repoRoot, "harness", "harness.lock"), "utf8"));
    return new Set([...Object.keys(lock.artifacts || {}), "harness/harness.lock"]);
  } catch {
    return new Set();
  }
}

/** Evaluate write operations (Write, Edit, replace, etc.). */
function evaluateWrite(call, repoRoot) {
  const target = call.targetPath || "";
  if (!target) return { allowed: true };

  const norm = target.replace(/\\/g, "/");

  // Protect AGENTS.md
  if (norm === "AGENTS.md" || norm.endsWith("/AGENTS.md")) {
    return {
      allowed: false,
      ruleId: "harness.agents-render",
      reason:
        "Editing AGENTS.md directly is forbidden. Edit files under harness/ and run harness-render.mjs to generate AGENTS.md.",
    };
  }

  // Append-only on supabase/migrations/
  if (norm.includes("supabase/migrations/")) {
    const resolved = path.isAbsolute(target)
      ? target
      : path.resolve(repoRoot, target);
    if (existsSync(resolved)) {
      return {
        allowed: false,
        ruleId: "db.append-only",
        reason:
          "Modifying existing migrations in supabase/migrations/ is forbidden (append-only). Create a new migration file instead.",
      };
    }
  }

  const tamper = {
    allowed: false,
    ruleId: "fs.protected",
    reason:
      "Writing to .git/hooks or .claude/ is forbidden (would tamper with the sandbox). Same for .agents/, .gemini/ and .opencode/.",
  };

  // Protect git hooks and Claude settings
  if (norm.includes(".git/hooks/") || norm.includes(".claude/")) return tamper;

  // Generated artifacts (single source: harness.lock written by the render)
  const resolved = path.isAbsolute(target) ? target : path.resolve(repoRoot, target);
  const rel = path.relative(repoRoot, resolved).replace(/\\/g, "/");
  if (generatedArtifacts(repoRoot).has(rel)) {
    return {
      allowed: false,
      ruleId: "write.generated",
      reason: `${rel} is a generated artifact: edit \`harness/\` or \`harness-kit/\` and run render (node harness-kit/core/scripts/harness-render.mjs).`,
    };
  }

  // Protect the remaining runtime harness directories
  if (/(^|\/)\.(agents|gemini|opencode)\//.test(norm)) return tamper;

  // Harness sources: only on an authorized harness branch
  if (isProtectedHarnessPath(rel) && !harnessBranchAuthorized(currentBranch(repoRoot))) {
    return {
      allowed: false,
      ruleId: "harness.authorized-only",
      reason: `${rel} is a protected harness source. It changes only on an authorized branch <type>/<issue-#>-harness-<slug> created by the PM (lessons go to harness/experience/).`,
    };
  }

  return { allowed: true };
}

/** Find noreply email for GH007 command injection. */
function resolveNoreplyEmail(output, repoRoot) {
  const emailRegex = /([0-9]+\+[\w.-]+@users\.noreply\.github\.com|[a-zA-Z0-9_.+-]+@users\.noreply\.github\.com)/;
  const match = String(output || "").match(emailRegex);
  if (match) return match[1];

  const envEmail = process.env.HARNESS_NOREPLY_EMAIL || process.env.NOREPLY_EMAIL;
  if (envEmail) return envEmail;

  if (repoRoot) {
    const memoryPath = path.join(repoRoot, "harness", "LongTermMEMORY.md");
    if (existsSync(memoryPath)) {
      try {
        const mem = readFileSync(memoryPath, "utf8");
        const memMatch = mem.match(emailRegex);
        if (memMatch) return memMatch[1];
      } catch {}
    }
  }

  return "6156087+Fresias@users.noreply.github.com";
}

/**
 * Evaluate result (post-tool) rules.
 */
function evaluatePost(normalizedCall, options = {}, repoRoot = findRepoRoot()) {
  const rules = loadRules({ repoRoot, rules: options.rules });

  // 1. Shell GH007 check
  if (normalizedCall.kind === "shell") {
    const combined = `${normalizedCall.command || ""}\n${normalizedCall.output || ""}`;
    if (/GH007/i.test(combined)) {
      const email = resolveNoreplyEmail(combined, repoRoot);
      return {
        allowed: true,
        inject: true,
        ruleId: "git.gh007-noreply",
        context: `GitHub Push Protection (GH007) violation detected. Configure your noreply email: git config --worktree user.email ${email}`,
      };
    }
  }

  // 2. Write migration check (reminder to run tests/db/)
  if (normalizedCall.kind === "write") {
    const target = normalizedCall.targetPath || normalizedCall.filePath || "";
    if (/(^|[\\/])supabase[\\/]migrations[\\/][^/\\]+\.sql$/i.test(target)) {
      return {
        allowed: true,
        inject: true,
        ruleId: "db.migration-test-reminder",
        context: "New migration detected in supabase/migrations/. Remember to run tests: npx vitest run tests/db/",
      };
    }

    // Warn (never block) on writes outside .harness/scope.json (written by harness-init.sh --scope).
    const scopeFile = path.join(repoRoot, ".harness", "scope.json");
    if (target && existsSync(scopeFile)) {
      let scope = [];
      try {
        scope = JSON.parse(readFileSync(scopeFile, "utf8")).scope ?? [];
      } catch {}
      const rel = path.relative(repoRoot, path.resolve(repoRoot, target)).replace(/\\/g, "/");
      const inScope = scope.some((s) => {
        const prefix = String(s).replace(/\\/g, "/").replace(/\/+$/, "");
        return rel === prefix || rel.startsWith(prefix + "/");
      });
      if (scope.length && !inScope) {
        return {
          allowed: true,
          inject: true,
          ruleId: "post.outside-scope",
          context: `Warning: ${rel} is outside the declared scope in .harness/scope.json (${scope.join(", ")}).`,
        };
      }
    }
  }

  // 3. User-defined post rules from rules.json or rules.local.json
  for (const rule of rules) {
    if (rule.phase !== "post" && rule.phase !== "result") continue;
    if (rule.target && rule.target !== normalizedCall.kind && rule.target !== "all") continue;

    if (rule.minOutputLength && String(normalizedCall.output || "").length > rule.minOutputLength) {
      return {
        allowed: true,
        inject: true,
        ruleId: rule.id,
        context: rule.message || rule.description,
      };
    }

    if (rule.pathPattern) {
      const target = normalizedCall.targetPath || normalizedCall.filePath || "";
      if (new RegExp(rule.pathPattern, "i").test(target)) {
        return {
          allowed: true,
          inject: true,
          ruleId: rule.id,
          context: rule.message || rule.description,
        };
      }
    }

    if (rule.pattern) {
      const text = `${normalizedCall.command || ""}\n${normalizedCall.output || ""}`;
      if (new RegExp(rule.pattern, "i").test(text)) {
        return {
          allowed: true,
          inject: true,
          ruleId: rule.id,
          context: rule.message || rule.description,
        };
      }
    }
  }

  return { allowed: true, inject: false };
}

/**
 * Main evaluation entry point.
 * @param {object} normalizedCall Output of normalize(payload)
 * @param {object} [options]
 * @returns {{ allowed: boolean, reason?: string, ruleId?: string, inject?: boolean, context?: string }}
 */
export function evaluateRules(normalizedCall, options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot();

  if (normalizedCall.phase === "post" || normalizedCall.phase === "result") {
    return evaluatePost(normalizedCall, options, repoRoot);
  }

  switch (normalizedCall.kind) {
    case "shell":
      return evaluateShell(normalizedCall, repoRoot);
    case "read":
      return evaluateRead(normalizedCall, options, repoRoot);
    case "read_many":
      return evaluateReadMany(normalizedCall, repoRoot);
    case "write":
      return evaluateWrite(normalizedCall, repoRoot);
    default:
      return { allowed: true };
  }
}

/**
 * Check guard convenience helper: normalizes raw payload then evaluates rules.
 */
export function checkGuard(rawPayload, options = {}) {
  const normalized = normalize(rawPayload, options);
  return evaluateRules(normalized, options);
}
