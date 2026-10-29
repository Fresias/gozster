import type { RegistroSesion, RegistroSerie, MotivoCambioDia, DiaRutina } from "@/types/database.types";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import { calculateEpley1RM } from "@/lib/strength-metrics";

const ZONA_BUENOS_AIRES = "America/Argentina/Buenos_Aires";

const MESES_COMPLETOS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export interface SerieHistoricaDetalle {
  id: string;
  sesionId: string;
  ejercicioId: string;
  ejercicioNombre: string;
  numeroSerie: number;
  pesoKg: number;
  repsHechas: number;
  rpeReal?: number | null;
  completada: boolean;
  setType: string;
  estimated1RM: number;
  painReported?: boolean;
  painNotes?: string | null;
  atipica?: boolean;
}

export interface EjercicioEnSesionHistorial {
  ejercicioId: string;
  ejercicioNombre: string;
  series: SerieHistoricaDetalle[];
  maxPesoKg: number;
  totalReps: number;
  volumenKg: number;
}

export interface SesionHistoricaDetalle {
  id: string;
  alumnoId: string;
  diaId: string | null;
  diaNombre: string;
  fecha: string;
  fechaLegible: string;
  encabezado: string;
  duracionMinutos: number | null;
  volumenTotalKg: number;
  effectiveVolumeKg: number;
  motivoCambioDia?: MotivoCambioDia | null;
  diaSugeridoId?: string | null;
  ejercicios: EjercicioEnSesionHistorial[];
  totalEjercicios: number;
  totalSeries: number;
}

/**
 * Contrato estructurado para el futuro mini-dashboard analítico de progresión por ejercicio.
 */
export interface ProgresionPuntoEjercicio {
  fecha: string;
  fechaLegible: string;
  sesionId: string;
  diaNombre: string;
  maxPesoKg: number;
  maxReps: number;
  bestEstimated1RM: number;
  volumenEjercicioKg: number;
  seriesCount: number;
  series: Array<{
    id: string;
    numeroSerie: number;
    pesoKg: number;
    repsHechas: number;
    rpeReal?: number | null;
    setType: string;
    estimated1RM: number;
  }>;
}

export interface ResumenProgresionEjercicio {
  ejercicioId: string;
  ejercicioNombre: string;
  totalSesiones: number;
  recordPesoKg: number;
  record1RM: number;
  recordReps: number;
  volumenTotalHistoricoKg: number;
  primeraFecha: string;
  ultimaFecha: string;
  puntos: ProgresionPuntoEjercicio[]; // Orden cronológico (de más antigua a más reciente)
}

export interface ContratoMiniDashboardProgreso {
  alumnoId: string;
  totalSesiones: number;
  volumenTotalAcumuladoKg: number;
  ejercicios: Record<string, ResumenProgresionEjercicio>;
  listaEjercicios: Array<{
    ejercicioId: string;
    ejercicioNombre: string;
    totalSesiones: number;
    recordPesoKg: number;
    record1RM: number;
  }>;
}

/**
 * Formatea una fecha ISO a español: "26 de Octubre" o "26 de Octubre de 2026"
 */
export function formatearFechaSesion(fechaIso: string, incluirAnio = false): string {
  let str = fechaIso;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    str = `${str}T12:00:00Z`;
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return fechaIso;

  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_BUENOS_AIRES,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(d);

  const day = parts.find((p) => p.type === "day")?.value ?? String(d.getDate());
  const monthNum = Number(parts.find((p) => p.type === "month")?.value ?? d.getMonth() + 1);
  const year = parts.find((p) => p.type === "year")?.value ?? String(d.getFullYear());

  const mes = MESES_COMPLETOS[monthNum - 1] ?? "Mes";
  if (incluirAnio) {
    return `${day} de ${mes} de ${year}`;
  }
  return `${day} de ${mes}`;
}

/**
 * Obtiene el nombre legible de un día de rutina a partir de su ID o catálogo.
 */
export function obtenerNombreDiaRutina(diaId: string | null, dias?: DiaRutina[]): string {
  if (!diaId) return "Sesión General";
  if (dias && dias.length > 0) {
    const match = dias.find((d) => d.id === diaId);
    if (match) {
      return `Día ${match.orden}: ${match.nombre}`;
    }
  }

  // Fallbacks semánticos limpios basados en slugs conocidos
  if (diaId.includes("torso") || diaId.includes("superior")) return "Día 1: Torso";
  if (diaId.includes("pierna") || diaId.includes("inferior")) return "Día 2: Pierna";
  if (diaId.includes("fullbody")) return "Día 3: Full Body";

  return "Día de Rutina";
}

/**
 * Arma el encabezado estándar: "26 de Octubre — Día 1: Torso"
 */
