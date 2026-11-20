# GOZSter Local Guardrails

## Database & UI Contracts
- supabase/migrations/: append-only (`db.append-only`), explicit RLS, unique version > main/PRs.
- Zero "Mynter" (ADR-005). Canonical UI: `docs/ux-ui-review/objetivo/html/*.html`; zero demo data (`assertNoDemoLiteralsInLiveMode`); keep old `data-testid` beside new.
- Sheets (`useAtraparFocoEnHoja`): `Shift+Tab` wraps to `last` from `first`/title; capture trigger only if `!sheet.contains(activeElement)` (StrictMode).
- E2E: alt port via `E2E_STUB_URL` if 54321 blocked on Windows; `page.screenshot({ scale: "css" })` on high-DPI.

## QA & Review Rounds
- **QA CHANGES_REQUESTED:** r1/2 → stage `in_progress`, comment blocker + round N/2 @assignee, QA `todo` until `in_review`; r2/2 → `blocked` + @Gabriel summary.

## Harness² Flow (guard + merge check)
- PR: `harness-learn.sh --lesson "..."` → `harness/experience/<ISSUE>.jsonl`; `harness-gate.sh`; paste `--pr-block`.
- Harness: `chore/<#>-harness-<slug>` (PM), PPC (`harness-probe` → `harness-compose --task <ISSUE>`), `harness-authorized` by `Fresias` only (push revokes; re-verify & re-request).
- Encoding: UTF-8 no BOM; PowerShell: no backtick strings/`Set-Content` (Write/Edit).
