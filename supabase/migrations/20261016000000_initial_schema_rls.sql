-- ============================================================================
-- GOZSter: Esquema Relacional Inicial, Índices, RPCs y Políticas RLS
-- Migración idempotente para PostgreSQL 15+ / Supabase
-- ============================================================================

BEGIN;

-- Extensión para generación de UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TIPOS ENUMERADOS (IDEMPOTENTES)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rol_usuario') THEN
    CREATE TYPE public.rol_usuario AS ENUM ('ENTRENADOR', 'ALUMNO', 'ADMIN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_membresia') THEN
    CREATE TYPE public.estado_membresia AS ENUM ('ACTIVA', 'INACTIVA', 'PENDIENTE', 'BAJA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_plan') THEN
    CREATE TYPE public.estado_plan AS ENUM ('ACTIVO', 'INACTIVO', 'BORRADOR');
  END IF;
END
$$;

-- ============================================================================
-- 2. FUNCIÓN TRIGGER PARA SINCRONIZACIÓN OFFLINE (updated_at)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. JERARQUÍA RELACIONAL OBLIGATORIA
-- ============================================================================

-- 3.1 Tabla: perfiles
CREATE TABLE IF NOT EXISTS public.perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  nombre_completo TEXT NOT NULL,
  rol public.rol_usuario NOT NULL DEFAULT 'ALUMNO',
  estado_membresia public.estado_membresia NOT NULL DEFAULT 'ACTIVA',
  profesor_asignado_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  fecha_baja TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 Tabla: ejercicios (Catálogo Maestro)
CREATE TABLE IF NOT EXISTS public.ejercicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  comentario TEXT,
  url_video TEXT,
  musculos_principales TEXT[] NOT NULL DEFAULT '{}',
  musculos_secundarios TEXT[] NOT NULL DEFAULT '{}',
  creado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 Tabla: planes_entrenamiento (Plan / Template)
CREATE TABLE IF NOT EXISTS public.planes_entrenamiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_id UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  alumno_id UUID REFERENCES public.perfiles(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  estado public.estado_plan NOT NULL DEFAULT 'ACTIVO',
  comentarios TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.4 Tabla: dias_rutina
CREATE TABLE IF NOT EXISTS public.dias_rutina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.planes_entrenamiento(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  orden INTEGER NOT NULL CHECK (orden >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, orden)
);

-- 3.5 Tabla: ejercicios_en_rutina
CREATE TABLE IF NOT EXISTS public.ejercicios_en_rutina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dia_id UUID NOT NULL REFERENCES public.dias_rutina(id) ON DELETE CASCADE,
  ejercicio_id UUID NOT NULL REFERENCES public.ejercicios(id) ON DELETE RESTRICT,
  orden INTEGER NOT NULL CHECK (orden >= 1),
  series INTEGER NOT NULL CHECK (series >= 1),
  repeticiones TEXT NOT NULL,
  descanso_segundos INTEGER NOT NULL DEFAULT 90 CHECK (descanso_segundos >= 0),
  rpe_objetivo NUMERIC(3,1) CHECK (rpe_objetivo IS NULL OR (rpe_objetivo >= 1.0 AND rpe_objetivo <= 10.0)),
  notas TEXT,
  es_superserie BOOLEAN NOT NULL DEFAULT false,
  grupo_superserie INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_superserie_grupo CHECK (
    (es_superserie = false AND grupo_superserie IS NULL) OR
    (es_superserie = true AND grupo_superserie IS NOT NULL AND grupo_superserie >= 1)
  )
);

-- 3.6 Tabla: registro_sesiones
CREATE TABLE IF NOT EXISTS public.registro_sesiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  dia_id UUID REFERENCES public.dias_rutina(id) ON DELETE SET NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  duracion_minutos INTEGER CHECK (duracion_minutos IS NULL OR duracion_minutos >= 0),
  volumen_total_kg NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (volumen_total_kg >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.7 Tabla: registro_series
CREATE TABLE IF NOT EXISTS public.registro_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id UUID NOT NULL REFERENCES public.registro_sesiones(id) ON DELETE CASCADE,
  ejercicio_id UUID NOT NULL REFERENCES public.ejercicios(id) ON DELETE RESTRICT,
  numero_serie INTEGER NOT NULL CHECK (numero_serie >= 1),
  peso_kg NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (peso_kg >= 0),
  reps_hechas INTEGER NOT NULL DEFAULT 0 CHECK (reps_hechas >= 0),
  rpe_real NUMERIC(3,1) CHECK (rpe_real IS NULL OR (rpe_real >= 1.0 AND rpe_real <= 10.0)),
  completada BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sesion_id, ejercicio_id, numero_serie)
);

