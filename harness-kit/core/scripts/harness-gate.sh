#!/usr/bin/env bash
# Full gate: append-only check, project gate commands, writes .harness/complete.json.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
RENDER_SCRIPT="$SCRIPT_DIR/harness-render.mjs"

BASE_REF="${HARNESS_BASE_REF:-origin/main}"
OVERLAY_DIR=""
VERIFY_ONLY=false

while [ $# -gt 0 ]; do
  case "$1" in
    --verify|--verify-seal|--check-seal)
      VERIFY_ONLY=true
      shift
      ;;
    --base)
      BASE_REF="${2:-}"
      shift 2 || shift
      ;;
    --base=*)
      BASE_REF="${1#--base=}"
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

if [ -z "$OVERLAY_DIR" ]; then
  OVERLAY_DIR="$REPO_ROOT/harness"
fi
PROJECT_JSON="$OVERLAY_DIR/project.json"
COMPLETE_JSON="$REPO_ROOT/.harness/complete.json"

# Mode: Verify existing seal
if [ "$VERIFY_ONLY" = true ]; then
  node -e '
    const fs = require("fs");
    const path = require("path");
    const crypto = require("crypto");
    const { execSync } = require("child_process");

    const repoRoot = process.argv[1];
    const sealPath = process.argv[2];

    if (!fs.existsSync(sealPath)) {
      process.stdout.write(JSON.stringify({ seal_valid: false, reason: "missing complete.json" }) + "\n");
      process.exit(1);
    }

    let seal;
    try {
      seal = JSON.parse(fs.readFileSync(sealPath, "utf8"));
    } catch {
      process.stdout.write(JSON.stringify({ seal_valid: false, reason: "corrupted complete.json" }) + "\n");
      process.exit(1);
    }

    let head = "0000000000000000000000000000000000000000";
    try {
      head = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
    } catch {}

    let diff = "";
    try {
      diff = execSync("git diff HEAD", { cwd: repoRoot, encoding: "utf8" });
    } catch {}

    let status = "";
    try {
      status = execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf8" });
    } catch {}

    const combinedDiff = diff + status;
    const payload = `${head}\n${combinedDiff}\n${seal.gate}`;
    const currentFingerprint = crypto.createHash("sha1").update(payload, "utf8").digest("hex").slice(0, 16);

    const isValid = (currentFingerprint === seal.fingerprint);
    process.stdout.write(JSON.stringify({
      seal_valid: isValid,
      fingerprint: seal.fingerprint,
      current: currentFingerprint
    }) + "\n");

    if (!isValid) {
      process.exit(1);
    }
  ' "$REPO_ROOT" "$COMPLETE_JSON"
  exit $?
fi

# 1. Check append-only migrations in supabase/migrations/
RESOLVED_BASE=""
if git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  RESOLVED_BASE="$BASE_REF"
elif git rev-parse --verify "origin/main" >/dev/null 2>&1; then
  RESOLVED_BASE="origin/main"
elif git rev-parse --verify "main" >/dev/null 2>&1; then
  RESOLVED_BASE="main"
elif git rev-parse --verify "HEAD~1" >/dev/null 2>&1; then
  RESOLVED_BASE="HEAD~1"
fi

COMMITTED_MIGRATION_CHANGES=""
if [ -n "$RESOLVED_BASE" ]; then
  COMMITTED_MIGRATION_CHANGES="$(git diff --name-status "$RESOLVED_BASE...HEAD" -- supabase/migrations/ 2>/dev/null || true)"
fi

WORKING_MIGRATION_CHANGES="$(git diff --name-status HEAD -- supabase/migrations/ 2>/dev/null || true)"

ALTERED_MIGRATIONS="$(printf '%s\n%s' "$COMMITTED_MIGRATION_CHANGES" "$WORKING_MIGRATION_CHANGES" | grep -v '^[[:space:]]*$' | grep -E '^[MDR]' | sort -u || true)"

if [ -n "$ALTERED_MIGRATIONS" ]; then
  echo "ERROR: Migrations are strictly append-only! The following migration(s) were modified or deleted:" >&2
  echo "$ALTERED_MIGRATIONS" >&2
  exit 1
fi

# 2. Check harness drift
if [ -f "$RENDER_SCRIPT" ] && [ -f "$OVERLAY_DIR/harness.json" ]; then
  echo "[harness-gate] Verifying harness drift..."
  RENDER_ARGS=(--check)
  if [ -n "$OVERLAY_DIR" ]; then
    RENDER_ARGS+=( "$OVERLAY_DIR" )
  fi
  if ! node "$RENDER_SCRIPT" "${RENDER_ARGS[@]}"; then
    echo "ERROR: Harness drift detected! Run harness-render.mjs to re-sync runtime artifacts." >&2
    exit 1
  fi
fi

# 3. Read and execute gate commands configured in project.json
if [ ! -f "$PROJECT_JSON" ]; then
  echo "ERROR: project.json not found at $PROJECT_JSON" >&2
  exit 1
fi

GATE_CMD="$(node -e '
  const fs = require("fs");
  try {
    const cfg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(cfg.gate || "");
  } catch (e) {
    process.exit(1);
  }
' "$PROJECT_JSON")"

if [ -z "$GATE_CMD" ]; then
  echo "ERROR: Missing gate command in $PROJECT_JSON" >&2
  exit 1
fi

echo "[harness-gate] Executing project gate: $GATE_CMD"
# Execute sequentially, cutting on first failure
eval "$GATE_CMD"

# 4. Generate and write seal to .harness/complete.json
mkdir -p "$REPO_ROOT/.harness"

KIT_VERSION="2.0.0"
if [ -f "$KIT_DIR/VERSION" ]; then
  KIT_VERSION="$(tr -d ' \r\n' < "$KIT_DIR/VERSION")"
fi

node -e '
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");
  const { execSync } = require("child_process");

  const repoRoot = process.argv[1];
  const kitVersion = process.argv[2];
  const gateCmd = process.argv[3];
  const destFile = process.argv[4];

  let head = "0000000000000000000000000000000000000000";
  try {
    head = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {}

  let diff = "";
  try {
    diff = execSync("git diff HEAD", { cwd: repoRoot, encoding: "utf8" });
  } catch {}

  let status = "";
  try {
    status = execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf8" });
  } catch {}

  const combinedDiff = diff + status;
  const isClean = status.trim().length === 0;

  const payload = `${head}\n${combinedDiff}\n${gateCmd}`;
  const fingerprint = crypto.createHash("sha1").update(payload, "utf8").digest("hex").slice(0, 16);

  const seal = {
    kit_version: kitVersion,
    head: head,
    worktree_clean: isClean,
    fingerprint: fingerprint,
    gate: gateCmd,
    passed_at: new Date().toISOString()
  };

  fs.writeFileSync(destFile, JSON.stringify(seal, null, 2) + "\n", "utf8");
  console.log(`[harness-gate] Sello generado exitosamente en .harness/complete.json (fingerprint: ${fingerprint})`);
' "$REPO_ROOT" "$KIT_VERSION" "$GATE_CMD" "$COMPLETE_JSON"
