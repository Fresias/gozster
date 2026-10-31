/**
 * Validación pura del constructor de rutinas (GOZS-322).
 * Mismas reglas que los CHECK de la BD; los mensajes son lo que ve el coach junto al campo.
 */

interface EjercicioValidable {
  id: string;
  series: number | null;
  repeticiones: string;
  descanso_segundos: number | null;
  rpe_objetivo: number | null;
}

interface DiaValidable {
  id: string;
  nombre: string;
  ejercicios: EjercicioValidable[];
}

export interface ResultadoValidacion {
  /** Bloquean el guardado. Clave por campo: ver `claveRutina`, `claveDia`, `claveEjercicio`. */
  errores: Record<string, string>;
  /** No bloquean: día sin ejercicios. */
  avisos: Record<string, string>;
}

export const claveRutina = "rutina.nombre";
export const claveDia = (diaId: string) => `dia.${diaId}.nombre`;
export const claveEjercicio = (exId: string, campo: "series" | "reps" | "descanso" | "rpe") => `ej.${exId}.${campo}`;

const REPS_LISTA = /^\d{1,3}(-\d{1,3})*$/;
const REPS_PRODUCTO = /^\d{1,2}x\d{1,3}$/;

export function repsValidas(raw: string): boolean {
  if (!REPS_LISTA.test(raw) && !REPS_PRODUCTO.test(raw)) return false;
  return raw.split(/[-x]/).every((n) => Number(n) >= 1 && Number(n) <= 100);
}

export function validarRutina(input: { nombre: string; days: DiaValidable[] }): ResultadoValidacion {
  const errores: Record<string, string> = {};
  const avisos: Record<string, string> = {};

  if (!input.nombre.trim()) errores[claveRutina] = "Nombre de la rutina: obligatorio";

  for (const d of input.days) {
    if (!d.nombre.trim()) errores[claveDia(d.id)] = "Nombre del día: obligatorio";
    if (d.ejercicios.length === 0) avisos[claveDia(d.id)] = "Este día no tiene ejercicios: la alumna lo verá vacío";

    for (const e of d.ejercicios) {
      if (!Number.isInteger(e.series) || e.series! < 1 || e.series! > 20) {
        errores[claveEjercicio(e.id, "series")] = "Series: entre 1 y 20";
      }
      if (!repsValidas(e.repeticiones)) {
        errores[claveEjercicio(e.id, "reps")] = "Repeticiones: ej. 10, 10-8-6 o 3x12 (1 a 100)";
      }
      if (!Number.isInteger(e.descanso_segundos) || e.descanso_segundos! < 0 || e.descanso_segundos! > 900) {
        errores[claveEjercicio(e.id, "descanso")] = "Descanso: entre 0 y 900 s";
      }
      if (e.rpe_objetivo !== null && !(e.rpe_objetivo >= 1 && e.rpe_objetivo <= 10 && (e.rpe_objetivo * 2) % 1 === 0)) {
        errores[claveEjercicio(e.id, "rpe")] = "RPE: entre 1 y 10, de a 0.5";
      }
    }
  }

  return { errores, avisos };
}
