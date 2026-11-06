import {
  calculateBrzycki1RM,
  calculateEpley1RM,
} from "./strength-metrics";

/**
 * Estimación matemática de 1RM según fórmula de Epley o Brzycki.
 * - Epley (default): 1RM = Peso * (1 + Reps / 30)
 * - Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)
 *
 * Devuelve 0 si los parámetros son inválidos, negativos o no finitos.
 */
export function estimar1RM(
  pesoKg: number,
  reps: number,
  formula: "epley" | "brzycki" = "epley"
): number {
  if (
    !Number.isFinite(pesoKg) ||
    !Number.isFinite(reps) ||
    pesoKg <= 0 ||
    reps <= 0
  ) {
    return 0;
  }

  if (formula === "brzycki") {
    return calculateBrzycki1RM(pesoKg, reps);
  }

  return calculateEpley1RM(pesoKg, reps);
}

export type TendenciaCarga = "sube" | "baja" | "mantiene";

export interface TopSetInfo {
  fecha: string;
  peso_kg: number;
  reps_hechas: number;
  estimated1RM: number;
}

export interface ProgresionEjercicio {
  nombre: string;
  ejercicioNombre: string;
  ejercicioId?: string;
  inicioKg: number;
  inicioReps: number;
  inicio1RM: number;
  actualKg: number;
  actualReps: number;
  actual1RM: number;
  gananciaKg: number;
  cambioPct: number;
  tendencia: TendenciaCarga;
  enProgresion: boolean;
  topSetInicial?: TopSetInfo;
  topSetFinal?: TopSetInfo;
}

export interface EjercicioExcluido {
  ejercicioNombre: string;
  motivo: "una_sola_semana" | "datos_insuficientes" | "sin_series_efectivas";
  detalle?: string;
}

export interface ResultadoProgresion {
  enProgresion: number;
  total: number;
  porcentajeEnProgresion: number;
  verificada: boolean;
  tendencias: Record<string, TendenciaCarga>;
  ejercicios: ProgresionEjercicio[];
  ejerciciosExcluidos: EjercicioExcluido[];
}

export interface OpcionesProgresion {
  formula?: "epley" | "brzycki";
  metrica?: "1rm" | "peso";
  fechaReferencia?: string | Date;
  umbralCambioPct?: number; // Por defecto 2.5%
}

interface SerieInterna {
  fecha: string;
  timestamp: number;
  ejercicioId: string;
  ejercicioNombre: string;
  peso_kg: number;
  reps_hechas: number;
  estimated1RM: number;
}

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * Detecta si una serie está marcada como calentamiento / warmup.
 */
export function esSerieCalentamiento(s: {
  tipo_serie?: string | null;
  set_type?: string | null;
  tipo?: string | null;
  es_calentamiento?: boolean;
}): boolean {
  if (s.es_calentamiento === true) return true;
  const raw = String(s.tipo_serie || s.set_type || s.tipo || "")
    .trim()
    .toUpperCase();
  return (
    raw === "WARMUP" ||
    raw === "W" ||
    raw === "CALENTAMIENTO" ||
    raw === "APROXIMACION" ||
    raw.includes("WARM") ||
    raw.includes("CALENT")
  );
}

/**
 * Verifica si una serie es efectiva (válida para cálculo de sobrecarga).
 */
export function esSerieEfectiva(s: {
  peso_kg?: number;
  peso?: number;
  reps_hechas?: number;
  reps?: number;
  completada?: boolean;
  atipica?: boolean;
  tipo_serie?: string | null;
  set_type?: string | null;
  tipo?: string | null;
  es_calentamiento?: boolean;
}): boolean {
  if (esSerieCalentamiento(s)) return false;
  if (s.atipica === true) return false;
  if (s.completada === false) return false;

  const peso = s.peso_kg ?? s.peso ?? 0;
  const reps = s.reps_hechas ?? s.reps ?? 0;

  if (!Number.isFinite(peso) || !Number.isFinite(reps)) return false;
  if (peso <= 0 || reps <= 0) return false;

  return true;
}

