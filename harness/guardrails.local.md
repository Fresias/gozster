# GOZSter Local Guardrails

## Database & UI Contracts
- supabase/migrations/: strictly append-only, never edit/delete (db.append-only). Explicit RLS.
- Zero references to "Mynter" (ADR-005).
- Canonical UI: docs/ux-ui-review/objetivo/html/*.html. Zero demo data (ssertNoDemoLiteralsInLiveMode).

## QA & Review Rounds
- **QA CHANGES_REQUESTED r1/2:** set stage in_progress, comment blocker + round N/2 @mentioning assignee; QA issue 	odo until in_review.
- **Round 2/2:** set locked and @mention Gabriel with summary of rejections.
