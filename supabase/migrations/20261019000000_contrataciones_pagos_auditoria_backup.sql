-- ============================================================================
-- GOZSter: Estado de cuenta, contrataciones, pagos idempotentes, auditoría y
-- restauración de respaldos
-- Migración idempotente para PostgreSQL 15+ / Supabase
-- GitHub Issue: #64 | Multica: GOZS-53 | ADR-001 y ADR-005
--
-- Separa los cuatro estados del alumno (ADR-001): cuenta (perfiles.estado_cuenta),
-- contratación (contrataciones), pago (pagos) y rutina (planes_entrenamiento).
-- Las columnas legadas estado_membresia / fecha_vencimiento_cuota no se tocan.
--
-- Requiere 20261018100000_alta_alumno_directa_primer_login.sql (guard de perfiles).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ESTADO DE CUENTA EN perfiles
-- La baja administrativa nunca borra rutinas, sesiones, mensajes ni historial.
-- Backfill único (solo al crear la columna): los perfiles dados de baja con el
-- esquema legado quedan como BAJA_ADMINISTRATIVA.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'estado_cuenta'
  ) THEN
    ALTER TABLE public.perfiles
      ADD COLUMN estado_cuenta TEXT NOT NULL DEFAULT 'ACTIVO'
        CONSTRAINT chk_perfiles_estado_cuenta
        CHECK (estado_cuenta IN ('ACTIVO', 'BAJA_ADMINISTRATIVA', 'SUSPENDIDO'));

    UPDATE public.perfiles
    SET estado_cuenta = 'BAJA_ADMINISTRATIVA'
    WHERE estado_membresia::text IN ('BAJA', 'ARCHIVED');
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_perfiles_estado_cuenta
  ON public.perfiles (estado_cuenta)
  WHERE estado_cuenta <> 'ACTIVO';

-- La baja administrativa sella fecha_baja si todavía no estaba informada
CREATE OR REPLACE FUNCTION public.fn_sellar_fecha_baja_administrativa()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.estado_cuenta = 'BAJA_ADMINISTRATIVA'
     AND NEW.estado_cuenta IS DISTINCT FROM OLD.estado_cuenta
     AND NEW.fecha_baja IS NULL THEN
    NEW.fecha_baja := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Nombre ordenado alfabéticamente antes de trg_perfiles_proteger_campos: el
-- guard ve fecha_baja ya sellada y aplica la misma regla de autorización.
DROP TRIGGER IF EXISTS trg_perfiles_baja_administrativa ON public.perfiles;
CREATE TRIGGER trg_perfiles_baja_administrativa
  BEFORE UPDATE OF estado_cuenta ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_sellar_fecha_baja_administrativa();

