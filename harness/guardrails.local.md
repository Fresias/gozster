# GOZSter Local Guardrails

## Database & UI Contracts
- supabase/migrations/: append-only (db.append-only), explicit RLS. New version prefix: unique vs main and open PRs, newer than main's latest.
- Zero references to "Mynter" (ADR-005).
- Canonical UI: docs/ux-ui-review/objetivo/html/*.html. Zero demo data (`assertNoDemoLiteralsInLiveMode`). Screen migrations keep old `data-testid` beside new.

## QA & Review Rounds
- **QA CHANGES_REQUESTED r1/2:** set stage in_progress, comment blocker + round N/2 @mentioning assignee; QA issue `todo` until in_review.
- **Round 2/2:** set `blocked` and @mention Gabriel with summary of rejections.

## Harness² Flow (guard + merge check)
- PR: `harness-learn.sh --lesson "..."` + commit `harness/experience/<ISSUE>.jsonl`; `harness-gate.sh`; paste `harness-gate.sh --pr-block` in the PR body.
- Harness changes: only branch `chore/<#>-harness-<slug>` (PM), PPC (`harness-probe.mjs` → `harness-compose.mjs --task <ISSUE>`), label `harness-authorized`.
- `harness-authorized` solo vale si la pone `Fresias` (nunca un agente); cada push la revoca: verificar el sello en el head nuevo y pedirla de nuevo.
- Encoding: UTF-8, no BOM. PowerShell: no backtick strings, no `Set-Content`; use Write/Edit.
