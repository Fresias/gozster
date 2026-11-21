import type {
  ActividadAlumno,
  AlumnoActividad,
  Contratacion,
  Perfil,
  PlanEntrenamiento,
  PlanMembresia,
} from "@/types/database.types";

export type FiltroActividad = ActividadAlumno | "TODAS";
export type CodigoLabelActividad = "B" | "F" | "P";

export interface LabelActividadItem {
  codigo: CodigoLabelActividad;
  titulo: string;
}

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

/**
 * Deriva los labels monocromáticos neutros (B = Boxeo, F = Funcional, P = Plan/Rutina)
 * a partir de las actividades reales, contrataciones activas y planes de entrenamiento.
 */
export function derivarLabelsActividadAlumno(params: {
  alumnoId: string;
  alumnoActividades?: AlumnoActividad[] | null;
  contrataciones?: Contratacion[] | null;
  planes?: PlanEntrenamiento[] | null;
  planesMembresia?: Array<Pick<PlanMembresia, "id" | "nombre" | "cantidad_actividades"> & { actividad_tipo?: string }> | null;
}): LabelActividadItem[] {
  const { alumnoId, alumnoActividades, contrataciones, planes, planesMembresia } = params;
  let tieneBoxeo = false;
  let tieneFuncional = false;
  let tienePlan = false;

  if (alumnoActividades && alumnoActividades.length > 0) {
    for (const aa of alumnoActividades) {
      if (aa.alumno_id !== alumnoId) continue;
      if (aa.actividad === "BOXEO") tieneBoxeo = true;
      if (aa.actividad === "FUNCIONAL") tieneFuncional = true;
      if (aa.actividad === "RUTINAS") tienePlan = true;
    }
  }

  if (contrataciones && contrataciones.length > 0) {
    for (const c of contrataciones) {
      if (c.alumno_id !== alumnoId || c.estado === "VENCIDA") continue;
      if (c.actividad === "BOXEO") tieneBoxeo = true;
      if (c.actividad === "FUNCIONAL") tieneFuncional = true;
      if (c.actividad === "RUTINAS" || c.tipo_servicio === "ASESORIA_ONLINE") tienePlan = true;

      const planMem = c.plan_membresia_id
        ? planesMembresia?.find((pm) => pm.id === c.plan_membresia_id)
        : undefined;
      if (planMem) {
        const planNombre = planMem.nombre.toLowerCase();
        const actTipo = planMem.actividad_tipo;

        if (
          actTipo === "FUNCIONAL_BOXEO" ||
          planMem.cantidad_actividades === 2 ||
          planNombre.includes("libre")
        ) {
          tieneFuncional = true;
          tieneBoxeo = true;
        } else if (actTipo === "BOXEO" || planNombre.includes("boxeo")) {
          tieneBoxeo = true;
        } else if (actTipo === "FUNCIONAL" || planNombre.includes("funcional")) {
          tieneFuncional = true;
        } else if (actTipo === "RUTINAS" || planNombre.includes("rutina")) {
          tienePlan = true;
        }
      }
    }
  }

  if (planes && planes.length > 0) {
    if (planes.some((p) => p.alumno_id === alumnoId && p.estado === "ACTIVO")) {
      tienePlan = true;
    }
  }

  const labels: LabelActividadItem[] = [];
  if (tieneBoxeo) labels.push({ codigo: "B", titulo: "Boxeo" });
  if (tieneFuncional) labels.push({ codigo: "F", titulo: "Funcional" });
  if (tienePlan) labels.push({ codigo: "P", titulo: "Plan / Rutina asignada" });
  return labels;
}
