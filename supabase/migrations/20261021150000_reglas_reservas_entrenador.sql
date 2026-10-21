-- ============================================================================
-- GOZSter: Reglas de reserva confirmadas por el entrenador (seguimiento #113)
-- Archivo: supabase/migrations/20261021150000_reglas_reservas_entrenador.sql
-- GitHub Issue: #113 | Multica Issue: GOZS-104
-- Idempotente para PostgreSQL 15+ / Supabase
--
-- Reglas del entrenador:
--   1. PENDIENTE_RENOVACION puede reservar (se mantiene en reservar_clase).
--   2. Contratación con fecha_inicio futura no puede reservar hasta que empiece (GZ004).
--   3. marcar_ausente solo se permite después de clases.inicio (GZ006).
--   4. Solo el profesor asignado (clases_profesores) o ADMIN pueden cambiar inicio y capacidad de una clase (42501).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. RPC: reservar_clase (rechazo de contrataciones con fecha_inicio futura)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reservar_clase(p_clase_id UUID)
RETURNS TABLE (reserva_id UUID, aviso TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_alumno UUID := auth.uid();
  v_clase public.clases%ROWTYPE;
  v_contratacion public.contrataciones%ROWTYPE;
  v_plan public.planes_membresia%ROWTYPE;
  v_fecha_clase DATE;
  v_lunes TIMESTAMPTZ;
  v_usadas INT;
  v_ocupados INT;
  v_reserva_id UUID;
BEGIN
  IF v_alumno IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_clase FROM public.clases WHERE id = p_clase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_clase.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'La clase fue cancelada' USING ERRCODE = 'GZ007';
  END IF;

  IF v_clase.inicio <= now() THEN
    RAISE EXCEPTION 'La clase ya comenzó' USING ERRCODE = 'GZ006';
  END IF;

  v_lunes := date_trunc('week', now() AT TIME ZONE c_tz) AT TIME ZONE c_tz;
  IF v_clase.inicio >= v_lunes + INTERVAL '7 days' THEN
    RAISE EXCEPTION 'Solo se puede reservar en la semana en curso' USING ERRCODE = 'GZ005';
  END IF;
  v_fecha_clase := (v_clase.inicio AT TIME ZONE c_tz)::date;

  -- Membresía: la contratación con plan de fecha_fin más reciente.
  -- Si el alumno tiene una membresía que ya inició y otra futura (renovación anticipada),
  -- priorizamos la que ya inició para que no se bloqueen sus reservas vigentes.
  SELECT * INTO v_contratacion
  FROM public.contrataciones
  WHERE alumno_id = v_alumno AND plan_membresia_id IS NOT NULL
  ORDER BY (fecha_inicio <= (now() AT TIME ZONE c_tz)::date) DESC, fecha_fin DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tenés una membresía de clases' USING ERRCODE = 'GZ004';
  END IF;

  IF v_contratacion.estado IN ('EN_PAUSA', 'VENCIDA') THEN
    RAISE EXCEPTION 'Tu membresía está %: no podés reservar', v_contratacion.estado
      USING ERRCODE = 'GZ004';
  END IF;

  -- VENCIDA la escribe un batch: entre corridas, fecha_fin ya pasada también rechaza.
  IF v_contratacion.fecha_fin < (now() AT TIME ZONE c_tz)::date THEN
    RAISE EXCEPTION 'Tu membresía venció el %: no podés reservar',
      to_char(v_contratacion.fecha_fin, 'DD/MM/YYYY')
      USING ERRCODE = 'GZ004';
  END IF;

  -- Una contratación con fecha_inicio futura no puede reservar hasta que empiece.
  IF v_contratacion.fecha_inicio > (now() AT TIME ZONE c_tz)::date THEN
    RAISE EXCEPTION 'Tu membresía inicia el %: todavía no podés reservar',
      to_char(v_contratacion.fecha_inicio, 'DD/MM/YYYY')
      USING ERRCODE = 'GZ004';
  END IF;

  SELECT * INTO v_plan FROM public.planes_membresia WHERE id = v_contratacion.plan_membresia_id;

  IF v_plan.cantidad_actividades = 1 AND v_contratacion.actividad IS DISTINCT FROM v_clase.actividad THEN
    RAISE EXCEPTION 'Tu plan no habilita la actividad %', v_clase.actividad
      USING ERRCODE = 'GZ003';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservas
    WHERE clase_id = p_clase_id AND alumno_id = v_alumno AND estado <> 'CANCELADO'
  ) THEN
    RAISE EXCEPTION 'Ya estás anotado en esta clase' USING ERRCODE = 'GZ008';
  END IF;

  IF v_plan.limite_semanal IS NOT NULL THEN
    SELECT count(DISTINCT r.clase_id) INTO v_usadas
    FROM public.reservas r
    JOIN public.clases c ON c.id = r.clase_id
    WHERE r.alumno_id = v_alumno
      AND r.estado IN ('ANOTADO', 'AUSENTE')
      AND c.inicio >= v_lunes
      AND c.inicio < v_lunes + INTERVAL '7 days';

    IF v_usadas >= v_plan.limite_semanal THEN
      RAISE EXCEPTION 'Alcanzaste el límite semanal de % clases', v_plan.limite_semanal
        USING ERRCODE = 'GZ002';
    END IF;
  END IF;

  IF v_clase.capacidad IS NOT NULL THEN
    SELECT count(*) INTO v_ocupados
    FROM public.reservas
    WHERE clase_id = p_clase_id AND estado IN ('ANOTADO', 'AUSENTE');

    IF v_ocupados >= v_clase.capacidad THEN
      RAISE EXCEPTION 'Sin cupo' USING ERRCODE = 'GZ001';
    END IF;
  END IF;

  INSERT INTO public.reservas (clase_id, alumno_id)
  VALUES (p_clase_id, v_alumno)
  RETURNING id INTO v_reserva_id;

  reserva_id := v_reserva_id;
  aviso := CASE
    WHEN v_contratacion.fecha_fin < v_fecha_clase THEN
      'Tu membresía vence el ' || to_char(v_contratacion.fecha_fin, 'DD/MM/YYYY')
      || ': esta clase corresponde a otro período, renová para conservarla'
  END;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reservar_clase(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_clase(UUID) TO authenticated, service_role;

-- ============================================================================
-- 2. RPC: marcar_ausente (solo se permite después de clases.inicio)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.marcar_ausente(p_reserva_id UUID)
RETURNS public.reservas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserva public.reservas%ROWTYPE;
  v_clase public.clases%ROWTYPE;
BEGIN
  SELECT * INTO v_reserva FROM public.reservas WHERE id = p_reserva_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.es_profesor_de_clase(v_reserva.clase_id) THEN
    RAISE EXCEPTION 'Solo un profesor de la clase o un administrador puede marcar ausentes'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_clase FROM public.clases WHERE id = v_reserva.clase_id;

  IF v_clase.inicio > now() THEN
    RAISE EXCEPTION 'La clase todavía no comenzó' USING ERRCODE = 'GZ006';
  END IF;

  IF v_reserva.estado <> 'ANOTADO' THEN
    RAISE EXCEPTION 'La reserva está % y no se puede marcar ausente', v_reserva.estado
      USING ERRCODE = 'GZ009';
  END IF;

  UPDATE public.reservas SET estado = 'AUSENTE'
  WHERE id = p_reserva_id
  RETURNING * INTO v_reserva;

  RETURN v_reserva;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_ausente(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_ausente(UUID) TO authenticated, service_role;

-- ============================================================================
-- 3. RLS y TRIGGER: edición de inicio y capacidad en clases
--    Solo el profesor asignado (clases_profesores) o un ADMIN pueden modificar
--    el inicio o la capacidad de una clase.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_proteger_edicion_clase()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.inicio IS DISTINCT FROM OLD.inicio
    OR NEW.capacidad IS DISTINCT FROM OLD.capacidad
  ) THEN
    IF NOT public.es_profesor_de_clase(OLD.id) THEN
      RAISE EXCEPTION 'Solo un profesor de la clase o un administrador puede modificar su horario o capacidad'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clases_proteger_edicion ON public.clases;
CREATE TRIGGER trg_clases_proteger_edicion
  BEFORE UPDATE OF inicio, capacidad ON public.clases
  FOR EACH ROW EXECUTE FUNCTION public.fn_proteger_edicion_clase();

COMMIT;
