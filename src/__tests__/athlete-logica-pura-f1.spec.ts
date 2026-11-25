import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { estimarDuracionDiaMinutos } from "@/lib/athlete-dias";
import { calcularCumplimientoMes, type SesionHistorica } from "@/lib/mi-progreso";
import { formatearObjetivoSerie } from "@/components/athlete/ejercicio-activo";

const leer = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("estimarDuracionDiaMinutos", () => {
  it("5 ejercicios × 3 series × 90 s: suma series, descansos y transiciones (múltiplo de 5)", () => {
    const ej = Array.from({ length: 5 }, () => ({ series: 3, descanso_segundos: 90 }));
    // por ejercicio: 3×35 + 2×90 + 60 = 345 s → 1725 s = 28,75 min → 30
    expect(estimarDuracionDiaMinutos(ej)).toBe(30);
  });

  it("depende de series y descanso, no sólo de la cantidad de ejercicios", () => {
    const corto = estimarDuracionDiaMinutos(Array.from({ length: 5 }, () => ({ series: 2, descanso_segundos: 45 })));
    const largo = estimarDuracionDiaMinutos(Array.from({ length: 5 }, () => ({ series: 5, descanso_segundos: 180 })));
    expect(largo).toBeGreaterThan(corto);
    expect(corto % 5).toBe(0);
    expect(largo % 5).toBe(0);
  });

  it("sin detalle de ejercicios cae a un estimado por cantidad, o 0 si no hay nada", () => {
    expect(estimarDuracionDiaMinutos([], 5)).toBe(40);
    expect(estimarDuracionDiaMinutos(null, 0)).toBe(0);
  });

  it("series o descanso nulos usan valores por defecto", () => {
    expect(estimarDuracionDiaMinutos([{ series: null, descanso_segundos: null }])).toBeGreaterThanOrEqual(5);
  });
});

describe("calcularCumplimientoMes", () => {
  const ses = (fecha: string, i: number): SesionHistorica => ({ id: `s${i}`, fecha });
  const hoy = new Date("2026-11-15T15:00:00Z"); // 15 de noviembre

  it("sesiones hechas / esperadas hasta hoy (3 días por semana)", () => {
    // esperadas = 3 × 15 / 7 ≈ 6,43; 6 hechas → 93 %
    const sesiones = Array.from({ length: 6 }, (_, i) => ses(`2026-11-0${i + 1}T13:00:00Z`, i));
    expect(calcularCumplimientoMes(sesiones, 3, hoy)).toBe(93);
  });

  it("no cuenta sesiones de otro mes y se topa en 100", () => {
    const sesiones = [
      ses("2026-10-30T13:00:00Z", 0),
      ...Array.from({ length: 12 }, (_, i) => ses(`2026-11-${String(i + 1).padStart(2, "0")}T13:00:00Z`, i + 1)),
    ];
    expect(calcularCumplimientoMes(sesiones, 3, hoy)).toBe(100);
    expect(calcularCumplimientoMes([ses("2026-10-30T13:00:00Z", 0)], 3, hoy)).toBe(0);
  });

  it("sin plan (0 días por semana) devuelve 0", () => {
    expect(calcularCumplimientoMes([ses("2026-11-02T13:00:00Z", 1)], 0, hoy)).toBe(0);
  });
});

describe("formatearObjetivoSerie (sin OBJ. numérico)", () => {
  const f = (repeticionesObjetivo: string, extra: Partial<Parameters<typeof formatearObjetivoSerie>[0]> = {}) =>
    formatearObjetivoSerie({ repeticionesObjetivo, esTiempo: false, tiempoSegundos: 0, esUnilateral: false, ...extra });

  it("oculta números y rangos", () => {
    expect(f("8")).toBe("");
    expect(f("8-12")).toBe("");
    expect(f("8/12")).toBe("");
  });

  it("mantiene AL FALLO, DROP-SET y tiempo", () => {
    expect(f("AL FALLO")).toBe("OBJ. AL FALLO");
    expect(f("DROP-SET")).toBe("OBJ. DROP-SET");
    expect(f("45s", { esTiempo: true, tiempoSegundos: 45 })).toBe("OBJ. 45 S");
  });
});

describe("ejercicio-activo y use-live-workout (fuente)", () => {
  const activo = leer("../components/athlete/ejercicio-activo.tsx");
  const hook = leer("../components/athlete/use-live-workout.ts");

  it("WakeLock sigue pidiéndose pero sin chip 'Pantalla activa'", () => {
    expect(activo).toContain('wl.request("screen")');
    expect(activo).not.toContain("Pantalla activa");
    expect(activo).not.toContain("chip-pantalla-activa");
  });

  it("textoRpe habla de esfuerzo percibido y no de RIR", () => {
    expect(activo).toContain("esfuerzo percibido del 1 al 10");
    expect(activo).not.toMatch(/RIR|podías hacer \$\{r\}/);
  });

  it("copia automática: la serie N+1 hereda la serie N y el botón manual desaparece", () => {
    expect(activo).not.toContain("igual-que-anterior-btn");
    expect(hook).toContain("serieAnteriorHoy?.peso_kg ?? refUltimaActual?.peso_kg");
    expect(hook).toContain("seriesTocadas.current.has(claveSerie)");
  });
});
