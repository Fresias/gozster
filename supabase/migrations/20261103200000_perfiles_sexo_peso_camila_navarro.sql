-- ============================================================================
-- GOZSter: Garantizar sexo biológico ('M' | 'F') y peso corporal (kg) en public.perfiles,
-- persistencia en handle_new_user(), RPC de actualización y siembra consistente de Camila Navarro.
-- Migración estrictamente append-only e idempotente para PostgreSQL 15+ / Supabase.
-- GitHub Issue: GOZS-343
-- ============================================================================

BEGIN;

-- 1. Columnas y restricciones consistentes en public.perfiles
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS peso_corporal_kg NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS sexo TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.perfiles'::regclass AND conname = 'chk_perfiles_sexo'
  ) THEN
    ALTER TABLE public.perfiles
      ADD CONSTRAINT chk_perfiles_sexo CHECK (sexo IS NULL OR sexo IN ('M', 'F'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.perfiles'::regclass AND conname = 'chk_perfiles_peso_corporal_kg'
  ) THEN
    ALTER TABLE public.perfiles
      ADD CONSTRAINT chk_perfiles_peso_corporal_kg CHECK (peso_corporal_kg IS NULL OR (peso_corporal_kg > 0 AND peso_corporal_kg <= 500));
  END IF;
END $$;

-- 2. Actualizar trigger fn_upsert_perfil_si_existe para no perder sexo ni peso_corporal_kg
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
      debe_cambiar_password = COALESCE(NEW.debe_cambiar_password, public.perfiles.debe_cambiar_password),
      ultimo_entreno_at = COALESCE(NEW.ultimo_entreno_at, public.perfiles.ultimo_entreno_at),
      sexo = COALESCE(NEW.sexo, public.perfiles.sexo),
      peso_corporal_kg = COALESCE(NEW.peso_corporal_kg, public.perfiles.peso_corporal_kg),
      updated_at = now()
    WHERE id = NEW.id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Actualizar public.handle_new_user() para persistir sexo y peso_corporal_kg desde raw_user_meta_data
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
  v_sexo TEXT;
  v_peso NUMERIC(5,2);
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

  -- Sexo biológico ('M' o 'F')
  v_sexo := upper(btrim(COALESCE(NEW.raw_user_meta_data ->> 'sexo', '')));
  IF v_sexo NOT IN ('M', 'F') THEN
    v_sexo := NULL;
  END IF;

  -- Peso corporal (kg)
  BEGIN
    v_peso := (NEW.raw_user_meta_data ->> 'peso_corporal_kg')::NUMERIC(5,2);
    IF v_peso <= 0 OR v_peso > 500 THEN
      v_peso := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_peso := NULL;
  END;

  INSERT INTO public.perfiles (
    id,
    email,
    nombre_completo,
    rol,
    estado_membresia,
    sexo,
    peso_corporal_kg
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_nombre,
    v_rol,
    'ACTIVA',
    v_sexo,
    v_peso
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.perfiles.email),
    nombre_completo = CASE
      WHEN public.perfiles.nombre_completo IS NULL OR public.perfiles.nombre_completo = ''
      THEN EXCLUDED.nombre_completo
      ELSE public.perfiles.nombre_completo
    END,
    sexo = COALESCE(EXCLUDED.sexo, public.perfiles.sexo),
    peso_corporal_kg = COALESCE(EXCLUDED.peso_corporal_kg, public.perfiles.peso_corporal_kg),
    updated_at = now();

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
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

-- 4. RPC para actualización segura de sexo y peso corporal de alumno
CREATE OR REPLACE FUNCTION public.actualizar_peso_sexo_alumno(
  p_alumno_id UUID,
  p_peso_corporal_kg NUMERIC,
  p_sexo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sexo TEXT := upper(btrim(COALESCE(p_sexo, '')));
BEGIN
  IF v_sexo NOT IN ('M', 'F') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El sexo biológico debe ser ''M'' o ''F''.');
  END IF;

  IF p_peso_corporal_kg IS NULL OR p_peso_corporal_kg <= 0 OR p_peso_corporal_kg > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El peso corporal debe ser mayor a 0 y hasta 500 kg.');
  END IF;

  IF NOT (
    auth.uid() = p_alumno_id
    OR public.es_entrenador_de(p_alumno_id)
    OR public.es_admin()
    OR auth.role() = 'service_role'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tenés permisos para actualizar este alumno.');
  END IF;

  UPDATE public.perfiles
  SET
    sexo = v_sexo,
    peso_corporal_kg = ROUND(p_peso_corporal_kg, 2),
    updated_at = now()
  WHERE id = p_alumno_id;

  RETURN jsonb_build_object(
    'ok', true,
    'alumno_id', p_alumno_id,
    'sexo', v_sexo,
    'peso_corporal_kg', ROUND(p_peso_corporal_kg, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_peso_sexo_alumno(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_peso_sexo_alumno(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- Alias funcional para el cliente
CREATE OR REPLACE FUNCTION public.actualizar_perfil_alumno(
  p_alumno_id UUID,
  p_peso_corporal_kg NUMERIC,
  p_sexo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.actualizar_peso_sexo_alumno(p_alumno_id, p_peso_corporal_kg, p_sexo);
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_perfil_alumno(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_perfil_alumno(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- 5. Semilla y consistencia de Camila Navarro y alumnos reales en la base
DO $$
DECLARE
  v_coach_id UUID := '20685bca-6304-4e55-abba-37a1cf8f6113';
  v_camila_id UUID := 'e8b1a08c-3430-4000-8000-000000000008';
BEGIN
  -- Validar si el coach existe para no violar FK ni alterar entornos aislados de test
  IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE id = v_coach_id) THEN
    v_coach_id := NULL;
  END IF;

  -- 5.1 En entornos sembrados o con coach Mynter existente, asegurar a Camila Navarro
  IF v_coach_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
      IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_camila_id OR lower(email) = 'camila.navarro@ficticio.ar') THEN
        INSERT INTO auth.users (
          id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
          v_camila_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'camila.navarro@ficticio.ar', crypt('TempPasswordGozster2026!', gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}',
          '{"nombre_completo":"Camila Navarro","sexo":"F","peso_corporal_kg":55.0}',
          now(), now()
        );
      END IF;
    END IF;

    INSERT INTO public.perfiles (
      id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg
    ) VALUES (
      v_camila_id, 'camila.navarro@ficticio.ar', 'Camila Navarro', 'ALUMNO', 'ACTIVA', v_coach_id, 'F', 55.0
    ) ON CONFLICT (id) DO UPDATE SET
      sexo = 'F',
      peso_corporal_kg = 55.0,
      updated_at = now();
  END IF;

  -- En caso de haber sido creada con otro ID previo por email o nombre
  UPDATE public.perfiles
  SET sexo = 'F', peso_corporal_kg = 55.0, updated_at = now()
  WHERE lower(email) = 'camila.navarro@ficticio.ar' OR lower(nombre_completo) = 'camila navarro';

  -- 5.3 Precargar sexo y peso biológico aproximado en alumnos del dataset Mynter
  UPDATE public.perfiles SET sexo = 'M', peso_corporal_kg = COALESCE(peso_corporal_kg, 78.0) WHERE lower(email) = 'feerrosales97@gmail.com' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'F', peso_corporal_kg = COALESCE(peso_corporal_kg, 58.0) WHERE lower(email) = 'alumno1@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'M', peso_corporal_kg = COALESCE(peso_corporal_kg, 80.0) WHERE lower(email) = 'alumno2@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'M', peso_corporal_kg = COALESCE(peso_corporal_kg, 75.0) WHERE lower(email) = 'alumno3@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'F', peso_corporal_kg = COALESCE(peso_corporal_kg, 60.0) WHERE lower(email) = 'alumno4@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'F', peso_corporal_kg = COALESCE(peso_corporal_kg, 57.0) WHERE lower(email) = 'alumno5@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'M', peso_corporal_kg = COALESCE(peso_corporal_kg, 74.0) WHERE lower(email) = 'alumno6@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'M', peso_corporal_kg = COALESCE(peso_corporal_kg, 82.0) WHERE lower(email) = 'alumno7@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'F', peso_corporal_kg = COALESCE(peso_corporal_kg, 54.0) WHERE lower(email) = 'alumno8@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'M', peso_corporal_kg = COALESCE(peso_corporal_kg, 85.0) WHERE lower(email) = 'alumno9@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'F', peso_corporal_kg = COALESCE(peso_corporal_kg, 53.0) WHERE lower(email) = 'alumno10@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'F', peso_corporal_kg = COALESCE(peso_corporal_kg, 56.0) WHERE lower(email) = 'alumno11@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'F', peso_corporal_kg = COALESCE(peso_corporal_kg, 59.0) WHERE lower(email) = 'alumno12@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
  UPDATE public.perfiles SET sexo = 'F', peso_corporal_kg = COALESCE(peso_corporal_kg, 61.0) WHERE lower(email) = 'alumno13@gozster.local' AND (sexo IS NULL OR peso_corporal_kg IS NULL);
END $$;

COMMIT;
