-- Migration: 20261118221000_perfiles_nombre_preferido.sql
-- Athlete v7 (BE-01 / D-53): columna nombre_preferido en public.perfiles y RPC acotada actualizar_nombre_preferido.

BEGIN;

-- D-53 (Athlete v7): nombre con el que la app saluda al alumno.
ALTER TABLE public.perfiles ADD COLUMN IF NOT EXISTS nombre_preferido TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfiles_nombre_preferido_check') THEN
    ALTER TABLE public.perfiles ADD CONSTRAINT perfiles_nombre_preferido_check
      CHECK (nombre_preferido IS NULL OR char_length(btrim(nombre_preferido)) BETWEEN 1 AND 30);
  END IF;
END $$;

-- Escritura acotada a esa columna: no depende de la política amplia de UPDATE sobre perfiles.
CREATE OR REPLACE FUNCTION public.actualizar_nombre_preferido(p_nombre TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT := NULLIF(btrim(p_nombre), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF v_nombre IS NOT NULL AND char_length(v_nombre) > 30 THEN
    RAISE EXCEPTION 'El nombre tiene más de 30 caracteres' USING ERRCODE = '22001';
  END IF;
  UPDATE public.perfiles
    SET nombre_preferido = v_nombre,
        updated_at = now()
    WHERE id = auth.uid();
  RETURN v_nombre;
END $$;

REVOKE ALL ON FUNCTION public.actualizar_nombre_preferido(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_nombre_preferido(TEXT) TO authenticated;

COMMIT;
