// "¡Nuevo récord!" por ejercicio (GOZS-161, spec docs/specs/historial-progreso.md §0 y §3).
// Récord por ejercicio canónico (ejercicio_id), sin ranking contra otros (ADR-003).
// Reutiliza la fórmula de Epley que ya existe en strength-metrics; no se duplica.

import { calculateEpley1RM } from "@/lib/strength-metrics";
import { esSerieValida, formatearCarga, type SerieHistorica } from "@/lib/historial-ejercicio";

// §3.4.2: una serie que supere en < 80% del máximo histórico no festeja.
export const UMBRAL_PESO_RECORD = 0.8;

// §3.3: un par (peso, reps) de la frontera de Pareto.
export interface ParFrontera {
  peso_kg: number;
  reps_hechas: number;
  fecha: string;
}

// §3.3: resumen de marcas históricas de un ejercicio, apto para decidir récords offline.
export interface MarcasEjercicio {
  ejercicio_id: string;
  // Frontera de Pareto de (peso, reps): series que ninguna otra supera en peso Y reps a la vez.
  frontera: ParFrontera[];
  max_peso_kg: number; // 0 si es a peso corporal
  max_epley_kg: number; // calculateEpley1RM() sobre series con reps <= 12
}

// Serie recién completada, candidata a récord.
export interface SerieCandidata {
  peso_kg: number;
  reps_hechas: number;
  set_type?: string | null;
  atipica?: boolean;
}

export type TipoRecord = "peso" | "reps";

export interface ResultadoRecord {
  esRecord: boolean;
  tipo: TipoRecord | null;
  // §3.4.4: 1RM estimado solo si supera el máximo y reps <= 12 (se muestra solo en TECNICA).
  epley_kg: number | null;
  delta_epley_kg: number | null;
}

const SIN_RECORD: ResultadoRecord = { esRecord: false, tipo: null, epley_kg: null, delta_epley_kg: null };

const RECORD_EPLEY_MAX_REPS = 12;

// §3.3: frontera de Pareto de (peso, reps) maximizando ambos. Un par queda si ninguno lo domina
// (otro con peso >= y reps >= y al menos uno estricto). Duplicados exactos colapsan a uno.
export function fronteraPareto(puntos: ParFrontera[]): ParFrontera[] {
  const frontera: ParFrontera[] = [];
  for (const p of puntos) {
    const dominado = puntos.some(
      (q) =>
        q !== p &&
        q.peso_kg >= p.peso_kg &&
        q.reps_hechas >= p.reps_hechas &&
        (q.peso_kg > p.peso_kg || q.reps_hechas > p.reps_hechas),
    );
    if (dominado) continue;
    if (frontera.some((f) => f.peso_kg === p.peso_kg && f.reps_hechas === p.reps_hechas)) continue;
    frontera.push(p);
  }
  return frontera;
}

// Construye las marcas de un ejercicio a partir de su historial de series.
// null = sin historial válido (primera vez con el ejercicio, §3.4.1).
export function marcasDeEjercicio(series: SerieHistorica[], ejercicioId: string): MarcasEjercicio | null {
  const puntos = series
    .filter((s) => s.ejercicio_id === ejercicioId && esSerieValida(s))
    .map((s) => ({ peso_kg: s.peso_kg, reps_hechas: s.reps_hechas, fecha: s.fecha }));
  if (puntos.length === 0) return null;

  const max_peso_kg = puntos.reduce((m, p) => Math.max(m, p.peso_kg), 0);
  const max_epley_kg = puntos.reduce(
    (m, p) => (p.reps_hechas <= RECORD_EPLEY_MAX_REPS ? Math.max(m, calculateEpley1RM(p.peso_kg, p.reps_hechas)) : m),
    0,
  );
  return { ejercicio_id: ejercicioId, frontera: fronteraPareto(puntos), max_peso_kg, max_epley_kg };
}

