-- ============================================================================
-- GOZSter: Experiencia de clases para alumnos (Fase 2 backend)
--   - Tabla public.clase_feedback + RLS + RPC registrar_feedback_clase
--   - Columna public.clases.nota_coach + RPC guardar_nota_clase + protección
--   - RPC resumen_clases_alumno() (próxima reserva, cupo semanal y racha)
--   - RPC historial_asistencias_alumno(p_limit)
--   - Respaldo: incluir clase_feedback en restaurar_filas_respaldo
-- Archivo: supabase/migrations/20261121150000_clase_feedback_nota_resumen_asistencias.sql
-- Multica Issue: GOZS-667 (Épica GOZS-662)
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLA: public.clase_feedback + RLS + TRIGGER updated_at
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.clase_feedback (
  reserva_id UUID PRIMARY KEY REFERENCES public.reservas(id) ON DELETE CASCADE,
  sensacion TEXT NOT NULL CHECK (sensacion IN ('FACIL', 'BIEN', 'DURA', 'DURISIMA')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_clase_feedback_updated_at ON public.clase_feedback;
CREATE TRIGGER trg_clase_feedback_updated_at
  BEFORE UPDATE ON public.clase_feedback
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_reservas_alumno_estado
  ON public.reservas (alumno_id, estado);

ALTER TABLE public.clase_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.clase_feedback FROM PUBLIC, anon;
REVOKE DELETE ON public.clase_feedback FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.clase_feedback TO authenticated;
GRANT ALL ON public.clase_feedback TO service_role;

DROP POLICY IF EXISTS "clase_feedback_select_dueno_o_coach" ON public.clase_feedback;
CREATE POLICY "clase_feedback_select_dueno_o_coach"
  ON public.clase_feedback FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.reservas r
      WHERE r.id = clase_feedback.reserva_id
        AND (
          r.alumno_id = (select auth.uid())
          OR public.es_entrenador_de(r.alumno_id)
          OR public.es_profesor_de_clase(r.clase_id)
        )
    )
  );

DROP POLICY IF EXISTS "clase_feedback_insert_asistencia_propia" ON public.clase_feedback;
CREATE POLICY "clase_feedback_insert_asistencia_propia"
  ON public.clase_feedback FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.reservas r
      JOIN public.clases c ON c.id = r.clase_id
      WHERE r.id = clase_feedback.reserva_id
        AND r.alumno_id = (select auth.uid())
        AND r.estado = 'ANOTADO'
        AND c.estado = 'PROGRAMADA'
        AND c.inicio <= now()
    )
  );

DROP POLICY IF EXISTS "clase_feedback_update_asistencia_propia" ON public.clase_feedback;
CREATE POLICY "clase_feedback_update_asistencia_propia"
  ON public.clase_feedback FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.reservas r
      JOIN public.clases c ON c.id = r.clase_id
      WHERE r.id = clase_feedback.reserva_id
        AND r.alumno_id = (select auth.uid())
        AND r.estado = 'ANOTADO'
        AND c.estado = 'PROGRAMADA'
        AND c.inicio <= now()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.reservas r
      JOIN public.clases c ON c.id = r.clase_id
      WHERE r.id = clase_feedback.reserva_id
        AND r.alumno_id = (select auth.uid())
        AND r.estado = 'ANOTADO'
        AND c.estado = 'PROGRAMADA'
        AND c.inicio <= now()
    )
  );

-- ============================================================================
-- 2. COLUMNA: public.clases.nota_coach + PROTECCIÓN DE EDICIÓN
-- ============================================================================

ALTER TABLE public.clases
  ADD COLUMN IF NOT EXISTS nota_coach TEXT NULL;

CREATE OR REPLACE FUNCTION public.fn_proteger_edicion_clase()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.inicio IS DISTINCT FROM OLD.inicio
    OR NEW.capacidad IS DISTINCT FROM OLD.capacidad
    OR NEW.nota_coach IS DISTINCT FROM OLD.nota_coach
  ) THEN
    IF NOT public.es_profesor_de_clase(OLD.id) THEN
      RAISE EXCEPTION 'Solo un profesor de la clase o un administrador puede modificar su horario, capacidad o nota'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clases_proteger_edicion ON public.clases;
