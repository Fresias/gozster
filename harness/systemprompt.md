# GOZSter — System Prompt & Guidelines

## Product Vision & Architecture
GOZSter is a strength-training platform with a dual experience:
- **Coach Studio (Desktop/Web):** plan creator, student management, retention analytics, overload alerts.
- **Athlete App (Mobile-First / PWA):** live training, offline logging, timers, 1RM calculator, RPE tracking.

## Technology Stack
- **Framework:** Next.js 15 (App Router) + React 19, TypeScript (`strict`).
- **UI:** Tailwind CSS + Shadcn UI (`components.json`).
- **State:** Zustand, offline-first (delta sync via `updated_at`).
- **Backend:** Supabase — PostgreSQL 15+ with strict Row Level Security.

## Verified Commands
| Task | Command |
|---|---|
| Install (clean, CI) | `npm ci` |
| Dev server | `npm run dev` |
| Production build / start | `npm run build` / `npm start` |
| Type-check / lint | `npm run typecheck` / `npm run lint` |
| Full test suite / watch | `npm test` / `npm run test:watch` |
| Single test file | `npx vitest run <path/to/file.test.ts>` |
| Seed from Mynter backup | `npm run seed:mynter` |

**Gate:** `npm test && npm run typecheck && npm run lint && npm run build`.

## Repository Layout
- `src/app/` — App Router routes: `(coach)/`, `(athlete)/`, `login/`, `invitacion/`.
- `src/components/` — `coach/`, `athlete/`, `auth/`, `ui/` (Shadcn).
- `src/lib/` — shared logic, `supabase/` clients, `src/services/`, `src/store/`, `src/middleware.ts`.
- `src/__tests__/` — Vitest suite (`*.spec.ts` / `*.test.ts`).
- `supabase/migrations/` — append-only SQL migrations.
- `types/database.types.ts` — generated Supabase types.
- `docs/` — specs, ADRs (`docs/adr/`), glossary (`docs/GLOSSARY.md`).
- `tests/` — repo-level harness tests.

## Governance & Roles
- Squad roles: `@backend-eng`, `@frontend-eng`, `@qa-eng`, `@UI/UX & Art Director`.
- All development uses branches: `feature/<issue-#>-slug` or `fix/<issue-#>-slug`.
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`.
- Merge authority: `@PM-GOZster` is the sole authority to merge into `main`, gated on green CI and QA `APPROVED`.
- Review: `@qa-eng` applies the 6-level Selection protocol (`harness-kit/core/templates/review-selection.md`) on every PR via the PR template (`.github/pull_request_template.md`).