// §3.3: suma una serie recién completada a las marcas en memoria, para que la serie siguiente
// no festeje un récord que la anterior ya superó. No muta la entrada.
// Las series de calentamiento (W o WARMUP) quedan excluidas de las marcas de récord.
export function agregarSerieAMarcas(
  marcas: MarcasEjercicio | null,
  ejercicioId: string,
  serie: SerieCandidata & { fecha: string },
): MarcasEjercicio {
  const tipo = (serie.set_type ?? "NORMAL").toUpperCase();
  if (serie.atipica || tipo === "WARMUP" || tipo === "W" || serie.reps_hechas < 1) {
    return (
      marcas ?? {
        ejercicio_id: ejercicioId,
        frontera: [],
        max_peso_kg: 0,
        max_epley_kg: 0,
      }
    );
  }
  const nuevo: ParFrontera = { peso_kg: serie.peso_kg, reps_hechas: serie.reps_hechas, fecha: serie.fecha };
  const base: MarcasEjercicio = marcas ?? {
    ejercicio_id: ejercicioId,
    frontera: [],
    max_peso_kg: 0,
    max_epley_kg: 0,
  };
  const epley = serie.reps_hechas <= RECORD_EPLEY_MAX_REPS ? calculateEpley1RM(serie.peso_kg, serie.reps_hechas) : 0;
  return {
    ejercicio_id: base.ejercicio_id,
    frontera: fronteraPareto([...base.frontera, nuevo]),
    max_peso_kg: Math.max(base.max_peso_kg, serie.peso_kg),
    max_epley_kg: Math.max(base.max_epley_kg, epley),
  };
}

// §3.4: decide si una serie recién registrada es un nuevo récord y de qué tipo.
// `historial` son las marcas del ejercicio (null = sin historial → nunca es récord).
export function esNuevoRecord(serie: SerieCandidata, historial: MarcasEjercicio | null): ResultadoRecord {
  // Regla 1: sin historial no se festeja la primera serie de la vida.
  if (!historial) return SIN_RECORD;

  const peso = serie.peso_kg;
  const reps = serie.reps_hechas;

  // §0.1: calentamiento, serie atípica o sin reps no es una marca.
  const tipo = (serie.set_type ?? "NORMAL").toUpperCase();
  if (serie.atipica || tipo === "WARMUP" || tipo === "W" || reps < 1) return SIN_RECORD;

  const esPesoCorporal = peso === 0;

  // Regla 2a: récord solo si nadie la iguala ni la supera en peso Y reps a la vez.
  const igualadaOSuperada = historial.frontera.some((f) => f.peso_kg >= peso && f.reps_hechas >= reps);
  if (igualadaOSuperada) return SIN_RECORD;

  // Regla 2b: piso del 80% del máximo histórico (no aplica a peso corporal).
  if (!esPesoCorporal && peso < UMBRAL_PESO_RECORD * historial.max_peso_kg) return SIN_RECORD;

  // Regla 3: récord de peso si supera el máximo; si no, de reps. Peso corporal siempre es de reps.
  const tipoRecord: TipoRecord = !esPesoCorporal && peso > historial.max_peso_kg ? "peso" : "reps";

  // Regla 4: 1RM estimado solo si supera el máximo y reps <= 12.
  let epley_kg: number | null = null;
  let delta_epley_kg: number | null = null;
  if (reps <= RECORD_EPLEY_MAX_REPS) {
    const epley = calculateEpley1RM(peso, reps);
    if (epley > historial.max_epley_kg) {
      epley_kg = epley;
      delta_epley_kg = epley - historial.max_epley_kg;
    }
  }

  return { esRecord: true, tipo: tipoRecord, epley_kg, delta_epley_kg };
}

export function esRecord(serie: SerieCandidata, historial: MarcasEjercicio | null): boolean {
  return esNuevoRecord(serie, historial).esRecord;
}

const kg = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

// §3.5: detalle del aviso. Récord de reps con peso > 0 resalta las reps; el resto usa "tu mejor marca".
export function detalleRecord(resultado: ResultadoRecord, serie: SerieCandidata, nombreEjercicio: string): string {
  const carga = formatearCarga({ peso_kg: serie.peso_kg, reps_hechas: serie.reps_hechas });
  if (resultado.tipo === "reps" && serie.peso_kg > 0) {
    return `${carga} · nunca hiciste tantas reps con este peso`;
  }
  return `${carga} · tu mejor marca en ${nombreEjercicio}`;
}

// §3.5: línea extra "1RM estimado: 99 kg (+3 kg)". null si no hay 1RM que mostrar.
// Solo se renderiza en vista TECNICA (ADR-004); en SIMPLE nunca se menciona 1RM.
export function lineaEpleyRecord(resultado: ResultadoRecord): string | null {
  if (resultado.epley_kg == null || resultado.delta_epley_kg == null) return null;
  return `1RM estimado: ${kg.format(Math.round(resultado.epley_kg))} kg (+${kg.format(Math.round(resultado.delta_epley_kg))} kg)`;
}
