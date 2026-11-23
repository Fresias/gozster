-- GOZS-714 (PL-1): procesamiento de push_cola.
--
-- 1) reclamar_push_pendientes: toma y marca filas de la cola en un solo paso
--    (FOR UPDATE SKIP LOCKED) para que dos ejecuciones no envíen el mismo push.
-- 2) purgar_push_cola: borra lo enviado hace más de 7 días (la cola ya no crece
--    sin límite).
-- 3) Agenda pg_cron: invoca la Edge Function enviar-push cada minuto con pg_net
--    y purga a diario. Las credenciales salen de Vault (secretos
--    'gozster_functions_url' y 'gozster_service_key'); si pg_cron/pg_net/vault no
--    existen (PGlite en tests) el bloque se omite con un NOTICE.

BEGIN;

CREATE OR REPLACE FUNCTION public.reclamar_push_pendientes(p_limite INT DEFAULT 100)
RETURNS TABLE (id UUID, destinatario_id UUID)
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.push_cola c
  SET enviado_at = now()
  WHERE c.id IN (
    SELECT p.id FROM public.push_cola p
    WHERE p.enviado_at IS NULL
    ORDER BY p.created_at
    LIMIT GREATEST(p_limite, 0)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING c.id, c.destinatario_id;
$$;

CREATE OR REPLACE FUNCTION public.purgar_push_cola()
RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_borradas INT;
BEGIN
  DELETE FROM public.push_cola WHERE enviado_at < now() - interval '7 days';
  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reclamar_push_pendientes(INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purgar_push_cola() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_push_pendientes(INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.purgar_push_cola() TO service_role;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  CREATE EXTENSION IF NOT EXISTS pg_net;

  PERFORM cron.schedule(
    'gozster_enviar_push',
    '* * * * *',
    $job$
      SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gozster_functions_url') || '/enviar-push',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gozster_service_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      )
      WHERE EXISTS (SELECT 1 FROM public.push_cola WHERE enviado_at IS NULL);
    $job$
  );
  PERFORM cron.schedule('gozster_purgar_push_cola', '15 6 * * *', 'SELECT public.purgar_push_cola()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron/pg_net no disponible (%): agendar enviar-push a mano', SQLERRM;
END;
$$;

COMMIT;
