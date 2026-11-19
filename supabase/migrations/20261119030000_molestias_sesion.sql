-- ============================================================================
-- GOZSter (Athlete v7 · BE-02 / D-51):
-- Asociar cada molestia a la sesión, la prescripción y la serie.
-- RPC idempotente `registrar_molestia`. Append-only.
-- ============================================================================

-- 1. Columnas e índice en public.alumno_historial_dolor
ALTER TABLE public.alumno_historial_dolor
  ADD COLUMN IF NOT EXISTS sesion_id UUID REFERENCES public.registro_sesiones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ejercicio_en_rutina_id UUID REFERENCES public.ejercicios_en_rutina(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS numero_serie INT CHECK (numero_serie IS NULL OR numero_serie >= 1);

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_sesion
  ON public.alumno_historial_dolor (sesion_id);

-- 2. Evitar duplicados cuando la molestia ya fue registrada por `registrar_molestia`
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

-- 3. RPC idempotente: la app genera p_id; reintentar no duplica.
CREATE OR REPLACE FUNCTION public.registrar_molestia(
  p_id UUID,
  p_sesion_id UUID,
  p_ejercicio_id UUID,
  p_zona TEXT,
  p_eva INT,
  p_dia_id UUID DEFAULT NULL,
  p_ejercicio_en_rutina_id UUID DEFAULT NULL,
  p_numero_serie INT DEFAULT NULL,
  p_momento TEXT DEFAULT NULL,
  p_sintomas TEXT[] DEFAULT '{}',
  p_notas TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno UUID := auth.uid();
  v_dueno UUID;
  v_alarma BOOLEAN := coalesce(array_length(p_sintomas, 1), 0) > 0 OR p_eva >= 10;
BEGIN
  IF v_alumno IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF p_eva IS NULL OR p_eva NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'EVA fuera de rango' USING ERRCODE = '23514';
  END IF;
  IF p_zona IS NULL OR p_zona NOT IN ('HOMBRO','RODILLA','LUMBAR','CODO','CUELLO','CADERA','TOBILLO','OTRO') THEN
    RAISE EXCEPTION 'Zona inválida' USING ERRCODE = '23514';
  END IF;

  -- La sesión puede no existir todavía (molestia antes de la primera serie): se crea, siempre del alumno.
  INSERT INTO public.registro_sesiones (id, alumno_id, dia_id)
  VALUES (p_sesion_id, v_alumno, p_dia_id)
  ON CONFLICT (id) DO NOTHING;

  SELECT alumno_id INTO v_dueno FROM public.registro_sesiones WHERE id = p_sesion_id;
  IF v_dueno IS DISTINCT FROM v_alumno THEN
    RAISE EXCEPTION 'Sesión ajena' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.alumno_historial_dolor (
    id, alumno_id, ejercicio_id, zona_articular, eva, momento_aparicion,
    es_sintoma_alarma, sintomas_alarma, notas_alumno, estado, fecha_reporte,
    sesion_id, ejercicio_en_rutina_id, numero_serie
  ) VALUES (
    p_id, v_alumno, p_ejercicio_id, p_zona, p_eva, p_momento,
    v_alarma, coalesce(p_sintomas, '{}'), NULLIF(btrim(p_notas), ''), 'PENDIENTE', current_date,
    p_sesion_id, p_ejercicio_en_rutina_id, p_numero_serie
  ) ON CONFLICT (id) DO NOTHING;
  -- severidad: la deriva fn_derivar_severidad_dolor desde eva. Alerta al coach: trigger existente.

  IF p_numero_serie IS NOT NULL THEN
    PERFORM set_config('app.skip_serie_pain_alert', 'true', true);
    UPDATE public.registro_series
       SET pain_reported = true,
           pain_notes = concat_ws(' · ', p_zona, p_eva || '/10', NULLIF(btrim(p_notas), ''))
     WHERE sesion_id = p_sesion_id
       AND ejercicio_id = p_ejercicio_id
       AND numero_serie = p_numero_serie;
    PERFORM set_config('app.skip_serie_pain_alert', 'false', true);
  END IF;

  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_molestia(UUID,UUID,UUID,TEXT,INT,UUID,UUID,INT,TEXT,TEXT[],TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_molestia(UUID,UUID,UUID,TEXT,INT,UUID,UUID,INT,TEXT,TEXT[],TEXT) TO authenticated;
