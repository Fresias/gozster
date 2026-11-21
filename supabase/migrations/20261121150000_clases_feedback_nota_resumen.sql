-- ============================================================================
-- GOZSter: Experiencia para alumnos de clases (feedback post-clase, nota de
-- clase y resumen semanal con racha por asistencia).
-- Archivo: supabase/migrations/20261121150000_clases_feedback_nota_resumen.sql
-- Multica Issue: GOZS-663 (Épica GOZS-662)
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. COLUMNA: public.clases.nota (opcional, máx. 280 caracteres)
-- ============================================================================

ALTER TABLE public.clases
  ADD COLUMN IF NOT EXISTS nota TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.clases'::regclass
      AND conname = 'chk_clases_nota_largo'
  ) THEN
    ALTER TABLE public.clases
      ADD CONSTRAINT chk_clases_nota_largo
      CHECK (nota IS NULL OR char_length(nota) <= 280);
  END IF;
END $$;

-- ============================================================================
-- 2. TABLA: public.feedback_clase (1 feedback por reserva, sensación 1..4)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.feedback_clase (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id UUID NOT NULL UNIQUE REFERENCES public.reservas(id) ON DELETE CASCADE,
  sensacion SMALLINT NOT NULL CHECK (sensacion BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_feedback_clase_updated_at ON public.feedback_clase;
CREATE TRIGGER trg_feedback_clase_updated_at
  BEFORE UPDATE ON public.feedback_clase
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_feedback_clase_updated_at
  ON public.feedback_clase (updated_at);

-- ============================================================================
-- 3. ROW LEVEL SECURITY: public.feedback_clase
--    - Alumno dueño de la reserva ANOTADO en clase PROGRAMADA:
--      * SELECT: su propio feedback (necesario para historial > 48h).
--      * INSERT / UPDATE: solo cuando la clase ya inició y hasta 48 h después.
--    - Profesores / admins del gimnasio: SELECT sobre todo feedback.
--    - Nadie más (ni anon, ni otros alumnos, ni DELETE).
-- ============================================================================

ALTER TABLE public.feedback_clase ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_clase_select" ON public.feedback_clase;
CREATE POLICY "feedback_clase_select"
  ON public.feedback_clase FOR SELECT TO authenticated
  USING (
    public.es_entrenador_o_admin()
    OR EXISTS (
      SELECT 1
      FROM public.reservas r
      WHERE r.id = reserva_id
        AND r.alumno_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "feedback_clase_insert_alumno" ON public.feedback_clase;
CREATE POLICY "feedback_clase_insert_alumno"
  ON public.feedback_clase FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.reservas r
      JOIN public.clases c ON c.id = r.clase_id
      WHERE r.id = reserva_id
        AND r.alumno_id = (SELECT auth.uid())
        AND r.estado = 'ANOTADO'
        AND c.estado = 'PROGRAMADA'
        AND c.inicio <= now()
        AND now() <= c.inicio + INTERVAL '48 hours'
    )
  );

DROP POLICY IF EXISTS "feedback_clase_update_alumno" ON public.feedback_clase;
CREATE POLICY "feedback_clase_update_alumno"
  ON public.feedback_clase FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.reservas r
      JOIN public.clases c ON c.id = r.clase_id
      WHERE r.id = reserva_id
        AND r.alumno_id = (SELECT auth.uid())
        AND r.estado = 'ANOTADO'
        AND c.estado = 'PROGRAMADA'
        AND c.inicio <= now()
        AND now() <= c.inicio + INTERVAL '48 hours'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.reservas r
      JOIN public.clases c ON c.id = r.clase_id
      WHERE r.id = reserva_id
        AND r.alumno_id = (SELECT auth.uid())
        AND r.estado = 'ANOTADO'
        AND c.estado = 'PROGRAMADA'
        AND c.inicio <= now()
        AND now() <= c.inicio + INTERVAL '48 hours'
    )
  );

REVOKE ALL ON public.feedback_clase FROM anon;
REVOKE DELETE ON public.feedback_clase FROM authenticated;

