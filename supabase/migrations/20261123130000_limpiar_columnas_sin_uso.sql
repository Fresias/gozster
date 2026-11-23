-- GOZS-721 (PL-9): limpiar columnas sin uso.
-- - alumno_historial_dolor.estado_recuperacion: duplicaba `estado` (PENDIENTE/ATENDIDO/RESUELTO),
--   que es el único estado que leen la app, la vista y los triggers. Se redefinen sin ella:
--   v_dolor_activo, actualizar_estado_dolor, fn_crear_alerta_dolor, quick_swap_ejercicio y
--   fn_proteger_estado_historial_dolor (cuerpos idénticos salvo esa columna).
-- - registro_sesiones.athlete_feedback y perfiles.whatsapp_habilitado: nadie las lee ni escribe.
-- Se conservan (en uso por la app): planes_entrenamiento.tags/etiqueta,
-- ejercicios_en_rutina.es_superserie y tempo/tempo_activo (GOZS-701 no los unificó).
-- Sin CASCADE: si apareciera una dependencia inesperada, la migración falla.

BEGIN;

-- 1. Vista sin estado_recuperacion (CREATE OR REPLACE no puede quitar columnas).
DROP VIEW IF EXISTS public.v_dolor_activo;
CREATE VIEW public.v_dolor_activo
WITH (security_invoker = true)
AS
SELECT
  h.id,
  h.alumno_id,
  p.nombre_completo AS alumno_nombre,
  p.email AS alumno_email,
  h.ejercicio_id,
  e.nombre AS ejercicio_nombre,
  h.zona_articular,
  h.eva,
  h.severidad,
  CASE
    WHEN h.es_sintoma_alarma = true OR h.severidad = 'CRITICA' OR COALESCE(h.eva, 5) >= 7 THEN 'alto'
    WHEN COALESCE(h.eva, 5) >= 4 THEN 'medio'
    ELSE 'bajo'
  END AS nivel,
  h.estado,
  h.momento_aparicion,
  h.es_sintoma_alarma,
  h.sintomas_alarma,
  h.notas_alumno,
  h.notas_profesor,
  h.fecha_reporte,
  h.created_at,
  h.updated_at
FROM public.alumno_historial_dolor h
LEFT JOIN public.perfiles p ON p.id = h.alumno_id
LEFT JOIN public.ejercicios e ON e.id = h.ejercicio_id
WHERE h.estado IN ('PENDIENTE', 'ATENDIDO');

REVOKE ALL ON public.v_dolor_activo FROM PUBLIC, anon;
GRANT SELECT ON public.v_dolor_activo TO authenticated, service_role;

-- 2. actualizar_estado_dolor: solo actualiza estado.
CREATE OR REPLACE FUNCTION public.actualizar_estado_dolor(
  p_reporte_id UUID,
  p_nuevo_estado TEXT,
  p_nota TEXT DEFAULT NULL
)
RETURNS public.alumno_historial_dolor
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporte public.alumno_historial_dolor%ROWTYPE;
  v_nuevo_estado TEXT := upper(btrim(COALESCE(p_nuevo_estado, '')));
  v_nota_limpia TEXT := btrim(COALESCE(p_nota, ''));
  v_caller_id UUID := auth.uid();
