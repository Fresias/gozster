# AGENTS.md

Guidance for coding agents working in this repository. Keep changes surgical
(Karpathy) and add zero new dependencies without approval (Ponytail).

## Project

GOZSter is a strength-training platform with a dual experience: a **Coach
Studio** (plan authoring, athlete management, analytics) and an **Athlete App**
(workout execution, history, offline logging).

- **Framework:** Next.js 15 (App Router) + React 19, TypeScript (`strict`).
- **UI:** Tailwind CSS + Shadcn UI (`components.json`).
- **State:** Zustand, offline-first (delta sync via `updated_at`).
- **Backend:** Supabase — PostgreSQL 15+ with strict Row Level Security (RLS).

## Commands

Verified against `package.json`:

| Task | Command |
|------|---------|
| Install (clean, CI) | `npm ci` |
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Type-check / lint | `npm run typecheck` |
| Full test suite | `npm test` |
| Single test file | `npx vitest run <path/to/file.test.ts>` |
| Seed from Mynter backup | `npm run seed:mynter` |

**Rule:** while iterating, run the single affected test file. As the **last
step** before declaring a task done, run the full gate:
`npm test && npm run typecheck && npm run build`. No stale claims.

## Layout

- `src/app/` — App Router routes: `(coach)/`, `(athlete)/`, `login/`,
  `invitacion/`, root `layout.tsx` / `page.tsx`.
- `src/components/` — `coach/`, `athlete/`, `auth/`, `ui/` (Shadcn primitives).
- `src/lib/` — shared logic: `supabase/` clients, `strength-metrics.ts`,
  `youtube.ts`, `utils.ts`. Also `src/services/`, `src/store/` (Zustand),
  `src/middleware.ts`.
- `src/__tests__/` — Vitest suite (`*.spec.ts` / `*.test.ts`).
- `supabase/migrations/` — **append-only** SQL migrations. Never edit or delete
  an existing migration; add a new timestamped file.
- `types/database.types.ts` — generated Supabase types.
- `docs/` — product and design specs.
- `tests/` — repo-level harness tests (e.g. `harness-guard.test.ts`).

## Token & Context Hygiene (Anti-Waste Rules)

- **Files:** read each file once per task. For files >300 lines, locate the
  relevant range first with `rg -n` / Grep, then read only that range using
  `offset` + `limit` (max 200 lines). **Never read `package-lock.json`.**
- **`multica` CLI:** never run `multica issue list --output json` without
  `--limit`; never run `multica issue comment list <id> --output json` without
  `--compact` plus a bounding flag (`--roots-only --summary` to explore threads,
  or `--thread <id> --tail N` to go deep).
- **Terminal output:** prefer bounded/quiet flags — e.g. `git diff --stat`
  before a full `git diff`.

These rules are enforced by `.claude/hooks/guard.sh` (PreToolUse).

## Boundaries

**Always**
- Read a file before editing it.
- Keep every change surgical and scoped to the issue (Karpathy).
- Re-run `npm test && npm run typecheck && npm run build` whenever any code file
  changed after the last run (zero stale claims).

**Ask first**
- Adding any dependency to `package.json` (Ponytail).
- Altering public contracts or schemas outside the issue's scope.

**Never**
- Push or merge directly to `main` (exclusive to `@PM-GOZster`); open a PR.
- Run `git push --force`, `git reset --hard`, or `rm -rf`.
- Read or commit `.env*` files (except `.env.example`).
- Edit or delete existing files in `supabase/migrations/`.

## More detail, loaded only when needed

- Product / design specs: `docs/`.
- Database schema, RLS and RPCs: `supabase/migrations/`.
