-- ============================================================================
-- GOZSter: Soporte Multi-Coach, Ciclo de Vida de Suscripción y Clonación de Rutinas
-- Migración idempotente para PostgreSQL 15+ / Supabase
-- GitHub Issue: #9 (GOZS-6)
-- ============================================================================

-- 1. Ampliación de estados de membresía (Ciclo de Vida del Alumno)
-- Mantiene retrocompatibilidad agregando ACTIVE, EXPIRED_PAYMENT_PENDING y ARCHIVED.
ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS 'ACTIVE';
ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS 'EXPIRED_PAYMENT_PENDING';
ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS 'ARCHIVED';

BEGIN;

-- ============================================================================
-- 2. MODIFICACIONES EN TABLA: planes_entrenamiento (Vigencia de Plan)
-- ============================================================================

ALTER TABLE public.planes_entrenamiento
  ADD COLUMN IF NOT EXISTS fecha_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS fecha_fin TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_planes_fecha_fin
  ON public.planes_entrenamiento (fecha_fin);

-- ============================================================================
-- 3. TABLA: entrenador_alumnos (Soporte Multi-Coach N:M)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.entrenador_alumnos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrenador_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  rol_entrenador TEXT NOT NULL DEFAULT 'COACH', -- 'PRINCIPAL', 'ASISTENTE', 'COACH'
  es_principal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_entrenador_distinto_alumno CHECK (entrenador_id <> alumno_id),
  CONSTRAINT uq_entrenador_alumno UNIQUE (entrenador_id, alumno_id)
);

-- Trigger para updated_at (delta sync)
DROP TRIGGER IF EXISTS trg_entrenador_alumnos_updated_at ON public.entrenador_alumnos;
CREATE TRIGGER trg_entrenador_alumnos_updated_at
  BEFORE UPDATE ON public.entrenador_alumnos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Índices de consulta rápida y sincronización offline
CREATE INDEX IF NOT EXISTS idx_entrenador_alumnos_entrenador
  ON public.entrenador_alumnos (entrenador_id);

CREATE INDEX IF NOT EXISTS idx_entrenador_alumnos_alumno
  ON public.entrenador_alumnos (alumno_id);

CREATE INDEX IF NOT EXISTS idx_entrenador_alumnos_updated_at
  ON public.entrenador_alumnos (updated_at);

-- ============================================================================
-- 4. ACTUALIZACIÓN DE FUNCIONES DE SEGURIDAD (MULTI-COACH)
-- ============================================================================

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
      AND profesor_asignado_id = auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM public.planes_entrenamiento
    WHERE alumno_id = p_alumno_id
      AND profesor_id = auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM public.entrenador_alumnos
    WHERE alumno_id = p_alumno_id
      AND entrenador_id = auth.uid()
  );
$$;

-- ============================================================================
-- 5. ROW LEVEL SECURITY EN: entrenador_alumnos
-- ============================================================================

ALTER TABLE public.entrenador_alumnos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entrenador_alumnos_select_participantes" ON public.entrenador_alumnos;
CREATE POLICY "entrenador_alumnos_select_participantes"
  ON public.entrenador_alumnos
  FOR SELECT
  TO authenticated
  USING (
    entrenador_id = auth.uid()
    OR alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "entrenador_alumnos_insert_entrenador_o_admin" ON public.entrenador_alumnos;
CREATE POLICY "entrenador_alumnos_insert_entrenador_o_admin"
  ON public.entrenador_alumnos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.es_admin()
    OR (
      public.es_entrenador_o_admin()
      AND (
        entrenador_id = auth.uid()
        OR public.es_entrenador_de(alumno_id)
      )
    )
  );

DROP POLICY IF EXISTS "entrenador_alumnos_update_entrenador_o_admin" ON public.entrenador_alumnos;
CREATE POLICY "entrenador_alumnos_update_entrenador_o_admin"
  ON public.entrenador_alumnos
  FOR UPDATE
  TO authenticated
  USING (
    public.es_admin()
    OR entrenador_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
  )
  WITH CHECK (
    public.es_admin()
    OR entrenador_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
  );

DROP POLICY IF EXISTS "entrenador_alumnos_delete_entrenador_o_admin" ON public.entrenador_alumnos;
CREATE POLICY "entrenador_alumnos_delete_entrenador_o_admin"
  ON public.entrenador_alumnos
  FOR DELETE
  TO authenticated
  USING (
    public.es_admin()
    OR entrenador_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
  );

