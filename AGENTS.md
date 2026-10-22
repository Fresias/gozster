# GOZSter — System Prompt & Guidelines

## Product Vision & Architecture
GOZSter is a strength-training platform: **Coach Studio** (Desktop/Web) for plans, students and overload alerts; **Athlete App** (Mobile-First/PWA) for live, offline-first training (timers, 1RM, RPE).

## Technology Stack
- Next.js 15 + React 19, TypeScript (`strict`); Tailwind + Shadcn; Zustand (offline-first, delta sync via `updated_at`); **Backend:** Supabase — PostgreSQL 15+ with strict RLS.

## Verified Commands
- Install `npm ci`; dev `npm run dev`; build/start `npm run build` / `npm start`.
- Type-check / lint `npm run typecheck` / `npm run lint`; tests `npm test` (watch `npm run test:watch`).
- Single file `npx vitest run <path/to/file.test.ts>`; seed `npm run seed:mynter`.
- **Gate:** `npm test && npm run typecheck && npm run lint && npm run build`.

## Repository Layout
- `src/` — `app/` routes (`(coach)/`, `(athlete)/`, `login/`, `invitacion/`), `components/`, `lib/` (`supabase/` clients), `services/`, `store/`, `middleware.ts`, `__tests__/` (`*.spec.ts`/`*.test.ts`).
- `supabase/migrations/`, `types/database.types.ts` (generated), `docs/` (`adr/`, `GLOSSARY.md`), `tests/` (harness).

## Governance & Roles
- Roles `@backend-eng`, `@frontend-eng`, `@qa-eng`, `@UI/UX & Art Director`; branches `feature/<issue-#>-slug` or `fix/<issue-#>-slug`; conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
- Merge: `@PM-GOZster` alone merges to `main`, gated on green CI + QA `APPROVED`.
- Review: `@qa-eng` runs the 6-level Selection protocol (`harness-kit/core/templates/review-selection.md`) per PR.

# Core Guardrails (Invariants)

## Always
- Read a file before editing it; understand the surrounding context first.
- Keep every change surgical, minimal and strictly scoped to the task (Karpathy).
- Re-run the project gate before declaring a task completed or opening a PR (zero stale claims).

## Ask First
- Adding any external dependency to the project manifest (Ponytail).
- Modifying public APIs, interfaces or schemas outside the issue's stated scope.

## Never (Enforced by Guard)
- Destructive: `git push --force`/`+branch`, `git reset --hard`, `git clean -fd`, `rm -rf`, `sudo` (rules: `git.force-push`, `git.reset-hard`, `git.clean-force`, `shell.rm-rf`, `shell.sudo`).
- Secrets: never read or commit `.env*` (only `.env.example|.sample|.template`) (rule: `fs.env-leak`), nor `*.pem`/`*.key` (rule: `read.sensitive`).
- Bloat: never read `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `.next/`, `node_modules/`, `dist/`, `build/` (rule: `fs.bloatware`).
- Unbounded: never read or `cat` >300-line files without limits (rules: `read.oversize`, `shell.oversize-cat`).
- Harness: never modify guard/git hooks or runtime settings unauthorized (rule: `fs.protected`), nor hand-edit generated files (rule: `write.generated`).
- No `gh pr create` without a valid `harness-gate.sh` seal (rule: `pr.requires-seal`).

# Multica Guardrails

## Invariants
- **Daemon protection:** Never terminate `multica` or `multica.exe` by process name. Only terminate specific child PIDs after checking `multica daemon status --output json` (rule: `multica.daemon-protect`).
- **Foreground blocking:** Never detach long-running work or exit a turn "standing by"; run work synchronously in foreground tool calls.
- **Windows comment encoding:** Write comment bodies to a UTF-8 file in the task workdir, submit via `--content-file`, then delete it only after the post succeeds.

# GOZSter Local Guardrails

## Database & Migrations
- `supabase/migrations/` is **strictly append-only**: never edit or delete a migration (rule: `db.append-only`).
- New tables must define explicit PostgreSQL Row Level Security (RLS) policies.

## Brand & Product Integrity
- Zero references to "Mynter" in production UI and student-facing copy (ADR-005).
- Respect dual view states `SIMPLE` vs `TECNICA` (full overload) per ADR-004.

## QA & Review Rounds
- **QA `CHANGES_REQUESTED`, round 1/2 — reopen the stage:** set the Stage issue `in_progress`; comment there with blocker + detail link + round `N/2`, @mentioning the assignee (an action request, so the mention fires their run); set the QA issue `todo` until the stage is `in_review` again.
- **Round 2/2 — no re-audit, no reopen:** QA/PM set `blocked` and @mention Gabriel (human owner) with a summary of the two rejections.

## Skills

- When the repository has no harness/project.json or the user asks to set up the harness, load the harness-bootstrap skill.
- When a task touches training domain terms (planes, días de rutina, ejercicios en rutina, superseries, sesiones, series, 1RM, RPE) or business rules, load the gozster-domain skill.

# LongTermMEMORY

- [verified 2026-10-19 | src: PR #63] Push protection GH007: commits must use 6156087+Fresias@users.noreply.github.com.
- [verified 2026-10-19 | src: runtime] Bash cwd persists between calls; Git Bash at C:\Program Files\Git\bin\bash.exe.
- [verified 2026-10-19 | src: tests/db] SQL/RLS tests run on @electric-sql/pglite, no Docker.
- [verified 2026-10-19 | src: docs/GLOSSARY.md] Training hierarchy: planes_entrenamiento → dias_rutina → ejercicios_en_rutina → registro_sesiones → registro_series.
- [verified 2026-10-19 | src: package.json] `npm run lint` == `tsc --noEmit` (same as typecheck).

# Tool Guidance & Execution Rules

## File Exploration & Editing
- **Scan-before-read:** Locate the exact target range with `rg -n` before reading.
- **Bounded reading:** For files > 300 lines, supply `offset` + `limit` (≤ 200) or `StartLine` + `EndLine` (≤ 300).
- **Time-to-First-Edit (TTFE):** Aim to read and make the first edit within ≤ 5 tool calls.
- **Quiet inspection:** Prefer quiet flags like `git diff --stat` or `git status -s` before requesting full diffs.

## Test & Gate Workflow
- **Iterative development:** Run ONLY the affected test file (`npx vitest run <path/to/spec.ts>`).
- **Zero stale claims:** Never skip tests, mark tests `.skip` or `.todo`, or relax assertions to mask failures.

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
- **Retries (max 2):** at most 2 tries on the same failure; if the 2nd makes no progress, set `blocked` with evidence (command, output, what was tried) and end the run.
- **Hand-off, no start:** record goal, changes, evidence, risks and out-of-scope zones, name exactly ONE next action, then end the run without starting it.
- **Waits by condition only:** use condition wakeups (`--until-pr checks`/`--until-children-done`/`--until-status`/`--until-issue`); no periodic wakeups, no sleep/poll.

# Helper scripts (run via bash)

- `harness-kit/core/scripts/harness-gate.sh`: Full gate: append-only check, project gate commands, writes .harness/complete.json.
- `harness-kit/core/scripts/harness-init.sh`: Setup in one call: git identity, deps, harness status, optional scope.
- `harness-kit/core/scripts/harness-render.mjs`: Harness compiler & drift checker (H-03).
- `harness-kit/core/scripts/harness-telemetry.mjs`: Aggregates guard telemetry (.harness/telemetry/events.jsonl) into a summary:
