#!/usr/bin/env bash
# Setup in one call: git identity, deps, harness status, optional scope.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RENDER_SCRIPT="$SCRIPT_DIR/harness-render.mjs"

SCOPE=""
NAME=""
EMAIL=""
OVERLAY_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --scope)
      SCOPE="${2:-}"
      shift 2 || shift
      ;;
    --scope=*)
      SCOPE="${1#--scope=}"
      shift
      ;;
    --name)
      NAME="${2:-}"
      shift 2 || shift
      ;;
    --name=*)
      NAME="${1#--name=}"
      shift
      ;;
    --email)
      EMAIL="${2:-}"
      shift 2 || shift
      ;;
    --email=*)
      EMAIL="${1#--email=}"
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
    *)
      shift
      ;;
  esac
done

# Enable worktree config extension if git supports it
git config extensions.worktreeConfig true 2>/dev/null || true

# Explicit name/email passed as args
if [ -n "$NAME" ]; then
  git config --worktree user.name "$NAME" 2>/dev/null || git config user.name "$NAME" 2>/dev/null || true
fi

if [ -n "$EMAIL" ]; then
  git config --worktree user.email "$EMAIL" 2>/dev/null || git config user.email "$EMAIL" 2>/dev/null || true
fi

# Ensure user.email in worktree with noreply if applicable
CURRENT_EMAIL="$(git config user.email 2>/dev/null || true)"
WORKTREE_EMAIL="$(git config --worktree user.email 2>/dev/null || true)"

if [ -z "$WORKTREE_EMAIL" ]; then
  NOREPLY_CANDIDATE="${HARNESS_NOREPLY_EMAIL:-${NOREPLY_EMAIL:-}}"
  if [ -z "$NOREPLY_CANDIDATE" ] && [[ "$CURRENT_EMAIL" == *"@users.noreply.github.com"* ]]; then
    NOREPLY_CANDIDATE="$CURRENT_EMAIL"
  fi
  if [ -z "$NOREPLY_CANDIDATE" ]; then
    NOREPLY_CANDIDATE="$(git log -n 10 --format="%ae" 2>/dev/null | grep -m1 "@users\.noreply\.github\.com" || true)"
  fi

  if [ -n "$NOREPLY_CANDIDATE" ]; then
    git config --worktree user.email "$NOREPLY_CANDIDATE" 2>/dev/null || true
  elif [ -n "$CURRENT_EMAIL" ]; then
    git config --worktree user.email "$CURRENT_EMAIL" 2>/dev/null || true
  fi
fi

# Ensure user.name in worktree
CURRENT_NAME="$(git config user.name 2>/dev/null || true)"
WORKTREE_NAME="$(git config --worktree user.name 2>/dev/null || true)"
if [ -z "$WORKTREE_NAME" ] && [ -n "$CURRENT_NAME" ]; then
  git config --worktree user.name "$CURRENT_NAME" 2>/dev/null || true
fi

FINAL_NAME="$(git config user.name 2>/dev/null || echo "unconfigured")"
FINAL_EMAIL="$(git config user.email 2>/dev/null || echo "unconfigured")"

# Check dependencies
DEPS_STATUS="ok"
if [ ! -d "$REPO_ROOT/node_modules" ]; then
  DEPS_STATUS="missing (run npm install or npm ci)"
fi

# Check harness drift
DRIFT_STATUS="ok (no drift)"
if [ -f "$RENDER_SCRIPT" ] && [ -f "${OVERLAY_DIR:-$REPO_ROOT/harness}/harness.json" ]; then
  RENDER_ARGS=(--check)
  if [ -n "$OVERLAY_DIR" ]; then
    RENDER_ARGS+=( "$OVERLAY_DIR" )
  fi
  if ! node "$RENDER_SCRIPT" "${RENDER_ARGS[@]}" >/dev/null 2>&1; then
    DRIFT_STATUS="drift detected (run harness-render.mjs)"
  fi
fi

# Claude Code loads .claude/settings.json only when the session starts in the repo: the user-level
# dispatcher keeps the guard active from any workdir (install once per machine).
GUARD_STATUS="n/a"
USER_HOOK="$(cd "$(dirname "$RENDER_SCRIPT")/../plugins/claude-code" 2>/dev/null && pwd)/install.mjs"
if [ -f "$USER_HOOK" ]; then
  if node "$USER_HOOK" --check >/dev/null 2>&1; then
    GUARD_STATUS="installed"
  else
    GUARD_STATUS="MISSING - guard inactive outside the repo (run: node harness-kit/core/plugins/claude-code/install.mjs)"
  fi
fi

# Handle optional scope
SCOPE_STATUS=""
if [ -n "$SCOPE" ]; then
  mkdir -p "$REPO_ROOT/.harness"
  node -e '
    const fs = require("fs");
    const raw = process.argv[1];
    const dest = process.argv[2];
    const items = raw.split(",").map(s => s.trim()).filter(Boolean);
    fs.writeFileSync(dest, JSON.stringify({ scope: items }, null, 2) + "\n", "utf8");
  ' "$SCOPE" "$REPO_ROOT/.harness/scope.json"
  SCOPE_STATUS="$SCOPE"
fi

echo "=== harness-init ==="
echo "git identity: $FINAL_NAME <$FINAL_EMAIL>"
echo "dependencies: $DEPS_STATUS"
echo "harness drift: $DRIFT_STATUS"
echo "claude user guard: $GUARD_STATUS"
if [ -n "$SCOPE_STATUS" ]; then
  echo "scope: $SCOPE_STATUS (.harness/scope.json)"
fi
echo "status: ready"
