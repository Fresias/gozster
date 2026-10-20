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
