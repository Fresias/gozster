-- ============================================================================
-- GOZSter: Ola 1 Base Backend — v_dolor_activo.nivel, permisos, actualizar_estado_dolor y registrar_pago (4 medios)
-- Archivo: supabase/migrations/20261107000000_ola1_dolor_nivel_permisos_registrar_pago.sql
-- Issue: GOZS-406 | Epic: GOZS-368 (Ola 1 · Base Backend: 09-respuesta-pm.md P10, P16 y 07-revision-implementacion.md §4 P1-3, §5.7, §8 FIX-03/FIX-06)
-- Idempotente para PostgreSQL 15+ / Supabase (Estrictamente append-only)
--
-- Nota de diseño sobre fn_derivar_severidad_dolor:
--   La columna severidad en public.alumno_historial_dolor es derivada automáticamente
--   desde (eva, es_sintoma_alarma) en BEFORE INSERT OR UPDATE:
--     - es_sintoma_alarma = true -> 'CRITICA'
--     - eva >= 7                 -> 'AGUDO'
--     - eva >= 4                 -> 'MODERADO'
--     - eva < 4                  -> 'LEVE'
--   Cualquier UPDATE que intente cambiar únicamente severidad sin modificar eva ni
--   es_sintoma_alarma recalculará severidad a partir de (eva, es_sintoma_alarma).
--
-- Rollback manual (referencia):
--   Restaurar definiciones previas de 20261106110000_dolor_eva_estado_unico.sql y
--   20261027120000_agenda_cobros_coach.sql.
-- ============================================================================

-- 1. Ampliar constraint de severidad en alumno_historial_dolor para admitir 'CRITICA'
--    cuando es_sintoma_alarma = true, y actualizar fn_derivar_severidad_dolor()
ALTER TABLE public.alumno_historial_dolor
  DROP CONSTRAINT IF EXISTS alumno_historial_dolor_severidad_check;

ALTER TABLE public.alumno_historial_dolor
  ADD CONSTRAINT alumno_historial_dolor_severidad_check
  CHECK (severidad IN ('LEVE', 'MODERADO', 'AGUDO', 'CRITICA'));

CREATE OR REPLACE FUNCTION public.fn_derivar_severidad_dolor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si eva es nulo pero viene severidad textual, asignar el valor EVA estándar
  IF NEW.eva IS NULL THEN
    IF NEW.severidad IN ('AGUDO', 'CRITICA') THEN
      NEW.eva := 8;
    ELSIF NEW.severidad = 'MODERADO' THEN
      NEW.eva := 5;
    ELSIF NEW.severidad = 'LEVE' THEN
      NEW.eva := 3;
    ELSE
      NEW.eva := 5;
    END IF;
  END IF;

  -- Derivación automática de severidad a partir de (eva, es_sintoma_alarma)
  IF COALESCE(NEW.es_sintoma_alarma, false) = true THEN
    NEW.severidad := 'CRITICA';
  ELSIF NEW.eva >= 7 THEN
    NEW.severidad := 'AGUDO';
  ELSIF NEW.eva >= 4 THEN
    NEW.severidad := 'MODERADO';
  ELSE
    NEW.severidad := 'LEVE';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_derivar_severidad_dolor() IS
  'Deriva automáticamente severidad en public.alumno_historial_dolor desde (eva, es_sintoma_alarma) en BEFORE INSERT OR UPDATE: es_sintoma_alarma = true -> CRITICA, eva >= 7 -> AGUDO, eva >= 4 -> MODERADO, eva < 4 -> LEVE.';

DROP TRIGGER IF EXISTS trg_alumno_historial_dolor_derivar_severidad ON public.alumno_historial_dolor;
CREATE TRIGGER trg_alumno_historial_dolor_derivar_severidad
  BEFORE INSERT OR UPDATE OF eva, severidad, es_sintoma_alarma ON public.alumno_historial_dolor
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_derivar_severidad_dolor();

-- Sincronizar filas existentes con síntoma de alarma activo
UPDATE public.alumno_historial_dolor
SET severidad = 'CRITICA'
WHERE es_sintoma_alarma = true
  AND severidad IS DISTINCT FROM 'CRITICA';

-- 2. Recrear vista public.v_dolor_activo (security_invoker = true) con nivel corregido
--    y revocar acceso a PUBLIC y anon
CREATE OR REPLACE VIEW public.v_dolor_activo
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
    WHEN h.es_sintoma_alarma = true OR h.severidad = 'CRITICA' OR COALESCE(h.eva, 5) >= 7 THEN 'alto'
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

REVOKE ALL ON public.v_dolor_activo FROM PUBLIC, anon;
GRANT SELECT ON public.v_dolor_activo TO authenticated, service_role;

