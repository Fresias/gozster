import type {
  Contratacion,
  EstadoContratacion,
  Perfil,
} from "@/types/database.types";

/**
 * Lógica de dominio de Contrataciones (ADR-001).
 *
 * Mantiene separados Estado de Cuenta, Contratación, Pago y Rutina, y aplica la
 * regla de "anclaje de fecha" en las renovaciones: la fecha de corte del mes
 * siguiente respeta el día de vencimiento original ("no se corre la fecha").
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Normaliza a medianoche UTC para comparar sólo por fecha (sin hora). */
function toDateOnly(value: string | Date): Date {
  const d = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Último día del mes (1-31) para el par año/mes dados (mes base 0). */
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Calcula la nueva fecha de corte anclada al día de vencimiento original.
 *
 * Regla ADR-001: `fecha_fin_anterior + 1 mes`, conservando `diaVencimiento`
 * como día de corte. Si el alumno paga tarde, el ciclo NO se corre al día de
 * pago. Si el mes destino no tiene ese día (ej. 31 en febrero), se ancla al
 * último día disponible del mes.
 *
 * @returns fecha ISO `YYYY-MM-DD`.
 */
export function computeAnchoredRenewalDate(
  fechaFinAnterior: string | Date,
  diaVencimiento: number,
): string {
  const base = toDateOnly(fechaFinAnterior);
  const targetMonth = base.getUTCMonth() + 1;
  const targetYear = base.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;

  const maxDay = lastDayOfMonth(targetYear, normalizedMonth);
  const anchoredDay = Math.min(Math.max(diaVencimiento, 1), maxDay);

  const result = new Date(Date.UTC(targetYear, normalizedMonth, anchoredDay));
  return result.toISOString().slice(0, 10);
}

/**
 * Deriva el estado de una contratación a partir de su `fecha_fin` y la fecha
 * de referencia (hoy por defecto), según los umbrales de ADR-001:
 * - `VENCIDA`   → `hoy > fecha_fin`.
 * - `POR_VENCER`→ dentro de `diasAvisoPrevio` (5 por defecto) antes de `fecha_fin`.
 * - `VIGENTE`   → en cualquier otro caso.
 *
 * No sobrescribe estados manuales (`EN_PAUSA`, `PENDIENTE_RENOVACION`).
 */
export function derivarEstadoContratacion(
  fechaFin: string | Date,
  diasAvisoPrevio = 5,
  hoy: string | Date = new Date(),
): EstadoContratacion {
  const fin = toDateOnly(fechaFin).getTime();
  const ref = toDateOnly(hoy).getTime();

  if (ref > fin) return "VENCIDA";
  if (fin - ref <= diasAvisoPrevio * MS_PER_DAY) return "POR_VENCER";
  return "VIGENTE";
}

/**
 * Construye una contratación "en vivo" a partir del perfil del alumno cuando el
 * backend todavía no entregó una fila dedicada. Mantiene el contrato de tipos y
 * permite mostrar la ficha comercial sin inventar datos fuera del esquema.
 */
export function derivarContratacionDesdePerfil(
  alumno: Perfil,
  hoy: string | Date = new Date(),
): Contratacion {
  const fechaFin =
    alumno.fecha_vencimiento_cuota ?? toDateOnly(hoy).toISOString().slice(0, 10);
  const diaVencimiento = toDateOnly(fechaFin).getUTCDate();

  let estado: EstadoContratacion;
  switch (alumno.estado_membresia) {
    case "EXPIRED_PAYMENT_PENDING":
      estado = "VENCIDA";
      break;
    case "PENDIENTE":
      estado = "PENDIENTE_RENOVACION";
      break;
    case "INACTIVA":
      estado = "EN_PAUSA";
      break;
    default:
      estado = derivarEstadoContratacion(fechaFin, 5, hoy);
  }

  const inicio = new Date(toDateOnly(fechaFin).getTime() - 30 * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);

  return {
    id: `contratacion-derivada-${alumno.id}`,
    alumno_id: alumno.id,
    tipo_servicio: "ASESORIA_ONLINE",
    estado,
    dia_vencimiento: diaVencimiento,
    fecha_inicio: inicio,
    fecha_fin: toDateOnly(fechaFin).toISOString().slice(0, 10),
    dias_aviso_previo: 5,
    plan_membresia_id: null,
    actividad: null,
    created_at: alumno.created_at,
    updated_at: alumno.updated_at,
  };
}

/** Etiqueta en español para cada estado de contratación. */
export const ESTADO_CONTRATACION_LABEL: Record<EstadoContratacion, string> = {
  VIGENTE: "Vigente",
  POR_VENCER: "Por vencer",
  VENCIDA: "Vencida",
  EN_PAUSA: "En pausa",
  PENDIENTE_RENOVACION: "Pendiente de renovación",
};
