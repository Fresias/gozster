# GOZSter — System Prompt & Guidelines

## Product Vision & Architecture
GOZSter: **Coach Studio** (Desktop/Web) for plans, students, overload alerts; **Athlete App** (Mobile-First/PWA) for live, offline-first training (timers, 1RM, RPE).

## Technology Stack
- Next.js 15, React 19, TypeScript strict; Tailwind, Shadcn; Zustand (offline-first, delta sync via `updated_at`); Supabase PostgreSQL with strict RLS.

## Verified Commands
- `npm ci`, `npm run dev`, `npm run build`, `npm start`.
- `npm run typecheck`, `npm run lint`, `npm test` (`npm run test:watch`).
- Single: `npx vitest run <path/to/file.test.ts>`; seed: `npm run seed:mynter`.
- **Gate:** `npm test && npm run typecheck && npm run lint && npm run build`.

## Repository Layout
- `src/` (app routes, components, lib, services, store, `__tests__`), `supabase/migrations/`, `types/database.types.ts`.

## Governance & Roles
- Roles `@backend-eng`, `@frontend-eng`, `@qa-eng`, `@UI/UX & Art Director`; branches `feature/<issue-#>-slug` or `fix/<issue-#>-slug`; conventional commits (`feat:`, `fix:`, `refactor:`, `test:`).
- Merge: `@PM-GOZster` merges to `main` on green CI + QA `APPROVED`.
- Review: `@qa-eng` runs the 6-level Selection protocol (`review-selection.md`) per PR.

# Core Guardrails (Invariants)

## Always
- Read a file before editing it; understand the surrounding context first.
- Keep every change surgical, minimal and strictly scoped to the task (Karpathy).
- Re-run the project gate before declaring a task completed or opening a PR (zero stale claims).

## Ask First
- Adding any external dependency to the project manifest (Ponytail).
- Modifying public APIs, interfaces or schemas outside the issue's stated scope.

