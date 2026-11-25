import { describe, it, expect, vi, afterEach } from "vitest";
import { estimarDuracionDiaMinutos } from "@/lib/athlete-dias";
import { sugerirCarga, cumpleMadurezSugerencia, SEMANAS_MINIMAS_SUGERENCIA } from "@/lib/sugerencia-carga";
import { calcularPorcentajeCumplimiento } from "@/lib/mi-progreso";
import { descripcionRpe } from "@/lib/rpe-texto";

describe("GOZS-830 F1 · duración estimada", () => {
  it("0 sin ejercicios y múltiplo de 5 determinístico", () => {
    expect(estimarDuracionDiaMinutos([])).toBe(0);
    const ej = [
      { series: 4, descanso_segundos: 120 },
      { series: 3, descanso_segundos: 60 },
      { series: 3, descanso_segundos: 0 },
    ];
    const m = estimarDuracionDiaMinutos(ej);
    expect(m % 5).toBe(0);
    expect(estimarDuracionDiaMinutos(ej)).toBe(m);
    expect(m).not.toBe(ej.length * 8 + 5);
  });
  it("superserie: el descanso aplica por ronda", () => {
    const separados = estimarDuracionDiaMinutos([
      { series: 4, descanso_segundos: 90 },
      { series: 4, descanso_segundos: 90 },
    ]);
    const superserie = estimarDuracionDiaMinutos([
      { series: 4, descanso_segundos: 90, es_superserie: true, grupo_superserie: 1 },
      { series: 4, descanso_segundos: 90, es_superserie: true, grupo_superserie: 1 },
    ]);
    expect(superserie).toBeLessThan(separados);
  });
});

describe("GOZS-830 F1 · sugerencia ≥ 3 semanas", () => {
  const hoy = new Date("2026-11-25T12:00:00Z");
  const ultima = (primera: string) => ({
    ejercicio_id: "e",
    fecha: "2026-11-20T12:00:00Z",
    primera_fecha: primera,
    series: [{ numero_serie: 1, peso_kg: 80, reps_hechas: 8, rpe_real: null }],
  });
  const pres = { numeroSerie: 1, repeticionesObjetivo: "8", seriesPrescriptas: 1, musculosPrincipales: null };
  it("null con < 3 semanas; sugiere con ≥ 3", () => {
    expect(SEMANAS_MINIMAS_SUGERENCIA).toBe(3);
    expect(sugerirCarga(ultima("2026-11-10T12:00:00Z"), pres, hoy)).toBeNull();
    expect(sugerirCarga(ultima("2026-11-04T12:00:00Z"), pres, hoy)?.tipo).toBe("subir");
    expect(cumpleMadurezSugerencia(undefined, hoy)).toBe(false);
  });
});

describe("GOZS-830 F1 · % cumplimiento", () => {
  it("acota y evita NaN", () => {
    expect(calcularPorcentajeCumplimiento(2, 4)).toEqual({ porcentaje: 50, completadas: 2, esperadas: 4 });
    expect(calcularPorcentajeCumplimiento(9, 4).porcentaje).toBe(100);
    expect(calcularPorcentajeCumplimiento(2, null).porcentaje).toBeNull();
    expect(calcularPorcentajeCumplimiento(2, 0).porcentaje).toBeNull();
    expect(calcularPorcentajeCumplimiento(NaN, 3).porcentaje).toBe(0);
  });
});

describe("GOZS-830 F1 · texto RPE", () => {
  it("cubre 1–10 y medios puntos", () => {
    expect(descripcionRpe(1)).toContain("Muy suave");
    expect(descripcionRpe(4)).toContain("Suave");
    expect(descripcionRpe(6)).toContain("Moderado");
    expect(descripcionRpe(7)).toContain("3 más");
    expect(descripcionRpe(8)).toContain("2 más");
    expect(descripcionRpe(9)).toContain("1 más");
    expect(descripcionRpe(10)).toContain("ninguna más");
    expect(descripcionRpe(8.5)).toContain("Exigente");
    expect(descripcionRpe(null)).toContain("RPE");
  });
});

describe("GOZS-830 F1 · useWakeLock", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sin API o con request rechazado no lanza", async () => {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { useWakeLock } = await import("@/hooks/use-wake-lock");
    function C() {
      useWakeLock(true);
      return null;
    }
    expect(() => renderToStaticMarkup(React.createElement(C))).not.toThrow();
    vi.stubGlobal("navigator", { wakeLock: { request: vi.fn().mockRejectedValue(new Error("x")) } });
    expect(() => renderToStaticMarkup(React.createElement(C))).not.toThrow();
  });
});