-- Guard de campos privilegiados (amplía el de #55): estado_cuenta se suma a
-- membresía, baja y asignación; solo lo cambia el entrenador asignado o ADMIN.
CREATE OR REPLACE FUNCTION public.fn_proteger_campos_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS NULL OR auth.role() = 'service_role' OR public.es_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.rol <> 'ALUMNO' THEN
      RAISE EXCEPTION 'Solo un administrador puede crear perfiles con rol %', NEW.rol
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el rol de un perfil'
      USING ERRCODE = '42501';
  END IF;

  -- Permitir si viene del trigger de cambio de contraseña en auth.users
  IF current_setting('gozster.limpiando_password', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.estado_membresia IS DISTINCT FROM OLD.estado_membresia
    OR NEW.estado_cuenta IS DISTINCT FROM OLD.estado_cuenta
    OR NEW.profesor_asignado_id IS DISTINCT FROM OLD.profesor_asignado_id
    OR NEW.fecha_baja IS DISTINCT FROM OLD.fecha_baja
  ) AND NOT (
    OLD.id <> auth.uid()
    AND public.es_entrenador_o_admin()
    AND (OLD.profesor_asignado_id = auth.uid() OR public.es_entrenador_de(OLD.id))
  ) THEN
    RAISE EXCEPTION 'Solo el entrenador asignado puede modificar cuenta, membresía, baja o asignación del alumno'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.debe_cambiar_password IS DISTINCT FROM OLD.debe_cambiar_password THEN
    -- El propio usuario apagando la bandera en su perfil tras cambiar clave
    IF OLD.id = auth.uid() AND OLD.debe_cambiar_password = true AND NEW.debe_cambiar_password = false THEN
      RETURN NEW;
    END IF;

    -- Entrenador o admin gestionando al alumno
    IF OLD.id <> auth.uid()
       AND public.es_entrenador_o_admin()
       AND (OLD.profesor_asignado_id = auth.uid() OR public.es_entrenador_de(OLD.id)) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'No tenés permisos para modificar el estado de cambio de contraseña'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. TABLA: public.contrataciones
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contrataciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  tipo_servicio TEXT NOT NULL DEFAULT 'ASESORIA_ONLINE'
    CHECK (tipo_servicio IN ('ASESORIA_ONLINE', 'PRESENCIAL')),
  estado TEXT NOT NULL DEFAULT 'VIGENTE'
    CHECK (estado IN ('VIGENTE', 'POR_VENCER', 'VENCIDA', 'EN_PAUSA', 'PENDIENTE_RENOVACION')),
  dia_vencimiento INT NOT NULL CHECK (dia_vencimiento BETWEEN 1 AND 31),
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  dias_aviso_previo INT NOT NULL DEFAULT 5 CHECK (dias_aviso_previo >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_contrataciones_periodo CHECK (fecha_fin >= fecha_inicio)
);

DROP TRIGGER IF EXISTS trg_contrataciones_updated_at ON public.contrataciones;
CREATE TRIGGER trg_contrataciones_updated_at
  BEFORE UPDATE ON public.contrataciones
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_contrataciones_alumno_id
  ON public.contrataciones (alumno_id);

CREATE INDEX IF NOT EXISTS idx_contrataciones_estado_fecha_fin
  ON public.contrataciones (estado, fecha_fin);

CREATE INDEX IF NOT EXISTS idx_contrataciones_updated_at
  ON public.contrataciones (updated_at);

-- El período (fechas, día de corte, alumno) solo cambia vía RPC auditada.
-- current_user es 'authenticated'/'anon' en un UPDATE directo vía PostgREST y el
-- dueño de la función dentro de las RPC SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.fn_proteger_periodo_contratacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.alumno_id IS DISTINCT FROM OLD.alumno_id
    OR NEW.fecha_inicio IS DISTINCT FROM OLD.fecha_inicio
    OR NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin
    OR NEW.dia_vencimiento IS DISTINCT FROM OLD.dia_vencimiento
  ) THEN
    RAISE EXCEPTION 'El período de la contratación solo se modifica con registrar_y_confirmar_renovacion o extender_contratacion_excepcional'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrataciones_proteger_periodo ON public.contrataciones;
CREATE TRIGGER trg_contrataciones_proteger_periodo
  BEFORE UPDATE ON public.contrataciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_proteger_periodo_contratacion();

-- ============================================================================
-- 3. TABLA: public.pagos
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contratacion_id UUID NOT NULL REFERENCES public.contrataciones(id) ON DELETE RESTRICT,
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE RESTRICT,
  monto NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  medio_pago TEXT NOT NULL
    CHECK (medio_pago IN ('TRANSFERENCIA', 'EFECTIVO', 'PASARELA_ONLINE', 'OTRO')),
  estado TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO')),
  idempotency_key TEXT NOT NULL UNIQUE,
  confirmado_por UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  confirmado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_pagos_updated_at ON public.pagos;
CREATE TRIGGER trg_pagos_updated_at
  BEFORE UPDATE ON public.pagos
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_pagos_contratacion_id
  ON public.pagos (contratacion_id);

CREATE INDEX IF NOT EXISTS idx_pagos_alumno_id
  ON public.pagos (alumno_id);

CREATE INDEX IF NOT EXISTS idx_pagos_confirmado_por
  ON public.pagos (confirmado_por);

CREATE INDEX IF NOT EXISTS idx_pagos_updated_at
  ON public.pagos (updated_at);

