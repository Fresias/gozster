-- ============================================================================
-- GOZSter: Cobros reales Supabase, asignar_suscripcion_y_cobro y registrar_pago
-- editable (GOZS-641)
-- Archivo: supabase/migrations/20261120210000_cobros_reales_asignar_suscripcion_y_registrar_pago.sql
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. EXTENSIÓN: public.cobros (concepto y notas opcionales para diferenciados)
-- ============================================================================

ALTER TABLE public.cobros
  ADD COLUMN IF NOT EXISTS concepto TEXT,
  ADD COLUMN IF NOT EXISTS notas TEXT;

-- ============================================================================
-- 2. EXTENSIÓN: public.contrataciones.actividad soporta 'RUTINAS' además de
--    'FUNCIONAL' y 'BOXEO' (alineado con alumno_actividades y kpis_negocio_v2)
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.contrataciones'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%actividad%'
      AND pg_get_constraintdef(oid) NOT LIKE '%RUTINAS%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.contrataciones DROP CONSTRAINT %I', r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.contrataciones'::regclass
      AND contype = 'c'
      AND conname = 'chk_contrataciones_actividad'
  ) THEN
    ALTER TABLE public.contrataciones
      ADD CONSTRAINT chk_contrataciones_actividad
      CHECK (actividad IS NULL OR actividad IN ('FUNCIONAL', 'BOXEO', 'RUTINAS'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fn_validar_actividad_contratacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_membresia_id IS NOT NULL AND NEW.actividad IS NULL AND EXISTS (
    SELECT 1 FROM public.planes_membresia
    WHERE id = NEW.plan_membresia_id AND cantidad_actividades = 1
  ) THEN
    RAISE EXCEPTION 'El plan habilita una sola actividad: indicá FUNCIONAL, BOXEO o RUTINAS'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. RPC: asignar_suscripcion_y_cobro (SECURITY DEFINER)
--    Asigna plan y/o actividad (nueva o adicional) creando contratación VIGENTE,
--    sincronizando alumno_actividades y generando el cobro (PENDIENTE o PAGADO
--    con registro en pagos). Conserva contrataciones activas si p_es_adicional=true.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.asignar_suscripcion_y_cobro(
  p_alumno_id UUID,
  p_plan_id UUID DEFAULT NULL,
  p_actividad TEXT DEFAULT NULL,
  p_monto NUMERIC DEFAULT NULL,
  p_pagado BOOLEAN DEFAULT false,
  p_medio_pago TEXT DEFAULT 'TRANSFERENCIA',
  p_es_adicional BOOLEAN DEFAULT true,
  p_concepto TEXT DEFAULT NULL,
  p_nota TEXT DEFAULT NULL,
  p_veces_por_semana INT DEFAULT NULL,
  p_pase_libre BOOLEAN DEFAULT false
)
RETURNS TABLE (
  contratacion_id UUID,
  cobro_id UUID,
  pago_id UUID,
  estado_cobro TEXT,
  monto NUMERIC,
  concepto TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_hoy DATE := (now() AT TIME ZONE c_tz)::date;
  v_periodo DATE := date_trunc('month', (now() AT TIME ZONE c_tz)::date)::date;
  v_plan public.planes_membresia%ROWTYPE;
  v_contratacion public.contrataciones%ROWTYPE;
  v_cobro public.cobros%ROWTYPE;
  v_pago_id UUID := NULL;
  v_actividad_norm TEXT := NULLIF(upper(btrim(p_actividad)), '');
  v_actividad_final TEXT := NULL;
  v_tipo_servicio TEXT;
  v_monto NUMERIC;
  v_pagado BOOLEAN := COALESCE(p_pagado, false);
  v_es_adicional BOOLEAN := COALESCE(p_es_adicional, true);
  v_medio_pago TEXT;
  v_nota TEXT := NULLIF(btrim(p_nota), '');
  v_concepto TEXT := NULLIF(btrim(p_concepto), '');
  v_duracion_meses INT := 1;
  v_fecha_fin DATE;
  v_dia_vencimiento INT := EXTRACT(DAY FROM (now() AT TIME ZONE c_tz)::date)::INT;
  v_veces INT := NULL;
  v_pase_libre BOOLEAN := COALESCE(p_pase_libre, false);
BEGIN
  IF p_alumno_id IS NULL THEN
    RAISE EXCEPTION 'p_alumno_id es obligatorio' USING ERRCODE = '22023';
  END IF;

  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(p_alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para asignar suscripciones o cobros a este alumno'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.perfiles WHERE id = p_alumno_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alumno no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF v_actividad_norm IS NOT NULL AND v_actividad_norm NOT IN ('FUNCIONAL', 'BOXEO', 'RUTINAS') THEN
    RAISE EXCEPTION 'Actividad inválida: debe ser FUNCIONAL, BOXEO o RUTINAS'
      USING ERRCODE = '22023';
  END IF;

  IF p_veces_por_semana IS NOT NULL AND (p_veces_por_semana < 1 OR p_veces_por_semana > 7) THEN
    RAISE EXCEPTION 'veces_por_semana debe estar entre 1 y 7'
      USING ERRCODE = '22023';
  END IF;

  IF p_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.planes_membresia WHERE id = p_plan_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plan de membresía no encontrado' USING ERRCODE = 'P0002';
    END IF;
    v_duracion_meses := COALESCE(v_plan.duracion_meses, 1);
  END IF;

  IF p_plan_id IS NULL AND v_actividad_norm IS NULL THEN
    RAISE EXCEPTION 'Indicá un plan o una actividad para asignar la suscripción'
      USING ERRCODE = '22023';
  END IF;

  v_monto := COALESCE(p_monto, v_plan.precio);
  IF v_monto IS NULL OR v_monto < 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor o igual a 0' USING ERRCODE = '22023';
  END IF;

  v_medio_pago := CASE
    WHEN NULLIF(upper(btrim(p_medio_pago)), '') IS NULL THEN 'TRANSFERENCIA'
    WHEN upper(btrim(p_medio_pago)) = 'MERCADO_PAGO' THEN 'PASARELA_ONLINE'
    ELSE upper(btrim(p_medio_pago))
  END;
  IF v_medio_pago NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'PASARELA_ONLINE', 'OTRO') THEN
    RAISE EXCEPTION 'Método de pago inválido: debe ser TRANSFERENCIA, EFECTIVO, PASARELA_ONLINE u OTRO'
      USING ERRCODE = '22023';
  END IF;

  -- Resolver actividad y tipo de servicio de la contratación
  IF v_actividad_norm = 'RUTINAS' THEN
    v_tipo_servicio := 'ASESORIA_ONLINE';
    v_actividad_final := 'RUTINAS';
  ELSIF v_actividad_norm IN ('FUNCIONAL', 'BOXEO') THEN
    v_tipo_servicio := 'PRESENCIAL';
    v_actividad_final := v_actividad_norm;
  ELSIF v_plan.id IS NOT NULL THEN
    IF v_plan.nombre ~* 'rutina|online|corpo' THEN
      v_tipo_servicio := 'ASESORIA_ONLINE';
      v_actividad_final := CASE WHEN v_plan.cantidad_actividades = 1 THEN 'RUTINAS' ELSE NULL END;
    ELSIF v_plan.cantidad_actividades = 1 THEN
      v_tipo_servicio := 'PRESENCIAL';
      IF v_plan.nombre ~* 'boxeo' THEN
        v_actividad_final := 'BOXEO';
      ELSIF v_plan.nombre ~* 'funcional' THEN
        v_actividad_final := 'FUNCIONAL';
      ELSE
        RAISE EXCEPTION 'El plan habilita una sola actividad: indicá FUNCIONAL, BOXEO o RUTINAS'
          USING ERRCODE = '23514';
      END IF;
    ELSE
      v_tipo_servicio := 'PRESENCIAL';
      v_actividad_final := NULL;
    END IF;
  END IF;

  -- Si no es adicional, pausar contrataciones activas previas (sin borrar historial)
  IF NOT v_es_adicional THEN
    UPDATE public.contrataciones
    SET estado = 'EN_PAUSA'
    WHERE alumno_id = p_alumno_id
      AND estado IN ('VIGENTE', 'POR_VENCER', 'PENDIENTE_RENOVACION');
  END IF;

  v_fecha_fin := (v_hoy + make_interval(months => v_duracion_meses))::date;

  INSERT INTO public.contrataciones (
    alumno_id,
    tipo_servicio,
    estado,
    dia_vencimiento,
    fecha_inicio,
    fecha_fin,
    plan_membresia_id,
    actividad,
    precio_pactado
  ) VALUES (
    p_alumno_id,
    v_tipo_servicio,
    'VIGENTE',
    v_dia_vencimiento,
    v_hoy,
    v_fecha_fin,
    p_plan_id,
    v_actividad_final,
    v_monto
  )
  RETURNING * INTO v_contratacion;

  -- Resolver frecuencia semanal para alumno_actividades
  IF v_pase_libre THEN
    v_veces := NULL;
  ELSIF p_veces_por_semana IS NOT NULL THEN
    v_pase_libre := false;
    v_veces := p_veces_por_semana;
  ELSIF v_plan.id IS NOT NULL AND v_plan.limite_semanal IS NOT NULL THEN
    v_pase_libre := false;
    v_veces := v_plan.limite_semanal;
  ELSE
    v_pase_libre := true;
    v_veces := NULL;
  END IF;

  -- Sincronizar alumno_actividades
  IF NOT v_es_adicional THEN
    IF v_actividad_final IS NOT NULL THEN
      DELETE FROM public.alumno_actividades
      WHERE alumno_id = p_alumno_id
        AND actividad <> v_actividad_final;
    ELSIF v_plan.id IS NOT NULL AND v_plan.cantidad_actividades = 2 THEN
      DELETE FROM public.alumno_actividades
      WHERE alumno_id = p_alumno_id
        AND actividad NOT IN ('FUNCIONAL', 'BOXEO');
    END IF;
  END IF;

  IF v_actividad_final IS NOT NULL THEN
    INSERT INTO public.alumno_actividades (alumno_id, actividad, veces_por_semana, pase_libre)
    VALUES (p_alumno_id, v_actividad_final, v_veces, v_pase_libre)
    ON CONFLICT (alumno_id, actividad) DO UPDATE
      SET veces_por_semana = EXCLUDED.veces_por_semana,
          pase_libre = EXCLUDED.pase_libre;
  ELSIF v_plan.id IS NOT NULL AND v_plan.cantidad_actividades = 2 THEN
    INSERT INTO public.alumno_actividades (alumno_id, actividad, veces_por_semana, pase_libre)
    VALUES
      (p_alumno_id, 'FUNCIONAL', v_veces, v_pase_libre),
      (p_alumno_id, 'BOXEO', v_veces, v_pase_libre)
    ON CONFLICT (alumno_id, actividad) DO UPDATE
      SET veces_por_semana = EXCLUDED.veces_por_semana,
          pase_libre = EXCLUDED.pase_libre;
  END IF;

  -- Concepto legible del cobro
  IF v_concepto IS NULL THEN
    v_concepto := CASE
      WHEN v_plan.id IS NOT NULL AND v_es_adicional THEN v_plan.nombre || ' (adicional)'
      WHEN v_plan.id IS NOT NULL THEN v_plan.nombre
      WHEN v_actividad_final = 'FUNCIONAL' AND v_es_adicional THEN 'Funcional (adicional)'
      WHEN v_actividad_final = 'FUNCIONAL' THEN 'Funcional'
      WHEN v_actividad_final = 'BOXEO' AND v_es_adicional THEN 'Boxeo (adicional)'
      WHEN v_actividad_final = 'BOXEO' THEN 'Boxeo'
      WHEN v_actividad_final = 'RUTINAS' AND v_es_adicional THEN 'Rutinas (adicional)'
      WHEN v_actividad_final = 'RUTINAS' THEN 'Rutinas'
      ELSE 'Suscripción'
    END;
  END IF;

  INSERT INTO public.cobros (
    contratacion_id,
    alumno_id,
    periodo,
    monto,
    fecha_vencimiento,
    estado,
    concepto,
    notas
  ) VALUES (
    v_contratacion.id,
    p_alumno_id,
    v_periodo,
    v_monto,
    v_hoy,
    CASE WHEN v_pagado THEN 'PAGADO' ELSE 'PENDIENTE' END,
    v_concepto,
    v_nota
  )
  RETURNING * INTO v_cobro;

  IF v_pagado THEN
    INSERT INTO public.pagos (
      contratacion_id,
      alumno_id,
      cobro_id,
      monto,
      monto_lista,
      nota,
      medio_pago,
      estado,
      idempotency_key,
      confirmado_por,
      confirmado_at
    ) VALUES (
      v_contratacion.id,
      p_alumno_id,
      v_cobro.id,
      v_monto,
      v_monto,
      v_nota,
      v_medio_pago,
      'CONFIRMADO',
      'cobro:' || v_cobro.id,
      auth.uid(),
      now()
    )
    RETURNING id INTO v_pago_id;
  END IF;

  RETURN QUERY SELECT
    v_contratacion.id,
    v_cobro.id,
    v_pago_id,
    v_cobro.estado,
    v_cobro.monto,
    v_cobro.concepto;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_suscripcion_y_cobro(
  UUID, UUID, TEXT, NUMERIC, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, INT, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_suscripcion_y_cobro(
  UUID, UUID, TEXT, NUMERIC, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, INT, BOOLEAN
) TO authenticated, service_role;

-- ============================================================================
-- 4. RPC: registrar_pago(p_cobro_id, p_monto, p_metodo, p_nota)
--    Sobrecarga de 4 parámetros (acepta p_nota NULL o texto) para registrar un
--    monto ajustado/acordado (descuento, mitad de mes, etc.), actualizando
--    cobros.monto si difiere y guardando nota, sin crear ambigüedad con la
--    firma histórica de 3 parámetros.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_pago(
  p_cobro_id UUID,
  p_monto NUMERIC,
  p_metodo TEXT,
  p_nota TEXT
)
RETURNS public.cobros
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cobro public.cobros%ROWTYPE;
  v_nota TEXT := NULLIF(btrim(p_nota), '');
  v_monto_lista NUMERIC;
  v_metodo TEXT := CASE
    WHEN p_metodo = 'MERCADO_PAGO' THEN 'PASARELA_ONLINE'
    ELSE p_metodo
  END;
BEGIN
  IF v_metodo IS NULL OR v_metodo NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'PASARELA_ONLINE', 'OTRO') THEN
    RAISE EXCEPTION 'Método de pago inválido: debe ser TRANSFERENCIA, EFECTIVO, PASARELA_ONLINE u OTRO'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cobro FROM public.cobros WHERE id = p_cobro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobro no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(v_cobro.alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para registrar pagos de este alumno' USING ERRCODE = '42501';
  END IF;

  IF v_cobro.estado = 'PAGADO' THEN
    RAISE EXCEPTION 'El cobro ya está pagado' USING ERRCODE = 'GZ020';
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0' USING ERRCODE = '22023';
  END IF;

  v_monto_lista := v_cobro.monto;

  INSERT INTO public.pagos (
    contratacion_id,
    alumno_id,
    cobro_id,
    monto,
    monto_lista,
    nota,
    medio_pago,
    estado,
    idempotency_key,
    confirmado_por,
    confirmado_at
  ) VALUES (
    v_cobro.contratacion_id,
    v_cobro.alumno_id,
    v_cobro.id,
    p_monto,
    v_monto_lista,
    v_nota,
    v_metodo,
    'CONFIRMADO',
    'cobro:' || v_cobro.id,
    auth.uid(),
    now()
  );

  UPDATE public.cobros
  SET
    estado = 'PAGADO',
    monto = CASE WHEN p_monto IS DISTINCT FROM v_cobro.monto THEN p_monto ELSE v_cobro.monto END,
    notas = COALESCE(v_nota, notas)
  WHERE id = v_cobro.id
  RETURNING * INTO v_cobro;

  RETURN v_cobro;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago(UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
