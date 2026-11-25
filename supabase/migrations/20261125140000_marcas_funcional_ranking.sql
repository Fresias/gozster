-- GOZS-824: persistencia real de marcas de Funcional + ranking seguro para alumnos.
-- Reutiliza registro_sesiones/registro_series (v_prs y Mi Progreso se actualizan solos).
-- Privacidad (ADR-003, enmienda): el ranking solo expone "Nombre + inicial", sexo,
-- marca y ratio; nunca peso corporal crudo ni PII de terceros.

BEGIN;

-- Clase en la que se tomó la marca (nullable: las sesiones online no tienen clase).
ALTER TABLE public.registro_sesiones
  ADD COLUMN IF NOT EXISTS clase_id UUID;  -- sin FK: validada en la RPC (evita reordenar el respaldo)

CREATE INDEX IF NOT EXISTS idx_registro_sesiones_clase_id
  ON public.registro_sesiones (clase_id) WHERE clase_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Escritura: coach/admin registra la carga de un alumno de Funcional.
-- Idempotente: misma (alumno, clase, fecha, ejercicio) actualiza la marca.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_marca_funcional(
  p_alumno_id UUID,
  p_ejercicio_id UUID,
  p_peso_kg NUMERIC,
  p_reps INTEGER,
  p_fecha DATE DEFAULT CURRENT_DATE,
  p_clase_id UUID DEFAULT NULL,
  p_peso_corporal_kg NUMERIC DEFAULT NULL,
  p_sexo TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sesion_id UUID;
  v_fecha TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.es_admin() OR public.es_entrenador_de(p_alumno_id)) THEN
    RAISE EXCEPTION 'Solo el entrenador del alumno o un admin puede registrar marcas' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.alumno_actividades
    WHERE alumno_id = p_alumno_id AND actividad = 'FUNCIONAL'
  ) THEN
    RAISE EXCEPTION 'El alumno no tiene Funcional habilitado' USING ERRCODE = '22023';
  END IF;
  IF p_peso_kg IS NULL OR p_peso_kg <= 0 OR p_peso_kg > 1000 THEN
    RAISE EXCEPTION 'peso_kg fuera de rango (0-1000]' USING ERRCODE = '22023';
  END IF;
  IF p_reps IS NULL OR p_reps < 1 OR p_reps > 100 THEN
    RAISE EXCEPTION 'reps fuera de rango [1-100]' USING ERRCODE = '22023';
  END IF;
  IF p_fecha IS NULL OR p_fecha > CURRENT_DATE THEN
    RAISE EXCEPTION 'fecha inválida' USING ERRCODE = '22023';
  END IF;
  IF p_peso_corporal_kg IS NOT NULL AND (p_peso_corporal_kg < 20 OR p_peso_corporal_kg > 500) THEN
    RAISE EXCEPTION 'peso_corporal_kg fuera de rango [20-500]' USING ERRCODE = '22023';
  END IF;
  IF p_sexo IS NOT NULL AND p_sexo NOT IN ('M', 'F') THEN
    RAISE EXCEPTION 'sexo debe ser M o F' USING ERRCODE = '22023';
  END IF;
  IF p_clase_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clases WHERE id = p_clase_id AND actividad = 'FUNCIONAL'
  ) THEN
    RAISE EXCEPTION 'La clase no existe o no es de Funcional' USING ERRCODE = '22023';
  END IF;

  IF p_peso_corporal_kg IS NOT NULL OR p_sexo IS NOT NULL THEN
    UPDATE public.perfiles
    SET peso_corporal_kg = COALESCE(p_peso_corporal_kg, peso_corporal_kg),
        sexo = COALESCE(p_sexo, sexo)
    WHERE id = p_alumno_id;
  END IF;

  -- Mediodía UTC: evita que el cast ::date de v_prs cambie el día.
  v_fecha := (p_fecha + TIME '12:00') AT TIME ZONE 'UTC';

  SELECT id INTO v_sesion_id
  FROM public.registro_sesiones
  WHERE alumno_id = p_alumno_id
    AND dia_id IS NULL
    AND fecha = v_fecha
    AND clase_id IS NOT DISTINCT FROM p_clase_id
  ORDER BY created_at
  LIMIT 1;

  IF v_sesion_id IS NULL THEN
    INSERT INTO public.registro_sesiones (alumno_id, fecha, clase_id)
    VALUES (p_alumno_id, v_fecha, p_clase_id)
    RETURNING id INTO v_sesion_id;
  END IF;

  INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, set_type)
  VALUES (v_sesion_id, p_ejercicio_id, 1, p_peso_kg, p_reps, true, 'NORMAL')
  ON CONFLICT (sesion_id, ejercicio_id, numero_serie)
  DO UPDATE SET peso_kg = EXCLUDED.peso_kg, reps_hechas = EXCLUDED.reps_hechas, completada = true;

  RETURN v_sesion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_marca_funcional(UUID, UUID, NUMERIC, INTEGER, DATE, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_marca_funcional(UUID, UUID, NUMERIC, INTEGER, DATE, UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Lectura: ranking de Funcional con privacidad estricta.
-- Posición por (ejercicio, sexo) ordenada por ratio; sin ratio => sin posición.
-- ---------------------------------------------------------------------------
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
      -- Nombre + inicial del último término (apellido).
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
  )
  SELECT
    b.ej_id,
    b.a_id = auth.uid(),
    b.nombre,
    b.sx,
    b.pk,
    b.rp,
    b.fch,
    b.rt,
    CASE WHEN b.rt IS NOT NULL AND b.sx IS NOT NULL
      THEN rank() OVER (PARTITION BY b.ej_id, b.sx ORDER BY b.rt DESC NULLS LAST, b.pk DESC)
    END
  FROM base b
  ORDER BY b.ej_id, b.sx NULLS LAST, 9, b.pk DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_ranking_funcional_alumno(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_ranking_funcional_alumno(UUID) TO authenticated, service_role;

COMMIT;
