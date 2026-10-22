# GOZSter Local Guardrails

## Database & Migrations
- `supabase/migrations/` is **strictly append-only**: never edit or delete a migration (rule: `db.append-only`).
- New tables must define explicit PostgreSQL Row Level Security (RLS) policies.

## Brand & Product Integrity
- Zero references to "Mynter" in production UI and student-facing copy (ADR-005).
- Respect dual view states `SIMPLE` vs `TECNICA` (full overload) per ADR-004.

## QA & Review Rounds
- **QA `CHANGES_REQUESTED`, round 1/2 — reopen the stage:** set the Stage issue `in_progress`; comment there with blocker + detail link + round `N/2`, @mentioning the assignee (an action request, so the mention fires their run); set the QA issue `todo` until the stage is `in_review` again.
- **Round 2/2 — no re-audit, no reopen:** QA/PM set `blocked` and @mention Gabriel (human owner) with a summary of the two rejections.
