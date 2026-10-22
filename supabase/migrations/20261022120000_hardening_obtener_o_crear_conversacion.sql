-- ============================================================================
-- GOZSter: Hardening de obtener_o_crear_conversacion (rechazo de llamadas anónimas)
-- Migración idempotente para PostgreSQL 15+ / Supabase
-- GitHub Issue: #125 (GOZS-116)
--
-- Contexto: la función es SECURITY DEFINER y la validación previa usaba
-- `auth.uid() <> p_alumno_id`. Con un usuario anónimo `auth.uid()` es NULL, por
-- lo que la comparación daba NULL (ni TRUE) y la excepción no se lanzaba,
-- permitiendo crear una conversación vacía para cualquier alumno_id. Además no
-- había REVOKE EXECUTE para anon/PUBLIC. Se endurece la validación y los GRANTs.
-- ============================================================================

BEGIN;

-- Cuerpo idéntico al de 20261022000000 (inicializa responsable_id con
-- profesor_asignado_id) salvo la validación de autorización.
CREATE OR REPLACE FUNCTION public.obtener_o_crear_conversacion(p_alumno_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id UUID;
  v_profesor_id UUID;
BEGIN
  -- Rechazar explícitamente llamadas anónimas (auth.uid() NULL).
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado: se requiere autenticación'
      USING ERRCODE = '42501';
  END IF;

  -- Validar autorización: el usuario debe ser el alumno, un profesor asignado o admin.
  -- IS DISTINCT FROM trata NULL de forma segura (a diferencia de <>).
  IF auth.uid() IS DISTINCT FROM p_alumno_id
     AND NOT public.es_entrenador_de(p_alumno_id)
     AND NOT public.es_admin() THEN
    RAISE EXCEPTION 'No autorizado para acceder a la conversación de este alumno'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_conv_id
  FROM public.conversaciones
  WHERE alumno_id = p_alumno_id;

  IF v_conv_id IS NULL THEN
    SELECT profesor_asignado_id INTO v_profesor_id
    FROM public.perfiles
    WHERE id = p_alumno_id;

    INSERT INTO public.conversaciones (alumno_id, responsable_id)
    VALUES (p_alumno_id, v_profesor_id)
    ON CONFLICT (alumno_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_conv_id;
  END IF;

  RETURN v_conv_id;
END;
$$;

-- Defensa en profundidad: ningún rol anónimo/PUBLIC puede ejecutar la función.
REVOKE EXECUTE ON FUNCTION public.obtener_o_crear_conversacion(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_o_crear_conversacion(UUID) TO authenticated, service_role;

COMMIT;
