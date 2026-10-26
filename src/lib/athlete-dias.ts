import { semanaEnCurso } from "@/lib/clases";

export const ZONA_BUENOS_AIRES = "America/Argentina/Buenos_Aires";

export interface DiaRutinaItem {
  id: string;
  nombre: string;
  orden: number;
  plan_id?: string;
  ejerciciosCount?: number;
  duracionMinutos?: number;
}

export type EstadoDiaRutina = "DONE" | "TODAY" | "PENDING_SKIPPED" | "PENDING";

export interface DiaConEstado extends DiaRutinaItem {
  estado: EstadoDiaRutina;
  subtitulo: string;
  esSiguiente: boolean;
  esUltimoRealizado?: boolean;
  ejerciciosCount: number;
  duracionMinutos: number;
}

export interface RegistroSesionSimple {
  id?: string;
  dia_id: string;
  fecha?: string;
}

export interface UltimoEntrenamientoInfo {
  diaId: string;
  diaOrden: number;
  diaNombre: string;
  etiquetaDia: string;
  fecha: string;
  tiempoRelativo: string;
  textoCompleto: string;
}

/**
 * Normaliza y formatea la etiqueta del día (ej. "Día 1 · Torso").
 * Evita redundancias si el nombre ya incluye "Día N".
 */
export function formatearEtiquetaDia(orden: number, nombre?: string): string {
  if (!nombre) return `Día ${orden}`;
  const lower = nombre.toLowerCase().trim();
  if (lower.startsWith(`día ${orden}`) || lower.startsWith(`dia ${orden}`)) {
    return nombre;
  }
  return `Día ${orden} · ${nombre}`;
}

function partesFechaBuenosAires(fecha: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_BUENOS_AIRES,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(fecha);
  let year = fecha.getFullYear();
  let month = fecha.getMonth() + 1;
  let day = fecha.getDate();
  for (const part of parts) {
    if (part.type === "year") year = parseInt(part.value, 10);
    if (part.type === "month") month = parseInt(part.value, 10);
    if (part.type === "day") day = parseInt(part.value, 10);
  }
  return { year, month, day };
}

/**
 * Formatea el tiempo transcurrido desde una fecha respecto a una referencia dada.
 * - Mismo día calendario en Buenos Aires: "Hoy"
 * - Día calendario anterior: "Ayer"
 * - N días atrás: "Hace N días"
 */
export function formatearTiempoTranscurrido(
  fechaStr?: string | Date | null,
  fechaReferencia: Date = new Date(),
  formato: "auto" | "dias" = "auto",
): string {
  if (!fechaStr) return "";
  const f = typeof fechaStr === "string" ? new Date(fechaStr) : fechaStr;
  if (isNaN(f.getTime())) return "";

  const ref = new Date(fechaReferencia);
  const refBA = partesFechaBuenosAires(ref);
  const fBA = partesFechaBuenosAires(f);
  const refDate = Date.UTC(refBA.year, refBA.month - 1, refBA.day);
  const fDate = Date.UTC(fBA.year, fBA.month - 1, fBA.day);
  const diffDias = Math.floor((refDate - fDate) / (1000 * 60 * 60 * 24));

  if (diffDias <= 0) return "Hoy";
  if (diffDias === 1) return formato === "dias" ? "Hace 1 día" : "Ayer";
  return `Hace ${diffDias} días`;
}

/**
 * Comprueba si una fecha en formato ISO o string pertenece a la semana en curso (semana ISO, hora local AR).
 */
export function esFechaEnSemanaActual(
  fechaStr?: string | Date | null,
  fechaReferencia: Date = new Date(),
): boolean {
  if (!fechaStr) return true; // Si no hay fecha explícita, se asume sesión de la semana activa
  const f = typeof fechaStr === "string" ? new Date(fechaStr) : fechaStr;
  if (isNaN(f.getTime())) return true;
  const { inicio, fin } = semanaEnCurso(fechaReferencia);
  return f.getTime() >= inicio.getTime() && f.getTime() <= fin.getTime();
}

