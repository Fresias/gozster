-- GOZS-761: RPC mínima de staff de entrenadores para compartir plantillas y mostrar autor.
-- El RLS de public.perfiles impide que un ENTRENADOR lea perfiles de otros entrenadores.
-- Esta función SECURITY DEFINER expone únicamente id y nombre_completo de perfiles activos
-- con rol ENTRENADOR o ADMIN, solo para usuarios autenticados con es_entrenador_o_admin().
-- Idempotente y append-only.

BEGIN;

CREATE OR REPLACE FUNCTION public.listar_entrenadores_staff()
RETURNS TABLE (
  id uuid,
  nombre_completo text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.es_entrenador_o_admin() THEN
    RAISE EXCEPTION 'No autorizado para listar el staff de entrenadores'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.nombre_completo
  FROM public.perfiles p
  WHERE p.rol IN ('ENTRENADOR', 'ADMIN')
    AND p.estado_cuenta = 'ACTIVO'
    AND p.fecha_baja IS NULL
  ORDER BY p.nombre_completo ASC, p.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.listar_entrenadores_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_entrenadores_staff() TO authenticated, service_role;

COMMIT;