export function formatearEncabezadoSesion(
  fechaIso: string,
  diaNombre: string,
): string {
  const fechaTexto = formatearFechaSesion(fechaIso, false);
  return `${fechaTexto} — ${diaNombre}`;
}

/**
 * Agrupa las series de una sesión por ejercicio para su renderizado en acordeón.
 */
export function agruparSeriesPorEjercicio(
  series: (RegistroSerie & { ejercicioNombre: string })[],
): EjercicioEnSesionHistorial[] {
  const grupos = new Map<string, (RegistroSerie & { ejercicioNombre: string })[]>();

  for (const s of series) {
    const clave = s.ejercicioNombre || s.ejercicio_id;
    const array = grupos.get(clave) || [];
    array.push(s);
    grupos.set(clave, array);
  }

  const resultado: EjercicioEnSesionHistorial[] = [];

  grupos.forEach((items, nombre) => {
    const itemsOrdenados = [...items].sort((a, b) => a.numero_serie - b.numero_serie);
    const primerItem = itemsOrdenados[0]!;

    const seriesDetalle: SerieHistoricaDetalle[] = itemsOrdenados.map((s) => {
      const peso = Number(s.peso_kg) || 0;
      const reps = Number(s.reps_hechas) || 0;
      return {
        id: s.id,
        sesionId: s.sesion_id,
        ejercicioId: s.ejercicio_id,
        ejercicioNombre: s.ejercicioNombre || nombre,
        numeroSerie: s.numero_serie,
        pesoKg: peso,
        repsHechas: reps,
        rpeReal: s.rpe_real ?? null,
        completada: s.completada ?? true,
        setType: s.set_type || "NORMAL",
        estimated1RM: calculateEpley1RM(peso, reps),
        painReported: s.pain_reported ?? false,
        painNotes: s.pain_notes ?? null,
      };
    });

    const maxPeso = Math.max(0, ...seriesDetalle.map((s) => s.pesoKg));
    const totalReps = seriesDetalle.reduce((acc, s) => acc + s.repsHechas, 0);
    const volumen = seriesDetalle.reduce((acc, s) => acc + s.pesoKg * s.repsHechas, 0);

    resultado.push({
      ejercicioId: primerItem.ejercicio_id,
      ejercicioNombre: nombre,
      series: seriesDetalle,
      maxPesoKg: maxPeso,
      totalReps,
      volumenKg: volumen,
    });
  });

  return resultado;
}

/**
 * Normaliza y enriquece entradas históricas (`HistoricalLoadEntry[]`) para la UI.
 */
export function normalizarSesionesDetalladas(
  entradas: HistoricalLoadEntry[],
  dias?: DiaRutina[],
): SesionHistoricaDetalle[] {
  return entradas
    .map((entry) => {
      const { sesion, series } = entry;
      const diaNombre = obtenerNombreDiaRutina(sesion.dia_id, dias);
      const fechaLegible = formatearFechaSesion(sesion.fecha, true);
      const encabezado = formatearEncabezadoSesion(sesion.fecha, diaNombre);
      const ejercicios = agruparSeriesPorEjercicio(series);

      const totalSeries = series.length;
      const totalEjercicios = ejercicios.length;

      const volumenCalculado = series.reduce((acc, s) => {
        if (s.completada === false) return acc;
        return acc + (Number(s.peso_kg) || 0) * (Number(s.reps_hechas) || 0);
      }, 0);

      const volumenTotalKg = sesion.volumen_total_kg || volumenCalculado;
      const effectiveVolumeKg = sesion.effective_volume_kg || volumenCalculado;

      return {
        id: sesion.id,
        alumnoId: sesion.alumno_id,
        diaId: sesion.dia_id,
        diaNombre,
        fecha: sesion.fecha,
        fechaLegible,
        encabezado,
        duracionMinutos: sesion.duracion_minutos || null,
        volumenTotalKg,
        effectiveVolumeKg,
        motivoCambioDia: sesion.motivo_cambio_dia,
        diaSugeridoId: sesion.dia_sugerido_id,
        ejercicios,
        totalEjercicios,
        totalSeries,
      };
    })
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
}

/**
 * Edición pura de una serie dentro de la lista de entradas históricas (Inmutabilidad total).
 */
