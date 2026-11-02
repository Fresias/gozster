-- Activar rutina atómico (GOZS-333): RPC activar_rutina + índice único parcial de un solo ACTIVO por alumno.

-- 1) Normaliza datos existentes: por alumno queda el ACTIVO más reciente; el resto pasa a INACTIVO.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY alumno_id
           ORDER BY fecha_inicio DESC NULLS LAST, created_at DESC, id DESC
         ) AS rn
  FROM public.planes_entrenamiento
  WHERE estado = 'ACTIVO' AND alumno_id IS NOT NULL
)
UPDATE public.planes_entrenamiento p
SET estado = 'INACTIVO', fecha_fin = COALESCE(p.fecha_fin, now())
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

-- 2) Garantía en BD.
CREATE UNIQUE INDEX IF NOT EXISTS uq_planes_un_activo_por_alumno
  ON public.planes_entrenamiento (alumno_id)
  WHERE estado = 'ACTIVO' AND alumno_id IS NOT NULL;

-- 3) RPC. SECURITY DEFINER con los mismos chequeos de permiso que asignar_rutina_a_alumno.
CREATE OR REPLACE FUNCTION public.activar_rutina(p_plan_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.planes_entrenamiento%ROWTYPE;
  v_ahora TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para activar una rutina' USING ERRCODE = 'GZ010';
  END IF;

  SELECT * INTO v_plan FROM public.planes_entrenamiento WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La rutina que intentas activar ya no existe' USING ERRCODE = 'GZ010';
  END IF;
  IF v_plan.alumno_id IS NULL THEN
    RAISE EXCEPTION 'Una plantilla no se puede activar: asígnala primero a un alumno' USING ERRCODE = 'GZ010';
  END IF;
  IF NOT (
    public.es_admin()
    OR v_plan.profesor_id = auth.uid()
    OR public.es_entrenador_de(v_plan.alumno_id)
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para activar esta rutina' USING ERRCODE = 'GZ010';
  END IF;

  -- serializa activaciones concurrentes sobre el mismo alumno
  PERFORM 1 FROM public.planes_entrenamiento WHERE alumno_id = v_plan.alumno_id FOR UPDATE;

  UPDATE public.planes_entrenamiento
  SET estado = 'INACTIVO', fecha_fin = v_ahora
  WHERE alumno_id = v_plan.alumno_id AND estado = 'ACTIVO' AND id <> p_plan_id;

  UPDATE public.planes_entrenamiento
  SET estado = 'ACTIVO', fecha_inicio = v_ahora, fecha_fin = NULL
  WHERE id = p_plan_id;

  RETURN p_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activar_rutina(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activar_rutina(UUID) TO authenticated;
