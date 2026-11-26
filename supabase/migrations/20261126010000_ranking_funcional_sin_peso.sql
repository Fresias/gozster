-- GOZS-851: el ranking de Funcional no expone peso_kg ni reps de terceros.
-- ratio = peso_kg / peso_corporal_kg permitiria despejar el peso corporal ajeno.
-- Posicion y orden se siguen calculando en servidor con los valores reales.
BEGIN;

CREATE OR REPLACE FUNCTION public.obtener_ranking_funcional_alumno(p_ejercicio_id UUID DEFAULT NULL)
RETURNS TABLE (
  ejercicio_id UUID,
  es_usuario_actual BOOLEAN,
  nombre_corto TEXT,
  sexo TEXT,
  peso_kg NUMERIC,
  reps INTEGER,
  fecha DATE,
  ratio NUMERIC,
  posicion BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    public.es_admin()
    OR EXISTS (SELECT 1 FROM public.perfiles WHERE id = auth.uid() AND rol = 'ENTRENADOR')
    OR EXISTS (SELECT 1 FROM public.alumno_actividades WHERE alumno_id = auth.uid() AND actividad = 'FUNCIONAL')
  ) THEN
    RAISE EXCEPTION 'Ranking disponible solo para Funcional' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      v.ejercicio_id AS ej_id,
      v.alumno_id AS a_id,
      CASE
        WHEN array_length(string_to_array(btrim(p.nombre_completo), ' '), 1) > 1
        THEN split_part(btrim(p.nombre_completo), ' ', 1) || ' ' ||
             upper(left((string_to_array(btrim(p.nombre_completo), ' '))[array_length(string_to_array(btrim(p.nombre_completo), ' '), 1)], 1)) || '.'
        ELSE btrim(p.nombre_completo)
      END AS nombre,
      p.sexo AS sx,
      v.peso_kg AS pk,
      v.reps AS rp,
      v.fecha AS fch,
      CASE WHEN p.peso_corporal_kg > 0 THEN round(v.peso_kg / p.peso_corporal_kg, 2) END AS rt
    FROM public.v_prs v
    JOIN public.perfiles p ON p.id = v.alumno_id AND p.rol = 'ALUMNO'
    WHERE (p_ejercicio_id IS NULL OR v.ejercicio_id = p_ejercicio_id)
      AND EXISTS (
        SELECT 1 FROM public.alumno_actividades aa
        WHERE aa.alumno_id = v.alumno_id AND aa.actividad = 'FUNCIONAL'
      )
  ),
  ranked AS (
    SELECT b.*,
      CASE WHEN b.rt IS NOT NULL AND b.sx IS NOT NULL
        THEN rank() OVER (PARTITION BY b.ej_id, b.sx ORDER BY b.rt DESC NULLS LAST, b.pk DESC)
      END AS pos
    FROM base b
  )
  SELECT
    r.ej_id,
    r.a_id = auth.uid(),
    r.nombre,
    r.sx,
    CASE WHEN r.a_id = auth.uid() THEN r.pk END,
    CASE WHEN r.a_id = auth.uid() THEN r.rp END,
    r.fch,
    r.rt,
    r.pos
  FROM ranked r
  ORDER BY r.ej_id, r.sx NULLS LAST, r.pos NULLS LAST, r.pk DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_ranking_funcional_alumno(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_ranking_funcional_alumno(UUID) TO authenticated, service_role;

COMMIT;
