-- ============================================================================
-- GOZSter: Modelo Unificado de Dolor (Escala EVA 0-10, Estado Único y Trigger de Espejo)
-- Archivo: supabase/migrations/20261106110000_dolor_eva_estado_unico.sql
-- Issue: GOZS-370 | Epic: GOZS-368 (Lote 1: Backend Cimientos BE-02)
-- Idempotente para PostgreSQL 15+ / Supabase
-- ============================================================================

-- 1. Agregar columna eva con check 0-10 a public.alumno_historial_dolor
ALTER TABLE public.alumno_historial_dolor
  ADD COLUMN IF NOT EXISTS eva SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'alumno_historial_dolor_eva_check'
  ) THEN
    ALTER TABLE public.alumno_historial_dolor
      ADD CONSTRAINT alumno_historial_dolor_eva_check CHECK (eva BETWEEN 0 AND 10);
  END IF;
END $$;

-- 2. Backfill idempotente: LEVE -> 3, MODERADO -> 5, AGUDO -> 8
UPDATE public.alumno_historial_dolor
SET eva = CASE
  WHEN severidad = 'LEVE' THEN 3
  WHEN severidad = 'MODERADO' THEN 5
  WHEN severidad = 'AGUDO' THEN 8
  ELSE 5
END
WHERE eva IS NULL;

-- 3. Derivación automática de severidad a partir de eva (BEFORE INSERT/UPDATE)
CREATE OR REPLACE FUNCTION public.fn_derivar_severidad_dolor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si viene valor en eva, la severidad se deriva automáticamente
  IF NEW.eva IS NOT NULL THEN
    IF NEW.eva >= 7 THEN
      NEW.severidad := 'AGUDO';
    ELSIF NEW.eva >= 4 THEN
      NEW.severidad := 'MODERADO';
    ELSE
      NEW.severidad := 'LEVE';
    END IF;
  -- Si eva es nulo pero viene severidad textual, asignar el valor EVA estándar
  ELSIF NEW.severidad IS NOT NULL THEN
    IF NEW.severidad = 'AGUDO' THEN
      NEW.eva := 8;
    ELSIF NEW.severidad = 'MODERADO' THEN
      NEW.eva := 5;
    ELSE
      NEW.eva := 3;
    END IF;
  ELSE
    NEW.eva := 5;
    NEW.severidad := 'MODERADO';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alumno_historial_dolor_derivar_severidad ON public.alumno_historial_dolor;
CREATE TRIGGER trg_alumno_historial_dolor_derivar_severidad
  BEFORE INSERT OR UPDATE OF eva, severidad ON public.alumno_historial_dolor
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_derivar_severidad_dolor();

-- 4. Unificación de estado en PENDIENTE / ATENDIDO / RESUELTO
-- Dropear constraint previa primero para permitir la migración de 'CERRADO' a 'RESUELTO'
ALTER TABLE public.alumno_historial_dolor
  DROP CONSTRAINT IF EXISTS alumno_historial_dolor_estado_check;

UPDATE public.alumno_historial_dolor
SET estado = 'RESUELTO'
WHERE estado = 'CERRADO';

ALTER TABLE public.alumno_historial_dolor
  ADD CONSTRAINT alumno_historial_dolor_estado_check
  CHECK (estado IN ('PENDIENTE', 'ATENDIDO', 'RESUELTO'));

-- Actualizar estados y constraints en alertas_entrenador para coherencia
ALTER TABLE public.alertas_entrenador
  DROP CONSTRAINT IF EXISTS alertas_entrenador_estado_check;

UPDATE public.alertas_entrenador
SET estado = 'RESUELTO'
WHERE estado = 'CERRADO';

ALTER TABLE public.alertas_entrenador
  ADD CONSTRAINT alertas_entrenador_estado_check
  CHECK (estado IN ('PENDIENTE', 'ATENDIDO', 'RESUELTO', 'IGNORADO', 'CERRADO'));

-- 5. Trigger de creación de alerta con mapeo unificado de severidad
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
  v_severidad_alerta TEXT;
