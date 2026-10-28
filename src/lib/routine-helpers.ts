/**
 * Utilidades puras para la Athlete App (Ponytail & Karpathy).
 * Cero dependencias externas.
 */

/**
 * Lee la prescripción de repeticiones de la rutina y devuelve el valor numérico por defecto.
 * Soporta series descendentes ("10-8-6"), rangos ("4 a 6", "8-10"), isométricos ("15'' x lado") y números directos.
 */
export function parseDefaultReps(repeticionesObjetivo?: string, numeroSerie: number = 1): number {
  if (!repeticionesObjetivo) return 10;
  const str = repeticionesObjetivo.trim();

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

