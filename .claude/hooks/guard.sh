#!/usr/bin/env bash
# .claude/hooks/guard.sh
# Pre-tool guard for GOZSter — anti-destruction + anti-token-waste.
# One script shared by every runtime in the workspace:
#
#   Claude Code  (.claude/settings.json PreToolUse)   bash .claude/hooks/guard.sh
#   Gemini CLI   (.gemini/settings.json BeforeTool)   bash .claude/hooks/guard.sh --runtime gemini-cli
#   Antigravity  (.agents/hooks.json PreToolUse)      bash .claude/hooks/guard.sh --runtime antigravity
#
# Reads the hook JSON from stdin and normalizes the three payload schemas:
#   Claude Code  tool_name Bash|Read, tool_input.{command,file_path,limit}
#   Gemini CLI   tool_name run_shell_command|read_file|read_many_files,
#                tool_input.{command,file_path|absolute_path,limit,paths}
#   Antigravity  toolCall.name run_command|view_file,
#                toolCall.args.{CommandLine,AbsolutePath,StartLine,EndLine}
#
# Output contract:
#   Antigravity (--runtime antigravity, or `toolCall` present in the input)
#     allow -> stdout {"decision":"allow"}                 exit 0
#     block -> stdout {"decision":"deny","reason":"..."}   exit 0
#   Claude Code / Gemini CLI
#     allow -> stdout {}                                   exit 0
#     block -> reason on stderr                            exit 2
#
# Node.js is always present in this Next.js project, so it is the primary JSON
# reader, with jq and python3 as fallbacks.

set -u

RUNTIME=""
while [ $# -gt 0 ]; do
  case "$1" in
    --runtime) RUNTIME="${2:-}"; shift 2 || shift ;;
    --runtime=*) RUNTIME="${1#--runtime=}"; shift ;;
    *) shift ;;
  esac
done

INPUT="$(cat)"

# JSON field extractor (arrays are joined with newlines).
# Usage: json_get tool_input.command
json_get() {
  local keypath="$1"
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$INPUT" | node -e '
      let d = "";
      process.stdin.on("data", c => (d += c)).on("end", () => {
        try {
          let v = JSON.parse(d);
          for (const k of process.argv[1].split(".")) v = (v == null) ? undefined : v[k];
          process.stdout.write(v == null ? "" : Array.isArray(v) ? v.join("\n") : String(v));
        } catch (e) {}
      });
    ' "$keypath"
  elif command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r --arg kp "$keypath" '
      ($kp | split(".")) as $ks
      | reduce $ks[] as $k (.; if . == null then null else .[$k] end)
      | if . == null then "" elif type == "array" then join("\n") elif type == "object" then "" else . end'
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$INPUT" | python3 -c '
import sys, json
try:
    o = json.load(sys.stdin)
    for k in sys.argv[1].split("."):
        o = o.get(k) if isinstance(o, dict) else None
    if isinstance(o, list):
        o = "\n".join(str(x) for x in o)
    sys.stdout.write("" if o is None else str(o))
except Exception:
    pass' "$keypath"
  fi
}

# Antigravity is selected by flag or detected from its payload shape.
AG_TOOL="$(json_get toolCall.name)"
if [ -n "$AG_TOOL" ] && [ -z "$RUNTIME" ]; then
  RUNTIME="antigravity"
fi

allow() {
  if [ "$RUNTIME" = "antigravity" ]; then
    printf '{"decision":"allow"}\n'
  else
    printf '{}\n'
  fi
  exit 0
}

block() {
  local reason="Blocked by .claude/hooks/guard.sh: $1"
  if [ "$RUNTIME" = "antigravity" ]; then
    local escaped
    escaped="$(printf '%s' "$reason" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
    printf '{"decision":"deny","reason":"%s"}\n' "$escaped"
    exit 0
  fi
  echo "$reason" >&2
  exit 2
}

