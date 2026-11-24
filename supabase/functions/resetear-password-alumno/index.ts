// ============================================================================
// GOZSter Edge Function: resetear-password-alumno (GOZS-692)
// El coach asignado (o un admin) resetea la contraseña de un alumno: se genera
// una clave temporal y el alumno queda obligado a cambiarla en el próximo login
// (app_metadata.must_change_password + perfiles.debe_cambiar_password).
//
// POST { alumno_id }
// Authorization: Bearer <access_token del ENTRENADOR asignado o ADMIN>
// 200 { alumno_id, password_temporal, mensaje } | 400 | 401 | 403 | 404 | 500 | 502
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticos), GOZSTER_ALLOWED_ORIGIN.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { crearHandler } from "./handler.ts";
import { generarPasswordTemporal } from "../alta-alumno-directa/handler.ts";

const ALLOWED_ORIGIN = Deno.env.get("GOZSTER_ALLOWED_ORIGIN") ?? "https://gozster.vercel.app";

// Cliente de servidor: la clave service_role nunca sale de la función
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const handler = crearHandler(
  {
    generarPassword: () => generarPasswordTemporal(),

    async usuarioDesdeToken(token) {
      const { data, error } = await admin.auth.getUser(token);
      return error || !data.user ? null : data.user.id;
    },

    async perfil(id) {
      const { data, error } = await admin
        .from("perfiles")
        .select("rol, profesor_asignado_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },

    async cambiarPassword(id, password) {
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      return !error;
    },

    async marcarCambioObligatorio(id) {
      // Llamada aparte y posterior al cambio de clave: el trigger de auth.users
      // quita la marca cuando cambia encrypted_password.
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data.user) return false;
      const { error: errApp } = await admin.auth.admin.updateUserById(id, {
        app_metadata: { ...data.user.app_metadata, must_change_password: true },
      });
      if (errApp) return false;
      const { error: errPerfil } = await admin.from("perfiles").update({ debe_cambiar_password: true }).eq("id", id);
      return !errPerfil;
    },
  },
  ALLOWED_ORIGIN
);

Deno.serve(handler);
