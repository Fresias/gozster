/**
 * Utilidades de nombre para el saludo al alumno (Athlete v7 · BE-01 / D-53).
 */

export interface PerfilNombreSaludo {
  nombre_preferido?: string | null;
  nombre_completo?: string | null;
}

export const NOMBRE_PREFERIDO_MAX_LEN = 30;

/**
 * Recorta espacios en extremos y convierte un string vacío en `null`.
 */
export function normalizarNombrePreferido(nombre: string | null | undefined): string | null {
  if (typeof nombre !== "string") return null;
  const trimmed = nombre.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Devuelve el nombre para saludar al alumno:
 * - `nombre_preferido` recortado si tiene contenido,
 * - primer nombre de `nombre_completo` si tiene contenido,
 * - `""` si faltan ambos.
 */
export function nombreParaSaludo(perfil?: PerfilNombreSaludo | null): string {
  const preferido = normalizarNombrePreferido(perfil?.nombre_preferido);
  if (preferido) return preferido;

  if (typeof perfil?.nombre_completo !== "string") return "";
  const completo = perfil.nombre_completo.trim();
  if (!completo) return "";

  return completo.split(/\s+/)[0] || "";
}
