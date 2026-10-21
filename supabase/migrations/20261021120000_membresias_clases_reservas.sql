-- ============================================================================
-- GOZSter: Membresías por frecuencia, clases presenciales y reservas
-- Archivo: supabase/migrations/20261021120000_membresias_clases_reservas.sql
-- GitHub Issue: #113 | Multica Issue: GOZS-97
-- Idempotente para PostgreSQL 15+ / Supabase
--
-- Reservas: solo vía RPC SECURITY DEFINER. El alumno sale siempre de auth.uid()
-- (ninguna RPC recibe un alumno). La semana va de lunes a domingo en
-- America/Argentina/Buenos_Aires. ANOTADO y AUSENTE consumen límite semanal y
-- cupo; CANCELADO (alumno) y ANULADO (clase cancelada) no.
--
-- Códigos de error (SQLSTATE) de las RPC:
--   GZ001 sin cupo                 GZ006 la clase ya comenzó
--   GZ002 límite semanal           GZ007 clase cancelada
--   GZ003 actividad no habilitada  GZ008 ya anotado en la clase
--   GZ004 membresía no habilitada  GZ009 la reserva no está ANOTADO
--   GZ005 fuera de la semana en curso
--   42501 sin permisos             P0002 no encontrado
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLA: public.planes_membresia
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.planes_membresia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL CHECK (btrim(nombre) <> ''),
  -- NULL = pase libre (sin límite semanal)
  limite_semanal INT CHECK (limite_semanal > 0),
  cantidad_actividades INT NOT NULL CHECK (cantidad_actividades IN (1, 2)),
  duracion_meses INT NOT NULL CHECK (duracion_meses IN (1, 3, 6, 12)),
  precio NUMERIC(12, 2) NOT NULL CHECK (precio >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_planes_membresia_updated_at ON public.planes_membresia;
CREATE TRIGGER trg_planes_membresia_updated_at
  BEFORE UPDATE ON public.planes_membresia
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- 2. EXTENSIÓN: public.contrataciones (plan de membresía y actividad elegida)
-- ============================================================================

ALTER TABLE public.contrataciones
  ADD COLUMN IF NOT EXISTS plan_membresia_id UUID
    REFERENCES public.planes_membresia(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS actividad TEXT
    CHECK (actividad IN ('FUNCIONAL', 'BOXEO'));

CREATE INDEX IF NOT EXISTS idx_contrataciones_plan_membresia_id
  ON public.contrataciones (plan_membresia_id);

-- La actividad es obligatoria cuando el plan habilita una sola actividad.
CREATE OR REPLACE FUNCTION public.fn_validar_actividad_contratacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_membresia_id IS NOT NULL AND NEW.actividad IS NULL AND EXISTS (
    SELECT 1 FROM public.planes_membresia
    WHERE id = NEW.plan_membresia_id AND cantidad_actividades = 1
  ) THEN
    RAISE EXCEPTION 'El plan habilita una sola actividad: indicá FUNCIONAL o BOXEO'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrataciones_validar_actividad ON public.contrataciones;
CREATE TRIGGER trg_contrataciones_validar_actividad
  BEFORE INSERT OR UPDATE OF plan_membresia_id, actividad ON public.contrataciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_validar_actividad_contratacion();

-- ============================================================================
-- 3. TABLAS: public.clases_horario, public.clases, public.clases_profesores
-- ============================================================================

-- Grilla semanal recurrente. dia_semana ISO: 1 = lunes ... 7 = domingo.
CREATE TABLE IF NOT EXISTS public.clases_horario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad TEXT NOT NULL CHECK (actividad IN ('FUNCIONAL', 'BOXEO')),
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  hora_inicio TIME NOT NULL,
  duracion_minutos INT NOT NULL CHECK (duracion_minutos > 0),
  -- NULL = sin límite de cupo
  capacidad INT CHECK (capacidad > 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_clases_horario_updated_at ON public.clases_horario;
CREATE TRIGGER trg_clases_horario_updated_at
  BEFORE UPDATE ON public.clases_horario
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Instancia concreta de una clase en una fecha.
CREATE TABLE IF NOT EXISTS public.clases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horario_id UUID REFERENCES public.clases_horario(id) ON DELETE SET NULL,
  actividad TEXT NOT NULL CHECK (actividad IN ('FUNCIONAL', 'BOXEO')),
  inicio TIMESTAMPTZ NOT NULL,
  duracion_minutos INT NOT NULL CHECK (duracion_minutos > 0),
  capacidad INT CHECK (capacidad > 0),
  estado TEXT NOT NULL DEFAULT 'PROGRAMADA'
    CHECK (estado IN ('PROGRAMADA', 'CANCELADA')),
  motivo_cancelacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_clases_horario_inicio UNIQUE (horario_id, inicio)
);

DROP TRIGGER IF EXISTS trg_clases_updated_at ON public.clases;
CREATE TRIGGER trg_clases_updated_at
  BEFORE UPDATE ON public.clases
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_clases_inicio ON public.clases (inicio);
CREATE INDEX IF NOT EXISTS idx_clases_updated_at ON public.clases (updated_at);

-- Cancelar una clase anula sus reservas: solo vía cancelar_clase. current_user
-- es 'authenticated'/'anon' en un UPDATE directo vía PostgREST y el dueño de la
-- función dentro de las RPC SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.fn_proteger_estado_clase()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.estado IS DISTINCT FROM OLD.estado
    OR NEW.motivo_cancelacion IS DISTINCT FROM OLD.motivo_cancelacion
  ) THEN
    RAISE EXCEPTION 'El estado de la clase solo se modifica con cancelar_clase'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clases_proteger_estado ON public.clases;
CREATE TRIGGER trg_clases_proteger_estado
  BEFORE UPDATE ON public.clases
  FOR EACH ROW EXECUTE FUNCTION public.fn_proteger_estado_clase();

-- Una clase puede tener varios profesores.
CREATE TABLE IF NOT EXISTS public.clases_profesores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clase_id UUID NOT NULL REFERENCES public.clases(id) ON DELETE CASCADE,
  profesor_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_clases_profesores UNIQUE (clase_id, profesor_id)
);