-- 3. Restringir autorización en public.actualizar_estado_dolor exclusivamente a staff autorizado
--    (entrenador asignado, admin, service_role o contexto SQL sin JWT)
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

  -- 3. Permisos: un alumno autenticado no puede cambiar su propio estado clínico ni notas_profesor
  IF NOT (
    v_caller_id IS NULL
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

REVOKE ALL ON FUNCTION public.actualizar_estado_dolor(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_dolor(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 4. Ampliar public.registrar_pago (y registrar_pago_con_descuento) a los 4 medios de pago
--    ('TRANSFERENCIA', 'EFECTIVO', 'PASARELA_ONLINE', 'OTRO'; normalizando 'MERCADO_PAGO' -> 'PASARELA_ONLINE')
CREATE OR REPLACE FUNCTION public.registrar_pago(
  p_cobro_id UUID,
  p_monto NUMERIC,
  p_metodo TEXT
)
RETURNS public.cobros
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cobro public.cobros%ROWTYPE;
  v_metodo TEXT := CASE
    WHEN p_metodo = 'MERCADO_PAGO' THEN 'PASARELA_ONLINE'
    ELSE p_metodo
  END;
BEGIN
  IF v_metodo IS NULL OR v_metodo NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'PASARELA_ONLINE', 'OTRO') THEN
    RAISE EXCEPTION 'Método de pago inválido: debe ser TRANSFERENCIA, EFECTIVO, PASARELA_ONLINE u OTRO'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cobro FROM public.cobros WHERE id = p_cobro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobro no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(v_cobro.alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para registrar pagos de este alumno' USING ERRCODE = '42501';
  END IF;

  IF v_cobro.estado = 'PAGADO' THEN
    RAISE EXCEPTION 'El cobro ya está pagado' USING ERRCODE = 'GZ020';
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 OR p_monto < v_cobro.monto THEN
    RAISE EXCEPTION 'El monto debe cubrir el cobro (%)', v_cobro.monto USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pagos (
    contratacion_id, alumno_id, cobro_id, monto, medio_pago, estado,
    idempotency_key, confirmado_por, confirmado_at
  ) VALUES (
    v_cobro.contratacion_id, v_cobro.alumno_id, v_cobro.id, p_monto, v_metodo, 'CONFIRMADO',
    'cobro:' || v_cobro.id, auth.uid(), now()
  );

  UPDATE public.cobros SET estado = 'PAGADO' WHERE id = v_cobro.id
  RETURNING * INTO v_cobro;

  RETURN v_cobro;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago(UUID, NUMERIC, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_pago_con_descuento(
  p_cobro_id UUID,
  p_monto_cobrado NUMERIC,
  p_metodo TEXT,
  p_nota TEXT
)
RETURNS public.cobros
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cobro public.cobros%ROWTYPE;
  v_nota TEXT := NULLIF(btrim(p_nota), '');
  v_metodo TEXT := CASE
    WHEN p_metodo = 'MERCADO_PAGO' THEN 'PASARELA_ONLINE'
    ELSE p_metodo
  END;
BEGIN
  IF v_metodo IS NULL OR v_metodo NOT IN ('TRANSFERENCIA', 'EFECTIVO', 'PASARELA_ONLINE', 'OTRO') THEN
    RAISE EXCEPTION 'Método de pago inválido: debe ser TRANSFERENCIA, EFECTIVO, PASARELA_ONLINE u OTRO'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_cobro FROM public.cobros WHERE id = p_cobro_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cobro no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(v_cobro.alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para registrar pagos de este alumno' USING ERRCODE = '42501';
  END IF;

  IF v_cobro.estado = 'PAGADO' THEN
    RAISE EXCEPTION 'El cobro ya está pagado' USING ERRCODE = 'GZ020';
  END IF;

  IF p_monto_cobrado IS NULL OR p_monto_cobrado <= 0 OR p_monto_cobrado > v_cobro.monto THEN
    RAISE EXCEPTION 'El monto cobrado debe ser mayor a 0 y no superar el monto de lista (%)', v_cobro.monto
      USING ERRCODE = '22023';
  END IF;
  IF p_monto_cobrado < v_cobro.monto AND v_nota IS NULL THEN
    RAISE EXCEPTION 'Un cobro con descuento requiere una nota' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pagos (
    contratacion_id, alumno_id, cobro_id, monto, monto_lista, nota, medio_pago, estado,
    idempotency_key, confirmado_por, confirmado_at
  ) VALUES (
    v_cobro.contratacion_id, v_cobro.alumno_id, v_cobro.id, p_monto_cobrado, v_cobro.monto, v_nota,
    v_metodo, 'CONFIRMADO', 'cobro:' || v_cobro.id, auth.uid(), now()
  );

  UPDATE public.cobros SET estado = 'PAGADO' WHERE id = v_cobro.id
  RETURNING * INTO v_cobro;

  RETURN v_cobro;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_pago_con_descuento(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago_con_descuento(UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;
