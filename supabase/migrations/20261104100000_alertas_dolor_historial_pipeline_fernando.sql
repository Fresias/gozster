-- ============================================================================
-- GOZS-348: Pipeline reactivo de alertas de dolor en dashboard (Fix caso Fernando)
-- Vinculación de alumno_historial_dolor con alertas_entrenador (reporte_dolor_id)
-- Idempotente y estrictamente append-only.
-- ============================================================================

-- 1. Agregar columna reporte_dolor_id a alertas_entrenador si no existe
ALTER TABLE public.alertas_entrenador
  ADD COLUMN IF NOT EXISTS reporte_dolor_id UUID REFERENCES public.alumno_historial_dolor(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_alertas_entrenador_reporte_dolor_id
  ON public.alertas_entrenador (reporte_dolor_id);

-- 2. Actualizar función trigger para registrar reporte_dolor_id y capturar severidad
CREATE OR REPLACE FUNCTION public.fn_crear_alerta_sintoma_alarma()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profesor_id UUID;
  v_ejercicio_nombre TEXT;
  v_detalle TEXT;
  v_titulo TEXT;
BEGIN
  -- Dispara con síntomas de alarma (es_sintoma_alarma = true) o severidad AGUDO (7-10/10)
  IF (NEW.es_sintoma_alarma = true OR NEW.severidad = 'AGUDO')
     AND (
       TG_OP = 'INSERT'
       OR (OLD.es_sintoma_alarma IS DISTINCT FROM true AND OLD.severidad IS DISTINCT FROM 'AGUDO')
     ) THEN
    SELECT p.profesor_asignado_id INTO v_profesor_id
    FROM public.perfiles p
    WHERE p.id = NEW.alumno_id;

    IF v_profesor_id IS NULL THEN
      SELECT ea.entrenador_id INTO v_profesor_id
      FROM public.entrenador_alumnos ea
      WHERE ea.alumno_id = NEW.alumno_id
      ORDER BY ea.created_at DESC
      LIMIT 1;
    END IF;

    IF v_profesor_id IS NULL THEN
      SELECT id INTO v_profesor_id
      FROM public.perfiles
      WHERE rol IN ('ENTRENADOR', 'ADMIN')
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;

    IF v_profesor_id IS NULL THEN
      v_profesor_id := NEW.alumno_id;
    END IF;

    SELECT nombre INTO v_ejercicio_nombre
    FROM public.ejercicios
    WHERE id = NEW.ejercicio_id;

    v_titulo := 'RED FLAG: ' || COALESCE(v_ejercicio_nombre, 'Ejercicio') || ' (' || NEW.zona_articular || ')';
    v_detalle := CASE
        WHEN array_length(NEW.sintomas_alarma, 1) > 0
          THEN 'Síntomas de alarma reportados: ' || array_to_string(NEW.sintomas_alarma, ', ')
        WHEN NEW.es_sintoma_alarma = true THEN 'Síntomas de alarma reportados: Riesgo agudo reportado'
        ELSE 'Dolor agudo reportado (7-10/10)'
      END ||
      CASE
        WHEN NEW.notas_alumno IS NOT NULL AND TRIM(NEW.notas_alumno) <> ''
          THEN ' | Notas: ' || TRIM(NEW.notas_alumno)
        ELSE ''
      END;

    INSERT INTO public.alertas_entrenador (
      alumno_id, profesor_id, ejercicio_id, tipo_alerta, severidad, titulo, detalle, estado, reporte_dolor_id
    ) VALUES (
      NEW.alumno_id, v_profesor_id, NEW.ejercicio_id, 'DOLOR_ARTICULAR', 'CRITICA', v_titulo, v_detalle, 'PENDIENTE', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alumno_historial_dolor_alerta_critica ON public.alumno_historial_dolor;
CREATE TRIGGER trg_alumno_historial_dolor_alerta_critica
  AFTER INSERT OR UPDATE OF es_sintoma_alarma, severidad ON public.alumno_historial_dolor
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_crear_alerta_sintoma_alarma();

-- 3. Backfill: vincular reporte_dolor_id en alertas_entrenador preexistentes
UPDATE public.alertas_entrenador a
SET reporte_dolor_id = h.id
FROM public.alumno_historial_dolor h
WHERE a.alumno_id = h.alumno_id
  AND a.ejercicio_id IS NOT DISTINCT FROM h.ejercicio_id
  AND a.reporte_dolor_id IS NULL;