-- ============================================================================
-- 6. ACTUALIZACIÓN DE RLS: perfiles (MULTI-COACH UPDATE)
-- ============================================================================

DROP POLICY IF EXISTS "perfiles_update_propio_o_entrenador" ON public.perfiles;
CREATE POLICY "perfiles_update_propio_o_entrenador"
  ON public.perfiles
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR (profesor_asignado_id = auth.uid() AND public.es_entrenador_o_admin())
    OR (public.es_entrenador_de(id) AND public.es_entrenador_o_admin())
    OR public.es_admin()
  )
  WITH CHECK (
    auth.uid() = id
    OR (profesor_asignado_id = auth.uid() AND public.es_entrenador_o_admin())
    OR (public.es_entrenador_de(id) AND public.es_entrenador_o_admin())
    OR public.es_admin()
  );

-- ============================================================================
-- 7. ACTUALIZACIÓN DE RLS: ejercicios_en_rutina (PAYWALL DE CUOTA VENCIDA)
-- Alumno con 'EXPIRED_PAYMENT_PENDING' no puede leer ejercicios del día.
-- Los entrenadores asignados mantienen visibilidad completa en todo momento.
-- ============================================================================

DROP POLICY IF EXISTS "ejercicios_en_rutina_select_acceso_plan" ON public.ejercicios_en_rutina;
CREATE POLICY "ejercicios_en_rutina_select_acceso_plan"
  ON public.ejercicios_en_rutina
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.dias_rutina d
      INNER JOIN public.planes_entrenamiento p ON p.id = d.plan_id
      WHERE d.id = ejercicios_en_rutina.dia_id
        AND (
          -- Condición para alumno: sólo puede leer si NO está en mora / pago pendiente
          (
            p.alumno_id = auth.uid()
            AND NOT EXISTS (
              SELECT 1
              FROM public.perfiles perf
              WHERE perf.id = auth.uid()
                AND perf.estado_membresia = 'EXPIRED_PAYMENT_PENDING'
            )
          )
          -- Entrenadores y administradores: acceso total e ininterrumpido
          OR p.profesor_id = auth.uid()
          OR (p.alumno_id IS NULL AND public.es_entrenador_o_admin())
          OR (p.alumno_id IS NOT NULL AND public.es_entrenador_de(p.alumno_id))
          OR public.es_admin()
        )
    )
  );

