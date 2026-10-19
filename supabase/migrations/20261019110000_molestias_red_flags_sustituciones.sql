-- ============================================================================
-- GOZSter: Biblioteca de Alternativas, Sustituciones Trazables, Red Flags y Bloqueo RLS
-- Archivo: supabase/migrations/20261019110000_molestias_red_flags_sustituciones.sql
-- GitHub Issue: #67 | Multica Issue: GOZS-41
-- ADR-002: Inmutabilidad del Historial de Entrenamiento y Sustitución Trazable
-- Idempotente para PostgreSQL 15+ / Supabase
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. EXTENSIONES QUIRÚRGICAS EN: public.alumno_historial_dolor
-- ============================================================================

ALTER TABLE public.alumno_historial_dolor
  ADD COLUMN IF NOT EXISTS momento_aparicion TEXT
    CHECK (momento_aparicion IN ('CALENTAMIENTO', 'EN_SERIE', 'POST_EJERCICIO')),
  ADD COLUMN IF NOT EXISTS es_sintoma_alarma BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sintomas_alarma TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'ATENDIDO', 'CERRADO'));

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_estado_caso
  ON public.alumno_historial_dolor (estado);

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_es_alarma
  ON public.alumno_historial_dolor (es_sintoma_alarma);

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_momento
  ON public.alumno_historial_dolor (momento_aparicion);

-- ============================================================================
-- 2. AJUSTE DE CONSTRAINTS Y TRIGGER DE RED FLAGS EN: public.alertas_entrenador
-- ============================================================================

-- Soporte de severidad 'CRITICA'
ALTER TABLE public.alertas_entrenador
  DROP CONSTRAINT IF EXISTS alertas_entrenador_severidad_check;

