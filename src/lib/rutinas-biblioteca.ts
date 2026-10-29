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
