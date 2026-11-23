-- GOZS-713 (PL-15): generación automática de cuotas mensuales en el job diario.
--
-- Suma un paso a public.job_diario_contrataciones() (GOZS-706), sin tocar el
-- schedule de pg_cron: crea el cobro del período siguiente de cada
-- contratación activa.
--
-- Período siguiente = mes de fecha_fin, con vencimiento en fecha_fin: la misma
-- cuota que crea o toma renovar_contratacion (GOZS-699). Las dos usan
-- ON CONFLICT sobre uq_cobros_contratacion_periodo, así que conviven: la que
-- llega segunda no duplica nada.
--
-- Se genera cuando fecha_fin entra en la ventana de aviso
-- (fecha_fin - CURRENT_DATE <= dias_aviso_previo), igual que POR_VENCER: la
-- cuota aparece "por cobrar" antes de vencer y, si no se paga, v_morosos la
-- toma al pasar fecha_vencimiento.
--
-- Corre ANTES que los vencimientos para que una contratación que vence hoy
-- (o que ya venció y el job todavía no marcó) reciba su cuota.
--
-- Monto: precio_pactado; si falta, el de la última cuota. Concepto heredado de
-- la última cuota. Sin monto conocido no se genera (cobros.monto es NOT NULL).
--
-- Idempotente: CREATE OR REPLACE y ON CONFLICT DO NOTHING.

BEGIN;

CREATE OR REPLACE FUNCTION public.job_diario_contrataciones()
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_resultado jsonb := '{}'::jsonb;
  v_por_vencer INT;
  v_vencidas INT;
  v_cuotas INT;
BEGIN
  -- Paso 1 (PL-15): cuota del período siguiente de cada contratación activa.
  INSERT INTO public.cobros (
    contratacion_id, alumno_id, periodo, monto, fecha_vencimiento, estado, concepto
  )
  SELECT
    c.id,
    c.alumno_id,
    date_trunc('month', c.fecha_fin::timestamp)::date,
    COALESCE(c.precio_pactado, ult.monto),
    c.fecha_fin,
    'PENDIENTE',
    ult.concepto
  FROM public.contrataciones c
  LEFT JOIN LATERAL (
    SELECT cb.monto, cb.concepto
    FROM public.cobros cb
    WHERE cb.contratacion_id = c.id
    ORDER BY cb.periodo DESC
    LIMIT 1
  ) ult ON true
  WHERE c.estado IN ('VIGENTE', 'POR_VENCER', 'PENDIENTE_RENOVACION')
    AND c.fecha_fin - CURRENT_DATE <= c.dias_aviso_previo
    AND COALESCE(c.precio_pactado, ult.monto) IS NOT NULL
  ON CONFLICT ON CONSTRAINT uq_cobros_contratacion_periodo DO NOTHING;

  GET DIAGNOSTICS v_cuotas = ROW_COUNT;

  -- Paso 2: vencimientos. La propia función valida el llamador
  -- (job sin JWT, service_role o ADMIN).
  SELECT e.por_vencer, e.vencidas
  INTO v_por_vencer, v_vencidas
  FROM public.evaluar_vencimientos_contrataciones() e;

  v_resultado := v_resultado || jsonb_build_object(
    'cuotas_generadas', v_cuotas,
    'por_vencer', v_por_vencer,
    'vencidas', v_vencidas
  );

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION public.job_diario_contrataciones() IS
  'Job diario (pg_cron gozster_job_diario_contrataciones): cuotas del período siguiente (PL-15) y vencimientos de contrataciones.';

REVOKE EXECUTE ON FUNCTION public.job_diario_contrataciones() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_diario_contrataciones() TO service_role;

COMMIT;
