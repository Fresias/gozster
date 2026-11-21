import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type {
  ActividadClase,
  AlumnoActividad,
  Clase,
  Contratacion,
  Database,
  FeedbackClase,
  Perfil,
  PlanMembresia,
  Reserva,
  SensacionClase,
} from "@/types/database.types";

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

export const MENSAJE_SIN_SENAL =
  "Estás sin señal. Volvé a intentarlo cuando el indicador esté en verde (Online).";

export function mensajeErrorReserva(error: { code?: string; message?: string } | null): string {
  if (!error) return "";
  return (error.code && MENSAJES_ERROR[error.code]) || "No pudimos completar la acción. Probá de nuevo.";
}

/**
 * Resuelve las actividades presenciales habilitadas (`FUNCIONAL` / `BOXEO`) para un alumno
 * combinando sus `contrataciones` vigentes y `alumno_actividades` (espejo de `_resolver_cobertura_actividad_alumno`).
 */
export function resolverActividadesHabilitadas(params: {
  contrataciones?: Pick<
    Contratacion,
    "plan_membresia_id" | "estado" | "fecha_inicio" | "fecha_fin" | "actividad"
  >[];
  planesPorId?: Record<string, Pick<PlanMembresia, "cantidad_actividades" | "limite_semanal">>;
  actividadesAlumno?: Pick<AlumnoActividad, "actividad">[];
  membresia?: Pick<
    Contratacion,
    "plan_membresia_id" | "estado" | "fecha_inicio" | "fecha_fin" | "actividad"
  > | null;
  plan?: Pick<PlanMembresia, "cantidad_actividades" | "limite_semanal"> | null;
  ahora?: Date;
}): ActividadClase[] {
  const {
    contrataciones,
    planesPorId,
    actividadesAlumno = [],
    membresia,
    plan,
    ahora = new Date(),
  } = params;

  const hoy = claveDia(ahora);
  const listaContrataciones =
    contrataciones && contrataciones.length > 0
      ? contrataciones
      : membresia
        ? [membresia]
        : [];

  const esVigente = (
    c: Pick<Contratacion, "estado" | "fecha_inicio" | "fecha_fin">,
  ): boolean =>
    c.estado !== "EN_PAUSA" &&
    c.estado !== "VENCIDA" &&
    (!c.fecha_inicio || c.fecha_inicio <= hoy) &&
    (!c.fecha_fin || c.fecha_fin >= hoy);

  const habilitadas = new Set<ActividadClase>();

  for (const c of listaContrataciones) {
    if (!esVigente(c) || !c.plan_membresia_id) continue;
    const planContratacion =
      (planesPorId && planesPorId[c.plan_membresia_id]) || plan || null;
    if (planContratacion?.cantidad_actividades === 2) {
      habilitadas.add("FUNCIONAL");
      habilitadas.add("BOXEO");
    } else if (c.actividad === "FUNCIONAL" || c.actividad === "BOXEO") {
      habilitadas.add(c.actividad);
    }
  }

  const tieneContratacionVigente = listaContrataciones.some(esVigente);
  if (
    actividadesAlumno.length > 0 &&
    (tieneContratacionVigente || listaContrataciones.length === 0)
  ) {
    for (const act of actividadesAlumno) {
      if (act.actividad === "FUNCIONAL" || act.actividad === "BOXEO") {
        habilitadas.add(act.actividad);
      }
    }
  }

  return Array.from(habilitadas);
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

export const ACTIVIDAD_LABEL: Record<string, string> = {
  FUNCIONAL: "Funcional",
  BOXEO: "Boxeo",
};

/** Construye el mensaje de aviso in-app/WhatsApp por cancelación de clase. */
export function buildCancelacionAvisoTexto(params: {
  actividad: string;
  inicio: string;
  motivo?: string | null;
}): string {
  const fechaObj = new Date(params.inicio);
  const horaStr = fechaObj.toLocaleTimeString("es-AR", {
    timeZone: ZONA_GIMNASIO,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const diaStr = fechaObj.toLocaleDateString("es-AR", {
    timeZone: ZONA_GIMNASIO,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const actividadNombre = ACTIVIDAD_LABEL[params.actividad] || params.actividad;
  const motivoTrim = params.motivo?.trim();
  const motivoTexto = motivoTrim ? ` Motivo: ${motivoTrim}` : "";
  return `Tu clase de ${actividadNombre} del ${diaStr} ${horaStr} fue cancelada.${motivoTexto}`;
}

/** Genera la URL wa.me ($0/mes) con el aviso de cancelación prellenado para un alumno. */
export function buildWhatsAppCancelacionUrl(params: {
  telefono?: string | null;
  mensaje: string;
}): string {
  const cleanPhone = (params.telefono || "").replace(/\D/g, "");
  const encodedMsg = encodeURIComponent(params.mensaje);
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodedMsg}`
    : `https://wa.me/?text=${encodedMsg}`;
}

export interface ProximaClaseReservada {
  reserva: Reserva;
  clase: Clase;
  actividadLabel: string;
  horarioLabel: string;
}

const fmtDiaCortoClase = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_GIMNASIO,
  weekday: "short",
  day: "numeric",
});

/**
 * Selecciona la próxima reserva activa del alumno (`estado === 'ANOTADO'` + clase `'PROGRAMADA'`
 * aún no iniciada, ordenada por `inicio ASC`) y formatea actividad + horario en hora argentina.
 */
export function obtenerProximaClaseReservada(
  reservas: Reserva[],
  clases: Clase[],
  ahora: Date = new Date(),
): ProximaClaseReservada | null {
  if (!reservas?.length || !clases?.length) return null;

  const clasesPorId = new Map<string, Clase>();
  for (const c of clases) {
    if (c.estado === "PROGRAMADA") clasesPorId.set(c.id, c);
  }

  const ahoraMs = ahora.getTime();
  let mejor: { reserva: Reserva; clase: Clase; inicioMs: number } | null = null;

  for (const r of reservas) {
    if (r.estado !== "ANOTADO") continue;
    const clase = clasesPorId.get(r.clase_id);
    if (!clase) continue;
    const inicioMs = Date.parse(clase.inicio);
    if (Number.isNaN(inicioMs) || inicioMs < ahoraMs) continue;
    if (!mejor || inicioMs < mejor.inicioMs) {
      mejor = { reserva: r, clase, inicioMs };
    }
  }

  if (!mejor) return null;

  const hoyClave = claveDia(ahora);
  const mananaClave = claveDia(new Date(ahoraMs + 86_400_000));
  const claseClave = claveDia(mejor.clase.inicio);
  const hora = horaLocal(mejor.clase.inicio);

  let prefijoDia: string;
  if (claseClave === hoyClave) {
    prefijoDia = "Hoy";
  } else if (claseClave === mananaClave) {
    prefijoDia = "Mañana";
  } else {
    const crudo = fmtDiaCortoClase.format(new Date(mejor.inicioMs)).replace(/\./g, "");
    prefijoDia = crudo.charAt(0).toUpperCase() + crudo.slice(1);
  }

  return {
    reserva: mejor.reserva,
    clase: mejor.clase,
    actividadLabel: ACTIVIDAD_LABEL[mejor.clase.actividad] || mejor.clase.actividad,
    horarioLabel: `${prefijoDia} · ${hora} hs`,
  };
}

export const MAX_LARGO_NOTA_CLASE = 280;
export const VENTANA_FEEDBACK_HORAS = 48;

export const SENSACIONES_CLASE: Array<{ valor: SensacionClase; etiqueta: string }> = [
  { valor: 1, etiqueta: "Fácil" },
  { valor: 2, etiqueta: "Bien" },
  { valor: 3, etiqueta: "Dura" },
  { valor: 4, etiqueta: "Durísima" },
];

export const ETIQUETA_SENSACION: Record<SensacionClase, string> = {
  1: "Fácil",
  2: "Bien",
  3: "Dura",
  4: "Durísima",
};

export interface AsistenciaClaseItem {
  reserva_id: string;
  clase_id: string;
  actividad: ActividadClase;
  inicio: string;
  sensacion: SensacionClase | null;
  nota: string | null;
}

export interface ResumenClasesAlumno {
  usadas_semana: number;
  limite_semanal: number | null;
  racha_semanas: number;
  asistencias: AsistenciaClaseItem[];
}

export interface SemanaAsistencias {
  semanaInicioClave: string;
  etiquetaSemana: string;
  items: AsistenciaClaseItem[];
}

export interface ResumenSensacionesClase {
  total: number;
  conteo: Record<SensacionClase, number>;
}

const fmtFechaAsistencia = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA_GIMNASIO,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/** Formatea una clase asistida en hora argentina: ej. "Vie 20/11 · 18:00 hs". */
export function formatearFechaClaseAsistencia(inicioIso: string): string {
  const ms = Date.parse(inicioIso);
  if (Number.isNaN(ms)) return "";
  const crudo = fmtFechaAsistencia.format(new Date(ms)).replace(/\./g, "").replace(",", "");
  const dia = crudo.charAt(0).toUpperCase() + crudo.slice(1);
  return `${dia} · ${horaLocal(inicioIso)} hs`;
}

/**
 * Construye la lista local de asistencias (`ANOTADO` en clase `PROGRAMADA` ya iniciada)
 * ordenada de la más reciente a la más antigua, superponiendo feedbacks locales.
 */
export function derivarAsistenciasLocal(
  reservas: Reserva[],
  clases: Clase[],
  feedbacksPorReserva: Record<string, SensacionClase | undefined> = {},
  ahora: Date = new Date(),
): AsistenciaClaseItem[] {
  if (!reservas?.length || !clases?.length) return [];
  const clasesPorId = new Map<string, Clase>();
  for (const c of clases) {
    if (c.estado === "PROGRAMADA") clasesPorId.set(c.id, c);
  }
  const ahoraMs = ahora.getTime();
  const items: AsistenciaClaseItem[] = [];
  for (const r of reservas) {
    if (r.estado !== "ANOTADO") continue;
    const clase = clasesPorId.get(r.clase_id);
    if (!clase) continue;
    const inicioMs = Date.parse(clase.inicio);
    if (Number.isNaN(inicioMs) || inicioMs > ahoraMs) continue;
    items.push({
      reserva_id: r.id,
      clase_id: clase.id,
      actividad: clase.actividad,
      inicio: clase.inicio,
      sensacion: feedbacksPorReserva[r.id] ?? null,
      nota: clase.nota?.trim() ? clase.nota.trim() : null,
    });
  }
  return items.sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio));
}

