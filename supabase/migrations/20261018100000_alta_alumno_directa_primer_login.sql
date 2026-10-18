-- ============================================================================
-- GOZSter: Alta directa de alumnos y cambio obligatorio de contraseña
-- Migración idempotente para PostgreSQL 15+ / Supabase
-- GitHub Issue: #55 (reemplaza la invitación por enlace mágico de #49)
--
-- El entrenador da de alta al alumno con una contraseña temporal (Edge Function
-- alta-alumno-directa). El perfil queda con debe_cambiar_password = true hasta
-- que el alumno cambia su propia contraseña en Supabase Auth.
--
-- Requiere 20261018000000_auth_invitacion_hardening_rls.sql (guard de perfiles).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. COLUMNA debe_cambiar_password
-- ============================================================================

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial: sólo los perfiles pendientes de cambiar la contraseña temporal
CREATE INDEX IF NOT EXISTS idx_perfiles_debe_cambiar_password
  ON public.perfiles (id)
  WHERE debe_cambiar_password;

-- ============================================================================
-- 2. GUARD DE CAMPOS PRIVILEGIADOS EN perfiles (amplía el de #49)
-- debe_cambiar_password se suma a los campos que el alumno no puede tocar: sólo
-- se limpia cuando cambia su contraseña (trigger de la sección 3), nunca con un
-- UPDATE directo. El entrenador asignado o ADMIN pueden volver a activarlo.
-- ============================================================================

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

  IF (
    NEW.estado_membresia IS DISTINCT FROM OLD.estado_membresia
    OR NEW.profesor_asignado_id IS DISTINCT FROM OLD.profesor_asignado_id
    OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja
    OR NEW.debe_cambiar_password IS DISTINCT FROM OLD.debe_cambiar_password
  ) AND NOT (
    OLD.id <> auth.uid()
    AND public.es_entrenador_o_admin()
    AND (OLD.profesor_asignado_id = auth.uid() OR public.es_entrenador_de(OLD.id))
  ) THEN
    RAISE EXCEPTION 'Solo el entrenador asignado puede modificar membresía, baja, asignación o cambio de contraseña del alumno'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. LIMPIEZA DEL FLAG AL CAMBIAR LA CONTRASEÑA (auth.users)
-- Supabase Auth actualiza encrypted_password cuando el usuario ejecuta
-- auth.updateUser({ password }) o completa una recuperación. En ese momento el
-- flag se apaga. SECURITY DEFINER: Auth escribe con su propio rol y sin JWT.
-- Nota: un reseteo administrativo de contraseña también apaga el flag; quien lo
-- haga debe volver a activarlo después de cambiar la contraseña.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_limpiar_debe_cambiar_password()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.perfiles
  SET debe_cambiar_password = false
  WHERE id = NEW.id
    AND debe_cambiar_password;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_limpiar_debe_cambiar_password() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auth_users_limpiar_debe_cambiar_password ON auth.users;
CREATE TRIGGER trg_auth_users_limpiar_debe_cambiar_password
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password)
  EXECUTE FUNCTION public.fn_limpiar_debe_cambiar_password();

COMMIT;
