-- ============================================================================
-- GOZSter · Ola C (GOZS-882): Triggers de volumen O(1), poda de índice,
-- base Live Tracker en registro_sesiones y push al entrenador al finalizar
-- entrenamiento.
--
-- Archivo: supabase/migrations/20261126180000_ola_c_triggers_volumen_livetracker_push.sql
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

-- ============================================================================
-- A. Optimización de trg_registro_sesiones_volumen (public.calcular_volumen_sesion)
--    Fast-path en INSERT (FK registro_series.sesion_id es NOT DEFERRABLE -> 0 series).
--    Trigger acotado a INSERT OR UPDATE OF volumen_total_kg, effective_volume_kg.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calcular_volumen_sesion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.volumen_total_kg := 0;
    NEW.effective_volume_kg := 0;
    RETURN NEW;
  END IF;

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
  BEFORE INSERT OR UPDATE OF volumen_total_kg, effective_volume_kg ON public.registro_sesiones
  FOR EACH ROW EXECUTE FUNCTION public.calcular_volumen_sesion();

REVOKE ALL ON FUNCTION public.calcular_volumen_sesion() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- B. Triggers FOR EACH STATEMENT en public.registro_series (O(1) por batch)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_registro_series_volumen_ins_del ON public.registro_series;
DROP TRIGGER IF EXISTS trg_registro_series_volumen_upd ON public.registro_series;
DROP FUNCTION IF EXISTS public.recalcular_volumen_sesion_por_serie();

