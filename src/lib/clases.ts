import type { Clase, Contratacion, Perfil, PlanMembresia, Reserva } from "@/types/database.types";

// Reglas de UI de clases presenciales (#113 / GH #122). Todo en hora argentina,
// igual que las RPC del backend (supabase/migrations/20261021120000_membresias_clases_reservas.sql).
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

// SQLSTATE de las RPC de reservas → mensaje oficial en español (GH #122).
export const MENSAJES_ERROR: Record<string, string> = {
  GZ001: "No quedan cupos en esta clase",
  GZ002: "Ya usaste tus clases de esta semana",
  GZ003: "Tu plan no incluye esta actividad",
  GZ004: "Tu membresía no está habilitada para reservar",
  GZ005: "Solo podés reservar clases de esta semana",
  GZ006: "La clase ya comenzó",
  GZ007: "La clase fue cancelada",
  GZ008: "Ya estás anotado en esta clase",
  GZ009: "Esta reserva ya no está activa",
  "42501": "No tenés permisos para esta acción",
  P0002: "No encontramos la clase o la reserva",
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


export interface DiaMes {
  clave: string; // "YYYY-MM-DD"
  numero: number;
  esMesActual: boolean;
  esHoy: boolean;
  diaSemana: number; // 1 = lun ... 7 = dom
}

/**
 * Matriz de días para la vista de mes (calendario de 35 o 42 celdas),
 * alineado lunes a domingo con hora de Buenos Aires (Ponytail: solo Date / Intl).
 */
export function diasDelMes(fechaRef: Date = new Date()): DiaMes[] {
  const p = partesLocales(fechaRef);
  const primerDiaMes = medianocheLocal(p.anio, p.mes, 1);
  const pPrimer = partesLocales(primerDiaMes);

  // Lunes de la primera semana del mes
  const offsetInicio = pPrimer.diaSemana - 1;
  const fechaInicioGrid = new Date(primerDiaMes.getTime() - offsetInicio * 86_400_000);

  const hoyClave = claveDia(new Date());
  const dias: DiaMes[] = [];

  // Siempre generamos 35 o 42 celdas (5 o 6 semanas completas)
  const totalCeldas = offsetInicio + new Date(Date.UTC(p.anio, p.mes, 0)).getUTCDate() > 35 ? 42 : 35;

  for (let i = 0; i < totalCeldas; i++) {
    const instante = new Date(fechaInicioGrid.getTime() + i * 86_400_000 + 12 * 3_600_000);
    const pDia = partesLocales(instante);
    const clave = `${pDia.anio}-${String(pDia.mes).padStart(2, "0")}-${String(pDia.dia).padStart(2, "0")}`;
    dias.push({
      clave,
      numero: pDia.dia,
      esMesActual: pDia.mes === p.mes && pDia.anio === p.anio,
      esHoy: clave === hoyClave,
      diaSemana: pDia.diaSemana,
    });
  }

  return dias;
}

export interface InfoSolape {
  columna: number;
  totalColumnas: number;
}

/**
 * Detecta solapes temporales de clases en el mismo día para acomodarlas
 * visualmente lado a lado (estilo Google Calendar / Calender App Design).
 */
export function detectarSolapes(
  clases: Pick<Clase, "id" | "inicio" | "duracion_minutos">[],
): Map<string, InfoSolape> {
  const resultado = new Map<string, InfoSolape>();
  if (clases.length === 0) return resultado;

  // Agrupar por clave de día
  const porDia = new Map<string, typeof clases>();
  for (const c of clases) {
    const dia = claveDia(c.inicio);
    const lista = porDia.get(dia) ?? [];
    lista.push(c);
    porDia.set(dia, lista);
  }

  for (const lista of porDia.values()) {
    // Ordenar por inicio ascendente
    const ordenadas = [...lista].sort(
      (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
    );

    // Identificar grupos de solape
    const grupos: (typeof clases)[] = [];
    let grupoActual: typeof clases = [];
    let finMaxGrupo = 0;

    for (const c of ordenadas) {
      const ini = new Date(c.inicio).getTime();
      const fin = ini + (c.duracion_minutos || 60) * 60_000;

      if (grupoActual.length === 0 || ini < finMaxGrupo) {
        grupoActual.push(c);
        finMaxGrupo = Math.max(finMaxGrupo, fin);
      } else {
        grupos.push(grupoActual);
        grupoActual = [c];
        finMaxGrupo = fin;
      }
    }
    if (grupoActual.length > 0) grupos.push(grupoActual);

    // Asignar columnas dentro de cada grupo
    for (const grupo of grupos) {
      const columnas: number[] = [];
      for (const c of grupo) {
        const ini = new Date(c.inicio).getTime();
        const fin = ini + (c.duracion_minutos || 60) * 60_000;

        let colIdx = columnas.findIndex((colFin) => colFin <= ini);
        if (colIdx === -1) {
          colIdx = columnas.length;
          columnas.push(fin);
        } else {
          columnas[colIdx] = fin;
        }

        resultado.set(c.id, {
          columna: colIdx,
          totalColumnas: Math.max(grupo.length > 1 ? grupo.length : 1, columnas.length),
        });
      }
      const total = columnas.length;
      for (const c of grupo) {
        const prev = resultado.get(c.id);
        if (prev) resultado.set(c.id, { ...prev, totalColumnas: total });
      }
    }
  }

  return resultado;
}

export type TipoAvisoAnotacion =
  | "NINGUNO"
  | "SIN_SUSCRIPCION"
  | "LIMITE_SEMANAL"
  | "ACTIVIDAD_DISTINTA"
  | "SOBRECUPO";

export interface ResultadoValidacionAnotacion {
  valida: boolean;
  advertencia?: string;
  requiereConfirmacion: boolean;
  tipoAviso: TipoAvisoAnotacion;
}

/**
 * Valida la anotación manual de un alumno por parte del entrenador en Coach Studio.
 * Criterio Gherkin:
 * - GIVEN una clase con cupo N WHEN el coach anota un alumno sin suscripción vigente
 *   THEN se le avisa y puede forzar con confirmación.
 * También contempla cupo flexible (sobrecupo permitido con aviso) y límite semanal.
 */
export function validarAnotacionCoach(args: {
  clase: Pick<Clase, "id" | "actividad" | "capacidad" | "inicio">;
  alumno: Pick<Perfil, "id" | "nombre_completo">;
  contratacion: Pick<Contratacion, "estado" | "fecha_inicio" | "fecha_fin" | "actividad"> | null;
  plan: Pick<PlanMembresia, "limite_semanal" | "cantidad_actividades"> | null;
  anotadosClaseActual: number;
  usadasSemanaAlumno: number;
  ahora?: Date;
}): ResultadoValidacionAnotacion {
  const { clase, alumno, contratacion, plan, anotadosClaseActual, usadasSemanaAlumno, ahora = new Date() } = args;
  const hoyStr = claveDia(ahora);

  // 1. Validación de suscripción vigente
  const sinSuscripcion =
    !contratacion ||
    contratacion.estado === "VENCIDA" ||
    (contratacion.fecha_fin && contratacion.fecha_fin < hoyStr) ||
    (contratacion.fecha_inicio && contratacion.fecha_inicio > hoyStr);

  if (sinSuscripcion) {
    const estado = contratacion ? contratacion.estado : "SIN_SUSCRIPCION";
    return {
      valida: false,
      requiereConfirmacion: true,
      tipoAviso: "SIN_SUSCRIPCION",
      advertencia: `${alumno.nombre_completo} no tiene una suscripción vigente (Estado: ${estado}). Podés forzar la anotación con confirmación.`,
    };
  }

  // 2. Cobertura de la actividad por el plan
  if (plan && plan.cantidad_actividades === 1 && contratacion?.actividad && contratacion.actividad !== clase.actividad) {
    return {
      valida: false,
      requiereConfirmacion: true,
      tipoAviso: "ACTIVIDAD_DISTINTA",
      advertencia: `El plan de ${alumno.nombre_completo} cubre ${contratacion.actividad}, pero esta clase es de ${clase.actividad}. Podés forzar la anotación con confirmación.`,
    };
  }

  // 3. Límite semanal de clases
  if (plan && plan.limite_semanal !== null && usadasSemanaAlumno >= plan.limite_semanal) {
    return {
      valida: false,
      requiereConfirmacion: true,
      tipoAviso: "LIMITE_SEMANAL",
      advertencia: `${alumno.nombre_completo} ya usó sus ${plan.limite_semanal} clases de esta semana (${usadasSemanaAlumno}/${plan.limite_semanal}). Podés forzar sobrecupo.`,
    };
  }

  // 4. Cupo flexible de la clase (sobrecupo)
  if (clase.capacidad !== null && anotadosClaseActual >= clase.capacidad) {
    return {
      valida: true,
      requiereConfirmacion: true,
      tipoAviso: "SOBRECUPO",
      advertencia: `La clase está completa (${anotadosClaseActual}/${clase.capacidad} cupos). Como el cupo es flexible, podés anotar al alumno como sobrecupo.`,
    };
  }

  return {
    valida: true,
    requiereConfirmacion: false,
    tipoAviso: "NINGUNO",
  };
}

export interface RangoHorarioUtil {
  horaMin: number;
  horaMax: number;
  tieneClases: boolean;
  textoLeyenda: string;
}

/**
 * Calcula automáticamente la franja horaria útil a partir de las clases programadas activas (GOZS-385).
 * - Acota la grilla semanal y diaria visualmente al rango entre la clase más temprana y la más tardía.
 *   Ej.: si las clases van de 17:00 a 20:30, la grilla se ajusta de 17:00 a 21:00.
 * - Si no hay clases programadas, devuelve un rango por defecto (ej. 07:00 a 21:00).
 * - Genera la leyenda informativa para el pie del calendario.
 */
export function calcularRangoHorarioUtil(
  clases: Array<Pick<Clase, "inicio"> & { duracion_minutos?: number | null; estado?: string | null }>,
  opciones?: { fallbackMin?: number; fallbackMax?: number }
): RangoHorarioUtil {
  const fallbackMin = opciones?.fallbackMin ?? 7;
  const fallbackMax = opciones?.fallbackMax ?? 21;

  if (!clases || clases.length === 0) {
    const minStr = `${String(fallbackMin).padStart(2, "0")}:00`;
    const maxStr = `${String(fallbackMax).padStart(2, "0")}:00`;
    return {
      horaMin: fallbackMin,
      horaMax: fallbackMax,
      tieneClases: false,
      textoLeyenda: `Sin clases programadas · Mostrando horario general: ${minStr} - ${maxStr}`,
    };
  }

  let minH = 24;
  let maxH = 0;

  for (const c of clases) {
    const horaLocalStr = horaLocal(c.inicio);
    const [hStr, mStr] = horaLocalStr.split(":");
    const hora = Number(hStr) || 0;
    const minuto = Number(mStr) || 0;
    const durH = (c.duracion_minutos || 60) / 60;
    const finH = Math.ceil(hora + minuto / 60 + durH);

    minH = Math.min(minH, hora);
    maxH = Math.max(maxH, finH);
  }

  const horaMin = Math.max(0, Math.min(minH, 23));
  const horaMax = Math.min(24, Math.max(maxH, horaMin + 1));
  const minStr = `${String(horaMin).padStart(2, "0")}:00`;
  const maxStr = `${String(horaMax).padStart(2, "0")}:00`;

  return {
    horaMin,
    horaMax,
    tieneClases: true,
    textoLeyenda: `Mostrando horario con actividad: ${minStr} - ${maxStr} · las horas sin clases se ocultan automáticamente.`,
  };
}
