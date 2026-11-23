-- GOZS-706: job diario de contrataciones con pg_cron.
--
-- public.job_diario_contrataciones() es el único punto de entrada del job:
-- hoy evalúa vencimientos (VIGENTE -> POR_VENCER / VENCIDA). La generación
-- automática de cuotas mensuales (PL-15) se agrega como un paso más dentro de
-- esta función, sin tocar el schedule. Devuelve jsonb para poder sumar claves
-- sin cambiar la firma.
--
-- Horario: 06:05 UTC = 03:05 en Argentina (UTC-3). A esa hora CURRENT_DATE
-- en UTC coincide con la fecha local, así que el corte de vencimiento es el
-- del día argentino.
--
-- Idempotente: CREATE OR REPLACE, CREATE EXTENSION IF NOT EXISTS y
-- cron.schedule con nombre (reprograma si ya existe). Si pg_cron no está
-- disponible (PGlite en tests) el bloque de agenda se omite con un NOTICE.

BEGIN;

CREATE OR REPLACE FUNCTION public.job_diario_contrataciones()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_resultado jsonb := '{}'::jsonb;
  v_por_vencer INT;
  v_vencidas INT;
BEGIN
  -- Paso 1: vencimientos. La propia función valida el llamador
  -- (job sin JWT, service_role o ADMIN).
  SELECT e.por_vencer, e.vencidas
  INTO v_por_vencer, v_vencidas
  FROM public.evaluar_vencimientos_contrataciones() e;

  v_resultado := v_resultado || jsonb_build_object(
    'por_vencer', v_por_vencer,
    'vencidas', v_vencidas
  );

  -- Paso 2 (PL-15): generación automática de cuotas mensuales. Va acá.

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION public.job_diario_contrataciones() IS
  'Job diario (pg_cron gozster_job_diario_contrataciones): vencimientos de contrataciones; PL-15 suma la generación de cuotas.';

REVOKE EXECUTE ON FUNCTION public.job_diario_contrataciones() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_diario_contrataciones() TO service_role;

DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron no disponible: se omite la agenda del job diario';
    RETURN;
  END IF;

  EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog';

  PERFORM cron.schedule(
    'gozster_job_diario_contrataciones',
    '5 6 * * *',
    'SELECT public.job_diario_contrataciones()'
  );
END;
$cron$;

COMMIT;
