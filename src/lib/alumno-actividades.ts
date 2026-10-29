import type {
  ActividadAlumno,
  AlumnoActividad,
  Contratacion,
  Perfil,
  PlanEntrenamiento,
} from "@/types/database.types";

export type FiltroActividad = ActividadAlumno | "TODAS";

export const ETIQUETAS_ACTIVIDAD: Record<ActividadAlumno, string> = {
  FUNCIONAL: "Funcional",
  BOXEO: "Boxeo",
  RUTINAS: "Rutina online",
};

export const ETIQUETAS_FILTRO_ACTIVIDAD: Record<FiltroActividad, string> = {
  TODAS: "Todas",
  FUNCIONAL: "Funcional",
  BOXEO: "Boxeo",
  RUTINAS: "Rutina online",
};

/**
 * Deriva la lista de actividades a las que pertenece un alumno.
 * Un alumno puede tener múltiples actividades (ej. Funcional y Boxeo por pase libre,
 * o registros separados en la tabla alumno_actividades).
 */
export function obtenerActividadesAlumno(params: {
  alumnoId: string;
  alumnoActividades?: AlumnoActividad[] | null;
  contrataciones?: Contratacion[] | null;
  planes?: PlanEntrenamiento[] | null;
  alumno?: Perfil | null;
}): ActividadAlumno[] {
  const { alumnoId, alumnoActividades, contrataciones, planes } = params;

  // 1. Si existen registros explícitos en alumno_actividades
  if (alumnoActividades && alumnoActividades.length > 0) {
    const directas = alumnoActividades
      .filter((aa) => aa.alumno_id === alumnoId)
      .map((aa) => aa.actividad);
    if (directas.length > 0) {
      return Array.from(new Set(directas));
    }
  }

  // 2. Derivación por contrataciones
  const actividades = new Set<ActividadAlumno>();

  if (contrataciones && contrataciones.length > 0) {
    const aluContrataciones = contrataciones.filter((c) => c.alumno_id === alumnoId);
    for (const c of aluContrataciones) {
      if (c.actividad === "FUNCIONAL") {
        actividades.add("FUNCIONAL");
      } else if (c.actividad === "BOXEO") {
        actividades.add("BOXEO");
      }

      // Pase libre (Funcional + Boxeo sin límite)
      const planId = (c.plan_membresia_id ?? "").toLowerCase();
      if (
        planId.includes("libre") ||
        planId === "demo-plan-pase-libre" ||
        (c.plan_membresia_id && !c.actividad && c.tipo_servicio === "PRESENCIAL")
      ) {
        actividades.add("FUNCIONAL");
        actividades.add("BOXEO");
      }

      if (c.tipo_servicio === "ASESORIA_ONLINE") {
        actividades.add("RUTINAS");
      }
    }
  }

  // 3. Derivación por planes de entrenamiento (rutinas activas)
  if (planes && planes.length > 0) {
    const tieneRutina = planes.some(
      (p) => p.alumno_id === alumnoId && p.estado === "ACTIVO",
    );
    if (tieneRutina) {
      actividades.add("RUTINAS");
    }
  }

  // 4. Fallback si no tiene actividad asignada aún: Rutina online
  if (actividades.size === 0) {
    actividades.add("RUTINAS");
  }

  return Array.from(actividades);
}

/**
 * Determina si un alumno califica bajo un filtro de actividad dado.
 */
export function alumnoTieneActividad(params: {
  alumnoId: string;
  actividad: FiltroActividad;
  alumnoActividades?: AlumnoActividad[] | null;
  contrataciones?: Contratacion[] | null;
  planes?: PlanEntrenamiento[] | null;
  alumno?: Perfil | null;
}): boolean {
  if (params.actividad === "TODAS") return true;
  const actividades = obtenerActividadesAlumno(params);
  return actividades.includes(params.actividad);
}
