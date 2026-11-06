-- GOZS-369: RPC kpis_negocio_v2 - Fuente única de KPIs de negocio.
-- Extiende obtener_kpis_negocio con:
--   - cobranza vencida (monto: cobranza_vencida_monto)
--   - pendientes / por vencer (monto: cobranza_por_vencer_monto)
--   - desglose por canal (ingresos_presencial, ingresos_online)
--   - alumnos al día (alumnos_al_dia) y alumnos morosos (alumnos_morosos)
-- Permite acceso a ADMIN y ENTRENADOR (a ENTRENADOR los montos monetarios se devuelven NULL).

DROP FUNCTION IF EXISTS public.obtener_kpis_negocio(DATE, DATE);

CREATE OR REPLACE FUNCTION public.obtener_kpis_negocio(p_desde DATE, p_hasta DATE)
RETURNS TABLE (
  ingresos NUMERIC,
  ingresos_6m NUMERIC[],
  ingresos_periodo_anterior NUMERIC,
  cobranza_esperada NUMERIC,
  cobranza_pendiente_monto NUMERIC,
  cobranza_vencidas_cant BIGINT,
  sin_entrenar_7d_ids UUID[],
  activos_fin BIGINT,
  altas BIGINT,
  bajas BIGINT,
  ingresos_presencial NUMERIC,
  ingresos_online NUMERIC,
  cobranza_vencida_monto NUMERIC,
  cobranza_por_vencer_monto NUMERIC,
  alumnos_al_dia BIGINT,
  alumnos_morosos BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_mes_ant DATE;
  v_es_admin BOOLEAN;
  v_ingresos NUMERIC := NULL;
  v_ingresos_anterior NUMERIC := NULL;
  v_ingresos_6m NUMERIC[] := NULL;
  v_ingresos_presencial NUMERIC := NULL;
  v_ingresos_online NUMERIC := NULL;
  v_pendiente NUMERIC := NULL;
  v_vencida_monto NUMERIC := NULL;
  v_por_vencer_monto NUMERIC := NULL;
  v_esperada NUMERIC := NULL;
  v_vencidas_cant BIGINT;
  v_activos_fin BIGINT;
  v_altas BIGINT;
  v_bajas BIGINT;
  v_alumnos_morosos BIGINT;
  v_alumnos_al_dia BIGINT;
  v_sin_entrenar UUID[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.es_entrenador_o_admin() THEN
    RAISE EXCEPTION 'Solo un administrador o entrenador puede consultar los KPIs de negocio'
      USING ERRCODE = '42501';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta THEN
    RAISE EXCEPTION 'Período inválido: p_desde y p_hasta son obligatorios y p_desde <= p_hasta'
      USING ERRCODE = '22023';
  END IF;

  v_es_admin := public.es_admin();
  v_mes_ant := (date_trunc('month', p_desde) - INTERVAL '1 month')::date;

  -- 1. Métricas operativas no monetarias (visibles para ADMIN y ENTRENADOR)
  -- Cantidad de cuotas vencidas (fecha_fin < p_hasta de alumnos activos)
  SELECT count(*) INTO v_vencidas_cant
  FROM public.contrataciones c
  JOIN public.perfiles a ON a.id = c.alumno_id
  WHERE c.estado IN ('VIGENTE', 'POR_VENCER', 'PENDIENTE_RENOVACION', 'VENCIDA')
    AND c.fecha_fin < p_hasta
    AND a.rol = 'ALUMNO'
    AND a.estado_membresia IN ('ACTIVA', 'ACTIVE');

  -- Alumnos morosos (alumnos activos con al menos una cuota vencida)
  SELECT count(DISTINCT c.alumno_id) INTO v_alumnos_morosos
  FROM public.contrataciones c
  JOIN public.perfiles a ON a.id = c.alumno_id
  WHERE c.estado IN ('VIGENTE', 'POR_VENCER', 'PENDIENTE_RENOVACION', 'VENCIDA')
    AND c.fecha_fin < p_hasta
    AND a.rol = 'ALUMNO'
    AND a.estado_membresia IN ('ACTIVA', 'ACTIVE');

  -- Alumnos activos al fin del período
  SELECT count(*) INTO v_activos_fin
  FROM public.perfiles p
  WHERE p.rol = 'ALUMNO'
    AND (p.created_at AT TIME ZONE v_tz)::date <= p_hasta
    AND (
      p.estado_membresia IN ('ACTIVA', 'ACTIVE')
      OR (
        p.estado_membresia IN ('INACTIVA', 'BAJA', 'ARCHIVED')
        AND (p.fecha_baja AT TIME ZONE v_tz)::date > p_hasta
      )
    );

  v_alumnos_al_dia := GREATEST(0, v_activos_fin - v_alumnos_morosos);

  -- Alumnos sin entrenar hace más de 7 días
  SELECT COALESCE(array_agg(p.id ORDER BY p.id), ARRAY[]::uuid[]) INTO v_sin_entrenar
  FROM public.perfiles p
  WHERE p.rol = 'ALUMNO'
    AND p.estado_membresia IN ('ACTIVA', 'ACTIVE')
    AND (p.ultimo_entreno_at IS NULL OR p.ultimo_entreno_at < now() - INTERVAL '7 days');

  -- Altas del mes (primera contratación en el período)
  SELECT count(*) INTO v_altas
  FROM (
    SELECT c.alumno_id, min(c.fecha_inicio) AS primera
    FROM public.contrataciones c
    GROUP BY c.alumno_id
  ) pc
  WHERE pc.primera BETWEEN p_desde AND p_hasta;

  -- Bajas del mes
  SELECT count(*) INTO v_bajas
  FROM public.perfiles p
  WHERE p.rol = 'ALUMNO'
    AND p.estado_membresia IN ('INACTIVA', 'BAJA', 'ARCHIVED')
    AND (p.fecha_baja AT TIME ZONE v_tz)::date BETWEEN p_desde AND p_hasta;

  -- 2. Métricas monetarias (solo calculadas y expuestas si es ADMIN)
  IF v_es_admin THEN
    SELECT COALESCE(SUM(pg.monto), 0) INTO v_ingresos
    FROM public.pagos pg
    WHERE pg.estado = 'CONFIRMADO'
      AND (pg.confirmado_at AT TIME ZONE v_tz)::date BETWEEN p_desde AND p_hasta;

    -- Desglose canal presencial vs online
    SELECT
      COALESCE(SUM(CASE
        WHEN c.tipo_servicio = 'ASESORIA_ONLINE' AND c.actividad IS NULL THEN 0
        WHEN pm.nombre ~* 'rutina|online' THEN 0
        WHEN c.actividad = 'RUTINAS' THEN 0
        ELSE pg.monto
      END), 0),
      COALESCE(SUM(CASE
        WHEN c.tipo_servicio = 'ASESORIA_ONLINE' AND c.actividad IS NULL THEN pg.monto
        WHEN pm.nombre ~* 'rutina|online' THEN pg.monto
        WHEN c.actividad = 'RUTINAS' THEN pg.monto
        ELSE 0
      END), 0)
    INTO v_ingresos_presencial, v_ingresos_online
    FROM public.pagos pg
    LEFT JOIN public.contrataciones c ON c.id = pg.contratacion_id
    LEFT JOIN public.planes_membresia pm ON pm.id = c.plan_membresia_id
    WHERE pg.estado = 'CONFIRMADO'
      AND (pg.confirmado_at AT TIME ZONE v_tz)::date BETWEEN p_desde AND p_hasta;

    -- Cuotas vencidas (monto: fecha_fin < p_hasta)
    SELECT COALESCE(SUM(public.precio_vigente(c.plan_membresia_id, c.fecha_fin) / pm.duracion_meses), 0) INTO v_vencida_monto
    FROM public.contrataciones c
    JOIN public.planes_membresia pm ON pm.id = c.plan_membresia_id
    JOIN public.perfiles a ON a.id = c.alumno_id
    WHERE c.estado IN ('VIGENTE', 'POR_VENCER', 'PENDIENTE_RENOVACION', 'VENCIDA')
      AND c.fecha_fin < p_hasta
      AND a.rol = 'ALUMNO'
      AND a.estado_membresia IN ('ACTIVA', 'ACTIVE');

    -- Cuotas por vencer / pendientes (monto: fecha_fin <= p_hasta y fecha_fin >= p_hasta)
    SELECT COALESCE(SUM(public.precio_vigente(c.plan_membresia_id, c.fecha_fin) / pm.duracion_meses), 0) INTO v_por_vencer_monto
    FROM public.contrataciones c
    JOIN public.planes_membresia pm ON pm.id = c.plan_membresia_id
    JOIN public.perfiles a ON a.id = c.alumno_id
    WHERE c.estado IN ('VIGENTE', 'POR_VENCER', 'PENDIENTE_RENOVACION', 'VENCIDA')
      AND c.fecha_fin <= p_hasta
      AND c.fecha_fin >= p_hasta
      AND a.rol = 'ALUMNO'
      AND a.estado_membresia IN ('ACTIVA', 'ACTIVE');

    v_pendiente := v_vencida_monto + v_por_vencer_monto;
    v_esperada := v_ingresos + v_pendiente;

    -- Ingresos periodo anterior
    SELECT COALESCE(SUM(pg.monto), 0) INTO v_ingresos_anterior
    FROM public.pagos pg
    WHERE pg.estado = 'CONFIRMADO'
      AND date_trunc('month', pg.confirmado_at AT TIME ZONE v_tz)::date = v_mes_ant;

    -- Serie de los últimos 6 meses
    SELECT array_agg(COALESCE(m.total, 0) ORDER BY mes.inicio) INTO v_ingresos_6m
    FROM (
      SELECT (date_trunc('month', p_hasta) - make_interval(months => n))::date AS inicio
      FROM generate_series(5, 0, -1) AS n
    ) mes
    LEFT JOIN LATERAL (
      SELECT SUM(pg.monto) AS total
      FROM public.pagos pg
      WHERE pg.estado = 'CONFIRMADO'
        AND date_trunc('month', pg.confirmado_at AT TIME ZONE v_tz)::date = mes.inicio
    ) m ON true;
  END IF;

  RETURN QUERY
  SELECT
    v_ingresos,
    v_ingresos_6m,
    v_ingresos_anterior,
    v_esperada,
    v_pendiente,
    v_vencidas_cant,
    v_sin_entrenar,
    v_activos_fin,
    v_altas,
    v_bajas,
    v_ingresos_presencial,
    v_ingresos_online,
    v_vencida_monto,
    v_por_vencer_monto,
    v_alumnos_al_dia,
    v_alumnos_morosos;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.obtener_kpis_negocio(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_kpis_negocio(DATE, DATE) TO authenticated;