-- ============================================================================
-- 4. TRIGGERS DE MARCAS TEMPORALES (updated_at)
-- ============================================================================

DROP TRIGGER IF EXISTS trg_perfiles_updated_at ON public.perfiles;
CREATE TRIGGER trg_perfiles_updated_at
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_ejercicios_updated_at ON public.ejercicios;
CREATE TRIGGER trg_ejercicios_updated_at
  BEFORE UPDATE ON public.ejercicios
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_planes_entrenamiento_updated_at ON public.planes_entrenamiento;
CREATE TRIGGER trg_planes_entrenamiento_updated_at
  BEFORE UPDATE ON public.planes_entrenamiento
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_dias_rutina_updated_at ON public.dias_rutina;
CREATE TRIGGER trg_dias_rutina_updated_at
  BEFORE UPDATE ON public.dias_rutina
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_ejercicios_en_rutina_updated_at ON public.ejercicios_en_rutina;
CREATE TRIGGER trg_ejercicios_en_rutina_updated_at
  BEFORE UPDATE ON public.ejercicios_en_rutina
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_registro_sesiones_updated_at ON public.registro_sesiones;
CREATE TRIGGER trg_registro_sesiones_updated_at
  BEFORE UPDATE ON public.registro_sesiones
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_registro_series_updated_at ON public.registro_series;
CREATE TRIGGER trg_registro_series_updated_at
  BEFORE UPDATE ON public.registro_series
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 5. ÍNDICES PARA RETENCIÓN Y DELTA SYNC OFFLINE
-- ============================================================================

-- Índices para consultas de retención (cantActivas, cantSinPlanEntrenamiento, cantClientesPerdidosMes)
CREATE INDEX IF NOT EXISTS idx_perfiles_rol_membresia
  ON public.perfiles (rol, estado_membresia);

CREATE INDEX IF NOT EXISTS idx_perfiles_profesor_asignado
  ON public.perfiles (profesor_asignado_id)
  WHERE profesor_asignado_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_perfiles_fecha_baja
  ON public.perfiles (fecha_baja)
  WHERE fecha_baja IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_planes_alumno_estado
  ON public.planes_entrenamiento (alumno_id, estado);

CREATE INDEX IF NOT EXISTS idx_planes_profesor
  ON public.planes_entrenamiento (profesor_id);

-- Índices para navegación de rutinas y sesiones
CREATE INDEX IF NOT EXISTS idx_dias_rutina_plan_orden
  ON public.dias_rutina (plan_id, orden);

CREATE INDEX IF NOT EXISTS idx_ejercicios_rutina_dia_orden
  ON public.ejercicios_en_rutina (dia_id, orden);

CREATE INDEX IF NOT EXISTS idx_registro_sesiones_alumno_fecha
  ON public.registro_sesiones (alumno_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_registro_series_sesion_ejercicio
  ON public.registro_series (sesion_id, ejercicio_id);

-- Índices para sincronización offline (delta sync por updated_at)
CREATE INDEX IF NOT EXISTS idx_perfiles_updated_at
  ON public.perfiles (updated_at);

CREATE INDEX IF NOT EXISTS idx_ejercicios_updated_at
  ON public.ejercicios (updated_at);

CREATE INDEX IF NOT EXISTS idx_planes_updated_at
  ON public.planes_entrenamiento (updated_at);

CREATE INDEX IF NOT EXISTS idx_registro_sesiones_updated_at
  ON public.registro_sesiones (updated_at);

CREATE INDEX IF NOT EXISTS idx_registro_series_updated_at
  ON public.registro_series (updated_at);

-- ============================================================================
-- 6. FUNCIONES AUXILIARES DE SEGURIDAD Y RPCs DE NEGOCIO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles
    WHERE id = auth.uid()
      AND rol = 'ADMIN'
  );
$$;

CREATE OR REPLACE FUNCTION public.es_entrenador_o_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.perfiles
    WHERE id = auth.uid()
      AND rol IN ('ENTRENADOR', 'ADMIN')
  );
$$;

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
  );
$$;

-- RPC 1: Métricas de retención para Coach Studio (cantActivas, cantSinPlanEntrenamiento, cantClientesPerdidosMes)
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
  WHERE (p_profesor_id IS NULL OR p.profesor_asignado_id = p_profesor_id)
    AND public.es_entrenador_o_admin();
