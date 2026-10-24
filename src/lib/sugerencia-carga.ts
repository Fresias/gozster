// Sugerencia de carga (GOZS-160, spec docs/specs/historial-progreso.md §2).
// Sobrecarga progresiva simple ("doble progresión"): a partir de lo que hizo la
// última vez (pieza 1) propone el peso/reps de cada serie. Función pura y testeable;
// la copia y la UI viven en components/athlete/sugerencia-carga.tsx.

import { serieDeReferencia, type UltimaVezEjercicio } from "@/lib/historial-ejercicio";

export type TipoSugerencia = "subir" | "repetir";
export type MotivoSugerencia = "completo" | "incompleto" | "rpe-limite" | "mismo-peso";

// §2.3: a partir de este RPE la serie se considera "al límite" (se ignora si es NULL).
export const RPE_LIMITE = 9.5;

// §2.4: tabla de incrementos. Vive como constante para ajustarla sin tocar la UI.
export const INCREMENTOS_SUGERIDOS = {
  // Peso corporal (peso_kg = 0): no hay disco que sumar, se progresa en reps.
  pesoCorporalReps: 1,
  // Tren inferior pesado (sentadilla, peso muerto, prensa, hip thrust) ≥ 60 kg.
  trenInferiorPesado: 5,
  // Tren inferior liviano (< 60 kg), principiantes y unilaterales.
  trenInferiorLiviano: 2.5,
  // Tren superior / resto ≥ 20 kg (press, remo, militar): 1,25 kg por lado.
  trenSuperior: 2.5,
  // Liviano (< 20 kg): mancuernas, polea, aislamiento.
  liviano: 1,
  umbralTrenInferiorKg: 60,
  umbralLivianoKg: 20,
} as const;

// Músculos que marcan "tren inferior pesado" (normalizados, sin tildes, por substring).
const MUSCULOS_TREN_INFERIOR = ["cuadriceps", "gluteo", "isquio", "aductor"];

export interface Prescripcion {
  numeroSerie: number; // serie que el alumno está por abrir hoy
  repeticionesObjetivo: string; // texto de ejercicios_en_rutina.repeticiones ("8", "6-8", "AMRAP"…)
  seriesPrescriptas: number; // cantidad de series de hoy
  musculosPrincipales: string[] | string | null; // del catálogo (ejercicios.musculos_principales)
  setType?: string | null; // tipo de la serie de hoy; DROPSET/D nunca progresa
}

