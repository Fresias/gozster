-- GOZS-135: RPC obtener_kpis_negocio (franja de KPIs del Coach Studio). Solo ADMIN.
-- Los montos de facturación no pueden quedar disponibles para un ENTRENADOR que
-- llame a la API: el guard es la primera sentencia y el EXECUTE no es público.
--
-- Criterios (se reusan los de obtener_metricas_retencion, 20261016100000:379):
--   activo = rol ALUMNO y estado_membresia IN ('ACTIVA','ACTIVE')
--   baja   = rol ALUMNO y estado_membresia IN ('INACTIVA','BAJA','ARCHIVED') con fecha_baja
-- Alcance: global (equivale a p_profesor_id = NULL en obtener_metricas_retencion);
-- el modelo no tiene gimnasios/tenants, el ADMIN es el dueño.
-- Cuota: no existe tabla de cuotas. Una contratación debe una cuota mensual
-- (precio / duracion_meses de su plan) por cada fecha_fin <= p_hasta aún no
-- renovada (la renovación corre fecha_fin al mes siguiente), solo de alumnos activos.
-- Meses calendario en hora de Argentina.

BEGIN;

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
  bajas BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_mes_ant DATE;
  v_ingresos NUMERIC;
  v_pendiente NUMERIC;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar los KPIs de negocio'
      USING ERRCODE = '42501';
  END IF;

  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde > p_hasta THEN
    RAISE EXCEPTION 'Período inválido: p_desde y p_hasta son obligatorios y p_desde <= p_hasta'
      USING ERRCODE = '22023';
  END IF;

  v_mes_ant := (date_trunc('month', p_desde) - INTERVAL '1 month')::date;

  SELECT COALESCE(SUM(pg.monto), 0) INTO v_ingresos
  FROM public.pagos pg
  WHERE pg.estado = 'CONFIRMADO'
    AND (pg.confirmado_at AT TIME ZONE v_tz)::date BETWEEN p_desde AND p_hasta;

  SELECT COALESCE(SUM(pm.precio / pm.duracion_meses), 0) INTO v_pendiente
  FROM public.contrataciones c
  JOIN public.planes_membresia pm ON pm.id = c.plan_membresia_id
  JOIN public.perfiles a ON a.id = c.alumno_id
  WHERE c.estado IN ('VIGENTE', 'POR_VENCER', 'PENDIENTE_RENOVACION', 'VENCIDA')
    AND c.fecha_fin <= p_hasta
    AND a.rol = 'ALUMNO'
    AND a.estado_membresia IN ('ACTIVA', 'ACTIVE');

  RETURN QUERY
  SELECT
    v_ingresos,
    (
      SELECT array_agg(COALESCE(m.total, 0) ORDER BY mes.inicio)
      FROM (
        SELECT (date_trunc('month', p_hasta) - make_interval(months => n))::date AS inicio
        FROM generate_series(5, 0, -1) AS n
      ) mes
      LEFT JOIN LATERAL (
        SELECT SUM(pg.monto) AS total
        FROM public.pagos pg
        WHERE pg.estado = 'CONFIRMADO'
          AND date_trunc('month', pg.confirmado_at AT TIME ZONE v_tz)::date = mes.inicio
      ) m ON true
    ),
    (
      SELECT COALESCE(SUM(pg.monto), 0)
      FROM public.pagos pg
      WHERE pg.estado = 'CONFIRMADO'
        AND date_trunc('month', pg.confirmado_at AT TIME ZONE v_tz)::date = v_mes_ant
    ),
    v_ingresos + v_pendiente,
    v_pendiente,
    (
      SELECT count(*)
      FROM public.contrataciones c
      JOIN public.perfiles a ON a.id = c.alumno_id
      WHERE c.estado IN ('VIGENTE', 'POR_VENCER', 'PENDIENTE_RENOVACION', 'VENCIDA')
        AND c.fecha_fin < p_hasta
        AND a.rol = 'ALUMNO'
        AND a.estado_membresia IN ('ACTIVA', 'ACTIVE')
    ),
    COALESCE((
      SELECT array_agg(p.id ORDER BY p.id)
      FROM public.perfiles p
      WHERE p.rol = 'ALUMNO'
        AND p.estado_membresia IN ('ACTIVA', 'ACTIVE')
        AND (p.ultimo_entreno_at IS NULL OR p.ultimo_entreno_at < now() - INTERVAL '7 days')
    ), ARRAY[]::uuid[]),
    (
      SELECT count(*)
      FROM public.perfiles p
      WHERE p.rol = 'ALUMNO'
        AND (p.created_at AT TIME ZONE v_tz)::date <= p_hasta
        AND (
          p.estado_membresia IN ('ACTIVA', 'ACTIVE')
          OR (
            p.estado_membresia IN ('INACTIVA', 'BAJA', 'ARCHIVED')
            AND (p.fecha_baja AT TIME ZONE v_tz)::date > p_hasta
          )
        )
    ),
    (
      SELECT count(*)
      FROM (
        SELECT c.alumno_id, min(c.fecha_inicio) AS primera
        FROM public.contrataciones c
        GROUP BY c.alumno_id
      ) pc
      WHERE pc.primera BETWEEN p_desde AND p_hasta
    ),
    (
      SELECT count(*)
      FROM public.perfiles p
      WHERE p.rol = 'ALUMNO'
        AND p.estado_membresia IN ('INACTIVA', 'BAJA', 'ARCHIVED')
        AND (p.fecha_baja AT TIME ZONE v_tz)::date BETWEEN p_desde AND p_hasta
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.obtener_kpis_negocio(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_kpis_negocio(DATE, DATE) TO authenticated;

COMMIT;