CREATE INDEX IF NOT EXISTS idx_clases_profesores_profesor_id
  ON public.clases_profesores (profesor_id);

-- ============================================================================
-- 4. TABLA: public.reservas
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reservas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clase_id UUID NOT NULL REFERENCES public.clases(id) ON DELETE RESTRICT,
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'ANOTADO'
    CHECK (estado IN ('ANOTADO', 'CANCELADO', 'AUSENTE', 'ANULADO')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_reservas_updated_at ON public.reservas;
CREATE TRIGGER trg_reservas_updated_at
  BEFORE UPDATE ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Una sola reserva no cancelada por (clase, alumno): una clase nunca cuenta dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservas_clase_alumno_no_cancelada
  ON public.reservas (clase_id, alumno_id)
  WHERE estado <> 'CANCELADO';

CREATE INDEX IF NOT EXISTS idx_reservas_alumno_id ON public.reservas (alumno_id);
CREATE INDEX IF NOT EXISTS idx_reservas_updated_at ON public.reservas (updated_at);

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- Catálogo (planes, horarios, clases, profesores): lectura para usuarios
-- autenticados, escritura para entrenadores/admin. Reservas: el alumno ve las
-- suyas, entrenadores/admin ven todas; ninguna escritura directa (solo RPC).
-- ============================================================================

ALTER TABLE public.planes_membresia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clases_horario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clases_profesores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planes_membresia_select_autenticado" ON public.planes_membresia;
CREATE POLICY "planes_membresia_select_autenticado"
  ON public.planes_membresia FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "planes_membresia_write_entrenador_o_admin" ON public.planes_membresia;
CREATE POLICY "planes_membresia_write_entrenador_o_admin"
  ON public.planes_membresia FOR ALL TO authenticated
  USING (public.es_entrenador_o_admin())
  WITH CHECK (public.es_entrenador_o_admin());

DROP POLICY IF EXISTS "clases_horario_select_autenticado" ON public.clases_horario;
CREATE POLICY "clases_horario_select_autenticado"
  ON public.clases_horario FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "clases_horario_write_entrenador_o_admin" ON public.clases_horario;
CREATE POLICY "clases_horario_write_entrenador_o_admin"
  ON public.clases_horario FOR ALL TO authenticated
  USING (public.es_entrenador_o_admin())
  WITH CHECK (public.es_entrenador_o_admin());

DROP POLICY IF EXISTS "clases_select_autenticado" ON public.clases;
CREATE POLICY "clases_select_autenticado"
  ON public.clases FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "clases_write_entrenador_o_admin" ON public.clases;
CREATE POLICY "clases_write_entrenador_o_admin"
  ON public.clases FOR ALL TO authenticated
  USING (public.es_entrenador_o_admin())
  WITH CHECK (public.es_entrenador_o_admin());

DROP POLICY IF EXISTS "clases_profesores_select_autenticado" ON public.clases_profesores;
CREATE POLICY "clases_profesores_select_autenticado"
  ON public.clases_profesores FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "clases_profesores_write_entrenador_o_admin" ON public.clases_profesores;
CREATE POLICY "clases_profesores_write_entrenador_o_admin"
  ON public.clases_profesores FOR ALL TO authenticated
  USING (public.es_entrenador_o_admin())
  WITH CHECK (public.es_entrenador_o_admin());

DROP POLICY IF EXISTS "reservas_select_alumno_o_staff" ON public.reservas;
CREATE POLICY "reservas_select_alumno_o_staff"
  ON public.reservas FOR SELECT TO authenticated
  USING (alumno_id = auth.uid() OR public.es_entrenador_o_admin());

REVOKE INSERT, UPDATE, DELETE ON public.reservas FROM anon, authenticated;

-- ============================================================================
-- 6. RPCs TRANSACCIONALES
-- ============================================================================

-- ¿El usuario actual es profesor asignado a la clase o ADMIN?
CREATE OR REPLACE FUNCTION public.es_profesor_de_clase(p_clase_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.es_admin() OR EXISTS (
    SELECT 1 FROM public.clases_profesores
    WHERE clase_id = p_clase_id AND profesor_id = auth.uid()
  );
$$;

-- 6.1 Reserva del alumno autenticado. FOR UPDATE sobre la clase serializa la
-- carrera por el último cupo; FOR UPDATE sobre la contratación serializa las
-- reservas simultáneas del mismo alumno (límite semanal). Orden de locks fijo
-- (clase → contratación): sin deadlocks.
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
  SELECT * INTO v_contratacion
  FROM public.contrataciones
  WHERE alumno_id = v_alumno AND plan_membresia_id IS NOT NULL
  ORDER BY fecha_fin DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No tenés una membresía de clases' USING ERRCODE = 'GZ004';
  END IF;

  IF v_contratacion.estado IN ('EN_PAUSA', 'VENCIDA') THEN
    RAISE EXCEPTION 'Tu membresía está %: no podés reservar', v_contratacion.estado
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

-- 6.2 El alumno cancela su propia reserva antes del inicio de la clase.
CREATE OR REPLACE FUNCTION public.cancelar_reserva(p_reserva_id UUID)
RETURNS public.reservas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserva public.reservas%ROWTYPE;
BEGIN
  SELECT * INTO v_reserva
  FROM public.reservas
  WHERE id = p_reserva_id AND alumno_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF v_reserva.estado <> 'ANOTADO' THEN
    RAISE EXCEPTION 'La reserva está % y no se puede cancelar', v_reserva.estado
      USING ERRCODE = 'GZ009';
  END IF;

  IF (SELECT inicio FROM public.clases WHERE id = v_reserva.clase_id) <= now() THEN
    RAISE EXCEPTION 'La clase ya comenzó' USING ERRCODE = 'GZ006';
  END IF;

  UPDATE public.reservas SET estado = 'CANCELADO'
  WHERE id = p_reserva_id
  RETURNING * INTO v_reserva;

  RETURN v_reserva;
END;
$$;

-- 6.3 Un profesor asignado a la clase (o ADMIN) marca un ausente.
CREATE OR REPLACE FUNCTION public.marcar_ausente(p_reserva_id UUID)
RETURNS public.reservas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserva public.reservas%ROWTYPE;
BEGIN
  SELECT * INTO v_reserva FROM public.reservas WHERE id = p_reserva_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.es_profesor_de_clase(v_reserva.clase_id) THEN
    RAISE EXCEPTION 'Solo un profesor de la clase o un administrador puede marcar ausentes'
      USING ERRCODE = '42501';
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

-- 6.4 Un profesor asignado a la clase (o ADMIN) la cancela: sus reservas pasan
-- a ANULADO y no consumen límite semanal.
CREATE OR REPLACE FUNCTION public.cancelar_clase(p_clase_id UUID, p_motivo TEXT DEFAULT NULL)
RETURNS public.clases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clase public.clases%ROWTYPE;
BEGIN
  SELECT * INTO v_clase FROM public.clases WHERE id = p_clase_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clase no encontrada' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.es_profesor_de_clase(p_clase_id) THEN
    RAISE EXCEPTION 'Solo un profesor de la clase o un administrador puede cancelarla'
      USING ERRCODE = '42501';
  END IF;

  IF v_clase.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'La clase ya está cancelada' USING ERRCODE = 'GZ007';
  END IF;

  UPDATE public.reservas SET estado = 'ANULADO'
  WHERE clase_id = p_clase_id AND estado IN ('ANOTADO', 'AUSENTE');

  UPDATE public.clases
  SET estado = 'CANCELADA', motivo_cancelacion = NULLIF(btrim(p_motivo), '')
  WHERE id = p_clase_id
  RETURNING * INTO v_clase;

  RETURN v_clase;
END;
$$;

-- ============================================================================
-- 7. ACTUALIZACIÓN DE: public.restaurar_filas_respaldo (tablas de clases)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restaurar_filas_respaldo(p_tabla TEXT, p_filas JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insertadas INT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Solo service_role puede restaurar respaldos'
      USING ERRCODE = '42501';
  END IF;

  IF p_tabla NOT IN (
    'perfiles', 'ejercicios', 'ejercicios_alternativas', 'entrenador_alumnos', 'planes_entrenamiento', 'dias_rutina',
    'ejercicios_en_rutina', 'registro_sesiones', 'registro_series', 'conversaciones',
    'mensajes', 'habitos_registros', 'nutricion_registros', 'alertas_entrenador',
    'alumno_historial_dolor', 'alumno_cuestionario_inicial', 'planes_membresia', 'contrataciones', 'pagos',
    'auditoria_cambios', 'sustituciones_ejercicios', 'clases_horario', 'clases', 'clases_profesores', 'reservas'
  ) THEN
    RAISE EXCEPTION 'Tabla no restaurable: %', p_tabla
      USING ERRCODE = '22023';
  END IF;

  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' THEN
    RAISE EXCEPTION 'p_filas debe ser un array JSON'
      USING ERRCODE = '22023';
  END IF;

  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', p_tabla);
  EXECUTE format(
    'INSERT INTO public.%1$I SELECT * FROM jsonb_populate_recordset(NULL::public.%1$I, $1) ON CONFLICT (id) DO NOTHING',
    p_tabla
  ) USING p_filas;
  GET DIAGNOSTICS v_insertadas = ROW_COUNT;
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', p_tabla);

  RETURN v_insertadas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.restaurar_filas_respaldo(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restaurar_filas_respaldo(TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.es_profesor_de_clase(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reservar_clase(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancelar_reserva(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.marcar_ausente(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancelar_clase(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_profesor_de_clase(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reservar_clase(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_reserva(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.marcar_ausente(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_clase(UUID, TEXT) TO authenticated, service_role;

COMMIT;
