# GOZSter — System Prompt & Guidelines

Guidance for coding agents working in the GOZSter repository.

## Product Vision & Architecture
Strength-training platform with a dual experience:
- **Coach Studio (Desktop/Web):** plan creator, student management, retention analytics, overload alerts.
- **Athlete App (Mobile-First / PWA):** live execution, offline logging, timers, 1RM calculator, RPE tracking.

## Technology Stack
Next.js 15 (App Router) + React 19, TypeScript `strict`; Tailwind + Shadcn UI (`components.json`); Zustand (offline-first, delta sync via `updated_at`); Supabase — PostgreSQL 15+ with strict Row Level Security (RLS).

## Verified Commands
Against `package.json`: `npm ci` (install); `npm run dev`; `npm run build` / `npm start`; `npm run typecheck` / `npm run lint`; `npm test` / `npm run test:watch`; `npx vitest run <path/to/file.test.ts>` (single file); `npm run seed:mynter`.

## Repository Layout
- `src/` — `app/` (App Router: `(coach)/`, `(athlete)/`, `login/`, `invitacion/`), `components/` (`ui/` = Shadcn), `lib/` (`supabase/` clients, `strength-metrics.ts`, `youtube.ts`), `services/`, `store/` (Zustand), `middleware.ts`, `__tests__/` (Vitest).
- `supabase/migrations/` — timestamped SQL migrations (append-only; see Local Guardrails).
- `types/database.types.ts` — generated Supabase types. `docs/` — specs, ADRs (`docs/adr/`), `docs/GLOSSARY.md`. `tests/` — repo-level harness tests.

## Governance & Roles
- Squad roles: `@backend-eng`, `@frontend-eng`, `@qa-eng`, `@UI/UX & Art Director`.
- All development uses branches: `feature/<issue-#>-slug` or `fix/<issue-#>-slug`.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`.
- Review: `@qa-eng` runs the 6-level Selection protocol (`harness-kit/core/templates/review-selection.md`) on every PR before `@PM-GOZster` merges.

# Core Guardrails (Invariants)

Universal invariants across all runtimes; each negative rule maps to a guard check.

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

Invariants specific to the Multica agent runtime and workspace daemon.

## Invariants
- **Daemon protection:** Never terminate `multica` or `multica.exe` by process name. Only terminate specific child PIDs after checking `multica daemon status --output json` (rule: `multica.daemon-protect`).
- **Foreground blocking:** Never detach long-running work or exit a turn "standing by". Execute work synchronously within foreground tool calls.
- **Windows comment encoding:** Write comment bodies to a UTF-8 file inside the task workdir first, then submit via `--content-file <path>`. Delete the temporary file only after the post succeeds.

# GOZSter Local Guardrails

Project-specific invariants for GOZSter.

## Database & Migrations
- Migrations in `supabase/migrations/` are **strictly append-only**. Never edit or delete an existing migration file (rule: `db.append-only`).
- All new database tables must define explicit PostgreSQL Row Level Security (RLS) policies.

## Brand & Product Integrity
- Zero references to "Mynter" in production UI and student-facing copy (ADR-005).
- Respect dual view states: `SIMPLE` (clean, distraction-free) vs `TECNICA` (full overload details) per ADR-004.

## Git & Release Governance
- Never push or merge directly to `main`. Only `@PM-GOZster` performs merges after `@qa-eng` audit verdict is `APPROVED` and CI checks are green.

## Skills

- When the repository has no harness/project.json or the user asks to set up the harness, load the harness-bootstrap skill.
- When a task touches training domain terms (planes, días de rutina, ejercicios en rutina, superseries, sesiones, series, 1RM, RPE) or business rules, load the gozster-domain skill.

# Long-Term Memory

- [verified 2026-10-19 | src: PR #63] Push protection GH007: commits must use 6156087+Fresias@users.noreply.github.com.
- [verified 2026-10-19 | src: runtime] Bash cwd persists between calls; Git Bash at C:\Program Files\Git\bin\bash.exe.
- [verified 2026-10-19 | src: tests/db] SQL/RLS tests run on @electric-sql/pglite, no Docker.
- [verified 2026-10-19 | src: docs/GLOSSARY.md] Training hierarchy: planes_entrenamiento → dias_rutina → ejercicios_en_rutina → registro_sesiones → registro_series.
- [verified 2026-10-19 | src: package.json] `npm run lint` == `tsc --noEmit` (same as typecheck).

# Tool Guidance & Execution Rules

## File Exploration & Editing
- **Scan-before-read:** Locate the exact target range first using `rg -n` or grep before reading file contents.
- **Bounded reading:** For files > 300 lines, always supply `offset` + `limit` (max 200 lines) or `StartLine` + `EndLine` (max 300 lines).
- **Time-to-First-Edit (TTFE):** Aim to read and make the first edit within ≤ 5 tool calls. Avoid wandering through unrelated directories.
- **Quiet inspection:** Prefer quiet flags like `git diff --stat` or `git status -s` before requesting full diffs.

## Test & Gate Workflow
- **Iterative development:** While working, execute ONLY the single test file affected by the change (e.g. `npx vitest run <path/to/spec.ts>`).
- **Final gate:** As the final step before handing off work, creating a PR, or requesting review, execute the full project gate synchronously.
- **Zero stale claims:** Never skip tests, mark tests `.skip` or `.todo`, or relax assertions to mask failures.

# Multica CLI Guidance (Anti-Token-Waste)

Enforce Scan-Then-Expand on all `multica` CLI invocations.

## Command Rules
- **Bounded issue queries:** Never run `multica issue list --output json` without `--limit` (max 15).
- **Scan-Then-Expand comments:**
  - Scan thread roots: `multica issue comment list <id> --roots-only --summary --compact --output json`
  - Expand specific thread: `multica issue comment list <id> --thread <comment-id> --tail 10 --compact --output json`
  - Never run `multica issue comment list` without bounding flags.
- **Large payloads:** Long descriptions and comments must always use `--description-file ./description.md` or `--content-file ./comment.md` within the task workdir (never `/tmp`).
- **Stream separation:** Never merge `stderr` into `stdout` (`2>&1`) when parsing `--output json`.

# Helper scripts (run via bash)

- `harness-kit/core/scripts/harness-gate.sh` — Full gate: append-only check, project gate commands, writes .harness/complete.json.
- `harness-kit/core/scripts/harness-init.sh` — Setup in one call: git identity, deps, harness status, optional scope.
- `harness-kit/core/scripts/harness-render.mjs` — Harness compiler & drift checker (H-03).
- `harness-kit/core/scripts/harness-telemetry.mjs` — Aggregates guard telemetry (.harness/telemetry/events.jsonl) into a summary:
