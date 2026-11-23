// ============================================================================
// GOZSter: lógica de la Edge Function resetear-password-alumno (GOZS-692)
// Sin imports de runtime: la usan index.ts (Deno) y los tests de Vitest (Node)
// con dependencias inyectadas. Mismo patrón que alta-alumno-directa.
// ============================================================================

import { generarPasswordTemporal } from "../alta-alumno-directa/handler.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PerfilResumen {
  rol: string;
  profesor_asignado_id: string | null;
}

export interface ResetearPasswordDeps {
  /** id del usuario dueño del JWT, o null si es inválido/expirado. */
  usuarioDesdeToken(token: string): Promise<string | null>;
  /** rol y coach asignado desde public.perfiles (nunca de metadata); lanza si falla la consulta. */
  perfil(id: string): Promise<PerfilResumen | null>;
  /** auth.admin.updateUserById(id, { password }); false si falla. */
  cambiarPassword(id: string, password: string): Promise<boolean>;
  /**
   * Marca el cambio obligatorio: app_metadata.must_change_password = true y
   * perfiles.debe_cambiar_password = true. Debe correr DESPUÉS de cambiarPassword,
   * porque el cambio de clave limpia ambas marcas (triggers en auth.users).
   */
  marcarCambioObligatorio(id: string): Promise<boolean>;
}

export function crearHandler(deps: ResetearPasswordDeps, allowedOrigin: string) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      // La respuesta 200 lleva la contraseña temporal: nunca cachear
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "Método no permitido" });

    // 1. Identificar al llamante con su propio JWT
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token) return json(401, { error: "Falta la sesión del entrenador" });
    const llamanteId = await deps.usuarioDesdeToken(token);
    if (!llamanteId) return json(401, { error: "Sesión inválida o expirada" });

    // 2. Validar entrada
    let body: { alumno_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Cuerpo JSON inválido" });
    }
    const alumnoId = body && typeof body === "object" ? String(body.alumno_id ?? "").trim() : "";
    if (!UUID_RE.test(alumnoId)) return json(400, { error: "alumno_id no es válido" });

    // 3. Autorización desde perfiles: ADMIN o el coach asignado del alumno
    let llamante: PerfilResumen | null;
    let alumno: PerfilResumen | null;
    try {
      [llamante, alumno] = await Promise.all([deps.perfil(llamanteId), deps.perfil(alumnoId)]);
    } catch {
      return json(500, { error: "No se pudieron verificar los permisos" });
    }
    const esAdmin = llamante?.rol === "ADMIN";
    const esSuCoach =
      llamante?.rol === "ENTRENADOR" && alumno?.rol === "ALUMNO" && alumno.profesor_asignado_id === llamanteId;
    if (!esAdmin && !esSuCoach) {
      return json(403, { error: "Solo el entrenador asignado o un administrador puede resetear esta contraseña" });
    }
    if (alumno?.rol !== "ALUMNO") return json(404, { error: "Alumno no encontrado" });

    // 4. Clave temporal y, después, la marca de cambio obligatorio
    const passwordTemporal = generarPasswordTemporal();
    if (!(await deps.cambiarPassword(alumnoId, passwordTemporal))) {
      return json(502, { error: "No se pudo resetear la contraseña" });
    }
    if (!(await deps.marcarCambioObligatorio(alumnoId))) {
      // La clave ya cambió: devolver error para que el coach reintente (genera otra).
      return json(500, { error: "No se pudo marcar el cambio obligatorio de contraseña; reintentá" });
    }

    return json(200, {
      alumno_id: alumnoId,
      password_temporal: passwordTemporal,
      mensaje: "Contraseña reseteada. Compartile la clave temporal: deberá cambiarla al ingresar.",
    });
  };
}