-- ============================================================================
-- 8. RPC: clonar_plan_entrenamiento
-- Duplica íntegramente la jerarquía:
--   planes_entrenamiento -> dias_rutina -> ejercicios_en_rutina
-- Respetando es_superserie y grupo_superserie en estado 'BORRADOR'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clonar_plan_entrenamiento(
  p_plan_id UUID,
  p_nuevo_nombre TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_origen public.planes_entrenamiento%ROWTYPE;
  v_nuevo_plan_id UUID;
  v_nuevo_dia_id UUID;
  v_nombre_final TEXT;
  r_dia RECORD;
BEGIN
  -- Validar existencia del plan origen
  SELECT * INTO v_plan_origen
  FROM public.planes_entrenamiento
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan de entrenamiento no encontrado con ID: %', p_plan_id;
  END IF;

  -- Validar permisos de seguridad: entrenador del alumno, creador del plan o admin
  IF NOT (
    public.es_admin()
    OR v_plan_origen.profesor_id = auth.uid()
    OR (v_plan_origen.alumno_id IS NOT NULL AND public.es_entrenador_de(v_plan_origen.alumno_id))
    OR (v_plan_origen.alumno_id IS NULL AND public.es_entrenador_o_admin())
  ) THEN
    RAISE EXCEPTION 'No autorizado para clonar este plan de entrenamiento';
  END IF;

  -- Definir nombre del nuevo plan
  v_nombre_final := COALESCE(NULLIF(TRIM(p_nuevo_nombre), ''), v_plan_origen.nombre || ' (Copia)');

  -- Insertar plan clonado en estado 'BORRADOR'
  INSERT INTO public.planes_entrenamiento (
    profesor_id,
    alumno_id,
    nombre,
    estado,
    comentarios,
    fecha_inicio,
    fecha_fin
  )
  VALUES (
    COALESCE(auth.uid(), v_plan_origen.profesor_id),
    v_plan_origen.alumno_id,
    v_nombre_final,
    'BORRADOR', -- Estado BORRADOR obligatorio para nuevo período
    v_plan_origen.comentarios,
    now(),
    NULL
  )
  RETURNING id INTO v_nuevo_plan_id;

  -- Duplicar días de rutina ordenados
  FOR r_dia IN
    SELECT id, nombre, orden
    FROM public.dias_rutina
    WHERE plan_id = p_plan_id
    ORDER BY orden ASC
  LOOP
    INSERT INTO public.dias_rutina (
      plan_id,
      nombre,
      orden
    )
    VALUES (
      v_nuevo_plan_id,
      r_dia.nombre,
      r_dia.orden
    )
    RETURNING id INTO v_nuevo_dia_id;

    -- Duplicar ejercicios preservando superseries, orden y prescripción completa
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
      grupo_superserie
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
      e.grupo_superserie
    FROM public.ejercicios_en_rutina e
    WHERE e.dia_id = r_dia.id
    ORDER BY e.orden ASC;
  END LOOP;

  RETURN v_nuevo_plan_id;
END;
$$;

-- ============================================================================
-- 9. RPC: extender_vigencia_plan
-- Prolonga la vigencia del plan en N días sin duplicar entidades.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.extender_vigencia_plan(
  p_plan_id UUID,
  p_dias_adicionales INT
)
RETURNS public.planes_entrenamiento
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan public.planes_entrenamiento%ROWTYPE;
BEGIN
  IF p_dias_adicionales IS NULL OR p_dias_adicionales <= 0 THEN
    RAISE EXCEPTION 'El número de días adicionales debe ser mayor a 0';
  END IF;

  SELECT * INTO v_plan
  FROM public.planes_entrenamiento
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan de entrenamiento no encontrado con ID: %', p_plan_id;
  END IF;

  IF NOT (
    public.es_admin()
    OR v_plan.profesor_id = auth.uid()
    OR (v_plan.alumno_id IS NOT NULL AND public.es_entrenador_de(v_plan.alumno_id))
    OR (v_plan.alumno_id IS NULL AND public.es_entrenador_o_admin())
  ) THEN
    RAISE EXCEPTION 'No autorizado para extender la vigencia de este plan';
  END IF;

  UPDATE public.planes_entrenamiento
  SET
    fecha_fin = GREATEST(COALESCE(fecha_fin, now()), now()) + (p_dias_adicionales || ' days')::INTERVAL,
    estado = 'ACTIVO',
    updated_at = now()
  WHERE id = p_plan_id
  RETURNING * INTO v_plan;

  RETURN v_plan;
END;
$$;

-- ============================================================================
-- 10. ACTUALIZACIÓN DE RPC: obtener_metricas_retencion (Multi-Coach & Estados)
-- ============================================================================

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
        AND p.estado_membresia IN ('ACTIVA', 'ACTIVE')
    ) AS "cantActivas",
    COUNT(*) FILTER (
      WHERE p.rol = 'ALUMNO'
        AND p.estado_membresia IN ('ACTIVA', 'ACTIVE')
        AND NOT EXISTS (
          SELECT 1
          FROM public.planes_entrenamiento pe
          WHERE pe.alumno_id = p.id
            AND pe.estado = 'ACTIVO'
        )
    ) AS "cantSinPlanEntrenamiento",
    COUNT(*) FILTER (
      WHERE p.rol = 'ALUMNO'
        AND p.estado_membresia IN ('INACTIVA', 'BAJA', 'ARCHIVED')
        AND p.fecha_baja >= date_trunc('month', now())
    ) AS "cantClientesPerdidosMes"
  FROM public.perfiles p
  WHERE (
    p_profesor_id IS NULL
    OR p.profesor_asignado_id = p_profesor_id
    OR EXISTS (
      SELECT 1 FROM public.entrenador_alumnos ea
      WHERE ea.alumno_id = p.id AND ea.entrenador_id = p_profesor_id
    )
  )
  AND (
    public.es_admin()
    OR p_profesor_id = auth.uid()
    OR public.es_entrenador_o_admin()
  );
$$;

COMMIT;