## Never (Enforced by Guard)
- Destructive: `git push --force`/`+branch`, `git reset --hard`, `git clean -fd`, `rm -rf`, `sudo` (rules: `git.force-push`, `git.reset-hard`, `shell.rm-rf`, `shell.sudo`).
- Secrets: never read or commit `.env*` (only `.env.example|.sample|.template`) (rule: `fs.env-leak`), nor `*.pem`/`*.key` (rule: `read.sensitive`).
- Bloat: never read `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `.next/`, `node_modules/`, `dist/`, `build/` (rule: `fs.bloatware`).
- Unbounded: never read or `cat` >300-line files without limits (rules: `read.oversize`, `shell.oversize-cat`).
- Harness: never modify guard/git hooks or settings unauthorized (rule: `fs.protected`), nor hand-edit generated files (rule: `write.generated`).
- No `gh pr create` without a valid `harness-gate.sh` seal (rule: `pr.requires-seal`).

# Multica Guardrails

## Invariants
- **Daemon protection:** Never terminate `multica` by process name. Check `multica daemon status --output json` and terminate only specific child PIDs (`multica.daemon-protect`).
- **Foreground blocking:** Never exit turn "standing by"; run work synchronously in foreground tool calls.
- **Windows comment encoding:** Write comments to UTF-8 file in workdir, submit via `--content-file`, delete on success.

# GOZSter Local Guardrails

## Database & Migrations
- `supabase/migrations/`: strictly append-only, never edit/delete migrations (`db.append-only`). Explicit RLS required on new tables.

## Brand & Product Integrity
- Zero references to "Mynter" in production UI (ADR-005). Dual view states `SIMPLE` vs `TECNICA` per ADR-004.

## QA & Review Rounds
- **QA `CHANGES_REQUESTED` r1/2:** set stage `in_progress`, comment blocker + round `N/2` @mentioning assignee; QA issue `todo` until `in_review`.
- **Round 2/2:** set `blocked` and @mention Gabriel with summary of rejections.

## Skills

- When the repository has no harness/project.json or the user asks to set up the harness, load the harness-bootstrap skill.
- When a task touches training domain terms (planes, días de rutina, ejercicios en rutina, superseries, sesiones, series, 1RM, RPE) or business rules, load the gozster-domain skill.

# LongTermMEMORY

- [verified 2026-10-19 | src: harness] Hechos historicos consolidados en experience_library.jsonl con tags semanticos.

### Experience Library (Harness²)

- [lesson 2026-10-19 | task: tests/db] SQL/RLS tests run on @electric-sql/pglite, no Docker.
- [lesson 2026-10-19 | task: docs/GLOSSARY.md] Training hierarchy: planes_entrenamiento → dias_rutina → ejercicios_en_rutina → registro_sesiones → registro_series.
- [lesson 2026-10-19 | task: package.json] `npm run lint` == `tsc --noEmit` (same as typecheck).

# Tool Guidance & Execution Rules

## File Exploration & Editing
- **Scan-before-read:** Locate target range with `rg -n` before reading.
- **Bounded reading:** Files >300 lines require `offset`+`limit` (≤200) or `StartLine`+`EndLine` (≤300).
- **Time-to-First-Edit (TTFE):** Aim to read and edit within ≤5 tool calls.
- **Quiet inspection:** Prefer `git diff --stat` or `git status -s` before full diffs.

## Test & Gate Workflow
- **Iterative development:** Run ONLY affected test file (`npx vitest run <path/to/spec.ts>`).
- **Zero stale claims:** Never skip tests, mark `.skip`/`.todo`, or relax assertions.

# Multica CLI Guidance (Anti-Token-Waste)

## Command Rules
- **Bounded queries:** never run `multica issue list --output json` without `--limit` (max 15).
- **Scan-Then-Expand comments:** scan roots (`--roots-only --summary --compact`), then expand a thread (`--thread <id> --tail 10 --compact`).
- **Large payloads:** long descriptions/comments use `--description-file`/`--content-file` in the task workdir, never `/tmp`.
- **Stream separation:** never merge `stderr` into `stdout` (`2>&1`) when parsing `--output json`.

## Comment Discipline (No-Action, No-Reply)
- **No action, no comment:** if a wakeup/mention needs no concrete action (acks, thanks, status echoes), end the run WITHOUT commenting.
- **No ack mentions:** never @mention another agent unless you need them to act — mentions trigger runs.
- **One hand-off per state change:** comment only when you deliver, block, or request a specific action.

## Terminal States (Stop the Loop)
- **Retries (max 2):** max 2 tries on failure; if 2nd fails, set `blocked` with evidence and end run.
- **Hand-off, no start:** record goal, changes, evidence, risks, name ONE next action, end run.
- **Waits by condition only:** condition wakeups (`--until-pr checks`/`--until-children-done`/`--until-status`); no sleep/poll.

- **RPCs en Supabase (GOZS-331):** Parámetros opcionales llevan default explícito ('DEFAULT NULL') en SQL y opcionales en cliente TypeScript.
- **Modales con Guardado (GOZS-321):** Candado isSaving atómico y desactivar botón submit para prevenir carreras de datos o peticiones duplicadas.
- **Cálculos de Fechas (GOZS-327):** Fijar 'vi.setSystemTime()' en lunes 09:00 ART en pruebas con tope semanal para evitar desfasajes con UTC.

# Helper scripts (run via bash)

- `harness-kit/core/scripts/harness-compose.mjs`: Evaluates probe traces, selects the winning harness and updates experience library.
- `harness-kit/core/scripts/harness-contrast.mjs`: Contrasts candidate harness probe reports and selects winning configuration (Harness²).
- `harness-kit/core/scripts/harness-gate.sh`: Full gate: append-only check, project gate commands, writes .harness/complete.json.
- `harness-kit/core/scripts/harness-init.sh`: Setup in one call: git identity, deps, harness status, optional scope.
- `harness-kit/core/scripts/harness-learn.sh`: Post-merge & issue-close autonomous learner: persists lessons to experience_library.jsonl.
- `harness-kit/core/scripts/harness-probe.mjs`: Runs candidate harness probes on isolated ephemeral git branches (Harness² PPC).
- `harness-kit/core/scripts/harness-render.mjs`: Harness compiler & drift checker (H-03).
- `harness-kit/core/scripts/harness-telemetry.mjs`: Aggregates guard telemetry (.harness/telemetry/events.jsonl) into a summary:
