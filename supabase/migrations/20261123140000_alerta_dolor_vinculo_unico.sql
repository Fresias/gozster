-- GOZS-718 (PL-6), seguimiento: 20261123130000 redefinió fn_crear_alerta_dolor()
-- después de 20261123120000 y volvió a leer la tabla N:M ya eliminada.
-- Se redefine sobre su versión vigente usando solo el vínculo único
-- (perfiles.profesor_asignado_id) y se alinea la protección de alertas.

-- 1. Alerta de dolor por serie: sin fallback a la tabla N:M.
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

-- 2. Protección de alertas: el profesor debe ser el asignado del alumno.
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
