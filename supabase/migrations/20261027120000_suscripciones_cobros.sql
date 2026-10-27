-- ============================================================================
-- GOZS-182: suscripciones (servicio como CHECK de texto), cobros y pagos manuales (Coach Studio).
-- Reutiliza public.clases (cupo flexible: capacidad NULL/editable, sin bloqueo
-- duro) y public.reservas (= clase_asistentes). public.pagos ya existe
-- (contrataciones), por eso los pagos de cobros viven en public.pagos_cobro.
-- Escrituras de cobros/pagos_cobro solo via RPC SECURITY DEFINER.
-- ============================================================================

-- 1. suscripciones ---------------------------------------------------------
-- Un alumno puede tener varias (servicios combinables). Pase libre =
-- servicio NULL y veces_por_semana NULL (cubre FUNCIONAL y BOXEO).
CREATE TABLE IF NOT EXISTS public.suscripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  entrenador_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  servicio TEXT CHECK (servicio IN ('RUTINA', 'FUNCIONAL', 'BOXEO')),
  veces_por_semana SMALLINT CHECK (veces_por_semana BETWEEN 1 AND 7),
  precio_pactado NUMERIC(12,2) NOT NULL CHECK (precio_pactado >= 0),
  estado TEXT NOT NULL DEFAULT 'ACTIVA' CHECK (estado IN ('ACTIVA', 'PAUSADA', 'CANCELADA')),
  dia_vencimiento SMALLINT NOT NULL DEFAULT 10 CHECK (dia_vencimiento BETWEEN 1 AND 28),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_suscripcion_pase_libre CHECK (servicio IS NOT NULL OR veces_por_semana IS NULL)
);

DROP TRIGGER IF EXISTS trg_suscripciones_updated_at ON public.suscripciones;
CREATE TRIGGER trg_suscripciones_updated_at
  BEFORE UPDATE ON public.suscripciones
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_suscripciones_alumno_id ON public.suscripciones (alumno_id);
CREATE INDEX IF NOT EXISTS idx_suscripciones_entrenador_id ON public.suscripciones (entrenador_id);
CREATE INDEX IF NOT EXISTS idx_suscripciones_updated_at ON public.suscripciones (updated_at);

-- 2. cobros ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cobros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suscripcion_id UUID NOT NULL REFERENCES public.suscripciones(id) ON DELETE RESTRICT,
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  entrenador_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  periodo DATE NOT NULL CHECK (periodo = date_trunc('month', periodo)::date),
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  fecha_vencimiento DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'PAGADO', 'VENCIDO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cobros_suscripcion_periodo UNIQUE (suscripcion_id, periodo)
);

DROP TRIGGER IF EXISTS trg_cobros_updated_at ON public.cobros;
CREATE TRIGGER trg_cobros_updated_at
  BEFORE UPDATE ON public.cobros
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_cobros_alumno_id ON public.cobros (alumno_id);
CREATE INDEX IF NOT EXISTS idx_cobros_entrenador_estado ON public.cobros (entrenador_id, estado);
CREATE INDEX IF NOT EXISTS idx_cobros_updated_at ON public.cobros (updated_at);

-- 3. pagos_cobro -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pagos_cobro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cobro_id UUID NOT NULL REFERENCES public.cobros(id) ON DELETE RESTRICT,
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha DATE NOT NULL DEFAULT current_date,
  metodo TEXT NOT NULL CHECK (metodo IN ('TRANSFERENCIA', 'EFECTIVO')),
  confirmado_por UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagos_cobro_cobro_id ON public.pagos_cobro (cobro_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cobro_alumno_id ON public.pagos_cobro (alumno_id);
CREATE INDEX IF NOT EXISTS idx_pagos_cobro_confirmado_por ON public.pagos_cobro (confirmado_por);

-- 4. RLS -------------------------------------------------------------------
ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cobros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_cobro ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suscripciones_select" ON public.suscripciones;
CREATE POLICY "suscripciones_select"
  ON public.suscripciones FOR SELECT TO authenticated
  USING (alumno_id = auth.uid() OR entrenador_id = auth.uid() OR public.es_admin());

DROP POLICY IF EXISTS "suscripciones_write_entrenador" ON public.suscripciones;
CREATE POLICY "suscripciones_write_entrenador"
  ON public.suscripciones FOR ALL TO authenticated
  USING (
    public.es_admin()
    OR (entrenador_id = auth.uid() AND public.es_entrenador_de(alumno_id))
  )
  WITH CHECK (
    public.es_admin()
    OR (entrenador_id = auth.uid() AND public.es_entrenador_de(alumno_id))
  );

-- cobros y pagos_cobro: solo SELECT; escritura unicamente via RPC.
DROP POLICY IF EXISTS "cobros_select" ON public.cobros;
CREATE POLICY "cobros_select"
  ON public.cobros FOR SELECT TO authenticated
  USING (alumno_id = auth.uid() OR entrenador_id = auth.uid() OR public.es_admin());

DROP POLICY IF EXISTS "pagos_cobro_select" ON public.pagos_cobro;
CREATE POLICY "pagos_cobro_select"
  ON public.pagos_cobro FOR SELECT TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_admin()
    OR EXISTS (
      SELECT 1 FROM public.cobros c
      WHERE c.id = pagos_cobro.cobro_id AND c.entrenador_id = auth.uid()
    )
  );

