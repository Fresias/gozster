# GOZSter — System Prompt & Guidelines

Guidance for coding agents working in the GOZSter repository. Keep changes surgical (Karpathy) and add zero new dependencies without approval (Ponytail).

## Product Vision & Architecture
GOZSter is a high-performance strength-training platform with a dual experience:
- **Coach Studio (Desktop/Web):** visual workout plan creator, student management, retention analytics, progressive overload alerts.
- **Athlete App (Mobile-First / PWA):** live training execution, offline logging, automatic timers, 1RM calculator, RPE tracking.

## Technology Stack
- **Framework:** Next.js 15 (App Router) + React 19, TypeScript (`strict`).
- **UI:** Tailwind CSS + Shadcn UI (`components.json`).
- **State:** Zustand, offline-first (delta sync via `updated_at`).
- **Backend:** Supabase — PostgreSQL 15+ with strict Row Level Security (RLS).

## Verified Commands
Verified against `package.json`:

| Task | Command |
|---|---|
| Install (clean, CI) | `npm ci` |
| Dev server | `npm run dev` |
| Production build / start | `npm run build` / `npm start` |
| Type-check / lint | `npm run typecheck` / `npm run lint` |
| Full test suite / watch | `npm test` / `npm run test:watch` |
| Single test file | `npx vitest run <path/to/file.test.ts>` |
| Seed from Mynter backup | `npm run seed:mynter` |

**Gate Rule:** While iterating, run the single affected test file. As the final step before declaring work done, run the full gate:
`npm test && npm run typecheck && npm run lint && npm run build`. Zero stale claims.

## Repository Layout
- `src/app/` — App Router routes: `(coach)/`, `(athlete)/`, `login/`, `invitacion/`, root `layout.tsx` / `page.tsx`.
- `src/components/` — `coach/`, `athlete/`, `auth/`, `ui/` (Shadcn primitives).
- `src/lib/` — shared logic: `supabase/` clients, `strength-metrics.ts`, `youtube.ts`, `utils.ts`, `src/services/`, `src/store/` (Zustand), `src/middleware.ts`.
- `src/__tests__/` — Vitest suite (`*.spec.ts` / `*.test.ts`).
- `supabase/migrations/` — **append-only** SQL migrations. Never edit or delete an existing migration; add a new timestamped file.
- `types/database.types.ts` — generated Supabase types.
- `docs/` — product and design specs, ADRs (`docs/adr/`), glossary (`docs/GLOSSARY.md`).
- `tests/` — repo-level harness tests (e.g. `harness-guard.test.ts`).

## Governance & Roles
- Squad roles: `@backend-eng`, `@frontend-eng`, `@qa-eng`, `@UI/UX & Art Director`.
- All development uses branches: `feature/<issue-#>-slug` or `fix/<issue-#>-slug`.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`.
- Merge authority: `@PM-GOZster` is the sole authority to merge into `main`, gated on green CI and QA `APPROVED`.

# Core Guardrails (Invariants)

Universal invariants enforced across all supported runtimes. Every negative rule maps to a deterministic guard check.

## Always
- Read a file before editing it; understand the surrounding context first.
- Keep every change surgical, minimal and strictly scoped to the task (Karpathy).
- Re-run the project gate before declaring a task completed or opening a PR (zero stale claims).

## Ask First
- Adding any external dependency to the project manifest (Ponytail).
- Modifying public APIs, interfaces or schemas outside the issue's stated scope.

## Never (Enforced by Guard)
- Destructive git and shell commands: `git push --force`, `git push origin +branch`, `git reset --hard`, `git clean -fd`, `rm -rf`, `sudo` (rule: `shell.destructive`).
- Reading or exposing secrets: never read or commit `.env*` files, except `.env.example`, `.env.sample`, `.env.template` (rule: `fs.env-leak`).
- Reading entire lockfiles or massive build outputs: never read `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `.next/`, `node_modules/`, `dist/`, `build/` (rule: `fs.bloatware`).
- Unbounded file reading: never read files exceeding 300 lines without specifying line limits/offsets (rule: `read.oversize`).
- Altering the harness integrity: never modify or bypass guard hooks, runtime settings or git hooks without explicit authorization (rule: `fs.protected`).

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

# Tool Guidance & Execution Rules

Best practices for token efficiency and surgical execution.

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

## Skills

- When the repository has no harness/project.json or the user asks to set up the harness, load the harness-bootstrap skill.
- When a task touches training domain terms (planes, días de rutina, ejercicios en rutina, superseries, sesiones, series, 1RM, RPE) or business rules, load the gozster-domain skill.
