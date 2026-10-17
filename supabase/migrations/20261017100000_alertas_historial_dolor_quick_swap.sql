-- ============================================================================
-- GOZSter: Dashboard Coach Studio v2 - Alertas Entrenador, Historial Biomecánico de Dolor y Quick Swap
-- Archivo: supabase/migrations/20261017100000_alertas_historial_dolor_quick_swap.sql
-- GitHub Issue: #43 | Multica Issue: GOZS-26
-- Idempotente para PostgreSQL 15+ / Supabase
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. COLUMNAS QUIRÚRGICAS EN: public.perfiles
-- ============================================================================

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS fecha_vencimiento_cuota DATE,
  ADD COLUMN IF NOT EXISTS ultimo_entreno_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_perfiles_ultimo_entreno
  ON public.perfiles (ultimo_entreno_at);

CREATE INDEX IF NOT EXISTS idx_perfiles_cuota_vencimiento
  ON public.perfiles (fecha_vencimiento_cuota);

-- ============================================================================
-- 2. TABLA: public.alertas_entrenador
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alertas_entrenador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  profesor_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  ejercicio_id UUID REFERENCES public.ejercicios(id) ON DELETE SET NULL,
  serie_id UUID REFERENCES public.registro_series(id) ON DELETE SET NULL,
  tipo_alerta TEXT NOT NULL CHECK (tipo_alerta IN ('DOLOR_ARTICULAR', 'RECORD_1RM', 'DESERCION_RIESGO', 'CUOTA_VENCIDA', 'INACTIVIDAD')),
  severidad TEXT NOT NULL DEFAULT 'ALTA' CHECK (severidad IN ('BAJA', 'MEDIA', 'ALTA')),
  titulo TEXT NOT NULL,
  detalle TEXT,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'RESUELTO', 'IGNORADO')),
  accion_tomada TEXT,
  resuelto_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  resuelto_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Triggers de marca temporal
DROP TRIGGER IF EXISTS trg_alertas_entrenador_updated_at ON public.alertas_entrenador;
CREATE TRIGGER trg_alertas_entrenador_updated_at
  BEFORE UPDATE ON public.alertas_entrenador
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Índices de consulta y rendimiento
CREATE INDEX IF NOT EXISTS idx_alertas_entrenador_profesor_id
  ON public.alertas_entrenador (profesor_id);

CREATE INDEX IF NOT EXISTS idx_alertas_entrenador_alumno_id
  ON public.alertas_entrenador (alumno_id);

CREATE INDEX IF NOT EXISTS idx_alertas_entrenador_ejercicio_id
  ON public.alertas_entrenador (ejercicio_id);

CREATE INDEX IF NOT EXISTS idx_alertas_entrenador_serie_id
  ON public.alertas_entrenador (serie_id);

CREATE INDEX IF NOT EXISTS idx_alertas_entrenador_estado
  ON public.alertas_entrenador (estado);

CREATE INDEX IF NOT EXISTS idx_alertas_entrenador_tipo
  ON public.alertas_entrenador (tipo_alerta);

CREATE INDEX IF NOT EXISTS idx_alertas_entrenador_updated_at
  ON public.alertas_entrenador (updated_at);

-- ============================================================================
-- 3. TABLA: public.alumno_historial_dolor (Ficha Biomecánica Permanente)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alumno_historial_dolor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  ejercicio_id UUID NOT NULL REFERENCES public.ejercicios(id) ON DELETE CASCADE,
  zona_articular TEXT NOT NULL CHECK (zona_articular IN ('HOMBRO', 'RODILLA', 'LUMBAR', 'CODO', 'CUELLO', 'CADERA', 'TOBILLO', 'OTRO')),
  severidad TEXT NOT NULL DEFAULT 'MODERADO' CHECK (severidad IN ('LEVE', 'MODERADO', 'AGUDO')),
  notas_alumno TEXT,
  notas_profesor TEXT,
  estado_recuperacion TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado_recuperacion IN ('ACTIVO', 'EN_RECUPERACION', 'RESUELTO')),
  fecha_reporte DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Triggers de marca temporal
