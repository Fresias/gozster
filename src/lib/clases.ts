import type { Clase, Contratacion, Reserva } from "@/types/database.types";

// Reglas de UI de clases presenciales (#113). Todo en hora argentina, igual que
// las RPC del backend (supabase/migrations/20261021120000_membresias_clases_reservas.sql).
export const ZONA_GIMNASIO = "America/Argentina/Buenos_Aires";

const DIAS_ISO = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
const DIA_CORTO_A_ISO: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

const formatoPartes = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_GIMNASIO,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface PartesLocales {
  anio: number;
  mes: number;
  dia: number;
  diaSemana: number; // ISO: 1 = lunes ... 7 = domingo
  hora: number;
  minuto: number;
  segundo: number;
}

function partesLocales(fecha: Date): PartesLocales {
  const p: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const { type, value } of formatoPartes.formatToParts(fecha)) p[type] = value;
  return {
    anio: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    diaSemana: DIA_CORTO_A_ISO[p.weekday ?? ""] ?? 1,
    hora: Number(p.hour),
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

// Desfase (ms) de la zona del gimnasio respecto de UTC en ese instante.
function desfase(instante: number): number {
  const p = partesLocales(new Date(instante));
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUtc - Math.floor(instante / 1000) * 1000;
}

// Instante en que el reloj de Buenos Aires marca la medianoche de esa fecha.
function medianocheLocal(anio: number, mes: number, dia: number): Date {
  const supuesto = Date.UTC(anio, mes - 1, dia);
  const primero = supuesto - desfase(supuesto);
  return new Date(supuesto - desfase(primero));
}

/**
 * Semana en curso (lunes 00:00:00.000 a domingo 23:59:59.999) en hora argentina.
 * Solo `Intl.DateTimeFormat` y `Date`: sin librerías de fechas (Ponytail).
 */
export function semanaEnCurso(fecha: Date = new Date()): { inicio: Date; fin: Date } {
  const p = partesLocales(fecha);
  const lunes = new Date(Date.UTC(p.anio, p.mes - 1, p.dia - (p.diaSemana - 1)));
  const inicio = medianocheLocal(lunes.getUTCFullYear(), lunes.getUTCMonth() + 1, lunes.getUTCDate());
  const proximo = new Date(lunes.getTime() + 7 * 86_400_000);
  const finExclusivo = medianocheLocal(
    proximo.getUTCFullYear(),
    proximo.getUTCMonth() + 1,
    proximo.getUTCDate(),
  );
  return { inicio, fin: new Date(finExclusivo.getTime() - 1) };
}

/** Fecha local "YYYY-MM-DD" del instante en el gimnasio. */
export function claveDia(fecha: Date | string): string {
  const p = partesLocales(new Date(fecha));
  return `${p.anio}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

export interface DiaSemana {
  clave: string;
  etiqueta: string;
  numero: number;
}

/** Los 7 días (lunes a domingo) de la semana que contiene `fecha`. */
export function diasDeLaSemana(fecha: Date = new Date()): DiaSemana[] {
  const { inicio } = semanaEnCurso(fecha);
  return Array.from({ length: 7 }, (_, i) => {
    // Mediodía local de cada día: siempre cae en la fecha correcta.
    const p = partesLocales(new Date(inicio.getTime() + i * 86_400_000 + 12 * 3_600_000));
    return {
      clave: `${p.anio}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`,
      etiqueta: DIAS_ISO[p.diaSemana] ?? "",
      numero: p.dia,
    };
  });
}

/** "HH:MM" en hora del gimnasio. */
export function horaLocal(fecha: Date | string): string {
  const p = partesLocales(new Date(fecha));
  return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
}

/** "DD/MM" del día siguiente a una fecha "YYYY-MM-DD" (inicio del período de renovación). */
export function diaSiguienteCorto(fechaIso: string): string {
  const [anio = 0, mes = 1, dia = 1] = fechaIso.split("-").map(Number);
  const siguiente = new Date(Date.UTC(anio, mes - 1, dia + 1));
  return `${String(siguiente.getUTCDate()).padStart(2, "0")}/${String(siguiente.getUTCMonth() + 1).padStart(2, "0")}`;
}

// SQLSTATE de las RPC de reservas → mensaje para el alumno o el profesor.
const MENSAJES_ERROR: Record<string, string> = {
  GZ001: "La clase no tiene más cupo.",
  GZ002: "Ya usaste todas tus clases de esta semana.",
  GZ003: "Tu plan no incluye esta actividad.",
  GZ004: "Tu membresía no está habilitada para reservar. Renovala para seguir anotándote.",
  GZ005: "Solo podés reservar clases de la semana en curso.",
  GZ006: "La clase ya comenzó.",
  GZ007: "La clase fue cancelada.",
  GZ008: "Ya estás anotado en esta clase.",
  GZ009: "Esta reserva ya no está activa.",
  "42501": "No tenés permisos para esta acción.",
  P0002: "No encontramos la clase o la reserva.",
};

export function mensajeErrorReserva(error: { code?: string; message?: string } | null): string {
  if (!error) return "";
  return (error.code && MENSAJES_ERROR[error.code]) || "No pudimos completar la acción. Probá de nuevo.";
}

/** Reservas que ocupan cupo y consumen límite semanal (las mismas que cuenta el backend). */
export function ocupaCupo(reserva: Pick<Reserva, "estado">): boolean {
  return reserva.estado === "ANOTADO" || reserva.estado === "AUSENTE";
}

/** Clases distintas que el alumno consumió en la semana de `clasesSemana`. */
export function clasesUsadas(reservas: Reserva[], clasesSemana: Pick<Clase, "id">[]): number {
  const ids = new Set(clasesSemana.map((c) => c.id));
  return new Set(reservas.filter((r) => ocupaCupo(r) && ids.has(r.clase_id)).map((r) => r.clase_id)).size;
}

export type EstadoTarjetaClase =
  | "CANCELADA"
  | "AUSENTE"
  | "RESERVADA"
  | "RESERVADA_INICIADA"
  | "INICIADA"
  | "SIN_CUPO"
  | "LIMITE"
  | "DISPONIBLE";

export function estadoTarjetaClase(args: {
  clase: Pick<Clase, "inicio" | "estado">;
  reserva?: Pick<Reserva, "estado"> | null;
  usadas: number;
  limiteSemanal: number | null;
  sinCupo?: boolean;
  ahora?: Date;
}): EstadoTarjetaClase {
  const { clase, reserva, usadas, limiteSemanal, sinCupo = false, ahora = new Date() } = args;
  const inicio = new Date(clase.inicio).getTime();
  if (clase.estado === "CANCELADA") return "CANCELADA";
  if (reserva?.estado === "AUSENTE") return "AUSENTE";
  if (reserva?.estado === "ANOTADO") return inicio <= ahora.getTime() ? "RESERVADA_INICIADA" : "RESERVADA";
  if (inicio <= ahora.getTime()) return "INICIADA";
  if (sinCupo) return "SIN_CUPO";
  if (limiteSemanal !== null && usadas >= limiteSemanal) return "LIMITE";
  return "DISPONIBLE";
}

/**
 * Si la clase cae después de `fecha_fin`, corresponde al período de renovación:
 * devuelve el "DD/MM" desde el que rige; si no, null.
 */
export function inicioPeriodoRenovacion(
  clase: Pick<Clase, "inicio">,
  membresia: Pick<Contratacion, "fecha_fin" | "estado"> | null,
): string | null {
  if (!membresia || membresia.estado !== "POR_VENCER") return null;
  return claveDia(clase.inicio) > membresia.fecha_fin ? diaSiguienteCorto(membresia.fecha_fin) : null;
}