BEGIN
  -- Dispara con síntomas de alarma (es_sintoma_alarma = true) o dolor agudo (severidad AGUDO / eva >= 7)
  IF (NEW.es_sintoma_alarma = true OR NEW.severidad = 'AGUDO' OR (NEW.eva IS NOT NULL AND NEW.eva >= 7))
     AND (
       TG_OP = 'INSERT'
       OR (
         (OLD.es_sintoma_alarma IS DISTINCT FROM true)
         AND (OLD.severidad IS DISTINCT FROM 'AGUDO')
         AND (OLD.eva IS NULL OR OLD.eva < 7)
       )
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
        ELSE 'Dolor agudo reportado (' || COALESCE(NEW.eva::text, '7-10') || '/10)'
      END ||
      CASE
        WHEN NEW.notas_alumno IS NOT NULL AND TRIM(NEW.notas_alumno) <> ''
          THEN ' | Notas: ' || TRIM(NEW.notas_alumno)
        ELSE ''
      END;

    -- Severidad unificada:
    -- Si es síntoma de alarma es CRITICA; si no, dolor agudo es ALTA, moderado MEDIA, leve BAJA
    v_severidad_alerta := CASE
      WHEN NEW.es_sintoma_alarma = true THEN 'CRITICA'
      WHEN NEW.severidad = 'AGUDO' OR (NEW.eva IS NOT NULL AND NEW.eva >= 7) THEN 'ALTA'
      WHEN NEW.severidad = 'MODERADO' OR (NEW.eva IS NOT NULL AND NEW.eva >= 4) THEN 'MEDIA'
      ELSE 'BAJA'
    END;

    INSERT INTO public.alertas_entrenador (
      alumno_id, profesor_id, ejercicio_id, tipo_alerta, severidad, titulo, detalle, estado, reporte_dolor_id
    ) VALUES (
      NEW.alumno_id, v_profesor_id, NEW.ejercicio_id, 'DOLOR_ARTICULAR', v_severidad_alerta, v_titulo, v_detalle, NEW.estado, NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alumno_historial_dolor_alerta_critica ON public.alumno_historial_dolor;
CREATE TRIGGER trg_alumno_historial_dolor_alerta_critica
  AFTER INSERT OR UPDATE OF es_sintoma_alarma, severidad, eva ON public.alumno_historial_dolor
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_crear_alerta_sintoma_alarma();

-- 6. Trigger AFTER UPDATE que espeja severidad y estado a public.alertas_entrenador
CREATE OR REPLACE FUNCTION public.fn_espejar_dolor_a_alertas()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_severidad_alerta TEXT;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_severidad_alerta := CASE
    WHEN NEW.es_sintoma_alarma = true THEN 'CRITICA'
    WHEN NEW.severidad = 'AGUDO' OR (NEW.eva IS NOT NULL AND NEW.eva >= 7) THEN 'ALTA'
    WHEN NEW.severidad = 'MODERADO' OR (NEW.eva IS NOT NULL AND NEW.eva >= 4) THEN 'MEDIA'
    ELSE 'BAJA'
  END;

  UPDATE public.alertas_entrenador
  SET
    estado = NEW.estado,
    severidad = v_severidad_alerta,
    resuelto_at = CASE WHEN NEW.estado = 'RESUELTO' THEN COALESCE(resuelto_at, now()) ELSE NULL END,
    resuelto_por = CASE WHEN NEW.estado = 'RESUELTO' THEN COALESCE(resuelto_por, auth.uid()) ELSE NULL END,
    updated_at = now()
  WHERE reporte_dolor_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alumno_historial_dolor_espejo_alertas ON public.alumno_historial_dolor;
CREATE TRIGGER trg_alumno_historial_dolor_espejo_alertas
  AFTER UPDATE OF estado, severidad, eva, es_sintoma_alarma ON public.alumno_historial_dolor
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_espejar_dolor_a_alertas();

-- 7. Vista public.v_dolor_activo (security_invoker = true)
DROP VIEW IF EXISTS public.v_dolor_activo;

CREATE VIEW public.v_dolor_activo
WITH (security_invoker = true)
AS
SELECT
  h.id,
  h.alumno_id,
  p.nombre_completo AS alumno_nombre,
  p.email AS alumno_email,
  h.ejercicio_id,
  e.nombre AS ejercicio_nombre,
  h.zona_articular,
  h.eva,
  h.severidad,
  CASE
    WHEN COALESCE(h.eva, 5) >= 7 THEN 'alto'
    WHEN COALESCE(h.eva, 5) >= 4 THEN 'medio'
    ELSE 'bajo'
  END AS nivel,
  h.estado,
  h.estado_recuperacion,
  h.momento_aparicion,
  h.es_sintoma_alarma,
  h.sintomas_alarma,
  h.notas_alumno,
  h.notas_profesor,
  h.fecha_reporte,
  h.created_at,
  h.updated_at
FROM public.alumno_historial_dolor h
LEFT JOIN public.perfiles p ON p.id = h.alumno_id
LEFT JOIN public.ejercicios e ON e.id = h.ejercicio_id
WHERE h.estado IN ('PENDIENTE', 'ATENDIDO');

GRANT SELECT ON public.v_dolor_activo TO authenticated, service_role, anon;

-- 8. RPC public.actualizar_estado_dolor
CREATE OR REPLACE FUNCTION public.actualizar_estado_dolor(
  p_reporte_id UUID,
  p_nuevo_estado TEXT,
  p_nota TEXT DEFAULT NULL
)
RETURNS public.alumno_historial_dolor
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reporte public.alumno_historial_dolor%ROWTYPE;
  v_nuevo_estado TEXT := upper(btrim(COALESCE(p_nuevo_estado, '')));
  v_nota_limpia TEXT := btrim(COALESCE(p_nota, ''));
  v_caller_id UUID := auth.uid();
BEGIN
  -- 1. Validar nuevo estado
  IF v_nuevo_estado NOT IN ('PENDIENTE', 'ATENDIDO', 'RESUELTO') THEN
    RAISE EXCEPTION 'Estado no válido: %. Debe ser PENDIENTE, ATENDIDO o RESUELTO.', v_nuevo_estado
      USING ERRCODE = '22023';
  END IF;

  -- 2. Buscar caso existente con bloqueo FOR UPDATE
  SELECT * INTO v_reporte
  FROM public.alumno_historial_dolor
  WHERE id = p_reporte_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reporte de dolor con ID % no encontrado.', p_reporte_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Permisos (RLS check / authorization)
  IF NOT (
    v_caller_id IS NULL
    OR v_caller_id = v_reporte.alumno_id
    OR public.es_entrenador_de(v_reporte.alumno_id)
    OR public.es_admin()
    OR auth.role() = 'service_role'
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para actualizar este caso de dolor.'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Validación de reapertura: si el caso está RESUELTO y se pasa a PENDIENTE/ATENDIDO, es obligatoria la nota
  IF v_reporte.estado = 'RESUELTO' AND v_nuevo_estado IN ('PENDIENTE', 'ATENDIDO') THEN
    IF v_nota_limpia = '' THEN
      RAISE EXCEPTION 'Para reabrir un caso de dolor resuelto es obligatorio incluir una nota o motivo explicativo.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 5. Actualizar notas si se provee una nota
  IF v_nota_limpia <> '' THEN
    IF v_reporte.notas_profesor IS NOT NULL AND btrim(v_reporte.notas_profesor) <> '' THEN
      v_reporte.notas_profesor := v_reporte.notas_profesor || ' | ' || v_nota_limpia;
    ELSE
      v_reporte.notas_profesor := v_nota_limpia;
    END IF;
  END IF;

  -- 6. Actualizar registro en alumno_historial_dolor
  UPDATE public.alumno_historial_dolor
  SET
    estado = v_nuevo_estado,
    estado_recuperacion = CASE
      WHEN v_nuevo_estado = 'RESUELTO' THEN 'RESUELTO'
      WHEN v_nuevo_estado = 'ATENDIDO' THEN 'EN_RECUPERACION'
      ELSE 'ACTIVO'
    END,
    notas_profesor = v_reporte.notas_profesor,
    updated_at = now()
  WHERE id = p_reporte_id
  RETURNING * INTO v_reporte;

  RETURN v_reporte;
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_estado_dolor(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_dolor(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 9. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_eva
  ON public.alumno_historial_dolor (eva);

CREATE INDEX IF NOT EXISTS idx_alumno_historial_dolor_activos
  ON public.alumno_historial_dolor (alumno_id, estado)
  WHERE estado IN ('PENDIENTE', 'ATENDIDO');