-- 5. RPC -------------------------------------------------------------------
-- Genera los cobros del mes (idempotente) para las suscripciones ACTIVAS del
-- entrenador que llama (admin: todas). p_periodo = cualquier fecha del mes.
CREATE OR REPLACE FUNCTION public.generar_cobros_mensuales(p_periodo DATE DEFAULT current_date)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo DATE := date_trunc('month', p_periodo)::date;
  v_count INT;
BEGIN
  IF NOT public.es_entrenador_o_admin() THEN
    RAISE EXCEPTION 'Solo entrenadores o admin' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.cobros (suscripcion_id, alumno_id, entrenador_id, periodo, monto, fecha_vencimiento)
  SELECT s.id, s.alumno_id, s.entrenador_id, v_periodo, s.precio_pactado,
         v_periodo + (s.dia_vencimiento - 1)
  FROM public.suscripciones s
  WHERE s.estado = 'ACTIVA'
    AND (s.entrenador_id = auth.uid() OR public.es_admin())
  ON CONFLICT (suscripcion_id, periodo) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Registra un pago confirmado manualmente; el cobro pasa a PAGADO al cubrir el monto.
CREATE OR REPLACE FUNCTION public.registrar_pago_cobro(
  p_cobro_id UUID,
  p_monto NUMERIC,
  p_metodo TEXT,
  p_fecha DATE DEFAULT current_date
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cobro public.cobros%ROWTYPE;
  v_pago_id UUID;
  v_pagado NUMERIC;
BEGIN
  SELECT * INTO v_cobro FROM public.cobros WHERE id = p_cobro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobro inexistente' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.es_admin() OR v_cobro.entrenador_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sin permiso sobre este cobro' USING ERRCODE = '42501';
  END IF;
  IF v_cobro.estado = 'PAGADO' THEN
    RAISE EXCEPTION 'El cobro ya esta pagado' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.pagos_cobro (cobro_id, alumno_id, monto, fecha, metodo, confirmado_por)
  VALUES (p_cobro_id, v_cobro.alumno_id, p_monto, p_fecha, p_metodo, auth.uid())
  RETURNING id INTO v_pago_id;

  SELECT COALESCE(sum(monto), 0) INTO v_pagado FROM public.pagos_cobro WHERE cobro_id = p_cobro_id;
  IF v_pagado >= v_cobro.monto THEN
    UPDATE public.cobros SET estado = 'PAGADO' WHERE id = p_cobro_id;
  END IF;

  RETURN v_pago_id;
END;
$$;

-- Marca como VENCIDO los cobros PENDIENTES con fecha de vencimiento pasada.
CREATE OR REPLACE FUNCTION public.marcar_cobros_vencidos()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT public.es_entrenador_o_admin() THEN
    RAISE EXCEPTION 'Solo entrenadores o admin' USING ERRCODE = '42501';
  END IF;

  UPDATE public.cobros
  SET estado = 'VENCIDO'
  WHERE estado = 'PENDIENTE'
    AND fecha_vencimiento < current_date
    AND (entrenador_id = auth.uid() OR public.es_admin());

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generar_cobros_mensuales(DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_pago_cobro(UUID, NUMERIC, TEXT, DATE) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marcar_cobros_vencidos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generar_cobros_mensuales(DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_pago_cobro(UUID, NUMERIC, TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marcar_cobros_vencidos() TO authenticated, service_role;

-- 6. Respaldo: agrega las tablas nuevas a la whitelist de restaurar_filas_respaldo.
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
    'auditoria_cambios', 'sustituciones_ejercicios', 'clases_horario', 'clases', 'clases_profesores', 'reservas',
    'suscripciones', 'cobros', 'pagos_cobro'
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

