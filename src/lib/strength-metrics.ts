export interface VolumeBlock {
  series: number;
  reps: number;
  peso: number;
}

/**
 * Estimación de 1RM con fórmula de Epley:
 * 1RM = Peso * (1 + Reps / 30)
 */
export function calculateEpley1RM(peso: number, reps: number): number {
  if (!Number.isFinite(peso) || !Number.isFinite(reps) || peso <= 0 || reps <= 0) {
    return 0;
  }
  return peso * (1 + reps / 30);
}

/**
 * Estimación de 1RM con fórmula de Brzycki:
 * 1RM = Peso / (1.0278 - 0.0278 * Reps)
 */
export function calculateBrzycki1RM(peso: number, reps: number): number {
  if (!Number.isFinite(peso) || !Number.isFinite(reps) || peso <= 0 || reps <= 0) {
    return 0;
  }
  const denominator = 1.0278 - 0.0278 * reps;
  if (denominator <= 0) {
    return 0;
  }
  return peso / denominator;
}

/**
 * Cálculo de volumen total de un bloque:
 * Volumen = Series * Reps * Peso
 */
export function calculateBlockVolume(
  series: number,
  reps: number,
  peso: number,
): number {
  if (
    !Number.isFinite(series) ||
    !Number.isFinite(reps) ||
    !Number.isFinite(peso) ||
    series <= 0 ||
    reps <= 0 ||
    peso <= 0
  ) {
    return 0;
  }
  return series * reps * peso;
}

/**
 * Cálculo de tonelaje total semanal / por sesión:
 * Tonelaje = Σ (Series * Reps * Peso)
 */
export function calculateTotalTonnage(blocks: readonly VolumeBlock[]): number {
  return blocks.reduce(
    (sum, block) =>
      sum + calculateBlockVolume(block.series, block.reps, block.peso),
    0,
  );
}
