// Alerta de estancamiento (GOZS-226): alumno que entrenó en los últimos 30 días sin ningún PR.
// PR = más kilos, o mismo peso con más reps (40kg×1 → 40kg×2), según esNuevoRecord (no se duplica).
// Función pura, sin red: testeable con Vitest y usable offline.

import { esSerieValida, type SerieHistorica } from "@/lib/historial-ejercicio";
import { agregarSerieAMarcas, esNuevoRecord, type MarcasEjercicio } from "@/lib/record-ejercicio";

export const DIAS_ESTANCAMIENTO = 30;
const MS_DIA = 86_400_000;

// Series del alumno en cualquier ejercicio. Una serie es PR si supera las marcas previas de su ejercicio.
export function fechasDePR(series: SerieHistorica[]): string[] {
  const orden = series
    .filter(esSerieValida)
    .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha) || a.numero_serie - b.numero_serie);
  const marcas = new Map<string, MarcasEjercicio | null>();
  const fechas: string[] = [];
  for (const s of orden) {
    const previas = marcas.get(s.ejercicio_id) ?? null;
    if (esNuevoRecord(s, previas).esRecord) fechas.push(s.fecha);
    marcas.set(s.ejercicio_id, agregarSerieAMarcas(previas, s.ejercicio_id, s));
  }
  return fechas;
}

// Estancado = entrenó en los últimos 30 días, tiene ≥ 30 días de datos y ningún PR en la ventana.
export function estaEstancado(series: SerieHistorica[], ahora: number = Date.now()): boolean {
  const desde = ahora - DIAS_ESTANCAMIENTO * MS_DIA;
  const tiempos = series.filter(esSerieValida).map((s) => Date.parse(s.fecha));
  if (tiempos.length === 0) return false;
  if (!tiempos.some((t) => t >= desde && t <= ahora)) return false;
  if (Math.min(...tiempos) > desde) return false;
  return !fechasDePR(series).some((f) => Date.parse(f) >= desde && Date.parse(f) <= ahora);
}
