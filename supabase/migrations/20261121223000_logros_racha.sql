-- ============================================================================
-- GOZSter: Persistencia del logro Diamante permanente (`logros_racha`)
-- Archivo: supabase/migrations/20261121223000_logros_racha.sql
-- Multica Issue: GOZS-679 (Épica GOZS-678 · GitHub #587)
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLA: public.logros_racha
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.logros_racha (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.perfiles(id) ON DELETE CASCADE,
  numero_ciclo INTEGER NOT NULL CHECK (numero_ciclo >= 1),
  tipo TEXT NOT NULL DEFAULT 'diamante' CHECK (tipo IN ('diamante')),
  fecha_logro TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_logros_racha_alumno_ciclo_tipo UNIQUE (alumno_id, numero_ciclo, tipo)
);

CREATE INDEX IF NOT EXISTS idx_logros_racha_updated_at
  ON public.logros_racha (updated_at);

DROP TRIGGER IF EXISTS trg_logros_racha_updated_at ON public.logros_racha;
CREATE TRIGGER trg_logros_racha_updated_at
  BEFORE UPDATE ON public.logros_racha
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 2. ROW LEVEL SECURITY: public.logros_racha
--    - Alumno: lee e inserta únicamente sus propios logros. Sin UPDATE/DELETE.
--    - Coach: lee únicamente los logros de sus alumnos asignados.
--    - Admin: lectura global.
--    - Anon: sin acceso.
-- ============================================================================

ALTER TABLE public.logros_racha ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "logros_racha_select_alumno_o_entrenador" ON public.logros_racha;
CREATE POLICY "logros_racha_select_alumno_o_entrenador"
  ON public.logros_racha
  FOR SELECT
  TO authenticated
  USING (
    alumno_id = (SELECT auth.uid())
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "logros_racha_insert_propio_alumno" ON public.logros_racha;
CREATE POLICY "logros_racha_insert_propio_alumno"
  ON public.logros_racha
  FOR INSERT
  TO authenticated
  WITH CHECK (
    alumno_id = (SELECT auth.uid())
  );

REVOKE ALL ON public.logros_racha FROM PUBLIC, anon;
REVOKE UPDATE, DELETE ON public.logros_racha FROM authenticated;
GRANT SELECT, INSERT ON public.logros_racha TO authenticated;
GRANT ALL ON public.logros_racha TO service_role;

-- ============================================================================
-- 3. RPC IDEMPOTENTE: public.registrar_logro_racha(numero_ciclo, tipo)
--    SECURITY INVOKER: respeta estrictamente las políticas RLS del llamador.
--    Pensada para reintentos seguros desde la cola offline sin duplicar filas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_logro_racha(
  numero_ciclo INTEGER,
  tipo TEXT DEFAULT 'diamante'
)
RETURNS public.logros_racha
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_alumno_id UUID := auth.uid();
  v_numero_ciclo INTEGER := registrar_logro_racha.numero_ciclo;
  v_tipo TEXT := COALESCE(registrar_logro_racha.tipo, 'diamante');
  v_logro public.logros_racha;
BEGIN
  IF v_alumno_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  IF v_numero_ciclo IS NULL OR v_numero_ciclo < 1 THEN
    RAISE EXCEPTION 'numero_ciclo debe ser >= 1' USING ERRCODE = '23514';
  END IF;

  IF v_tipo <> 'diamante' THEN
    RAISE EXCEPTION 'tipo de logro inválido: %', v_tipo USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.logros_racha (alumno_id, numero_ciclo, tipo)
  VALUES (v_alumno_id, v_numero_ciclo, v_tipo)
  ON CONFLICT (alumno_id, numero_ciclo, tipo) DO NOTHING;

  SELECT *
  INTO v_logro
  FROM public.logros_racha l
  WHERE l.alumno_id = v_alumno_id
    AND l.numero_ciclo = v_numero_ciclo
    AND l.tipo = v_tipo;

  RETURN v_logro;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_logro_racha(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_logro_racha(INTEGER, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 4. RESPALDO: public.logros_racha pasa a ser restaurable
-- ============================================================================

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
    'auditoria_cambios', 'sustituciones_ejercicios', 'clases_horario', 'clases_fijas', 'clases', 'clases_profesores', 'reservas', 'feedback_clase', 'ranking_prs', 'logros_racha'
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
