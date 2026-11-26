// GOZS-873: progreso de vueltas de una Superserie cuando sus ejercicios tienen distinta cantidad de
// series (ej. 3 vs 4). La vuelta r cuenta como hecha cuando todos los ejercicios que tienen serie r
// la completaron; un ejercicio sin serie r (ya terminó sus series) no traba el progreso.
export interface EjercicioConSeries {
  series: ReadonlyArray<{ numero_serie: number; completada: boolean }>;
}

export function calcularProgresoVueltasSuperserie(ejercicios: ReadonlyArray<EjercicioConSeries>): {
  total: number;
  hechas: number;
} {
  const total = Math.max(...ejercicios.map((x) => x.series.length), 0);
  let hechas = 0;
  for (let r = 1; r <= total; r += 1) {
    const participantes = ejercicios.flatMap((x) => x.series.filter((s) => s.numero_serie === r));
    if (participantes.length > 0 && participantes.every((s) => s.completada)) hechas += 1;
  }
  return { total, hechas };
}
