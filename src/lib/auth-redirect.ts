const BASE_ORIGIN = "https://gozster.local";
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

function isAuthLoopPath(pathname: string): boolean {
  const normalized = pathname.toLowerCase();
  return (
    normalized === "/login" ||
    normalized.startsWith("/login/") ||
    normalized === "/auth" ||
    normalized.startsWith("/auth/")
  );
}

/**
 * Valida y normaliza un parámetro `redirectTo` para permitir solo rutas
 * relativas internas del mismo origen y evitar bucles hacia rutas de auth.
 */
export function sanitizeRedirectTo(
  raw: string | null | undefined,
  fallback = "/studio",
): string {
  if (typeof raw !== "string" || raw.length === 0) {
    return fallback;
  }

  if (
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    CONTROL_CHARS_RE.test(raw)
  ) {
    return fallback;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw, BASE_ORIGIN);
  } catch {
    return fallback;
  }

  if (parsed.origin !== BASE_ORIGIN) {
    return fallback;
  }

  if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) {
    return fallback;
  }

  if (isAuthLoopPath(parsed.pathname)) {
    return fallback;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Resuelve el destino posterior al cambio obligatorio de contraseña según el rol:
 * - ENTRENADOR / ADMIN -> `redirectTo` sanitizado (fallback "/studio")
 * - ALUMNO o perfil ilegible -> "/athlete"
 */
export function resolvePostPasswordChangeRedirect(
  rol: string | null | undefined,
  redirectTo: string | null | undefined,
): string {
  if (rol === "ENTRENADOR" || rol === "ADMIN") {
    return sanitizeRedirectTo(redirectTo, "/studio");
  }
  return "/athlete";
}
