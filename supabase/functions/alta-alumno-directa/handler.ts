// ============================================================================
// GOZSter: lógica de la Edge Function alta-alumno-directa (GitHub Issue #55)
// Sin imports: la usan index.ts (Deno) y los tests de Vitest (Node) con
// dependencias inyectadas.
// ============================================================================

export const LOGIN_URL = "https://gozster.vercel.app/login";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sin caracteres ambiguos (0/O, 1/l/I) para que el alumno pueda copiarla a mano
const MAYUSCULAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MINUSCULAS = "abcdefghijkmnopqrstuvwxyz";
const DIGITOS = "23456789";
const SIMBOLOS = "!@#$%*?-_+=";
const TODOS = MAYUSCULAS + MINUSCULAS + DIGITOS + SIMBOLOS;

/** Entero uniforme en [0, max) con CSPRNG y muestreo por rechazo (sin sesgo de módulo). */
function aleatorio(max: number): number {
  const limite = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limite);
  return buf[0]! % max;
}

/** Contraseña temporal de `longitud` (12-16) con al menos una mayúscula, minúscula, dígito y símbolo. */
export function generarPasswordTemporal(longitud = 14): string {
  if (longitud < 12 || longitud > 16) throw new RangeError("La longitud debe estar entre 12 y 16");
  const chars = [MAYUSCULAS, MINUSCULAS, DIGITOS, SIMBOLOS].map((set) => set.charAt(aleatorio(set.length)));
  while (chars.length < longitud) chars.push(TODOS.charAt(aleatorio(TODOS.length)));
  // Fisher-Yates para que los obligatorios no queden siempre al principio
  for (let i = chars.length - 1; i > 0; i--) {
    const j = aleatorio(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

export interface PerfilAlumno {
  id: string;
  email: string;
  nombre_completo: string;
  rol: "ALUMNO";
  estado_membresia: "ACTIVA";
  profesor_asignado_id: string;
  debe_cambiar_password: true;
  telefono: string | null;
}

export interface AltaAlumnoDeps {
  /** id del usuario dueño del JWT, o null si es inválido/expirado. */
  usuarioDesdeToken(token: string): Promise<string | null>;
  /** rol en public.perfiles (nunca de user_metadata); lanza si falla la consulta. */
  rolDePerfil(id: string): Promise<string | null>;
  crearUsuario(attrs: {
    email: string;
    password: string;
    email_confirm: true;
    user_metadata: Record<string, unknown>;
  }): Promise<{ id: string } | { error: "email_existe" | "otro" }>;
  upsertPerfil(perfil: PerfilAlumno): Promise<boolean>;
  eliminarUsuario(id: string): Promise<void>;
  /** Envía las credenciales por email; devuelve false si no está configurado o falla. */
  enviarCredenciales(datos: { email: string; nombre: string; password: string }): Promise<boolean>;
}

export function crearHandler(deps: AltaAlumnoDeps, allowedOrigin: string) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      // La respuesta 201 lleva la contraseña temporal: nunca cachear
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "Método no permitido" });

    // 1. Identificar al llamante con su propio JWT
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!token) return json(401, { error: "Falta la sesión del entrenador" });
    const entrenadorId = await deps.usuarioDesdeToken(token);
    if (!entrenadorId) return json(401, { error: "Sesión inválida o expirada" });

    // 2. Sólo ENTRENADOR o ADMIN
    let rol: string | null;
    try {
      rol = await deps.rolDePerfil(entrenadorId);
    } catch {
      return json(500, { error: "No se pudo verificar el rol del entrenador" });
    }
    if (!rol || !["ENTRENADOR", "ADMIN"].includes(rol)) {
      return json(403, { error: "Solo entrenadores o administradores pueden dar de alta alumnos" });
    }

    // 3. Validar entrada
    let body: { email?: unknown; nombre_completo?: unknown; telefono?: unknown };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Cuerpo JSON inválido" });
    }
    if (!body || typeof body !== "object") return json(400, { error: "Cuerpo JSON inválido" });
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json(400, { error: "El email no es válido" });
    const nombreCompleto = String(body.nombre_completo ?? "").trim() || email.slice(0, email.indexOf("@"));
    const telefono = body.telefono ? String(body.telefono).trim() : null;

    // 4. Crear el usuario con contraseña temporal y email ya confirmado
    const passwordTemporal = generarPasswordTemporal();
    const creado = await deps.crearUsuario({
      email,
      password: passwordTemporal,
      email_confirm: true,
      user_metadata: { must_change_password: true, rol: "ALUMNO", nombre_completo: nombreCompleto },
    });
    if ("error" in creado) {
      return creado.error === "email_existe"
        ? json(409, { error: "Ya existe un usuario registrado con ese email" })
        : json(502, { error: "No se pudo crear el usuario del alumno" });
    }

    // 5. Perfil vinculado al entrenador, con cambio de contraseña obligatorio
    const perfilOk = await deps.upsertPerfil({
      id: creado.id,
      email,
      nombre_completo: nombreCompleto,
      rol: "ALUMNO",
      estado_membresia: "ACTIVA",
      profesor_asignado_id: entrenadorId,
      debe_cambiar_password: true,
      telefono,
    });
    if (!perfilOk) {
      // Evitar usuarios de Auth huérfanos sin perfil
      await deps.eliminarUsuario(creado.id);
      return json(500, { error: "No se pudo crear el perfil del alumno" });
    }

    // 6. Credenciales por email (best effort: la respuesta ya las entrega al entrenador)
    const emailEnviado = await deps
      .enviarCredenciales({ email, nombre: nombreCompleto, password: passwordTemporal })
      .catch(() => false);

    return json(201, {
      alumno_id: creado.id,
      email,
      password_temporal: passwordTemporal,
      email_enviado: emailEnviado,
      mensaje: emailEnviado
        ? `Alumno creado. Le enviamos sus credenciales a ${email}.`
        : `Alumno creado. Compartile sus credenciales: deberá cambiar la contraseña al ingresar en ${LOGIN_URL}.`,
    });
  };
}