export interface SugerenciaCarga {
  tipo: TipoSugerencia;
  motivo: MotivoSugerencia;
  pesoSugerido: number; // kg (0 = peso corporal)
  repsSugeridas: number;
  esPesoCorporal: boolean;
  rpe?: number; // sólo cuando motivo === "rpe-limite"
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// §2.3.1: número solo → ese número; rango ("6-8", "6 a 8", "6–8") → {piso, tope};
// cualquier otro texto ("AMRAP", "al fallo", "30 s", vacío) → null (sin objetivo numérico).
export function parseObjetivo(texto: string | null | undefined): { piso: number; tope: number } | null {
  const limpio = (texto ?? "").trim();
  if (!limpio) return null;
  const rango = limpio.match(/^(\d+)\s*(?:-|–|—|a)\s*(\d+)$/i);
  if (rango) {
    const a = Number(rango[1]);
    const b = Number(rango[2]);
    return { piso: Math.min(a, b), tope: Math.max(a, b) };
  }
  const solo = limpio.match(/^\d+$/);
  return solo ? { piso: Number(limpio), tope: Number(limpio) } : null;
}

function esTrenInferior(musculos: Prescripcion["musculosPrincipales"]): boolean {
  const texto = normalizar(Array.isArray(musculos) ? musculos.join(" ") : musculos ?? "");
  return MUSCULOS_TREN_INFERIOR.some((m) => texto.includes(m));
}

// §2.4: incremento en kg según tipo de ejercicio y peso de referencia.
export function incrementoKg(pesoUltima: number, musculos: Prescripcion["musculosPrincipales"]): number {
  const { umbralTrenInferiorKg, umbralLivianoKg } = INCREMENTOS_SUGERIDOS;
  if (esTrenInferior(musculos)) {
    return pesoUltima >= umbralTrenInferiorKg ? INCREMENTOS_SUGERIDOS.trenInferiorPesado : INCREMENTOS_SUGERIDOS.trenInferiorLiviano;
  }
  return pesoUltima >= umbralLivianoKg ? INCREMENTOS_SUGERIDOS.trenSuperior : INCREMENTOS_SUGERIDOS.liviano;
}

// §2.3: redondeo del peso sugerido a múltiplos de 0,5 kg.
function redondearMedioKg(x: number): number {
  return Math.round(x * 2) / 2;
}

// §2.3: decide subir/repetir y calcula peso y reps precargadas.
// null = no hay sugerencia (sin historial o sin serie de referencia): la UI no renderiza el bloque.
export function sugerirCarga(
  ultimaVez: UltimaVezEjercicio | null | undefined,
  prescripcion: Prescripcion,
): SugerenciaCarga | null {
  if (!ultimaVez) return null;
  const ref = serieDeReferencia(ultimaVez, prescripcion.numeroSerie);
  if (!ref) return null;

  const esPesoCorporal = ref.peso_kg === 0;
  const objetivo = parseObjetivo(prescripcion.repeticionesObjetivo);
  const esDropset = prescripcion.setType === "DROPSET" || prescripcion.setType === "D";

  // §2.3.5: un drop set no se progresa, siempre repetir.
  if (esDropset) {
    return {
      tipo: "repetir",
      motivo: "mismo-peso",
      pesoSugerido: ref.peso_kg,
      repsSugeridas: objetivo?.tope ?? ref.reps_hechas,
      esPesoCorporal,
    };
  }

  // §2.3.1: sin objetivo numérico → repetir "mismo peso".
  if (!objetivo) {
    return {
      tipo: "repetir",
      motivo: "mismo-peso",
      pesoSugerido: ref.peso_kg,
      repsSugeridas: ref.reps_hechas,
      esPesoCorporal,
    };
  }

  // §2.3.2: completó todo = hizo todas las series, todas con reps ≥ tope y ninguna al límite de RPE.
  const series = ultimaVez.series;
  const hizoTodasLasSeries = series.length >= prescripcion.seriesPrescriptas;
  const completoReps = series.every((s) => s.reps_hechas >= objetivo.tope);
  const rpeAlLimite = series.some((s) => s.rpe_real != null && s.rpe_real >= RPE_LIMITE);

  // §2.3.3: completó todo → subir.
  if (hizoTodasLasSeries && completoReps && !rpeAlLimite) {
    if (esPesoCorporal) {
      return {
        tipo: "subir",
        motivo: "completo",
        pesoSugerido: 0,
        repsSugeridas: ref.reps_hechas + INCREMENTOS_SUGERIDOS.pesoCorporalReps,
        esPesoCorporal: true,
      };
    }
    return {
      tipo: "subir",
      motivo: "completo",
      pesoSugerido: redondearMedioKg(ref.peso_kg + incrementoKg(ref.peso_kg, prescripcion.musculosPrincipales)),
      repsSugeridas: objetivo.piso,
      esPesoCorporal: false,
    };
  }

  // §2.6: completó las reps pero fue al límite de RPE → repetir y buscar control.
  if (hizoTodasLasSeries && completoReps && rpeAlLimite) {
    return {
      tipo: "repetir",
      motivo: "rpe-limite",
      pesoSugerido: ref.peso_kg,
      repsSugeridas: objetivo.tope,
      esPesoCorporal,
      rpe: Math.max(...series.map((s) => s.rpe_real ?? 0)),
    };
  }

  // §2.3.4: quedaron reps sin completar → repetir con el mismo peso.
  return {
    tipo: "repetir",
    motivo: "incompleto",
    pesoSugerido: ref.peso_kg,
    repsSugeridas: objetivo.tope,
    esPesoCorporal,
  };
}

const kg = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const rpeFmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export function formatearPeso(peso: number): string {
  return `${kg.format(peso)} kg`;
}

// §2.6: título visible (no depende de la vista SIMPLE/TECNICA).
export function tituloSugerencia(s: SugerenciaCarga): string {
  if (s.esPesoCorporal) {
    return s.tipo === "subir" ? `Probá ${s.repsSugeridas} reps` : `Repetí ${s.repsSugeridas} reps`;
  }
  return s.tipo === "subir" ? `Subí a ${formatearPeso(s.pesoSugerido)}` : `Repetí ${formatearPeso(s.pesoSugerido)}`;
}

// §2.6: motivo visible. En vista SIMPLE el caso RPE pierde la sigla.
export function motivoSugerencia(s: SugerenciaCarga, vista: "SIMPLE" | "TECNICA" = "TECNICA"): string {
  switch (s.motivo) {
    case "completo":
      return "La última vez completaste todas las reps.";
    case "incompleto":
      return "La última vez quedaron reps sin completar. Primero completalas con este peso.";
    case "rpe-limite":
      return vista === "SIMPLE"
        ? "La última vez fue al límite. Repetí y buscá más control."
        : `La última vez fue al límite (RPE ${rpeFmt.format(s.rpe ?? 10)}). Repetí y buscá más control.`;
    case "mismo-peso":
      return "Mismo peso que la última vez.";
  }
}