CREATE TRIGGER trg_clases_proteger_edicion
  BEFORE UPDATE OF inicio, capacidad, nota_coach ON public.clases
  FOR EACH ROW EXECUTE FUNCTION public.fn_proteger_edicion_clase();

-- ============================================================================
-- 3. RPC: registrar_feedback_clase (upsert idempotente por reserva_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_feedback_clase(
  p_reserva_id UUID,
  p_sensacion TEXT
)
RETURNS public.clase_feedback
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_alumno UUID := auth.uid();
  v_rec RECORD;
  v_feedback public.clase_feedback%ROWTYPE;
BEGIN
  IF v_alumno IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_reserva_id IS NULL THEN
    RAISE EXCEPTION 'Reserva inválida' USING ERRCODE = '22023';
  END IF;

  IF p_sensacion IS NULL OR p_sensacion NOT IN ('FACIL', 'BIEN', 'DURA', 'DURISIMA') THEN
    RAISE EXCEPTION 'Sensación inválida: debe ser FACIL, BIEN, DURA o DURISIMA'
      USING ERRCODE = '22023';
  END IF;

  SELECT r.id, r.alumno_id, r.estado, c.estado AS clase_estado, c.inicio AS clase_inicio
  INTO v_rec
  FROM public.reservas r
  JOIN public.clases c ON c.id = r.clase_id
  WHERE r.id = p_reserva_id;

  IF NOT FOUND OR v_rec.alumno_id <> v_alumno THEN
    RAISE EXCEPTION 'No tenés permisos para registrar feedback de esta reserva'
      USING ERRCODE = '42501';
  END IF;

  IF v_rec.estado <> 'ANOTADO' THEN
    RAISE EXCEPTION 'Solo podés registrar feedback en reservas con asistencia'
      USING ERRCODE = 'GZ009';
  END IF;

  IF v_rec.clase_estado <> 'PROGRAMADA' THEN
    RAISE EXCEPTION 'La clase fue cancelada'
      USING ERRCODE = 'GZ007';
  END IF;

  IF v_rec.clase_inicio > now() THEN
    RAISE EXCEPTION 'La clase todavía no comenzó'
      USING ERRCODE = 'GZ006';
  END IF;

  INSERT INTO public.clase_feedback (reserva_id, sensacion)
  VALUES (p_reserva_id, p_sensacion)
  ON CONFLICT (reserva_id) DO UPDATE
    SET sensacion = EXCLUDED.sensacion
  RETURNING * INTO v_feedback;

  RETURN v_feedback;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_feedback_clase(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_feedback_clase(UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 4. RPC: guardar_nota_clase (solo profesor de esa clase o ADMIN)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guardar_nota_clase(
  p_clase_id UUID,
  p_nota TEXT
)
RETURNS public.clases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_clase public.clases%ROWTYPE;
  v_nota TEXT := nullif(btrim(p_nota), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_clase_id IS NULL THEN
    RAISE EXCEPTION 'Clase no encontrada' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_clase FROM public.clases WHERE id = p_clase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.es_profesor_de_clase(p_clase_id) THEN
    RAISE EXCEPTION 'Solo el profesor de la clase o un administrador puede guardar la nota'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.clases
  SET nota_coach = v_nota
  WHERE id = p_clase_id
  RETURNING * INTO v_clase;

  RETURN v_clase;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_nota_clase(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_nota_clase(UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 5. RPC: resumen_clases_alumno()
--    Devuelve JSONB con:
--      - proxima_reserva: {reserva_id, clase_id, actividad, inicio, duracion_minutos} | null
--      - clases_semana_usadas: int (misma ventana/conteo que reservar_clase)
--      - limite_semanal: int | null (null = pase libre o sin límite activo)
--      - racha_semanas: int (semanas consecutivas con >= 1 asistencia real)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.resumen_clases_alumno()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  c_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_alumno UUID := auth.uid();
  v_lunes TIMESTAMPTZ;
  v_hoy DATE;
  v_proxima JSONB;
  v_usadas INT := 0;
  v_limite INT := NULL;
  v_plan_agg RECORD;
  v_act_agg RECORD;
  v_semanas DATE[];
  v_semana_actual DATE;
  v_semana_anterior DATE;
  v_cursor DATE;
  v_sem DATE;
  v_racha INT := 0;
BEGIN
  IF v_alumno IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  v_lunes := date_trunc('week', now() AT TIME ZONE c_tz) AT TIME ZONE c_tz;
  v_hoy := (now() AT TIME ZONE c_tz)::date;
  v_semana_actual := (date_trunc('week', now() AT TIME ZONE c_tz))::date;
  v_semana_anterior := v_semana_actual - 7;

  -- Próxima reserva futura vigente (ANOTADO en clase PROGRAMADA con inicio > now())
  SELECT jsonb_build_object(
    'reserva_id', r.id,
    'clase_id', c.id,
    'actividad', c.actividad,
    'inicio', c.inicio,
    'duracion_minutos', c.duracion_minutos
  )
  INTO v_proxima
  FROM public.reservas r
  JOIN public.clases c ON c.id = r.clase_id
  WHERE r.alumno_id = v_alumno
    AND r.estado = 'ANOTADO'
    AND c.estado = 'PROGRAMADA'
    AND c.inicio > now()
  ORDER BY c.inicio ASC, r.created_at ASC
  LIMIT 1;

  -- Clases usadas esta semana: misma ventana (lunes 00:00 ART .. +7d) y mismos estados que reservar_clase
  SELECT count(DISTINCT r.clase_id)::int
  INTO v_usadas
  FROM public.reservas r
  JOIN public.clases c ON c.id = r.clase_id
  WHERE r.alumno_id = v_alumno
    AND r.estado IN ('ANOTADO', 'AUSENTE')
    AND c.inicio >= v_lunes
    AND c.inicio < v_lunes + INTERVAL '7 days';

  -- Límite semanal: primero contrataciones presenciales vigentes, luego fallback alumno_actividades
  SELECT
    count(*) > 0 AS tiene_plan,
    bool_or(pm.limite_semanal IS NULL) AS tiene_libre,
    sum(pm.limite_semanal)::int AS suma_limite
  INTO v_plan_agg
  FROM public.contrataciones ct
  JOIN public.planes_membresia pm ON pm.id = ct.plan_membresia_id
  WHERE ct.alumno_id = v_alumno
    AND ct.plan_membresia_id IS NOT NULL
    AND ct.estado NOT IN ('EN_PAUSA', 'VENCIDA')
    AND ct.fecha_inicio <= v_hoy
    AND ct.fecha_fin >= v_hoy;

  IF v_plan_agg.tiene_plan THEN
    v_limite := CASE WHEN v_plan_agg.tiene_libre THEN NULL ELSE v_plan_agg.suma_limite END;
  ELSIF EXISTS (
    SELECT 1
    FROM public.contrataciones ct
    WHERE ct.alumno_id = v_alumno
      AND ct.estado NOT IN ('EN_PAUSA', 'VENCIDA')
      AND ct.fecha_inicio <= v_hoy
      AND ct.fecha_fin >= v_hoy
  ) OR (
    NOT EXISTS (SELECT 1 FROM public.contrataciones ct WHERE ct.alumno_id = v_alumno)
    AND COALESCE(
      (SELECT p.estado_membresia::text FROM public.perfiles p WHERE p.id = v_alumno),
      ''
    ) NOT IN ('INACTIVA', 'BAJA', 'EXPIRED_PAYMENT_PENDING', 'ARCHIVED')
  ) THEN
    SELECT
      count(*) > 0 AS tiene_act,
      bool_or(aa.pase_libre) AS tiene_libre,
      sum(aa.veces_por_semana)::int AS suma_limite
    INTO v_act_agg
    FROM public.alumno_actividades aa
    WHERE aa.alumno_id = v_alumno
      AND aa.actividad IN ('FUNCIONAL', 'BOXEO');

    IF v_act_agg.tiene_act AND NOT v_act_agg.tiene_libre THEN
      v_limite := v_act_agg.suma_limite;
    ELSE
      v_limite := NULL;
    END IF;
  END IF;

  -- Racha semanal consecutiva por asistencia real (ANOTADO + PROGRAMADA + inicio <= now())
  SELECT array_agg(semana ORDER BY semana DESC)
  INTO v_semanas
  FROM (
    SELECT DISTINCT (date_trunc('week', c.inicio AT TIME ZONE c_tz))::date AS semana
    FROM public.reservas r
    JOIN public.clases c ON c.id = r.clase_id
    WHERE r.alumno_id = v_alumno
      AND r.estado = 'ANOTADO'
      AND c.estado = 'PROGRAMADA'
      AND c.inicio <= now()
  ) s;

  IF v_semanas IS NOT NULL AND array_length(v_semanas, 1) > 0 THEN
    IF v_semanas[1] = v_semana_actual THEN
      v_cursor := v_semana_actual;
    ELSIF v_semanas[1] = v_semana_anterior THEN
      v_cursor := v_semana_anterior;
    ELSE
      v_cursor := NULL;
    END IF;

    IF v_cursor IS NOT NULL THEN
      FOREACH v_sem IN ARRAY v_semanas LOOP
        EXIT WHEN v_sem <> v_cursor;
        v_racha := v_racha + 1;
        v_cursor := v_cursor - 7;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'proxima_reserva', v_proxima,
    'clases_semana_usadas', COALESCE(v_usadas, 0),
    'limite_semanal', v_limite,
    'racha_semanas', v_racha
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resumen_clases_alumno() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumen_clases_alumno() TO authenticated, service_role;

-- ============================================================================
-- 6. RPC: historial_asistencias_alumno(p_limit int default 30)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.historial_asistencias_alumno(
  p_limit INT DEFAULT 30
)
RETURNS TABLE (
  reserva_id UUID,
  clase_id UUID,
  actividad TEXT,
  inicio TIMESTAMPTZ,
  sensacion TEXT,
  nota_coach TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  v_alumno UUID := auth.uid();
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 30), 0), 200);
BEGIN
  IF v_alumno IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id AS reserva_id,
    c.id AS clase_id,
    c.actividad,
    c.inicio,
    cf.sensacion,
    c.nota_coach
  FROM public.reservas r
  JOIN public.clases c ON c.id = r.clase_id
  LEFT JOIN public.clase_feedback cf ON cf.reserva_id = r.id
  WHERE r.alumno_id = v_alumno
    AND r.estado = 'ANOTADO'
    AND c.estado = 'PROGRAMADA'
    AND c.inicio <= now()
  ORDER BY c.inicio DESC, r.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.historial_asistencias_alumno(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.historial_asistencias_alumno(INT) TO authenticated, service_role;

-- ============================================================================
-- 7. RESPALDO: incluir clase_feedback (PK reserva_id) en restaurar_filas_respaldo
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restaurar_filas_respaldo(p_tabla TEXT, p_filas JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insertadas INT;
  v_pk TEXT;
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
    'auditoria_cambios', 'sustituciones_ejercicios', 'clases_horario', 'clases_fijas', 'clases', 'clases_profesores', 'reservas', 'ranking_prs',
    'clase_feedback'
  ) THEN
    RAISE EXCEPTION 'Tabla no restaurable: %', p_tabla
      USING ERRCODE = '22023';
  END IF;

  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un array JSON'
      USING ERRCODE = '22023';
  END IF;

  v_pk := CASE WHEN p_tabla = 'clase_feedback' THEN 'reserva_id' ELSE 'id' END;

  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', p_tabla);
  EXECUTE format(
    'INSERT INTO public.%1$I SELECT * FROM jsonb_populate_recordset(NULL::public.%1$I, $1) ON CONFLICT (%2$I) DO NOTHING',
    p_tabla,
    v_pk
  ) USING p_filas;
  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', p_tabla);

  RETURN v_insertadas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restaurar_filas_respaldo(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_filas_respaldo(TEXT, JSONB) TO service_role;

COMMIT;
