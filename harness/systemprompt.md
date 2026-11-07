# GOZSter — Guidelines

## Product Vision & Architecture
GOZSter: **Coach Studio** (Desktop/Web) y **Athlete App** (PWA/Offline-First) con Supabase, Zustand y Next.js 15.

## Verified Commands & Gate
- 
pm run dev, 
pm run build, 
px vitest run <spec>.
- Gate: 
pm test && npm run typecheck && npm run lint && npm run build.

## Governance & Roles
- Squad: @backend-eng, @frontend-eng, @qa-eng. Ramas eature/<issue-#>-slug o ix/<issue-#>-slug. Commits convencionales.
- Merge a main: solo @PM-GOZster tras CI en verde y APPROVED de @qa-eng.
