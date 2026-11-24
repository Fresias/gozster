import type { Perfil } from "@/types/database.types";

export interface EntrenadorApoyoViewer {
  userId?: string | null;
  rol?: string | null;
}

export interface CoachCandidato {
  id: string;
  nombre: string;
  rol: "ENTRENADOR" | "ADMIN" | "ALUMNO";
}

type PerfilVinculo = Pick<
  Perfil,
  "id" | "profesor_asignado_id" | "profesor_apoyo_id" | "apoyo_acceso_financiero"
>;

/** Devuelve true si el usuario actual es el entrenador titular del alumno. */
export function esEntrenadorTitular(
  alumno: Pick<Perfil, "profesor_asignado_id">,
  viewer?: EntrenadorApoyoViewer | null,
): boolean {
  return Boolean(viewer?.userId && alumno.profesor_asignado_id === viewer.userId);
}

/** Devuelve true si el usuario actual está asignado como entrenador de apoyo (y no es el titular). */
export function esEntrenadorDeApoyo(
  alumno: Pick<Perfil, "profesor_asignado_id" | "profesor_apoyo_id">,
  viewer?: EntrenadorApoyoViewer | null,
): boolean {
  if (!viewer?.userId) return false;
  return (
    alumno.profesor_apoyo_id === viewer.userId &&
    alumno.profesor_asignado_id !== viewer.userId
  );
}

/**
 * Puede asignar/quitar entrenador de apoyo y habilitar/revocar acceso financiero ($):
 * solo ADMIN o el entrenador titular del alumno (en línea con fn_proteger_campos_perfil).
 * Si no hay userId (modo demo / render aislado sin sesión), permite operar salvo rol ALUMNO.
 */
export function puedeGestionarEntrenadorApoyo(
  alumno: Pick<Perfil, "profesor_asignado_id">,
  viewer?: EntrenadorApoyoViewer | null,
): boolean {
  if (viewer?.rol === "ADMIN") return true;
  if (viewer?.rol === "ALUMNO") return false;
  if (viewer?.userId) return esEntrenadorTitular(alumno, viewer);
  return true;
}

/**
 * Puede ver y operar dinero, membresías, cobros y pagos del alumno:
 * - ADMIN siempre;
 * - Titular siempre;
 * - Entrenador de apoyo solo cuando `apoyo_acceso_financiero === true`
 *   (en línea con `es_entrenador_financiero_de` y `v_estado_alumno`).
 */
export function puedeVerFinanzasAlumno(
  alumno: Pick<
    Perfil,
    "profesor_asignado_id" | "profesor_apoyo_id" | "apoyo_acceso_financiero"
  >,
  viewer?: EntrenadorApoyoViewer | null,
): boolean {
  if (viewer?.rol === "ADMIN") return true;
  if (esEntrenadorDeApoyo(alumno, viewer)) {
    return alumno.apoyo_acceso_financiero === true;
  }
  return true;
}

/**
 * Filtra candidatos válidos para `profesor_apoyo_id` según `chk_perfiles_apoyo_vinculo`
 * y `fn_normalizar_apoyo_perfil`: rol ENTRENADOR/ADMIN, distinto del alumno y del titular.
 */
export function filtrarCandidatosEntrenadorApoyo(
  coaches: CoachCandidato[],
  alumno: Pick<PerfilVinculo, "id" | "profesor_asignado_id">,
): CoachCandidato[] {
  return coaches.filter(
    (c) =>
      (c.rol === "ENTRENADOR" || c.rol === "ADMIN") &&
      c.id !== alumno.id &&
      c.id !== alumno.profesor_asignado_id,
  );
}
