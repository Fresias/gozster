-- GOZS-291: RPCs transaccionales para guardar y asignar rutinas.
-- Depende de GOZS-290 (planes_entrenamiento.tipo / plan_origen_id y clonar_plan_entrenamiento
-- copiando toda la prescripción). Todo ocurre dentro de la transacción de la llamada: si
-- cualquier ejercicio falla, no queda ningún día ni ejercicio parcial.
-- Errores de negocio: ERRCODE 'GZ010' con mensaje corto en español (nunca el error crudo de PG).

-- ============================================================================
-- 1. guardar_rutina(p_payload jsonb) -> plan_id
-- payload: {
--   plan_id?, como_nueva?, nombre, comentarios?, alumno_id?, etiqueta?,
--   dias: [{ nombre, ejercicios: [{ ejercicio_id, nombre?, series, repeticiones,
--            descanso_segundos?, rpe_objetivo?, notas?, es_superserie?, grupo_superserie?,
--            tempo?, tempo_activo?, tipo_serie?, force_rpe_required? }] }]
-- }
-- - Sin plan_id (o como_nueva = true): crea un plan nuevo (con plan_origen_id = plan_id).
-- - Con plan_id y sin sesiones: actualiza en el lugar (reemplaza días y ejercicios).
-- - Con plan_id y con sesiones: rechaza; nunca se borran días con sesiones.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.guardar_rutina(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID := NULLIF(p_payload #>> '{plan_id}', '')::UUID;
  v_como_nueva BOOLEAN := COALESCE((p_payload #>> '{como_nueva}')::BOOLEAN, false);
  v_alumno_id UUID := NULLIF(p_payload #>> '{alumno_id}', '')::UUID;
  v_nombre TEXT := NULLIF(TRIM(p_payload #>> '{nombre}'), '');
  v_plan public.planes_entrenamiento%ROWTYPE;
  v_nuevo_id UUID;
  v_dia_id UUID;
  v_dia JSONB;
  v_ej JSONB;
  v_dia_n INTEGER := 0;
  v_ej_n INTEGER;
  v_ej_nombre TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.es_entrenador_o_admin() THEN
    RAISE EXCEPTION 'No tienes permiso para guardar rutinas' USING ERRCODE = 'GZ010';
  END IF;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'La rutina necesita un nombre' USING ERRCODE = 'GZ010';
  END IF;
  IF jsonb_typeof(p_payload -> 'dias') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload -> 'dias') = 0 THEN
    RAISE EXCEPTION 'La rutina necesita al menos un día' USING ERRCODE = 'GZ010';
  END IF;

  IF v_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.planes_entrenamiento WHERE id = v_plan_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La rutina que intentas guardar ya no existe' USING ERRCODE = 'GZ010';
    END IF;
    IF NOT (
      public.es_admin()
      OR v_plan.profesor_id = auth.uid()
      OR (v_plan.alumno_id IS NOT NULL AND public.es_entrenador_de(v_plan.alumno_id))
    ) THEN
      RAISE EXCEPTION 'No tienes permiso para modificar esta rutina' USING ERRCODE = 'GZ010';
    END IF;
    v_alumno_id := v_plan.alumno_id;
  ELSIF v_alumno_id IS NOT NULL
        AND NOT (public.es_admin() OR public.es_entrenador_de(v_alumno_id)) THEN
    RAISE EXCEPTION 'Ese alumno no está asignado a tu cuenta' USING ERRCODE = 'GZ010';
  END IF;

  IF v_plan_id IS NOT NULL AND NOT v_como_nueva THEN
    IF EXISTS (
      SELECT 1
      FROM public.registro_sesiones s
      JOIN public.dias_rutina d ON d.id = s.dia_id
      WHERE d.plan_id = v_plan_id
    ) THEN
      RAISE EXCEPTION 'Esta rutina ya tiene sesiones registradas y no se puede modificar: guárdala como nueva versión'
        USING ERRCODE = 'GZ010';
    END IF;

    UPDATE public.planes_entrenamiento
    SET nombre = v_nombre,
        comentarios = p_payload #>> '{comentarios}',
        etiqueta = p_payload #>> '{etiqueta}'
    WHERE id = v_plan_id;
    DELETE FROM public.dias_rutina WHERE plan_id = v_plan_id;
    v_nuevo_id := v_plan_id;
  ELSE
    INSERT INTO public.planes_entrenamiento (
      profesor_id, alumno_id, nombre, comentarios, etiqueta, tipo, plan_origen_id, estado, fecha_inicio
    )
    VALUES (
      auth.uid(),
      v_alumno_id,
      v_nombre,
      p_payload #>> '{comentarios}',
      p_payload #>> '{etiqueta}',
      CASE WHEN v_alumno_id IS NULL THEN 'PLANTILLA' ELSE 'DE_ALUMNO' END,
      v_plan_id,
      -- una versión nueva de un plan de alumno no desplaza al ACTIVO hasta asignarla
      CASE WHEN v_alumno_id IS NULL THEN 'ACTIVO' ELSE 'BORRADOR' END::public.estado_plan,
      now()
    )
    RETURNING id INTO v_nuevo_id;
  END IF;

  FOR v_dia IN SELECT * FROM jsonb_array_elements(p_payload -> 'dias') LOOP
    v_dia_n := v_dia_n + 1;
    INSERT INTO public.dias_rutina (plan_id, nombre, orden)
    VALUES (v_nuevo_id, COALESCE(NULLIF(TRIM(v_dia ->> 'nombre'), ''), 'Día ' || v_dia_n), v_dia_n)
    RETURNING id INTO v_dia_id;

    v_ej_n := 0;
    FOR v_ej IN SELECT * FROM jsonb_array_elements(COALESCE(v_dia -> 'ejercicios', '[]'::JSONB)) LOOP
      v_ej_n := v_ej_n + 1;
      v_ej_nombre := COALESCE(NULLIF(v_ej ->> 'nombre', ''), 'ejercicio ' || v_ej_n);
      BEGIN
        -- el cast a UUID va dentro del bloque: un id mal formado también da mensaje humano
        v_ej_nombre := COALESCE(
          NULLIF(v_ej ->> 'nombre', ''),
          (SELECT e.nombre FROM public.ejercicios e WHERE e.id = (v_ej ->> 'ejercicio_id')::UUID),
          v_ej_nombre
        );
        INSERT INTO public.ejercicios_en_rutina (
          dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo,
          notas, es_superserie, grupo_superserie, tempo, tempo_activo, tipo_serie, force_rpe_required
        )
        VALUES (
          v_dia_id,
          (v_ej ->> 'ejercicio_id')::UUID,
          v_ej_n,
          (v_ej ->> 'series')::INTEGER,
          v_ej ->> 'repeticiones',
          COALESCE((v_ej ->> 'descanso_segundos')::INTEGER, 90),
          (v_ej ->> 'rpe_objetivo')::NUMERIC,
          v_ej ->> 'notas',
          COALESCE((v_ej ->> 'es_superserie')::BOOLEAN, false),
          (v_ej ->> 'grupo_superserie')::INTEGER,
          COALESCE(v_ej ->> 'tempo', '3-0-1-0'),
          COALESCE((v_ej ->> 'tempo_activo')::BOOLEAN, false),
          COALESCE(v_ej ->> 'tipo_serie', 'NORMAL'),
          COALESCE((v_ej ->> 'force_rpe_required')::BOOLEAN, false)
        );
      EXCEPTION
        WHEN foreign_key_violation THEN
          RAISE EXCEPTION 'No se pudo guardar ''%'' (día %): el ejercicio ya no existe en el catálogo',
            v_ej_nombre, v_dia_n USING ERRCODE = 'GZ010';
        WHEN OTHERS THEN
          RAISE EXCEPTION 'No se pudo guardar ''%'' (día %): revisa series, repeticiones y demás valores',
            v_ej_nombre, v_dia_n USING ERRCODE = 'GZ010';
      END;
    END LOOP;
  END LOOP;

  RETURN v_nuevo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_rutina(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_rutina(JSONB) TO authenticated;

-- ============================================================================
-- 2. asignar_rutina_a_alumno(p_plan_id, p_alumno_id) -> plan_id nuevo
-- Clona la rutina al alumno (clonar_plan_entrenamiento copia toda la prescripción y deja
-- plan_origen_id), deja la ACTIVA anterior en INACTIVO con fecha_fin = fecha_inicio de la nueva.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.asignar_rutina_a_alumno(p_plan_id UUID, p_alumno_id UUID)
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

  v_nuevo_id := public.clonar_plan_entrenamiento(p_plan_id, v_origen.nombre);

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

REVOKE ALL ON FUNCTION public.asignar_rutina_a_alumno(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_rutina_a_alumno(UUID, UUID) TO authenticated;

-- ============================================================================
-- 3. Un solo plan ACTIVO por alumno.
-- Solo se crea si la limpieza de duplicados ya se aplicó; si no, avisa y no falla la migración.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.planes_entrenamiento
    WHERE alumno_id IS NOT NULL AND estado = 'ACTIVO'
    GROUP BY alumno_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'GOZS-291: hay alumnos con más de un plan ACTIVO; limpiar duplicados y crear uq_planes_un_activo_por_alumno';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_planes_un_activo_por_alumno
      ON public.planes_entrenamiento (alumno_id)
      WHERE estado = 'ACTIVO';
  END IF;
END;
$$;
