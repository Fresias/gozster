-- ============================================================================
-- GOZSter: Modelo de Datos y RLS para Mensajería Unificada Staff (1:N)
-- Migración idempotente para PostgreSQL 15+ / Supabase
-- GitHub Issue: #17 (GOZS-11)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. TABLA: conversaciones (Canal 1:N Único por Alumno)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.conversaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumno_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_conversaciones_alumno UNIQUE (alumno_id)
);

-- Trigger para updated_at (delta sync)
DROP TRIGGER IF EXISTS trg_conversaciones_updated_at ON public.conversaciones;
CREATE TRIGGER trg_conversaciones_updated_at
  BEFORE UPDATE ON public.conversaciones
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Índices de consulta rápida y sincronización
CREATE INDEX IF NOT EXISTS idx_conversaciones_alumno
  ON public.conversaciones (alumno_id);

CREATE INDEX IF NOT EXISTS idx_conversaciones_updated_at
  ON public.conversaciones (updated_at);

-- ============================================================================
-- 2. TABLA: mensajes (Historial cronológico con autoría de cada mensaje)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id UUID NOT NULL REFERENCES public.conversaciones(id) ON DELETE CASCADE,
  remitente_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL CHECK (char_length(trim(contenido)) > 0),
  leido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para updated_at de mensajes (delta sync / read receipt)
DROP TRIGGER IF EXISTS trg_mensajes_updated_at ON public.mensajes;
CREATE TRIGGER trg_mensajes_updated_at
  BEFORE UPDATE ON public.mensajes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger para actualizar updated_at en conversaciones cuando ingresa un nuevo mensaje
CREATE OR REPLACE FUNCTION public.handle_conversacion_nuevo_mensaje()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.conversaciones
  SET updated_at = NEW.created_at
  WHERE id = NEW.conversacion_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mensajes_actualizar_conversacion ON public.mensajes;
CREATE TRIGGER trg_mensajes_actualizar_conversacion
  AFTER INSERT ON public.mensajes
  FOR EACH ROW EXECUTE FUNCTION public.handle_conversacion_nuevo_mensaje();

-- Índices optimizados para chat y delta sync
CREATE INDEX IF NOT EXISTS idx_mensajes_conversacion_created
  ON public.mensajes (conversacion_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_mensajes_remitente
  ON public.mensajes (remitente_id);

CREATE INDEX IF NOT EXISTS idx_mensajes_no_leidos
  ON public.mensajes (conversacion_id, leido)
  WHERE leido = false;

CREATE INDEX IF NOT EXISTS idx_mensajes_updated_at
  ON public.mensajes (updated_at);

-- ============================================================================
-- 3. FUNCIONES AUXILIARES RPC DE MENSAJERÍA
-- ============================================================================

-- RPC 1: Obtener o crear canal de conversación para un alumno
CREATE OR REPLACE FUNCTION public.obtener_o_crear_conversacion(p_alumno_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  -- Validar autorización: el usuario debe ser el alumno, un profesor asignado o admin
  IF auth.uid() <> p_alumno_id
     AND NOT public.es_entrenador_de(p_alumno_id)
     AND NOT public.es_admin() THEN
    RAISE EXCEPTION 'No autorizado para acceder a la conversación de este alumno';
  END IF;

  SELECT id INTO v_conv_id
  FROM public.conversaciones
  WHERE alumno_id = p_alumno_id;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversaciones (alumno_id)
    VALUES (p_alumno_id)
    ON CONFLICT (alumno_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_conv_id;
  END IF;

  RETURN v_conv_id;
END;
$$;

-- RPC 2: Marcar como leídos los mensajes recibidos en una conversación
CREATE OR REPLACE FUNCTION public.marcar_mensajes_leidos(p_conversacion_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.conversaciones c
    WHERE c.id = p_conversacion_id
      AND (
        c.alumno_id = auth.uid()
        OR public.es_entrenador_de(c.alumno_id)
        OR public.es_admin()
      )
  ) THEN
    RAISE EXCEPTION 'No autorizado para actualizar mensajes en esta conversación';
  END IF;

  UPDATE public.mensajes
  SET leido = true
  WHERE conversacion_id = p_conversacion_id
    AND remitente_id <> auth.uid()
    AND leido = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) - POLÍTICAS ESTRICTAS
-- ============================================================================

-- 4.1 RLS en tabla: conversaciones
ALTER TABLE public.conversaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversaciones_select_participantes" ON public.conversaciones;
CREATE POLICY "conversaciones_select_participantes"
  ON public.conversaciones
  FOR SELECT
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "conversaciones_insert_participantes" ON public.conversaciones;
CREATE POLICY "conversaciones_insert_participantes"
  ON public.conversaciones
  FOR INSERT
  TO authenticated
  WITH CHECK (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "conversaciones_update_participantes" ON public.conversaciones;
CREATE POLICY "conversaciones_update_participantes"
  ON public.conversaciones
  FOR UPDATE
  TO authenticated
  USING (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  )
  WITH CHECK (
    alumno_id = auth.uid()
    OR public.es_entrenador_de(alumno_id)
    OR public.es_admin()
  );

DROP POLICY IF EXISTS "conversaciones_delete_solo_admin" ON public.conversaciones;
CREATE POLICY "conversaciones_delete_solo_admin"
  ON public.conversaciones
  FOR DELETE
  TO authenticated
  USING (public.es_admin());

-- 4.2 RLS en tabla: mensajes
ALTER TABLE public.mensajes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mensajes_select_participantes" ON public.mensajes;
CREATE POLICY "mensajes_select_participantes"
  ON public.mensajes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversaciones c
      WHERE c.id = mensajes.conversacion_id
        AND (
          c.alumno_id = auth.uid()
          OR public.es_entrenador_de(c.alumno_id)
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "mensajes_insert_participantes" ON public.mensajes;
CREATE POLICY "mensajes_insert_participantes"
  ON public.mensajes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    remitente_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversaciones c
      WHERE c.id = mensajes.conversacion_id
        AND (
          c.alumno_id = auth.uid()
          OR public.es_entrenador_de(c.alumno_id)
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "mensajes_update_participantes" ON public.mensajes;
CREATE POLICY "mensajes_update_participantes"
  ON public.mensajes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversaciones c
      WHERE c.id = mensajes.conversacion_id
        AND (
          c.alumno_id = auth.uid()
          OR public.es_entrenador_de(c.alumno_id)
          OR public.es_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.conversaciones c
      WHERE c.id = mensajes.conversacion_id
        AND (
          c.alumno_id = auth.uid()
          OR public.es_entrenador_de(c.alumno_id)
          OR public.es_admin()
        )
    )
  );

DROP POLICY IF EXISTS "mensajes_delete_autor_o_admin" ON public.mensajes;
CREATE POLICY "mensajes_delete_autor_o_admin"
  ON public.mensajes
  FOR DELETE
  TO authenticated
  USING (
    remitente_id = auth.uid()
    OR public.es_admin()
  );

-- ============================================================================
-- 5. PUBLICACIÓN SUPABASE REALTIME (PUBLICACIÓN REACTIVA)
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

COMMIT;
