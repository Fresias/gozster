import type { PlanEntrenamiento } from "@/types/database.types";

export interface RutinasClasificadas {
  plantillas: PlanEntrenamiento[];
  deAlumnos: PlanEntrenamiento[];
  archivadas: PlanEntrenamiento[];
}

/** Sin `tipo` (datasets de respaldo) se deduce por la presencia de alumno. */
export function tipoDePlan(plan: PlanEntrenamiento): "PLANTILLA" | "DE_ALUMNO" {
  return plan.tipo ?? (plan.alumno_id ? "DE_ALUMNO" : "PLANTILLA");
}

/** Reparte los planes en las tres pestañas de la biblioteca. Un plan INACTIVO solo va a Archivadas. */
export function clasificarRutinas(planes: PlanEntrenamiento[]): RutinasClasificadas {
  const out: RutinasClasificadas = { plantillas: [], deAlumnos: [], archivadas: [] };
  for (const plan of planes) {
    if (plan.estado === "INACTIVO") out.archivadas.push(plan);
    else if (tipoDePlan(plan) === "PLANTILLA") out.plantillas.push(plan);
    else out.deAlumnos.push(plan);
  }
  return out;
}

/** "De alumnos" muestra lo vigente; los BORRADOR van aparte para que no se confundan con la ACTIVA. */
export function separarBorradores(deAlumnos: PlanEntrenamiento[]) {
  return {
    vigentes: deAlumnos.filter((p) => p.estado !== "BORRADOR"),
    borradores: deAlumnos.filter((p) => p.estado === "BORRADOR"),
  };
}

/** "X" → "X (copia)" → "X (copia 2)"…: nunca devuelve un nombre que ya exista (sin distinguir mayúsculas). */
export function nombreUnico(nombre: string, existentes: readonly string[]): string {
  const usados = new Set(existentes.map((n) => n.trim().toLowerCase()));
  const limpio = nombre.trim();
  if (!usados.has(limpio.toLowerCase())) return limpio;
  const base = limpio.replace(/ \(copia(?: \d+)?\)$/i, "");
  let candidato = `${base} (copia)`;
  for (let n = 2; usados.has(candidato.toLowerCase()); n++) candidato = `${base} (copia ${n})`;
  return candidato;
}

const FECHA = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" });
export const formatFecha = (iso: string | null) => (iso ? FECHA.format(new Date(iso)) : "—");
