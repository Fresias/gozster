export type SerieTipo = "NORMAL" | "WARMUP" | "DROPSET" | "FAILURE";

/**
 * Normaliza cualquier representación de tipo de serie a su valor canónico.
 * Mapea "W" / "WARMUP" -> "WARMUP", "D" / "DROPSET" -> "DROPSET",
 * "F" / "FAILURE" -> "FAILURE" (serie al fallo; estado de primera clase en el
 * CHECK de registro_series.set_type), y cualquier otra entrada (incluyendo
 * null, undefined, "", "N", "NORMAL") -> "NORMAL".
 */
export function normalizeSerieTipo(input: string | null | undefined): SerieTipo {
  if (!input) return "NORMAL";
  const clean = input.trim().toUpperCase();
  if (clean === "W" || clean === "WARMUP") return "WARMUP";
  if (clean === "D" || clean === "DROPSET") return "DROPSET";
  if (clean === "F" || clean === "FAILURE") return "FAILURE";
  return "NORMAL";
}

export function isWarmup(input: string | null | undefined): boolean {
  return normalizeSerieTipo(input) === "WARMUP";
}

export function isDropset(input: string | null | undefined): boolean {
  return normalizeSerieTipo(input) === "DROPSET";
}

export function isFailure(input: string | null | undefined): boolean {
  return normalizeSerieTipo(input) === "FAILURE";
}

/**
 * Serie efectiva o de trabajo: toda serie que NO es de calentamiento (WARMUP / W).
 * Preserva compatibilidad exacta con la semántica del dominio
 * (incluye NORMAL, DROPSET y FAILURE).
 */
export function isWorkingSet(input: string | null | undefined): boolean {
  return normalizeSerieTipo(input) !== "WARMUP";
}
