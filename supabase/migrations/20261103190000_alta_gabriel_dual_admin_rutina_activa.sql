-- ============================================================================
-- GOZSter: Configurar 94.gabriel.sanchez@gmail.com como ADMIN con rutina activa
-- principal ("GABI AGOSTO") y ds.gabriel.sanchez@gmail.com como ADMIN auxiliar.
-- Migración idempotente para PostgreSQL 15+ / Supabase.
-- GitHub Issue: #339 (GOZS-339)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. PROVISIONAR / ACTUALIZAR PERFILES ADMIN
-- 94.gabriel.sanchez@gmail.com: ADMIN principal, titular de la rutina activa "GABI AGOSTO"
-- ds.gabriel.sanchez@gmail.com: ADMIN auxiliar de gestión y contingencias
-- ============================================================================

DO $$
DECLARE
  v_uid_principal UUID;
  v_uid_auxiliar UUID;
BEGIN
  -- Buscar IDs en auth.users si existen
  SELECT id INTO v_uid_principal FROM auth.users WHERE lower(email) = '94.gabriel.sanchez@gmail.com';
  SELECT id INTO v_uid_auxiliar FROM auth.users WHERE lower(email) = 'ds.gabriel.sanchez@gmail.com';

  -- 1.1 Si el usuario principal existe en auth.users, asegurar su perfil ADMIN
  IF v_uid_principal IS NOT NULL THEN
    INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
    VALUES (v_uid_principal, '94.gabriel.sanchez@gmail.com', 'Gabriel Sanchez', 'ADMIN', 'ACTIVA')
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      nombre_completo = 'Gabriel Sanchez',
      rol = 'ADMIN',
      estado_membresia = 'ACTIVA';
  END IF;

  -- 1.2 Si el usuario auxiliar existe en auth.users, asegurar su perfil ADMIN
  IF v_uid_auxiliar IS NOT NULL THEN
    INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
    VALUES (v_uid_auxiliar, 'ds.gabriel.sanchez@gmail.com', 'Gabriel Sanchez', 'ADMIN', 'ACTIVA')
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      rol = 'ADMIN',
      estado_membresia = 'ACTIVA';
  END IF;

  -- 1.3 Actualizar registros existentes en public.perfiles por email si no coincidieran por ID
  UPDATE public.perfiles
  SET rol = 'ADMIN',
      nombre_completo = 'Gabriel Sanchez',
      estado_membresia = 'ACTIVA'
  WHERE lower(email) = '94.gabriel.sanchez@gmail.com';

  UPDATE public.perfiles
  SET rol = 'ADMIN',
      estado_membresia = 'ACTIVA'
  WHERE lower(email) = 'ds.gabriel.sanchez@gmail.com';
END $$;

-- ============================================================================
-- 2. PERSISTIR RUTINA ACTIVA "GABI AGOSTO" PARA 94.GABRIEL.SANCHEZ
-- ============================================================================

DO $$
DECLARE
  v_uid UUID;
  v_coach_uid UUID;
  v_gabi CONSTANT UUID := 'cab4ad3d-8595-47be-a220-6dc52117048e';
BEGIN
  SELECT id INTO v_uid FROM public.perfiles WHERE lower(email) = '94.gabriel.sanchez@gmail.com';
  IF v_uid IS NULL THEN
    SELECT id INTO v_uid FROM auth.users WHERE lower(email) = '94.gabriel.sanchez@gmail.com';
  END IF;

  SELECT id INTO v_coach_uid FROM public.perfiles WHERE lower(email) = 'ds.gabriel.sanchez@gmail.com';
  IF v_coach_uid IS NULL THEN
    SELECT id INTO v_coach_uid FROM auth.users WHERE lower(email) = 'ds.gabriel.sanchez@gmail.com';
  END IF;

  IF v_uid IS NOT NULL THEN
    -- Enlazar profesor asignado si v_coach_uid existe y es distinto
    IF v_coach_uid IS NOT NULL AND v_coach_uid <> v_uid THEN
      UPDATE public.perfiles
      SET profesor_asignado_id = v_coach_uid
      WHERE id = v_uid AND profesor_asignado_id IS NULL;
    END IF;

    -- Inactivar otros planes activos del usuario para respetar uq_planes_un_activo_por_alumno
    UPDATE public.planes_entrenamiento
    SET estado = 'INACTIVO'
    WHERE alumno_id = v_uid
      AND estado = 'ACTIVO'
      AND id <> v_gabi;

    -- Asignar / Upsert de GABI AGOSTO como plan ACTIVO
    UPDATE public.planes_entrenamiento
    SET alumno_id = v_uid,
        profesor_id = COALESCE(v_coach_uid, v_uid),
        nombre = 'GABI AGOSTO',
        estado = 'ACTIVO'
    WHERE id = v_gabi;

    IF NOT FOUND THEN
      INSERT INTO public.planes_entrenamiento (
        id,
        profesor_id,
        alumno_id,
        nombre,
        estado,
        comentarios
      )
      VALUES (
        v_gabi,
        COALESCE(v_coach_uid, v_uid),
        v_uid,
        'GABI AGOSTO',
        'ACTIVO',
        'Rutina activa principal de entrenamiento (3 días + antebrazos)'
      )
      ON CONFLICT (id) DO UPDATE SET
        alumno_id = v_uid,
        profesor_id = COALESCE(v_coach_uid, v_uid),
        nombre = 'GABI AGOSTO',
        estado = 'ACTIVO';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 3. REFORZAR POLÍTICAS RLS PARA PERMITIR AUTOGESTIÓN DE RUTINA POR ADMIN
-- ============================================================================

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
      OR alumno_id = auth.uid()
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
      OR alumno_id = auth.uid()
      OR (alumno_id IS NOT NULL AND public.es_entrenador_de(alumno_id))
      OR public.es_admin()
    )
  )
  WITH CHECK (
    public.es_entrenador_o_admin()
    AND (
      profesor_id = auth.uid()
      OR alumno_id = auth.uid()
      OR (alumno_id IS NOT NULL AND public.es_entrenador_de(alumno_id))
      OR public.es_admin()
    )
  );

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

COMMIT;
