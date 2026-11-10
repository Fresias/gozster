# Multica CLI Guidance (Anti-Token-Waste)

## Command Rules
- **Bounded queries:** never run `multica issue list --output json` without `--limit` (max 15).
- **Scan-Then-Expand comments:** scan roots (`--roots-only --summary --compact`), expand thread (`--thread <id> --tail 10 --compact`).
- **Large payloads:** long descriptions/comments use `--description-file`/`--content-file` in workdir, never `/tmp`.
- **Stream separation:** never merge `stderr` into `stdout` (`2>&1`) when parsing `--output json`.
- **Multi-stage issues:** pass `--pr-auto-complete off` on `multica issue create` for multi-stage/squad tasks to prevent premature auto-close before QA audit and final approval.

## Comment Discipline (No-Action, No-Reply)
- **No action, no comment:** if a wakeup/mention needs no concrete action (acks, thanks, echoes), end run without commenting.
- **No ack mentions:** never @mention agents unless requiring action — mentions trigger paid runs.
- **One hand-off per state change:** comment only on delivery, block, or concrete action request.

## Terminal States (Stop the Loop)
- **Retries (max 2):** max 2 attempts on failure; if 2nd fails, set `blocked` with evidence and end run.
- **Hand-off, no start:** record goal, changes, evidence, risks, name ONE next action, stop.
- **Waits by condition:** condition wakeups (`--until-pr checks`/`--until-children-done`/`--until-status`); no sleep/poll.
