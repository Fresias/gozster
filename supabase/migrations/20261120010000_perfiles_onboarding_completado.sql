-- Migration: 20261120010000_perfiles_onboarding_completado.sql
-- GH #548: columna onboarding_completado en public.perfiles y RPC acotada completar_onboarding_alumno.

BEGIN;

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS onboarding_completado BOOLEAN NOT NULL DEFAULT false;

-- Escritura acotada a onboarding_completado para el propio usuario autenticado.
CREATE OR REPLACE FUNCTION public.completar_onboarding_alumno()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;

  UPDATE public.perfiles
    SET onboarding_completado = true,
        updated_at = now()
    WHERE id = auth.uid();

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.completar_onboarding_alumno() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.completar_onboarding_alumno() TO authenticated;

COMMIT;