/**
 * Devuelve la asistencia más reciente elegible para "¿Cómo te fue?":
 * clase iniciada hace ≤ 48 h y sin feedback registrado.
 */
export function obtenerClasePendienteFeedback(
  asistencias: AsistenciaClaseItem[],
  ahora: Date = new Date(),
): AsistenciaClaseItem | null {
  if (!asistencias?.length) return null;
  const ahoraMs = ahora.getTime();
  const ventanaMs = VENTANA_FEEDBACK_HORAS * 3_600_000;

  let mejor: { item: AsistenciaClaseItem; inicioMs: number } | null = null;
  for (const item of asistencias) {
    if (item.sensacion !== null) continue;
    const inicioMs = Date.parse(item.inicio);
    if (Number.isNaN(inicioMs)) continue;
    if (inicioMs > ahoraMs) continue;
    if (ahoraMs - inicioMs > ventanaMs) continue;
    if (!mejor || inicioMs > mejor.inicioMs) {
      mejor = { item, inicioMs };
    }
  }
  return mejor?.item ?? null;
}

/**
 * Agrupa asistencias por semana calendario (lunes–domingo ART, más reciente primero).
 */
export function agruparAsistenciasPorSemana(
  asistencias: AsistenciaClaseItem[],
  ahora: Date = new Date(),
): SemanaAsistencias[] {
  if (!asistencias?.length) return [];
  const ordenadas = [...asistencias].sort(
    (a, b) => Date.parse(b.inicio) - Date.parse(a.inicio),
  );
  const semanaActualInicio = semanaEnCurso(ahora).inicio;
  const semanaActualClave = claveDia(semanaActualInicio);
  const semanaPasadaClave = claveDia(
    semanaEnCurso(new Date(semanaActualInicio.getTime() - 3 * 86_400_000)).inicio,
  );

  const grupos = new Map<string, AsistenciaClaseItem[]>();
  for (const item of ordenadas) {
    const ms = Date.parse(item.inicio);
    if (Number.isNaN(ms)) continue;
    const inicioSem = semanaEnCurso(new Date(ms)).inicio;
    const semClave = claveDia(inicioSem);
    const lista = grupos.get(semClave);
    if (lista) lista.push(item);
    else grupos.set(semClave, [item]);
  }

  return Array.from(grupos.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([semClave, items]) => {
      let etiquetaSemana: string;
      if (semClave === semanaActualClave) {
        etiquetaSemana = "Esta semana";
      } else if (semClave === semanaPasadaClave) {
        etiquetaSemana = "Semana pasada";
      } else {
        const [, mm = "", dd = ""] = semClave.split("-");
        etiquetaSemana = `Semana del ${dd}/${mm}`;
      }
      return { semanaInicioClave: semClave, etiquetaSemana, items };
    });
}

