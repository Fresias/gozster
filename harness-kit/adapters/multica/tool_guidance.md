# Multica CLI Guidance (Anti-Token-Waste)

## Command Rules
- **Bounded queries:** never run `multica issue list --output json` without `--limit` (max 15).
- **Scan-Then-Expand comments:** scan roots `multica issue comment list <id> --roots-only --summary --compact --output json`, then expand a thread with `... --thread <comment-id> --tail 10 --compact`.
- **Large payloads:** long descriptions/comments use `--description-file ./description.md` or `--content-file ./comment.md` in the task workdir (never `/tmp`).
- **Stream separation:** never merge `stderr` into `stdout` (`2>&1`) when parsing `--output json`.

## Comment Discipline (No-Action, No-Reply)
- **No action, no comment:** if a wakeup/mention needs no concrete action (acks, thanks, "conformidad", "silencio operativo", status echoes), end the run WITHOUT commenting.
- **No ack mentions:** never @mention another agent unless you need them to act — mentions trigger runs; acknowledgements are forbidden.
- **One hand-off per state change:** comment only when you deliver, block, or request a specific action.

## Terminal States (Stop the Loop)
- **Retries (max 2):** at most 2 tries on the same failure (test or error); if the 2nd makes no measurable progress, set `blocked` with evidence (command, output, what was tried) and end the run.
- **Hand-off, no start:** record goal, changes, evidence, risks and out-of-scope zones, name exactly ONE next action, then end the run without starting it.
- **Waits by condition only:** use condition wakeups (`--until-pr checks`/`--until-children-done`/`--until-status`/`--until-issue`); no periodic wakeups, no sleep/poll.
