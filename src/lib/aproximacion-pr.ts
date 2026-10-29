// Cálculo de series de aproximación según último PR (GOZS-236 / GOZS-276).
// Especificación: docs/specs/calculo-series-aproximacion.md.
// Aplica Ponytail (cero dependencias externas) y Karpathy (diff quirúrgico y funciones puras).

import type { MarcasEjercicio } from "@/lib/record-ejercicio";
import type { WarmupSetProgression } from "@/lib/strength-metrics";

export type EstadoAproximacion = "sin_datos" | "estimada" | "normal";

export interface EvaluacionDatosAproximacion {
  estado: EstadoAproximacion;
  motivoEstimada?: "una_sesion" | "antiguedad_8_semanas";
  mensajeAviso?: string;
  pesoSugerido: number | null;
  ultimoPRKg: number | null;
  mejorE1RMKg: number | null;
}

export interface OpcionesAproximacion {
  pesoObjetivoKg?: number | null;
  rpeObjetivo?: number | null;
  repeticionesObjetivo?: string | null;
  esAislamiento?: boolean;
  pesoBarraKg?: number;
  fechaReferencia?: Date;
}

export const MENSAJE_SIN_DATOS =
  "Aún no tenemos datos de este ejercicio. Empieza con la barra vacía o una carga muy ligera, haz 2 o 3 series progresivas y registra tu primera serie de trabajo. Con ella te sugeriremos tus series de aproximación.";

export const MENSAJE_UNA_SESION =
  "Recomendación estimada: basada en 1 sola sesión previa con series efectivas.";

export const MENSAJE_ANTIGUEDAD_8_SEMANAS =
  "Recomendación estimada: tu último registro tiene más de 8 semanas de antigüedad. Te sugerimos confirmar el peso de trabajo.";

export const PESO_BARRA_DEFAULT = 20;

/**
 * Redondea un peso al múltiplo de 2.5 kg más cercano, con un mínimo opcional (default 20 kg).
 */
export function redondearA2_5(pesoKg: number, minimoKg: number = PESO_BARRA_DEFAULT): number {
  const redondeado = Math.round(pesoKg / 2.5) * 2.5;
  return Math.max(minimoKg, redondeado);
}

/**
 * Determina heurísticamente si el nombre del ejercicio corresponde a aislamiento.
 */
export function esEjercicioAislamiento(nombre: string | null | undefined): boolean {
  if (!nombre) return false;
  return /\b(curl|biceps|triceps|aperturas|vuelos|elevaciones|patada|gemelos|pantorrilla|extensiones|isquios|concentrado|martillo|frances|predicador|polea)\b/i.test(
    nombre
  );
}

/**
 * Determina si el texto de repeticiones objetivo indica trabajo ligero (> 12 reps).
 */
export function esRepsTrabajoLigero(repsTexto: string | null | undefined): boolean {
  if (!repsTexto) return false;
  const limpio = repsTexto.trim();
  const matches = limpio.match(/\d+/g);
  if (!matches || matches.length === 0) return false;
  return matches.some((numStr) => parseInt(numStr, 10) > 12);
}

/**
 * Calcula el e1RM según la fórmula de Epley: peso × (1 + reps / 30).
 * Válido para reps entre 2 y 10 según spec GOZS-236.
 */
export function calcularEpleyGOZS236(pesoKg: number, reps: number): number {
  if (pesoKg <= 0 || reps < 2 || reps > 10) return 0;
  return pesoKg * (1 + reps / 30);
}

/**
 * Evalúa los datos históricos de un alumno para un ejercicio y determina:
 * - Estado: "sin_datos" (0 sesiones), "estimada" (1 sesión o > 8 semanas), "normal" (>= 2 sesiones).
 * - W = peso de trabajo objetivo: Math.max(ultimo_pr, mejor_e1rm_2_a_10_reps).
 */
