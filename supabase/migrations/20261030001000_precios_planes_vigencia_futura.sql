-- GOZS-223: un cambio de precio de plan solo puede tener vigencia futura.
-- Quien usa la API (anon/authenticated) no puede cargar vigente_desde <= hoy (fecha Argentina):
-- los pagos cobrados y las cuotas vencidas conservan su monto. La fila inicial ('-infinity'),
-- el backfill y las cargas privilegiadas (postgres/service_role) quedan exentas.
-- El ingreso de planes multi-mes ya cuenta completo el mes del cobro: obtener_kpis_negocio
-- suma pagos.monto por confirmado_at, sin prorratear.

BEGIN;

CREATE OR REPLACE FUNCTION public.exigir_vigencia_futura_precio()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_hoy CONSTANT DATE := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF NEW.vigente_desde <> '-infinity' AND NEW.vigente_desde <= v_hoy
     AND current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'El nuevo precio debe regir desde una fecha posterior a hoy (%)', v_hoy
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_planes_membresia_precios_futuro ON public.planes_membresia_precios;
CREATE TRIGGER trg_planes_membresia_precios_futuro
  BEFORE INSERT ON public.planes_membresia_precios
  FOR EACH ROW EXECUTE FUNCTION public.exigir_vigencia_futura_precio();

COMMIT;
