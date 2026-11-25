// Texto corto para la escala RPE 1–10 (medios puntos 6,5–9,5). Función pura.

const fmt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

export const RPE_AYUDA_GENERAL =
  "El RPE mide qué tan cerca estuviste del fallo (7 = podías hacer 3 más, 10 = ninguna más).";

/** Descripción corta del RPE; `null`/inválido devuelve la ayuda general. */
export function descripcionRpe(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return RPE_AYUDA_GENERAL;
  const v = Math.min(10, Math.max(1, x));
  const etiqueta = fmt.format(v);
  if (v < 3) return `RPE ${etiqueta}: Muy suave`;
  if (v < 5) return `RPE ${etiqueta}: Suave`;
  if (v < 7) return `RPE ${etiqueta}: Moderado`;
  if (v < 8) return `RPE ${etiqueta}: Algo exigente · 3 más`;
  if (v < 9) return `RPE ${etiqueta}: Exigente · 2 más`;
  if (v < 10) return `RPE ${etiqueta}: Muy exigente · 1 más`;
  return `RPE ${etiqueta}: Al límite · ninguna más`;
}
