-- GOZS-290: biblioteca de rutinas. `tipo` explícito (antes inferido por alumno_id IS NULL),
-- `etiqueta` opcional y `plan_origen_id` para trazar de qué plan se clonó.
-- También corrige clonar_plan_entrenamiento: copiaba solo parte de ejercicios_en_rutina.
ALTER TABLE public.planes_entrenamiento
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'DE_ALUMNO',
  ADD COLUMN IF NOT EXISTS etiqueta TEXT,
  ADD COLUMN IF NOT EXISTS plan_origen_id UUID REFERENCES public.planes_entrenamiento(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_planes_entrenamiento_tipo'
      AND conrelid = 'public.planes_entrenamiento'::regclass
  ) THEN
    ALTER TABLE public.planes_entrenamiento
      ADD CONSTRAINT chk_planes_entrenamiento_tipo CHECK (tipo IN ('PLANTILLA', 'DE_ALUMNO'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_planes_entrenamiento_etiqueta'
      AND conrelid = 'public.planes_entrenamiento'::regclass
  ) THEN
    ALTER TABLE public.planes_entrenamiento
      ADD CONSTRAINT chk_planes_entrenamiento_etiqueta CHECK (etiqueta IS NULL OR etiqueta IN ('STANDARD'));
  END IF;
END $$;

UPDATE public.planes_entrenamiento SET tipo = 'PLANTILLA' WHERE alumno_id IS NULL AND tipo <> 'PLANTILLA';

CREATE INDEX IF NOT EXISTS idx_planes_entrenamiento_plan_origen
  ON public.planes_entrenamiento (plan_origen_id) WHERE plan_origen_id IS NOT NULL;

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
      force_rpe_required
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
      e.force_rpe_required
    FROM public.ejercicios_en_rutina e
    WHERE e.dia_id = r_dia.id
    ORDER BY e.orden ASC;
  END LOOP;

  RETURN v_nuevo_plan_id;
END;
$$;
-- RLS: sin cambios; las políticas existentes de la tabla cubren las columnas nuevas.
