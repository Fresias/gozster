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
