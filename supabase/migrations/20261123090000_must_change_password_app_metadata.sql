-- ============================================================================
-- GOZSter: el cambio de contraseña obligatorio vive en app_metadata
-- Archivo: supabase/migrations/20261123090000_must_change_password_app_metadata.sql
-- Multica Issue: GOZS-692
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
--
-- raw_user_meta_data lo edita el propio usuario con auth.updateUser(); por eso
-- la bandera que lee el middleware pasa a raw_app_meta_data (solo service_role /
-- Admin API). El usuario solo la baja cambiando efectivamente su contraseña:
-- un trigger BEFORE UPDATE en auth.users la quita cuando cambia encrypted_password.
-- ============================================================================

BEGIN;

-- 1. Quitar la bandera de app_metadata al cambiar la contraseña.
--    Si la misma sentencia también modifica raw_app_meta_data (Admin API que
--    resetea clave y bandera juntas) se respeta lo que escribió el administrador.
CREATE OR REPLACE FUNCTION public.fn_quitar_must_change_password_app_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.raw_app_meta_data IS NOT DISTINCT FROM OLD.raw_app_meta_data
     AND NEW.raw_app_meta_data ? 'must_change_password' THEN
    NEW.raw_app_meta_data := NEW.raw_app_meta_data - 'must_change_password';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_quitar_must_change_password_app_metadata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auth_users_quitar_must_change_password ON auth.users;
CREATE TRIGGER trg_auth_users_quitar_must_change_password
  BEFORE UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password)
  EXECUTE FUNCTION public.fn_quitar_must_change_password_app_metadata();

-- 2. Backfill: quien hoy tiene el cambio pendiente en su perfil lo conserva en
--    app_metadata (el middleware deja de leer user_metadata).
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(u.raw_app_meta_data, '{}'::jsonb) || '{"must_change_password": true}'::jsonb
FROM public.perfiles p
WHERE p.id = u.id
  AND p.debe_cambiar_password
  AND (u.raw_app_meta_data ->> 'must_change_password') IS DISTINCT FROM 'true';

COMMIT;