export function editarSerieEnHistorial(
  entradas: HistoricalLoadEntry[],
  sesionId: string,
  serieId: string,
  nuevoPesoKg: number,
  nuevasReps: number,
  atipica?: boolean,
): HistoricalLoadEntry[] {
  return entradas.map((entry) => {
    if (entry.sesion.id !== sesionId) return entry;

    const seriesActualizadas = entry.series.map((s) => {
      if (s.id !== serieId) return s;
      return {
        ...s,
        peso_kg: Math.max(0, nuevoPesoKg),
        reps_hechas: Math.max(1, Math.round(nuevasReps)),
        ...(atipica !== undefined ? { atipica } : {}),
        updated_at: new Date().toISOString(),
      };
    });

    const nuevoVolumen = seriesActualizadas.reduce((acc, s) => {
      if (s.completada === false) return acc;
      return acc + (Number(s.peso_kg) || 0) * (Number(s.reps_hechas) || 0);
    }, 0);

    return {
      ...entry,
      sesion: {
        ...entry.sesion,
        volumen_total_kg: nuevoVolumen,
        updated_at: new Date().toISOString(),
      },
      series: seriesActualizadas,
    };
  });
}

/**
 * Genera el contrato analítico completo para el futuro mini-dashboard de progresión por ejercicio.
 */
export function generarContratoMiniDashboard(
  entradas: HistoricalLoadEntry[],
  alumnoId = "",
  dias?: DiaRutina[],
): ContratoMiniDashboardProgreso {
  // Ordenar de más antigua a más reciente para análisis de progresión
  const cronologicas = [...entradas].sort(
    (a, b) => new Date(a.sesion.fecha).getTime() - new Date(b.sesion.fecha).getTime(),
  );

  const ejerciciosMap: Record<string, ResumenProgresionEjercicio> = {};
  let volumenTotalAcumuladoKg = 0;

  for (const entry of cronologicas) {
    const { sesion, series } = entry;
    const diaNombre = obtenerNombreDiaRutina(sesion.dia_id, dias);
    const fechaLegible = formatearFechaSesion(sesion.fecha, false);

    // Agrupar series de esta sesión por ejercicio
    const grupos = agruparSeriesPorEjercicio(series);

    for (const ejGrupo of grupos) {
      const ejId = ejGrupo.ejercicioId;
      const ejNombre = ejGrupo.ejercicioNombre;

      const seriesPuntos = ejGrupo.series.map((s) => ({
        id: s.id,
        numeroSerie: s.numeroSerie,
        pesoKg: s.pesoKg,
        repsHechas: s.repsHechas,
        rpeReal: s.rpeReal,
        setType: s.setType,
        estimated1RM: s.estimated1RM,
        atipica: s.atipica,
      }));

      const validasAnalytics = seriesPuntos.filter((s) => !s.atipica);
      const maxPeso = Math.max(0, ...validasAnalytics.map((s) => s.pesoKg));
      const maxReps = Math.max(0, ...validasAnalytics.map((s) => s.repsHechas));
      const best1RM = Math.max(0, ...validasAnalytics.map((s) => s.estimated1RM));
      const volumenEj = seriesPuntos.reduce((acc, s) => acc + s.pesoKg * s.repsHechas, 0);

      volumenTotalAcumuladoKg += volumenEj;

      const punto: ProgresionPuntoEjercicio = {
        fecha: sesion.fecha,
        fechaLegible,
        sesionId: sesion.id,
        diaNombre,
        maxPesoKg: maxPeso,
        maxReps,
        bestEstimated1RM: best1RM,
        volumenEjercicioKg: volumenEj,
        seriesCount: seriesPuntos.length,
        series: seriesPuntos,
      };

      if (!ejerciciosMap[ejId]) {
        ejerciciosMap[ejId] = {
          ejercicioId: ejId,
          ejercicioNombre: ejNombre,
          totalSesiones: 1,
          recordPesoKg: maxPeso,
          record1RM: best1RM,
          recordReps: maxReps,
          volumenTotalHistoricoKg: volumenEj,
          primeraFecha: sesion.fecha,
          ultimaFecha: sesion.fecha,
          puntos: [punto],
        };
      } else {
        const resumen = ejerciciosMap[ejId];
        resumen.totalSesiones += 1;
        resumen.recordPesoKg = Math.max(resumen.recordPesoKg, maxPeso);
        resumen.record1RM = Math.max(resumen.record1RM, best1RM);
        resumen.recordReps = Math.max(resumen.recordReps, maxReps);
        resumen.volumenTotalHistoricoKg += volumenEj;
        resumen.ultimaFecha = sesion.fecha;
        resumen.puntos.push(punto);
      }
    }
  }

  const listaEjercicios = Object.values(ejerciciosMap)
    .map((e) => ({
      ejercicioId: e.ejercicioId,
      ejercicioNombre: e.ejercicioNombre,
      totalSesiones: e.totalSesiones,
      recordPesoKg: e.recordPesoKg,
      record1RM: e.record1RM,
    }))
    .sort((a, b) => b.totalSesiones - a.totalSesiones);

  return {
    alumnoId,
    totalSesiones: entradas.length,
    volumenTotalAcumuladoKg,
    ejercicios: ejerciciosMap,
    listaEjercicios,
  };
}
