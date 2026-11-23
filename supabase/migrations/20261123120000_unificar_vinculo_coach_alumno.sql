-- GOZS-718 (PL-6): el vínculo coach↔alumno vive en un solo lugar,
-- perfiles.profesor_asignado_id. Se migran los vínculos de la tabla N:M,
-- se reescriben las funciones que la leían y se elimina la tabla.
-- planes_entrenamiento.profesor_id sigue indicando quién armó el plan,
-- pero deja de dar acceso al alumno.

-- 1. Backfill: alumnos sin profesor asignado toman el vínculo principal
--    de la tabla N:M y, si no hay, el profesor de su plan más reciente.
DO $$
BEGIN
  IF to_regclass('public.entrenador_alumnos') IS NOT NULL THEN
    UPDATE public.perfiles p
    SET profesor_asignado_id = v.entrenador_id
    FROM (
      SELECT DISTINCT ON (ea.alumno_id) ea.alumno_id, ea.entrenador_id
      FROM public.entrenador_alumnos ea
      JOIN public.perfiles c ON c.id = ea.entrenador_id AND c.rol IN ('ENTRENADOR', 'ADMIN')
      WHERE ea.entrenador_id <> ea.alumno_id
      ORDER BY ea.alumno_id, ea.es_principal DESC, ea.created_at
    ) v
    WHERE p.id = v.alumno_id
      AND p.rol = 'ALUMNO'
      AND p.profesor_asignado_id IS NULL;
  END IF;
END;
$$;

UPDATE public.perfiles p
SET profesor_asignado_id = v.profesor_id
FROM (
  SELECT DISTINCT ON (pe.alumno_id) pe.alumno_id, pe.profesor_id
  FROM public.planes_entrenamiento pe
  JOIN public.perfiles c ON c.id = pe.profesor_id AND c.rol IN ('ENTRENADOR', 'ADMIN')
  WHERE pe.alumno_id IS NOT NULL AND pe.profesor_id <> pe.alumno_id
  ORDER BY pe.alumno_id, pe.created_at DESC
) v
WHERE p.id = v.alumno_id
  AND p.rol = 'ALUMNO'
  AND p.profesor_asignado_id IS NULL;

-- 2. Fuente única de acceso para las políticas RLS (misma firma: las
--    políticas que la usan no cambian).
CREATE OR REPLACE FUNCTION public.es_entrenador_de(p_alumno_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles
    WHERE id = p_alumno_id
      AND profesor_asignado_id = (SELECT auth.uid())
  );
$$;

-- 3. Métricas de retención por profesor asignado.
CREATE OR REPLACE FUNCTION public.obtener_metricas_retencion(p_profesor_id UUID DEFAULT NULL)
RETURNS TABLE (
  "cantActivas" BIGINT,
  "cantSinPlanEntrenamiento" BIGINT,
  "cantClientesPerdidosMes" BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE p.rol = 'ALUMNO'
        AND p.estado_membresia = 'ACTIVA'
    ) AS "cantActivas",
    COUNT(*) FILTER (
      WHERE p.rol = 'ALUMNO'
        AND p.estado_membresia = 'ACTIVA'
        AND NOT EXISTS (
          SELECT 1
          FROM public.planes_entrenamiento pe
          WHERE pe.alumno_id = p.id
            AND pe.estado = 'ACTIVO'
        )
    ) AS "cantSinPlanEntrenamiento",
    COUNT(*) FILTER (
      WHERE p.rol = 'ALUMNO'
        AND p.estado_membresia IN ('INACTIVA', 'BAJA')
        AND p.fecha_baja >= date_trunc('month', now())
    ) AS "cantClientesPerdidosMes"
  FROM public.perfiles p
  WHERE (
    p_profesor_id IS NULL
    OR p.profesor_asignado_id = p_profesor_id
  )
  AND (
    public.es_admin()
    OR p_profesor_id = auth.uid()
    OR public.es_entrenador_o_admin()
  );
$$;

-- 4. Push de chat: alumno -> responsable de la conversación y profesor asignado.
CREATE OR REPLACE FUNCTION public.encolar_push_mensaje()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno_id UUID;
  v_responsable_id UUID;
