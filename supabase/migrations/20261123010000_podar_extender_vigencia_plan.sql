-- ============================================================================
-- GOZSter: Poda de la RPC extender_vigencia_plan
-- Archivo: supabase/migrations/20261123010000_podar_extender_vigencia_plan.sql
-- Multica Issue: GOZS-712
-- La app ya no la invoca (GOZS-700); la vigencia se gestiona por contrataciones.
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.extender_vigencia_plan(uuid, integer);

COMMIT;
