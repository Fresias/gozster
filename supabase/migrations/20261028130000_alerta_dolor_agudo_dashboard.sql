-- ============================================================================
-- GOZS-237: Alerta de dolor agudo (>= 7/10) debe llegar al dashboard del coach
-- Causa raíz: fn_crear_alerta_sintoma_alarma solo disparaba con es_sintoma_alarma = true.
-- Un reporte con severidad AGUDO (escala 7-10) sin flag de alarma no generaba alerta.
-- Cambio quirúrgico: el trigger también dispara con severidad = 'AGUDO'. Idempotente.
-- ============================================================================

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
      alumno_id, profesor_id, ejercicio_id, tipo_alerta, severidad, titulo, detalle, estado
    ) VALUES (
      NEW.alumno_id, v_profesor_id, NEW.ejercicio_id, 'DOLOR_ARTICULAR', 'CRITICA', v_titulo, v_detalle, 'PENDIENTE'
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

-- Backfill: reportes AGUDO previos que quedaron sin alerta (p. ej. el de Fernando).
INSERT INTO public.alertas_entrenador (
  alumno_id, profesor_id, ejercicio_id, tipo_alerta, severidad, titulo, detalle, estado
)
SELECT
  h.alumno_id,
  COALESCE(
    p.profesor_asignado_id,
    (SELECT ea.entrenador_id FROM public.entrenador_alumnos ea
      WHERE ea.alumno_id = h.alumno_id ORDER BY ea.created_at DESC LIMIT 1),
    (SELECT id FROM public.perfiles WHERE rol IN ('ENTRENADOR', 'ADMIN') ORDER BY created_at ASC LIMIT 1),
    h.alumno_id
  ),
  h.ejercicio_id,
  'DOLOR_ARTICULAR',
  'CRITICA',
  'RED FLAG: ' || COALESCE(e.nombre, 'Ejercicio') || ' (' || h.zona_articular || ')',
  'Dolor agudo reportado (7-10/10)' ||
    CASE WHEN h.notas_alumno IS NOT NULL AND TRIM(h.notas_alumno) <> ''
      THEN ' | Notas: ' || TRIM(h.notas_alumno) ELSE '' END,
  'PENDIENTE'
FROM public.alumno_historial_dolor h
JOIN public.perfiles p ON p.id = h.alumno_id
LEFT JOIN public.ejercicios e ON e.id = h.ejercicio_id
WHERE h.severidad = 'AGUDO'
  AND h.es_sintoma_alarma IS NOT TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.alertas_entrenador a
    WHERE a.alumno_id = h.alumno_id
      AND a.tipo_alerta = 'DOLOR_ARTICULAR'
      AND a.ejercicio_id IS NOT DISTINCT FROM h.ejercicio_id
      AND a.created_at >= h.created_at
  );
