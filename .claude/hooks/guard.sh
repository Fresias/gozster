#!/usr/bin/env bash
# .claude/hooks/guard.sh
# PreToolUse guard for GOZSter — anti-destruction + anti-token-waste.
#
# Reads the Claude Code hook JSON from stdin and inspects `tool_name` /
# `tool_input`. Exit 0 = allow the tool call, exit 2 = block it (the stderr
# message is surfaced to the model). Node.js is always present in this Next.js
# project, so it is the primary JSON reader, with jq and python3 as fallbacks.

set -u

INPUT="$(cat)"

# JSON field extractor. Usage: json_get tool_input.command
json_get() {
  local keypath="$1"
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$INPUT" | node -e '
      let d = "";
      process.stdin.on("data", c => (d += c)).on("end", () => {
        try {
          let v = JSON.parse(d);
          for (const k of process.argv[1].split(".")) v = (v == null) ? undefined : v[k];
          process.stdout.write(v == null ? "" : String(v));
        } catch (e) {}
      });
    ' "$keypath"
  elif command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r --arg kp "$keypath" '
      ($kp | split(".")) as $ks
      | reduce $ks[] as $k (.; if . == null then null else .[$k] end)
      | if . == null then "" elif type == "object" or type == "array" then "" else . end'
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$INPUT" | python3 -c '
import sys, json
try:
    o = json.load(sys.stdin)
    for k in sys.argv[1].split("."):
        o = o.get(k) if isinstance(o, dict) else None
    sys.stdout.write("" if o is None else str(o))
except Exception:
    pass' "$keypath"
  fi
}

block() {
  echo "Blocked by .claude/hooks/guard.sh: $1" >&2
  exit 2
}

has() { printf '%s' "$1" | grep -Eq -- "$2"; }

TOOL="$(json_get tool_name)"

case "$TOOL" in
  Read)
    FILE="$(json_get tool_input.file_path)"
    LIMIT="$(json_get tool_input.limit)"
    base="$(basename -- "$FILE")"

    # package-lock.json: huge and low-signal.
    if [ "$base" = "package-lock.json" ]; then
      block "Reading package-lock.json is forbidden (huge, low-signal). Use rg/Grep for the specific dependency."
    fi

    # .env secrets: only example/sample/template are allowed.
    case "$base" in
      .env.example|.env.sample|.env.template) : ;;
      .env|.env.*) block "Reading env files is forbidden (may contain secrets). Only .env.example/.sample/.template are allowed." ;;
    esac

    # Oversized files: >300 lines requires a bounded read (limit <= 300).
    if [ -n "$FILE" ] && [ -f "$FILE" ]; then
      lines="$(awk 'END{print NR}' "$FILE" 2>/dev/null)"
      [ -z "$lines" ] && lines=0
      if [ "$lines" -gt 300 ]; then
        if [ -z "$LIMIT" ] || ! printf '%s' "$LIMIT" | grep -Eq '^[0-9]+$' || [ "$LIMIT" -gt 300 ]; then
          block "File has >300 lines. To prevent context token waste, search with rg/Grep first or call Read with offset and limit (<=300 lines)."
        fi
      fi
    fi
    exit 0
    ;;

  Bash)
    CMD="$(json_get tool_input.command)"
    [ -z "$CMD" ] && exit 0

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

    exit 0
    ;;

  *)
    exit 0
    ;;
esac