/**
 * Función pura: determina el día natural que "Te toca hoy".
 * Es el primer día en orden ascendente que no registra ninguna sesión esta semana.
 */
export function calcularTeTocaHoy(
  dias: DiaRutinaItem[],
  diaIdsHechosEstaSemana: Set<string> | string[],
): DiaRutinaItem | null {
  const hechosSet = diaIdsHechosEstaSemana instanceof Set
    ? diaIdsHechosEstaSemana
    : new Set(diaIdsHechosEstaSemana);

  const ordenados = [...dias].sort((a, b) => a.orden - b.orden);
  return ordenados.find((d) => !hechosSet.has(d.id)) ?? null;
}

/**
 * Función pura: determina el último entrenamiento completado por el atleta.
 * Busca entre todas las sesiones completadas la de fecha más reciente (o última registrada),
 * y obtiene los datos del día correspondiente.
 */
export function calcularUltimoEntrenamiento(
  dias: DiaRutinaItem[],
  sesiones: RegistroSesionSimple[],
  fechaReferencia: Date = new Date(),
): UltimoEntrenamientoInfo | null {
  if (!sesiones || sesiones.length === 0) return null;

  // Filtrar sesiones con dia_id
  const conDia = sesiones.filter((s) => Boolean(s.dia_id));
  if (conDia.length === 0) return null;

  // Ordenar por fecha descendente. Si no hay fecha o son iguales, conservar orden de inserción (último al final)
  const ordenadas = [...conDia].sort((a, b) => {
    const tA = a.fecha ? new Date(a.fecha).getTime() : 0;
    const tB = b.fecha ? new Date(b.fecha).getTime() : 0;
    if (isNaN(tA) || isNaN(tB) || tA === tB) return 0;
    return tB - tA;
  });

  const ultimaSesion = ordenadas[0];
  if (!ultimaSesion) return null;

  const diaEncontrado = dias.find((d) => d.id === ultimaSesion.dia_id);

  const diaOrden = diaEncontrado?.orden ?? 1;
  const diaNombre = diaEncontrado?.nombre ?? "Entrenamiento";
  const etiquetaDia = formatearEtiquetaDia(diaOrden, diaNombre);
  const fecha = ultimaSesion.fecha || "";
  const tiempoRelativo = formatearTiempoTranscurrido(fecha, fechaReferencia);
  const textoCompleto = tiempoRelativo
    ? `Último entrenamiento: ${etiquetaDia} (${tiempoRelativo})`
    : `Último entrenamiento: ${etiquetaDia}`;

  return {
    diaId: ultimaSesion.dia_id,
    diaOrden,
    diaNombre,
    etiquetaDia,
    fecha,
    tiempoRelativo,
    textoCompleto,
  };
}

export interface CalcularEstadosDiasParams {
  dias: DiaRutinaItem[];
  sesionesSemana: RegistroSesionSimple[];
  diaElegidoHoyId?: string | null;
  fechaReferencia?: Date;
  sesionesHistoricas?: RegistroSesionSimple[];
}

export interface CalcularEstadosDiasResult {
  diasConEstado: DiaConEstado[];
  diaTeTocaHoy: DiaRutinaItem | null;
  diaActivoHoy: DiaRutinaItem | null;
  cambioDeDia: boolean;
  diasHechosCount: number;
  totalDias: number;
  ultimoEntrenamiento: UltimoEntrenamientoInfo | null;
}

/**
 * Calcula los estados de cada día de la rutina para la semana actual:
 * - DONE: día hecho esta semana.
 * - TODAY: día que se entrena hoy (el natural "Te toca hoy", o el elegido manualmente si hubo cambio).
 * - PENDING_SKIPPED: el día natural que tocaba y fue salteado temporalmente ("Pendiente · te toca el próximo").
 * - PENDING: pendiente normal.
 */
