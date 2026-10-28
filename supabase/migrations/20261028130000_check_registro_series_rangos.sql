-- GOZS-202: CHECKs de rango en registro_series (peso, reps, RPE).
-- NOT VALID: se aplican a toda escritura nueva sin revalidar filas históricas.
BEGIN;

ALTER TABLE public.registro_series DROP CONSTRAINT IF EXISTS chk_registro_series_peso_rango;
ALTER TABLE public.registro_series
  ADD CONSTRAINT chk_registro_series_peso_rango
  CHECK (peso_kg >= 0 AND peso_kg <= 1000) NOT VALID;

ALTER TABLE public.registro_series DROP CONSTRAINT IF EXISTS chk_registro_series_reps_rango;
ALTER TABLE public.registro_series
  ADD CONSTRAINT chk_registro_series_reps_rango
  CHECK (reps_hechas >= 1 AND reps_hechas <= 1000) NOT VALID;

-- rpe_real ya exige 1..10 (migración inicial); se declara con nombre propio para trazabilidad.
ALTER TABLE public.registro_series DROP CONSTRAINT IF EXISTS chk_registro_series_rpe_rango;
ALTER TABLE public.registro_series
  ADD CONSTRAINT chk_registro_series_rpe_rango
  CHECK (rpe_real IS NULL OR (rpe_real >= 1 AND rpe_real <= 10)) NOT VALID;

COMMIT;
