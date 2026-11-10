# Multica CLI Guidance (Anti-Token-Waste)

## Command Rules
- **Bounded queries:** `multica issue list` with JSON requires `--limit` (≤15).
- **Scan-Then-Expand:** scan roots (`--roots-only --summary --compact`), expand (`--thread <id> --tail 10 --compact`).
- **Payloads:** long text uses `--description-file`/`--content-file` in workdir, never `/tmp`.
- **Streams:** never merge `stderr` into `stdout` (`2>&1`) with JSON.

## Comment Discipline (No-Action, No-Reply)
- **No action, no comment:** if wakeup needs no action (acks, thanks, echoes), end run without commenting.
- **No ack mentions:** never @mention without needed action; no repeated mentions, sleeps, or polls.
- **One hand-off:** deliver state once to squad/leader; native queue enqueues handoffs without task loss.

## Terminal States (Stop the Loop)
- **Retries (max 2):** 2 tries max; on 2nd failure, set `blocked` with evidence; no retry loops, sleeps, or polls.
- **Hand-off, no start:** hand off once to squad/leader (native squad queue resilience: wait in line without task loss); record goal, changes, evidence, risks, name ONE next action, end run.
- **Waits by condition only:** condition wakeups (`--until-pr checks`/`--until-children-done`/`--until-status`); strictly no sleep, poll, or wakeup polling.
