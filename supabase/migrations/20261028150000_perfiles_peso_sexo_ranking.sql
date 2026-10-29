-- GOZS-230: peso corporal y sexo del alumno + RPC de ranking relativo (PR / peso corporal) por sexo.

ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS peso_corporal_kg NUMERIC(5,2) CHECK (peso_corporal_kg > 0 AND peso_corporal_kg <= 500),
  ADD COLUMN IF NOT EXISTS sexo TEXT CHECK (sexo IN ('M', 'F'));

-- Ranking de un ejercicio: PR (peso máximo en series completadas) / peso corporal, por sexo.
-- Alumnos sin peso corporal o sin sexo se devuelven con ratio NULL y motivo_exclusion explícito.
-- No expone el peso corporal crudo (dato sensible entre alumnos).
CREATE OR REPLACE FUNCTION public.obtener_ranking_ejercicio(p_ejercicio_id UUID)
RETURNS TABLE (
  alumno_id UUID,
  nombre_completo TEXT,
  sexo TEXT,
  pr_kg NUMERIC,
  ratio_pr_peso_corporal NUMERIC,
  posicion_en_sexo BIGINT,
  motivo_exclusion TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH prs AS (
    SELECT s.alumno_id, MAX(rs.peso_kg) AS pr_kg
    FROM public.registro_series rs
    INNER JOIN public.registro_sesiones s ON s.id = rs.sesion_id
    WHERE rs.ejercicio_id = p_ejercicio_id
      AND rs.completada = true
      AND rs.peso_kg > 0
      AND rs.reps_hechas > 0
    GROUP BY s.alumno_id
  ), base AS (
    SELECT
      p.id AS alumno_id,
      p.nombre_completo,
      p.sexo,
      prs.pr_kg,
      CASE WHEN p.sexo IS NOT NULL AND p.peso_corporal_kg IS NOT NULL
        THEN ROUND(prs.pr_kg / p.peso_corporal_kg, 2)
      END AS ratio,
      CASE
        WHEN p.peso_corporal_kg IS NULL AND p.sexo IS NULL THEN 'SIN_PESO_CORPORAL_Y_SEXO'
        WHEN p.peso_corporal_kg IS NULL THEN 'SIN_PESO_CORPORAL'
        WHEN p.sexo IS NULL THEN 'SIN_SEXO'
      END AS motivo
    FROM prs
    INNER JOIN public.perfiles p ON p.id = prs.alumno_id
    WHERE p.rol = 'ALUMNO'
  )
  SELECT
    b.alumno_id,
    b.nombre_completo,
    b.sexo,
    b.pr_kg::NUMERIC(6,2),
    b.ratio,
    CASE WHEN b.ratio IS NOT NULL
      THEN RANK() OVER (PARTITION BY b.sexo ORDER BY b.ratio DESC)
    END,
    b.motivo
  FROM base b
  WHERE auth.uid() IS NOT NULL
  ORDER BY b.sexo NULLS LAST, b.ratio DESC NULLS LAST, b.nombre_completo;
$$;

REVOKE ALL ON FUNCTION public.obtener_ranking_ejercicio(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_ranking_ejercicio(UUID) TO authenticated;
