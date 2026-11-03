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
