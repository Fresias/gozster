import { describe, expect, it } from "vitest";
import {
  normalizarRpeReal,
  toRegistroSerieRow,
  toRegistroSeriePartialUpdateRow,
} from "@/lib/athlete/registro-series-mapper";

// GOZS-884 (Ola B): mapeador único de filas de registro_series.
describe("GOZS-884 · registro-series-mapper", () => {
  it.each([
    [8, 8],
    [1, 1],
    [10, 10],
    [0, null],
    [11, null],
    [Number.NaN, null],
    [null, null],
    [undefined, null],
  ])("normalizarRpeReal(%s) → %s", (entrada, esperado) => {
    expect(normalizarRpeReal(entrada as number | null | undefined)).toBe(esperado);
  });

  it("toRegistroSerieRow arma la fila completa con tipo normalizado y dolor/video", () => {
    expect(
      toRegistroSerieRow({
        sesionId: "s1",
        ejercicioId: "e1",
        numeroSerie: 2,
        pesoKg: 80,
        reps: 6,
        rpe: 9,
        setType: "W",
        painReported: true,
        painNotes: "rodilla",
        videoUrl: "https://video",
      }),
    ).toEqual({
      sesion_id: "s1",
      ejercicio_id: "e1",
      numero_serie: 2,
      peso_kg: 80,
      reps_hechas: 6,
      rpe_real: 9,
      completada: true,
      set_type: "WARMUP",
      pain_reported: true,
      pain_notes: "rodilla",
      video_url: "https://video",
    });
  });

  it("toRegistroSerieRow aplica defaults seguros (RPE inválido, sin tipo, sin dolor ni video)", () => {
    expect(
      toRegistroSerieRow({ sesionId: "s1", ejercicioId: "e1", numeroSerie: 1, pesoKg: 50, reps: 8, rpe: 15 }),
    ).toEqual({
      sesion_id: "s1",
      ejercicio_id: "e1",
      numero_serie: 1,
      peso_kg: 50,
      reps_hechas: 8,
      rpe_real: null,
      completada: true,
      set_type: "NORMAL",
      pain_reported: false,
      pain_notes: null,
      video_url: null,
    });
  });

  it("toRegistroSeriePartialUpdateRow solo lleva la clave y peso/reps (no pisa rpe, tipo, dolor ni video)", () => {
    const row = toRegistroSeriePartialUpdateRow({
      sesionId: "s1",
      ejercicioId: "e1",
      numeroSerie: 3,
      pesoKg: 90,
      reps: 4,
    });
    expect(row).toEqual({ sesion_id: "s1", ejercicio_id: "e1", numero_serie: 3, peso_kg: 90, reps_hechas: 4 });
    expect(Object.keys(row)).not.toContain("rpe_real");
    expect(Object.keys(row)).not.toContain("completada");
  });
});