export function calcularEstadosDias({
  dias,
  sesionesSemana,
  diaElegidoHoyId,
  fechaReferencia = new Date(),
  sesionesHistoricas,
}: CalcularEstadosDiasParams): CalcularEstadosDiasResult {
  if (!dias || dias.length === 0) {
    return {
      diasConEstado: [],
      diaTeTocaHoy: null,
      diaActivoHoy: null,
      cambioDeDia: false,
      diasHechosCount: 0,
      totalDias: 0,
      ultimoEntrenamiento: null,
    };
  }

  // Filtrar sesiones válidas de esta semana
  const sesionesValidas = sesionesSemana.filter((s) =>
    esFechaEnSemanaActual(s.fecha, fechaReferencia)
  );

  const hechosSet = new Set<string>(sesionesValidas.map((s) => s.dia_id));
  const ordenados = [...dias].sort((a, b) => a.orden - b.orden);

  // Calcular el último entrenamiento completado histórico (o de las sesiones provistas)
  const todasLasSesiones = sesionesHistoricas ?? sesionesSemana;
  const ultimoEntrenamiento = calcularUltimoEntrenamiento(
    ordenados,
    todasLasSesiones,
    fechaReferencia,
  );

  // Día que naturalmente le toca (primer día sin sesión)
  const diaTeTocaHoy = calcularTeTocaHoy(ordenados, hechosSet);

  // Determinar si hay un cambio manual válido (el día elegido existe y no está hecho)
  const diaElegido = diaElegidoHoyId
    ? ordenados.find((d) => d.id === diaElegidoHoyId)
    : null;

  const cambioValido = Boolean(
    diaElegido &&
    !hechosSet.has(diaElegido.id) &&
    diaTeTocaHoy &&
    diaElegido.id !== diaTeTocaHoy.id,
  );

  const diaActivoHoy = cambioValido ? (diaElegido ?? null) : diaTeTocaHoy;

  const diasConEstado: DiaConEstado[] = ordenados.map((dia) => {
    const isDone = hechosSet.has(dia.id);
    const ejerciciosCount = dia.ejerciciosCount ?? 6;
    const duracionMinutos = dia.duracionMinutos ?? (ejerciciosCount * 9 + 5);
    const esUltimoRealizado = Boolean(
      ultimoEntrenamiento && ultimoEntrenamiento.diaId === dia.id,
    );

    if (isDone) {
      return {
        ...dia,
        ejerciciosCount,
        duracionMinutos,
        estado: "DONE" as const,
        subtitulo: `Hecho esta semana · ${ejerciciosCount} ejercicios`,
        esSiguiente: false,
        esUltimoRealizado,
      };
    }

    if (diaActivoHoy && dia.id === diaActivoHoy.id) {
      const subtitulo = cambioValido ? "Hoy" : "Te toca hoy";
      return {
        ...dia,
        ejerciciosCount,
        duracionMinutos,
        estado: "TODAY" as const,
        subtitulo,
        esSiguiente: true,
        esUltimoRealizado,
      };
    }

    // Si hubo cambio manual, el día que originalmente le tocaba queda marcado como salteado
    if (cambioValido && diaTeTocaHoy && dia.id === diaTeTocaHoy.id) {
      return {
        ...dia,
        ejerciciosCount,
        duracionMinutos,
        estado: "PENDING_SKIPPED" as const,
        subtitulo: "Pendiente · te toca el próximo",
        esSiguiente: false,
        esUltimoRealizado,
      };
    }

    return {
      ...dia,
      ejerciciosCount,
      duracionMinutos,
      estado: "PENDING" as const,
      subtitulo: `${ejerciciosCount} ejercicios · ~${duracionMinutos} min`,
      esSiguiente: false,
      esUltimoRealizado,
    };
  });

  const diasHechosCount = diasConEstado.filter((d) => d.estado === "DONE").length;

  return {
    diasConEstado,
    diaTeTocaHoy,
    diaActivoHoy,
    cambioDeDia: cambioValido,
    diasHechosCount,
    totalDias: ordenados.length,
    ultimoEntrenamiento,
  };
}
