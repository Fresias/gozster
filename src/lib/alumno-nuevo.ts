// Filtro "Nuevos" del Studio (GOZS-138): alta dentro de los últimos N días.
export const DIAS_ALUMNO_NUEVO = 90;

export function esAlumnoNuevo(createdAt: string | null | undefined, ahora: number = Date.now()): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return false;
  return ahora - t <= DIAS_ALUMNO_NUEVO * 86_400_000;
}
