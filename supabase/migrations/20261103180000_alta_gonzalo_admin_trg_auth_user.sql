-- ============================================================================
-- GOZSter: Alta persistente de Gonzalo Salas (Admin), trigger on_auth_user_created
-- y soporte para autogestión de rutina de usuario ADMIN (Rol Dual)
-- Migración idempotente para PostgreSQL 15+ / Supabase
-- GitHub Issue: #335 (GOZS-335)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TRIGGER PREVENTIVO: public.handle_new_user() & trg_on_auth_user_created
-- Asegura que todo nuevo usuario registrado en auth.users cuente con su fila
-- correspondiente en public.perfiles con rol por defecto ('ALUMNO' o el
-- especificado en metadata si es válido), evitando perfiles huérfanos.
-- ============================================================================

-- Soporte para absorber re-inserciones de perfiles existentes sin violar PK
CREATE OR REPLACE FUNCTION public.fn_upsert_perfil_si_existe()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.perfiles WHERE id = NEW.id) THEN
    UPDATE public.perfiles
    SET
      email = COALESCE(NEW.email, public.perfiles.email),
      nombre_completo = COALESCE(NEW.nombre_completo, public.perfiles.nombre_completo),
      rol = COALESCE(NEW.rol, public.perfiles.rol),
      estado_membresia = COALESCE(NEW.estado_membresia, public.perfiles.estado_membresia),
      profesor_asignado_id = COALESCE(NEW.profesor_asignado_id, public.perfiles.profesor_asignado_id),
      fecha_baja = COALESCE(NEW.fecha_baja, public.perfiles.fecha_baja),
      debe_cambiar_password = COALESCE(NEW.debe_cambiar_password, public.perfiles.debe_cambiar_password)
    WHERE id = NEW.id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_00_upsert_perfiles ON public.perfiles;
CREATE TRIGGER trg_00_upsert_perfiles
  BEFORE INSERT ON public.perfiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_upsert_perfil_si_existe();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT;
  v_rol public.rol_usuario := 'ALUMNO'::public.rol_usuario;
  v_rol_raw TEXT;
BEGIN
  -- Extraer nombre del metadata o derivar del email
  v_nombre := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'nombre_completo'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
    split_part(COALESCE(NEW.email, 'Usuario'), '@', 1)
  );

  -- Si el metadata especifica un rol ('ADMIN', 'ENTRENADOR', 'ALUMNO'), respetarlo
  v_rol_raw := upper(btrim(COALESCE(NEW.raw_user_meta_data ->> 'rol', '')));
  IF v_rol_raw IN ('ADMIN', 'ENTRENADOR', 'ALUMNO') THEN
    v_rol := v_rol_raw::public.rol_usuario;
  END IF;

  INSERT INTO public.perfiles (
    id,
    email,
    nombre_completo,
    rol,
    estado_membresia
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_nombre,
    v_rol,
    'ACTIVA'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.perfiles.email),
    nombre_completo = CASE
      WHEN public.perfiles.nombre_completo IS NULL OR public.perfiles.nombre_completo = ''
      THEN EXCLUDED.nombre_completo
      ELSE public.perfiles.nombre_completo
    END;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback seguro para que ningún error en perfiles aborte la creación en auth
    BEGIN
      INSERT INTO public.perfiles (
        id,
        email,
        nombre_completo,
        rol,
        estado_membresia
      )
      VALUES (
        NEW.id,
        NEW.email,
        split_part(COALESCE(NEW.email, 'Usuario'), '@', 1),
        'ALUMNO',
        'ACTIVA'
      )
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 2. ALTA PERSISTENTE E IDEMPOTENTE DE GONZALO SALAS (ADMIN)
-- Gonzalo Salas: gonzasalas2016@gmail.com, id: f4819866-b758-424e-90b2-555b7887c601
-- ============================================================================

DO $$
BEGIN
  -- Asegurar usuario en auth.users en caso de entornos de prueba o locales limpios
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = 'f4819866-b758-424e-90b2-555b7887c601'::uuid) THEN
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES (
      'f4819866-b758-424e-90b2-555b7887c601'::uuid,
      'gonzasalas2016@gmail.com',
      '{"nombre_completo": "Gonzalo Salas", "rol": "ADMIN"}'::jsonb
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Evitar colisión de email si existiera un registro previo con ID diferente
UPDATE public.perfiles
SET email = NULL
WHERE email = 'gonzasalas2016@gmail.com'
  AND id <> 'f4819866-b758-424e-90b2-555b7887c601'::uuid;

-- Persistir de forma idempotente con rol ADMIN y membresía ACTIVA
INSERT INTO public.perfiles (
  id,
  email,
  nombre_completo,
  rol,
  estado_membresia
)
VALUES (
  'f4819866-b758-424e-90b2-555b7887c601'::uuid,
  'gonzasalas2016@gmail.com',
  'Gonzalo Salas',
  'ADMIN',
  'ACTIVA'
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  nombre_completo = EXCLUDED.nombre_completo,
  rol = 'ADMIN',
  estado_membresia = 'ACTIVA';

-- ============================================================================
-- 3. BACKFILL DE PERFILES HUÉRFANOS EXISTENTES EN auth.users
-- ============================================================================

INSERT INTO public.perfiles (
  id,
  email,
  nombre_completo,
  rol,
  estado_membresia
)
SELECT
  u.id,
  u.email,
  COALESCE(
    NULLIF(btrim(u.raw_user_meta_data ->> 'nombre_completo'), ''),
    NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(u.raw_user_meta_data ->> 'name'), ''),
    split_part(COALESCE(u.email, 'Usuario'), '@', 1)
  ),
  COALESCE(
    NULLIF(btrim(u.raw_user_meta_data ->> 'rol'), '')::public.rol_usuario,
    'ALUMNO'::public.rol_usuario
  ),
  'ACTIVA'::public.estado_membresia
FROM auth.users u
LEFT JOIN public.perfiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. CONFIRMACIÓN Y POLÍTICAS RLS PARA AUTOGESTIÓN DE RUTINA POR ADMIN
-- Garantiza que un usuario con rol ADMIN pueda:
-- a) Leer y modificar planes_entrenamiento donde alumno_id = auth.uid()
-- b) Acceder a dias_rutina y ejercicios_en_rutina de su plan
-- c) Registrar y consultar sus entrenamientos en registro_sesiones y registro_series
-- ============================================================================

-- Reafirmar la política de selección de planes para que cubra alumno_id = auth.uid() y es_admin()
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

-- Reafirmar inserción de planes permitiendo a Admin crear su propio plan o plantillas
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

-- Reafirmar actualización de planes permitiendo a Admin gestionar su propio plan
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

-- Reafirmar registro_sesiones para escritura y lectura propia del admin
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

-- Reafirmar registro_series para escritura y lectura de series del admin
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
