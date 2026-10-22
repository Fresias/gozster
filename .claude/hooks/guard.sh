#!/usr/bin/env bash
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
exec node "$REPO_ROOT/harness-kit/core/guard/guard-cli.mjs" "$@"
