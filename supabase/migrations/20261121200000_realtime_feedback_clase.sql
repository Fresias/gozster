-- ============================================================================
-- GOZSter: Publicar public.feedback_clase en supabase_realtime
-- Archivo: supabase/migrations/20261121200000_realtime_feedback_clase.sql
-- Multica Issue: GOZS-672 (Épica GOZS-671)
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

-- Garantiza que payload.old incluya reserva_id en eventos DELETE.
ALTER TABLE public.feedback_clase REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'feedback_clase'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_clase;
  END IF;
END $$;

COMMIT;
