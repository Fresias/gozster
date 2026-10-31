-- GOZS-317: versionado de rutinas de alumno. Si la versión anterior estaba ACTIVO, la nueva nace ACTIVO
-- y la anterior pasa a INACTIVO (fecha_fin = now()) en la misma transacción; si estaba en BORRADOR o
-- INACTIVO, la nueva hereda ese estado. registro_sesiones/registro_series no se tocan.
-- Basada en guardar_rutina de GOZS-315 (20261030001300): conserva su normalización de superseries.

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
  v_estado public.estado_plan;
  v_nuevo_id UUID;
  v_dia_id UUID;
  v_dia JSONB;
  v_ej JSONB;
  v_dia_n INTEGER := 0;
  v_ej_n INTEGER;
  v_ej_nombre TEXT;
  v_grupos_validos INTEGER[];
  v_es_ss BOOLEAN;
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
    -- plantilla: ACTIVO; plan de alumno nuevo: BORRADOR; versión nueva de un plan de alumno: hereda
    -- el estado de la anterior y, si estaba ACTIVO, la reemplaza (la anterior pasa a INACTIVO)
    v_estado := CASE
      WHEN v_alumno_id IS NULL THEN 'ACTIVO'
      WHEN v_plan_id IS NOT NULL THEN v_plan.estado
      ELSE 'BORRADOR'
    END;
    IF v_plan_id IS NOT NULL AND v_alumno_id IS NOT NULL AND v_plan.estado = 'ACTIVO' THEN
      -- serializa con asignar_rutina_a_alumno y respeta uq_planes_un_activo_por_alumno
      PERFORM 1 FROM public.perfiles WHERE id = v_alumno_id FOR UPDATE;
      UPDATE public.planes_entrenamiento
      SET estado = 'INACTIVO', fecha_fin = now()
      WHERE id = v_plan_id;
    END IF;
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
      v_estado,
      now()
    )
    RETURNING id INTO v_nuevo_id;
  END IF;

  FOR v_dia IN SELECT * FROM jsonb_array_elements(p_payload -> 'dias') LOOP
    v_dia_n := v_dia_n + 1;
    INSERT INTO public.dias_rutina (plan_id, nombre, orden)
    VALUES (v_nuevo_id, COALESCE(NULLIF(TRIM(v_dia ->> 'nombre'), ''), 'Día ' || v_dia_n), v_dia_n)
    RETURNING id INTO v_dia_id;

    -- grupos de superserie válidos del día: los que tienen >= 2 ejercicios
    BEGIN
      SELECT COALESCE(array_agg(g), '{}') INTO v_grupos_validos
      FROM (
        SELECT (x ->> 'grupo_superserie')::INTEGER AS g
        FROM jsonb_array_elements(COALESCE(v_dia -> 'ejercicios', '[]'::JSONB)) x
        WHERE COALESCE((x ->> 'es_superserie')::BOOLEAN, false)
        GROUP BY 1 HAVING count(*) >= 2
      ) q;
    EXCEPTION WHEN OTHERS THEN
      v_grupos_validos := '{}'; -- valores mal formados: el INSERT de abajo da el mensaje humano
    END;

    v_ej_n := 0;
    FOR v_ej IN SELECT * FROM jsonb_array_elements(COALESCE(v_dia -> 'ejercicios', '[]'::JSONB)) LOOP
      v_ej_n := v_ej_n + 1;
      v_ej_nombre := COALESCE(NULLIF(v_ej ->> 'nombre', ''), 'ejercicio ' || v_ej_n);
      BEGIN
        v_es_ss := COALESCE(
          COALESCE((v_ej ->> 'es_superserie')::BOOLEAN, false)
          AND (v_ej ->> 'grupo_superserie')::INTEGER = ANY (v_grupos_validos),
          false
        );
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
          v_es_ss,
          CASE WHEN v_es_ss THEN (v_ej ->> 'grupo_superserie')::INTEGER END,
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