$$;

-- RPC 2: Cálculo de volumen semanal total (kg) de un alumno
CREATE OR REPLACE FUNCTION public.calcular_volumen_semanal(
  p_alumno_id UUID,
  p_fecha_inicio TIMESTAMPTZ DEFAULT date_trunc('week', now())
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(SUM(rs.peso_kg * rs.reps_hechas), 0)::NUMERIC(10,2)
  FROM public.registro_series rs
  INNER JOIN public.registro_sesiones s ON s.id = rs.sesion_id
  WHERE s.alumno_id = p_alumno_id
    AND rs.completada = true
    AND s.fecha >= p_fecha_inicio
    AND s.fecha < (p_fecha_inicio + INTERVAL '7 days')
    AND (
      auth.uid() = p_alumno_id
      OR public.es_entrenador_de(p_alumno_id)
      OR public.es_admin()
    );
$$;

-- RPC 3: Récords históricos y 1RM estimado (Epley y Brzycki) por ejercicio
CREATE OR REPLACE FUNCTION public.obtener_records_historicos(
  p_alumno_id UUID,
  p_ejercicio_id UUID DEFAULT NULL
)
RETURNS TABLE (
  ejercicio_id UUID,
  peso_max_kg NUMERIC,
  mejor_1rm_epley NUMERIC,
  mejor_1rm_brzycki NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    rs.ejercicio_id,
    MAX(rs.peso_kg)::NUMERIC(6,2) AS peso_max_kg,
    MAX(rs.peso_kg * (1.0 + (rs.reps_hechas::NUMERIC / 30.0)))::NUMERIC(6,2) AS mejor_1rm_epley,
    MAX(
      CASE
        WHEN rs.reps_hechas <= 1 THEN rs.peso_kg
        WHEN rs.reps_hechas >= 37 THEN rs.peso_kg
        ELSE rs.peso_kg / (1.0278 - (0.0278 * rs.reps_hechas::NUMERIC))
      END
    )::NUMERIC(6,2) AS mejor_1rm_brzycki
  FROM public.registro_series rs
  INNER JOIN public.registro_sesiones s ON s.id = rs.sesion_id
  WHERE s.alumno_id = p_alumno_id
    AND rs.completada = true
    AND rs.peso_kg > 0
    AND rs.reps_hechas > 0
    AND (p_ejercicio_id IS NULL OR rs.ejercicio_id = p_ejercicio_id)
    AND (
      auth.uid() = p_alumno_id
      OR public.es_entrenador_de(p_alumno_id)
      OR public.es_admin()
    )
  GROUP BY rs.ejercicio_id;
$$;

-- RPC 4: Detección de sobrecarga progresiva por ejercicio entre sesiones consecutivas
CREATE OR REPLACE FUNCTION public.detectar_sobrecarga_progresiva(
  p_alumno_id UUID,
  p_ejercicio_id UUID
)
RETURNS TABLE (
  sesion_id UUID,
  fecha TIMESTAMPTZ,
  volumen_ejercicio_kg NUMERIC,
  peso_max_kg NUMERIC,
  hubo_sobrecarga BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH metricas_sesion AS (
    SELECT
      s.id AS sesion_id,
      s.fecha,
      SUM(rs.peso_kg * rs.reps_hechas)::NUMERIC(10,2) AS volumen_ejercicio_kg,
      MAX(rs.peso_kg)::NUMERIC(6,2) AS peso_max_kg
    FROM public.registro_series rs
    INNER JOIN public.registro_sesiones s ON s.id = rs.sesion_id
    WHERE s.alumno_id = p_alumno_id
      AND rs.ejercicio_id = p_ejercicio_id
      AND rs.completada = true
      AND (
        auth.uid() = p_alumno_id
        OR public.es_entrenador_de(p_alumno_id)
        OR public.es_admin()
      )
    GROUP BY s.id, s.fecha
  ),
  comparativa AS (
    SELECT
      ms.sesion_id,
      ms.fecha,
      ms.volumen_ejercicio_kg,
      ms.peso_max_kg,
      LAG(ms.volumen_ejercicio_kg) OVER (ORDER BY ms.fecha ASC) AS volumen_previo_kg,
      LAG(ms.peso_max_kg) OVER (ORDER BY ms.fecha ASC) AS peso_previo_kg
    FROM metricas_sesion ms
  )
  SELECT
    c.sesion_id,
    c.fecha,
    c.volumen_ejercicio_kg,
    c.peso_max_kg,
    CASE
      WHEN c.volumen_previo_kg IS NULL THEN false
      WHEN c.peso_max_kg > c.peso_previo_kg OR c.volumen_ejercicio_kg > c.volumen_previo_kg THEN true
      ELSE false
    END AS hubo_sobrecarga
  FROM comparativa c
  ORDER BY c.fecha DESC;
$$;

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS) ESTRICTO EN TODAS LAS TABLAS
-- ============================================================================

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ejercicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planes_entrenamiento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dias_rutina ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ejercicios_en_rutina ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_series ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 7.1 Políticas RLS: perfiles
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "perfiles_select_propio_o_entrenador" ON public.perfiles;
CREATE POLICY "perfiles_select_propio_o_entrenador"
  ON public.perfiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR profesor_asignado_id = auth.uid()
    OR public.es_entrenador_de(id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "perfiles_insert_propio_o_admin" ON public.perfiles;
CREATE POLICY "perfiles_insert_propio_o_admin"
  ON public.perfiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = id
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "perfiles_update_propio_o_entrenador" ON public.perfiles;
CREATE POLICY "perfiles_update_propio_o_entrenador"
  ON public.perfiles
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = id
    OR (profesor_asignado_id = auth.uid() AND public.es_entrenador_o_admin())
    OR public.es_admin()
  )
  WITH CHECK (
    auth.uid() = id
    OR (profesor_asignado_id = auth.uid() AND public.es_entrenador_o_admin())
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "perfiles_delete_solo_admin" ON public.perfiles;
CREATE POLICY "perfiles_delete_solo_admin"
  ON public.perfiles
  FOR DELETE
  TO authenticated
  USING (public.es_admin());

-- ----------------------------------------------------------------------------
-- 7.2 Políticas RLS: ejercicios (Catálogo Maestro)
-- Lectura autenticada; creación/edición/borrado exclusivo de entrenadores/admin
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "ejercicios_select_autenticados" ON public.ejercicios;
CREATE POLICY "ejercicios_select_autenticados"
  ON public.ejercicios
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "ejercicios_insert_entrenador_o_admin" ON public.ejercicios;
CREATE POLICY "ejercicios_insert_entrenador_o_admin"
  ON public.ejercicios
  FOR INSERT
  TO authenticated
  WITH CHECK (public.es_entrenador_o_admin());

DROP POLICY IF EXISTS "ejercicios_update_entrenador_o_admin" ON public.ejercicios;
CREATE POLICY "ejercicios_update_entrenador_o_admin"
  ON public.ejercicios
  FOR UPDATE
  TO authenticated
  USING (public.es_entrenador_o_admin())
  WITH CHECK (public.es_entrenador_o_admin());

DROP POLICY IF EXISTS "ejercicios_delete_entrenador_o_admin" ON public.ejercicios;
CREATE POLICY "ejercicios_delete_entrenador_o_admin"
  ON public.ejercicios
  FOR DELETE
  TO authenticated
  USING (public.es_entrenador_o_admin());

-- ----------------------------------------------------------------------------
-- 7.3 Políticas RLS: planes_entrenamiento
-- Alumnos leen sus planes asignados; entrenadores gestionan plantillas y planes de sus alumnos
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "planes_select_alumno_o_entrenador" ON public.planes_entrenamiento;
CREATE POLICY "planes_select_alumno_o_entrenador"
  ON public.planes_entrenamiento
  FOR SELECT
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR profesor_id = auth.uid()
    OR (alumno_id IS NULL AND public.es_entrenador_o_admin())
    OR (alumno_id IS NOT NULL AND public.es_entrenador_de(alumno_id))
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "planes_insert_entrenador_o_admin" ON public.planes_entrenamiento;
CREATE POLICY "planes_insert_entrenador_o_admin"
  ON public.planes_entrenamiento
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.es_entrenador_o_admin()
    AND (
      profesor_id = auth.uid()
      OR public.es_admin()
    )
    AND (
      alumno_id IS NULL
      OR public.es_entrenador_de(alumno_id)
      OR profesor_id = auth.uid()
      OR public.es_admin()
    )
  );

DROP POLICY IF EXISTS "planes_update_entrenador_o_admin" ON public.planes_entrenamiento;
CREATE POLICY "planes_update_entrenador_o_admin"
  ON public.planes_entrenamiento
  FOR UPDATE
  TO authenticated
  USING (
    public.es_entrenador_o_admin()
    AND (
      profesor_id = auth.uid()
      OR (alumno_id IS NOT NULL AND public.es_entrenador_de(alumno_id))
      OR public.es_admin()
    )
  )
  WITH CHECK (
    public.es_entrenador_o_admin()
    AND (
      profesor_id = auth.uid()
      OR (alumno_id IS NOT NULL AND public.es_entrenador_de(alumno_id))
      OR public.es_admin()
    )
  );

DROP POLICY IF EXISTS "planes_delete_entrenador_o_admin" ON public.planes_entrenamiento;
CREATE POLICY "planes_delete_entrenador_o_admin"
  ON public.planes_entrenamiento
  FOR DELETE
  TO authenticated
  USING (
    public.es_entrenador_o_admin()
    AND (
      profesor_id = auth.uid()
      OR public.es_admin()
    )
  );

-- ----------------------------------------------------------------------------
-- 7.4 Políticas RLS: dias_rutina
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "dias_rutina_select_acceso_plan" ON public.dias_rutina;
CREATE POLICY "dias_rutina_select_acceso_plan"
  ON public.dias_rutina
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.planes_entrenamiento p
      WHERE p.id = dias_rutina.plan_id
        AND (
          p.alumno_id = auth.uid()
          OR p.profesor_id = auth.uid()
          OR (p.alumno_id IS NULL AND public.es_entrenador_o_admin())
          OR (p.alumno_id IS NOT NULL AND public.es_entrenador_de(p.alumno_id))
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "dias_rutina_insert_entrenador" ON public.dias_rutina;
CREATE POLICY "dias_rutina_insert_entrenador"
  ON public.dias_rutina
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.es_entrenador_o_admin()
    AND EXISTS (
      SELECT 1
      FROM public.planes_entrenamiento p
      WHERE p.id = dias_rutina.plan_id
        AND (
          p.profesor_id = auth.uid()
          OR (p.alumno_id IS NOT NULL AND public.es_entrenador_de(p.alumno_id))
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "dias_rutina_update_entrenador" ON public.dias_rutina;
CREATE POLICY "dias_rutina_update_entrenador"
  ON public.dias_rutina
  FOR UPDATE
  TO authenticated
  USING (
    public.es_entrenador_o_admin()
    AND EXISTS (
      SELECT 1
      FROM public.planes_entrenamiento p
      WHERE p.id = dias_rutina.plan_id
        AND (
          p.profesor_id = auth.uid()
          OR (p.alumno_id IS NOT NULL AND public.es_entrenador_de(p.alumno_id))
          OR public.es_admin()
        )
    )
  )
  WITH CHECK (
    public.es_entrenador_o_admin()
    AND EXISTS (
      SELECT 1
      FROM public.planes_entrenamiento p
      WHERE p.id = dias_rutina.plan_id
        AND (
          p.profesor_id = auth.uid()
          OR (p.alumno_id IS NOT NULL AND public.es_entrenador_de(p.alumno_id))
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "dias_rutina_delete_entrenador" ON public.dias_rutina;
CREATE POLICY "dias_rutina_delete_entrenador"
  ON public.dias_rutina
  FOR DELETE
  TO authenticated
  USING (
    public.es_entrenador_o_admin()
    AND EXISTS (
      SELECT 1
      FROM public.planes_entrenamiento p
      WHERE p.id = dias_rutina.plan_id
        AND (
          p.profesor_id = auth.uid()
          OR public.es_admin()
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 7.5 Políticas RLS: ejercicios_en_rutina
-- ----------------------------------------------------------------------------

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
          p.alumno_id = auth.uid()
          OR p.profesor_id = auth.uid()
          OR (p.alumno_id IS NULL AND public.es_entrenador_o_admin())
          OR (p.alumno_id IS NOT NULL AND public.es_entrenador_de(p.alumno_id))
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "ejercicios_en_rutina_insert_entrenador" ON public.ejercicios_en_rutina;
CREATE POLICY "ejercicios_en_rutina_insert_entrenador"
  ON public.ejercicios_en_rutina
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.es_entrenador_o_admin()
    AND EXISTS (
      SELECT 1
      FROM public.dias_rutina d
      INNER JOIN public.planes_entrenamiento p ON p.id = d.plan_id
      WHERE d.id = ejercicios_en_rutina.dia_id
        AND (
          p.profesor_id = auth.uid()
          OR (p.alumno_id IS NOT NULL AND public.es_entrenador_de(p.alumno_id))
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "ejercicios_en_rutina_update_entrenador" ON public.ejercicios_en_rutina;
CREATE POLICY "ejercicios_en_rutina_update_entrenador"
  ON public.ejercicios_en_rutina
  FOR UPDATE
  TO authenticated
  USING (
    public.es_entrenador_o_admin()
    AND EXISTS (
      SELECT 1
      FROM public.dias_rutina d
      INNER JOIN public.planes_entrenamiento p ON p.id = d.plan_id
      WHERE d.id = ejercicios_en_rutina.dia_id
        AND (
          p.profesor_id = auth.uid()
          OR (p.alumno_id IS NOT NULL AND public.es_entrenador_de(p.alumno_id))
          OR public.es_admin()
        )
    )
  )
  WITH CHECK (
    public.es_entrenador_o_admin()
    AND EXISTS (
      SELECT 1
      FROM public.dias_rutina d
      INNER JOIN public.planes_entrenamiento p ON p.id = d.plan_id
      WHERE d.id = ejercicios_en_rutina.dia_id
        AND (
          p.profesor_id = auth.uid()
          OR (p.alumno_id IS NOT NULL AND public.es_entrenador_de(p.alumno_id))
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "ejercicios_en_rutina_delete_entrenador" ON public.ejercicios_en_rutina;
CREATE POLICY "ejercicios_en_rutina_delete_entrenador"
  ON public.ejercicios_en_rutina
  FOR DELETE
  TO authenticated
  USING (
    public.es_entrenador_o_admin()
    AND EXISTS (
      SELECT 1
      FROM public.dias_rutina d
      INNER JOIN public.planes_entrenamiento p ON p.id = d.plan_id
      WHERE d.id = ejercicios_en_rutina.dia_id
        AND (
          p.profesor_id = auth.uid()
          OR public.es_admin()
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 7.6 Políticas RLS: registro_sesiones
-- Alumnos solo leen/escriben sus propios registros; entrenadores leen los de sus alumnos
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "registro_sesiones_select_alumno_o_entrenador" ON public.registro_sesiones;
CREATE POLICY "registro_sesiones_select_alumno_o_entrenador"
  ON public.registro_sesiones
  FOR SELECT
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "registro_sesiones_insert_propio_alumno" ON public.registro_sesiones;
CREATE POLICY "registro_sesiones_insert_propio_alumno"
  ON public.registro_sesiones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    alumno_id = auth.uid()
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "registro_sesiones_update_propio_alumno" ON public.registro_sesiones;
CREATE POLICY "registro_sesiones_update_propio_alumno"
  ON public.registro_sesiones
  FOR UPDATE
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_admin()
  )
  WITH CHECK (
    alumno_id = auth.uid()
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "registro_sesiones_delete_propio_alumno" ON public.registro_sesiones;
CREATE POLICY "registro_sesiones_delete_propio_alumno"
  ON public.registro_sesiones
  FOR DELETE
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_admin()
  );

-- ----------------------------------------------------------------------------
-- 7.7 Políticas RLS: registro_series
-- Alumnos solo leen/escriben sus propias series; entrenadores leen las de sus alumnos
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "registro_series_select_alumno_o_entrenador" ON public.registro_series;
CREATE POLICY "registro_series_select_alumno_o_entrenador"
  ON public.registro_series
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.registro_sesiones s
      WHERE s.id = registro_series.sesion_id
        AND (
          s.alumno_id = auth.uid()
          OR public.es_entrenador_de(s.alumno_id)
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "registro_series_insert_propio_alumno" ON public.registro_series;
CREATE POLICY "registro_series_insert_propio_alumno"
  ON public.registro_series
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.registro_sesiones s
      WHERE s.id = registro_series.sesion_id
        AND (
          s.alumno_id = auth.uid()
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "registro_series_update_propio_alumno" ON public.registro_series;
CREATE POLICY "registro_series_update_propio_alumno"
  ON public.registro_series
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.registro_sesiones s
      WHERE s.id = registro_series.sesion_id
        AND (
          s.alumno_id = auth.uid()
          OR public.es_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.registro_sesiones s
      WHERE s.id = registro_series.sesion_id
        AND (
          s.alumno_id = auth.uid()
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "registro_series_delete_propio_alumno" ON public.registro_series;
CREATE POLICY "registro_series_delete_propio_alumno"
  ON public.registro_series
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.registro_sesiones s
      WHERE s.id = registro_series.sesion_id
        AND (
          s.alumno_id = auth.uid()
          OR public.es_admin()
        )
    )
  );

COMMIT;
