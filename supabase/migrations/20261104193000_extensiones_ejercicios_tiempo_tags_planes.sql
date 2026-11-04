-- ============================================================================
-- GOZSter: Extensiones de Esquema SQL para Ejercicios por Tiempo, Unilaterales,
-- Tags de Rutina y Planes $0 con Notas (GOZS-358)
-- ============================================================================

BEGIN;

-- 1. EXTENSIÓN: public.ejercicios_en_rutina
-- tipo_medicion: 'REPS' | 'TIEMPO' (default 'REPS')
-- tiempo_objetivo_segundos: integer (null)
-- es_unilateral: boolean (default false)

ALTER TABLE public.ejercicios_en_rutina
  ADD COLUMN IF NOT EXISTS tipo_medicion TEXT NOT NULL DEFAULT 'REPS',
  ADD COLUMN IF NOT EXISTS tiempo_objetivo_segundos INTEGER,
  ADD COLUMN IF NOT EXISTS es_unilateral BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ejercicios_en_rutina'::regclass
      AND conname = 'chk_ejercicios_en_rutina_tipo_medicion'
  ) THEN
    ALTER TABLE public.ejercicios_en_rutina
      ADD CONSTRAINT chk_ejercicios_en_rutina_tipo_medicion
      CHECK (tipo_medicion IN ('REPS', 'TIEMPO'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ejercicios_en_rutina'::regclass
      AND conname = 'chk_ejercicios_en_rutina_tiempo_objetivo'
  ) THEN
    ALTER TABLE public.ejercicios_en_rutina
      ADD CONSTRAINT chk_ejercicios_en_rutina_tiempo_objetivo
      CHECK (tiempo_objetivo_segundos IS NULL OR tiempo_objetivo_segundos >= 0);
  END IF;
END $$;

-- 2. EXTENSIÓN: public.planes_entrenamiento
-- tags: TEXT[] default '{}'
-- Check: solo permite ('Fuerza', 'Hipertrofia', 'Rehabilitación', 'Potencia', 'Peso Corporal')

ALTER TABLE public.planes_entrenamiento
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.planes_entrenamiento'::regclass
      AND conname = 'chk_planes_entrenamiento_tags'
  ) THEN
    ALTER TABLE public.planes_entrenamiento
      ADD CONSTRAINT chk_planes_entrenamiento_tags
      CHECK (tags <@ ARRAY['Fuerza', 'Hipertrofia', 'Rehabilitación', 'Potencia', 'Peso Corporal']::TEXT[]);
  END IF;
END $$;

-- 3. EXTENSIÓN: public.planes_membresia
-- notas: TEXT (opcional)
-- Ajustar check de precio para admitir precio >= 0

ALTER TABLE public.planes_membresia
  ADD COLUMN IF NOT EXISTS notas TEXT;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.planes_membresia'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%precio > 0%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.planes_membresia DROP CONSTRAINT %I', r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.planes_membresia'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%precio >= 0%'
  ) THEN
    ALTER TABLE public.planes_membresia
      ADD CONSTRAINT chk_planes_membresia_precio CHECK (precio >= 0);
  END IF;

  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.planes_membresia_precios'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%precio > 0%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.planes_membresia_precios DROP CONSTRAINT %I', r.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.planes_membresia_precios'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%precio >= 0%'
  ) THEN
    ALTER TABLE public.planes_membresia_precios
      ADD CONSTRAINT chk_planes_membresia_precios_precio CHECK (precio >= 0);
  END IF;
END $$;

-- 4. ACTUALIZACIÓN: public.clonar_plan_entrenamiento
-- Preservar tags en planes_entrenamiento y tipo_medicion, tiempo_objetivo_segundos,
-- es_unilateral en ejercicios_en_rutina durante la clonación.

CREATE OR REPLACE FUNCTION public.clonar_plan_entrenamiento(
  p_plan_id UUID,
  p_nuevo_nombre TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_origen public.planes_entrenamiento%ROWTYPE;
  v_nuevo_plan_id UUID;
  v_nuevo_dia_id UUID;
  v_nombre_final TEXT;
  r_dia RECORD;
BEGIN
  SELECT * INTO v_plan_origen
  FROM public.planes_entrenamiento
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan de entrenamiento no encontrado con ID: %', p_plan_id;
  END IF;

  IF NOT (
    public.es_admin()
    OR v_plan_origen.profesor_id = auth.uid()
    OR (v_plan_origen.alumno_id IS NOT NULL AND public.es_entrenador_de(v_plan_origen.alumno_id))
    OR (v_plan_origen.alumno_id IS NULL AND public.es_entrenador_o_admin())
  ) THEN
    RAISE EXCEPTION 'No autorizado para clonar este plan de entrenamiento';
  END IF;

  v_nombre_final := COALESCE(NULLIF(TRIM(p_nuevo_nombre), ''), v_plan_origen.nombre || ' (Copia)');

  INSERT INTO public.planes_entrenamiento (
    profesor_id,
    alumno_id,
    nombre,
    estado,
    comentarios,
    fecha_inicio,
    fecha_fin,
    tipo,
    etiqueta,
    tags,
    plan_origen_id
  )
  VALUES (
    COALESCE(auth.uid(), v_plan_origen.profesor_id),
    v_plan_origen.alumno_id,
    v_nombre_final,
    'BORRADOR',
    v_plan_origen.comentarios,
    now(),
    NULL,
    v_plan_origen.tipo,
    v_plan_origen.etiqueta,
    COALESCE(v_plan_origen.tags, '{}'),
    v_plan_origen.id
  )
  RETURNING id INTO v_nuevo_plan_id;

  FOR r_dia IN
    SELECT id, nombre, orden
    FROM public.dias_rutina
    WHERE plan_id = p_plan_id
    ORDER BY orden ASC
  LOOP
    INSERT INTO public.dias_rutina (plan_id, nombre, orden)
    VALUES (v_nuevo_plan_id, r_dia.nombre, r_dia.orden)
    RETURNING id INTO v_nuevo_dia_id;

    INSERT INTO public.ejercicios_en_rutina (
      dia_id,
      ejercicio_id,
      orden,
      series,
      repeticiones,
      descanso_segundos,
      rpe_objetivo,
      notas,
      es_superserie,
      grupo_superserie,
      tempo,
      tempo_activo,
      tipo_serie,
      force_rpe_required,
      tipo_medicion,
      tiempo_objetivo_segundos,
      es_unilateral
    )
    SELECT
      v_nuevo_dia_id,
      e.ejercicio_id,
      e.orden,
      e.series,
      e.repeticiones,
      e.descanso_segundos,
      e.rpe_objetivo,
      e.notas,
      e.es_superserie,
      e.grupo_superserie,
      e.tempo,
      e.tempo_activo,
      e.tipo_serie,
      e.force_rpe_required,
      e.tipo_medicion,
      e.tiempo_objetivo_segundos,
      e.es_unilateral
    FROM public.ejercicios_en_rutina e
    WHERE e.dia_id = r_dia.id
    ORDER BY e.orden ASC;
  END LOOP;

  RETURN v_nuevo_plan_id;
END;
$$;

COMMIT;