-- ============================================================================
-- 4. TABLA: public.auditoria_cambios (append-only, escrita solo por RPC)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auditoria_cambios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad TEXT NOT NULL,
  entidad_id UUID NOT NULL,
  accion TEXT NOT NULL,
  motivo TEXT,
  autorizado_por UUID REFERENCES public.perfiles(id),
  valores_anteriores JSONB,
  valores_nuevos JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_cambios_entidad
  ON public.auditoria_cambios (entidad, entidad_id);

CREATE INDEX IF NOT EXISTS idx_auditoria_cambios_autorizado_por
  ON public.auditoria_cambios (autorizado_por);

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- Alumno: lee sus contrataciones y pagos. Entrenador asignado / ADMIN: gestiona
-- contrataciones. Pagos y auditoría no tienen políticas de escritura: solo se
-- escriben desde las RPC SECURITY DEFINER (o service_role). Sin DELETE: nunca se
-- borra historial comercial.
-- ============================================================================

ALTER TABLE public.contrataciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_cambios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contrataciones_select_alumno_o_entrenador" ON public.contrataciones;
CREATE POLICY "contrataciones_select_alumno_o_entrenador"
  ON public.contrataciones
  FOR SELECT
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "contrataciones_insert_entrenador_o_admin" ON public.contrataciones;
CREATE POLICY "contrataciones_insert_entrenador_o_admin"
  ON public.contrataciones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(alumno_id))
  );

DROP POLICY IF EXISTS "contrataciones_update_entrenador_o_admin" ON public.contrataciones;
CREATE POLICY "contrataciones_update_entrenador_o_admin"
  ON public.contrataciones
  FOR UPDATE
  TO authenticated
  USING (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(alumno_id))
  )
  WITH CHECK (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(alumno_id))
  );

DROP POLICY IF EXISTS "pagos_select_alumno_o_entrenador" ON public.pagos;
CREATE POLICY "pagos_select_alumno_o_entrenador"
  ON public.pagos
  FOR SELECT
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "auditoria_cambios_select_staff" ON public.auditoria_cambios;
CREATE POLICY "auditoria_cambios_select_staff"
  ON public.auditoria_cambios
  FOR SELECT
  TO authenticated
  USING (
    public.es_admin()
    OR (
      public.es_entrenador_o_admin()
      AND entidad = 'contrataciones'
      AND EXISTS (
        SELECT 1
        FROM public.contrataciones c
        WHERE c.id = auditoria_cambios.entidad_id
          AND public.es_entrenador_de(c.alumno_id)
      )
    )
  );

-- ============================================================================
-- 6. RPCs DE NEGOCIO (ADR-001)
-- ============================================================================

-- Estado que corresponde a una fecha_fin: VENCIDA desde el día siguiente a
-- fecha_fin, POR_VENCER dentro de la ventana de aviso, VIGENTE en otro caso.
CREATE OR REPLACE FUNCTION public.fn_estado_contratacion_por_fecha(
  p_fecha_fin DATE,
  p_dias_aviso_previo INT
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN CURRENT_DATE > p_fecha_fin THEN 'VENCIDA'
    WHEN p_fecha_fin - CURRENT_DATE <= p_dias_aviso_previo THEN 'POR_VENCER'
    ELSE 'VIGENTE'
  END;
$$;

-- 6.1 Job diario (pg_cron / service_role / ADMIN): marca POR_VENCER y VENCIDA y
-- avisa al entrenador. No borra datos: el alumno vencido conserva app y Chat GOZS.
-- EN_PAUSA queda congelada.
CREATE OR REPLACE FUNCTION public.evaluar_vencimientos_contrataciones()
RETURNS TABLE (por_vencer INT, vencidas INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vencidas INT;
  v_por_vencer INT;
BEGIN
  IF NOT (auth.role() IS NULL OR auth.role() = 'service_role' OR public.es_admin()) THEN
    RAISE EXCEPTION 'Solo un administrador puede evaluar vencimientos'
      USING ERRCODE = '42501';
  END IF;

  WITH marcadas AS (
    UPDATE public.contrataciones
    SET estado = 'VENCIDA'
    WHERE estado IN ('VIGENTE', 'POR_VENCER', 'PENDIENTE_RENOVACION')
      AND CURRENT_DATE > fecha_fin
    RETURNING id, alumno_id, fecha_fin
  ), alertas AS (
    INSERT INTO public.alertas_entrenador (alumno_id, profesor_id, tipo_alerta, severidad, titulo, detalle)
    SELECT
      m.alumno_id,
      prof.id,
      'CUOTA_VENCIDA',
      'MEDIA',
      'Suscripción vencida: ' || p.nombre_completo,
      'La contratación venció el ' || to_char(m.fecha_fin, 'DD/MM/YYYY')
        || '. El alumno conserva acceso a la app y al Chat GOZS.'
    FROM marcadas m
    JOIN public.perfiles p ON p.id = m.alumno_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        p.profesor_asignado_id,
        (SELECT ea.entrenador_id
         FROM public.entrenador_alumnos ea
         WHERE ea.alumno_id = m.alumno_id
         ORDER BY ea.es_principal DESC, ea.created_at
         LIMIT 1)
      ) AS id
    ) prof
    WHERE prof.id IS NOT NULL
  )
  SELECT count(*) INTO v_vencidas FROM marcadas;

  UPDATE public.contrataciones
  SET estado = 'POR_VENCER'
  WHERE estado = 'VIGENTE'
    AND fecha_fin - CURRENT_DATE BETWEEN 0 AND dias_aviso_previo;
  GET DIAGNOSTICS v_por_vencer = ROW_COUNT;

  RETURN QUERY SELECT v_por_vencer, v_vencidas;
