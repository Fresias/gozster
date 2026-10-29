-- ============================================================================
-- GOZSter: Clases fijas del alumno según su plan, asignables por el coach
-- Archivo: supabase/migrations/20261028130000_clases_fijas_alumno.sql
-- Multica Issue: GOZS-225
-- Idempotente para PostgreSQL 15+ / Supabase
--
-- Una clase fija vincula al alumno con un slot de la grilla semanal
-- (clases_horario). Escritura solo vía RPC SECURITY DEFINER: el alumno elige las
-- suyas (auth.uid()); el entrenador asignado o ADMIN las asigna a un alumno.
-- El total de fijas no puede exceder limite_semanal del plan vigente (NULL =
-- pase libre, sin tope). Mismos códigos SQLSTATE que reservar_clase:
--   GZ002 excede el plan           GZ004 membresía no habilitada
--   GZ003 actividad no habilitada  GZ008 ya es clase fija
--   GZ010 horario inactivo         42501 sin permisos   P0002 no encontrado
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.clases_fijas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  horario_id UUID NOT NULL REFERENCES public.clases_horario(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_clases_fijas_alumno_horario UNIQUE (alumno_id, horario_id)
);

CREATE INDEX IF NOT EXISTS idx_clases_fijas_horario_id ON public.clases_fijas (horario_id);
CREATE INDEX IF NOT EXISTS idx_clases_fijas_updated_at ON public.clases_fijas (updated_at);

DROP TRIGGER IF EXISTS trg_clases_fijas_updated_at ON public.clases_fijas;
CREATE TRIGGER trg_clases_fijas_updated_at
  BEFORE UPDATE ON public.clases_fijas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS: el alumno ve las suyas desde el alta; staff ve todas; sin escritura directa.
ALTER TABLE public.clases_fijas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clases_fijas_select_alumno_o_staff" ON public.clases_fijas;
CREATE POLICY "clases_fijas_select_alumno_o_staff"
  ON public.clases_fijas FOR SELECT TO authenticated
  USING (alumno_id = auth.uid() OR public.es_entrenador_o_admin());

REVOKE INSERT, UPDATE, DELETE ON public.clases_fijas FROM anon, authenticated;

-- ¿Puede el usuario actual gestionar las clases fijas de p_alumno_id?
CREATE OR REPLACE FUNCTION public.puede_gestionar_clases_fijas(p_alumno_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    p_alumno_id = auth.uid()
    OR public.es_admin()
    OR EXISTS (
      SELECT 1 FROM public.perfiles
      WHERE id = p_alumno_id AND profesor_asignado_id = auth.uid()
    )
  );
$$;

-- Fija un horario para el alumno (por defecto, el usuario actual).
CREATE OR REPLACE FUNCTION public.asignar_clase_fija(
  p_horario_id UUID,
  p_alumno_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_alumno UUID := COALESCE(p_alumno_id, auth.uid());
  v_horario public.clases_horario%ROWTYPE;
  v_contratacion public.contrataciones%ROWTYPE;
  v_plan public.planes_membresia%ROWTYPE;
  v_id UUID;
BEGIN
  IF NOT public.puede_gestionar_clases_fijas(v_alumno) THEN
    RAISE EXCEPTION 'Sin permisos para gestionar clases fijas de este alumno'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_horario FROM public.clases_horario WHERE id = p_horario_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Horario no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_horario.activo THEN
    RAISE EXCEPTION 'El horario no está activo' USING ERRCODE = 'GZ010';
  END IF;

  -- Lock de la contratación: serializa asignaciones simultáneas (tope del plan).
  SELECT * INTO v_contratacion
  FROM public.contrataciones
  WHERE alumno_id = v_alumno AND plan_membresia_id IS NOT NULL
  ORDER BY fecha_fin DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El alumno no tiene una membresía de clases' USING ERRCODE = 'GZ004';
  END IF;
  IF v_contratacion.estado IN ('EN_PAUSA', 'VENCIDA')
     OR v_contratacion.fecha_fin < (now() AT TIME ZONE c_tz)::date THEN
    RAISE EXCEPTION 'La membresía del alumno no está habilitada' USING ERRCODE = 'GZ004';
  END IF;

  SELECT * INTO v_plan FROM public.planes_membresia WHERE id = v_contratacion.plan_membresia_id;

  IF v_plan.cantidad_actividades = 1
     AND v_contratacion.actividad IS DISTINCT FROM v_horario.actividad THEN
    RAISE EXCEPTION 'El plan no habilita la actividad %', v_horario.actividad
      USING ERRCODE = 'GZ003';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clases_fijas
    WHERE alumno_id = v_alumno AND horario_id = p_horario_id
  ) THEN
    RAISE EXCEPTION 'Ya es una clase fija del alumno' USING ERRCODE = 'GZ008';
  END IF;

  IF v_plan.limite_semanal IS NOT NULL AND (
    SELECT count(*) FROM public.clases_fijas WHERE alumno_id = v_alumno
  ) >= v_plan.limite_semanal THEN
    RAISE EXCEPTION 'El plan permite como máximo % clases fijas', v_plan.limite_semanal
      USING ERRCODE = 'GZ002';
  END IF;

  INSERT INTO public.clases_fijas (alumno_id, horario_id)
  VALUES (v_alumno, p_horario_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Quita una clase fija (el alumno la suya; el coach asignado o ADMIN, las de su alumno).
CREATE OR REPLACE FUNCTION public.quitar_clase_fija(p_clase_fija_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno UUID;
BEGIN
  SELECT alumno_id INTO v_alumno FROM public.clases_fijas WHERE id = p_clase_fija_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase fija no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.puede_gestionar_clases_fijas(v_alumno) THEN
    RAISE EXCEPTION 'Sin permisos para gestionar clases fijas de este alumno'
      USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.clases_fijas WHERE id = p_clase_fija_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.puede_gestionar_clases_fijas(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.asignar_clase_fija(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.quitar_clase_fija(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puede_gestionar_clases_fijas(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asignar_clase_fija(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quitar_clase_fija(UUID) TO authenticated, service_role;

-- Respaldo: clases_fijas pasa a ser restaurable (después de perfiles y clases_horario por las FK).
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
    'contrataciones', 'cobros', 'pagos',
    'auditoria_cambios', 'sustituciones_ejercicios', 'clases_horario', 'clases', 'clases_profesores', 'reservas',
    'push_suscripciones', 'push_cola', 'alumno_actividades', 'clases_fijas'
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

COMMIT;
