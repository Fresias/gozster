-- GOZS-229: feriados de Argentina y flag de clases.
-- Fuente oficial: argentina.gob.ar/interior/feriados-nacionales-2026 (Ley 27.399, Decreto 1027/2024
-- de dias no laborables con fines turisticos 2026). Revisar contra la fuente al cargar otros anios.
-- Los datos de 2026 se cargan con supabase/seed_data/feriados_ar_2026.sql (idempotente).
-- Por defecto no hay clases en feriado (hay_clases = false); un coach/admin puede habilitarlas.

CREATE TABLE IF NOT EXISTS public.feriados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('INAMOVIBLE', 'TRASLADABLE', 'PUENTE')),
  hay_clases BOOLEAN NOT NULL DEFAULT false,
  fuente TEXT NOT NULL DEFAULT 'https://www.argentina.gob.ar/interior/feriados-nacionales-2026',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_feriados_updated_at ON public.feriados;
CREATE TRIGGER trg_feriados_updated_at
  BEFORE UPDATE ON public.feriados
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.feriados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feriados_select_autenticado" ON public.feriados;
CREATE POLICY "feriados_select_autenticado"
  ON public.feriados FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "feriados_write_entrenador_o_admin" ON public.feriados;
CREATE POLICY "feriados_write_entrenador_o_admin"
  ON public.feriados FOR ALL TO authenticated
  USING (public.es_entrenador_o_admin())
  WITH CHECK (public.es_entrenador_o_admin());

-- Feriados de un rango (inclusive), ordenados por fecha.
CREATE OR REPLACE FUNCTION public.feriados_en_rango(p_desde DATE, p_hasta DATE)
RETURNS SETOF public.feriados
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM public.feriados WHERE fecha BETWEEN p_desde AND p_hasta ORDER BY fecha;
$$;

-- true si las clases automaticas pueden generarse ese dia (no feriado, o feriado con hay_clases).
-- SECURITY DEFINER: el generador corre con cualquier rol y solo expone un booleano.
CREATE OR REPLACE FUNCTION public.fecha_habilita_clases(p_fecha DATE)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT hay_clases FROM public.feriados WHERE fecha = p_fecha), true);
$$;

REVOKE ALL ON FUNCTION public.feriados_en_rango(DATE, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fecha_habilita_clases(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.feriados_en_rango(DATE, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fecha_habilita_clases(DATE) TO authenticated, service_role;

-- Respaldo: feriados pasa a ser restaurable (misma funcion, un nombre mas en la lista).
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
    'mensajes', 'push_suscripciones', 'push_cola', 'habitos_registros', 'nutricion_registros', 'alertas_entrenador',
    'alumno_historial_dolor', 'alumno_cuestionario_inicial', 'feriados', 'planes_membresia', 'planes_membresia_precios',
    'contrataciones', 'alumno_actividades', 'cobros', 'pagos',
    'auditoria_cambios', 'sustituciones_ejercicios', 'clases_horario', 'clases_fijas', 'clases', 'clases_profesores', 'reservas', 'ranking_prs'
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
