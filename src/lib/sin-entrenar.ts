// Filtro "Sin entrenar +7 días" (GOZS-136): membresía activa y último entreno hace más de 7 días, o nulo.
export const DIAS_SIN_ENTRENAR = 7;

export function esSinEntrenar7d(
  a: { estado_membresia?: string | null; ultimo_entreno_at?: string | null },
  ahora: number = Date.now(),
): boolean {
  if (a.estado_membresia !== "ACTIVA" && a.estado_membresia !== "ACTIVE") return false;
  if (!a.ultimo_entreno_at) return true;
  const t = Date.parse(a.ultimo_entreno_at);
  if (Number.isNaN(t)) return true;
  return ahora - t > DIAS_SIN_ENTRENAR * 86_400_000;
}
