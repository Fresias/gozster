-- ============================================================================
-- GOZSter: Sincronización de perfiles.rol al actualizar raw_app_meta_data
-- Archivo: supabase/migrations/20261124050000_sync_rol_app_metadata_update.sql
-- Multica Issue: GOZS-793
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
--
-- Al crear o actualizar usuarios mediante la Admin API, Auth puede insertar
-- primero la fila en auth.users con raw_app_meta_data básico y luego ejecutar
-- UPDATE auth.users SET raw_app_meta_data = ... agregando la clave "rol".
-- Este trigger sincroniza public.perfiles.rol cuando cambia esa clave con un
-- valor válido ('ADMIN', 'ENTRENADOR' o 'ALUMNO').
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_sync_rol_from_app_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol_raw TEXT;
  v_rol public.rol_usuario;
BEGIN
  IF (NEW.raw_app_meta_data ->> 'rol') IS NOT DISTINCT FROM (OLD.raw_app_meta_data ->> 'rol') THEN
    RETURN NEW;
  END IF;

  v_rol_raw := upper(btrim(COALESCE(NEW.raw_app_meta_data ->> 'rol', '')));
  IF v_rol_raw NOT IN ('ADMIN', 'ENTRENADOR', 'ALUMNO') THEN
    RETURN NEW;
  END IF;

  v_rol := v_rol_raw::public.rol_usuario;

  UPDATE public.perfiles
  SET rol = v_rol,
      updated_at = now()
  WHERE id = NEW.id
    AND rol IS DISTINCT FROM v_rol;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_sync_rol_from_app_metadata() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_rol_from_app_metadata() TO service_role;

DROP TRIGGER IF EXISTS trg_auth_users_sync_rol_app_metadata ON auth.users;
CREATE TRIGGER trg_auth_users_sync_rol_app_metadata
  AFTER UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW
  WHEN ((NEW.raw_app_meta_data ->> 'rol') IS DISTINCT FROM (OLD.raw_app_meta_data ->> 'rol'))
  EXECUTE FUNCTION public.fn_sync_rol_from_app_metadata();

COMMIT;
