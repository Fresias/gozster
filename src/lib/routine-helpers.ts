/**
 * Utilidades puras para la Athlete App (Ponytail & Karpathy).
 * Cero dependencias externas.
 */

export interface RepRangeInfo {
  isRange: boolean;
  min: number;
  max: number;
}

/**
 * Interpreta una prescripción de repeticiones de tipo rango con barra (ej. "8/12" o "10/12").
 * Retorna { isRange: true, min, max } o null si no es un rango válido.
 */
export function parseRepRange(repeticiones?: string): RepRangeInfo | null {
  if (!repeticiones) return null;
  const str = repeticiones.trim();
  const slashMatch = str.match(/^(\d+)\/(\d+)$/);
  if (slashMatch && slashMatch[1] && slashMatch[2]) {
    const n1 = parseInt(slashMatch[1], 10);
    const n2 = parseInt(slashMatch[2], 10);
    if (!isNaN(n1) && !isNaN(n2)) {
      return {
        isRange: true,
        min: Math.min(n1, n2),
        max: Math.max(n1, n2),
      };
    }
  }
  return null;
}

/**
 * Cuenta la cantidad de series implícitas en una secuencia piramidal con guión (ej. "12-10-8-6-4" -> 5).
 * Rechaza espacios (ej. "10 8 6 4" -> null).
 */
export function parsePyramidSeriesCount(repeticiones?: string): number | null {
  if (!repeticiones) return null;
  const str = repeticiones.trim();
  if (/\s/.test(str)) return null;
  const parts = str.split("-");
  if (parts.length >= 2 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) > 0)) {
    return parts.length;
  }
  return null;
}

/**
 * Lee la prescripción de repeticiones de la rutina y devuelve el valor numérico por defecto.
 * Soporta series descendentes ("10-8-6"), rangos con barra ("8/12"), rangos con "a" o "-" ("4 a 6", "8-10"),
 * isométricos ("15'' x lado") y números directos.
 */
export function parseDefaultReps(repeticionesObjetivo?: string, numeroSerie: number = 1): number {
  if (!repeticionesObjetivo) return 10;
  const str = repeticionesObjetivo.trim();

  // Caso: rango con barra "/" (ej. "8/12" o "10/12") -> target por defecto es el máximo
  const slashMatch = str.match(/^(\d+)\/(\d+)$/);
  if (slashMatch && slashMatch[1] && slashMatch[2]) {
    const n1 = parseInt(slashMatch[1], 10);
    const n2 = parseInt(slashMatch[2], 10);
    if (!isNaN(n1) && !isNaN(n2)) {
      return Math.max(n1, n2);
    }
  }

  // Caso: lista descendente como "10-8-6" o "12-10-8-6"
  const dashList = str
    .split("-")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));

  if (dashList.length > 1 && !str.includes("a") && !str.toLowerCase().includes("rpe")) {
    const idx = Math.min(Math.max(0, numeroSerie - 1), dashList.length - 1);
    const val = dashList[idx];
    if (val !== undefined && val > 0) {
      return val;
    }
  }

  // Caso: rango con "a" o "-" (ej. "4 a 6", "6 a 12", "8-10")
  const rangeMatch = str.match(/(\d+)\s*(?:a|-)\s*(\d+)/i);
  if (rangeMatch && rangeMatch[1]) {
    const num = parseInt(rangeMatch[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }

  // Caso: segundos o repeticiones directas ("15''", "8 x lado", "12 reps", "10")
  const singleMatch = str.match(/\b(\d+)\b/);
  if (singleMatch && singleMatch[1]) {
    const num = parseInt(singleMatch[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }

  return 10;
}

/**
 * Determina si un ejercicio es de entrada en calor / warm up.
 */
export function isWarmupExercise(nombre: string): boolean {
  const n = nombre.toLowerCase();
  return (
    n.includes("warm up") ||
    n.includes("warm-up") ||
    n.includes("warmup") ||
    n.includes("calentamiento") ||
    n.includes("entrada en calor")
  );
}

/**
 * Ordena los ejercicios de una sesión garantizando que la entrada en calor figure arriba de todo.
 */
export function sortExercisesWithWarmupFirst<T extends { nombre: string }>(exercises: T[]): T[] {
  const warmups: T[] = [];
  const regulars: T[] = [];

  for (const ex of exercises) {
    if (isWarmupExercise(ex.nombre)) {
      warmups.push(ex);
    } else {
      regulars.push(ex);
    }
  }

  return [...warmups, ...regulars];
}

export const MIN_SERIES_PER_EXERCISE = 1;
export const MAX_SERIES_PER_EXERCISE = 10;

/**
 * Limita el número de series al rango permitido [1, 10] (D-R6).
 * Rechaza valores disparatados (como 9999) o negativos manteniéndolos en un rango fisiológico y seguro.
 */
export function clampSeries(value: number | string | undefined | null): number {
  const num = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (Number.isNaN(num) || num < MIN_SERIES_PER_EXERCISE) return MIN_SERIES_PER_EXERCISE;
  if (num > MAX_SERIES_PER_EXERCISE) return MAX_SERIES_PER_EXERCISE;
  return Math.trunc(num);
}

