# GOZSter Local Guardrails

## Database & Migrations
- `supabase/migrations/` is **strictly append-only**: never edit or delete a migration (rule: `db.append-only`).
- All new database tables must define explicit PostgreSQL Row Level Security (RLS) policies.

## Brand & Product Integrity
- Zero references to "Mynter" in production UI and student-facing copy (ADR-005).
- Respect dual view states: `SIMPLE` (clean, distraction-free) vs `TECNICA` (full overload details) per ADR-004.

## QA & Review Rounds
- **Max 2 QA rounds per PR:** a 3rd round means no re-audit — QA/PM set `blocked` and mention Gabriel (human owner) with a summary of the two rejections.
