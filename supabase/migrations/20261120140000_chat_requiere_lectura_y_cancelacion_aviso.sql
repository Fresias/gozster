-- ============================================================================
-- GOZSter: Mensajería Real (requiere_lectura_inicio, Realtime y Cancelación con Aviso)
-- Migración idempotente y append-only para PostgreSQL 15+ / Supabase
-- Issue: GOZS-626
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. COLUMNA E ÍNDICE PARCIAL EN public.mensajes
-- ============================================================================

ALTER TABLE public.mensajes
  ADD COLUMN IF NOT EXISTS requiere_lectura_inicio BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mensajes_push_inicio_no_leidos
  ON public.mensajes (conversacion_id, created_at DESC)
  WHERE requiere_lectura_inicio = true AND leido = false;

-- ============================================================================
-- 2. VERIFICACIÓN SUPABASE REALTIME (INSERT + UPDATE bajo RLS)
-- ============================================================================

ALTER TABLE public.mensajes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'mensajes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversaciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversaciones;
  END IF;
END $$;

-- ============================================================================
-- 3. HARDENING DE RPC marcar_mensajes_leidos
-- ============================================================================

CREATE OR REPLACE FUNCTION public.marcar_mensajes_leidos(p_conversacion_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autorizado: se requiere autenticación'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversaciones c
    WHERE c.id = p_conversacion_id
      AND (
        c.alumno_id = auth.uid()
        OR c.responsable_id = auth.uid()
        OR public.es_entrenador_de(c.alumno_id)
        OR public.es_admin()
      )
  ) THEN
    RAISE EXCEPTION 'No autorizado para actualizar mensajes en esta conversación'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.mensajes
  SET leido = true
  WHERE conversacion_id = p_conversacion_id
    AND remitente_id IS DISTINCT FROM auth.uid()
    AND leido = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.marcar_mensajes_leidos(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_mensajes_leidos(UUID) TO authenticated, service_role;

-- ============================================================================
-- 4. CANCELACIÓN DE CLASE CON AVISO IN-APP (Y COMPATIBILIDAD DE cancelar_clase)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancelar_clase_con_aviso(
  p_clase_id UUID,
  p_motivo TEXT DEFAULT NULL,
  p_pushear_inicio BOOLEAN DEFAULT true
)
RETURNS public.clases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_tz CONSTANT TEXT := 'America/Argentina/Buenos_Aires';
  v_actor_id UUID := auth.uid();
  v_clase public.clases%ROWTYPE;
  v_motivo TEXT := NULLIF(btrim(p_motivo), '');
  v_pushear BOOLEAN := COALESCE(p_pushear_inicio, true);
  v_alumnos_afectados UUID[];
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
    RAISE EXCEPTION 'Solo un profesor de la clase o un administrador puede cancelarla'
      USING ERRCODE = '42501';
  END IF;

  IF v_clase.estado = 'CANCELADA' THEN
    RAISE EXCEPTION 'La clase ya está cancelada' USING ERRCODE = 'GZ007';
  END IF;

  WITH anuladas AS (
    UPDATE public.reservas
    SET estado = 'ANULADO'
    WHERE clase_id = p_clase_id
      AND estado IN ('ANOTADO', 'AUSENTE')
    RETURNING alumno_id
  )
  SELECT COALESCE(array_agg(DISTINCT alumno_id ORDER BY alumno_id), ARRAY[]::UUID[])
  INTO v_alumnos_afectados
  FROM anuladas;

  UPDATE public.clases
  SET estado = 'CANCELADA',
      motivo_cancelacion = v_motivo
  WHERE id = p_clase_id
  RETURNING * INTO v_clase;

  IF cardinality(v_alumnos_afectados) > 0 THEN
    v_actividad_nombre := CASE v_clase.actividad
      WHEN 'FUNCIONAL' THEN 'Funcional'
      WHEN 'BOXEO' THEN 'Boxeo'
      ELSE initcap(v_clase.actividad)
    END;

    v_mensaje := format(
      'Tu clase de %s del %s fue cancelada.%s',
      v_actividad_nombre,
      to_char(v_clase.inicio AT TIME ZONE c_tz, 'DD/MM HH24:MI'),
      CASE WHEN v_motivo IS NOT NULL THEN ' Motivo: ' || v_motivo ELSE '' END
    );

    FOREACH v_alumno_id IN ARRAY v_alumnos_afectados LOOP
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
        v_pushear
      );
    END LOOP;
  END IF;

  RETURN v_clase;
END;
$$;

-- Mantener firma estricta de 2 parámetros en cancelar_clase para compatibilidad
CREATE OR REPLACE FUNCTION public.cancelar_clase(p_clase_id UUID, p_motivo TEXT DEFAULT NULL)
RETURNS public.clases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.cancelar_clase_con_aviso(p_clase_id, p_motivo, true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancelar_clase_con_aviso(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_clase_con_aviso(UUID, TEXT, BOOLEAN) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cancelar_clase(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_clase(UUID, TEXT) TO authenticated, service_role;

COMMIT;