/**
 * Desempaqueta registros ya sea en formato HistoricalLoadEntry[] o lista plana de series.
 */
function extraerSeriesEfectivas(
  registros: any[],
  formula: "epley" | "brzycki"
): SerieInterna[] {
  const series: SerieInterna[] = [];
  if (!Array.isArray(registros)) return series;

  for (const item of registros) {
    if (!item) continue;

    if (Array.isArray(item.series)) {
      // HistoricalLoadEntry: { sesion: { fecha }, series: [...] }
      const fechaRaw =
        item.sesion?.fecha ||
        item.fecha ||
        item.created_at ||
        new Date().toISOString();
      const fecha =
        typeof fechaRaw === "string" ? fechaRaw : new Date(fechaRaw).toISOString();
      const timestamp = new Date(fecha).getTime();

      for (const s of item.series) {
        if (!s || !esSerieEfectiva(s)) continue;
        const peso = s.peso_kg ?? s.peso ?? 0;
        const reps = s.reps_hechas ?? s.reps ?? 1;
        const nombre =
          s.ejercicioNombre ||
          s.ejercicio_nombre ||
          s.nombre ||
          s.ejercicio_id ||
          "Ejercicio";
        const id = s.ejercicio_id || s.ejercicioId || nombre;

        series.push({
          fecha,
          timestamp,
          ejercicioId: String(id),
          ejercicioNombre: String(nombre),
          peso_kg: peso,
          reps_hechas: reps,
          estimated1RM: estimar1RM(peso, reps, formula),
        });
      }
    } else {
      // Serie plana
      if (!esSerieEfectiva(item)) continue;
      const fechaRaw =
        item.fecha ||
        item.created_at ||
        item.sesion?.fecha ||
        new Date().toISOString();
      const fecha =
        typeof fechaRaw === "string" ? fechaRaw : new Date(fechaRaw).toISOString();
      const timestamp = new Date(fecha).getTime();
      const peso = item.peso_kg ?? item.peso ?? 0;
      const reps = item.reps_hechas ?? item.reps ?? 1;
      const nombre =
        item.ejercicioNombre ||
        item.ejercicio_nombre ||
        item.nombre ||
        item.ejercicio_id ||
        "Ejercicio";
      const id = item.ejercicio_id || item.ejercicioId || nombre;

      series.push({
        fecha,
        timestamp,
        ejercicioId: String(id),
        ejercicioNombre: String(nombre),
        peso_kg: peso,
        reps_hechas: reps,
        estimated1RM: estimar1RM(peso, reps, formula),
      });
    }
  }

  return series;
}

function coincideClave(
  serieNombre: string,
  serieId: string,
  clave: string
): boolean {
  const normSerie = serieNombre.toLowerCase().trim();
  const normClave = clave.toLowerCase().trim();
  const normId = serieId.toLowerCase().trim();

  if (normId === normClave || normSerie === normClave) return true;
  if (normSerie.includes(normClave) || normClave.includes(normSerie)) return true;

  const primeraClave = normClave.split(/\s+/)[0]!;
  const primeraSerie = normSerie.split(/\s+/)[0]!;
  if (primeraClave.length > 3 && normSerie.includes(primeraClave)) return true;
  if (primeraSerie.length > 3 && normClave.includes(primeraSerie)) return true;

  return false;
}

function encontrarMejorTopSet(series: SerieInterna[]): SerieInterna | null {
  if (series.length === 0) return null;
  return series.reduce((mejor, actual) => {
    if (actual.estimated1RM > mejor.estimated1RM) return actual;
    if (
      actual.estimated1RM === mejor.estimated1RM &&
      actual.peso_kg > mejor.peso_kg
    ) {
      return actual;
    }
    return mejor;
  });
}

