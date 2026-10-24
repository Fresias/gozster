import { describe, expect, it } from "vitest";
import {
  armarAdherencia,
  badgeAdherencia,
  formatearPromedio,
  type SesionAdherencia,
} from "@/lib/adherencia";

// Datos inventados (nunca datos reales del export, ADR-005).
// HOY = jueves 15/10/2026, hora de Buenos Aires. Semana actual: lun 12 → dom 18.
const HOY = new Date("2026-10-15T12:00:00-03:00");
const LUNES_ACTUAL = "2026-10-12";

const ses = (ymd: string): SesionAdherencia => ({ fecha: `${ymd}T12:00:00Z` });
const addDays = (ymd: string, n: number): string =>
  new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe("armarAdherencia — estructura de la grilla (spec §5.4)", () => {
  it("son 52 semanas de 7 días, lunes arriba, la actual al final", () => {
    const a = armarAdherencia([], HOY, 3, null);
    expect(a.semanas).toHaveLength(52);
    expect(a.semanas.every((w) => w.dias.length === 7)).toBe(true);
    const actual = a.semanas[51]!;
    expect(actual.esActual).toBe(true);
    expect(actual.lunes).toBe(LUNES_ACTUAL);
    expect(actual.dias[0]!.fecha).toBe(LUNES_ACTUAL); // lunes arriba
    expect(a.semanas[50]!.completa).toBe(true);
    expect(actual.completa).toBe(false);
  });

  it("los días posteriores a hoy en la semana actual son 'futuro'", () => {
    const a = armarAdherencia([], HOY, 3, null);
    const actual = a.semanas[51]!;
    // jueves 15 es hoy: vie 16 / sáb 17 / dom 18 son futuros.
    expect(actual.dias[3]!.esHoy).toBe(true); // jueves
    expect(actual.dias[4]!.estado).toBe("futuro");
    expect(actual.dias[6]!.estado).toBe("futuro");
  });

  it("etiqueta un mes por su primera columna", () => {
    const a = armarAdherencia([], HOY, 3, null);
    expect(a.meses.length).toBeGreaterThanOrEqual(11);
    expect(a.meses[a.meses.length - 1]!.label).toBe("oct");
    // las etiquetas no se repiten en columnas consecutivas
    for (let i = 1; i < a.meses.length; i++) {
      expect(a.meses[i]!.col).toBeGreaterThan(a.meses[i - 1]!.col);
    }
  });
});

describe("armarAdherencia — conteo por semana y objetivo (spec §5.4, §5.8)", () => {
  it("2 sesiones la semana pasada con objetivo 3: 2 celdas 'entreno', número 2, no cumple", () => {
    const sesiones = [ses("2026-10-06"), ses("2026-10-08")]; // mar y jue de la semana lun 5 → dom 11
    const a = armarAdherencia(sesiones, HOY, 3, "2026-01-01T12:00:00Z");
    const pasada = a.semanas[50]!;
    expect(pasada.lunes).toBe("2026-10-05");
    expect(pasada.sesiones).toBe(2);
    expect(pasada.dias.filter((d) => d.estado === "entreno")).toHaveLength(2);
    expect(pasada.numeroTexto).toBe("2");
    expect(pasada.cumplido).toBe(false); // 2 < 3 → el componente lo pinta en rojo
    expect(pasada.evaluable).toBe(true);
  });

  it("semana completa posterior a la primera sesión sin sesiones: número '—'", () => {
    const a = armarAdherencia([ses("2026-10-06")], HOY, 3, "2026-01-01T12:00:00Z");
    // la semana lun 28/9 → dom 4/10 no tiene sesiones y es completa/posterior.
    const vacia = a.semanas.find((w) => w.lunes === "2026-09-28")!;
    expect(vacia.sesiones).toBe(0);
    expect(vacia.numeroTexto).toBe("—");
    expect(vacia.evaluable).toBe(true);
  });

  it("un día con varias sesiones cuenta como 1 día entrenado pero N sesiones", () => {
    const a = armarAdherencia([ses("2026-10-06"), ses("2026-10-06")], HOY, 3, "2026-01-01T12:00:00Z");
    const pasada = a.semanas[50]!;
    expect(pasada.sesiones).toBe(2);
    expect(pasada.dias.filter((d) => d.estado === "entreno")).toHaveLength(1);
    const dia = pasada.dias.find((d) => d.fecha === "2026-10-06")!;
    expect(dia.title).toContain("2 sesiones");
  });
});