ALTER TABLE public.alertas_entrenador
  ADD CONSTRAINT alertas_entrenador_severidad_check
  CHECK (severidad IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA'));

-- Soporte de estados 'ATENDIDO' y 'CERRADO'
ALTER TABLE public.alertas_entrenador
  DROP CONSTRAINT IF EXISTS alertas_entrenador_estado_check;

ALTER TABLE public.alertas_entrenador
  ADD CONSTRAINT alertas_entrenador_estado_check
  CHECK (estado IN ('PENDIENTE', 'RESUELTO', 'IGNORADO', 'ATENDIDO', 'CERRADO'));

-- Trigger para crear alerta CRITICA automática cuando es_sintoma_alarma = true
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
BEGIN
  IF NEW.es_sintoma_alarma = true AND (TG_OP = 'INSERT' OR OLD.es_sintoma_alarma IS DISTINCT FROM true) THEN
    -- 1. Resolver profesor asignado
    SELECT p.profesor_asignado_id INTO v_profesor_id
    FROM public.perfiles p
    WHERE p.id = NEW.alumno_id;

    IF v_profesor_id IS NULL THEN
      SELECT ea.entrenador_id INTO v_profesor_id
      FROM public.entrenador_alumnos ea
      WHERE ea.alumno_id = NEW.alumno_id
      ORDER BY ea.created_at DESC
      LIMIT 1;
    END IF;

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

    -- 2. Nombre del ejercicio
    SELECT nombre INTO v_ejercicio_nombre
    FROM public.ejercicios
    WHERE id = NEW.ejercicio_id;

    -- 3. Detalle y título estructurado
    v_titulo := 'RED FLAG: ' || COALESCE(v_ejercicio_nombre, 'Ejercicio') || ' (' || NEW.zona_articular || ')';
    v_detalle := 'Síntomas de alarma reportados: ' ||
      CASE
        WHEN array_length(NEW.sintomas_alarma, 1) > 0 THEN array_to_string(NEW.sintomas_alarma, ', ')
        ELSE 'Riesgo agudo reportado'
      END ||
      CASE
        WHEN NEW.notas_alumno IS NOT NULL AND TRIM(NEW.notas_alumno) <> ''
          THEN ' | Notas: ' || TRIM(NEW.notas_alumno)
        ELSE ''
      END;

    -- 4. Insertar alerta con severidad CRITICA
    INSERT INTO public.alertas_entrenador (
      alumno_id,
      profesor_id,
      ejercicio_id,
      tipo_alerta,
      severidad,
      titulo,
      detalle,
      estado
    ) VALUES (
      NEW.alumno_id,
      v_profesor_id,
      NEW.ejercicio_id,
      'DOLOR_ARTICULAR',
      'CRITICA',
      v_titulo,
      v_detalle,
      'PENDIENTE'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alumno_historial_dolor_alerta_critica ON public.alumno_historial_dolor;
CREATE TRIGGER trg_alumno_historial_dolor_alerta_critica
  AFTER INSERT OR UPDATE OF es_sintoma_alarma ON public.alumno_historial_dolor
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_crear_alerta_sintoma_alarma();

-- ============================================================================
-- 3. TABLA: public.ejercicios_alternativas (Biblioteca Biomecánica de Alternativas)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ejercicios_alternativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ejercicio_origen_id UUID NOT NULL REFERENCES public.ejercicios(id) ON DELETE CASCADE,
  ejercicio_alternativo_id UUID NOT NULL REFERENCES public.ejercicios(id) ON DELETE CASCADE,
  patron_movimiento TEXT NOT NULL,
  equipamiento TEXT,
  nivel_exigencia TEXT,
  restricciones_articulares TEXT[] NOT NULL DEFAULT '{}',
  explicacion_tecnica TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ejercicios_alternativas UNIQUE (ejercicio_origen_id, ejercicio_alternativo_id),
  CONSTRAINT chk_ejercicios_alternativas_distintos CHECK (ejercicio_origen_id <> ejercicio_alternativo_id)
);

DROP TRIGGER IF EXISTS trg_ejercicios_alternativas_updated_at ON public.ejercicios_alternativas;
CREATE TRIGGER trg_ejercicios_alternativas_updated_at
  BEFORE UPDATE ON public.ejercicios_alternativas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_ejercicios_alternativas_origen
  ON public.ejercicios_alternativas (ejercicio_origen_id);

CREATE INDEX IF NOT EXISTS idx_ejercicios_alternativas_alternativo
  ON public.ejercicios_alternativas (ejercicio_alternativo_id);

CREATE INDEX IF NOT EXISTS idx_ejercicios_alternativas_patron
  ON public.ejercicios_alternativas (patron_movimiento);

CREATE INDEX IF NOT EXISTS idx_ejercicios_alternativas_updated_at
  ON public.ejercicios_alternativas (updated_at);

-- RLS: lectura autenticada, escritura solo entrenador/admin
ALTER TABLE public.ejercicios_alternativas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ejercicios_alternativas_select" ON public.ejercicios_alternativas;
CREATE POLICY "ejercicios_alternativas_select"
  ON public.ejercicios_alternativas
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "ejercicios_alternativas_insert" ON public.ejercicios_alternativas;
CREATE POLICY "ejercicios_alternativas_insert"
  ON public.ejercicios_alternativas
  FOR INSERT
  TO authenticated
  WITH CHECK (public.es_entrenador_o_admin());

DROP POLICY IF EXISTS "ejercicios_alternativas_update" ON public.ejercicios_alternativas;
CREATE POLICY "ejercicios_alternativas_update"
  ON public.ejercicios_alternativas
  FOR UPDATE
  TO authenticated
  USING (public.es_entrenador_o_admin())
  WITH CHECK (public.es_entrenador_o_admin());

DROP POLICY IF EXISTS "ejercicios_alternativas_delete" ON public.ejercicios_alternativas;
CREATE POLICY "ejercicios_alternativas_delete"
  ON public.ejercicios_alternativas
  FOR DELETE
  TO authenticated
  USING (public.es_entrenador_o_admin());

-- ============================================================================
-- 4. TABLA: public.sustituciones_ejercicios (Trazabilidad Inmutable de Sustituciones)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sustituciones_ejercicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.planes_entrenamiento(id) ON DELETE CASCADE,
  ejercicio_en_rutina_id UUID REFERENCES public.ejercicios_en_rutina(id) ON DELETE SET NULL,
  ejercicio_original_id UUID NOT NULL REFERENCES public.ejercicios(id) ON DELETE RESTRICT,
  ejercicio_sustituto_id UUID NOT NULL REFERENCES public.ejercicios(id) ON DELETE RESTRICT,
  reporte_dolor_id UUID REFERENCES public.alumno_historial_dolor(id) ON DELETE SET NULL,
  motivo TEXT,
  responsable_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sustituciones_ejercicios_plan_id
  ON public.sustituciones_ejercicios (plan_id);

CREATE INDEX IF NOT EXISTS idx_sustituciones_ejercicios_rutina_id
  ON public.sustituciones_ejercicios (ejercicio_en_rutina_id);

CREATE INDEX IF NOT EXISTS idx_sustituciones_ejercicios_original_id
  ON public.sustituciones_ejercicios (ejercicio_original_id);

CREATE INDEX IF NOT EXISTS idx_sustituciones_ejercicios_sustituto_id
  ON public.sustituciones_ejercicios (ejercicio_sustituto_id);

CREATE INDEX IF NOT EXISTS idx_sustituciones_ejercicios_reporte_dolor_id
  ON public.sustituciones_ejercicios (reporte_dolor_id);

CREATE INDEX IF NOT EXISTS idx_sustituciones_ejercicios_responsable_id
  ON public.sustituciones_ejercicios (responsable_id);

CREATE INDEX IF NOT EXISTS idx_sustituciones_ejercicios_created_at
  ON public.sustituciones_ejercicios (created_at);

-- RLS: el alumno ve las sustituciones de su plan; el entrenador asignado/admin ve y gestiona
ALTER TABLE public.sustituciones_ejercicios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sustituciones_ejercicios_select" ON public.sustituciones_ejercicios;
CREATE POLICY "sustituciones_ejercicios_select"
  ON public.sustituciones_ejercicios
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.planes_entrenamiento pe
      WHERE pe.id = sustituciones_ejercicios.plan_id
        AND (
          pe.alumno_id = auth.uid()
          OR pe.profesor_id = auth.uid()
          OR public.es_entrenador_de(pe.alumno_id)
          OR public.es_admin()
        )
    )
    OR responsable_id = auth.uid()
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "sustituciones_ejercicios_insert" ON public.sustituciones_ejercicios;
CREATE POLICY "sustituciones_ejercicios_insert"
  ON public.sustituciones_ejercicios
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.es_admin()
    OR EXISTS (
      SELECT 1 FROM public.planes_entrenamiento pe
      WHERE pe.id = sustituciones_ejercicios.plan_id
        AND (
          pe.profesor_id = auth.uid()
          OR public.es_entrenador_de(pe.alumno_id)
        )
    )
  );

-- ============================================================================
-- 5. RPC: public.quick_swap_ejercicio (Seguridad Estricta y Registro Atómico)
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
        estado_recuperacion = 'EN_RECUPERACION',
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

-- ============================================================================
-- 6. ACTUALIZACIÓN DE: public.restaurar_filas_respaldo (Soporte de ejercicios_alternativas)
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
    'mensajes', 'habitos_registros', 'nutricion_registros', 'alertas_entrenador',
    'alumno_historial_dolor', 'alumno_cuestionario_inicial', 'contrataciones', 'pagos', 'auditoria_cambios',
    'sustituciones_ejercicios'
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
