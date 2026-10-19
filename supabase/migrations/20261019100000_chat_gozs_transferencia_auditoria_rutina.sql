-- ============================================================================
-- GOZSter: Asignación y transferencia de conversaciones con RLS automático
-- y auditoría de cambios de rutina
-- Migración idempotente para PostgreSQL 15+ / Supabase
-- GitHub Issue: #66 (GOZS-45) / ADR-004
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. EXTENSIÓN TABLA: public.conversaciones (ADR-004)
-- Añade responsable_id (profesor o admin asignado) y estado del canal
-- ============================================================================

ALTER TABLE public.conversaciones
  ADD COLUMN IF NOT EXISTS responsable_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'ABIERTA';

-- Restricción CHECK de estados válidos ('ABIERTA', 'PENDIENTE', 'ATENDIDA')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_conversaciones_estado'
      AND conrelid = 'public.conversaciones'::regclass
  ) THEN
    ALTER TABLE public.conversaciones
      ADD CONSTRAINT chk_conversaciones_estado
      CHECK (estado IN ('ABIERTA', 'PENDIENTE', 'ATENDIDA'));
  END IF;
END;
$$;

-- Inicializar responsable_id con el profesor_asignado_id del alumno si es NULL
UPDATE public.conversaciones c
SET responsable_id = p.profesor_asignado_id
FROM public.perfiles p
WHERE c.alumno_id = p.id
  AND c.responsable_id IS NULL
  AND p.profesor_asignado_id IS NOT NULL;

-- Índices para búsqueda por responsable y estado
CREATE INDEX IF NOT EXISTS idx_conversaciones_responsable_id
  ON public.conversaciones (responsable_id);

CREATE INDEX IF NOT EXISTS idx_conversaciones_estado
  ON public.conversaciones (estado);

