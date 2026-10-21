# Multica CLI Guidance (Anti-Token-Waste)

## Command Rules
- **Bounded issue queries:** Never run `multica issue list --output json` without `--limit` (max 15).
- **Scan-Then-Expand comments:**
  - Scan thread roots: `multica issue comment list <id> --roots-only --summary --compact --output json`
  - Expand specific thread: `multica issue comment list <id> --thread <comment-id> --tail 10 --compact --output json`
- **Large payloads:** Long descriptions and comments must always use `--description-file ./description.md` or `--content-file ./comment.md` within the task workdir (never `/tmp`).
- **Stream separation:** Never merge `stderr` into `stdout` (`2>&1`) when parsing `--output json`.

## Comment Discipline (No-Action, No-Reply)
- **No action, no comment:** If a wakeup/mention requires no concrete action from you (acks, thanks, "conformidad", "silencio operativo", status echoes), end the run WITHOUT commenting.
- **No ack mentions:** Never @mention another agent unless you need them to act. Mentions trigger runs; acknowledgements are forbidden.
- **One hand-off per state change:** Comment only when you deliver, block, or request a specific action.
