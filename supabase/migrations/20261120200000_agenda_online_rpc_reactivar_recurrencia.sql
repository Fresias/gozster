-- ============================================================================
-- GOZSter: Agenda Online Real — RPCs de creación única/recurrente, des-cancelar
-- (reactivar_clase), eliminar clase vacía, anotar/quitar alumno desde Studio
-- y soporte multiactividad/múltiples contrataciones en reservar_clase.
-- Archivo: supabase/migrations/20261120200000_agenda_online_rpc_reactivar_recurrencia.sql
-- Multica Issue: GOZS-637
-- Append-only e idempotente para PostgreSQL 15+ / Supabase.
-- ============================================================================

BEGIN;

-- Índice de apoyo para FK reservas.clase_id (incluye filas CANCELADO/ANULADO)
CREATE INDEX IF NOT EXISTS idx_reservas_clase_id
  ON public.reservas (clase_id);

-- ============================================================================
-- 0. HELPER INTERNO: resolución uniforme de cobertura multiactividad
--    (múltiples contrataciones vigentes + alumno_actividades).
--    No se expone a anon/authenticated; los llamadores SECURITY DEFINER toman
--    previamente los locks FOR UPDATE en orden fijo:
--    clases -> contrataciones -> alumno_actividades.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._resolver_cobertura_actividad_alumno(
  p_alumno_id UUID,
  p_actividad TEXT,
  p_hoy DATE
)
RETURNS TABLE (
  habilitado BOOLEAN,
  limite_semanal INT,
  contar_solo_actividad BOOLEAN,
  fecha_fin_aviso DATE,
  motivo_codigo TEXT,
  motivo_subtipo TEXT,
  motivo_detalle TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_contratacion public.contrataciones%ROWTYPE;
  v_contratacion_activa public.contrataciones%ROWTYPE;
  v_contratacion_ref public.contrataciones%ROWTYPE;
  v_plan public.planes_membresia%ROWTYPE;
  v_act public.alumno_actividades%ROWTYPE;
  v_estado_membresia public.estado_membresia;
BEGIN
  -- 1) Contratación presencial vigente que cubra la actividad solicitada
  SELECT c.* INTO v_contratacion
  FROM public.contrataciones c
  JOIN public.planes_membresia pm ON pm.id = c.plan_membresia_id
  WHERE c.alumno_id = p_alumno_id
    AND c.plan_membresia_id IS NOT NULL
    AND c.estado NOT IN ('EN_PAUSA', 'VENCIDA')
    AND c.fecha_inicio <= p_hoy
    AND c.fecha_fin >= p_hoy
    AND (pm.cantidad_actividades = 2 OR c.actividad = p_actividad)
  ORDER BY (c.actividad = p_actividad) DESC, c.fecha_fin DESC, c.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT * INTO v_plan FROM public.planes_membresia WHERE id = v_contratacion.plan_membresia_id;
    RETURN QUERY SELECT
      true,
      v_plan.limite_semanal,
      (v_plan.cantidad_actividades = 1),
      v_contratacion.fecha_fin,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT;
    RETURN;
  END IF;

  -- 2) Revisar si existe alguna contratación vigente (aunque sea de otro servicio/actividad)
  SELECT * INTO v_contratacion_activa
  FROM public.contrataciones
  WHERE alumno_id = p_alumno_id
    AND estado NOT IN ('EN_PAUSA', 'VENCIDA')
    AND fecha_inicio <= p_hoy
    AND fecha_fin >= p_hoy
  ORDER BY (plan_membresia_id IS NOT NULL) DESC, fecha_fin DESC, created_at DESC
  LIMIT 1;

  SELECT * INTO v_act
  FROM public.alumno_actividades
  WHERE alumno_id = p_alumno_id AND actividad = p_actividad
  LIMIT 1;

  -- 3) Habilitado vía alumno_actividades si hay contratación vigente o no hay contrataciones bloqueantes
  IF v_act.id IS NOT NULL AND (
    v_contratacion_activa.id IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM public.contrataciones WHERE alumno_id = p_alumno_id)
  ) THEN
    IF v_contratacion_activa.id IS NULL THEN
      SELECT estado_membresia INTO v_estado_membresia
      FROM public.perfiles WHERE id = p_alumno_id;

      IF v_estado_membresia IN ('INACTIVA', 'BAJA', 'EXPIRED_PAYMENT_PENDING', 'ARCHIVED') THEN
        RETURN QUERY SELECT
          false, NULL::INT, false, NULL::DATE,
          'GZ004'::TEXT, 'ESTADO'::TEXT, v_estado_membresia::TEXT;
        RETURN;
      END IF;
    END IF;

    RETURN QUERY SELECT
      true,
      CASE WHEN v_act.pase_libre THEN NULL ELSE v_act.veces_por_semana END,
      true,
      v_contratacion_activa.fecha_fin,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT;
    RETURN;
  END IF;

  -- 4) Contratación vigente que no cubre esta actividad (ni tiene alumno_actividades para ella)
  IF v_contratacion_activa.id IS NOT NULL THEN
    IF v_contratacion_activa.plan_membresia_id IS NOT NULL THEN
      RETURN QUERY SELECT
        false, NULL::INT, false, NULL::DATE,
        'GZ003'::TEXT, 'OTRA_ACTIVIDAD'::TEXT, p_actividad;
    ELSE
      RETURN QUERY SELECT
        false, NULL::INT, false, NULL::DATE,
        'GZ004'::TEXT, 'SIN_SUSCRIPCION'::TEXT, NULL::TEXT;
    END IF;
    RETURN;
  END IF;

  -- 5) Sin contratación vigente: determinar motivo exacto de la última contratación
  SELECT * INTO v_contratacion_ref
  FROM public.contrataciones
  WHERE alumno_id = p_alumno_id
  ORDER BY (plan_membresia_id IS NOT NULL) DESC, (fecha_inicio <= p_hoy) DESC, fecha_fin DESC, created_at DESC
  LIMIT 1;

  IF NOT FOUND OR (v_contratacion_ref.plan_membresia_id IS NULL AND v_act.id IS NULL) THEN
    RETURN QUERY SELECT false, NULL::INT, false, NULL::DATE, 'GZ004'::TEXT, 'SIN_SUSCRIPCION'::TEXT, NULL::TEXT;
  ELSIF v_contratacion_ref.estado IN ('EN_PAUSA', 'VENCIDA') THEN
    RETURN QUERY SELECT false, NULL::INT, false, NULL::DATE, 'GZ004'::TEXT, 'ESTADO'::TEXT, v_contratacion_ref.estado;
  ELSIF v_contratacion_ref.fecha_fin < p_hoy THEN
    RETURN QUERY SELECT false, NULL::INT, false, NULL::DATE, 'GZ004'::TEXT, 'VENCIDA'::TEXT, to_char(v_contratacion_ref.fecha_fin, 'DD/MM/YYYY');
  ELSIF v_contratacion_ref.fecha_inicio > p_hoy THEN
    RETURN QUERY SELECT false, NULL::INT, false, NULL::DATE, 'GZ004'::TEXT, 'FUTURA'::TEXT, to_char(v_contratacion_ref.fecha_inicio, 'DD/MM/YYYY');
  ELSE
    RETURN QUERY SELECT false, NULL::INT, false, NULL::DATE, 'GZ004'::TEXT, 'SIN_SUSCRIPCION'::TEXT, NULL::TEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._resolver_cobertura_actividad_alumno(UUID, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._resolver_cobertura_actividad_alumno(UUID, TEXT, DATE) TO service_role;

-- ============================================================================
-- 1. RPC: crear_clases_agenda (creación única o recurrente estilo Google Calendar)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.crear_clases_agenda(
  p_actividad TEXT,
  p_inicio TIMESTAMPTZ DEFAULT NULL,
  p_duracion_minutos INT DEFAULT 60,
  p_capacidad INT DEFAULT NULL,
  p_recurrente BOOLEAN DEFAULT false,
  p_dias_semana SMALLINT[] DEFAULT NULL,
  p_hora_inicio TIME DEFAULT NULL,
  p_fecha_inicio DATE DEFAULT NULL,
  p_fecha_fin DATE DEFAULT NULL,
  p_semanas INT DEFAULT 4
)
RETURNS SETOF public.clases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  c_max_semanas CONSTANT INT := 12;
  v_actor_id UUID := auth.uid();
  v_duracion INT := COALESCE(p_duracion_minutos, 60);
  v_recurrente BOOLEAN := COALESCE(p_recurrente, false);
  v_inicio TIMESTAMPTZ;
  v_clase public.clases%ROWTYPE;
  v_hora_inicio TIME;
  v_fecha_inicio DATE;
  v_fecha_fin DATE;
  v_semanas INT;
  v_dias_unicos SMALLINT[];
  v_dia SMALLINT;
  v_fecha DATE;
  v_horario_id UUID;
BEGIN
  IF v_actor_id IS NULL OR NOT public.es_entrenador_o_admin() THEN
    RAISE EXCEPTION 'Solo entrenadores o administradores pueden crear clases'
      USING ERRCODE = '42501';
  END IF;

  IF p_actividad IS NULL OR p_actividad NOT IN ('FUNCIONAL', 'BOXEO') THEN
    RAISE EXCEPTION 'Actividad inválida: debe ser FUNCIONAL o BOXEO'
      USING ERRCODE = '22023';
  END IF;

  IF v_duracion <= 0 THEN
    RAISE EXCEPTION 'La duración debe ser mayor a 0 minutos'
      USING ERRCODE = '22023';
  END IF;

  IF p_capacidad IS NOT NULL AND p_capacidad <= 0 THEN
    RAISE EXCEPTION 'La capacidad debe ser mayor a 0'
      USING ERRCODE = '22023';
  END IF;

  -- Modo único: 1 instancia en public.clases + vínculo en public.clases_profesores
  IF NOT v_recurrente THEN
    IF p_inicio IS NOT NULL THEN
      v_inicio := p_inicio;
    ELSIF p_fecha_inicio IS NOT NULL AND p_hora_inicio IS NOT NULL THEN
      v_inicio := (p_fecha_inicio + p_hora_inicio) AT TIME ZONE c_tz;
    ELSE
      RAISE EXCEPTION 'Debés indicar la fecha y hora de inicio de la clase'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.clases (horario_id, actividad, inicio, duracion_minutos, capacidad)
    VALUES (NULL, p_actividad, v_inicio, v_duracion, p_capacidad)
    RETURNING * INTO v_clase;

    INSERT INTO public.clases_profesores (clase_id, profesor_id)
    VALUES (v_clase.id, v_actor_id)
    ON CONFLICT ON CONSTRAINT uq_clases_profesores DO NOTHING;

    RETURN NEXT v_clase;
    RETURN;
  END IF;

  -- Modo recurrente: normaliza hora, rango de fechas y días ISO (1..7)
  v_hora_inicio := COALESCE(
    p_hora_inicio,
    CASE WHEN p_inicio IS NOT NULL THEN (p_inicio AT TIME ZONE c_tz)::time END
  );
  IF v_hora_inicio IS NULL THEN
    RAISE EXCEPTION 'Debés indicar la hora de inicio para la recurrencia'
      USING ERRCODE = '22023';
  END IF;

  v_fecha_inicio := COALESCE(
    p_fecha_inicio,
    CASE
      WHEN p_inicio IS NOT NULL THEN (p_inicio AT TIME ZONE c_tz)::date
      ELSE (now() AT TIME ZONE c_tz)::date
    END
  );

  IF p_fecha_fin IS NOT NULL THEN
    IF p_fecha_fin < v_fecha_inicio THEN
      RAISE EXCEPTION 'La fecha de fin no puede ser anterior a la fecha de inicio'
        USING ERRCODE = '22023';
    END IF;
    IF (p_fecha_fin - v_fecha_inicio) > (c_max_semanas * 7) THEN
      RAISE EXCEPTION 'El rango máximo de recurrencia es de % semanas', c_max_semanas
        USING ERRCODE = '22023';
    END IF;
    v_fecha_fin := p_fecha_fin;
  ELSE
    v_semanas := COALESCE(p_semanas, 4);
    IF v_semanas < 1 OR v_semanas > c_max_semanas THEN
      RAISE EXCEPTION 'La cantidad de semanas debe estar entre 1 y %', c_max_semanas
        USING ERRCODE = '22023';
    END IF;
    v_fecha_fin := v_fecha_inicio + (v_semanas * 7 - 1);
  END IF;

  IF p_dias_semana IS NULL OR cardinality(p_dias_semana) = 0 THEN
    v_dias_unicos := ARRAY[EXTRACT(ISODOW FROM v_fecha_inicio)::smallint];
  ELSE
    SELECT array_agg(DISTINCT d ORDER BY d)
    INTO v_dias_unicos
    FROM unnest(p_dias_semana) AS d;

    FOREACH v_dia IN ARRAY v_dias_unicos LOOP
      IF v_dia IS NULL OR v_dia < 1 OR v_dia > 7 THEN
        RAISE EXCEPTION 'Día de semana inválido (%): debe estar entre 1 (lunes) y 7 (domingo)', v_dia
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  -- Crear o reutilizar los slots en public.clases_horario por día de la semana
  FOREACH v_dia IN ARRAY v_dias_unicos LOOP
    SELECT id INTO v_horario_id
    FROM public.clases_horario
    WHERE actividad = p_actividad
      AND dia_semana = v_dia
      AND hora_inicio = v_hora_inicio
      AND activo = true
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.clases_horario
      SET duracion_minutos = v_duracion,
          capacidad = p_capacidad
      WHERE id = v_horario_id
        AND (duracion_minutos IS DISTINCT FROM v_duracion OR capacidad IS DISTINCT FROM p_capacidad);
    ELSE
      INSERT INTO public.clases_horario (actividad, dia_semana, hora_inicio, duracion_minutos, capacidad, activo)
      VALUES (p_actividad, v_dia, v_hora_inicio, v_duracion, p_capacidad, true)
      RETURNING id INTO v_horario_id;
    END IF;
  END LOOP;

  -- Generar instancias en public.clases respetando uq_clases_horario_inicio
  FOR v_fecha, v_dia IN
    SELECT gs::date, EXTRACT(ISODOW FROM gs)::smallint
    FROM generate_series(v_fecha_inicio, v_fecha_fin, INTERVAL '1 day') AS gs
    WHERE EXTRACT(ISODOW FROM gs)::smallint = ANY (v_dias_unicos)
    ORDER BY gs
  LOOP
    SELECT id INTO v_horario_id
    FROM public.clases_horario
    WHERE actividad = p_actividad
      AND dia_semana = v_dia
      AND hora_inicio = v_hora_inicio
      AND activo = true
    ORDER BY created_at ASC
    LIMIT 1;

    v_inicio := (v_fecha + v_hora_inicio) AT TIME ZONE c_tz;

    INSERT INTO public.clases (horario_id, actividad, inicio, duracion_minutos, capacidad)
    VALUES (v_horario_id, p_actividad, v_inicio, v_duracion, p_capacidad)
    ON CONFLICT ON CONSTRAINT uq_clases_horario_inicio DO NOTHING
    RETURNING * INTO v_clase;

    IF FOUND THEN
      INSERT INTO public.clases_profesores (clase_id, profesor_id)
      VALUES (v_clase.id, v_actor_id)
      ON CONFLICT ON CONSTRAINT uq_clases_profesores DO NOTHING;

      RETURN NEXT v_clase;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_clases_agenda(TEXT, TIMESTAMPTZ, INT, INT, BOOLEAN, SMALLINT[], TIME, DATE, DATE, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_clases_agenda(TEXT, TIMESTAMPTZ, INT, INT, BOOLEAN, SMALLINT[], TIME, DATE, DATE, INT) TO authenticated, service_role;

-- ============================================================================
-- 2. RPC: reactivar_clase (des-cancelar clase y restaurar reservas ANULADO)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reactivar_clase(p_clase_id UUID)
RETURNS public.clases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_actor_id UUID := auth.uid();
  v_clase public.clases%ROWTYPE;
  v_alumnos_restaurados UUID[];
  v_alumno_id UUID;
  v_conversacion_id UUID;
  v_profesor_id UUID;
  v_actividad_nombre TEXT;
  v_mensaje TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado: se requiere autenticación'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_clase FROM public.clases WHERE id = p_clase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.es_profesor_de_clase(p_clase_id) THEN
    RAISE EXCEPTION 'Solo un profesor de la clase o un administrador puede reactivarla'
      USING ERRCODE = '42501';
  END IF;

  IF v_clase.estado <> 'CANCELADA' THEN
    RAISE EXCEPTION 'La clase no está cancelada (estado actual: %)', v_clase.estado
      USING ERRCODE = '22023';
  END IF;

  WITH restauradas AS (
    UPDATE public.reservas
    SET estado = 'ANOTADO'
    WHERE clase_id = p_clase_id
      AND estado = 'ANULADO'
    RETURNING alumno_id
  )
  SELECT COALESCE(array_agg(DISTINCT alumno_id ORDER BY alumno_id), ARRAY[]::UUID[])
  INTO v_alumnos_restaurados
  FROM restauradas;

  UPDATE public.clases
  SET estado = 'PROGRAMADA',
      motivo_cancelacion = NULL
  WHERE id = p_clase_id
  RETURNING * INTO v_clase;

  IF cardinality(v_alumnos_restaurados) > 0 THEN
    v_actividad_nombre := CASE v_clase.actividad
      WHEN 'FUNCIONAL' THEN 'Funcional'
      WHEN 'BOXEO' THEN 'Boxeo'
      ELSE initcap(v_clase.actividad)
    END;

    v_mensaje := format(
      'Tu clase de %s del %s volvió a programarse.',
      v_actividad_nombre,
      to_char(v_clase.inicio AT TIME ZONE c_tz, 'DD/MM HH24:MI')
    );

    FOREACH v_alumno_id IN ARRAY v_alumnos_restaurados LOOP
      IF v_alumno_id = v_actor_id
         OR public.es_entrenador_de(v_alumno_id)
         OR public.es_admin() THEN
        v_conversacion_id := public.obtener_o_crear_conversacion(v_alumno_id);
      ELSE
        SELECT id INTO v_conversacion_id
        FROM public.conversaciones
        WHERE alumno_id = v_alumno_id;

        IF v_conversacion_id IS NULL THEN
          SELECT profesor_asignado_id INTO v_profesor_id
          FROM public.perfiles
          WHERE id = v_alumno_id;

          INSERT INTO public.conversaciones (alumno_id, responsable_id)
          VALUES (v_alumno_id, v_profesor_id)
          ON CONFLICT (alumno_id) DO UPDATE SET updated_at = now()
          RETURNING id INTO v_conversacion_id;
        END IF;
      END IF;

      INSERT INTO public.mensajes (
        conversacion_id,
        remitente_id,
        contenido,
        leido,
        requiere_lectura_inicio
      ) VALUES (
        v_conversacion_id,
        v_actor_id,
        v_mensaje,
        false,
        true
      );
    END LOOP;
  END IF;

  RETURN v_clase;
END;
$$;

REVOKE ALL ON FUNCTION public.reactivar_clase(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivar_clase(UUID) TO authenticated, service_role;

-- ============================================================================
-- 3. RPC: eliminar_clase_vacia (elimina clase con 0 inscriptos activos)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.eliminar_clase_vacia(p_clase_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clase public.clases%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado: se requiere autenticación'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_clase FROM public.clases WHERE id = p_clase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.es_profesor_de_clase(p_clase_id) THEN
    RAISE EXCEPTION 'Solo un profesor de la clase o un administrador puede eliminarla'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservas
    WHERE clase_id = p_clase_id
      AND estado IN ('ANOTADO', 'AUSENTE')
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar una clase con alumnos inscriptos'
      USING ERRCODE = 'GZ010';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ranking_prs
    WHERE clase_id = p_clase_id
  ) THEN
    RAISE EXCEPTION 'No se puede eliminar una clase con registros de ranking asociados'
      USING ERRCODE = 'GZ010';
  END IF;

  -- Limpiar reservas históricas CANCELADO/ANULADO para evitar ON DELETE RESTRICT
  DELETE FROM public.reservas
  WHERE clase_id = p_clase_id
    AND estado IN ('CANCELADO', 'ANULADO');

  DELETE FROM public.clases WHERE id = p_clase_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_clase_vacia(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_clase_vacia(UUID) TO authenticated, service_role;

-- ============================================================================
-- 4. RPC: reservar_clase (soporte multiactividad: todas las contrataciones y
--    alumno_actividades)
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
  v_cobertura RECORD;
  v_hoy DATE;
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
  v_hoy := (now() AT TIME ZONE c_tz)::date;
  v_fecha_clase := (v_clase.inicio AT TIME ZONE c_tz)::date;

  -- Orden fijo de locks: clases -> contrataciones -> alumno_actividades
  PERFORM 1 FROM public.contrataciones WHERE alumno_id = v_alumno ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.alumno_actividades WHERE alumno_id = v_alumno AND actividad = v_clase.actividad FOR UPDATE;

  SELECT * INTO v_cobertura
  FROM public._resolver_cobertura_actividad_alumno(v_alumno, v_clase.actividad, v_hoy);

  IF NOT v_cobertura.habilitado THEN
    IF v_cobertura.motivo_subtipo = 'OTRA_ACTIVIDAD' THEN
      RAISE EXCEPTION 'Tu plan no habilita la actividad %', v_cobertura.motivo_detalle
        USING ERRCODE = 'GZ003';
    ELSIF v_cobertura.motivo_subtipo = 'ESTADO' THEN
      RAISE EXCEPTION 'Tu membresía está %: no podés reservar', v_cobertura.motivo_detalle
        USING ERRCODE = 'GZ004';
    ELSIF v_cobertura.motivo_subtipo = 'VENCIDA' THEN
      RAISE EXCEPTION 'Tu membresía venció el %: no podés reservar', v_cobertura.motivo_detalle
        USING ERRCODE = 'GZ004';
    ELSIF v_cobertura.motivo_subtipo = 'FUTURA' THEN
      RAISE EXCEPTION 'Tu membresía inicia el %: todavía no podés reservar', v_cobertura.motivo_detalle
        USING ERRCODE = 'GZ004';
    ELSE
      RAISE EXCEPTION 'No tenés una membresía de clases' USING ERRCODE = 'GZ004';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservas
    WHERE clase_id = p_clase_id AND alumno_id = v_alumno AND estado <> 'CANCELADO'
  ) THEN
    RAISE EXCEPTION 'Ya estás anotado en esta clase' USING ERRCODE = 'GZ008';
  END IF;

  IF v_cobertura.limite_semanal IS NOT NULL THEN
    SELECT count(DISTINCT r.clase_id) INTO v_usadas
    FROM public.reservas r
    JOIN public.clases c ON c.id = r.clase_id
    WHERE r.alumno_id = v_alumno
      AND r.estado IN ('ANOTADO', 'AUSENTE')
      AND c.inicio >= v_lunes
      AND c.inicio < v_lunes + INTERVAL '7 days'
      AND (NOT v_cobertura.contar_solo_actividad OR c.actividad = v_clase.actividad);

    IF v_usadas >= v_cobertura.limite_semanal THEN
      RAISE EXCEPTION 'Alcanzaste el límite semanal de % clases', v_cobertura.limite_semanal
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
    WHEN v_cobertura.fecha_fin_aviso IS NOT NULL AND v_cobertura.fecha_fin_aviso < v_fecha_clase THEN
      'Tu membresía vence el ' || to_char(v_cobertura.fecha_fin_aviso, 'DD/MM/YYYY')
      || ': esta clase corresponde a otro período, renová para conservarla'
  END;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_clase(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_clase(UUID) TO authenticated, service_role;

-- ============================================================================
-- 5. RPC: anotar_alumno (actualizada para múltiples contrataciones y
--    alumno_actividades manteniendo compatibilidad de firma y cupo flexible)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.anotar_alumno(p_clase_id UUID, p_alumno_id UUID)
RETURNS TABLE (reserva_id UUID, sobrecupo BOOLEAN, aviso TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_clase public.clases%ROWTYPE;
  v_cobertura RECORD;
  v_hoy DATE;
  v_fecha_clase DATE;
  v_lunes TIMESTAMPTZ;
  v_usadas INT;
  v_ocupados INT;
  v_reserva_id UUID;
  v_sobrecupo BOOLEAN := false;
  v_avisos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(p_alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para anotar a este alumno' USING ERRCODE = '42501';
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

  v_hoy := (now() AT TIME ZONE c_tz)::date;
  v_fecha_clase := (v_clase.inicio AT TIME ZONE c_tz)::date;
  v_lunes := date_trunc('week', v_clase.inicio AT TIME ZONE c_tz) AT TIME ZONE c_tz;

  PERFORM 1 FROM public.contrataciones WHERE alumno_id = p_alumno_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.alumno_actividades WHERE alumno_id = p_alumno_id AND actividad = v_clase.actividad FOR UPDATE;

  SELECT * INTO v_cobertura
  FROM public._resolver_cobertura_actividad_alumno(p_alumno_id, v_clase.actividad, v_hoy);

  IF NOT v_cobertura.habilitado THEN
    IF v_cobertura.motivo_subtipo = 'OTRA_ACTIVIDAD' THEN
      RAISE EXCEPTION 'La suscripción del alumno no cubre el servicio %', v_cobertura.motivo_detalle
        USING ERRCODE = 'GZ003';
    ELSIF v_cobertura.motivo_subtipo = 'ESTADO' THEN
      RAISE EXCEPTION 'La suscripción del alumno está %', v_cobertura.motivo_detalle USING ERRCODE = 'GZ004';
    ELSIF v_cobertura.motivo_subtipo = 'VENCIDA' THEN
      RAISE EXCEPTION 'La suscripción del alumno venció el %', v_cobertura.motivo_detalle USING ERRCODE = 'GZ004';
    ELSIF v_cobertura.motivo_subtipo = 'FUTURA' THEN
      RAISE EXCEPTION 'La suscripción del alumno inicia el %', v_cobertura.motivo_detalle USING ERRCODE = 'GZ004';
    ELSE
      RAISE EXCEPTION 'El alumno no tiene una suscripción activa de clases' USING ERRCODE = 'GZ004';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservas
    WHERE clase_id = p_clase_id AND alumno_id = p_alumno_id AND estado <> 'CANCELADO'
  ) THEN
    RAISE EXCEPTION 'El alumno ya está anotado en esta clase' USING ERRCODE = 'GZ008';
  END IF;

  IF v_cobertura.limite_semanal IS NOT NULL THEN
    SELECT count(DISTINCT r.clase_id) INTO v_usadas
    FROM public.reservas r
    JOIN public.clases c ON c.id = r.clase_id
    WHERE r.alumno_id = p_alumno_id
      AND r.estado IN ('ANOTADO', 'AUSENTE')
      AND c.inicio >= v_lunes
      AND c.inicio < v_lunes + INTERVAL '7 days'
      AND (NOT v_cobertura.contar_solo_actividad OR c.actividad = v_clase.actividad);

    IF v_usadas >= v_cobertura.limite_semanal THEN
      RAISE EXCEPTION 'El alumno ya usó sus % clases de esa semana', v_cobertura.limite_semanal
        USING ERRCODE = 'GZ002';
    END IF;
  END IF;

  IF v_clase.capacidad IS NOT NULL THEN
    SELECT count(*) INTO v_ocupados
    FROM public.reservas
    WHERE clase_id = p_clase_id AND estado IN ('ANOTADO', 'AUSENTE');

    IF v_ocupados >= v_clase.capacidad THEN
      v_sobrecupo := true;
      v_avisos := array_append(v_avisos, 'sobrecupo: ' || (v_ocupados + 1) || '/' || v_clase.capacidad);
    END IF;
  END IF;

  IF v_cobertura.fecha_fin_aviso IS NOT NULL AND v_cobertura.fecha_fin_aviso < v_fecha_clase THEN
    v_avisos := array_append(
      v_avisos,
      'la suscripción vence el ' || to_char(v_cobertura.fecha_fin_aviso, 'DD/MM/YYYY') || ' y la clase es posterior'
    );
  END IF;

  INSERT INTO public.reservas (clase_id, alumno_id)
  VALUES (p_clase_id, p_alumno_id)
  RETURNING id INTO v_reserva_id;

  reserva_id := v_reserva_id;
  sobrecupo := v_sobrecupo;
  aviso := array_to_string(v_avisos, '; ');
  IF aviso = '' THEN aviso := NULL; END IF;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.anotar_alumno(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anotar_alumno(UUID, UUID) TO authenticated, service_role;

-- ============================================================================
-- 6. RPC: anotar_alumno_coach (con advertencia / forzado y multiactividad)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.anotar_alumno_coach(
  p_clase_id UUID,
  p_alumno_id UUID,
  p_forzar BOOLEAN DEFAULT false
)
RETURNS TABLE (
  reserva_id UUID,
  requiere_confirmacion BOOLEAN,
  tipo_aviso TEXT,
  sobrecupo BOOLEAN,
  aviso TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_forzar BOOLEAN := COALESCE(p_forzar, false);
  v_clase public.clases%ROWTYPE;
  v_cobertura RECORD;
  v_hoy DATE;
  v_fecha_clase DATE;
  v_lunes TIMESTAMPTZ;
  v_usadas INT;
  v_ocupados INT;
  v_reserva_id UUID;
  v_sobrecupo BOOLEAN := false;
  v_tipo_aviso TEXT := 'NINGUNO';
  v_requiere BOOLEAN := false;
  v_avisos TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.es_admin()
    OR public.es_profesor_de_clase(p_clase_id)
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(p_alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para anotar a este alumno' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_clase FROM public.clases WHERE id = p_clase_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_clase.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'La clase fue cancelada' USING ERRCODE = 'GZ007';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.perfiles WHERE id = p_alumno_id) THEN
    RAISE EXCEPTION 'Alumno no encontrado' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.reservas
    WHERE clase_id = p_clase_id AND alumno_id = p_alumno_id AND estado <> 'CANCELADO'
  ) THEN
    RAISE EXCEPTION 'El alumno ya está anotado en esta clase' USING ERRCODE = 'GZ008';
  END IF;

  v_hoy := (now() AT TIME ZONE c_tz)::date;
  v_fecha_clase := (v_clase.inicio AT TIME ZONE c_tz)::date;
  v_lunes := date_trunc('week', v_clase.inicio AT TIME ZONE c_tz) AT TIME ZONE c_tz;

  -- Orden fijo de locks: clases -> contrataciones -> alumno_actividades
  PERFORM 1 FROM public.contrataciones WHERE alumno_id = p_alumno_id ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.alumno_actividades WHERE alumno_id = p_alumno_id AND actividad = v_clase.actividad FOR UPDATE;

  SELECT * INTO v_cobertura
  FROM public._resolver_cobertura_actividad_alumno(p_alumno_id, v_clase.actividad, v_hoy);

  IF NOT v_cobertura.habilitado THEN
    v_requiere := true;
    IF v_cobertura.motivo_subtipo = 'OTRA_ACTIVIDAD' THEN
      v_tipo_aviso := 'ACTIVIDAD_DISTINTA';
      v_avisos := array_append(v_avisos, 'La suscripción del alumno no cubre la actividad ' || v_cobertura.motivo_detalle);
    ELSE
      v_tipo_aviso := 'SIN_SUSCRIPCION';
      v_avisos := array_append(
        v_avisos,
        CASE v_cobertura.motivo_subtipo
          WHEN 'ESTADO' THEN 'La suscripción del alumno está ' || v_cobertura.motivo_detalle
          WHEN 'VENCIDA' THEN 'La suscripción del alumno venció el ' || v_cobertura.motivo_detalle
          WHEN 'FUTURA' THEN 'La suscripción del alumno inicia el ' || v_cobertura.motivo_detalle
          ELSE 'El alumno no tiene una suscripción activa de clases'
        END
      );
    END IF;
  END IF;

  -- Límite semanal (solo evalúa si tiene cobertura de suscripción/actividad)
  IF v_tipo_aviso = 'NINGUNO' AND v_cobertura.limite_semanal IS NOT NULL THEN
    SELECT count(DISTINCT r.clase_id) INTO v_usadas
    FROM public.reservas r
    JOIN public.clases c ON c.id = r.clase_id
    WHERE r.alumno_id = p_alumno_id
      AND r.estado IN ('ANOTADO', 'AUSENTE')
      AND c.inicio >= v_lunes
      AND c.inicio < v_lunes + INTERVAL '7 days'
      AND (NOT v_cobertura.contar_solo_actividad OR c.actividad = v_clase.actividad);

    IF v_usadas >= v_cobertura.limite_semanal THEN
      v_requiere := true;
      v_tipo_aviso := 'LIMITE_SEMANAL';
      v_avisos := array_append(v_avisos, 'El alumno ya usó sus ' || v_cobertura.limite_semanal || ' clases de esa semana');
    END IF;
  END IF;

  -- Cupo flexible de la clase (sobrecupo)
  IF v_clase.capacidad IS NOT NULL THEN
    SELECT count(*) INTO v_ocupados
    FROM public.reservas
    WHERE clase_id = p_clase_id AND estado IN ('ANOTADO', 'AUSENTE');

    IF v_ocupados >= v_clase.capacidad THEN
      v_sobrecupo := true;
      v_requiere := true;
      IF v_tipo_aviso = 'NINGUNO' THEN
        v_tipo_aviso := 'SOBRECUPO';
      END IF;
      v_avisos := array_append(v_avisos, 'sobrecupo: ' || (v_ocupados + 1) || '/' || v_clase.capacidad);
    END IF;
  END IF;

  IF v_cobertura.fecha_fin_aviso IS NOT NULL AND v_cobertura.fecha_fin_aviso < v_fecha_clase THEN
    v_avisos := array_append(
      v_avisos,
      'la suscripción vence el ' || to_char(v_cobertura.fecha_fin_aviso, 'DD/MM/YYYY') || ' y la clase es posterior'
    );
  END IF;

  IF v_requiere AND NOT v_forzar THEN
    reserva_id := NULL;
    requiere_confirmacion := true;
    tipo_aviso := v_tipo_aviso;
    sobrecupo := v_sobrecupo;
    aviso := array_to_string(v_avisos, '; ');
    IF aviso = '' THEN aviso := NULL; END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.reservas (clase_id, alumno_id)
  VALUES (p_clase_id, p_alumno_id)
  RETURNING id INTO v_reserva_id;

  reserva_id := v_reserva_id;
  requiere_confirmacion := false;
  tipo_aviso := v_tipo_aviso;
  sobrecupo := v_sobrecupo;
  aviso := array_to_string(v_avisos, '; ');
  IF aviso = '' THEN aviso := NULL; END IF;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.anotar_alumno_coach(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anotar_alumno_coach(UUID, UUID, BOOLEAN) TO authenticated, service_role;

-- ============================================================================
-- 7. RPC: quitar_reserva_coach (pasa la reserva a CANCELADO desde Studio)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.quitar_reserva_coach(p_reserva_id UUID)
RETURNS public.reservas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserva public.reservas%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reserva FROM public.reservas WHERE id = p_reserva_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.es_admin()
    OR public.es_profesor_de_clase(v_reserva.clase_id)
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(v_reserva.alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para quitar esta reserva'
      USING ERRCODE = '42501';
  END IF;

  IF v_reserva.estado = 'CANCELADO' THEN
    RAISE EXCEPTION 'La reserva ya está cancelada'
      USING ERRCODE = 'GZ009';
  END IF;

  UPDATE public.reservas
  SET estado = 'CANCELADO'
  WHERE id = p_reserva_id
  RETURNING * INTO v_reserva;

  RETURN v_reserva;
END;
$$;

REVOKE ALL ON FUNCTION public.quitar_reserva_coach(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quitar_reserva_coach(UUID) TO authenticated, service_role;

COMMIT;
