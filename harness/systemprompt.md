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
- Review: `@qa-eng` applies the 6-level Selection protocol (`harness-kit/core/templates/review-selection.md`) on every PR and `@PM-GOZster` before merge; the PR template (`.github/pull_request_template.md`) carries the table to fill.