export function evaluarDatosAproximacion(
  marcas: MarcasEjercicio | null | undefined,
  opciones?: { fechaReferencia?: Date }
): EvaluacionDatosAproximacion {
  if (!marcas || !marcas.frontera || marcas.frontera.length === 0) {
    return {
      estado: "sin_datos",
      pesoSugerido: null,
      ultimoPRKg: null,
      mejorE1RMKg: null,
      mensajeAviso: MENSAJE_SIN_DATOS,
    };
  }

  // Filtrar series válidas de 2 a 10 reps con peso > 0
  const seriesEfectivas = marcas.frontera.filter(
    (p) => p.peso_kg > 0 && p.reps_hechas >= 2 && p.reps_hechas <= 10
  );

  const ultimoPRKg = marcas.max_peso_kg > 0 ? marcas.max_peso_kg : null;
  const e1rmValores = seriesEfectivas.map((p) => calcularEpleyGOZS236(p.peso_kg, p.reps_hechas));
  const mejorE1RMKg = e1rmValores.length > 0 ? Math.round(Math.max(...e1rmValores) * 10) / 10 : null;

  // Si no hay PR ni e1RM válido
  if (!ultimoPRKg && !mejorE1RMKg) {
    return {
      estado: "sin_datos",
      pesoSugerido: null,
      ultimoPRKg: null,
      mejorE1RMKg: null,
      mensajeAviso: MENSAJE_SIN_DATOS,
    };
  }

  // W = max(ultimo PR, mejor e1RM)
  const pesoBase = Math.max(ultimoPRKg ?? 0, mejorE1RMKg ?? 0);
  const pesoSugerido = redondearA2_5(pesoBase, PESO_BARRA_DEFAULT);

  // Conteo de fechas distintas de sesión
  const fechas = new Set(
    marcas.frontera
      .filter((p) => p.peso_kg > 0 && p.reps_hechas >= 1)
      .map((p) => p.fecha?.split("T")[0])
      .filter(Boolean)
  );

  if (fechas.size === 0) {
    return {
      estado: "sin_datos",
      pesoSugerido: null,
      ultimoPRKg,
      mejorE1RMKg,
      mensajeAviso: MENSAJE_SIN_DATOS,
    };
  }

  if (fechas.size === 1) {
    return {
      estado: "estimada",
      motivoEstimada: "una_sesion",
      mensajeAviso: MENSAJE_UNA_SESION,
      pesoSugerido,
      ultimoPRKg,
      mejorE1RMKg,
    };
  }

  // Verificar antigüedad de más de 8 semanas (> 56 días)
  const fechasArr = [...fechas].sort();
  const ultimaFecha = fechasArr[fechasArr.length - 1]!;
  const hoy = opciones?.fechaReferencia ?? new Date();
  const diasAntiguedad = Math.floor((hoy.getTime() - Date.parse(ultimaFecha)) / (1000 * 60 * 60 * 24));

  if (diasAntiguedad > 56) {
    return {
      estado: "estimada",
      motivoEstimada: "antiguedad_8_semanas",
      mensajeAviso: MENSAJE_ANTIGUEDAD_8_SEMANAS,
      pesoSugerido,
      ultimoPRKg,
      mejorE1RMKg,
    };
  }

  return {
    estado: "normal",
    pesoSugerido,
    ultimoPRKg,
    mejorE1RMKg,
  };
}

/**
 * Calcula las series de aproximación según la fórmula de GOZS-236.
 *
 * Esquema base:
 * 1. Barra vacía (20 kg) × 8 reps (0%)
 * 2. 50% de W × 5 reps
 * 3. 70% de W × 3 reps
 * 4. 85% de W × 2 reps
 *
 * Recortes:
 * - Aislamiento o W < 40 kg: solo series 2 y 3.
 * - Trabajo ligero (RPE <= 6 o > 12 reps objetivo): solo series 1 y 2.
 * - Si dos series salen al mismo peso, se omite la repetida.
 */
export function calcularSeriesAproximacion(
  pesoTrabajoKg: number,
  opciones?: OpcionesAproximacion
): WarmupSetProgression[] {
  const barWeight = opciones?.pesoBarraKg ?? PESO_BARRA_DEFAULT;
  const W = Math.max(0, pesoTrabajoKg);

  if (W <= 0) return [];

  const roundTo2_5 = (val: number) => redondearA2_5(val, barWeight);

  // Series candidatas completas (1 a 4)
  const candidatas: WarmupSetProgression[] = [
    {
      setNumber: 1,
      peso_kg: barWeight,
      reps: 8,
      percentage: 0,
      descripcion: "Barra vacía (movilidad y técnica)",
      set_type: "WARMUP",
    },
    {
      setNumber: 2,
      peso_kg: roundTo2_5(W * 0.5),
      reps: 5,
      percentage: 50,
      descripcion: "50% (aproximación inicial)",
      set_type: "WARMUP",
    },
    {
      setNumber: 3,
      peso_kg: roundTo2_5(W * 0.7),
      reps: 3,
      percentage: 70,
      descripcion: "70% (activación neuromuscular)",
      set_type: "WARMUP",
    },
    {
      setNumber: 4,
      peso_kg: roundTo2_5(W * 0.85),
      reps: 2,
      percentage: 85,
      descripcion: "85% (potenciación SNC previa a series efectivas)",
      set_type: "WARMUP",
    },
  ];

  const esAislamiento = Boolean(opciones?.esAislamiento);
  const esRecorteLiviano = esAislamiento || W < 40;

  const rpe = opciones?.rpeObjetivo;
  const esTrabajoLigero =
    (rpe != null && rpe > 0 && rpe <= 6) ||
    esRepsTrabajoLigero(opciones?.repeticionesObjetivo);

  let seriesFiltradas = candidatas;

  if (esRecorteLiviano && esTrabajoLigero) {
    // Si ambos recortes aplican: intersección es serie 2
    seriesFiltradas = [candidatas[1]!];
  } else if (esRecorteLiviano) {
    // Solo series 2 y 3
    seriesFiltradas = [candidatas[1]!, candidatas[2]!];
  } else if (esTrabajoLigero) {
    // Solo series 1 y 2
    seriesFiltradas = [candidatas[0]!, candidatas[1]!];
  }

  // Omitir repetidas consecutivas ("Si dos series salen al mismo peso, se omite la repetida")
  const sinRepetidas: WarmupSetProgression[] = [];
  for (const s of seriesFiltradas) {
    if (sinRepetidas.length === 0 || sinRepetidas[sinRepetidas.length - 1]!.peso_kg !== s.peso_kg) {
      sinRepetidas.push(s);
    }
  }

  // Renumerar correlativamente
  return sinRepetidas.map((s, idx) => ({
    ...s,
    setNumber: idx + 1,
  }));
}