-- Actualizar RPC obtener_o_crear_conversacion para asignar automáticamente responsable_id inicial
CREATE OR REPLACE FUNCTION public.obtener_o_crear_conversacion(p_alumno_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id UUID;
  v_profesor_id UUID;
BEGIN
  -- Validar autorización: el usuario debe ser el alumno, un profesor asignado o admin
  IF auth.uid() <> p_alumno_id
     AND NOT public.es_entrenador_de(p_alumno_id)
     AND NOT public.es_admin() THEN
    RAISE EXCEPTION 'No autorizado para acceder a la conversación de este alumno';
  END IF;

  SELECT id INTO v_conv_id
  FROM public.conversaciones
  WHERE alumno_id = p_alumno_id;

  IF v_conv_id IS NULL THEN
    SELECT profesor_asignado_id INTO v_profesor_id
    FROM public.perfiles
    WHERE id = p_alumno_id;

    INSERT INTO public.conversaciones (alumno_id, responsable_id)
    VALUES (p_alumno_id, v_profesor_id)
    ON CONFLICT (alumno_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_conv_id;
  END IF;

  RETURN v_conv_id;
END;
$$;

-- ============================================================================
-- 2. EXTENSIÓN TABLA: public.auditoria_cambios
-- Garantiza columna usuario_id (quién hizo el cambio) alineada con autorizado_por
-- ============================================================================

ALTER TABLE public.auditoria_cambios
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_auditoria_cambios_usuario_id
  ON public.auditoria_cambios (usuario_id);

-- Backfill de usuario_id desde autorizado_por si existían registros previos
UPDATE public.auditoria_cambios
SET usuario_id = autorizado_por
WHERE usuario_id IS NULL AND autorizado_por IS NOT NULL;

-- ============================================================================
-- 3. POLÍTICAS RLS EN CONVERSACIONES Y AUDITORÍA
-- ============================================================================

-- RLS: conversaciones (SELECT y UPDATE permiten al responsable_id explícito además de entrenador/admin)
DROP POLICY IF EXISTS "conversaciones_select_participantes" ON public.conversaciones;
CREATE POLICY "conversaciones_select_participantes"
  ON public.conversaciones
  FOR SELECT
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR responsable_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "conversaciones_update_participantes" ON public.conversaciones;
CREATE POLICY "conversaciones_update_participantes"
  ON public.conversaciones
  FOR UPDATE
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR responsable_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  )
  WITH CHECK (
    alumno_id = auth.uid()
    OR responsable_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

-- RLS: auditoria_cambios (lectura permitida a ADMIN y entrenadores sobre sus alumnos o cambios propios)
DROP POLICY IF EXISTS "auditoria_cambios_select_staff" ON public.auditoria_cambios;
CREATE POLICY "auditoria_cambios_select_staff"
  ON public.auditoria_cambios
  FOR SELECT
  TO authenticated
  USING (
    public.es_admin()
    OR (
      public.es_entrenador_o_admin()
      AND (
        (entidad = 'contrataciones' AND EXISTS (
          SELECT 1 FROM public.contrataciones c
          WHERE c.id = auditoria_cambios.entidad_id AND public.es_entrenador_de(c.alumno_id)
        ))
        OR (entidad = 'conversaciones' AND EXISTS (
          SELECT 1 FROM public.conversaciones conv
          WHERE conv.id = auditoria_cambios.entidad_id AND public.es_entrenador_de(conv.alumno_id)
        ))
        OR (entidad = 'planes_entrenamiento' AND EXISTS (
          SELECT 1 FROM public.planes_entrenamiento p
          WHERE p.id = auditoria_cambios.entidad_id AND (p.alumno_id IS NULL OR public.es_entrenador_de(p.alumno_id))
        ))
        OR (entidad = 'dias_rutina' AND EXISTS (
          SELECT 1 FROM public.dias_rutina d
          JOIN public.planes_entrenamiento p ON p.id = d.plan_id
          WHERE d.id = auditoria_cambios.entidad_id AND (p.alumno_id IS NULL OR public.es_entrenador_de(p.alumno_id))
        ))
        OR (entidad = 'ejercicios_en_rutina' AND EXISTS (
          SELECT 1 FROM public.ejercicios_en_rutina er
          JOIN public.dias_rutina d ON d.id = er.dia_id
          JOIN public.planes_entrenamiento p ON p.id = d.plan_id
          WHERE er.id = auditoria_cambios.entidad_id AND (p.alumno_id IS NULL OR public.es_entrenador_de(p.alumno_id))
        ))
        OR autorizado_por = auth.uid()
        OR usuario_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- 4. RPC: public.transferir_conversacion_gozs (ADR-004)
-- Valida permisos, actualiza responsable_id, vincula al nuevo profesor
-- en entrenador_alumnos de forma idempotente y registra auditoría
-- ============================================================================

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
  -- 1. Validar existencia de la conversación
  SELECT * INTO v_conversacion
  FROM public.conversaciones
  WHERE id = p_conversacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversación no encontrada con ID: %', p_conversacion_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 2. Validar que el ejecutor sea entrenador autorizado del alumno o ADMIN
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(v_conversacion.alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para transferir la conversación de este alumno'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Validar nuevo responsable (debe existir y tener rol ENTRENADOR o ADMIN)
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

  -- 4. El nuevo responsable no puede ser el mismo alumno de la conversación
  IF p_nuevo_responsable_id = v_conversacion.alumno_id THEN
    RAISE EXCEPTION 'El nuevo responsable no puede ser el alumno de la conversación'
      USING ERRCODE = '22023';
  END IF;

  -- 5. Actualizar responsable_id en conversaciones
  v_anterior_responsable_id := v_conversacion.responsable_id;

  UPDATE public.conversaciones
  SET responsable_id = p_nuevo_responsable_id,
      updated_at = now()
  WHERE id = p_conversacion_id
  RETURNING * INTO v_conversacion;

  -- 6. Insertar de forma idempotente en entrenador_alumnos (acceso RLS inmediato)
  INSERT INTO public.entrenador_alumnos (
    entrenador_id,
    alumno_id,
    rol_entrenador
  ) VALUES (
    p_nuevo_responsable_id,
    v_conversacion.alumno_id,
    'COACH'
  )
  ON CONFLICT (entrenador_id, alumno_id) DO NOTHING;

  -- 7. Registrar en auditoria_cambios
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

GRANT EXECUTE ON FUNCTION public.transferir_conversacion_gozs(UUID, UUID, TEXT)
  TO authenticated, service_role;

-- ============================================================================
-- 5. TRIGGERS DE AUDITORÍA DE CAMBIOS DE RUTINA (ADR-004)
-- Registra en public.auditoria_cambios quién hizo qué cambio y cuándo
-- en planes_entrenamiento, dias_rutina y ejercicios_en_rutina
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_auditar_cambio_rutina()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id UUID;
  v_entidad_id UUID;
  v_anteriores JSONB := NULL;
  v_nuevos JSONB := NULL;
BEGIN
  -- Identificar el usuario autenticado (si existe en perfiles)
  v_usuario_id := auth.uid();
  IF v_usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.perfiles WHERE id = v_usuario_id) THEN
    v_usuario_id := NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_entidad_id := NEW.id;
    v_nuevos := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_entidad_id := NEW.id;
    v_anteriores := to_jsonb(OLD);
    v_nuevos := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_entidad_id := OLD.id;
    v_anteriores := to_jsonb(OLD);
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
    TG_TABLE_NAME,
    v_entidad_id,
    TG_OP,
    NULL,
    v_usuario_id,
    v_usuario_id,
    v_anteriores,
    v_nuevos,
    now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_auditar_cambio_rutina()
  TO authenticated, service_role;

-- Triggers en las tres entidades del core de rutina
DROP TRIGGER IF EXISTS trg_auditoria_planes_entrenamiento ON public.planes_entrenamiento;
CREATE TRIGGER trg_auditoria_planes_entrenamiento
  AFTER INSERT OR UPDATE OR DELETE ON public.planes_entrenamiento
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_cambio_rutina();

DROP TRIGGER IF EXISTS trg_auditoria_dias_rutina ON public.dias_rutina;
CREATE TRIGGER trg_auditoria_dias_rutina
  AFTER INSERT OR UPDATE OR DELETE ON public.dias_rutina
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_cambio_rutina();

DROP TRIGGER IF EXISTS trg_auditoria_ejercicios_en_rutina ON public.ejercicios_en_rutina;
CREATE TRIGGER trg_auditoria_ejercicios_en_rutina
  AFTER INSERT OR UPDATE OR DELETE ON public.ejercicios_en_rutina
  FOR EACH ROW EXECUTE FUNCTION public.fn_auditar_cambio_rutina();

COMMIT;
