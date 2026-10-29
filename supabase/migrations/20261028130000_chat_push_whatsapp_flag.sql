-- GOZSter: chat coach-alumno -> push + flag WhatsApp opcional (GOZS-227)
-- El modelo de chat (conversaciones/mensajes, RLS, leido) ya existe; aquí solo se añade lo faltante.

-- 1. Flag de configuración: WhatsApp opcional, activable por el entrenador
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS whatsapp_habilitado BOOLEAN NOT NULL DEFAULT false;

-- 2. Suscripciones push (Web Push) del usuario
CREATE TABLE IF NOT EXISTS public.push_suscripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_push_suscripcion UNIQUE (usuario_id, endpoint)
);

ALTER TABLE public.push_suscripciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_suscripciones_propias" ON public.push_suscripciones;
CREATE POLICY "push_suscripciones_propias"
  ON public.push_suscripciones
  FOR ALL
  TO authenticated
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

-- 3. Cola de push (outbox). Sin políticas: solo service_role (Edge Function) la lee/escribe.
CREATE TABLE IF NOT EXISTS public.push_cola (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  mensaje_id UUID NOT NULL REFERENCES public.mensajes(id) ON DELETE CASCADE,
  enviado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_cola ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_push_cola_pendientes
  ON public.push_cola (created_at) WHERE enviado_at IS NULL;

-- Encola un push para el otro participante: alumno -> su responsable/entrenadores; coach -> alumno
CREATE OR REPLACE FUNCTION public.encolar_push_mensaje()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alumno_id UUID;
  v_responsable_id UUID;
BEGIN
  SELECT alumno_id, responsable_id INTO v_alumno_id, v_responsable_id
  FROM public.conversaciones
  WHERE id = NEW.conversacion_id;

  IF NEW.remitente_id = v_alumno_id THEN
    INSERT INTO public.push_cola (destinatario_id, mensaje_id)
    SELECT DISTINCT d, NEW.id
    FROM (
      SELECT v_responsable_id AS d
      UNION ALL
      SELECT ea.entrenador_id FROM public.entrenador_alumnos ea WHERE ea.alumno_id = v_alumno_id
    ) t
    WHERE d IS NOT NULL AND d <> NEW.remitente_id;
  ELSE
    INSERT INTO public.push_cola (destinatario_id, mensaje_id)
    VALUES (v_alumno_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mensajes_encolar_push ON public.mensajes;
CREATE TRIGGER trg_mensajes_encolar_push
  AFTER INSERT ON public.mensajes
  FOR EACH ROW EXECUTE FUNCTION public.encolar_push_mensaje();

-- 4. Mensajes no leídos del usuario actual (badge al abrir la app)
CREATE OR REPLACE FUNCTION public.contar_mensajes_no_leidos()
RETURNS BIGINT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*)
  FROM public.mensajes m
  WHERE m.leido = false
    AND m.remitente_id <> auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.contar_mensajes_no_leidos() TO authenticated;

-- 5. Respaldo: push_suscripciones y push_cola pasan a ser restaurables

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
    'mensajes', 'push_suscripciones', 'push_cola', 'habitos_registros', 'nutricion_registros', 'alertas_entrenador',
    'alumno_historial_dolor', 'alumno_cuestionario_inicial', 'planes_membresia', 'planes_membresia_precios',
    'contrataciones', 'cobros', 'pagos',
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
