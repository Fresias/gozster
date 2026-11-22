# GOZSter Local Guardrails

## Database & UI Contracts
- supabase/migrations/: append-only (`db.append-only`), idempotent, RLS, version > main/PRs; new tables: backup-restore-gozs.mjs + restaurar_filas_respaldo.
- Zero "Mynter" (ADR-005). UI: `docs/ux-ui-review/objetivo/html/*.html`; zero demo data (`assertNoDemoLiteralsInLiveMode`); keep old `data-testid`.
- Sheets (`useAtraparFocoEnHoja`): `Shift+Tab` first/title→last; capture trigger if `!sheet.contains(activeElement)` (StrictMode).
- E2E: `E2E_STUB_URL` alt port if Windows blocks 54321; `page.screenshot({ scale: "css" })` on high-DPI.
- PWA: SW prod-only; `sw.js` skips `/api/`, `/auth/`, `/rest/`, Supabase/cross-origin; iOS: `other` `apple-mobile-web-app-capable`.

## QA & Review Rounds
- **QA CHANGES_REQUESTED:** r1/2 → `in_progress` + blocker comment (round N/2) @assignee, QA `todo` until `in_review`; r2/2 → `blocked` + @Gabriel summary.
- SSR specs (React 19): mock Zustand hooks to `getState()` in the spec; no `typeof window` in components.

## Harness² Flow (guard + merge check)
- PR: `harness-learn.sh --lesson "..."`, `harness-gate.sh`, paste `--pr-block`.
- Harness: `chore/<#>-harness-<slug>` (PM), PPC (`harness-probe` → `harness-compose --task <ISSUE>`; never hand-edit), `harness-authorized` by `Fresias` only (push revokes; re-request).
- Encoding: UTF-8 no BOM; PowerShell: no backtick strings/`Set-Content` (Write/Edit).