/**
 * Resume las sensaciones de los alumnos presentes (`estado === 'ANOTADO'`) en una clase.
 */
export function resumirSensacionesClase(
  reservas: Pick<Reserva, "id" | "estado">[],
  feedbacksPorReserva: Record<string, SensacionClase | undefined>,
): ResumenSensacionesClase {
  const conteo: Record<SensacionClase, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let total = 0;
  for (const r of reservas) {
    if (r.estado !== "ANOTADO") continue;
    const s = feedbacksPorReserva[r.id];
    if (s === 1 || s === 2 || s === 3 || s === 4) {
      conteo[s] += 1;
      total += 1;
    }
  }
  return { total, conteo };
}

/**
 * Obtiene el resumen de clases del alumno autenticado (`resumen_clases_alumno`).
 * @param pDesde Fecha local mínima (`YYYY-MM-DD`, hora argentina) para filtrar `asistencias`.
 */
export async function obtenerResumenClasesAlumno(
  pDesde?: string | null,
  client: SupabaseClient<Database> = supabase,
): Promise<ResumenClasesAlumno> {
  const { data, error } = await client.rpc("resumen_clases_alumno", {
    p_desde: pDesde ?? null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    usadas_semana: row?.usadas_semana ?? 0,
    limite_semanal: row?.limite_semanal ?? null,
    racha_semanas: row?.racha_semanas ?? 0,
    asistencias: Array.isArray(row?.asistencias)
      ? (row.asistencias as unknown as AsistenciaClaseItem[])
      : [],
  };
}

/**
 * Registra o actualiza el feedback post-clase (1..4) del alumno para una reserva.
 * Idempotente sobre `reserva_id` (no duplica en reenvíos dentro de la ventana de 48 h).
 */
export async function guardarFeedbackClase(
  params: { reservaId: string; sensacion: SensacionClase },
  client: SupabaseClient<Database> = supabase,
): Promise<FeedbackClase> {
  const { data, error } = await client
    .from("feedback_clase")
    .upsert(
      { reserva_id: params.reservaId, sensacion: params.sensacion },
      { onConflict: "reserva_id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Actualiza (o limpia con `null`/vacío) la nota opcional del coach en una clase (máx. 280 caracteres).
 */
export async function actualizarNotaClase(
  params: { claseId: string; nota: string | null },
  client: SupabaseClient<Database> = supabase,
): Promise<Clase> {
  const notaLimpia = params.nota?.trim() ? params.nota.trim() : null;
  if (notaLimpia && notaLimpia.length > MAX_LARGO_NOTA_CLASE) {
    throw new Error(`La nota no puede superar los ${MAX_LARGO_NOTA_CLASE} caracteres`);
  }
  const { data, error } = await client
    .from("clases")
    .update({ nota: notaLimpia })
    .eq("id", params.claseId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Lee los feedbacks asociados a un conjunto de reservas (para vista de detalle en Coach Studio).
 */
export async function obtenerFeedbackDeReservas(
  reservaIds: string[],
  client: SupabaseClient<Database> = supabase,
): Promise<FeedbackClase[]> {
  if (reservaIds.length === 0) return [];
  const { data, error } = await client
    .from("feedback_clase")
    .select("*")
    .in("reserva_id", reservaIds);
  if (error) throw error;
  return data ?? [];
}
