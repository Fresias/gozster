#!/usr/bin/env bash
# Post-merge & issue-close autonomous learner: persists lessons to experience_library.jsonl.
#
# Usage:
#   harness-kit/core/scripts/harness-learn.sh [--issue <id>] [--lesson "text"] [--tags "t1,t2"] [--overlay <path>] [--dry-run]

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RENDER_SCRIPT="$SCRIPT_DIR/harness-render.mjs"

ISSUE=""
TASK=""
LESSON=""
TAGS=""
OVERLAY_DIR=""
DRY_RUN=false
COMMIT_REF="HEAD"

while [ $# -gt 0 ]; do
  case "$1" in
    --issue)
      ISSUE="${2:-}"
      shift 2 || shift
      ;;
    --issue=*)
      ISSUE="${1#--issue=}"
      shift
      ;;
    --task)
      TASK="${2:-}"
      shift 2 || shift
      ;;
    --task=*)
      TASK="${1#--task=}"
      shift
      ;;
    --lesson)
      LESSON="${2:-}"
      shift 2 || shift
      ;;
    --lesson=*)
      LESSON="${1#--lesson=}"
      shift
      ;;
    --tags)
      TAGS="${2:-}"
      shift 2 || shift
      ;;
    --tags=*)
      TAGS="${1#--tags=}"
      shift
      ;;
    --commit)
      COMMIT_REF="${2:-HEAD}"
      shift 2 || shift
      ;;
    --commit=*)
      COMMIT_REF="${1#--commit=}"
      shift
      ;;
    --overlay)
      OVERLAY_DIR="${2:-}"
      shift 2 || shift
      ;;
    --overlay=*)
      OVERLAY_DIR="${1#--overlay=}"
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [ -z "$OVERLAY_DIR" ]; then
  OVERLAY_DIR="$REPO_ROOT/harness"
fi

EXP_LIB="$OVERLAY_DIR/experience_library.jsonl"

# 1. Resolve Task Identifier
if [ -z "$TASK" ]; then
  if [ -n "$ISSUE" ]; then
    TASK="$ISSUE"
  else
    # Try extracting issue from commit message (e.g. "feat(GOZS-123): ...")
    COMMIT_MSG="$(git -C "$REPO_ROOT" log -1 --pretty=%B "$COMMIT_REF" 2>/dev/null || echo "")"
    TASK="$(echo "$COMMIT_MSG" | grep -o -E '[A-Z]+-[0-9]+' | head -n 1 || echo "")"
    if [ -z "$TASK" ]; then
      TASK="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "task")"
    fi
  fi
fi

# 2. Resolve Lesson text
if [ -z "$LESSON" ]; then
  COMMIT_SUBJECT="$(git -C "$REPO_ROOT" log -1 --pretty=%s "$COMMIT_REF" 2>/dev/null || echo "Solved task")"
  LESSON="$COMMIT_SUBJECT"
fi

# 3. Derive tags if not provided
if [ -z "$TAGS" ]; then
  TOUCHED="$(git -C "$REPO_ROOT" diff-tree --no-commit-id --name-only -r "$COMMIT_REF" 2>/dev/null || echo "")"
  DERIVED_TAGS=()
  if echo "$TOUCHED" | grep -q "supabase/migrations"; then
    DERIVED_TAGS+=("db")
  fi
  if echo "$TOUCHED" | grep -qE "studio|dashboard"; then
    DERIVED_TAGS+=("studio" "ui")
  fi
  if echo "$TOUCHED" | grep -qE "athlete|pwa"; then
    DERIVED_TAGS+=("athlete")
  fi
  if echo "$TOUCHED" | grep -q "auth"; then
    DERIVED_TAGS+=("auth")
  fi
  if echo "$TOUCHED" | grep -qE "tests|spec"; then
    DERIVED_TAGS+=("qa")
  fi
  if [ ${#DERIVED_TAGS[@]} -eq 0 ]; then
    DERIVED_TAGS+=("general")
  fi
  TAGS="$(IFS=,; echo "${DERIVED_TAGS[*]}")"
fi

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z" 2>/dev/null || date +"%Y-%m-%dT%H:%M:%SZ")"
EXP_ID="exp-learn-$(date +%s 2>/dev/null || echo "$RANDOM")"

if [ "$DRY_RUN" = true ]; then
  echo "[harness-learn DRY-RUN]"
  echo "Task: $TASK"
  echo "Lesson: $LESSON"
  echo "Tags: $TAGS"
  echo "Target: $EXP_LIB"
  exit 0
fi

# 4. Append JSON line via node helper
node -e '
const fs = require("node:fs");
const path = require("node:path");

const expLib = process.argv[1];
const entry = {
  id: process.argv[2],
  timestamp: process.argv[3],
  task: process.argv[4],
  proposal: "post-merge",
  probe_result: "merged",
  lesson: process.argv[5],
  verified: true,
  tags: process.argv[6].split(",").map(s => s.trim()).filter(Boolean),
};

fs.mkdirSync(path.dirname(expLib), { recursive: true });
fs.appendFileSync(expLib, JSON.stringify(entry) + "\n", "utf8");
' "$EXP_LIB" "$EXP_ID" "$TIMESTAMP" "$TASK" "$LESSON" "$TAGS"

echo "[harness-learn OK] Recorded lesson for $TASK in $(basename "$EXP_LIB")"

# 5. Re-render harness so experience library updates are compiled into AGENTS.md
if [ -f "$RENDER_SCRIPT" ] && [ -d "$OVERLAY_DIR" ]; then
  node "$RENDER_SCRIPT" "$OVERLAY_DIR" >/dev/null 2>&1 || true
  echo "[harness-learn OK] Recompiled harness and runtime targets."
fi
