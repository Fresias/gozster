// ============================================================================
// GOZSter Edge Function: invitar-alumno (GitHub Issue #49)
// El entrenador da de alta a un alumno: Supabase envía una invitación por email,
// el alumno elige su propia contraseña y su perfil queda vinculado al entrenador.
//
// POST { email, nombre_completo, telefono? }
// Authorization: Bearer <access_token del ENTRENADOR o ADMIN>
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("GOZSTER_ALLOWED_ORIGIN") ?? "https://gozster.vercel.app";
const INVITE_REDIRECT_URL = Deno.env.get("GOZSTER_INVITE_REDIRECT_URL");

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método no permitido" });

  // Cliente de servidor: la clave service_role nunca sale de la función
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // 1. Identificar al llamante con su propio JWT
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return json(401, { error: "Falta la sesión del entrenador" });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json(401, { error: "Sesión inválida o expirada" });
  const entrenadorId = userData.user.id;

  // 2. Sólo ENTRENADOR o ADMIN pueden invitar (rol leído de perfiles, no de metadata del usuario)
  const { data: perfilEntrenador, error: rolError } = await admin
    .from("perfiles")
    .select("rol")
    .eq("id", entrenadorId)
    .maybeSingle();
  if (rolError) return json(500, { error: "No se pudo verificar el rol del entrenador" });
  if (!perfilEntrenador || !["ENTRENADOR", "ADMIN"].includes(perfilEntrenador.rol)) {
    return json(403, { error: "Solo entrenadores o administradores pueden invitar alumnos" });
  }

  // 3. Validar entrada
  let body: { email?: unknown; nombre_completo?: unknown; telefono?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Cuerpo JSON inválido" });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const nombreCompleto = String(body.nombre_completo ?? "").trim();
  const telefono = body.telefono ? String(body.telefono).trim() : null;
  if (!EMAIL_RE.test(email) || !nombreCompleto) {
    return json(400, { error: "email y nombre_completo son obligatorios" });
  }

  // 4. Enviar invitación (el alumno define su contraseña desde el enlace)
  const { data: invite, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: INVITE_REDIRECT_URL,
    data: { nombre_completo: nombreCompleto },
  });
  if (inviteError || !invite.user) {
    const yaExiste = inviteError?.code === "email_exists" || inviteError?.status === 422;
    return yaExiste
      ? json(409, { error: "Ya existe un usuario con ese email" })
      : json(502, { error: "No se pudo enviar la invitación" });
  }
  const alumnoId = invite.user.id;

  // 5. Crear el perfil vinculado al entrenador
  const { error: perfilError } = await admin.from("perfiles").upsert(
    {
      id: alumnoId,
      email,
      nombre_completo: nombreCompleto,
      rol: "ALUMNO",
      estado_membresia: "ACTIVA",
      profesor_asignado_id: entrenadorId,
      telefono,
    },
    { onConflict: "id" }
  );
  if (perfilError) {
    // Evitar usuarios de Auth huérfanos sin perfil
    await admin.auth.admin.deleteUser(alumnoId);
    return json(500, { error: "No se pudo crear el perfil del alumno" });
  }

  return json(201, { alumno_id: alumnoId, email });
});