CREATE OR REPLACE FUNCTION public.recalcular_volumen_sesion_stmt_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.registro_sesiones
  SET volumen_total_kg = volumen_total_kg
  WHERE id IN (
    SELECT DISTINCT n.sesion_id
    FROM new_rows n
    WHERE n.completada
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalcular_volumen_sesion_stmt_upd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.registro_sesiones
  SET volumen_total_kg = volumen_total_kg
  WHERE id IN (
    SELECT n.sesion_id
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    WHERE (n.completada OR o.completada)
      AND (
        n.peso_kg IS DISTINCT FROM o.peso_kg
        OR n.reps_hechas IS DISTINCT FROM o.reps_hechas
        OR n.completada IS DISTINCT FROM o.completada
        OR n.set_type IS DISTINCT FROM o.set_type
        OR n.sesion_id IS DISTINCT FROM o.sesion_id
      )
    UNION
    SELECT o.sesion_id
    FROM new_rows n
    JOIN old_rows o ON o.id = n.id
    WHERE o.completada
      AND n.sesion_id IS DISTINCT FROM o.sesion_id
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalcular_volumen_sesion_stmt_del()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.registro_sesiones
  SET volumen_total_kg = volumen_total_kg
  WHERE id IN (
    SELECT DISTINCT o.sesion_id
    FROM old_rows o
    WHERE o.completada
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_registro_series_volumen_ins ON public.registro_series;
CREATE TRIGGER trg_registro_series_volumen_ins
  AFTER INSERT ON public.registro_series
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.recalcular_volumen_sesion_stmt_ins();

DROP TRIGGER IF EXISTS trg_registro_series_volumen_upd ON public.registro_series;
CREATE TRIGGER trg_registro_series_volumen_upd
  AFTER UPDATE ON public.registro_series
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.recalcular_volumen_sesion_stmt_upd();

DROP TRIGGER IF EXISTS trg_registro_series_volumen_del ON public.registro_series;
CREATE TRIGGER trg_registro_series_volumen_del
  AFTER DELETE ON public.registro_series
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.recalcular_volumen_sesion_stmt_del();

REVOKE ALL ON FUNCTION public.recalcular_volumen_sesion_stmt_ins() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalcular_volumen_sesion_stmt_upd() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalcular_volumen_sesion_stmt_del() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- C. Optimización de trg_crear_alerta_dolor (WHEN pain_reported IS TRUE)
--    Sin modificar fn_crear_alerta_dolor(), respetando app.skip_serie_pain_alert.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_crear_alerta_dolor ON public.registro_series;
CREATE TRIGGER trg_crear_alerta_dolor
  AFTER INSERT OR UPDATE ON public.registro_series
  FOR EACH ROW
  WHEN (NEW.pain_reported IS TRUE)
  EXECUTE FUNCTION public.fn_crear_alerta_dolor();

-- ============================================================================
-- D. Poda de índice redundante (cubierto por UNIQUE (sesion_id, ejercicio_id, numero_serie))
-- ============================================================================

DROP INDEX IF EXISTS public.idx_registro_series_sesion_ejercicio;

-- ============================================================================
-- E. Base Live Tracker en public.registro_sesiones + blindaje de vistas/triggers
-- ============================================================================

ALTER TABLE public.registro_sesiones
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'COMPLETADA'
  CHECK (estado IN ('EN_CURSO', 'COMPLETADA'));

ALTER TABLE public.registro_sesiones
  ADD COLUMN IF NOT EXISTS finalizada_at TIMESTAMPTZ;

UPDATE public.registro_sesiones
SET finalizada_at = COALESCE(updated_at, fecha)
WHERE estado = 'COMPLETADA'
  AND finalizada_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_registro_sesiones_en_curso
  ON public.registro_sesiones (alumno_id, updated_at DESC)
  WHERE estado = 'EN_CURSO';

CREATE OR REPLACE VIEW public.v_prs
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (s.alumno_id, rs.ejercicio_id)
  s.alumno_id,
  rs.ejercicio_id,
  rs.peso_kg,
  rs.reps_hechas AS reps,
  s.fecha::date AS fecha,
  rs.id AS serie_id
FROM public.registro_series rs
JOIN public.registro_sesiones s ON s.id = rs.sesion_id
WHERE rs.completada
  AND s.estado = 'COMPLETADA'
  AND rs.peso_kg > 0
  AND rs.reps_hechas > 0
  AND rs.set_type NOT IN ('WARMUP', 'W')
ORDER BY s.alumno_id, rs.ejercicio_id, rs.peso_kg DESC, rs.reps_hechas DESC, s.fecha ASC, rs.id;

REVOKE ALL ON public.v_prs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_prs TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_actualizar_ultimo_entreno()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'COMPLETADA' THEN
    UPDATE public.perfiles
    SET ultimo_entreno_at = now(),
        updated_at = now()
    WHERE id = NEW.alumno_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_ultimo_entreno ON public.registro_sesiones;
CREATE TRIGGER trg_actualizar_ultimo_entreno
  AFTER INSERT OR UPDATE OF estado ON public.registro_sesiones
  FOR EACH ROW
  WHEN (NEW.estado = 'COMPLETADA')
  EXECUTE FUNCTION public.fn_actualizar_ultimo_entreno();

REVOKE ALL ON FUNCTION public.fn_actualizar_ultimo_entreno() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- F. Desacople de public.push_cola + Trigger ACTIVO de push al entrenador
--    cuando un alumno finaliza su entrenamiento
-- ============================================================================

ALTER TABLE public.push_cola
  ALTER COLUMN mensaje_id DROP NOT NULL;

ALTER TABLE public.push_cola
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'MENSAJE_CHAT'
  CHECK (tipo IN ('MENSAJE_CHAT', 'SESION_COMPLETADA', 'ALERTA_DOLOR', 'RECORD_1RM'));

ALTER TABLE public.push_cola
  ADD COLUMN IF NOT EXISTS sesion_id UUID REFERENCES public.registro_sesiones(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_push_cola_referencia_valida'
      AND conrelid = 'public.push_cola'::regclass
  ) THEN
    ALTER TABLE public.push_cola
      ADD CONSTRAINT chk_push_cola_referencia_valida
      CHECK (
        (tipo = 'MENSAJE_CHAT' AND mensaje_id IS NOT NULL)
        OR (tipo = 'SESION_COMPLETADA' AND sesion_id IS NOT NULL)
        OR (tipo IN ('ALERTA_DOLOR', 'RECORD_1RM'))
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_cola_sesion_unica
  ON public.push_cola (destinatario_id, sesion_id)
  WHERE sesion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_cola_sesion_id
  ON public.push_cola (sesion_id)
  WHERE sesion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_notificar_sesion_completada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profesor_id UUID;
BEGIN
  IF NOT (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'COMPLETADA') THEN
    RETURN NEW;
  END IF;

  -- Omitir marcas presenciales de Funcional (clase_id) o cargas efectuadas por otro usuario (coach/admin).
  IF NEW.clase_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> NEW.alumno_id THEN
    RETURN NEW;
  END IF;

  SELECT p.profesor_asignado_id
  INTO v_profesor_id
  FROM public.perfiles p
  WHERE p.id = NEW.alumno_id;

  IF v_profesor_id IS NULL OR v_profesor_id = NEW.alumno_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.push_cola (destinatario_id, tipo, sesion_id)
  VALUES (v_profesor_id, 'SESION_COMPLETADA', NEW.id)
  ON CONFLICT (destinatario_id, sesion_id) WHERE sesion_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_sesion_completada ON public.registro_sesiones;
CREATE TRIGGER trg_notificar_sesion_completada
  AFTER INSERT OR UPDATE OF estado ON public.registro_sesiones
  FOR EACH ROW
  WHEN (NEW.estado = 'COMPLETADA')
  EXECUTE FUNCTION public.fn_notificar_sesion_completada();

REVOKE ALL ON FUNCTION public.fn_notificar_sesion_completada() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.reclamar_push_pendientes(INT);
CREATE FUNCTION public.reclamar_push_pendientes(p_limite INT DEFAULT 100)
RETURNS TABLE (id UUID, destinatario_id UUID, tipo TEXT)
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  UPDATE public.push_cola c
  SET enviado_at = now()
  WHERE c.id IN (
    SELECT p.id FROM public.push_cola p
    WHERE p.enviado_at IS NULL
    ORDER BY p.created_at
    LIMIT GREATEST(p_limite, 0)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING c.id, c.destinatario_id, c.tipo;
$$;

REVOKE ALL ON FUNCTION public.reclamar_push_pendientes(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_push_pendientes(INT) TO service_role;

COMMIT;
