// "La última vez" de cada ejercicio (GOZS-159, spec docs/specs/historial-progreso.md §0 y §1).
// El ejercicio es canónico: se agrupa por registro_series.ejercicio_id, sin mirar plan ni día.

const ZONA = "America/Argentina/Buenos_Aires";

export interface SerieHistorica {
  ejercicio_id: string;
  sesion_id: string;
  fecha: string; // registro_sesiones.fecha (ISO)
  numero_serie: number;
  peso_kg: number;
  reps_hechas: number;
  rpe_real: number | null;
  completada: boolean;
  set_type?: string | null;
  atipica?: boolean;
}

export interface SerieUltimaVez {
  numero_serie: number;
  peso_kg: number;
  reps_hechas: number;
  rpe_real: number | null;
}

export interface UltimaVezEjercicio {
  ejercicio_id: string;
  fecha: string;
  series: SerieUltimaVez[];
}

// §0.1: completada, no atípica, no calentamiento y al menos una rep.
export function esSerieValida(s: SerieHistorica): boolean {
  return s.completada && !s.atipica && s.set_type !== "WARMUP" && s.set_type !== "W" && s.reps_hechas >= 1;
}

// Última sesión (anterior a `antesDe`) con al menos una serie válida de ese ejercicio. null = sin historial.
export function ultimaVezDeEjercicio(
  series: SerieHistorica[],
  ejercicioId: string,
  antesDe?: string,
): UltimaVezEjercicio | null {
  const limite = antesDe ? Date.parse(antesDe) : Infinity;
  const validas = series.filter(
    (s) => s.ejercicio_id === ejercicioId && esSerieValida(s) && Date.parse(s.fecha) < limite,
  );
  if (validas.length === 0) return null;

  const ultima = validas.reduce((a, b) => (Date.parse(b.fecha) > Date.parse(a.fecha) ? b : a));
  return {
    ejercicio_id: ejercicioId,
    fecha: ultima.fecha,
    series: validas
      .filter((s) => s.sesion_id === ultima.sesion_id)
      .sort((a, b) => a.numero_serie - b.numero_serie)
      .map(({ numero_serie, peso_kg, reps_hechas, rpe_real }) => ({ numero_serie, peso_kg, reps_hechas, rpe_real })),
  };
}

export function ultimaVezPorEjercicio(
  series: SerieHistorica[],
  ejercicioIds: string[],
  antesDe?: string,
): Record<string, UltimaVezEjercicio | null> {
  return Object.fromEntries(ejercicioIds.map((id) => [id, ultimaVezDeEjercicio(series, id, antesDe)]));
}

// §1.3: la serie con el mismo número; si aquella vez hizo menos, la última que tenga.
export function serieDeReferencia(ultima: UltimaVezEjercicio, numeroSerie: number): SerieUltimaVez | null {
  return ultima.series.find((s) => s.numero_serie === numeroSerie) ?? ultima.series[ultima.series.length - 1] ?? null;
}

const kg = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

// §0.2: "80 kg × 6"; peso corporal (peso_kg = 0) → "12 reps".
export function formatearCarga(s: Pick<SerieUltimaVez, "peso_kg" | "reps_hechas">): string {
  return s.peso_kg > 0 ? `${kg.format(s.peso_kg)} kg × ${s.reps_hechas}` : `${s.reps_hechas} reps`;
}

function partes(fecha: string | Date): Record<string, string> {
  const p = new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(typeof fecha === "string" ? new Date(fecha) : fecha);
  return Object.fromEntries(p.map((x) => [x.type, x.value]));
}

// §0.2: "dd/MM" si es del mismo año que `hoy`, si no "dd/MM/yy". Siempre en hora de Buenos Aires.
export function formatearFechaCorta(fecha: string, hoy: Date = new Date()): string {
  const f = partes(fecha);
  const corta = `${f.day}/${f.month}`;
  return f.year === partes(hoy).year ? corta : `${corta}/${f.year}`;
}

// §1.5: "Última vez, 12 de octubre: 80 kilos por 6 repeticiones".
export function ariaUltimaVez(fecha: string, s: Pick<SerieUltimaVez, "peso_kg" | "reps_hechas">): string {
  const dia = new Date(fecha).toLocaleDateString("es-AR", { timeZone: ZONA, day: "numeric", month: "long" });
  const reps = `${s.reps_hechas} ${s.reps_hechas === 1 ? "repetición" : "repeticiones"}`;
  return `Última vez, ${dia}: ${s.peso_kg > 0 ? `${kg.format(s.peso_kg)} kilos por ${reps}` : reps}`;
}