describe("armarAdherencia — primera sesión reciente (spec §5.8)", () => {
  it("primera sesión hace 10 semanas: las semanas previas son '…' y no se evalúan", () => {
    const primera = addDays(LUNES_ACTUAL, -7 * 10); // lunes de hace 10 semanas
    const a = armarAdherencia([ses(primera)], HOY, 3, `${primera}T12:00:00Z`);
    const previas = a.semanas.filter((w) => w.antesPrimera);
    expect(previas.length).toBeGreaterThanOrEqual(41); // ~42 semanas anteriores
    expect(previas.every((w) => w.numeroTexto === "…")).toBe(true);
    expect(previas.every((w) => w.evaluable === false)).toBe(true);
    // las evaluables son solo las posteriores (<= 11, no 52)
    expect(a.semanasEvaluadas).toBeLessThanOrEqual(11);
  });
});

describe("armarAdherencia — promedio y semanas cumplidas (spec §5.5)", () => {
  it("promedio de las últimas 12 semanas completas, excluyendo la actual", () => {
    const sesiones: SesionAdherencia[] = [];
    for (let w = 1; w <= 12; w++) {
      const base = addDays(LUNES_ACTUAL, -7 * w);
      sesiones.push(ses(base), ses(addDays(base, 1)), ses(addDays(base, 2))); // 3 por semana
    }
    // ruido en la semana actual: no debe afectar el promedio de 12 completas.
    sesiones.push(ses(LUNES_ACTUAL));
    const primera = addDays(LUNES_ACTUAL, -7 * 12);
    const a = armarAdherencia(sesiones, HOY, 3, `${primera}T12:00:00Z`);
    expect(a.promedio12).toBeCloseTo(3.0, 5);
    expect(formatearPromedio(a.promedio12)).toBe("3,0");
    expect(a.semanasCumplidas).toBe(12);
    expect(a.semanasEvaluadas).toBe(12);
  });

  it("sin objetivo (sin plan activo): no se evalúan semanas ni se marca cumplimiento", () => {
    const a = armarAdherencia([ses("2026-10-06"), ses("2026-10-08")], HOY, null, "2026-01-01T12:00:00Z");
    expect(a.objetivo).toBeNull();
    expect(a.semanasCumplidas).toBeNull();
    expect(a.semanas.every((w) => w.evaluable === false)).toBe(true);
    expect(a.ariaLabel).not.toContain("objetivo");
  });
});

describe("armarAdherencia — días sin entrenar", () => {
  it("cuenta los días calendario desde la última sesión", () => {
    const a = armarAdherencia([ses("2026-10-06")], HOY, 3, "2026-01-01T12:00:00Z"); // hace 9 días
    expect(a.diasSinEntrenar).toBe(9);
    expect(a.nuncaEntreno).toBe(false);
  });

  it("entrenó hoy → 0 días", () => {
    const a = armarAdherencia([ses("2026-10-15")], HOY, 3, "2026-01-01T12:00:00Z");
    expect(a.diasSinEntrenar).toBe(0);
  });

  it("nunca entrenó (sin primera sesión): sin número de días", () => {
    const a = armarAdherencia([], HOY, 3, null);
    expect(a.nuncaEntreno).toBe(true);
    expect(a.diasSinEntrenar).toBeNull();
  });
});

describe("badgeAdherencia (spec §5.5)", () => {
  it("mapea días → texto y variante", () => {
    expect(badgeAdherencia(null, true)).toMatchObject({ texto: "Nunca entrenó", variante: "secondary" });
    expect(badgeAdherencia(0, false)).toMatchObject({ texto: "Entrenó hoy", variante: "outline", entrenoHoy: true });
    expect(badgeAdherencia(1, false)).toMatchObject({ texto: "1 día sin entrenar", variante: "outline" });
    expect(badgeAdherencia(5, false)).toMatchObject({ texto: "5 días sin entrenar", variante: "outline" });
    expect(badgeAdherencia(9, false)).toMatchObject({ texto: "9 días sin entrenar", variante: "destructive" });
  });
});
