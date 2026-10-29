-- GOZS-199: plausibilidad server-side de registro_series (una API directa no puede saltarla).
-- NOT VALID: se aplica a todo INSERT/UPDATE nuevo sin reescribir ni rechazar historial existente.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_registro_series_peso_plausible') THEN
    ALTER TABLE public.registro_series
      ADD CONSTRAINT chk_registro_series_peso_plausible CHECK (peso_kg >= 0 AND peso_kg <= 1000) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_registro_series_reps_plausibles') THEN
    ALTER TABLE public.registro_series
      ADD CONSTRAINT chk_registro_series_reps_plausibles CHECK (reps_hechas >= 0 AND reps_hechas <= 100) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_registro_series_rpe_plausible') THEN
    ALTER TABLE public.registro_series
      ADD CONSTRAINT chk_registro_series_rpe_plausible CHECK (rpe_real IS NULL OR (rpe_real >= 1 AND rpe_real <= 10)) NOT VALID;
  END IF;
END
$$;
