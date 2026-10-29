/**
 * Semáforo de Vigencia de Rutina para Coach Studio (GOZS-242).
 *
 * Criterios de vigencia desde la asignación de la rutina:
 * - 🟢 VERDE (GREEN): 0 a 15 días (rutina vigente)
 * - 🟡 AMARILLO (YELLOW): 16 a 21 días (rutina por renovar)
 * - 🔴 ROJO (RED): 22+ días (rutina vencida o sin rutina asignada)
 *
 * Bordes evaluados: 15 (GREEN), 16 (YELLOW), 21 (YELLOW), 22 (RED).
 *
 * Principio Ponytail & Karpathy: función pura, cero dependencias externas.
 */

export type RutinaVigenciaColor = "GREEN" | "YELLOW" | "RED";

export interface RutinaVigenciaInfo {
  color: RutinaVigenciaColor;
  pillColorClass: string;
  tooltip: string;
  diffDays: number | null;
}

export interface PlanLike {
  fecha_inicio?: string | Date | null;
  created_at?: string | Date | null;
}

/**
 * Evalúa el semáforo de vigencia de una rutina a partir de su fecha de asignación/inicio o plan.
 * Retorna "GREEN" (0-15d), "YELLOW" (16-21d), o "RED" (22+d / sin plan).
 */
export function evaluateRutinaVigenciaSemaphore(
  fechaOPlan: string | Date | PlanLike | null | undefined,
  referenceDate: Date = new Date(),
): RutinaVigenciaColor {
  if (!fechaOPlan) return "RED";

  let dateValue: string | Date | null | undefined;
  if (typeof fechaOPlan === "object" && !(fechaOPlan instanceof Date)) {
    dateValue = fechaOPlan.fecha_inicio || fechaOPlan.created_at;
    if (!dateValue) return "RED";
  } else {
    dateValue = fechaOPlan;
  }

  const inicio = new Date(dateValue);
  if (Number.isNaN(inicio.getTime())) return "RED";

  const msPorDia = 1000 * 60 * 60 * 24;
  const diasAntiguedad = Math.floor((referenceDate.getTime() - inicio.getTime()) / msPorDia);

  if (diasAntiguedad <= 15) {
    return "GREEN";
  }
  if (diasAntiguedad <= 21) {
    return "YELLOW";
  }
  return "RED";
}

/**
 * Obtiene la información visual completa (color, clases CSS y tooltip) para Coach Studio.
 */
export function getRutinaVigenciaInfo(
  fechaOPlan: string | Date | PlanLike | null | undefined,
  referenceDate: Date = new Date(),
): RutinaVigenciaInfo {
  if (!fechaOPlan) {
    return {
      color: "RED",
      pillColorClass: "bg-rose-500",
      tooltip: "Sin rutina asignada (vencida)",
      diffDays: null,
    };
  }

  let dateValue: string | Date | null | undefined;
  if (typeof fechaOPlan === "object" && !(fechaOPlan instanceof Date)) {
    dateValue = fechaOPlan.fecha_inicio || fechaOPlan.created_at;
    if (!dateValue) {
      return {
        color: "RED",
        pillColorClass: "bg-rose-500",
        tooltip: "Sin rutina asignada (vencida)",
        diffDays: null,
      };
    }
  } else {
    dateValue = fechaOPlan;
  }

  const inicio = new Date(dateValue);
  if (Number.isNaN(inicio.getTime())) {
    return {
      color: "RED",
      pillColorClass: "bg-rose-500",
      tooltip: "Fecha de rutina inválida (vencida)",
      diffDays: null,
    };
  }

  const msPorDia = 1000 * 60 * 60 * 24;
  const rawDiff = (referenceDate.getTime() - inicio.getTime()) / msPorDia;
  const diffDays = Math.floor(rawDiff);

  if (diffDays <= 15) {
    const displayDays = Math.max(0, diffDays);
    return {
      color: "GREEN",
      pillColorClass: "bg-emerald-500",
      tooltip: `Rutina vigente (0-15 días: ${displayDays}d)`,
      diffDays: displayDays,
    };
  }

  if (diffDays <= 21) {
    return {
      color: "YELLOW",
      pillColorClass: "bg-amber-500",
      tooltip: `Rutina por renovar (16-21 días: ${diffDays}d)`,
      diffDays,
    };
  }

  return {
    color: "RED",
    pillColorClass: "bg-rose-500",
    tooltip: `Rutina vencida (22+ días: ${diffDays}d)`,
    diffDays,
  };
}
