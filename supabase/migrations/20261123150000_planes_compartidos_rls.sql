-- GOZS-759: plantillas privadas por entrenador + compartidas con entrenadores puntuales.
-- Antes: cualquier ENTRENADOR veía todas las plantillas (alumno_id IS NULL).
-- Ahora: una plantilla solo la ve su autor (profesor_id), ADMIN o un entrenador
-- con fila en planes_compartidos (solo lectura: clonar / asignar a alumno propio).
-- Editar, borrar y compartir/revocar sigue reservado al autor o ADMIN.
-- Idempotente.

BEGIN;

-- 1. Tabla de plantillas compartidas.
-- `id` existe solo para el respaldo (scripts/backup-restore-gozs.mjs indexa por id);
-- la identidad lógica es la PK (plan_id, profesor_id).
CREATE TABLE IF NOT EXISTS public.planes_compartidos (
  plan_id uuid NOT NULL REFERENCES public.planes_entrenamiento(id) ON DELETE CASCADE,
  profesor_id uuid NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  compartido_por uuid NOT NULL REFERENCES public.perfiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  PRIMARY KEY (plan_id, profesor_id),
  CONSTRAINT planes_compartidos_no_consigo_mismo CHECK (profesor_id <> compartido_por)
);

CREATE INDEX IF NOT EXISTS idx_planes_compartidos_profesor_id ON public.planes_compartidos (profesor_id);
CREATE INDEX IF NOT EXISTS idx_planes_compartidos_compartido_por ON public.planes_compartidos (compartido_por);

ALTER TABLE public.planes_compartidos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planes_compartidos FROM anon;
REVOKE UPDATE ON public.planes_compartidos FROM authenticated;

