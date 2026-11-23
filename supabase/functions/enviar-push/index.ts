// ============================================================================
// GOZSter Edge Function: enviar-push (GOZS-714, PL-1)
// Procesa push_cola y envía Web Push con push_suscripciones. La invoca pg_cron
// cada minuto (ver migración 20261123040000).
//
// POST (sin cuerpo) · Authorization: Bearer <service_role key>
// 200 { procesados, enviados, sinSuscripcion, expiradas, fallidos } | 401
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticos),
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...).
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";
import { autorizado, procesarCola } from "./handler.ts";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method !== "POST" || !autorizado(req.headers.get("Authorization"), SERVICE_KEY)) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401 });
  }

  const resultado = await procesarCola({
    async reclamarPendientes(limite) {
      const { data, error } = await admin.rpc("reclamar_push_pendientes", { p_limite: limite });
      if (error) throw error;
      return data ?? [];
    },
    async suscripciones(usuarioIds) {
      const { data, error } = await admin.from("push_suscripciones").select("*").in("usuario_id", usuarioIds);
      if (error) throw error;
      return data ?? [];
    },
    async enviar(sub, payload) {
      try {
        const r = await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 86400 },
        );
        return r.statusCode;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status) return status;
        throw e;
      }
    },
    async eliminarSuscripcion(id) {
      await admin.from("push_suscripciones").delete().eq("id", id);
    },
  });

  return new Response(JSON.stringify(resultado), { status: 200, headers: { "Content-Type": "application/json" } });
});
