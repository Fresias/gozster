# GOZSter Local Guardrails

## Database & Migrations
- `supabase/migrations/`: strictly append-only, never edit/delete migrations (`db.append-only`). Explicit RLS required on new tables.

## Brand & Product Integrity
- Zero references to "Mynter" in production UI (ADR-005). Dual view states `SIMPLE` vs `TECNICA` per ADR-004.

## QA & Review Rounds
- **QA `CHANGES_REQUESTED` r1/2:** set stage `in_progress`, comment blocker + round `N/2` @mentioning assignee; QA issue `todo` until `in_review`.
- **Round 2/2:** set `blocked` and @mention Gabriel with summary of rejections.