DROP TRIGGER IF EXISTS trg_alumno_historial_dolor_updated_at ON public.alumno_historial_dolor;
CREATE TRIGGER trg_alumno_historial_dolor_updated_at
  BEFORE UPDATE ON public.alumno_historial_dolor
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Índices de consulta y rendimiento
CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_alumno
  ON public.alumno_historial_dolor (alumno_id);

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_ejercicio
  ON public.alumno_historial_dolor (ejercicio_id);

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_zona
  ON public.alumno_historial_dolor (zona_articular);

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_estado
  ON public.alumno_historial_dolor (estado_recuperacion);

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_fecha
  ON public.alumno_historial_dolor (fecha_reporte);

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_updated_at
  ON public.alumno_historial_dolor (updated_at);

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- RLS en: alertas_entrenador
ALTER TABLE public.alertas_entrenador ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alertas_entrenador_select" ON public.alertas_entrenador;
CREATE POLICY "alertas_entrenador_select" ON public.alertas_entrenador
  FOR SELECT TO authenticated
  USING (
    profesor_id = auth.uid()
    OR alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "alertas_entrenador_insert" ON public.alertas_entrenador;
CREATE POLICY "alertas_entrenador_insert" ON public.alertas_entrenador
  FOR INSERT TO authenticated
  WITH CHECK (
    profesor_id = auth.uid()
    OR alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "alertas_entrenador_update" ON public.alertas_entrenador;
CREATE POLICY "alertas_entrenador_update" ON public.alertas_entrenador
  FOR UPDATE TO authenticated
  USING (
    profesor_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  )
  WITH CHECK (
    profesor_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "alertas_entrenador_delete" ON public.alertas_entrenador;
CREATE POLICY "alertas_entrenador_delete" ON public.alertas_entrenador
  FOR DELETE TO authenticated
  USING (
    profesor_id = auth.uid()
    OR public.es_admin()
  );

-- RLS en: alumno_historial_dolor
ALTER TABLE public.alumno_historial_dolor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alumno_historial_dolor_select" ON public.alumno_historial_dolor;
CREATE POLICY "alumno_historial_dolor_select" ON public.alumno_historial_dolor
  FOR SELECT TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "alumno_historial_dolor_insert" ON public.alumno_historial_dolor;
CREATE POLICY "alumno_historial_dolor_insert" ON public.alumno_historial_dolor
  FOR INSERT TO authenticated
  WITH CHECK (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "alumno_historial_dolor_update" ON public.alumno_historial_dolor;
CREATE POLICY "alumno_historial_dolor_update" ON public.alumno_historial_dolor
  FOR UPDATE TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  )
  WITH CHECK (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "alumno_historial_dolor_delete" ON public.alumno_historial_dolor;
CREATE POLICY "alumno_historial_dolor_delete" ON public.alumno_historial_dolor
  FOR DELETE TO authenticated
  USING (
    public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

-- ============================================================================
-- 5. TRIGGERS AUTOMÁTICOS
-- ============================================================================

-- Trigger 5.1: trg_actualizar_ultimo_entreno
-- Actualiza perfiles.ultimo_entreno_at = now() tras registrar una sesión.
CREATE OR REPLACE FUNCTION public.fn_actualizar_ultimo_entreno()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.perfiles
  SET ultimo_entreno_at = now(),
      updated_at = now()
  WHERE id = NEW.alumno_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_ultimo_entreno ON public.registro_sesiones;
CREATE TRIGGER trg_actualizar_ultimo_entreno
  AFTER INSERT ON public.registro_sesiones
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_actualizar_ultimo_entreno();

-- Trigger 5.2: trg_crear_alerta_dolor
-- Si pain_reported = true en registro_series, genera alerta e historial de dolor.
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
  -- Evaluar condición de dolor
  IF NEW.pain_reported = true AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.pain_reported IS FALSE OR OLD.pain_reported IS NULL))) THEN
    -- 1. Obtener alumno y rutina desde registro_sesiones
    SELECT s.alumno_id, s.dia_id
    INTO v_alumno_id, v_dia_id
    FROM public.registro_sesiones s
    WHERE s.id = NEW.sesion_id;

    IF v_alumno_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- 2. Resolver el profesor/entrenador responsable
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

    -- Fallback final para garantizar integridad referencial NOT NULL
    IF v_profesor_id IS NULL THEN
      v_profesor_id := v_alumno_id;
    END IF;

    -- 3. Obtener metadatos del ejercicio
    SELECT e.nombre, e.musculos_principales
    INTO v_ejercicio_nombre, v_musculos
    FROM public.ejercicios e
    WHERE e.id = NEW.ejercicio_id;

    -- 4. Determinar zona articular afectada
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

    -- 5. Insertar en alertas_entrenador
    INSERT INTO public.alertas_entrenador (
      alumno_id,
      profesor_id,
      ejercicio_id,
      serie_id,
      tipo_alerta,
      severidad,
      titulo,
      detalle,
      estado
    ) VALUES (
      v_alumno_id,
      v_profesor_id,
      NEW.ejercicio_id,
      NEW.id,
      'DOLOR_ARTICULAR',
      'ALTA',
      'Alerta de Dolor: ' || COALESCE(v_ejercicio_nombre, 'Ejercicio'),
      COALESCE(NEW.pain_notes, 'El alumno reportó molestia o dolor en serie ' || NEW.numero_serie),
      'PENDIENTE'
    );

    -- 6. Insertar en alumno_historial_dolor (Ficha Biomecánica Permanente)
    INSERT INTO public.alumno_historial_dolor (
      alumno_id,
      ejercicio_id,
      zona_articular,
      severidad,
      notas_alumno,
      estado_recuperacion,
      fecha_reporte
    ) VALUES (
      v_alumno_id,
      NEW.ejercicio_id,
      v_zona_articular,
      'MODERADO',
      COALESCE(NEW.pain_notes, 'Dolor registrado en serie ' || NEW.numero_serie),
      'ACTIVO',
      CURRENT_DATE
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crear_alerta_dolor ON public.registro_series;
CREATE TRIGGER trg_crear_alerta_dolor
  AFTER INSERT OR UPDATE ON public.registro_series
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_crear_alerta_dolor();

-- ============================================================================
-- 6. RPC: public.quick_swap_ejercicio
-- Sustitución rápida 1-toque de ejercicios con resolución atómica de alertas.
-- ============================================================================

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
  v_alumno_id UUID;
  v_plan_profesor_id UUID;
  v_new_nombre TEXT;
  v_swap_note TEXT;
  v_rutina_item public.ejercicios_en_rutina%ROWTYPE;
BEGIN
  -- 1. Validar que exista el ejercicio en rutina y capturar relaciones de control
  SELECT er.id, er.ejercicio_id, pe.alumno_id, pe.profesor_id
  INTO v_item_id, v_old_ejercicio_id, v_alumno_id, v_plan_profesor_id
  FROM public.ejercicios_en_rutina er
  JOIN public.dias_rutina dr ON dr.id = er.dia_id
  JOIN public.planes_entrenamiento pe ON pe.id = dr.plan_id
  WHERE er.id = p_ejercicio_en_rutina_id;

  IF v_item_id IS NULL THEN
    RAISE EXCEPTION 'Ejercicio en rutina no encontrado con ID: %', p_ejercicio_en_rutina_id;
  END IF;

  -- 2. Validar que exista el nuevo ejercicio en el catálogo
  SELECT nombre INTO v_new_nombre
  FROM public.ejercicios
  WHERE id = p_nuevo_ejercicio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nuevo ejercicio no encontrado con ID: %', p_nuevo_ejercicio_id;
  END IF;

  -- 3. Validar permisos de seguridad: entrenador asignado, dueño del plan o admin
  IF NOT (
    public.es_admin()
    OR auth.uid() = v_plan_profesor_id
    OR (v_alumno_id IS NOT NULL AND public.es_entrenador_de(v_alumno_id))
    OR (auth.role() = 'service_role')
    OR (auth.uid() IS NULL)
  ) THEN
    RAISE EXCEPTION 'No autorizado para modificar la rutina de este alumno';
  END IF;

  -- 4. Construir nota explicativa de sustitución
  v_swap_note := 'Sustituido por ' || v_new_nombre ||
    CASE WHEN p_motivo IS NOT NULL AND TRIM(p_motivo) <> '' THEN ' (Motivo: ' || TRIM(p_motivo) || ')' ELSE '' END;

  -- 5. Actualizar ejercicios_en_rutina
  UPDATE public.ejercicios_en_rutina
  SET ejercicio_id = p_nuevo_ejercicio_id,
      notas = CASE
        WHEN notas IS NULL OR TRIM(notas) = '' THEN v_swap_note
        ELSE notas || E'\n' || v_swap_note
      END,
      updated_at = now()
  WHERE id = p_ejercicio_en_rutina_id
  RETURNING * INTO v_rutina_item;

  -- 6. Resolver alerta correspondiente de forma atómica
  IF p_alerta_id IS NOT NULL THEN
    UPDATE public.alertas_entrenador
    SET estado = 'RESUELTO',
        accion_tomada = COALESCE(p_motivo, 'Quick swap por ' || v_new_nombre),
        resuelto_por = COALESCE(auth.uid(), v_plan_profesor_id),
        resuelto_at = now(),
        updated_at = now()
    WHERE id = p_alerta_id;
  ELSIF v_alumno_id IS NOT NULL AND v_old_ejercicio_id IS NOT NULL THEN
    UPDATE public.alertas_entrenador
    SET estado = 'RESUELTO',
        accion_tomada = COALESCE(p_motivo, 'Quick swap por ' || v_new_nombre),
        resuelto_por = COALESCE(auth.uid(), v_plan_profesor_id),
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

  RETURN v_rutina_item;
END;
$$;

COMMIT;