BEGIN
  SELECT alumno_id, responsable_id INTO v_alumno_id, v_responsable_id
  FROM public.conversaciones
  WHERE id = NEW.conversacion_id;

  IF NEW.remitente_id = v_alumno_id THEN
    INSERT INTO public.push_cola (destinatario_id, mensaje_id)
    SELECT DISTINCT d, NEW.id
    FROM (
      SELECT v_responsable_id AS d
      UNION ALL
      SELECT p.profesor_asignado_id FROM public.perfiles p WHERE p.id = v_alumno_id
    ) t
    WHERE d IS NOT NULL AND d <> NEW.remitente_id;
  ELSE
    INSERT INTO public.push_cola (destinatario_id, mensaje_id)
    VALUES (v_alumno_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- 5. Transferir la conversación a un ENTRENADOR también lo deja como profesor
--    asignado del alumno (antes sumaba un vínculo N:M). Un ADMIN no necesita
--    vínculo: ya ve a todos los alumnos.
CREATE OR REPLACE FUNCTION public.transferir_conversacion_gozs(
  p_conversacion_id UUID,
  p_nuevo_responsable_id UUID,
  p_motivo TEXT DEFAULT NULL
)
RETURNS public.conversaciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversacion public.conversaciones%ROWTYPE;
  v_nuevo_rol public.rol_usuario;
  v_anterior_responsable_id UUID;
BEGIN
  SELECT * INTO v_conversacion
  FROM public.conversaciones
  WHERE id = p_conversacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversación no encontrada con ID: %', p_conversacion_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(v_conversacion.alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para transferir la conversación de este alumno'
      USING ERRCODE = '42501';
  END IF;

  SELECT rol INTO v_nuevo_rol
  FROM public.perfiles
  WHERE id = p_nuevo_responsable_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nuevo responsable no encontrado con ID: %', p_nuevo_responsable_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_nuevo_rol NOT IN ('ENTRENADOR', 'ADMIN') THEN
    RAISE EXCEPTION 'El nuevo responsable debe tener rol ENTRENADOR o ADMIN'
      USING ERRCODE = '22023';
  END IF;

  IF p_nuevo_responsable_id = v_conversacion.alumno_id THEN
    RAISE EXCEPTION 'El nuevo responsable no puede ser el alumno de la conversación'
      USING ERRCODE = '22023';
  END IF;

  v_anterior_responsable_id := v_conversacion.responsable_id;

  UPDATE public.conversaciones
  SET responsable_id = p_nuevo_responsable_id,
      updated_at = now()
  WHERE id = p_conversacion_id
  RETURNING * INTO v_conversacion;

  IF v_nuevo_rol = 'ENTRENADOR' THEN
    UPDATE public.perfiles
    SET profesor_asignado_id = p_nuevo_responsable_id
    WHERE id = v_conversacion.alumno_id
      AND profesor_asignado_id IS DISTINCT FROM p_nuevo_responsable_id;
  END IF;

  INSERT INTO public.auditoria_cambios (
    entidad,
    entidad_id,
    accion,
    motivo,
    autorizado_por,
    usuario_id,
    valores_anteriores,
    valores_nuevos,
    created_at
  ) VALUES (
    'conversaciones',
    p_conversacion_id,
    'TRANSFERENCIA_RESPONSABLE',
    NULLIF(btrim(p_motivo), ''),
    auth.uid(),
    auth.uid(),
    jsonb_build_object('responsable_id', v_anterior_responsable_id),
    jsonb_build_object('responsable_id', p_nuevo_responsable_id),
    now()
  );

  RETURN v_conversacion;
END;
$$;

-- 6. Vencimientos: la alerta va al profesor asignado.
CREATE OR REPLACE FUNCTION public.evaluar_vencimientos_contrataciones()
RETURNS TABLE (por_vencer INT, vencidas INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vencidas INT;
  v_por_vencer INT;
BEGIN
  IF NOT (auth.role() IS NULL OR auth.role() = 'service_role' OR public.es_admin()) THEN
    RAISE EXCEPTION 'Solo un administrador puede evaluar vencimientos'
      USING ERRCODE = '42501';
  END IF;

  WITH marcadas AS (
    UPDATE public.contrataciones
    SET estado = 'VENCIDA'
    WHERE estado IN ('VIGENTE', 'POR_VENCER', 'PENDIENTE_RENOVACION')
      AND CURRENT_DATE > fecha_fin
    RETURNING id, alumno_id, fecha_fin
  ), alertas AS (
    INSERT INTO public.alertas_entrenador (alumno_id, profesor_id, tipo_alerta, severidad, titulo, detalle)
    SELECT
      m.alumno_id,
      prof.id,
      'CUOTA_VENCIDA',
      'MEDIA',
      'Suscripción vencida: ' || p.nombre_completo,
      'La contratación venció el ' || to_char(m.fecha_fin, 'DD/MM/YYYY')
        || '. El alumno conserva acceso a la app y al Chat GOZS.'
    FROM marcadas m
    JOIN public.perfiles p ON p.id = m.alumno_id
    CROSS JOIN LATERAL (SELECT p.profesor_asignado_id AS id) prof
    WHERE prof.id IS NOT NULL
  )
  SELECT count(*) INTO v_vencidas FROM marcadas;

  UPDATE public.contrataciones
  SET estado = 'POR_VENCER'
  WHERE estado = 'VIGENTE'
    AND fecha_fin - CURRENT_DATE BETWEEN 0 AND dias_aviso_previo;
  GET DIAGNOSTICS v_por_vencer = ROW_COUNT;

  RETURN QUERY SELECT v_por_vencer, v_vencidas;
END;
$$;


-- 7. Alertas de dolor: sin fallback a la tabla N:M.
CREATE OR REPLACE FUNCTION public.fn_crear_alerta_dolor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno_id UUID;
  v_dia_id UUID;
  v_profesor_id UUID;
  v_ejercicio_nombre TEXT;
  v_musculos TEXT[];
  v_zona_articular TEXT := 'OTRO';
  v_notes_upper TEXT;
BEGIN
  IF current_setting('app.skip_serie_pain_alert', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.pain_reported = true AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.pain_reported IS FALSE OR OLD.pain_reported IS NULL))) THEN
    IF EXISTS (
      SELECT 1
      FROM public.alumno_historial_dolor h
      WHERE h.sesion_id = NEW.sesion_id
        AND h.ejercicio_id = NEW.ejercicio_id
        AND h.numero_serie = NEW.numero_serie
    ) THEN
      RETURN NEW;
    END IF;

    SELECT s.alumno_id, s.dia_id
    INTO v_alumno_id, v_dia_id
    FROM public.registro_sesiones s
    WHERE s.id = NEW.sesion_id;

    IF v_alumno_id IS NULL THEN
      RETURN NEW;
    END IF;

    IF v_dia_id IS NOT NULL THEN
      SELECT pe.profesor_id
      INTO v_profesor_id
      FROM public.dias_rutina dr
      JOIN public.planes_entrenamiento pe ON pe.id = dr.plan_id
      WHERE dr.id = v_dia_id;
    END IF;

    IF v_profesor_id IS NULL THEN
      SELECT p.profesor_asignado_id
      INTO v_profesor_id
      FROM public.perfiles p
      WHERE p.id = v_alumno_id;
    END IF;

    IF v_profesor_id IS NULL THEN
      SELECT id
      INTO v_profesor_id
      FROM public.perfiles
      WHERE rol IN ('ENTRENADOR', 'ADMIN')
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    IF v_profesor_id IS NULL THEN
      v_profesor_id := v_alumno_id;
    END IF;

    SELECT e.nombre, e.musculos_principales
    INTO v_ejercicio_nombre, v_musculos
    FROM public.ejercicios e
    WHERE e.id = NEW.ejercicio_id;

    v_notes_upper := UPPER(COALESCE(NEW.pain_notes, ''));
    IF v_notes_upper LIKE '%HOMBRO%' THEN
      v_zona_articular := 'HOMBRO';
    ELSIF v_notes_upper LIKE '%RODILLA%' THEN
      v_zona_articular := 'RODILLA';
    ELSIF v_notes_upper LIKE '%LUMBAR%' OR v_notes_upper LIKE '%ESPALDA BAJA%' THEN
      v_zona_articular := 'LUMBAR';
    ELSIF v_notes_upper LIKE '%CODO%' THEN
      v_zona_articular := 'CODO';
    ELSIF v_notes_upper LIKE '%CUELLO%' OR v_notes_upper LIKE '%CERVICAL%' THEN
      v_zona_articular := 'CUELLO';
    ELSIF v_notes_upper LIKE '%CADERA%' THEN
      v_zona_articular := 'CADERA';
    ELSIF v_notes_upper LIKE '%TOBILLO%' THEN
      v_zona_articular := 'TOBILLO';
    ELSIF v_musculos IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM unnest(v_musculos) m WHERE upper(m) IN ('HOMBRO', 'HOMBROS', 'DELTOIDES')) THEN
        v_zona_articular := 'HOMBRO';
      ELSIF EXISTS (SELECT 1 FROM unnest(v_musculos) m WHERE upper(m) IN ('CUADRICEPS', 'ISQUIOS', 'ISQUIOTIBIALES', 'RODILLA', 'PIERNAS')) THEN
        v_zona_articular := 'RODILLA';
      ELSIF EXISTS (SELECT 1 FROM unnest(v_musculos) m WHERE upper(m) IN ('LUMBARES', 'LUMBAR', 'ESPALDA BAJA', 'ESPALDA')) THEN
        v_zona_articular := 'LUMBAR';
      ELSIF EXISTS (SELECT 1 FROM unnest(v_musculos) m WHERE upper(m) IN ('BICEPS', 'TRICEPS', 'CODO', 'BRAZOS', 'ANTEBRAZO')) THEN
        v_zona_articular := 'CODO';
      ELSIF EXISTS (SELECT 1 FROM unnest(v_musculos) m WHERE upper(m) IN ('GLUTEOS', 'CADERA')) THEN
        v_zona_articular := 'CADERA';
      ELSIF EXISTS (SELECT 1 FROM unnest(v_musculos) m WHERE upper(m) IN ('GEMELOS', 'PANTORRILLAS', 'TOBILLO')) THEN
        v_zona_articular := 'TOBILLO';
      ELSE
        v_zona_articular := 'OTRO';
      END IF;
    ELSE
      v_zona_articular := 'OTRO';
    END IF;

    INSERT INTO public.alertas_entrenador (
      alumno_id, profesor_id, ejercicio_id, serie_id,
      tipo_alerta, severidad, titulo, detalle, estado
    ) VALUES (
      v_alumno_id, v_profesor_id, NEW.ejercicio_id, NEW.id,
      'DOLOR_ARTICULAR', 'ALTA',
      'Alerta de Dolor: ' || COALESCE(v_ejercicio_nombre, 'Ejercicio'),
      COALESCE(NEW.pain_notes, 'El alumno reportó molestia o dolor en serie ' || NEW.numero_serie),
      'PENDIENTE'
    );

    INSERT INTO public.alumno_historial_dolor (
      alumno_id, ejercicio_id, zona_articular, severidad,
      notas_alumno, estado_recuperacion, fecha_reporte
    ) VALUES (
      v_alumno_id, NEW.ejercicio_id, v_zona_articular, 'MODERADO',
      COALESCE(NEW.pain_notes, 'Dolor registrado en serie ' || NEW.numero_serie),
      'ACTIVO', CURRENT_DATE
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_crear_alerta_sintoma_alarma()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profesor_id UUID;
  v_ejercicio_nombre TEXT;
  v_detalle TEXT;
  v_titulo TEXT;
  v_severidad_alerta TEXT;
BEGIN
  -- Dispara con síntomas de alarma (es_sintoma_alarma = true) o dolor agudo (severidad AGUDO / eva >= 7)
  IF (NEW.es_sintoma_alarma = true OR NEW.severidad = 'AGUDO' OR (NEW.eva IS NOT NULL AND NEW.eva >= 7))
     AND (
       TG_OP = 'INSERT'
       OR (
         (OLD.es_sintoma_alarma IS DISTINCT FROM true)
         AND (OLD.severidad IS DISTINCT FROM 'AGUDO')
         AND (OLD.eva IS NULL OR OLD.eva < 7)
       )
     ) THEN
    SELECT p.profesor_asignado_id INTO v_profesor_id
    FROM public.perfiles p
    WHERE p.id = NEW.alumno_id;

    IF v_profesor_id IS NULL THEN
      SELECT id INTO v_profesor_id
      FROM public.perfiles
      WHERE rol IN ('ENTRENADOR', 'ADMIN')
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    IF v_profesor_id IS NULL THEN
      v_profesor_id := NEW.alumno_id;
    END IF;

    SELECT nombre INTO v_ejercicio_nombre
    FROM public.ejercicios
    WHERE id = NEW.ejercicio_id;

    v_titulo := 'RED FLAG: ' || COALESCE(v_ejercicio_nombre, 'Ejercicio') || ' (' || NEW.zona_articular || ')';
    v_detalle := CASE
        WHEN array_length(NEW.sintomas_alarma, 1) > 0
          THEN 'Síntomas de alarma reportados: ' || array_to_string(NEW.sintomas_alarma, ', ')
        WHEN NEW.es_sintoma_alarma = true THEN 'Síntomas de alarma reportados: Riesgo agudo reportado'
        ELSE 'Dolor agudo reportado (' || COALESCE(NEW.eva::text, '7-10') || '/10)'
      END ||
      CASE
        WHEN NEW.notas_alumno IS NOT NULL AND TRIM(NEW.notas_alumno) <> ''
          THEN ' | Notas: ' || TRIM(NEW.notas_alumno)
        ELSE ''
      END;

    -- Severidad unificada:
    -- Si es síntoma de alarma es CRITICA; si no, dolor agudo es ALTA, moderado MEDIA, leve BAJA
    v_severidad_alerta := CASE
      WHEN NEW.es_sintoma_alarma = true THEN 'CRITICA'
      WHEN NEW.severidad = 'AGUDO' OR (NEW.eva IS NOT NULL AND NEW.eva >= 7) THEN 'ALTA'
      WHEN NEW.severidad = 'MODERADO' OR (NEW.eva IS NOT NULL AND NEW.eva >= 4) THEN 'MEDIA'
      ELSE 'BAJA'
    END;

    INSERT INTO public.alertas_entrenador (
      alumno_id, profesor_id, ejercicio_id, tipo_alerta, severidad, titulo, detalle, estado, reporte_dolor_id
    ) VALUES (
      NEW.alumno_id, v_profesor_id, NEW.ejercicio_id, 'DOLOR_ARTICULAR', v_severidad_alerta, v_titulo, v_detalle, NEW.estado, NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 8. Protección de alertas: el profesor debe ser el asignado o armar un plan del alumno.
CREATE OR REPLACE FUNCTION public.fn_proteger_alertas_entrenador()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Triggers internos y operaciones privilegiadas mantienen su flujo normal
  IF pg_trigger_depth() > 1 OR auth.role() IS NULL OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.perfiles p
    WHERE p.id = NEW.profesor_id
      AND p.rol IN ('ENTRENADOR', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'alertas_entrenador.profesor_id debe corresponder a un entrenador o administrador'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.es_admin() AND NOT (
    EXISTS (
      SELECT 1
      FROM public.perfiles p
      WHERE p.id = NEW.alumno_id
        AND p.profesor_asignado_id = NEW.profesor_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.planes_entrenamiento pe
      WHERE pe.alumno_id = NEW.alumno_id
        AND pe.profesor_id = NEW.profesor_id
    )
  ) THEN
    RAISE EXCEPTION 'alertas_entrenador.profesor_id debe corresponder a un entrenador asignado al alumno'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.es_entrenador_o_admin() THEN
    IF NEW.severidad NOT IN ('BAJA', 'MEDIA') OR NEW.estado <> 'PENDIENTE' THEN
      RAISE EXCEPTION 'Un alumno solo puede crear alertas con severidad acotada (BAJA o MEDIA) y estado PENDIENTE'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 9. Respaldo: la tabla N:M deja de ser restaurable.
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

-- 10. Eliminar la tabla N:M (arrastra sus políticas, índices y trigger).
DROP TABLE IF EXISTS public.entrenador_alumnos;