BEGIN
  -- 1. Validar nuevo estado
  IF v_nuevo_estado NOT IN ('PENDIENTE', 'ATENDIDO', 'RESUELTO') THEN
    RAISE EXCEPTION 'Estado no válido: %. Debe ser PENDIENTE, ATENDIDO o RESUELTO.', v_nuevo_estado
      USING ERRCODE = '22023';
  END IF;

  -- 2. Buscar caso existente con bloqueo FOR UPDATE
  SELECT * INTO v_reporte
  FROM public.alumno_historial_dolor
  WHERE id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reporte de dolor con ID % no encontrado.', p_reporte_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Permisos: un alumno autenticado no puede cambiar su propio estado clínico ni notas_profesor
  IF NOT (
    v_caller_id IS NULL
    OR public.es_entrenador_de(v_reporte.alumno_id)
    OR public.es_admin()
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para actualizar este caso de dolor.'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Validación de reapertura: si el caso está RESUELTO y se pasa a PENDIENTE/ATENDIDO, es obligatoria la nota
  IF v_reporte.estado = 'RESUELTO' AND v_nuevo_estado IN ('PENDIENTE', 'ATENDIDO') THEN
    IF v_nota_limpia = '' THEN
      RAISE EXCEPTION 'Para reabrir un caso de dolor resuelto es obligatorio incluir una nota o motivo explicativo.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 5. Actualizar notas si se provee una nota
  IF v_nota_limpia <> '' THEN
    IF v_reporte.notas_profesor IS NOT NULL AND btrim(v_reporte.notas_profesor) <> '' THEN
      v_reporte.notas_profesor := v_reporte.notas_profesor || ' | ' || v_nota_limpia;
    ELSE
      v_reporte.notas_profesor := v_nota_limpia;
    END IF;
  END IF;

  -- 6. Actualizar registro en alumno_historial_dolor
  UPDATE public.alumno_historial_dolor
  SET
    estado = v_nuevo_estado,
    notas_profesor = v_reporte.notas_profesor,
    updated_at = now()
  WHERE id = p_reporte_id
  RETURNING * INTO v_reporte;

  RETURN v_reporte;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_estado_dolor(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_dolor(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 3. Trigger de dolor por serie: inserta sin estado_recuperacion (default de estado = PENDIENTE).
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
      SELECT ea.entrenador_id
      INTO v_profesor_id
      FROM public.entrenador_alumnos ea
      WHERE ea.alumno_id = v_alumno_id
      ORDER BY ea.created_at DESC
      LIMIT 1;
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
      notas_alumno, fecha_reporte
    ) VALUES (
      v_alumno_id, NEW.ejercicio_id, v_zona_articular, 'MODERADO',
      COALESCE(NEW.pain_notes, 'Dolor registrado en serie ' || NEW.numero_serie),
      CURRENT_DATE
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 4. quick_swap_ejercicio: marca el caso ATENDIDO sin estado_recuperacion.
CREATE OR REPLACE FUNCTION public.quick_swap_ejercicio(
  p_ejercicio_en_rutina_id UUID,
  p_nuevo_ejercicio_id UUID,
  p_alerta_id UUID DEFAULT NULL,
  p_motivo TEXT DEFAULT NULL
)
RETURNS public.ejercicios_en_rutina
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id UUID;
  v_old_ejercicio_id UUID;
  v_plan_id UUID;
  v_alumno_id UUID;
  v_plan_profesor_id UUID;
  v_caller_role TEXT;
  v_new_nombre TEXT;
  v_swap_note TEXT;
  v_responsable_id UUID;
  v_reporte_id UUID;
  v_rutina_item public.ejercicios_en_rutina%ROWTYPE;
BEGIN
  -- 1. Validar que exista el ejercicio en rutina y capturar relaciones de control
  SELECT er.id, er.ejercicio_id, pe.id, pe.alumno_id, pe.profesor_id
  INTO v_item_id, v_old_ejercicio_id, v_plan_id, v_alumno_id, v_plan_profesor_id
  FROM public.ejercicios_en_rutina er
  JOIN public.dias_rutina dr ON dr.id = er.dia_id
  JOIN public.planes_entrenamiento pe ON pe.id = dr.plan_id
  WHERE er.id = p_ejercicio_en_rutina_id;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'Ejercicio en rutina no encontrado con ID: %', p_ejercicio_en_rutina_id
      USING ERRCODE = '22023';
  END IF;

  -- 2. Validar que exista el nuevo ejercicio en el catálogo
  SELECT nombre INTO v_new_nombre
  FROM public.ejercicios
  WHERE id = p_nuevo_ejercicio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nuevo ejercicio no encontrado con ID: %', p_nuevo_ejercicio_id
      USING ERRCODE = '22023';
  END IF;

  -- 3. SEGURIDAD ESTRICTA (ADR-002):
  -- Rechazar con 42501 si quien invoca es ALUMNO (el alumno NO puede elegir ni ejecutar el reemplazo)
  IF auth.uid() IS NOT NULL THEN
    SELECT rol INTO v_caller_role
    FROM public.perfiles
    WHERE id = auth.uid();

    IF v_caller_role = 'ALUMNO' OR auth.uid() = v_alumno_id THEN
      RAISE EXCEPTION 'Operación no permitida: el alumno no puede elegir ni ejecutar la sustitución de ejercicios'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Validar permisos de modificación: solo entrenador asignado, dueño del plan, admin o service_role
  IF NOT (
    public.es_admin()
    OR auth.role() = 'service_role'
    OR (auth.uid() IS NOT NULL AND auth.uid() = v_plan_profesor_id)
    OR (auth.uid() IS NOT NULL AND v_alumno_id IS NOT NULL AND public.es_entrenador_de(v_alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para modificar la rutina de este alumno'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Determinar responsable_id de la sustitución
  v_responsable_id := COALESCE(auth.uid(), v_plan_profesor_id);

  -- 5. Vincular reporte de dolor si existe pendiente
  IF v_alumno_id IS NOT NULL AND v_old_ejercicio_id IS NOT NULL THEN
    SELECT id INTO v_reporte_id
    FROM public.alumno_historial_dolor
    WHERE alumno_id = v_alumno_id
      AND ejercicio_id = v_old_ejercicio_id
      AND estado IN ('PENDIENTE', 'ACTIVO')
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- 6. REGISTRO ESTRUCTURADO: Guardar fila en public.sustituciones_ejercicios ANTES de actualizar la rutina
  INSERT INTO public.sustituciones_ejercicios (
    plan_id,
    ejercicio_en_rutina_id,
    ejercicio_original_id,
    ejercicio_sustituto_id,
    reporte_dolor_id,
    motivo,
    responsable_id,
    created_at
  ) VALUES (
    v_plan_id,
    p_ejercicio_en_rutina_id,
    v_old_ejercicio_id,
    p_nuevo_ejercicio_id,
    v_reporte_id,
    p_motivo,
    v_responsable_id,
    now()
  );

  -- 7. Construir nota explicativa de sustitución
  v_swap_note := 'Sustituido por ' || v_new_nombre ||
    CASE WHEN p_motivo IS NOT NULL AND TRIM(p_motivo) <> '' THEN ' (Motivo: ' || TRIM(p_motivo) || ')' ELSE '' END;

  -- 8. Actualizar ejercicios_en_rutina para la rutina vigente
  -- (Inmutabilidad total: registro_sesiones y registro_series completadas permanecen 100% inmutables)
  UPDATE public.ejercicios_en_rutina
  SET ejercicio_id = p_nuevo_ejercicio_id,
      notas = CASE
        WHEN notas IS NULL OR TRIM(notas) = '' THEN v_swap_note
        ELSE notas || E'\n' || v_swap_note
      END,
      updated_at = now()
  WHERE id = p_ejercicio_en_rutina_id
  RETURNING * INTO v_rutina_item;

  -- 9. Actualizar alerta correspondiente si existe
  IF p_alerta_id IS NOT NULL THEN
    UPDATE public.alertas_entrenador
    SET estado = 'ATENDIDO',
        accion_tomada = COALESCE(p_motivo, 'Sustitución por ' || v_new_nombre),
        resuelto_por = v_responsable_id,
        resuelto_at = now(),
        updated_at = now()
    WHERE id = p_alerta_id;
  ELSIF v_alumno_id IS NOT NULL AND v_old_ejercicio_id IS NOT NULL THEN
    UPDATE public.alertas_entrenador
    SET estado = 'ATENDIDO',
        accion_tomada = COALESCE(p_motivo, 'Sustitución por ' || v_new_nombre),
        resuelto_por = v_responsable_id,
        resuelto_at = now(),
        updated_at = now()
    WHERE id = (
      SELECT id
      FROM public.alertas_entrenador
      WHERE alumno_id = v_alumno_id
        AND ejercicio_id = v_old_ejercicio_id
        AND estado = 'PENDIENTE'
      ORDER BY created_at DESC
      LIMIT 1
    );
  END IF;

  -- 10. Actualizar caso en alumno_historial_dolor a ATENDIDO si aplica
  IF v_reporte_id IS NOT NULL THEN
    UPDATE public.alumno_historial_dolor
    SET estado = 'ATENDIDO',
        notas_profesor = CASE
          WHEN notas_profesor IS NULL OR TRIM(notas_profesor) = ''
            THEN 'Sustituido por ' || v_new_nombre || COALESCE(' (Motivo: ' || p_motivo || ')', '')
          ELSE notas_profesor || E'\nSustituido por ' || v_new_nombre
        END,
        updated_at = now()
    WHERE id = v_reporte_id;
  END IF;

  RETURN v_rutina_item;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.quick_swap_ejercicio(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quick_swap_ejercicio(UUID, UUID, UUID, TEXT) TO authenticated, service_role;

-- 5. Protección de estado clínico: solo estado y notas_profesor.
CREATE OR REPLACE FUNCTION public.fn_proteger_estado_historial_dolor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL
     OR auth.role() = 'service_role'
     OR public.es_admin()
     OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(NEW.alumno_id)) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado IS DISTINCT FROM 'PENDIENTE'
       OR NEW.notas_profesor IS NOT NULL THEN
      RAISE EXCEPTION 'Solo el entrenador asignado o un administrador puede definir el estado o notas clínicas del reporte'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.notas_profesor IS DISTINCT FROM OLD.notas_profesor THEN
    RAISE EXCEPTION 'Solo el entrenador asignado o un administrador puede modificar el estado o notas clínicas del reporte'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


-- 6. Drops (el índice sobre estado_recuperacion cae con la columna).
ALTER TABLE public.alumno_historial_dolor DROP COLUMN IF EXISTS estado_recuperacion;
ALTER TABLE public.registro_sesiones DROP COLUMN IF EXISTS athlete_feedback;
ALTER TABLE public.perfiles DROP COLUMN IF EXISTS whatsapp_habilitado;

COMMIT;
