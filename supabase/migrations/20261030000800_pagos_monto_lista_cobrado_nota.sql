-- ============================================================================
-- GOZSter: pagos con monto de lista, monto cobrado y nota (GOZS-222)
--
--   pagos.monto        -> sigue siendo lo efectivamente cobrado (ingresos_mes lo suma)
--   pagos.monto_cobrado-> alias generado de monto (mismo dato, nombre explícito)
--   pagos.monto_lista  -> precio de lista del cobro al momento del pago (NULL en pagos previos)
--   pagos.nota         -> motivo del descuento u observación
-- registrar_pago_con_descuento: cobra <= lista y exige nota si hay descuento.
-- registrar_pago (sin cambios) cobra la lista; un trigger completa monto_lista.
-- ============================================================================

ALTER TABLE public.pagos
  ADD COLUMN IF NOT EXISTS monto_lista NUMERIC(12,2) CHECK (monto_lista >= 0),
  ADD COLUMN IF NOT EXISTS nota TEXT,
  ADD COLUMN IF NOT EXISTS monto_cobrado NUMERIC(12,2) GENERATED ALWAYS AS (monto) STORED;

-- monto_lista se completa solo desde el cobro (registrar_pago original incluido).
CREATE OR REPLACE FUNCTION public.fn_pago_monto_lista()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.monto_lista IS NULL AND NEW.cobro_id IS NOT NULL THEN
    SELECT monto INTO NEW.monto_lista FROM public.cobros WHERE id = NEW.cobro_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pagos_monto_lista ON public.pagos;
CREATE TRIGGER trg_pagos_monto_lista
  BEFORE INSERT ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.fn_pago_monto_lista();

-- Cobro con monto distinto al de lista (descuento). Mismas reglas de acceso que
-- registrar_pago; el monto de lista es el del cobro y el descuento exige nota.
CREATE OR REPLACE FUNCTION public.registrar_pago_con_descuento(
  p_cobro_id UUID,
  p_monto_cobrado NUMERIC,
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

  IF p_monto_cobrado IS NULL OR p_monto_cobrado <= 0 OR p_monto_cobrado > v_cobro.monto THEN
    RAISE EXCEPTION 'El monto cobrado debe ser mayor a 0 y no superar el monto de lista (%)', v_cobro.monto
      USING ERRCODE = '22023';
  END IF;
  IF p_monto_cobrado < v_cobro.monto AND v_nota IS NULL THEN
    RAISE EXCEPTION 'Un cobro con descuento requiere una nota' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pagos (
    contratacion_id, alumno_id, cobro_id, monto, monto_lista, nota, medio_pago, estado,
    idempotency_key, confirmado_por, confirmado_at
  ) VALUES (
    v_cobro.contratacion_id, v_cobro.alumno_id, v_cobro.id, p_monto_cobrado, v_cobro.monto, v_nota,
    p_metodo, 'CONFIRMADO', 'cobro:' || v_cobro.id, auth.uid(), now()
  );

  UPDATE public.cobros SET estado = 'PAGADO' WHERE id = v_cobro.id
  RETURNING * INTO v_cobro;

  RETURN v_cobro;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_con_descuento(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago_con_descuento(UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

-- Descuentos otorgados (lista - cobrado). security_invoker: la RLS de pagos
-- acota el resultado a los alumnos del coach.
CREATE OR REPLACE VIEW public.v_descuentos_otorgados
WITH (security_invoker = true) AS
SELECT
  p.id AS pago_id,
  p.alumno_id,
  p.cobro_id,
  p.confirmado_at,
  p.monto_lista,
  p.monto_cobrado,
  (p.monto_lista - p.monto_cobrado) AS descuento,
  p.nota
FROM public.pagos p
WHERE p.estado = 'CONFIRMADO'
  AND p.monto_lista IS NOT NULL
  AND p.monto_lista > p.monto;

REVOKE ALL ON public.v_descuentos_otorgados FROM anon;