-- ============================================================================
-- 4. RPC: public.resumen_clases_alumno(p_desde DATE DEFAULT NULL)
--    SECURITY INVOKER usando auth.uid().
--    Asistencia = reserva ANOTADO de una clase PROGRAMADA cuyo inicio ya pasó.
--    Semana: lunes 00:00 a domingo 23:59:59 en America/Argentina/Buenos_Aires
--    (misma convención que calcularRachaSemanas en src/lib/athlete-dias.ts).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resumen_clases_alumno(p_desde DATE DEFAULT NULL)
RETURNS TABLE (
  usadas_semana INT,
  limite_semanal INT,
  racha_semanas INT,
  asistencias JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  c_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_alumno UUID := auth.uid();
  v_ahora TIMESTAMPTZ := now();
  v_hoy DATE := (v_ahora AT TIME ZONE c_tz)::date;
  v_lunes TIMESTAMPTZ := date_trunc('week', v_ahora AT TIME ZONE c_tz) AT TIME ZONE c_tz;
  v_semana_actual DATE := (date_trunc('week', v_ahora AT TIME ZONE c_tz))::date;
  v_usadas INT := 0;
  v_limite INT := NULL;
  v_tiene_plan_activo BOOLEAN := false;
  v_racha INT := 0;
  v_esperada DATE := NULL;
  v_sem DATE;
  v_asistencias JSONB := '[]'::jsonb;
  v_estado_membresia public.estado_membresia;
BEGIN
  IF v_alumno IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  -- 1. Clases usadas esta semana (ANOTADO y AUSENTE en clases PROGRAMADA de la semana en curso)
  SELECT count(DISTINCT r.clase_id)::INT INTO v_usadas
  FROM public.reservas r
  JOIN public.clases c ON c.id = r.clase_id
  WHERE r.alumno_id = v_alumno
    AND r.estado IN ('ANOTADO', 'AUSENTE')
    AND c.estado = 'PROGRAMADA'
    AND c.inicio >= v_lunes
    AND c.inicio < v_lunes + INTERVAL '7 days';

  -- 2. Límite semanal vigente (NULL = pase libre o sin límite)
  SELECT EXISTS (
    SELECT 1
    FROM public.contrataciones c
    WHERE c.alumno_id = v_alumno
      AND c.plan_membresia_id IS NOT NULL
      AND c.estado NOT IN ('EN_PAUSA', 'VENCIDA')
      AND c.fecha_inicio <= v_hoy
      AND c.fecha_fin >= v_hoy
  ) INTO v_tiene_plan_activo;

  IF v_tiene_plan_activo THEN
    SELECT CASE
      WHEN bool_or(pm.limite_semanal IS NULL) THEN NULL
      ELSE sum(pm.limite_semanal)::INT
    END INTO v_limite
    FROM (
      SELECT DISTINCT ON (COALESCE(c.actividad, '__AMBAS__')) pm.limite_semanal
      FROM public.contrataciones c
      JOIN public.planes_membresia pm ON pm.id = c.plan_membresia_id
      WHERE c.alumno_id = v_alumno
        AND c.plan_membresia_id IS NOT NULL
        AND c.estado NOT IN ('EN_PAUSA', 'VENCIDA')
        AND c.fecha_inicio <= v_hoy
        AND c.fecha_fin >= v_hoy
      ORDER BY COALESCE(c.actividad, '__AMBAS__'), c.fecha_fin DESC, c.created_at DESC
    ) pm;
  ELSIF EXISTS (
    SELECT 1
    FROM public.contrataciones c
    WHERE c.alumno_id = v_alumno
      AND c.estado NOT IN ('EN_PAUSA', 'VENCIDA')
      AND c.fecha_inicio <= v_hoy
      AND c.fecha_fin >= v_hoy
  ) OR NOT EXISTS (
    SELECT 1 FROM public.contrataciones c WHERE c.alumno_id = v_alumno
  ) THEN
    SELECT estado_membresia INTO v_estado_membresia
    FROM public.perfiles WHERE id = v_alumno;

    IF v_estado_membresia IS NULL OR v_estado_membresia NOT IN ('INACTIVA', 'BAJA', 'EXPIRED_PAYMENT_PENDING', 'ARCHIVED') THEN
      SELECT CASE
        WHEN bool_or(aa.pase_libre) THEN NULL
        ELSE sum(aa.veces_por_semana)::INT
      END INTO v_limite
      FROM public.alumno_actividades aa
      WHERE aa.alumno_id = v_alumno
        AND aa.actividad IN ('FUNCIONAL', 'BOXEO');
    END IF;
  END IF;

  -- 3. Racha semanal por asistencia (si la semana en curso aún no tiene asistencias,
  --    continúa desde la semana anterior cerrada).
  FOR v_sem IN
    SELECT DISTINCT (date_trunc('week', c.inicio AT TIME ZONE c_tz))::date AS semana
    FROM public.reservas r
    JOIN public.clases c ON c.id = r.clase_id
    WHERE r.alumno_id = v_alumno
      AND r.estado = 'ANOTADO'
      AND c.estado = 'PROGRAMADA'
      AND c.inicio <= v_ahora
    ORDER BY semana DESC
  LOOP
    IF v_esperada IS NULL THEN
      IF v_sem = v_semana_actual THEN
        v_racha := 1;
        v_esperada := v_semana_actual - 7;
      ELSIF v_sem = v_semana_actual - 7 THEN
        v_racha := 1;
        v_esperada := v_semana_actual - 14;
      ELSE
        EXIT;
      END IF;
    ELSIF v_sem = v_esperada THEN
      v_racha := v_racha + 1;
      v_esperada := v_esperada - 7;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  -- 4. Historial de asistencias
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'reserva_id', r.id,
        'clase_id', c.id,
        'actividad', c.actividad,
        'inicio', c.inicio,
        'sensacion', fc.sensacion,
        'nota', c.nota
      )
      ORDER BY c.inicio DESC
    ),
    '[]'::jsonb
  ) INTO v_asistencias
  FROM public.reservas r
  JOIN public.clases c ON c.id = r.clase_id
  LEFT JOIN public.feedback_clase fc ON fc.reserva_id = r.id
  WHERE r.alumno_id = v_alumno
    AND r.estado = 'ANOTADO'
    AND c.estado = 'PROGRAMADA'
    AND c.inicio <= v_ahora
    AND (p_desde IS NULL OR (c.inicio AT TIME ZONE c_tz)::date >= p_desde);

  usadas_semana := v_usadas;
  limite_semanal := v_limite;
  racha_semanas := v_racha;
  asistencias := v_asistencias;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.resumen_clases_alumno(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumen_clases_alumno(DATE) TO authenticated, service_role;

-- ============================================================================
-- 5. RESPALDO: public.feedback_clase pasa a ser restaurable
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restaurar_filas_respaldo(p_tabla TEXT, p_filas JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insertadas INT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Solo service_role puede restaurar respaldos'
      USING ERRCODE = '42501';
  END IF;

  IF p_tabla NOT IN (
    'perfiles', 'ejercicios', 'ejercicios_alternativas', 'entrenador_alumnos', 'planes_entrenamiento', 'dias_rutina',
    'ejercicios_en_rutina', 'registro_sesiones', 'registro_series', 'conversaciones',
    'mensajes', 'push_suscripciones', 'push_cola', 'habitos_registros', 'nutricion_registros', 'alertas_entrenador',
    'alumno_historial_dolor', 'alumno_cuestionario_inicial', 'feriados', 'planes_membresia', 'planes_membresia_precios',
    'contrataciones', 'alumno_actividades', 'cobros', 'pagos',
    'auditoria_cambios', 'sustituciones_ejercicios', 'clases_horario', 'clases_fijas', 'clases', 'clases_profesores', 'reservas', 'feedback_clase', 'ranking_prs'
  ) THEN
    RAISE EXCEPTION 'Tabla no restaurable: %', p_tabla
      USING ERRCODE = '22023';
  END IF;

  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un array JSON'
      USING ERRCODE = '22023';
  END IF;

  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', p_tabla);
  EXECUTE format(
    'INSERT INTO public.%1$I SELECT * FROM jsonb_populate_recordset(NULL::public.%1$I, $1) ON CONFLICT (id) DO NOTHING',
    p_tabla
  ) USING p_filas;
  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', p_tabla);

  RETURN v_insertadas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restaurar_filas_respaldo(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_filas_respaldo(TEXT, JSONB) TO service_role;

COMMIT;
