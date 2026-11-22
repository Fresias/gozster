-- ============================================================================
-- GOZSter: RPC renovar_contratacion (cuota, pago y extensión en una transacción)
-- Archivo: supabase/migrations/20261122230000_renovar_contratacion.sql
-- Multica Issue: GOZS-699
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. RPC: renovar_contratacion
--    En una sola transacción:
--      a) crea (o toma) el cobro del período siguiente (uq_cobros_contratacion_periodo);
--      b) registra el pago con cobro_id y monto_lista, con la semántica de registrar_pago;
--      c) extiende fecha_fin al dia_vencimiento del mes siguiente ("no se corre la fecha").
--    Período siguiente = mes de la fecha_fin vigente (el primer cobro de
--    asignar_suscripcion_y_cobro es el mes de fecha_inicio).
--    Idempotente por p_idempotency_key: un reintento devuelve el mismo resultado
--    sin crear otro cobro, otro pago ni otra extensión.
--    SECURITY DEFINER: fn_proteger_periodo_contratacion solo deja mover el
--    período cuando current_user no es authenticated/anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.renovar_contratacion(
  p_contratacion_id UUID,
  p_monto NUMERIC,
  p_medio_pago TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  contratacion_id UUID,
  cobro_id UUID,
  pago_id UUID,
  periodo DATE,
  fecha_fin DATE,
  estado TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contratacion public.contrataciones%ROWTYPE;
  v_cobro public.cobros%ROWTYPE;
  v_pago public.pagos%ROWTYPE;
  v_periodo DATE;
  v_mes_siguiente DATE;
  v_nueva_fecha_fin DATE;
  v_concepto TEXT;
  v_monto_lista NUMERIC;
  v_metodo TEXT := CASE
    WHEN upper(btrim(p_medio_pago)) = 'MERCADO_PAGO' THEN 'PASARELA_ONLINE'
    ELSE upper(btrim(p_medio_pago))
  END;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'La clave de idempotencia del pago es obligatoria'
      USING ERRCODE = '22023';
  END IF;

  IF v_metodo IS NULL OR v_metodo NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'PASARELA_ONLINE', 'OTRO') THEN
    RAISE EXCEPTION 'Método de pago inválido: debe ser TRANSFERENCIA, EFECTIVO, PASARELA_ONLINE u OTRO'
      USING ERRCODE = '22023';
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0' USING ERRCODE = '22023';
  END IF;

  -- Bloqueo de fila: reintentos concurrentes de la misma renovación se serializan
  SELECT * INTO v_contratacion
  FROM public.contrataciones c
  WHERE c.id = p_contratacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratación no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    COALESCE(public.es_admin(), false)
    OR (
      COALESCE(public.es_entrenador_o_admin(), false)
      AND COALESCE(public.es_entrenador_de(v_contratacion.alumno_id), false)
    )
  ) THEN
    RAISE EXCEPTION 'No autorizado para renovar contrataciones de este alumno'
      USING ERRCODE = '42501';
  END IF;

  -- Reintento con la misma clave: devolver lo ya hecho, sin efectos
  SELECT * INTO v_pago FROM public.pagos p WHERE p.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_pago.contratacion_id <> p_contratacion_id THEN
      RAISE EXCEPTION 'La clave de idempotencia ya fue usada por otra contratación'
        USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_cobro FROM public.cobros cb WHERE cb.id = v_pago.cobro_id;
    RETURN QUERY SELECT
      v_contratacion.id, v_pago.cobro_id, v_pago.id, v_cobro.periodo,
      v_contratacion.fecha_fin, v_contratacion.estado;
    RETURN;
  END IF;

  v_periodo := date_trunc('month', v_contratacion.fecha_fin::timestamp)::date;
  v_mes_siguiente := (v_periodo + INTERVAL '1 month')::date;
  v_nueva_fecha_fin := v_mes_siguiente + (
    LEAST(
      v_contratacion.dia_vencimiento,
      EXTRACT(DAY FROM (v_mes_siguiente + INTERVAL '1 month' - INTERVAL '1 day'))::INT
    ) - 1
  );

  -- Concepto heredado de la última cuota de la contratación
  SELECT cb.concepto INTO v_concepto
  FROM public.cobros cb
  WHERE cb.contratacion_id = v_contratacion.id
  ORDER BY cb.periodo DESC
  LIMIT 1;

  -- a) Cuota del período siguiente (o la existente si ya estaba generada)
  INSERT INTO public.cobros (
    contratacion_id, alumno_id, periodo, monto, fecha_vencimiento, estado, concepto
  ) VALUES (
    v_contratacion.id,
    v_contratacion.alumno_id,
    v_periodo,
    COALESCE(v_contratacion.precio_pactado, p_monto),
    v_contratacion.fecha_fin,
    'PENDIENTE',
    v_concepto
  )
  ON CONFLICT ON CONSTRAINT uq_cobros_contratacion_periodo DO NOTHING;

  SELECT * INTO v_cobro
  FROM public.cobros cb
  WHERE cb.contratacion_id = v_contratacion.id AND cb.periodo = v_periodo
  FOR UPDATE;

  IF v_cobro.estado = 'PAGADO' THEN
    RAISE EXCEPTION 'El cobro ya está pagado' USING ERRCODE = 'GZ020';
  END IF;

  -- b) Pago con la semántica de registrar_pago (monto_lista = monto de la cuota)
  v_monto_lista := v_cobro.monto;

  INSERT INTO public.pagos (
    contratacion_id, alumno_id, cobro_id, monto, monto_lista, medio_pago, estado,
    idempotency_key, confirmado_por, confirmado_at
  ) VALUES (
    v_contratacion.id, v_contratacion.alumno_id, v_cobro.id, p_monto, v_monto_lista, v_metodo,
    'CONFIRMADO', p_idempotency_key, auth.uid(), now()
  )
  RETURNING * INTO v_pago;

  UPDATE public.cobros cb
  SET
    estado = 'PAGADO',
    monto = CASE WHEN p_monto IS DISTINCT FROM v_cobro.monto THEN p_monto ELSE v_cobro.monto END
  WHERE cb.id = v_cobro.id;

  -- c) Extensión del período
  UPDATE public.contrataciones c
  SET
    fecha_fin = v_nueva_fecha_fin,
    estado = public.fn_estado_contratacion_por_fecha(v_nueva_fecha_fin, c.dias_aviso_previo)
  WHERE c.id = v_contratacion.id
  RETURNING * INTO v_contratacion;

  RETURN QUERY SELECT
    v_contratacion.id, v_cobro.id, v_pago.id, v_periodo,
    v_contratacion.fecha_fin, v_contratacion.estado;
END;
$$;

REVOKE ALL ON FUNCTION public.renovar_contratacion(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renovar_contratacion(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 2. Trigger de período: el mensaje nombra la RPC nueva
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_proteger_periodo_contratacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.alumno_id IS DISTINCT FROM OLD.alumno_id
    OR NEW.fecha_inicio IS DISTINCT FROM OLD.fecha_inicio
    OR NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin
    OR NEW.dia_vencimiento IS DISTINCT FROM OLD.dia_vencimiento
  ) THEN
    RAISE EXCEPTION 'El período de la contratación solo se modifica con renovar_contratacion o extender_contratacion_excepcional'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
