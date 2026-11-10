# Multica CLI Guidance (Anti-Token-Waste)

## Command Rules
- **Bounded queries:** never run `multica issue list --output json` without `--limit` (max 15).
- **Bounded search:** never run `multica issue search` without `--project <id>`.
- **Scan-Then-Expand comments:** scan roots (`--roots-only --summary --compact`), then expand a thread (`--thread <id> --tail 10 --compact`).
- **Large payloads:** long descriptions/comments use `--description-file`/`--content-file` in task workdir, never `/tmp`.
- **Stream separation:** never merge `stderr` into `stdout` (`2>&1`) when parsing `--output json`.

## Comment Discipline (No-Action, No-Reply)
- **No action, no comment:** if a wakeup/mention needs no action (acks, thanks), end run WITHOUT commenting.
- **No ack mentions:** never @mention another agent unless you need them to act — mentions trigger runs.
- **One hand-off per state change:** comment only when you deliver, block, or request a specific action.

## Terminal States (Stop the Loop)
- **Retries (max 2):** max 2 tries on failure; if 2nd fails, set `blocked` with evidence and end run.
- **Hand-off, no start:** record goal, changes, evidence, risks, name ONE next action, end run.
- **Waits by condition only:** condition wakeups (`--until-pr checks`/`--until-children-done`); no sleep/poll.
