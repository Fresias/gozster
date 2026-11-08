# GOZSter — System Prompt & Guidelines

## Product Vision & Architecture
GOZSter: **Coach Studio** (Desktop/Web) y **Athlete App** (PWA/Offline-First) con Supabase, Zustand y Next.js 15.

## Verified Commands & Gate
- `npm ci`, `npm run dev`, `npm run build`, `npm run typecheck`, `npm test`, `npx vitest run`, `npm run seed:mynter`.
- Gate: `npm test && npm run typecheck && npm run lint && npm run build`.

## Governance & Roles
- Squad: @backend-eng, @frontend-eng, @qa-eng. Ramas `feature/<issue-#>-slug` o `fix/<issue-#>-slug`. Commits convencionales.
- Merge a main: solo @PM-GOZster tras CI en verde y APPROVED de @qa-eng.
- Review: @qa-eng aplica el protocolo de 6 niveles (`review-selection.md`) en cada PR.
