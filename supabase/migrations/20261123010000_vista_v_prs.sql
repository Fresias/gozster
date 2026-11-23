-- GOZS-725 (PL-13): PRs derivados de registro_series en lugar de ranking_prs.
-- Una fila por (alumno, ejercicio): la serie completada de mayor peso
-- (desempate: más reps, luego la más antigua). Sin calentamientos.
-- security_invoker: aplica la RLS de registro_series/registro_sesiones
-- (el alumno ve los suyos; el entrenador, los de sus alumnos; admin, todos).
-- Después de esto, PL-8 puede borrar ranking_prs.

BEGIN;

CREATE OR REPLACE VIEW public.v_prs
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (s.alumno_id, rs.ejercicio_id)
  s.alumno_id,
  rs.ejercicio_id,
  rs.peso_kg,
  rs.reps_hechas AS reps,
  s.fecha::date AS fecha,
  rs.id AS serie_id
FROM public.registro_series rs
JOIN public.registro_sesiones s ON s.id = rs.sesion_id
WHERE rs.completada
  AND rs.peso_kg > 0
  AND rs.reps_hechas > 0
  AND rs.set_type NOT IN ('WARMUP', 'W')
ORDER BY s.alumno_id, rs.ejercicio_id, rs.peso_kg DESC, rs.reps_hechas DESC, s.fecha ASC, rs.id;

REVOKE ALL ON public.v_prs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_prs TO authenticated, service_role;

COMMIT;
