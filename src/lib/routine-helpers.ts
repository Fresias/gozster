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
  const slashMatch = str.match(/^(\d+)\s*\/\s*(\d+)$/);
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
 * Parsea una secuencia de RPE piramidal con guiones (ej. "6-7-8-9" -> [6, 7, 8, 9]).
 * Rechaza explícitamente cadenas con espacios (ej. "6 7 8 9" -> null, "6 - 7" -> null).
 * Cada valor debe estar en el rango fisiológico de RPE [1, 10].
 */
export function parsePyramidRpeSteps(rpe?: string | number | null): number[] | null {
  if (rpe === null || rpe === undefined) return null;
  const str = String(rpe).trim();
  if (!str) return null;
  if (/\s/.test(str)) return null;
  const parts = str.split("-");
  if (
    parts.length >= 2 &&
    parts.every((p) => /^\d+(\.\d+)?$/.test(p) && Number(p) >= 1 && Number(p) <= 10)
  ) {
    return parts.map(Number);
  }
  return null;
}

/**
 * Obtiene el RPE objetivo para una serie específica (1-indexed).
 * Soporta secuencias piramidales con guiones ("6-7-8-9"), números directos (8, 8.5) y cadenas ("8").
 * Si la serie solicitada excede los escalones definidos, se utiliza el último escalón.
 */
export function parseTargetRpe(rpe?: string | number | null, numeroSerie: number = 1): number | null {
  if (rpe === null || rpe === undefined) return null;
  if (typeof rpe === "number") {
    return !Number.isNaN(rpe) && rpe >= 1 && rpe <= 10 ? rpe : null;
  }
  const str = String(rpe).trim();
  if (!str) return null;
  if (/\s/.test(str)) return null;

  if (str.includes("-")) {
    const steps = parsePyramidRpeSteps(str);
    if (steps && steps.length > 0) {
      const idx = Math.min(Math.max(0, numeroSerie - 1), steps.length - 1);
      return steps[idx] ?? null;
    }
    return null;
  }

  const num = Number(str);
  if (!Number.isNaN(num) && num >= 1 && num <= 10) {
    return num;
  }
  return null;
}

/**
 * Valida un RPE objetivo para una rutina.
 * - Rechaza explícitamente cadenas con espacios (ej. "6 7 8 9").
 * - Valida que los valores estén en la escala [1, 10] (de a 0.5 si es número fijo).
 * - Si es pirámide con guiones y se provee seriesCount, valida que la cantidad de escalones coincida exactamente con las series.
 */
export function validarRpeObjetivo(
  rpe?: string | number | null,
  seriesCount?: number | null
): { valido: boolean; error?: string } {
  if (rpe === null || rpe === undefined) return { valido: true };
  const str = typeof rpe === "string" ? rpe : String(rpe);
  const trimmed = str.trim();
  if (!trimmed) return { valido: true };

  // Rechazo explícito de espacios
  if (/\s/.test(trimmed)) {
    return { valido: false, error: "RPE no debe contener espacios (ej. 6-7-8-9)" };
  }

  // Si contiene guión, debe ser pirámide
  if (trimmed.includes("-")) {
    const parts = trimmed.split("-");
    if (parts.length < 2) {
      return { valido: false, error: "RPE piramidal inválido" };
    }
    for (const part of parts) {
      const n = Number(part);
      if (Number.isNaN(n) || n < 1 || n > 10) {
        return { valido: false, error: "RPE: cada valor debe estar entre 1 y 10" };
      }
    }
    if (typeof seriesCount === "number" && seriesCount > 0 && parts.length !== seriesCount) {
      return {
        valido: false,
        error: `RPE: la cantidad de escalones (${parts.length}) debe coincidir con las series (${seriesCount})`,
      };
    }
    return { valido: true };
  }

  // Valor único
  const num = Number(trimmed);
  if (Number.isNaN(num) || num < 1 || num > 10 || (num * 2) % 1 !== 0) {
    return { valido: false, error: "RPE: entre 1 y 10, de a 0.5" };
  }

  return { valido: true };
}

/**
 * Lee la prescripción de repeticiones de la rutina y devuelve el valor numérico por defecto.
 * Soporta series descendentes ("10-8-6"), rangos con barra ("8/12"), rangos con "a" o "-" ("4 a 6", "8-10"),
 * isométricos ("15'' x lado") y números directos.
 */
export function parseDefaultReps(repeticionesObjetivo?: string, numeroSerie: number = 1): number {
  if (!repeticionesObjetivo) return 10;
  const str = repeticionesObjetivo.trim();

  // Caso: rango con barra "/" (ej. "8/12", "8 / 12", "10/12") -> target por defecto es el máximo
  const repRange = parseRepRange(str);
  if (repRange?.isRange) {
    return repRange.max;
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