has() { printf '%s' "$1" | grep -Eq -- "$2"; }
is_int() { printf '%s' "$1" | grep -Eq '^[0-9]+$'; }

# ---- Normalize: KIND (shell|read|read_many), CMD, FILE, LIMIT, PATHS ----
KIND=""; CMD=""; FILE=""; LIMIT=""; PATHS=""
if [ -n "$AG_TOOL" ]; then
  case "$AG_TOOL" in
    run_command)
      KIND="shell"; CMD="$(json_get toolCall.args.CommandLine)" ;;
    view_file)
      KIND="read"; FILE="$(json_get toolCall.args.AbsolutePath)"
      START="$(json_get toolCall.args.StartLine)"
      END="$(json_get toolCall.args.EndLine)"
      # Bounded when EndLine is set: span = EndLine-StartLine+1, or EndLine alone.
      if is_int "$END"; then
        if is_int "$START"; then LIMIT=$((END - START + 1)); else LIMIT="$END"; fi
      fi
      ;;
  esac
else
  TOOL="$(json_get tool_name)"
  case "$TOOL" in
    Bash|run_shell_command)
      KIND="shell"; CMD="$(json_get tool_input.command)" ;;
    Read|read_file)
      KIND="read"
      FILE="$(json_get tool_input.file_path)"
      [ -z "$FILE" ] && FILE="$(json_get tool_input.absolute_path)"
      LIMIT="$(json_get tool_input.limit)"
      ;;
    read_many_files)
      KIND="read_many"; PATHS="$(json_get tool_input.paths)" ;;
  esac
fi

# Secret / lockfile checks shared by every read flavour.
check_sensitive_path() {
  local base
  base="$(basename -- "$1")"

  # package-lock.json: huge and low-signal.
  if [ "$base" = "package-lock.json" ]; then
    block "Reading package-lock.json is forbidden (huge, low-signal). Use rg/Grep for the specific dependency."
  fi

  # .env secrets: only example/sample/template are allowed.
  case "$base" in
    .env.example|.env.sample|.env.template) : ;;
    .env|.env.*) block "Reading env files is forbidden (may contain secrets). Only .env.example/.sample/.template are allowed." ;;
  esac
}

check_read() {
  check_sensitive_path "$FILE"

  # Oversized files: >300 lines requires a bounded read (limit <= 300).
  if [ -n "$FILE" ] && [ -f "$FILE" ]; then
    lines="$(awk 'END{print NR}' "$FILE" 2>/dev/null)"
    [ -z "$lines" ] && lines=0
    if [ "$lines" -gt 300 ]; then
      if [ -z "$LIMIT" ] || ! is_int "$LIMIT" || [ "$LIMIT" -gt 300 ]; then
        block "File has >300 lines. To prevent context token waste, search with rg/Grep first or call Read with offset and limit (<=300 lines)."
      fi
    fi
  fi
}

