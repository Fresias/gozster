-- GOZS-141: historial de precios de planes de membresía.
-- Regla de negocio: una cuota se cobra al precio vigente en su fecha de vencimiento
-- (contrataciones.fecha_fin). La tabla es append-only: un error de carga se corrige
-- con una fila nueva (mismo plan, vigente_desde posterior).
--
-- IMPORTANTE: planes_membresia.precio es solo el precio de LISTA para la UI (se
-- sincroniza desde acá). Ningún cálculo debe leerlo: usar public.precio_vigente().

BEGIN;

CREATE TABLE IF NOT EXISTS public.planes_membresia_precios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_membresia_id UUID NOT NULL REFERENCES public.planes_membresia(id) ON DELETE RESTRICT,
  precio NUMERIC(12, 2) NOT NULL CHECK (precio >= 0),
  -- La primera fila de cada plan usa '-infinity': su precio cubre cualquier cuota anterior.
  vigente_desde DATE NOT NULL,
  creado_por UUID REFERENCES public.perfiles(id) DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- También sirve de índice para la búsqueda por plan y fecha.
  UNIQUE (plan_membresia_id, vigente_desde)
);

-- Inmutable: sin UPDATE ni DELETE.
CREATE OR REPLACE FUNCTION public.rechazar_cambio_precio_historico()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'planes_membresia_precios es inmutable: cargá una fila nueva para corregir'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_planes_membresia_precios_inmutable ON public.planes_membresia_precios;
CREATE TRIGGER trg_planes_membresia_precios_inmutable
  BEFORE UPDATE OR DELETE ON public.planes_membresia_precios
  FOR EACH ROW EXECUTE FUNCTION public.rechazar_cambio_precio_historico();

ALTER TABLE public.planes_membresia_precios ENABLE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE ON public.planes_membresia_precios FROM anon, authenticated;

DROP POLICY IF EXISTS "planes_membresia_precios_select_autenticado" ON public.planes_membresia_precios;
CREATE POLICY "planes_membresia_precios_select_autenticado"
  ON public.planes_membresia_precios FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "planes_membresia_precios_insert_admin" ON public.planes_membresia_precios;
CREATE POLICY "planes_membresia_precios_insert_admin"
  ON public.planes_membresia_precios FOR INSERT TO authenticated
  WITH CHECK (public.es_admin());

-- Precio de la última fila con vigente_desde <= p_fecha; NULL si no hay ninguna.
CREATE OR REPLACE FUNCTION public.precio_vigente(p_plan_id UUID, p_fecha DATE)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT pr.precio
  FROM public.planes_membresia_precios pr
  WHERE pr.plan_membresia_id = p_plan_id
    AND pr.vigente_desde <= p_fecha
  ORDER BY pr.vigente_desde DESC
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.precio_vigente(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.precio_vigente(UUID, DATE) TO authenticated;

-- Sincroniza el precio de lista (planes_membresia.precio) con el vigente hoy (fecha Argentina).
CREATE OR REPLACE FUNCTION public.sincronizar_precio_lista()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hoy CONSTANT DATE := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF NEW.vigente_desde <= v_hoy THEN
    UPDATE public.planes_membresia
    SET precio = public.precio_vigente(NEW.plan_membresia_id, v_hoy)
    WHERE id = NEW.plan_membresia_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_planes_membresia_precios_sync ON public.planes_membresia_precios;
CREATE TRIGGER trg_planes_membresia_precios_sync
  AFTER INSERT ON public.planes_membresia_precios
  FOR EACH ROW EXECUTE FUNCTION public.sincronizar_precio_lista();

-- Todo plan nuevo nace con su fila inicial de historial.
CREATE OR REPLACE FUNCTION public.crear_precio_inicial_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.planes_membresia_precios (plan_membresia_id, precio, vigente_desde)
  VALUES (NEW.id, NEW.precio, '-infinity');
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_planes_membresia_precio_inicial ON public.planes_membresia;
CREATE TRIGGER trg_planes_membresia_precio_inicial
  AFTER INSERT ON public.planes_membresia
  FOR EACH ROW EXECUTE FUNCTION public.crear_precio_inicial_plan();

-- Backfill: una fila por plan existente con su precio actual.
INSERT INTO public.planes_membresia_precios (plan_membresia_id, precio, vigente_desde, creado_por)
SELECT pm.id, pm.precio, '-infinity', NULL
FROM public.planes_membresia pm
ON CONFLICT (plan_membresia_id, vigente_desde) DO NOTHING;

-- obtener_kpis_negocio: la cuota pendiente usa el precio vigente al vencimiento (fecha_fin).
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

  SELECT COALESCE(SUM(public.precio_vigente(c.plan_membresia_id, c.fecha_fin) / pm.duracion_meses), 0) INTO v_pendiente
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

-- Backup/restore: agrega planes_membresia_precios (después de planes_membresia por la FK).
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
    'mensajes', 'habitos_registros', 'nutricion_registros', 'alertas_entrenador',
    'alumno_historial_dolor', 'alumno_cuestionario_inicial', 'planes_membresia', 'planes_membresia_precios',
    'contrataciones', 'pagos',
    'auditoria_cambios', 'sustituciones_ejercicios', 'clases_horario', 'clases', 'clases_profesores', 'reservas'
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
