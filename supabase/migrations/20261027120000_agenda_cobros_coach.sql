-- GOZS-186: cobros manuales, anotar_alumno (cupo flexible) y RLS por coach.
--
-- Desvíos del modelo propuesto (se reutiliza lo existente, sin tablas de más):
--   servicios        -> clases.actividad / planes_membresia (FUNCIONAL, BOXEO); RUTINA = contrataciones ASESORIA_ONLINE
--   suscripciones    -> contrataciones (+ precio_pactado). limite_semanal NULL = pase libre (planes_membresia)
--   pagos            -> ya existe (confirmado_por, medio_pago); se le agrega cobro_id
--   clase_asistentes -> reservas
--   clases           -> ya existe (capacidad = cupo)
-- Nuevo: cobros, registrar_pago, anotar_alumno, v_morosos, ingresos_mes.

BEGIN;

-- ============================================================================
-- 1. contrataciones.precio_pactado
-- ============================================================================

ALTER TABLE public.contrataciones
  ADD COLUMN IF NOT EXISTS precio_pactado NUMERIC(12, 2) CHECK (precio_pactado >= 0);

-- ============================================================================
-- 2. TABLA: public.cobros (uno por contratación y mes)
-- VENCIDO no lo escribe nadie: v_morosos deriva el atraso por fecha_vencimiento.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cobros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contratacion_id UUID NOT NULL REFERENCES public.contrataciones(id) ON DELETE RESTRICT,
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  periodo DATE NOT NULL CHECK (EXTRACT(DAY FROM periodo) = 1),
  monto NUMERIC(12, 2) NOT NULL CHECK (monto >= 0),
  fecha_vencimiento DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'PAGADO', 'VENCIDO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cobros_contratacion_periodo UNIQUE (contratacion_id, periodo)
);

DROP TRIGGER IF EXISTS trg_cobros_updated_at ON public.cobros;
CREATE TRIGGER trg_cobros_updated_at
  BEFORE UPDATE ON public.cobros
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_cobros_alumno_id ON public.cobros (alumno_id);
CREATE INDEX IF NOT EXISTS idx_cobros_estado_vencimiento ON public.cobros (estado, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_cobros_updated_at ON public.cobros (updated_at);

-- Un cobro siempre pertenece al alumno de su contratación.
CREATE OR REPLACE FUNCTION public.fn_cobro_alumno_de_contratacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.contrataciones
    WHERE id = NEW.contratacion_id AND alumno_id = NEW.alumno_id
  ) THEN
    RAISE EXCEPTION 'El alumno del cobro no coincide con el de la contratación'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cobros_alumno ON public.cobros;
CREATE TRIGGER trg_cobros_alumno
  BEFORE INSERT ON public.cobros
  FOR EACH ROW EXECUTE FUNCTION public.fn_cobro_alumno_de_contratacion();

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS cobro_id UUID REFERENCES public.cobros(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_pagos_cobro_id ON public.pagos (cobro_id);

-- ============================================================================
-- 3. RLS
-- cobros: alumno lee los suyos; el coach lee y crea (siempre PENDIENTE) los de
-- sus alumnos. El estado solo cambia vía registrar_pago.
-- reservas: se acota la lectura del staff a sus alumnos o a las clases que dicta
-- (antes: cualquier entrenador veía todas).
-- clases/planes siguen siendo catálogo de lectura global (grilla compartida).
-- ============================================================================

ALTER TABLE public.cobros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cobros_select_alumno_o_entrenador" ON public.cobros;
CREATE POLICY "cobros_select_alumno_o_entrenador"
  ON public.cobros FOR SELECT TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "cobros_insert_entrenador_o_admin" ON public.cobros;
CREATE POLICY "cobros_insert_entrenador_o_admin"
  ON public.cobros FOR INSERT TO authenticated
  WITH CHECK (
    estado = 'PENDIENTE'
    AND (
      public.es_admin()
      OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(alumno_id))
    )
  );

REVOKE UPDATE, DELETE ON public.cobros FROM anon, authenticated;
REVOKE ALL ON public.cobros FROM anon;

DROP POLICY IF EXISTS "reservas_select_alumno_o_staff" ON public.reservas;
DROP POLICY IF EXISTS "reservas_select_alumno_o_entrenador" ON public.reservas;
CREATE POLICY "reservas_select_alumno_o_entrenador"
  ON public.reservas FOR SELECT TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_profesor_de_clase(clase_id)
  );