check_shell() {
  [ -z "$CMD" ] && return 0

  # ---- Anti-waste: multica CLI ----
  if has "$CMD" 'multica[[:space:]]+issue[[:space:]]+comment[[:space:]]+list'; then
    if has "$CMD" '--output[[:space:]=]+json'; then
      if ! { has "$CMD" '--compact' && has "$CMD" '--roots-only|--summary|--thread|--since'; }; then
        block "multica issue comment list with --output json must be bounded: multica issue comment list <id> --roots-only --summary --compact --output json"
      fi
    fi
  elif has "$CMD" 'multica[[:space:]]+issue[[:space:]]+list'; then
    if has "$CMD" '--output[[:space:]=]+json'; then
      if ! has "$CMD" '--limit[[:space:]=]+[0-9]+'; then
        block "multica issue list with --output json must include --limit <N> (e.g. --limit 15) to avoid dumping the whole backlog."
      fi
    fi
  fi

  # ---- Anti-waste: mass cat of the lockfile ----
  if has "$CMD" '(^|[^[:alnum:]_])cat([[:space:]].*)?package-lock\.json'; then
    block "Do not cat package-lock.json (huge, low-signal). Use rg/Grep for the specific dependency."
  fi

  # ---- Secrets: accessing .env (allow only example/sample/template) ----
  stripped="$(printf '%s' "$CMD" | sed -E 's/\.env\.(example|sample|template)//g')"
  if has "$stripped" '\.env([^A-Za-z0-9]|$)'; then
    if has "$CMD" '(^|[^[:alnum:]_])(cat|less|more|head|tail|bat|nl|tac|xxd|od|strings|source|cp|mv|scp|rsync|dd|ln|openssl)([[:space:]]|$)' \
      || has "$stripped" '>[[:space:]]*[^|&;]*\.env([^A-Za-z0-9]|$)' \
      || has "$stripped" '<[[:space:]]*[^|&;]*\.env([^A-Za-z0-9]|$)'; then
      block "Access to .env files is forbidden (may contain secrets). Only .env.example/.sample/.template are allowed."
    fi
  fi

  # ---- Git: destructive force-push ----
  if has "$CMD" '(^|[^[:alnum:]_])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+.*push'; then
    if has "$CMD" '--force|--force-with-lease|--mirror|--delete|(^|[[:space:]])-f([[:space:]]|$)|push[[:space:]].*[[:space:]]\+[A-Za-z0-9_./-]'; then
      block "Force/destructive push is forbidden (--force/-f/--mirror/--delete/+ref). Pushing to main is exclusive to @PM-GOZster."
    fi
  fi

  # ---- Git: history / working-tree destruction ----
  has "$CMD" 'git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+reset([[:space:]].*)?--hard' && block "git reset --hard is forbidden (destroys committed/uncommitted work)."
  has "$CMD" 'git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+clean([[:space:]].*)?-[a-zA-Z]*f' && block "git clean -f is forbidden (deletes untracked files)."
  has "$CMD" 'git[[:space:]]+checkout[[:space:]]+--[[:space:]]+\.' && block "git checkout -- . is forbidden (discards all working-tree changes)."
  has "$CMD" 'git[[:space:]]+restore[[:space:]]+(--[a-z]+[[:space:]]+)*\.([[:space:]]|$)' && block "git restore . is forbidden (discards all working-tree changes)."
  has "$CMD" 'git[[:space:]]+branch[[:space:]]+(-[a-zA-Z]*[[:space:]]+)*-D' && block "git branch -D is forbidden (force-deletes a branch)."

  # ---- rm -rf and its variants ----
  if has "$CMD" '(^|[^[:alnum:]_])rm([[:space:]]|$)'; then
    if has "$CMD" '(-[a-zA-Z]*r|--recursive)' && has "$CMD" '(-[a-zA-Z]*f|--force)'; then
      block "Recursive force delete (rm -rf / -r -f / -fr) is forbidden."
    fi
  fi

  # ---- curl|wget piped straight into a shell ----
  has "$CMD" '(curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(sh|bash|zsh)' && block "Piping a downloaded script straight into a shell is forbidden."

  # ---- Writing into .git/hooks or .claude/ ----
  if has "$CMD" '(\.git/hooks|\.claude/)'; then
    if has "$CMD" '(>>?|[[:space:]]tee[[:space:]]|(^|[[:space:]])(cp|mv|install|dd|truncate|chmod)[[:space:]]|sed[[:space:]]+-i|(^|[[:space:]])rm[[:space:]])'; then
      block "Writing to .git/hooks or .claude/ is forbidden (would tamper with the sandbox)."
    fi
  fi
  return 0
}

case "$KIND" in
  shell) check_shell ;;
  read) check_read ;;
  read_many)
    while IFS= read -r p; do
      [ -n "$p" ] && check_sensitive_path "$p"
    done <<< "$PATHS"
    ;;
esac

allow
