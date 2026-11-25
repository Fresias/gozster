-- GOZS-829 (B1): persistencia real de marcas de Funcional + RPCs de ranking y progreso.
-- Ranking relativo (marca / peso corporal) por categoria M/F con privacidad estricta:
-- solo "Nombre I.", categoria, marca, ratio, posicion y es_usuario_actual (ADR-003, enmienda 25/11).
-- Idempotente: IF NOT EXISTS, DROP ... IF EXISTS, CREATE OR REPLACE.

-- 1. Tabla
CREATE TABLE IF NOT EXISTS public.marcas_funcional (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  ejercicio_id UUID NOT NULL REFERENCES public.ejercicios(id) ON DELETE RESTRICT,
  clase_id UUID REFERENCES public.clases(id) ON DELETE RESTRICT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  peso_kg NUMERIC(6,2) NOT NULL CHECK (peso_kg >= 0),
  reps INT NOT NULL CHECK (reps > 0),
  registrado_por UUID NOT NULL DEFAULT auth.uid() REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_marcas_funcional_updated_at ON public.marcas_funcional;
CREATE TRIGGER trg_marcas_funcional_updated_at
  BEFORE UPDATE ON public.marcas_funcional
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_marcas_funcional_ejercicio_peso
  ON public.marcas_funcional (ejercicio_id, peso_kg DESC);
CREATE INDEX IF NOT EXISTS idx_marcas_funcional_alumno_ejercicio_fecha
  ON public.marcas_funcional (alumno_id, ejercicio_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_marcas_funcional_clase_id
  ON public.marcas_funcional (clase_id);
CREATE INDEX IF NOT EXISTS idx_marcas_funcional_registrado_por
  ON public.marcas_funcional (registrado_por);
CREATE INDEX IF NOT EXISTS idx_marcas_funcional_updated_at
  ON public.marcas_funcional (updated_at);

-- 2. RLS: el alumno lee lo suyo; solo staff (titular/apoyo o ADMIN) escribe.
ALTER TABLE public.marcas_funcional ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marcas_funcional FROM anon;

DROP POLICY IF EXISTS "marcas_funcional_select" ON public.marcas_funcional;
CREATE POLICY "marcas_funcional_select"
  ON public.marcas_funcional FOR SELECT TO authenticated
  USING (
    alumno_id = (SELECT auth.uid())
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "marcas_funcional_insert_staff" ON public.marcas_funcional;
CREATE POLICY "marcas_funcional_insert_staff"
  ON public.marcas_funcional FOR INSERT TO authenticated
  WITH CHECK (
    registrado_por = (SELECT auth.uid())
    AND (public.es_entrenador_de(alumno_id) OR public.es_admin())
  );

DROP POLICY IF EXISTS "marcas_funcional_update_staff" ON public.marcas_funcional;
CREATE POLICY "marcas_funcional_update_staff"
  ON public.marcas_funcional FOR UPDATE TO authenticated
  USING (public.es_entrenador_de(alumno_id) OR public.es_admin())
  WITH CHECK (public.es_entrenador_de(alumno_id) OR public.es_admin());

DROP POLICY IF EXISTS "marcas_funcional_delete_staff" ON public.marcas_funcional;
CREATE POLICY "marcas_funcional_delete_staff"
  ON public.marcas_funcional FOR DELETE TO authenticated
  USING (public.es_entrenador_de(alumno_id) OR public.es_admin());

-- 3. Helper puro: "Lucas Giménez" -> "Lucas G."; sin apellido -> "Lucas".
CREATE OR REPLACE FUNCTION public.formatear_nombre_corto(p_nombre TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN n.partes IS NULL OR cardinality(n.partes) = 0 THEN ''
    WHEN cardinality(n.partes) = 1 THEN n.partes[1]
    ELSE n.partes[1] || ' ' || upper(left(n.partes[cardinality(n.partes)], 1)) || '.'
  END
  FROM (
    SELECT string_to_array(NULLIF(btrim(regexp_replace(coalesce(p_nombre, ''), '\s+', ' ', 'g')), ''), ' ') AS partes
  ) n;
$$;

REVOKE ALL ON FUNCTION public.formatear_nombre_corto(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.formatear_nombre_corto(TEXT) TO authenticated, service_role;

-- 4. Ranking Funcional (SECURITY DEFINER: lee marcas/perfiles de terceros, devuelve solo campos seguros).
DROP FUNCTION IF EXISTS public.obtener_ranking_funcional(UUID, UUID);
CREATE FUNCTION public.obtener_ranking_funcional(p_ejercicio_id UUID, p_clase_id UUID DEFAULT NULL)
RETURNS TABLE (
  posicion BIGINT,
  nombre_corto TEXT,
  categoria TEXT,
  peso_kg NUMERIC(6,2),
  reps INT,
  ratio NUMERIC(6,2),
  fecha DATE,
  es_usuario_actual BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticacion requerida' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.es_entrenador_o_admin()
    OR EXISTS (
      SELECT 1 FROM public.alumno_actividades aa
      WHERE aa.alumno_id = v_uid AND aa.actividad = 'FUNCIONAL'
    )
    OR EXISTS (SELECT 1 FROM public.marcas_funcional mf WHERE mf.alumno_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Sin acceso al ranking Funcional' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH mejores AS (
    SELECT DISTINCT ON (mf.alumno_id)
      mf.alumno_id, mf.peso_kg, mf.reps, mf.fecha
    FROM public.marcas_funcional mf
    WHERE mf.ejercicio_id = p_ejercicio_id
      AND (p_clase_id IS NULL OR mf.clase_id = p_clase_id)
    ORDER BY mf.alumno_id, mf.peso_kg DESC, mf.reps DESC, mf.fecha ASC
  ),
  base AS (
    SELECT
      m.alumno_id,
      public.formatear_nombre_corto(p.nombre_completo) AS nombre_corto,
      p.sexo AS categoria,
      m.peso_kg,
      m.reps,
      ROUND(m.peso_kg / p.peso_corporal_kg, 2)::NUMERIC(6,2) AS ratio,
      m.fecha
    FROM mejores m
    JOIN public.perfiles p ON p.id = m.alumno_id
    WHERE p.peso_corporal_kg > 0 AND p.sexo IN ('M', 'F')
  )
  SELECT
    RANK() OVER (PARTITION BY b.categoria ORDER BY b.ratio DESC, b.peso_kg DESC, b.reps DESC, b.fecha ASC) AS posicion,
    b.nombre_corto,
    b.categoria,
    b.peso_kg,
    b.reps,
    b.ratio,
    b.fecha,
    (b.alumno_id = v_uid) AS es_usuario_actual
  FROM base b
  ORDER BY b.categoria, 1, b.nombre_corto;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_ranking_funcional(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_ranking_funcional(UUID, UUID) TO authenticated, service_role;

-- 5. Progreso propio (SECURITY INVOKER: RLS + filtro explicito por auth.uid()).
DROP FUNCTION IF EXISTS public.obtener_progreso_funcional_alumno(UUID);
CREATE FUNCTION public.obtener_progreso_funcional_alumno(p_ejercicio_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  ejercicio_id UUID,
  ejercicio_nombre TEXT,
  clase_id UUID,
  fecha DATE,
  peso_kg NUMERIC(6,2),
  reps INT,
  mejor_marca_historica NUMERIC(6,2)
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT
    mf.id,
    mf.ejercicio_id,
    e.nombre,
    mf.clase_id,
    mf.fecha,
    mf.peso_kg,
    mf.reps,
    MAX(mf.peso_kg) OVER (PARTITION BY mf.ejercicio_id)::NUMERIC(6,2)
  FROM public.marcas_funcional mf
  JOIN public.ejercicios e ON e.id = mf.ejercicio_id
  WHERE mf.alumno_id = (SELECT auth.uid())
    AND (p_ejercicio_id IS NULL OR mf.ejercicio_id = p_ejercicio_id)
  ORDER BY mf.fecha ASC, mf.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.obtener_progreso_funcional_alumno(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_progreso_funcional_alumno(UUID) TO authenticated, service_role;

-- 6. Respaldo: marcas_funcional se suma a la lista restaurable.
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
    'perfiles', 'ejercicios', 'planes_entrenamiento', 'dias_rutina',
    'ejercicios_en_rutina', 'registro_sesiones', 'registro_series', 'conversaciones',
    'mensajes', 'push_suscripciones', 'push_cola', 'alertas_entrenador',
    'alumno_historial_dolor', 'alumno_cuestionario_inicial', 'feriados', 'planes_membresia', 'planes_membresia_precios',
    'contrataciones', 'alumno_actividades', 'cobros', 'pagos',
    'auditoria_cambios', 'sustituciones_ejercicios', 'clases_horario', 'clases_fijas', 'clases', 'clases_profesores', 'reservas', 'feedback_clase', 'logros_racha', 'planes_compartidos', 'marcas_funcional'
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
