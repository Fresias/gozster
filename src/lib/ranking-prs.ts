import type { PrView, RankingPR } from "@/types/database.types";

/**
 * Adapta los PRs de `v_prs` (por alumno y ejercicio, desde registro_series)
 * al formato por clase que usa el ranking: cada PR se asigna a las clases
 * en las que el alumno tiene reserva.
 */
export function prsDeClasesDesdeVista(
  filas: PrView[],
  reservas: { clase_id: string; alumno_id: string }[],
): RankingPR[] {
  const porAlumno = new Map<string, PrView[]>();
  for (const f of filas) {
    porAlumno.set(f.alumno_id, [...(porAlumno.get(f.alumno_id) ?? []), f]);
  }
  return reservas.flatMap((r) =>
    (porAlumno.get(r.alumno_id) ?? []).map((f) => ({
      id: `${r.clase_id}:${f.serie_id}`,
      clase_id: r.clase_id,
      alumno_id: f.alumno_id,
      ejercicio_id: f.ejercicio_id,
      peso_kg: f.peso_kg,
      reps: f.reps,
      fecha: f.fecha,
      registrado_por: f.alumno_id,
      created_at: f.fecha,
      updated_at: f.fecha,
    })),
  );
}
