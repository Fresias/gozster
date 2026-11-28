-- GOZS-922: endurecimiento de catálogo (append-only, idempotente).
-- 1) restaurar_filas_respaldo: whitelist en paridad con TABLAS de scripts/backup-restore-gozs.mjs.
-- 2) Funciones trigger de public: sin EXECUTE para PUBLIC/anon/authenticated (los triggers siguen disparando).
-- 3) push_cola: sin privilegios de tabla para anon/authenticated (solo service_role; RLS sigue activo).

BEGIN;

CREATE OR REPLACE FUNCTION public.restaurar_filas_respaldo(p_tabla TEXT, p_filas JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_insertadas INT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Solo service_role puede restaurar respaldos'
      USING ERRCODE = '42501';
  END IF;

  IF p_tabla NOT IN (
    'perfiles', 'ejercicios', 'planes_entrenamiento', 'dias_rutina',
    'ejercicios_en_rutina', 'registro_sesiones', 'registro_series', 'conversaciones',
    'mensajes', 'push_suscripciones', 'push_cola', 'alertas_entrenador',
    'alumno_historial_dolor', 'alumno_cuestionario_inicial', 'feriados', 'errores_app',
    'planes_membresia', 'planes_membresia_precios',
    'contrataciones', 'alumno_actividades', 'cobros', 'pagos',
    'auditoria_cambios', 'sustituciones_ejercicios', 'clases_horario', 'clases_fijas', 'clases', 'clases_profesores', 'reservas', 'feedback_clase', 'logros_racha', 'planes_compartidos'
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

REVOKE ALL ON FUNCTION public.restaurar_filas_respaldo(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_filas_respaldo(TEXT, JSONB) TO service_role;

-- Funciones trigger (RETURNS trigger) de public, incluidas las futuras de esta lista al re-ejecutar.
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS firma
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prorettype = 'trigger'::regtype
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.firma);
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.push_cola FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.push_cola TO service_role;

COMMIT;
