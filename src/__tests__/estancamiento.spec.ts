import { describe, expect, it } from "vitest";
import { diasSinPR, estaEstancado, fechasDePR } from "@/lib/estancamiento";
import type { SerieHistorica } from "@/lib/historial-ejercicio";

const AHORA = Date.parse("2026-10-28T12:00:00Z");
const hace = (dias: number) => new Date(AHORA - dias * 86_400_000).toISOString();
let n = 0;
const serie = (dias: number, peso_kg: number, reps_hechas: number, ejercicio_id = "e1"): SerieHistorica => ({
  ejercicio_id,
  sesion_id: `s${dias}`,
  fecha: hace(dias),
  numero_serie: ++n,
  peso_kg,
  reps_hechas,
  rpe_real: null,
  completada: true,
});

describe("regla de PR (GOZS-226)", () => {
  it("más kilos es PR", () => {
    expect(fechasDePR([serie(10, 40, 5), serie(5, 45, 3)])).toEqual([hace(5)]);
  });
  it("mismo peso con más reps es PR (40×1 → 40×2)", () => {
    expect(fechasDePR([serie(10, 40, 1), serie(5, 40, 2)])).toEqual([hace(5)]);
  });
  it("mismo peso y mismas reps, o menos, no es PR", () => {
    expect(fechasDePR([serie(10, 40, 2), serie(5, 40, 2), serie(3, 40, 1)])).toEqual([]);
  });
  it("la primera vez con un ejercicio no es PR", () => {
    expect(fechasDePR([serie(5, 40, 2)])).toEqual([]);
  });
});

describe("alerta de estancamiento (GOZS-226)", () => {
  it("entrenó en 30 días sin PR con más de 30 días de datos → estancado", () => {
    expect(estaEstancado([serie(60, 50, 5), serie(10, 40, 5)], AHORA)).toBe(true);
  });
  it("con un PR en los últimos 30 días no está estancado", () => {
    expect(estaEstancado([serie(60, 50, 5), serie(10, 55, 5)], AHORA)).toBe(false);
  });
  it("un PR en otro ejercicio también lo saca de la alerta", () => {
    const s = [serie(60, 50, 5), serie(10, 40, 5), serie(50, 20, 8, "e2"), serie(5, 25, 8, "e2")];
    expect(estaEstancado(s, AHORA)).toBe(false);
  });
  it("no entrenó en los últimos 30 días → no aparece", () => {
    expect(estaEstancado([serie(90, 50, 5), serie(40, 40, 5)], AHORA)).toBe(false);
  });
  it("menos de 30 días de datos → no aparece", () => {
    expect(estaEstancado([serie(20, 50, 5), serie(10, 40, 5)], AHORA)).toBe(false);
  });
  it("sin series → no aparece", () => {
    expect(estaEstancado([], AHORA)).toBe(false);
  });
});

describe("días sin PR (GOZS-241)", () => {
  it("cuenta desde el último PR", () => {
    expect(diasSinPR([serie(60, 50, 5), serie(45, 55, 5), serie(10, 40, 5)], AHORA)).toBe(45);
  });
  it("sin PR cuenta desde la primera serie", () => {
    expect(diasSinPR([serie(60, 50, 5), serie(10, 40, 5)], AHORA)).toBe(60);
  });
});
