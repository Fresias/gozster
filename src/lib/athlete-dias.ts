import { semanaEnCurso } from "@/lib/clases";

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
  ejerciciosCount: number;
  duracionMinutos: number;
}

export interface RegistroSesionSimple {
  id?: string;
  dia_id: string;
  fecha?: string;
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

export interface CalcularEstadosDiasParams {
  dias: DiaRutinaItem[];
  sesionesSemana: RegistroSesionSimple[];
  diaElegidoHoyId?: string | null;
  fechaReferencia?: Date;
}

export interface CalcularEstadosDiasResult {
  diasConEstado: DiaConEstado[];
  diaTeTocaHoy: DiaRutinaItem | null;
  diaActivoHoy: DiaRutinaItem | null;
  cambioDeDia: boolean;
  diasHechosCount: number;
  totalDias: number;
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
}: CalcularEstadosDiasParams): CalcularEstadosDiasResult {
  if (!dias || dias.length === 0) {
    return {
      diasConEstado: [],
      diaTeTocaHoy: null,
      diaActivoHoy: null,
      cambioDeDia: false,
      diasHechosCount: 0,
      totalDias: 0,
    };
  }

  // Filtrar sesiones válidas de esta semana
  const sesionesValidas = sesionesSemana.filter((s) =>
    esFechaEnSemanaActual(s.fecha, fechaReferencia)
  );

  const hechosSet = new Set<string>(sesionesValidas.map((s) => s.dia_id));
  const ordenados = [...dias].sort((a, b) => a.orden - b.orden);

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

    if (isDone) {
      return {
        ...dia,
        ejerciciosCount,
        duracionMinutos,
        estado: "DONE" as const,
        subtitulo: `Hecho esta semana · ${ejerciciosCount} ejercicios`,
        esSiguiente: false,
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
      };
    }

    return {
      ...dia,
      ejerciciosCount,
      duracionMinutos,
      estado: "PENDING" as const,
      subtitulo: `${ejerciciosCount} ejercicios · ~${duracionMinutos} min`,
      esSiguiente: false,
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
  };
}
