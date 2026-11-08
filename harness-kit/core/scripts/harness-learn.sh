#!/usr/bin/env bash
# Learner: persists the issue lesson to harness/experience/<ISSUE>.jsonl (runs on the PR branch; gate and merge require it).
#
# Usage:
#   harness-kit/core/scripts/harness-learn.sh --lesson "text" [--issue PROJ-123] [--tags "t1,t2"]
#       [--commit <sha>] [--pr <n>] [--phase pre-merge|post-merge] [--overlay <path>] [--dry-run]
#
# - The issue comes from --issue, else from the branch <type>/<n>-slug + project.json issue_prefix.
# - One file per issue: parallel PRs never conflict, AGENTS.md is not re-rendered.
# - Idempotent: the same lesson text for the same issue is recorded only once.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

ISSUE=""
LESSON=""
TAGS=""
OVERLAY_DIR=""
DRY_RUN=false
COMMIT_REF=""
PR=""
PHASE="pre-merge"

while [ $# -gt 0 ]; do
  case "$1" in
    --issue|--task) ISSUE="${2:-}"; shift 2 || shift ;;
    --issue=*|--task=*) ISSUE="${1#*=}"; shift ;;
    --lesson) LESSON="${2:-}"; shift 2 || shift ;;
    --lesson=*) LESSON="${1#--lesson=}"; shift ;;
    --tags) TAGS="${2:-}"; shift 2 || shift ;;
    --tags=*) TAGS="${1#--tags=}"; shift ;;
    --commit) COMMIT_REF="${2:-}"; shift 2 || shift ;;
    --commit=*) COMMIT_REF="${1#--commit=}"; shift ;;
    --pr) PR="${2:-}"; shift 2 || shift ;;
    --pr=*) PR="${1#--pr=}"; shift ;;
    --phase) PHASE="${2:-pre-merge}"; shift 2 || shift ;;
    --phase=*) PHASE="${1#--phase=}"; shift ;;
    --overlay) OVERLAY_DIR="${2:-}"; shift 2 || shift ;;
    --overlay=*) OVERLAY_DIR="${1#--overlay=}"; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) shift ;;
  esac
done

if [ -z "$OVERLAY_DIR" ]; then
  OVERLAY_DIR="$REPO_ROOT/harness"
fi
REF="${COMMIT_REF:-HEAD}"

# 1. Resolve the issue id
if [ -z "$ISSUE" ]; then
  PREFIX="$(node -e 'try{process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).issue_prefix||"")}catch{}' "$OVERLAY_DIR/project.json")"
  BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  NUM="$(printf '%s' "$BRANCH" | sed -n -E 's#^[a-z]+/([0-9]+)-.*#\1#p')"
  if [ -n "$PREFIX" ] && [ -n "$NUM" ]; then
    ISSUE="$PREFIX-$NUM"
  else
    ISSUE="$(git -C "$REPO_ROOT" log -1 --pretty=%B "$REF" 2>/dev/null | grep -o -E '[A-Z]+-[0-9]+' | head -n 1 || true)"
  fi
fi
if ! printf '%s' "$ISSUE" | grep -qE '^[A-Z][A-Z0-9]*-[0-9]+$'; then
  echo "ERROR: cannot resolve the issue id (got '$ISSUE'). Use --issue <PREFIX-N> or a <type>/<n>-slug branch." >&2
  exit 1
fi

# 2. Lesson text is mandatory: a lesson is what the next agent must know, not the commit subject.
if [ -z "$LESSON" ]; then
  echo "ERROR: --lesson \"...\" is required (what worked, what failed, what to repeat or avoid)." >&2
  exit 1
fi

# 3. Derive tags from touched files if not provided
if [ -z "$TAGS" ]; then
  if [ -n "$COMMIT_REF" ]; then
    TOUCHED="$(git -C "$REPO_ROOT" diff-tree --no-commit-id --name-only -r "$COMMIT_REF" 2>/dev/null || echo "")"
  else
    BASE="$(git -C "$REPO_ROOT" merge-base HEAD origin/main 2>/dev/null || echo "")"
    TOUCHED="$( { [ -n "$BASE" ] && git -C "$REPO_ROOT" diff --name-only "$BASE" HEAD; git -C "$REPO_ROOT" diff --name-only HEAD; } 2>/dev/null || echo "")"
  fi
  DERIVED_TAGS=()
  echo "$TOUCHED" | grep -q "supabase/migrations" && DERIVED_TAGS+=("db")
  echo "$TOUCHED" | grep -qE "studio|coach|dashboard" && DERIVED_TAGS+=("studio" "ui")
  echo "$TOUCHED" | grep -qE "athlete|pwa" && DERIVED_TAGS+=("athlete")
  echo "$TOUCHED" | grep -q "auth" && DERIVED_TAGS+=("auth")
  echo "$TOUCHED" | grep -qE "tests|spec" && DERIVED_TAGS+=("qa")
  echo "$TOUCHED" | grep -qE "^harness|harness-kit" && DERIVED_TAGS+=("harness")
  [ ${#DERIVED_TAGS[@]} -eq 0 ] && DERIVED_TAGS+=("general")
  TAGS="$(IFS=,; echo "${DERIVED_TAGS[*]}")"
fi

SHA=""
if [ -n "$COMMIT_REF" ]; then
  SHA="$(git -C "$REPO_ROOT" rev-parse "$COMMIT_REF" 2>/dev/null || echo "")"
fi
EXP_FILE="$OVERLAY_DIR/experience/$ISSUE.jsonl"

if [ "$DRY_RUN" = true ]; then
  echo "[harness-learn DRY-RUN]"
  echo "Issue: $ISSUE"
  echo "Lesson: $LESSON"
  echo "Tags: $TAGS"
  echo "Target: $EXP_FILE"
  exit 0
fi

# 4. Append (idempotent) via node: UTF-8 without BOM, LF.
node -e '
const fs = require("node:fs");
const path = require("node:path");
const [file, issue, lesson, tags, phase, sha, pr] = process.argv.slice(1);
const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()) : [];
const entries = lines.map((l) => JSON.parse(l));
if (entries.some((e) => e.task === issue && e.lesson === lesson)) {
  console.log(`[harness-learn OK] Lesson already recorded for ${issue} (idempotent).`);
  process.exit(0);
}
const entry = {
  id: `exp-${issue.toLowerCase()}-${entries.length + 1}`,
  timestamp: new Date().toISOString(),
  task: issue,
  proposal: phase === "post-merge" ? "post-merge" : "pre-merge",
  probe_result: phase === "post-merge" ? "merged" : "gate-sealed-pr",
  lesson,
  verified: true,
  tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
};
if (sha) entry.commit = sha;
if (pr) entry.pr = Number(pr);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.appendFileSync(file, JSON.stringify(entry) + "\n", "utf8");
console.log(`[harness-learn OK] Recorded lesson for ${issue} in harness/experience/${issue}.jsonl`);
' "$EXP_FILE" "$ISSUE" "$LESSON" "$TAGS" "$PHASE" "$SHA" "$PR"
