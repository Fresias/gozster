-- asignar_rutina_a_alumno acepta p_nombre opcional (GOZS-331).
-- NULL (o vacío) = nombre de la plantilla, igual que antes. Cambia la firma: DROP + CREATE + GRANT.
-- SECURITY DEFINER, search_path y permisos idénticos a 20261029130000.

DROP FUNCTION IF EXISTS public.asignar_rutina_a_alumno(UUID, UUID);

CREATE OR REPLACE FUNCTION public.asignar_rutina_a_alumno(
  p_plan_id UUID,
  p_alumno_id UUID,
  p_nombre TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origen public.planes_entrenamiento%ROWTYPE;
  v_nuevo_id UUID;
  v_ahora TIMESTAMPTZ := now();
BEGIN
  IF auth.uid() IS NULL OR NOT (public.es_admin() OR public.es_entrenador_de(p_alumno_id)) THEN
    RAISE EXCEPTION 'Ese alumno no está asignado a tu cuenta' USING ERRCODE = 'GZ010';
  END IF;

  SELECT * INTO v_origen FROM public.planes_entrenamiento WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La rutina que intentas asignar ya no existe' USING ERRCODE = 'GZ010';
  END IF;
  IF NOT (
    public.es_admin()
    OR v_origen.profesor_id = auth.uid()
    OR (v_origen.alumno_id IS NULL AND public.es_entrenador_o_admin())
    OR (v_origen.alumno_id IS NOT NULL AND public.es_entrenador_de(v_origen.alumno_id))
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para asignar esta rutina' USING ERRCODE = 'GZ010';
  END IF;

  -- serializa asignaciones concurrentes al mismo alumno
  PERFORM 1 FROM public.perfiles WHERE id = p_alumno_id FOR UPDATE;

  UPDATE public.planes_entrenamiento
  SET estado = 'INACTIVO', fecha_fin = v_ahora
  WHERE alumno_id = p_alumno_id AND estado = 'ACTIVO';

  v_nuevo_id := public.clonar_plan_entrenamiento(p_plan_id, COALESCE(NULLIF(btrim(p_nombre), ''), v_origen.nombre));

  UPDATE public.planes_entrenamiento
  SET alumno_id = p_alumno_id,
      profesor_id = auth.uid(),
      tipo = 'DE_ALUMNO',
      estado = 'ACTIVO',
      fecha_inicio = v_ahora,
      fecha_fin = NULL
  WHERE id = v_nuevo_id;

  RETURN v_nuevo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.asignar_rutina_a_alumno(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_rutina_a_alumno(UUID, UUID, TEXT) TO authenticated;
