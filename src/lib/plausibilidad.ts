/**
 * GOZS-203: Validación de plausibilidad de series, saneo de inputs y límites duros.
 *
 * Criterios de Aceptación:
 * 1. GIVEN historial de 20 kg en un ejercicio WHEN el atleta ingresa 200 kg
 *    (o >~3x del máximo histórico / reps absurdas) THEN se muestra un <dialog>
 *    de confirmación explícita antes de guardar.
 * 2. GIVEN peso negativo, NaN, reps 0 o >100, RPE fuera de 1-10 WHEN intenta
 *    completar la serie THEN el input lo bloquea con mensaje claro (min/max/step nativos).
 * 3. GIVEN notas/chat/nombres con <script>, <img onerror> o ' OR 1=1-- WHEN se guardan
 *    y renderizan THEN se muestran como texto literal (sin dangerouslySetInnerHTML).
 * 4. GIVEN la lógica de plausibilidad WHEN se testea THEN existe función pura con spec Vitest.
 */

export const FACTOR_PLAUSIBILIDAD_PESO = 3;
export const MAX_PESO_ABSOLUTO_PLAUSIBLE = 500;
export const MAX_REPS_PLAUSIBLES = 50;
export const MAX_REPS_BLOQUEO = 100;

export interface ValidacionSerieResult {
  esValido: boolean;
  error: string | null;
  campo?: "peso" | "reps" | "rpe";
}

export interface PlausibilidadSerieResult {
  requiereConfirmacion: boolean;
  advertencia: string | null;
  razon?: "PESO_EXCESIVO" | "REPS_EXCESIVAS";
}

export interface HistorialEjercicioRef {
  max_peso_kg?: number | null;
  max_reps?: number | null;
}

/**
 * Valida los límites duros de una serie ingresada (peso, reps, RPE).
 * Bloquea valores imposibles (peso negativo, NaN, reps 0 o >100, RPE fuera de 1-10).
 */
export function validarInputSerie(
  peso: number,
  reps: number,
  rpe?: number | null,
): ValidacionSerieResult {
  // 1. Validar Peso (kg): no negativo, no NaN
  if (typeof peso !== "number" || Number.isNaN(peso)) {
    return {
      esValido: false,
      error: "El peso no puede ser un valor inválido (NaN)",
      campo: "peso",
    };
  }

  if (peso < 0) {
    return {
      esValido: false,
      error: "El peso no puede ser un valor negativo",
      campo: "peso",
    };
  }

  // 2. Validar Repeticiones: entero positivo entre 1 y 100
  if (typeof reps !== "number" || Number.isNaN(reps)) {
    return {
      esValido: false,
      error: "Las repeticiones no pueden ser un valor inválido (NaN)",
      campo: "reps",
    };
  }

  if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS_BLOQUEO) {
    return {
      esValido: false,
      error: "Las repeticiones deben ser un número entero entre 1 y 100",
      campo: "reps",
    };
  }

  // 3. Validar RPE (si está presente y definido)
  if (rpe !== undefined && rpe !== null) {
    if (typeof rpe !== "number" || Number.isNaN(rpe) || rpe < 1.0 || rpe > 10.0) {
      return {
        esValido: false,
        error: "El RPE debe estar en una escala del 1.0 al 10.0",
        campo: "rpe",
      };
    }
  }

  return {
    esValido: true,
    error: null,
  };
}

/**
 * Evalúa si una carga o cantidad de repeticiones es implausible respecto
 * al historial previo del atleta (>~3x del máximo histórico o reps absurdas > 50).
 * Retorna si requiere confirmación explícita mediante un <dialog>.
 */
export function evaluarPlausibilidadSerie(
  serie: { peso_kg: number; reps_hechas: number },
  historial?: HistorialEjercicioRef | null,
): PlausibilidadSerieResult {
  const peso = serie.peso_kg;
  const reps = serie.reps_hechas;
  const maxPesoHist = historial?.max_peso_kg ?? 0;
  const maxRepsHist = historial?.max_reps ?? 0;

  // 1. Si existe historial de peso previo > 0 y la serie supera más de 3 veces ese máximo:
  if (maxPesoHist > 0 && peso > maxPesoHist * FACTOR_PLAUSIBILIDAD_PESO) {
    return {
      requiereConfirmacion: true,
      razon: "PESO_EXCESIVO",
      advertencia: `Ingresaste ${peso} kg, lo cual supera más de 3 veces tu máximo histórico (${maxPesoHist} kg). ¿Confirmas que este valor es correcto?`,
    };
  }

  // 2. Si el peso supera el umbral absoluto plausible (500 kg)
  if (peso > MAX_PESO_ABSOLUTO_PLAUSIBLE) {
    return {
      requiereConfirmacion: true,
      razon: "PESO_EXCESIVO",
      advertencia: `Ingresaste ${peso} kg, una carga inusualmente alta. ¿Confirmas que este valor es correcto?`,
    };
  }

  // 3. Si las repeticiones superan más de 3x el máximo de repeticiones previas (con base >= 10)
  if (maxRepsHist >= 10 && reps > maxRepsHist * 3) {
    return {
      requiereConfirmacion: true,
      razon: "REPS_EXCESIVAS",
      advertencia: `Ingresaste ${reps} repeticiones, más de 3 veces tu registro anterior (${maxRepsHist} reps). ¿Confirmas que este valor es correcto?`,
    };
  }

  // 4. Repeticiones absurdas absolutas (> 50 reps en una sola serie)
  if (reps > MAX_REPS_PLAUSIBLES) {
    return {
      requiereConfirmacion: true,
      razon: "REPS_EXCESIVAS",
      advertencia: `Ingresaste ${reps} repeticiones, una cantidad inusualmente alta para una sola serie. ¿Confirmas que este valor es correcto?`,
    };
  }

  return {
    requiereConfirmacion: false,
    advertencia: null,
  };
}

/**
 * Sanea texto ingresado por el atleta (notas, chat, nombres).
 * Remueve caracteres nulos o de control invisibles y hace trim.
 * Al persistir y renderizar con React, previene vectores de inyección.
 */
export function sanearTexto(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  // Filtrar caracteres de control ASCII (excepto \t y \n) y caracteres invisibles nulos
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .trim();
}

/**
 * Convierte caracteres especiales a entidades HTML para contextos que requieran
 * sanitización explícita fuera del DOM reactivo estándar.
 */
export function escaparHtml(input: string | null | undefined): string {
  const limpio = sanearTexto(input);
  return limpio
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