END;
$$;

-- 6.2 Renovación con pago confirmado.
-- Idempotente por p_idempotency_key: un reintento devuelve la contratación sin
-- cobrar ni sumar otro mes. "No se corre la fecha": la nueva fecha_fin es el
-- dia_vencimiento del mes siguiente a la fecha_fin anterior (vence 10/10, paga
-- 18/10 -> vence 10/11), recortado al último día en meses más cortos.
CREATE OR REPLACE FUNCTION public.registrar_y_confirmar_renovacion(
  p_contratacion_id UUID,
  p_monto NUMERIC,
  p_medio_pago TEXT,
  p_idempotency_key TEXT
)
RETURNS public.contrataciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contratacion public.contrataciones%ROWTYPE;
  v_pago public.pagos%ROWTYPE;
  v_mes_siguiente DATE;
  v_nueva_fecha_fin DATE;
BEGIN
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'La clave de idempotencia del pago es obligatoria'
      USING ERRCODE = '22023';
  END IF;

  IF p_monto IS NULL OR p_monto < 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor o igual a 0'
      USING ERRCODE = '22023';
  END IF;

  -- Bloqueo de fila: reintentos concurrentes de la misma renovación se serializan
  SELECT * INTO v_contratacion
  FROM public.contrataciones
  WHERE id = p_contratacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratación no encontrada con ID: %', p_contratacion_id
      USING ERRCODE = 'P0002';
  END IF;

  -- service_role: confirmación verificada de pasarela (webhook), nunca el retorno de URL
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(v_contratacion.alumno_id))
  ) THEN
    RAISE EXCEPTION 'No autorizado para confirmar pagos de esta contratación'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_pago
  FROM public.pagos
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_pago.contratacion_id <> p_contratacion_id THEN
      RAISE EXCEPTION 'La clave de idempotencia ya fue usada por otra contratación'
        USING ERRCODE = '23505';
    END IF;
    RETURN v_contratacion;
  END IF;

  v_mes_siguiente := (date_trunc('month', v_contratacion.fecha_fin::timestamp) + INTERVAL '1 month')::date;
  v_nueva_fecha_fin := v_mes_siguiente + (
    LEAST(
      v_contratacion.dia_vencimiento,
      EXTRACT(DAY FROM (v_mes_siguiente + INTERVAL '1 month' - INTERVAL '1 day'))::INT
    ) - 1
  );

  INSERT INTO public.pagos (
    contratacion_id, alumno_id, monto, medio_pago, estado,
    idempotency_key, confirmado_por, confirmado_at
  ) VALUES (
    v_contratacion.id, v_contratacion.alumno_id, p_monto, p_medio_pago, 'CONFIRMADO',
    p_idempotency_key, auth.uid(), now()
  );

  UPDATE public.contrataciones
  SET
    fecha_fin = v_nueva_fecha_fin,
    estado = public.fn_estado_contratacion_por_fecha(v_nueva_fecha_fin, dias_aviso_previo)
  WHERE id = v_contratacion.id
  RETURNING * INTO v_contratacion;

  RETURN v_contratacion;