-- ============================================================================
-- 4. RPC: registrar_pago (cobro manual: transferencia o efectivo)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_pago(
  p_cobro_id UUID,
  p_monto NUMERIC,
  p_metodo TEXT
)
RETURNS public.cobros
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cobro public.cobros%ROWTYPE;
BEGIN
  IF p_metodo IS NULL OR p_metodo NOT IN ('TRANSFERENCIA', 'EFECTIVO') THEN
    RAISE EXCEPTION 'Método de pago inválido: debe ser TRANSFERENCIA o EFECTIVO'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cobro FROM public.cobros WHERE id = p_cobro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobro no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(v_cobro.alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para registrar pagos de este alumno' USING ERRCODE = '42501';
  END IF;

  IF v_cobro.estado = 'PAGADO' THEN
    RAISE EXCEPTION 'El cobro ya está pagado' USING ERRCODE = 'GZ020';
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 OR p_monto < v_cobro.monto THEN
    RAISE EXCEPTION 'El monto debe cubrir el cobro (%)', v_cobro.monto USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pagos (
    contratacion_id, alumno_id, cobro_id, monto, medio_pago, estado,
    idempotency_key, confirmado_por, confirmado_at
  ) VALUES (
    v_cobro.contratacion_id, v_cobro.alumno_id, v_cobro.id, p_monto, p_metodo, 'CONFIRMADO',
    'cobro:' || v_cobro.id, auth.uid(), now()
  );

  UPDATE public.cobros SET estado = 'PAGADO' WHERE id = v_cobro.id
  RETURNING * INTO v_cobro;

  RETURN v_cobro;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 5. RPC: anotar_alumno (el coach anota a un alumno suyo; cupo flexible)
-- Mismas reglas de membresía que reservar_clase, pero: la semana es la de la
-- clase (el coach puede agendar adelantado) y superar el cupo NO bloquea:
-- devuelve sobrecupo = true y aviso.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.anotar_alumno(p_clase_id UUID, p_alumno_id UUID)
RETURNS TABLE (reserva_id UUID, sobrecupo BOOLEAN, aviso TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_clase public.clases%ROWTYPE;
  v_contratacion public.contrataciones%ROWTYPE;
  v_plan public.planes_membresia%ROWTYPE;
  v_fecha_clase DATE;
  v_lunes TIMESTAMPTZ;
  v_usadas INT;
  v_ocupados INT;
  v_reserva_id UUID;
  v_sobrecupo BOOLEAN := false;
  v_avisos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(p_alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para anotar a este alumno' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_clase FROM public.clases WHERE id = p_clase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_clase.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'La clase fue cancelada' USING ERRCODE = 'GZ007';
  END IF;
  IF v_clase.inicio <= now() THEN
    RAISE EXCEPTION 'La clase ya comenzó' USING ERRCODE = 'GZ006';
  END IF;

  v_fecha_clase := (v_clase.inicio AT TIME ZONE c_tz)::date;
  v_lunes := date_trunc('week', v_clase.inicio AT TIME ZONE c_tz) AT TIME ZONE c_tz;

  SELECT * INTO v_contratacion
  FROM public.contrataciones
  WHERE alumno_id = p_alumno_id AND plan_membresia_id IS NOT NULL
  ORDER BY (fecha_inicio <= (now() AT TIME ZONE c_tz)::date) DESC, fecha_fin DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El alumno no tiene una suscripción activa de clases' USING ERRCODE = 'GZ004';
  END IF;
  IF v_contratacion.estado IN ('EN_PAUSA', 'VENCIDA') THEN
    RAISE EXCEPTION 'La suscripción del alumno está %', v_contratacion.estado USING ERRCODE = 'GZ004';
  END IF;
  IF v_contratacion.fecha_fin < (now() AT TIME ZONE c_tz)::date THEN
    RAISE EXCEPTION 'La suscripción del alumno venció el %',
      to_char(v_contratacion.fecha_fin, 'DD/MM/YYYY') USING ERRCODE = 'GZ004';
  END IF;
  IF v_contratacion.fecha_inicio > (now() AT TIME ZONE c_tz)::date THEN
    RAISE EXCEPTION 'La suscripción del alumno inicia el %',
      to_char(v_contratacion.fecha_inicio, 'DD/MM/YYYY') USING ERRCODE = 'GZ004';
  END IF;

  SELECT * INTO v_plan FROM public.planes_membresia WHERE id = v_contratacion.plan_membresia_id;

  IF v_plan.cantidad_actividades = 1 AND v_contratacion.actividad IS DISTINCT FROM v_clase.actividad THEN
    RAISE EXCEPTION 'La suscripción del alumno no cubre el servicio %', v_clase.actividad
      USING ERRCODE = 'GZ003';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservas
    WHERE clase_id = p_clase_id AND alumno_id = p_alumno_id AND estado <> 'CANCELADO'
  ) THEN
    RAISE EXCEPTION 'El alumno ya está anotado en esta clase' USING ERRCODE = 'GZ008';
  END IF;

  IF v_plan.limite_semanal IS NOT NULL THEN
    SELECT count(DISTINCT r.clase_id) INTO v_usadas
    FROM public.reservas r
    JOIN public.clases c ON c.id = r.clase_id
    WHERE r.alumno_id = p_alumno_id
      AND r.estado IN ('ANOTADO', 'AUSENTE')
      AND c.inicio >= v_lunes
      AND c.inicio < v_lunes + INTERVAL '7 days';

    IF v_usadas >= v_plan.limite_semanal THEN
      RAISE EXCEPTION 'El alumno ya usó sus % clases de esa semana', v_plan.limite_semanal
        USING ERRCODE = 'GZ002';
    END IF;
  END IF;

  IF v_clase.capacidad IS NOT NULL THEN
    SELECT count(*) INTO v_ocupados
    FROM public.reservas
    WHERE clase_id = p_clase_id AND estado IN ('ANOTADO', 'AUSENTE');

    IF v_ocupados >= v_clase.capacidad THEN
      v_sobrecupo := true;
      v_avisos := v_avisos || ('sobrecupo: ' || (v_ocupados + 1) || '/' || v_clase.capacidad);
    END IF;
  END IF;

  IF v_contratacion.fecha_fin < v_fecha_clase THEN
    v_avisos := v_avisos || ('la suscripción vence el ' || to_char(v_contratacion.fecha_fin, 'DD/MM/YYYY')
      || ' y la clase es posterior');
  END IF;

  INSERT INTO public.reservas (clase_id, alumno_id)
  VALUES (p_clase_id, p_alumno_id)
  RETURNING id INTO v_reserva_id;

  reserva_id := v_reserva_id;
  sobrecupo := v_sobrecupo;
  aviso := array_to_string(v_avisos, '; ');
  IF aviso = '' THEN aviso := NULL; END IF;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.anotar_alumno(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anotar_alumno(UUID, UUID) TO authenticated, service_role;

-- ============================================================================
-- 6. Morosos e ingresos del mes (security invoker: la RLS de cobros/pagos acota
-- el resultado a los alumnos del coach)
-- ============================================================================

CREATE OR REPLACE VIEW public.v_morosos
WITH (security_invoker = true) AS
SELECT
  c.id AS cobro_id,
  c.alumno_id,
  c.contratacion_id,
  c.periodo,
  c.monto,
  c.fecha_vencimiento,
  ((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - c.fecha_vencimiento) AS dias_atraso
FROM public.cobros c
WHERE c.estado <> 'PAGADO'
  AND c.fecha_vencimiento < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;

REVOKE ALL ON public.v_morosos FROM anon;

CREATE OR REPLACE FUNCTION public.ingresos_mes(p_mes DATE DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH m AS (
    SELECT date_trunc('month', COALESCE(
      p_mes, (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date))::date AS desde
  )
  SELECT COALESCE(sum(p.monto), 0)
  FROM public.pagos p, m
  WHERE p.estado = 'CONFIRMADO'
    AND (p.confirmado_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date >= m.desde
    AND (p.confirmado_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        < (m.desde + INTERVAL '1 month')::date;
$$;

REVOKE EXECUTE ON FUNCTION public.ingresos_mes(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ingresos_mes(DATE) TO authenticated, service_role;

-- ============================================================================
-- 7. Respaldo: cobros pasa a ser restaurable (antes de pagos, que lo referencia)
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
    'mensajes', 'habitos_registros', 'nutricion_registros', 'alertas_entrenador',
    'alumno_historial_dolor', 'alumno_cuestionario_inicial', 'planes_membresia', 'planes_membresia_precios',
    'contrataciones', 'cobros', 'pagos',
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
