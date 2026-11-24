# GOZSter — System Prompt & Guidelines

## Product Vision & Architecture
GOZSter: **Coach Studio** (Desktop/Web) y **Athlete App** (PWA/Offline-First) con Supabase, Zustand y Next.js 15.

## Verified Commands & Gate
- `npm ci`, `npm run dev`, `npm run build`, `npm run typecheck`, `npm test`, `npx vitest run`, `npm run seed:mynter`.
- Gate: `npm test && npm run typecheck && npm run lint && npm run build`.

## Governance & Roles
- Squad: @backend-eng, @frontend-eng, @qa-eng. Ramas `feature/<issue-#>-slug` o `fix/<issue-#>-slug`. Commits convencionales.
- PR y commits como AgentsMultica (nunca como una persona) → review @qa-eng en Multica (`review-selection.md`) → approve @Fresias en GitHub → merge con checks verdes.

# Core Guardrails (Invariants)

## Always
- Read file before editing; understand context first.
- Surgical, minimal changes strictly scoped to task (Karpathy).
- Run project gate before declaring task done or opening PR (zero stale claims).

## Ask First
- Adding external dependency to manifest (Ponytail).
- Modifying public APIs or schemas outside stated scope.

## Never (Enforced by Guard)
- Guard blocks destructive commands, secrets, bloatware, unbounded reads, harness tampering, and unsealed PRs — returning `ruleId` and recommended action (rules: `git.force-push`, `fs.env-leak`, `fs.bloatware`, `read.oversize`, `fs.protected`, `pr.requires-seal`).

# Multica Guardrails

## Invariants
- **Daemon protection:** Never kill `multica` by name. Check `multica daemon status --output json`; kill child PID only (`multica.daemon-protect`).
- **Foreground blocking:** Never exit turn "standing by"; run work synchronously in blocking calls.
- **Windows comment encoding:** Comments go to UTF-8 file in workdir, post via `--content-file`, delete on success.

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

## Skills

- When the repository has no harness/project.json or the user asks to set up the harness, load the harness-bootstrap skill.
- When a task touches training domain terms (planes, días de rutina, ejercicios en rutina, superseries, sesiones, series, 1RM, RPE) or business rules, load the gozster-domain skill.
- When you need harness helper scripts or CLI tool guides, load the harness-tools skill.

# LongTermMEMORY

- [verified 2026-11-08 | src: GOZS-428] Lessons: `harness/experience/<ISSUE>.jsonl`; search first: `rg -n <term> harness/experience`.

- [verified 2026-11-09 | src: PPC] Rutas de memoria son escribibles y rechazan .. y %2e.

# Tool Guidance & Execution Rules

## File Exploration & Editing
- **Scan-before-read:** `rg -n` before reading.
- **Bounded reading:** Files >300 lines require `offset`+`limit` (≤200) or `StartLine`+`EndLine` (≤300).
- **Al empezar:** `node harness-kit/core/scripts/harness-context.mjs`; TTFE ≤5 calls.
- **Quiet git:** `git diff --stat`, `git status -s`.

## Test & Gate Workflow
- **Iterative development:** Run ONLY affected test file (`npx vitest run <path/to/spec.ts>`).
- **Zero stale claims:** Never skip tests, mark `.skip`/`.todo`, or relax assertions.

# Multica CLI Guidance

- **CLI (`harness-tools` skill):** Use `multica-ctx.mjs` / `multica-post.mjs`; `--limit <=15`, `--project` on search, no `2>&1` with JSON.
- **Multi-stage:** Use `sub-issue.md.tmpl` and `--pr-auto-complete off` for multi-stage issues.
- **Native queue:** Hand off once (native queue); no repeated mentions, sleeps, or polls; condition wakeups only.
- **Terminal states:** Max 2 retries → `blocked`; no-action wakeups end without comment.

- **RPCs:** SQL `DEFAULT NULL` = TS opcional. **Modales:** isSaving atómico + submit deshabilitado.