/**
 * Calcula la progresión de cargas derivada e identifica tendencias ('sube' / 'baja' / 'mantiene')
 * comparando el mejor top set de las primeras 2 semanas contra el de las últimas 2 semanas
 * dentro de una ventana de tiempo (por defecto 60 días).
 *
 * - Excluye series de calentamiento (WARMUP / CALENTAMIENTO).
 * - Excluye ejercicios con datos de una sola semana (<= 7 días de dispersión).
 * - Detecta tendencia 'sube' si la carga aumenta > 2.5%, y 'baja' si disminuye > 2.5%.
 */
export function calcularProgresion(
  registros: any[],
  ventanaDias: number = 60,
  claves?: string[],
  opciones?: OpcionesProgresion
): ResultadoProgresion {
  const formula = opciones?.formula ?? "epley";
  const metrica = opciones?.metrica ?? "1rm";
  const umbral = opciones?.umbralCambioPct ?? 2.5;

  const resultadoVacio: ResultadoProgresion = {
    enProgresion: 0,
    total: 0,
    porcentajeEnProgresion: 0,
    verificada: false,
    tendencias: {},
    ejercicios: [],
    ejerciciosExcluidos: [],
  };

  const todasSeries = extraerSeriesEfectivas(registros, formula);
  if (todasSeries.length === 0) {
    return resultadoVacio;
  }

  // Determinar límites de la ventana
  const maxTimestamp = opciones?.fechaReferencia
    ? new Date(opciones.fechaReferencia).getTime()
    : Math.max(...todasSeries.map((s) => s.timestamp));

  const ventanaMs = ventanaDias * MS_POR_DIA;
  const minVentanaTimestamp = maxTimestamp - ventanaMs;

  // Filtrar series dentro de la ventana de 60 días
  const seriesEnVentana = todasSeries.filter(
    (s) => s.timestamp >= minVentanaTimestamp && s.timestamp <= maxTimestamp
  );

  if (seriesEnVentana.length === 0) {
    return resultadoVacio;
  }

  // Agrupación por ejercicios (por clave o por nombre/id único)
  interface GrupoEjercicio {
    clave: string;
    nombre: string;
    series: SerieInterna[];
  }

  const grupos: GrupoEjercicio[] = [];

  if (Array.isArray(claves) && claves.length > 0) {
    for (const clave of claves) {
      const seriesGrupo = seriesEnVentana.filter((s) =>
        coincideClave(s.ejercicioNombre, s.ejercicioId, clave)
      );
      if (seriesGrupo.length > 0) {
        grupos.push({
          clave,
          nombre: clave,
          series: seriesGrupo,
        });
      }
    }
  } else {
    const mapa = new Map<string, SerieInterna[]>();
    for (const s of seriesEnVentana) {
      const key = s.ejercicioNombre;
      const list = mapa.get(key) ?? [];
      list.push(s);
      mapa.set(key, list);
    }
    for (const [nombre, seriesList] of mapa.entries()) {
      grupos.push({
        clave: nombre,
        nombre,
        series: seriesList,
      });
    }
  }

  const ejerciciosAnalizados: ProgresionEjercicio[] = [];
  const ejerciciosExcluidos: EjercicioExcluido[] = [];
  const tendencias: Record<string, TendenciaCarga> = {};

  const diasComparacion = Math.min(14, Math.floor(ventanaDias / 2));
  const periodoMs = diasComparacion * MS_POR_DIA;

  for (const grupo of grupos) {
    const timestamps = grupo.series.map((s) => s.timestamp);
    const minFechaEj = Math.min(...timestamps);
    const maxFechaEj = Math.max(...timestamps);
    const dispersionDias = (maxFechaEj - minFechaEj) / MS_POR_DIA;

    // Regla de aceptación: ejercicio con datos de una sola semana se excluye del total analizado
    if (dispersionDias <= 7) {
      ejerciciosExcluidos.push({
        ejercicioNombre: grupo.nombre,
        motivo: "una_sola_semana",
        detalle: `Datos cubren sólo ${Math.round(dispersionDias * 10) / 10} días (<= 7 días).`,
      });
      continue;
    }

    // Identificar series de las primeras 2 semanas y de las últimas 2 semanas
    // Primeras 2 semanas: desde minVentanaTimestamp o la primera serie del ejercicio
    const finPeriodoInicial = Math.max(minVentanaTimestamp, minFechaEj) + periodoMs;
    const inicioPeriodoFinal = Math.min(maxTimestamp, maxFechaEj) - periodoMs;

    const seriesIniciales = grupo.series.filter(
      (s) => s.timestamp <= finPeriodoInicial
    );
    const seriesFinales = grupo.series.filter(
      (s) => s.timestamp >= inicioPeriodoFinal
    );

    const topInicial = encontrarMejorTopSet(seriesIniciales);
    const topFinal = encontrarMejorTopSet(seriesFinales);

    if (!topInicial || !topFinal) {
      ejerciciosExcluidos.push({
        ejercicioNombre: grupo.nombre,
        motivo: "datos_insuficientes",
        detalle: "Faltan series efectivas en las primeras o últimas 2 semanas.",
      });
      continue;
    }

    const cargaInicial =
      metrica === "peso" ? topInicial.peso_kg : topInicial.estimated1RM;
    const cargaFinal =
      metrica === "peso" ? topFinal.peso_kg : topFinal.estimated1RM;

    const cambioPct =
      cargaInicial > 0
        ? ((cargaFinal - cargaInicial) / cargaInicial) * 100
        : 0;

    let tendencia: TendenciaCarga;
    if (cambioPct > umbral) {
      tendencia = "sube";
    } else if (cambioPct < -umbral) {
      tendencia = "baja";
    } else {
      tendencia = "mantiene";
    }

    const enProg = tendencia === "sube";
    tendencias[grupo.nombre] = tendencia;

    ejerciciosAnalizados.push({
      nombre: grupo.nombre,
      ejercicioNombre: grupo.nombre,
      ejercicioId: topFinal.ejercicioId,
      inicioKg: topInicial.peso_kg,
      inicioReps: topInicial.reps_hechas,
      inicio1RM: Math.round(topInicial.estimated1RM * 10) / 10,
      actualKg: topFinal.peso_kg,
      actualReps: topFinal.reps_hechas,
      actual1RM: Math.round(topFinal.estimated1RM * 10) / 10,
      gananciaKg: Math.round((topFinal.peso_kg - topInicial.peso_kg) * 10) / 10,
      cambioPct: Math.round(cambioPct * 100) / 100,
      tendencia,
      enProgresion: enProg,
      topSetInicial: {
        fecha: topInicial.fecha,
        peso_kg: topInicial.peso_kg,
        reps_hechas: topInicial.reps_hechas,
        estimated1RM: Math.round(topInicial.estimated1RM * 10) / 10,
      },
      topSetFinal: {
        fecha: topFinal.fecha,
        peso_kg: topFinal.peso_kg,
        reps_hechas: topFinal.reps_hechas,
        estimated1RM: Math.round(topFinal.estimated1RM * 10) / 10,
      },
    });
  }

  const total = ejerciciosAnalizados.length;
  const enProgresion = ejerciciosAnalizados.filter((e) => e.enProgresion).length;
  const porcentajeEnProgresion =
    total > 0 ? Math.round((enProgresion / total) * 100) : 0;
  const verificada = total > 0 && enProgresion >= Math.ceil(total / 2);

  return {
    enProgresion,
    total,
    porcentajeEnProgresion,
    verificada,
    tendencias,
    ejercicios: ejerciciosAnalizados,
    ejerciciosExcluidos,
  };
}
