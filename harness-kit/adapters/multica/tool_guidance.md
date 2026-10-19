# Multica CLI Guidance (Anti-Token-Waste)

Enforce Scan-Then-Expand on all `multica` CLI invocations.

## Command Rules
- **Bounded issue queries:** Never run `multica issue list --output json` without `--limit` (max 15).
- **Scan-Then-Expand comments:**
  - Scan thread roots: `multica issue comment list <id> --roots-only --summary --compact --output json`
  - Expand specific thread: `multica issue comment list <id> --thread <comment-id> --tail 10 --compact --output json`
  - Never run `multica issue comment list` without bounding flags.
- **Large payloads:** Long descriptions and comments must always use `--description-file ./description.md` or `--content-file ./comment.md` within the task workdir (never `/tmp`).
- **Stream separation:** Never merge `stderr` into `stdout` (`2>&1`) when parsing `--output json`.
