# GOZSter Local Guardrails

## Database & UI Contracts
- supabase/migrations/: append-only (db.append-only), explicit RLS. New version prefix: unique vs main/open PRs, > main's latest.
- Zero references to "Mynter" (ADR-005).
- Canonical UI: docs/ux-ui-review/objetivo/html/*.html. Zero demo data (`assertNoDemoLiteralsInLiveMode`). Screen migrations keep old `data-testid` beside new. Sheet focus trap (`tabIndex=-1` title): `Shift+Tab` wraps to `last` from `first` or title.

## QA & Review Rounds
- **QA CHANGES_REQUESTED:** r1/2 → stage `in_progress`, comment blocker + round N/2 @assignee, QA `todo` until `in_review`; r2/2 → `blocked` + @Gabriel summary.

## Harness² Flow (guard + merge check)
- PR: `harness-learn.sh --lesson "..."` + commit `harness/experience/<ISSUE>.jsonl`; `harness-gate.sh`; paste `--pr-block` in PR body.
- Harness changes: only branch `chore/<#>-harness-<slug>` (PM), PPC (`harness-probe.mjs` → `harness-compose.mjs --task <ISSUE>`), label `harness-authorized`.
- `harness-authorized`: solo vale si la pone `Fresias` (nunca un agente); cada push la revoca: verificar sello en head nuevo y pedirla de nuevo.
- Encoding: UTF-8, no BOM. PowerShell: no backtick strings, no `Set-Content`; use Write/Edit.
