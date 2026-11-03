# GOZSter Local Guardrails

## Database & Migrations
- `supabase/migrations/` is **strictly append-only**: never edit or delete a migration (rule: `db.append-only`).
- New tables must define explicit PostgreSQL Row Level Security (RLS) policies.

## Brand & Product Integrity
- Zero references to "Mynter" in production UI and student-facing copy (ADR-005).
- Respect dual view states `SIMPLE` vs `TECNICA` (full overload) per ADR-004.

## QA & Review Rounds
- **QA `CHANGES_REQUESTED`, round 1/2:** set stage `in_progress`, comment blocker + link + round `N/2` @mentioning assignee; set QA issue `todo` until `in_review`.
- **Round 2/2:** set `blocked` and @mention Gabriel with summary of rejections (no reopen).
