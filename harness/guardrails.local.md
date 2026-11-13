# GOZSter Local Guardrails

## Database & UI Contracts
- supabase/migrations/: strictly append-only, never edit/delete (db.append-only). Explicit RLS.
- Zero references to "Mynter" (ADR-005).
- Canonical UI: docs/ux-ui-review/objetivo/html/*.html. Zero demo data (`assertNoDemoLiteralsInLiveMode`).

## QA & Review Rounds
- **QA CHANGES_REQUESTED r1/2:** set stage in_progress, comment blocker + round N/2 @mentioning assignee; QA issue `todo` until in_review.
- **Round 2/2:** set `blocked` and @mention Gabriel with summary of rejections.

## Harness² Flow (guard + merge check)
- PR: `harness-learn.sh --lesson "..."` + commit `harness/experience/<ISSUE>.jsonl`; `harness-gate.sh`; paste `harness-gate.sh --pr-block` in the PR body.
- Harness changes: branch `chore/<#>-harness-<slug>` (PM), PPC (`harness-probe` → `harness-compose`), label `harness-authorized`.
- Encoding: UTF-8, no BOM. PowerShell: no backtick strings, no `Set-Content`.
