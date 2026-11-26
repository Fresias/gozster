import { normalizeSerieTipo } from "@/lib/serie-tipo";

/**
 * Mapeador único de filas de `registro_series` (GOZS-884 · Ola B). Lo usan tanto
 * `syncSessionToSupabase` (al finalizar entrenamiento) como la cola offline, así la
 * forma de la fila es una sola. Campos fitness futuros (RIR, unilateral, tempo,
 * notas) se agregan acá y llegan a los dos caminos.
 */

export type SerieTipoDb = ReturnType<typeof normalizeSerieTipo>;

/** RPE válido (1–10) o `null`. */
export function normalizarRpeReal(rpe: number | null | undefined): number | null {
  if (typeof rpe !== "number" || !Number.isFinite(rpe) || rpe < 1 || rpe > 10) {
    return null;
  }
  return rpe;
}

export interface SerieRegistrada {
  sesionId: string;
  ejercicioId: string;
  numeroSerie: number;
  pesoKg?: number | null;
  reps?: number | null;
  rpe?: number | null;
  setType?: string | null;
  painReported?: boolean | null;
  painNotes?: string | null;
  videoUrl?: string | null;
}

export interface RegistroSerieRow {
  sesion_id: string;
  ejercicio_id: string;
  numero_serie: number;
  peso_kg: number;
  reps_hechas: number;
  rpe_real: number | null;
  completada: true;
  set_type: SerieTipoDb;
  pain_reported: boolean;
  pain_notes: string | null;
  video_url: string | null;
}

export interface RegistroSeriePartialUpdateRow {
  sesion_id: string;
  ejercicio_id: string;
  numero_serie: number;
  peso_kg: number;
  reps_hechas: number;
}

/** Fila completa de una serie realizada (upsert `"full"`). */
export function toRegistroSerieRow(s: SerieRegistrada): RegistroSerieRow {
  return {
    sesion_id: s.sesionId,
    ejercicio_id: s.ejercicioId,
    numero_serie: s.numeroSerie,
    peso_kg: s.pesoKg ?? 0,
    reps_hechas: s.reps ?? 0,
    rpe_real: normalizarRpeReal(s.rpe),
    completada: true,
    set_type: normalizeSerieTipo(s.setType ?? undefined),
    pain_reported: s.painReported ?? false,
    pain_notes: s.painNotes || null,
    video_url: s.videoUrl || null,
  };
}

/** Solo peso/reps: edición de una serie sin el registro completo previo en la cola. */
export function toRegistroSeriePartialUpdateRow(
  s: Pick<SerieRegistrada, "sesionId" | "ejercicioId" | "numeroSerie" | "pesoKg" | "reps">,
): RegistroSeriePartialUpdateRow {
  return {
    sesion_id: s.sesionId,
    ejercicio_id: s.ejercicioId,
    numero_serie: s.numeroSerie,
    peso_kg: s.pesoKg ?? 0,
    reps_hechas: s.reps ?? 0,
  };
}
