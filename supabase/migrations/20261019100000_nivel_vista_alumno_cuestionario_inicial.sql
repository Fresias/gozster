-- Migration: 20261019100000_nivel_vista_alumno_cuestionario_inicial.sql
-- Issue #65 / ADR-004:
-- 1. Flag nivel_vista_alumno ('SIMPLE' | 'TECNICA') en public.perfiles con default 'SIMPLE'.
-- 2. fn_proteger_campos_perfil() restringiendo la modificación de nivel_vista_alumno al
--    entrenador asignado o ADMIN (el alumno no puede alterar su propio nivel_vista_alumno).
-- 3. Tabla public.alumno_cuestionario_inicial (onboarding opcional / única vez) con RLS estricto.
-- 4. Actualización de restaurar_filas_respaldo() para incluir alumno_cuestionario_inicial.

BEGIN;

-- ============================================================================
-- 1. COLUMNA nivel_vista_alumno EN public.perfiles
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'perfiles'
      AND column_name = 'nivel_vista_alumno'
  ) THEN
    ALTER TABLE public.perfiles
      ADD COLUMN nivel_vista_alumno TEXT NOT NULL DEFAULT 'SIMPLE'
      CONSTRAINT chk_perfiles_nivel_vista_alumno CHECK (nivel_vista_alumno IN ('SIMPLE', 'TECNICA'));
  END IF;
END $$;

-- Índice para consultas filtradas por vista de alumno si fuera necesario
CREATE INDEX IF NOT EXISTS idx_perfiles_nivel_vista_alumno
  ON public.perfiles (nivel_vista_alumno);

-- ============================================================================
-- 2. TRIGGER FUNCTION: fn_proteger_campos_perfil()
-- ============================================================================
-- Protege nivel_vista_alumno sumándose a membresía, cuenta, profesor_asignado y baja:
-- Solo puede ser modificado por el entrenador asignado o ADMIN. El alumno no puede cambiarlo.

CREATE OR REPLACE FUNCTION public.fn_proteger_campos_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.es_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.rol <> 'ALUMNO' THEN
      RAISE EXCEPTION 'Solo un administrador puede crear perfiles con rol %', NEW.rol
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el rol de un perfil'
      USING ERRCODE = '42501';
  END IF;

  -- Permitir si viene del trigger de cambio de contraseña en auth.users
  IF current_setting('gozster.limpiando_password', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.estado_membresia IS DISTINCT FROM OLD.estado_membresia
    OR NEW.estado_cuenta IS DISTINCT FROM OLD.estado_cuenta
    OR NEW.profesor_asignado_id IS DISTINCT FROM OLD.profesor_asignado_id
    OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja
    OR NEW.nivel_vista_alumno IS DISTINCT FROM OLD.nivel_vista_alumno
  ) AND NOT (
    OLD.id <> auth.uid()
    AND public.es_entrenador_o_admin()
    AND (OLD.profesor_asignado_id = auth.uid() OR public.es_entrenador_de(OLD.id))
  ) THEN
    RAISE EXCEPTION 'Solo el entrenador asignado puede modificar cuenta, membresía, baja, asignación o nivel de vista del alumno'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.debe_cambiar_password IS DISTINCT FROM OLD.debe_cambiar_password THEN
    -- El propio usuario apagando la bandera en su perfil tras cambiar clave
    IF OLD.id = auth.uid() AND OLD.debe_cambiar_password = true AND NEW.debe_cambiar_password = false THEN
      RETURN NEW;
    END IF;

    -- Entrenador o admin gestionando al alumno
    IF OLD.id <> auth.uid()
       AND public.es_entrenador_o_admin()
       AND (OLD.profesor_asignado_id = auth.uid() OR public.es_entrenador_de(OLD.id)) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'No tenés permisos para modificar el estado de cambio de contraseña'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. TABLA: public.alumno_cuestionario_inicial
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alumno_cuestionario_inicial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID UNIQUE NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  objetivo_principal TEXT,
  experiencia_previa TEXT,
  dias_disponibles_semana INT,
  molestias_o_lesiones_previas TEXT,
  equipamiento_disponible TEXT,
  respuestas_extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  completado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para updated_at (delta sync)
DROP TRIGGER IF EXISTS trg_alumno_cuestionario_inicial_updated_at ON public.alumno_cuestionario_inicial;
CREATE TRIGGER trg_alumno_cuestionario_inicial_updated_at
  BEFORE UPDATE ON public.alumno_cuestionario_inicial
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Índices de consulta frecuente y sincronización
CREATE INDEX IF NOT EXISTS idx_alumno_cuestionario_inicial_alumno_id
  ON public.alumno_cuestionario_inicial (alumno_id);

CREATE INDEX IF NOT EXISTS idx_alumno_cuestionario_inicial_updated_at
  ON public.alumno_cuestionario_inicial (updated_at);

-- ============================================================================
-- 4. POLÍTICAS RLS: public.alumno_cuestionario_inicial
-- ============================================================================

ALTER TABLE public.alumno_cuestionario_inicial ENABLE ROW LEVEL SECURITY;

-- SELECT: el propio alumno, su entrenador asignado o admin
DROP POLICY IF EXISTS "alumno_cuestionario_inicial_select" ON public.alumno_cuestionario_inicial;
CREATE POLICY "alumno_cuestionario_inicial_select"
  ON public.alumno_cuestionario_inicial
  FOR SELECT
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

-- INSERT: el propio alumno o admin
DROP POLICY IF EXISTS "alumno_cuestionario_inicial_insert" ON public.alumno_cuestionario_inicial;
CREATE POLICY "alumno_cuestionario_inicial_insert"
  ON public.alumno_cuestionario_inicial
  FOR INSERT
  TO authenticated
  WITH CHECK (
    alumno_id = auth.uid()
    OR public.es_admin()
  );

-- UPDATE: el propio alumno o admin
DROP POLICY IF EXISTS "alumno_cuestionario_inicial_update" ON public.alumno_cuestionario_inicial;
CREATE POLICY "alumno_cuestionario_inicial_update"
  ON public.alumno_cuestionario_inicial
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

-- DELETE: solo admin (o borrado en cascada vía perfiles)
DROP POLICY IF EXISTS "alumno_cuestionario_inicial_delete" ON public.alumno_cuestionario_inicial;
CREATE POLICY "alumno_cuestionario_inicial_delete"
  ON public.alumno_cuestionario_inicial
  FOR DELETE
  TO authenticated
  USING (
    public.es_admin()
  );

-- ============================================================================
-- 5. RPC: restaurar_filas_respaldo() (Actualización de Whitelist)
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
    'perfiles', 'ejercicios', 'entrenador_alumnos', 'planes_entrenamiento', 'dias_rutina',
    'ejercicios_en_rutina', 'registro_sesiones', 'registro_series', 'conversaciones',
    'mensajes', 'habitos_registros', 'nutricion_registros', 'alertas_entrenador',
    'alumno_historial_dolor', 'contrataciones', 'pagos', 'auditoria_cambios',
    'alumno_cuestionario_inicial', 'sustituciones_ejercicios'
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
