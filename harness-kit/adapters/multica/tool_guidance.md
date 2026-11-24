# Multica CLI Guidance

- **CLI (`harness-tools` skill):** Use `multica-ctx.mjs` / `multica-post.mjs`; `--limit <=15`, `--project` on search, no `2>&1` with JSON.
- **Multi-stage:** Use `sub-issue.md.tmpl` and `--pr-auto-complete off` for multi-stage issues.
- **Native queue:** Hand off once (native queue); no repeated mentions, sleeps, or polls; condition wakeups only.
- **Terminal states:** Max 2 retries → `blocked`; no-action wakeups end without comment.
