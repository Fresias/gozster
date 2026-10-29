import type { PlanMembresia } from "@/types/database.types";

export type ActividadPlanOpcion = "FUNCIONAL" | "BOXEO" | "RUTINAS" | "FUNCIONAL_BOXEO";

export interface PlanMembresiaConVigencia extends PlanMembresia {
  actividad_tipo?: ActividadPlanOpcion;
  vigente_desde?: string;
  precio_anterior?: number;
}

export const AVISO_VIGENCIA_FUTURA =
  "Los aumentos o cambios de precio solo aplican a partir de la fecha de vigencia futura. No alteran pagos ya cobrados ni cuotas vencidas.";

export function getHoyFechaString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getMananaFechaString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function esFechaPosteriorAHoy(fechaStr: string, hoyStr?: string): boolean {
  if (!fechaStr) return false;
  const hoy = hoyStr ?? getHoyFechaString();
  return fechaStr > hoy;
}

export function validarVigenciaFutura(
  fechaStr: string,
  hoyStr?: string
): { valida: boolean; error?: string } {
  if (!fechaStr) {
    return { valida: false, error: "La fecha de vigencia es obligatoria." };
  }
  if (!esFechaPosteriorAHoy(fechaStr, hoyStr)) {
    return {
      valida: false,
      error: "La fecha de vigencia debe ser posterior a hoy (fecha futura).",
    };
  }
  return { valida: true };
}

export function formatearDuracionPlan(duracionMeses: number): string {
  switch (duracionMeses) {
    case 1:
      return "Mensual (1 mes)";
    case 3:
      return "Trimestral (3 meses)";
    case 6:
      return "Semestral (6 meses)";
    case 12:
      return "Anual (12 meses)";
    default:
      return `${duracionMeses} meses`;
  }
}

export function formatearActividadPlan(actividad?: ActividadPlanOpcion): string {
  switch (actividad) {
    case "FUNCIONAL":
      return "Funcional";
    case "BOXEO":
      return "Boxeo";
    case "RUTINAS":
      return "Rutinas Online";
    case "FUNCIONAL_BOXEO":
      return "Funcional + Boxeo";
    default:
      return "General";
  }
}
