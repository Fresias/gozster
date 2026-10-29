-- GOZS-292: registro de errores de la app (guardado y futuros). Lo inserta el cliente
-- porque si la RPC falla la transaccion se revierte. payload_resumen es un resumen, no el JSON completo.

CREATE TABLE IF NOT EXISTS public.errores_app (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  contexto TEXT NOT NULL,
  mensaje_humano TEXT NOT NULL,
  detalle_tecnico TEXT,
  payload_resumen JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_errores_app_created_at ON public.errores_app (created_at DESC);

ALTER TABLE public.errores_app ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "errores_app_insert_propio" ON public.errores_app;
CREATE POLICY "errores_app_insert_propio"
  ON public.errores_app FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid());

DROP POLICY IF EXISTS "errores_app_select_staff" ON public.errores_app;
CREATE POLICY "errores_app_select_staff"
  ON public.errores_app FOR SELECT TO authenticated
  USING (public.es_entrenador_o_admin());
