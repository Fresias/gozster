-- ============================================================================
-- GOZSter: Volumen de sesión calculado en la base y tempo '0' -> NULL
-- Archivo: supabase/migrations/20261122210000_volumen_sesion_en_base_y_tempo_nulo.sql
-- Multica Issue: GOZS-701
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
--
-- 1) registro_sesiones.volumen_total_kg / effective_volume_kg pasan a derivarse
--    siempre de registro_series (series completadas; el efectivo excluye
--    calentamiento). Lo que mande el cliente se ignora.
-- 2) Recalcula las sesiones existentes que tienen series y un volumen desfasado.
-- 3) ejercicios_en_rutina.tempo: '0' o vacío no es un tempo -> NULL, también a
--    futuro. La unificación con tempo_activo queda fuera de alcance.
-- ============================================================================

BEGIN;

-- 1a) BEFORE INSERT/UPDATE en registro_sesiones: el volumen sale de sus series.
--     SECURITY DEFINER para sumar todas las series aunque quien escribe no las
--     vea todas por RLS (p. ej. un entrenador); solo lee la sesión de NEW.id.
CREATE OR REPLACE FUNCTION public.calcular_volumen_sesion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT
    COALESCE(SUM(s.peso_kg * s.reps_hechas), 0),
    COALESCE(SUM(s.peso_kg * s.reps_hechas)
      FILTER (WHERE upper(s.set_type) NOT IN ('WARMUP', 'W')), 0)
  INTO NEW.volumen_total_kg, NEW.effective_volume_kg
  FROM public.registro_series s
  WHERE s.sesion_id = NEW.id
    AND s.completada;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registro_sesiones_volumen ON public.registro_sesiones;
CREATE TRIGGER trg_registro_sesiones_volumen
  BEFORE INSERT OR UPDATE ON public.registro_sesiones
  FOR EACH ROW EXECUTE FUNCTION public.calcular_volumen_sesion();

-- 1b) AFTER en registro_series: tocar la sesión dispara el recálculo de 1a
--     (y actualiza updated_at para el delta sync).
CREATE OR REPLACE FUNCTION public.recalcular_volumen_sesion_por_serie()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE public.registro_sesiones SET volumen_total_kg = volumen_total_kg
    WHERE id = NEW.sesion_id;
  END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.sesion_id IS DISTINCT FROM NEW.sesion_id) THEN
    UPDATE public.registro_sesiones SET volumen_total_kg = volumen_total_kg
    WHERE id = OLD.sesion_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_registro_series_volumen_ins_del ON public.registro_series;
CREATE TRIGGER trg_registro_series_volumen_ins_del
  AFTER INSERT OR DELETE ON public.registro_series
  FOR EACH ROW EXECUTE FUNCTION public.recalcular_volumen_sesion_por_serie();

DROP TRIGGER IF EXISTS trg_registro_series_volumen_upd ON public.registro_series;
CREATE TRIGGER trg_registro_series_volumen_upd
  AFTER UPDATE OF peso_kg, reps_hechas, completada, set_type, sesion_id ON public.registro_series
  FOR EACH ROW EXECUTE FUNCTION public.recalcular_volumen_sesion_por_serie();

-- Funciones trigger: nadie las invoca por RPC.
REVOKE ALL ON FUNCTION public.calcular_volumen_sesion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalcular_volumen_sesion_por_serie() FROM PUBLIC, anon, authenticated;

-- 2) Backfill: solo sesiones con series cuyo volumen guardado no coincide.
--    Las sesiones sin series conservan su valor histórico.
WITH calculado AS (
  SELECT
    s.sesion_id,
    COALESCE(SUM(s.peso_kg * s.reps_hechas) FILTER (WHERE s.completada), 0) AS total,
    COALESCE(SUM(s.peso_kg * s.reps_hechas)
      FILTER (WHERE s.completada AND upper(s.set_type) NOT IN ('WARMUP', 'W')), 0) AS efectivo
  FROM public.registro_series s
  GROUP BY s.sesion_id
)
UPDATE public.registro_sesiones rs
SET volumen_total_kg = c.total
FROM calculado c
WHERE c.sesion_id = rs.id
  AND (rs.volumen_total_kg <> c.total OR rs.effective_volume_kg <> c.efectivo);

-- 3) tempo '0' / vacío -> NULL (existentes y futuros).
CREATE OR REPLACE FUNCTION public.normalizar_tempo_ejercicio_en_rutina()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF btrim(NEW.tempo) IN ('0', '') THEN
    NEW.tempo := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ejercicios_en_rutina_tempo_nulo ON public.ejercicios_en_rutina;
CREATE TRIGGER trg_ejercicios_en_rutina_tempo_nulo
  BEFORE INSERT OR UPDATE OF tempo ON public.ejercicios_en_rutina
  FOR EACH ROW EXECUTE FUNCTION public.normalizar_tempo_ejercicio_en_rutina();

REVOKE ALL ON FUNCTION public.normalizar_tempo_ejercicio_en_rutina() FROM PUBLIC, anon, authenticated;

UPDATE public.ejercicios_en_rutina
SET tempo = NULL
WHERE btrim(tempo) IN ('0', '');

COMMIT;
