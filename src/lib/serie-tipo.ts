export type SerieTipo = "NORMAL" | "WARMUP" | "DROPSET";

/**
 * Normaliza cualquier representación de tipo de serie a su valor canónico.
 * Mapea "W" / "WARMUP" -> "WARMUP", "D" / "DROPSET" -> "DROPSET",
 * y cualquier otra entrada (incluyendo null, undefined, "", "N", "NORMAL") -> "NORMAL".
 */
export function normalizeSerieTipo(input: string | null | undefined): SerieTipo {
  if (!input) return "NORMAL";
  const clean = input.trim().toUpperCase();
  if (clean === "W" || clean === "WARMUP") return "WARMUP";
  if (clean === "D" || clean === "DROPSET") return "DROPSET";
  return "NORMAL";
}

export function isWarmup(input: string | null | undefined): boolean {
  return normalizeSerieTipo(input) === "WARMUP";
}

export function isDropset(input: string | null | undefined): boolean {
  return normalizeSerieTipo(input) === "DROPSET";
}

/**
 * Serie efectiva o de trabajo: toda serie que NO es de calentamiento (WARMUP / W).
 * Preserva compatibilidad exacta con la semántica del dominio (incluye DROPSET y NORMAL).
 */
export function isWorkingSet(input: string | null | undefined): boolean {
  return normalizeSerieTipo(input) !== "WARMUP";
}
