-- GOZS-224: un alumno puede estar en varias actividades a la vez, cada una con
-- frecuencia semanal o pase libre. Tabla chica nueva + RPC de ficha; se reutilizan
-- contrataciones (última suscripción) y cobros (monto/estado).

BEGIN;

CREATE TABLE IF NOT EXISTS public.alumno_actividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  actividad TEXT NOT NULL CHECK (actividad IN ('FUNCIONAL', 'BOXEO', 'RUTINAS')),
  veces_por_semana INT CHECK (veces_por_semana BETWEEN 1 AND 7),
  pase_libre BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_alumno_actividades UNIQUE (alumno_id, actividad),
  -- O frecuencia semanal, o pase libre; nunca ambos ni ninguno.
  CONSTRAINT chk_alumno_actividades_frecuencia
    CHECK ((pase_libre AND veces_por_semana IS NULL) OR (NOT pase_libre AND veces_por_semana IS NOT NULL))
);

DROP TRIGGER IF EXISTS trg_alumno_actividades_updated_at ON public.alumno_actividades;
CREATE TRIGGER trg_alumno_actividades_updated_at
  BEFORE UPDATE ON public.alumno_actividades
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_alumno_actividades_updated_at
  ON public.alumno_actividades (updated_at);

ALTER TABLE public.alumno_actividades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alumno_actividades_select" ON public.alumno_actividades;
CREATE POLICY "alumno_actividades_select"
  ON public.alumno_actividades FOR SELECT TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "alumno_actividades_insert_staff" ON public.alumno_actividades;
CREATE POLICY "alumno_actividades_insert_staff"
  ON public.alumno_actividades FOR INSERT TO authenticated
  WITH CHECK (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(alumno_id))
  );

DROP POLICY IF EXISTS "alumno_actividades_update_staff" ON public.alumno_actividades;
CREATE POLICY "alumno_actividades_update_staff"
  ON public.alumno_actividades FOR UPDATE TO authenticated
  USING (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(alumno_id))
  )
  WITH CHECK (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(alumno_id))
  );

DROP POLICY IF EXISTS "alumno_actividades_delete_staff" ON public.alumno_actividades;
CREATE POLICY "alumno_actividades_delete_staff"
  ON public.alumno_actividades FOR DELETE TO authenticated
  USING (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(alumno_id))
  );

REVOKE ALL ON public.alumno_actividades FROM anon;

-- Ficha: actividades + última suscripción (contratación más reciente) con su
-- último cobro. SECURITY INVOKER: la RLS de cada tabla decide qué se ve.
CREATE OR REPLACE FUNCTION public.obtener_ficha_alumno_actividades(p_alumno_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'alumno_id', p_alumno_id,
    'actividades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'actividad', a.actividad,
        'veces_por_semana', a.veces_por_semana,
        'pase_libre', a.pase_libre
      ) ORDER BY a.actividad)
      FROM public.alumno_actividades a
      WHERE a.alumno_id = p_alumno_id
    ), '[]'::jsonb),
    'ultima_suscripcion', (
      SELECT jsonb_build_object(
        'contratacion_id', c.id,
        'estado', c.estado,
        'fecha_fin', c.fecha_fin,
        'monto', COALESCE(c.precio_pactado, pm.precio),
        'ultimo_cobro', (
          SELECT jsonb_build_object('periodo', co.periodo, 'monto', co.monto, 'estado', co.estado)
          FROM public.cobros co
          WHERE co.contratacion_id = c.id
          ORDER BY co.periodo DESC
          LIMIT 1
        )
      )
      FROM public.contrataciones c
      LEFT JOIN public.planes_membresia pm ON pm.id = c.plan_membresia_id
      WHERE c.alumno_id = p_alumno_id
      ORDER BY c.fecha_inicio DESC, c.created_at DESC
      LIMIT 1
    )
  );
$$;

REVOKE ALL ON FUNCTION public.obtener_ficha_alumno_actividades(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_ficha_alumno_actividades(UUID) TO authenticated;

COMMIT;
