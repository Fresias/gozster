-- ============================================================================
-- GOZSter: Evitar ambigüedad entre parámetro y columna `numero_ciclo` en
-- `registrar_logro_racha` usando `ON CONFLICT ON CONSTRAINT` y `#variable_conflict`.
-- Archivo: supabase/migrations/20261121223500_registrar_logro_racha_fix_conflict.sql
-- Multica Issue: GOZS-679 (Épica GOZS-678 · GitHub #587)
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_logro_racha(
  numero_ciclo INTEGER,
  tipo TEXT DEFAULT 'diamante'
)
RETURNS public.logros_racha
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_alumno_id UUID := auth.uid();
  v_numero_ciclo INTEGER := registrar_logro_racha.numero_ciclo;
  v_tipo TEXT := COALESCE(registrar_logro_racha.tipo, 'diamante');
  v_logro public.logros_racha;
BEGIN
  IF v_alumno_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  IF v_numero_ciclo IS NULL OR v_numero_ciclo < 1 THEN
    RAISE EXCEPTION 'numero_ciclo debe ser >= 1' USING ERRCODE = '23514';
  END IF;

  IF v_tipo <> 'diamante' THEN
    RAISE EXCEPTION 'tipo de logro inválido: %', v_tipo USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.logros_racha (alumno_id, numero_ciclo, tipo)
  VALUES (v_alumno_id, v_numero_ciclo, v_tipo)
  ON CONFLICT ON CONSTRAINT uq_logros_racha_alumno_ciclo_tipo DO NOTHING;

  SELECT *
  INTO v_logro
  FROM public.logros_racha l
  WHERE l.alumno_id = v_alumno_id
    AND l.numero_ciclo = v_numero_ciclo
    AND l.tipo = v_tipo;

  RETURN v_logro;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_logro_racha(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_logro_racha(INTEGER, TEXT) TO authenticated, service_role;

COMMIT;
