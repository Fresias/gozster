// ============================================================================
// GOZSter Edge Function: alta-alumno-directa (GitHub Issue #55)
// El entrenador da de alta a un alumno con una contraseña temporal segura; el
// alumno debe cambiarla en su primer inicio de sesión (perfiles.debe_cambiar_password).
//
// POST { email, nombre_completo?, telefono? }
// Authorization: Bearer <access_token del ENTRENADOR o ADMIN>
// 201 { alumno_id, email, password_temporal, email_enviado, mensaje } | 400 | 401 | 403 | 409
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticos),
// GOZSTER_ALLOWED_ORIGIN, RESEND_API_KEY + GOZSTER_EMAIL_FROM (opcionales: sin
// ellos no se envía email y el entrenador comparte las credenciales).
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { crearHandler, LOGIN_URL } from "./handler.ts";

const ALLOWED_ORIGIN = Deno.env.get("GOZSTER_ALLOWED_ORIGIN") ?? "https://gozster.vercel.app";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("GOZSTER_EMAIL_FROM");

// Cliente de servidor: la clave service_role nunca sale de la función
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const handler = crearHandler(
  {
    async usuarioDesdeToken(token) {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },

    async rolDePerfil(id) {
      const { data, error } = await admin.from("perfiles").select("rol").eq("id", id).maybeSingle();
      if (error) throw error;
      return data?.rol ?? null;
    },

    async crearUsuario(attrs) {
      const { data, error } = await admin.auth.admin.createUser(attrs);
      if (error || !data.user) {
        const existe = error?.code === "email_exists" || error?.code === "user_already_exists" || error?.status === 422;
        return { error: existe ? "email_existe" : "otro" };
      }
      return { id: data.user.id };
    },

    async upsertPerfil(perfil) {
      const { error } = await admin.from("perfiles").upsert(perfil, { onConflict: "id" });
      return !error;
    },

    async eliminarUsuario(id) {
      await admin.auth.admin.deleteUser(id);
    },

    async enviarCredenciales({ email, nombre, password }) {
      if (!RESEND_API_KEY || !EMAIL_FROM) return false;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [email],
          subject: "Tu cuenta de GOZSter está lista",
          text: [
            `Hola ${nombre}!`,
            "",
            "Tu entrenador te dio de alta en GOZSter. Ingresá con estos datos:",
            `Email: ${email}`,
            `Contraseña temporal: ${password}`,
            "",
            `Entrá en ${LOGIN_URL} — al ingresar vas a elegir tu contraseña definitiva.`,
          ].join("\n"),
        }),
      });
      return res.ok;
    },
  },
  ALLOWED_ORIGIN
);

Deno.serve(handler);