END;
$$;

-- 6.3 Extensión excepcional sin pago: exige motivo y deja registro en auditoría.
CREATE OR REPLACE FUNCTION public.extender_contratacion_excepcional(
  p_contratacion_id UUID,
  p_nueva_fecha_fin DATE,
  p_motivo TEXT
)
RETURNS public.contrataciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anterior public.contrataciones%ROWTYPE;
  v_contratacion public.contrataciones%ROWTYPE;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RAISE EXCEPTION 'El motivo de la extensión excepcional es obligatorio'
      USING ERRCODE = '22023';
  END IF;

  IF p_nueva_fecha_fin IS NULL THEN
    RAISE EXCEPTION 'La nueva fecha de fin es obligatoria'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_anterior
  FROM public.contrataciones
  WHERE id = p_contratacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contratación no encontrada con ID: %', p_contratacion_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Requiere un usuario identificado: autorizado_por es obligatorio en la auditoría
  IF NOT (
    public.es_admin()
    OR (public.es_entrenador_o_admin() AND public.es_entrenador_de(v_anterior.alumno_id))
  ) THEN
    RAISE EXCEPTION 'Solo un administrador o el entrenador del alumno puede extender la contratación'
      USING ERRCODE = '42501';
  END IF;

  IF p_nueva_fecha_fin <= v_anterior.fecha_fin THEN
    RAISE EXCEPTION 'La nueva fecha de fin (%) debe ser posterior a la actual (%)',
      p_nueva_fecha_fin, v_anterior.fecha_fin
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.contrataciones
  SET
    fecha_fin = p_nueva_fecha_fin,
    estado = CASE
      WHEN estado = 'EN_PAUSA' THEN estado
      ELSE public.fn_estado_contratacion_por_fecha(p_nueva_fecha_fin, dias_aviso_previo)
    END
  WHERE id = p_contratacion_id
  RETURNING * INTO v_contratacion;

  INSERT INTO public.auditoria_cambios (
    entidad, entidad_id, accion, motivo, autorizado_por, valores_anteriores, valores_nuevos
  ) VALUES (
    'contrataciones',
    p_contratacion_id,
    'EXTENSION_EXCEPCIONAL',
    btrim(p_motivo),
    auth.uid(),
    jsonb_build_object('fecha_fin', v_anterior.fecha_fin, 'estado', v_anterior.estado),
    jsonb_build_object('fecha_fin', v_contratacion.fecha_fin, 'estado', v_contratacion.estado)
  );

  RETURN v_contratacion;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.evaluar_vencimientos_contrataciones() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_y_confirmar_renovacion(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.extender_contratacion_excepcional(UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluar_vencimientos_contrataciones() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_y_confirmar_renovacion(UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.extender_contratacion_excepcional(UUID, DATE, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 7. RESTAURACIÓN DE RESPALDOS (ADR-005) — solo service_role
-- Usada por scripts/backup-restore-gozs.mjs. Inserta filas de un snapshot JSON
-- sin pisar las existentes (ON CONFLICT (id) DO NOTHING) y con los triggers de
-- usuario de la tabla desactivados dentro de la transacción, para que restaurar
-- registro_series no duplique alertas ni restaurar sesiones reescriba
-- perfiles.ultimo_entreno_at. Las FK siguen activas: la integridad referencial
-- la valida Postgres.
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
    'perfiles', 'ejercicios', 'entrenador_alumnos', 'planes_entrenamiento', 'dias_rutina',
    'ejercicios_en_rutina', 'registro_sesiones', 'registro_series', 'conversaciones',
    'mensajes', 'habitos_registros', 'nutricion_registros', 'alertas_entrenador',
    'alumno_historial_dolor', 'contrataciones', 'pagos', 'auditoria_cambios',
    'sustituciones_ejercicios'
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

COMMIT;
