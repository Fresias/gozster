import { supabase } from "@/lib/supabase/client";

export interface Feriado {
  nombre: string;
  hay_clases: boolean;
}

export type FeriadosPorDia = Record<string, Feriado>;

// Sin base: mismos feriados nacionales 2026 que supabase/seed_data/feriados_ar_2026.sql.
const DEMO_FERIADOS_2026: Array<[string, string]> = [
  ["2026-01-01", "Año Nuevo"],
  ["2026-02-16", "Carnaval"],
  ["2026-02-17", "Carnaval"],
  ["2026-03-23", "Día no laborable con fines turísticos"],
  ["2026-03-24", "Día Nacional de la Memoria por la Verdad y la Justicia"],
  ["2026-04-02", "Día del Veterano y de los Caídos en la Guerra de Malvinas"],
  ["2026-04-03", "Viernes Santo"],
  ["2026-05-01", "Día del Trabajador"],
  ["2026-05-25", "Día de la Revolución de Mayo"],
  ["2026-06-15", "Paso a la Inmortalidad del General Güemes (trasladado)"],
  ["2026-06-20", "Paso a la Inmortalidad del General Belgrano"],
  ["2026-07-09", "Día de la Independencia"],
  ["2026-07-10", "Día no laborable con fines turísticos"],
  ["2026-08-17", "Paso a la Inmortalidad del General San Martín"],
  ["2026-10-12", "Día del Respeto a la Diversidad Cultural"],
  ["2026-11-23", "Día de la Soberanía Nacional (trasladado)"],
  ["2026-12-07", "Día no laborable con fines turísticos"],
  ["2026-12-08", "Inmaculada Concepción de María"],
  ["2026-12-25", "Navidad"],
];

export function feriadosDemo(): FeriadosPorDia {
  return Object.fromEntries(
    DEMO_FERIADOS_2026.map(([fecha, nombre]) => [fecha, { nombre, hay_clases: false }])
  );
}

// Feriados del año `anio` indexados por clave AAAA-MM-DD (la misma de claveDia).
export async function cargarFeriados(anio: number): Promise<FeriadosPorDia> {
  const { data, error } = await supabase.rpc("feriados_en_rango", {
    p_desde: `${anio}-01-01`,
    p_hasta: `${anio}-12-31`,
  });
  if (error) return {};
  return Object.fromEntries(
    (data ?? []).map((f) => [f.fecha, { nombre: f.nombre, hay_clases: f.hay_clases }])
  );
}
