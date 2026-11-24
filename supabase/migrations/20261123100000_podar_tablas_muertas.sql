-- GOZS-720 (PL-8): poda de tablas sin uso.
-- - habitos_registros / nutricion_registros: sus componentes nunca se montan.
-- - ejercicios_alternativas: nadie la lee ni escribe desde la app.
-- - ranking_prs: reemplazada por la vista v_prs (GOZS-725).
-- push_cola se conserva: la usa el procesador de push (GOZS-714).
-- Sin CASCADE: si apareciera una dependencia inesperada, la migración falla.

BEGIN;

-- eliminar_clase_vacia dejaba de compilar al borrar ranking_prs:
-- se redefine idéntica, sin ese chequeo.
CREATE OR REPLACE FUNCTION public.eliminar_clase_vacia(p_clase_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clase public.clases%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado: se requiere autenticación'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_clase FROM public.clases WHERE id = p_clase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.es_profesor_de_clase(p_clase_id) THEN
    RAISE EXCEPTION 'Solo un profesor de la clase o un administrador puede eliminarla'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservas
    WHERE clase_id = p_clase_id
      AND estado IN ('ANOTADO', 'AUSENTE')
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar una clase con alumnos inscriptos'
      USING ERRCODE = 'GZ010';
  END IF;

  -- Limpiar reservas históricas CANCELADO/ANULADO para evitar ON DELETE RESTRICT
  DELETE FROM public.reservas
  WHERE clase_id = p_clase_id
    AND estado IN ('CANCELADO', 'ANULADO');

  DELETE FROM public.clases WHERE id = p_clase_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_clase_vacia(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_clase_vacia(UUID) TO authenticated, service_role;

-- Respaldo: las tablas podadas dejan de ser restaurables.
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
    'perfiles', 'ejercicios', 'entrenador_alumnos', 'planes_entrenamiento', 'dias_rutina',
    'ejercicios_en_rutina', 'registro_sesiones', 'registro_series', 'conversaciones',
    'mensajes', 'push_suscripciones', 'push_cola', 'alertas_entrenador',
    'alumno_historial_dolor', 'alumno_cuestionario_inicial', 'feriados', 'planes_membresia', 'planes_membresia_precios',
    'contrataciones', 'alumno_actividades', 'cobros', 'pagos',
    'auditoria_cambios', 'sustituciones_ejercicios', 'clases_horario', 'clases_fijas', 'clases', 'clases_profesores', 'reservas', 'feedback_clase', 'logros_racha'
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

DROP TABLE IF EXISTS public.ranking_prs;
DROP TABLE IF EXISTS public.ejercicios_alternativas;
DROP TABLE IF EXISTS public.habitos_registros;
DROP TABLE IF EXISTS public.nutricion_registros;

COMMIT;