-- 2. Helper sin RLS (evita recursión planes_entrenamiento <-> planes_compartidos).
CREATE OR REPLACE FUNCTION public.plan_compartido_conmigo(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.es_entrenador_o_admin() AND EXISTS (
    SELECT 1 FROM public.planes_compartidos pc
    WHERE pc.plan_id = p_plan_id AND pc.profesor_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.plan_compartido_conmigo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_compartido_conmigo(uuid) TO authenticated, service_role;

-- 3. Políticas de planes_compartidos: el destinatario ve sus filas; el autor
-- de la plantilla (o ADMIN) ve, crea y revoca. Sin UPDATE.
DROP POLICY IF EXISTS "planes_compartidos_select" ON public.planes_compartidos;
CREATE POLICY "planes_compartidos_select" ON public.planes_compartidos
  FOR SELECT TO authenticated
  USING (
    profesor_id = (SELECT auth.uid())
    OR es_admin()
    OR EXISTS (
      SELECT 1 FROM public.planes_entrenamiento p
      WHERE p.id = planes_compartidos.plan_id AND p.profesor_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "planes_compartidos_insert_autor" ON public.planes_compartidos;
CREATE POLICY "planes_compartidos_insert_autor" ON public.planes_compartidos
  FOR INSERT TO authenticated
  WITH CHECK (
    compartido_por = (SELECT auth.uid())
    AND es_entrenador_o_admin()
    AND EXISTS (
      SELECT 1 FROM public.planes_entrenamiento p
      WHERE p.id = planes_compartidos.plan_id
        AND p.alumno_id IS NULL
        AND (p.profesor_id = (SELECT auth.uid()) OR es_admin())
    )
  );

DROP POLICY IF EXISTS "planes_compartidos_delete_autor" ON public.planes_compartidos;
CREATE POLICY "planes_compartidos_delete_autor" ON public.planes_compartidos
  FOR DELETE TO authenticated
  USING (
    es_admin()
    OR EXISTS (
      SELECT 1 FROM public.planes_entrenamiento p
      WHERE p.id = planes_compartidos.plan_id AND p.profesor_id = (SELECT auth.uid())
    )
  );

-- 4. Lectura de plantillas: se reemplaza "(alumno_id IS NULL) AND es_entrenador_o_admin()"
-- por "(alumno_id IS NULL) AND plan_compartido_conmigo(id)". Resto idéntico.
ALTER POLICY "planes_select_alumno_o_entrenador" ON public.planes_entrenamiento
  USING (((alumno_id = (SELECT auth.uid())) OR (profesor_id = (SELECT auth.uid())) OR ((alumno_id IS NULL) AND plan_compartido_conmigo(id)) OR ((alumno_id IS NOT NULL) AND es_entrenador_de(alumno_id)) OR es_admin()));

ALTER POLICY "dias_rutina_select_acceso_plan" ON public.dias_rutina
  USING ((EXISTS ( SELECT 1
   FROM planes_entrenamiento p
  WHERE ((p.id = dias_rutina.plan_id) AND ((p.alumno_id = (SELECT auth.uid())) OR (p.profesor_id = (SELECT auth.uid())) OR ((p.alumno_id IS NULL) AND plan_compartido_conmigo(p.id)) OR ((p.alumno_id IS NOT NULL) AND es_entrenador_de(p.alumno_id)) OR es_admin())))));

ALTER POLICY "ejercicios_en_rutina_select_acceso_plan" ON public.ejercicios_en_rutina
  USING ((EXISTS ( SELECT 1
   FROM (dias_rutina d
     JOIN planes_entrenamiento p ON ((p.id = d.plan_id)))
  WHERE ((d.id = ejercicios_en_rutina.dia_id) AND (((p.alumno_id = (SELECT auth.uid())) AND (NOT (EXISTS ( SELECT 1
           FROM perfiles perf
          WHERE ((perf.id = (SELECT auth.uid())) AND (perf.estado_membresia = 'VENCIDA'::estado_membresia)))))) OR (p.profesor_id = (SELECT auth.uid())) OR ((p.alumno_id IS NULL) AND plan_compartido_conmigo(p.id)) OR ((p.alumno_id IS NOT NULL) AND es_entrenador_de(p.alumno_id)) OR es_admin())))));

-- 5. RPCs SECURITY DEFINER: misma regla para clonar y asignar plantillas ajenas.
CREATE OR REPLACE FUNCTION public.clonar_plan_entrenamiento(p_plan_id uuid, p_nuevo_nombre text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_origen public.planes_entrenamiento%ROWTYPE;
  v_nuevo_plan_id UUID;
  v_nuevo_dia_id UUID;
  v_nombre_final TEXT;
  r_dia RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_plan_origen
  FROM public.planes_entrenamiento
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan de entrenamiento no encontrado con ID: %', p_plan_id;
  END IF;

  IF NOT (
    public.es_admin()
    OR COALESCE(v_plan_origen.profesor_id = auth.uid(), false)
    OR (v_plan_origen.alumno_id IS NOT NULL AND public.es_entrenador_de(v_plan_origen.alumno_id))
    OR (v_plan_origen.alumno_id IS NULL AND public.plan_compartido_conmigo(v_plan_origen.id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para clonar este plan de entrenamiento';
  END IF;

  v_nombre_final := COALESCE(NULLIF(TRIM(p_nuevo_nombre), ''), v_plan_origen.nombre || ' (Copia)');

  INSERT INTO public.planes_entrenamiento (
    profesor_id,
    alumno_id,
    nombre,
    estado,
    comentarios,
    fecha_inicio,
    fecha_fin,
    tipo,
    etiqueta,
    tags,
    plan_origen_id
  )
  VALUES (
    COALESCE(auth.uid(), v_plan_origen.profesor_id),
    v_plan_origen.alumno_id,
    v_nombre_final,
    'BORRADOR',
    v_plan_origen.comentarios,
    now(),
    NULL,
    v_plan_origen.tipo,
    v_plan_origen.etiqueta,
    COALESCE(v_plan_origen.tags, '{}'),
    v_plan_origen.id
  )
  RETURNING id INTO v_nuevo_plan_id;

  FOR r_dia IN
    SELECT id, nombre, orden
    FROM public.dias_rutina
    WHERE plan_id = p_plan_id
    ORDER BY orden ASC
  LOOP
    INSERT INTO public.dias_rutina (plan_id, nombre, orden)
    VALUES (v_nuevo_plan_id, r_dia.nombre, r_dia.orden)
    RETURNING id INTO v_nuevo_dia_id;

    INSERT INTO public.ejercicios_en_rutina (
      dia_id,
      ejercicio_id,
      orden,
      series,
      repeticiones,
      descanso_segundos,
      rpe_objetivo,
      notas,
      es_superserie,
      grupo_superserie,
      tempo,
      tempo_activo,
      tipo_serie,
      force_rpe_required,
      tipo_medicion,
      tiempo_objetivo_segundos,
      es_unilateral
    )
    SELECT
      v_nuevo_dia_id,
      e.ejercicio_id,
      e.orden,
      e.series,
      e.repeticiones,
      e.descanso_segundos,
      e.rpe_objetivo,
      e.notas,
      e.es_superserie,
      e.grupo_superserie,
      e.tempo,
      e.tempo_activo,
      e.tipo_serie,
      e.force_rpe_required,
      e.tipo_medicion,
      e.tiempo_objetivo_segundos,
      e.es_unilateral
    FROM public.ejercicios_en_rutina e
    WHERE e.dia_id = r_dia.id
    ORDER BY e.orden ASC;
  END LOOP;

  RETURN v_nuevo_plan_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.asignar_rutina_a_alumno(p_plan_id uuid, p_alumno_id uuid, p_nombre text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    OR COALESCE(v_origen.profesor_id = auth.uid(), false)
    OR (v_origen.alumno_id IS NULL AND public.plan_compartido_conmigo(v_origen.id))
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
$function$;

-- 6. Respaldo: planes_compartidos se suma a la lista restaurable.
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

REVOKE EXECUTE ON FUNCTION public.restaurar_filas_respaldo(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_filas_respaldo(TEXT, JSONB) TO service_role;

COMMIT;
