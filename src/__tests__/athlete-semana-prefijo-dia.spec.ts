import { describe, it, expect } from "vitest";
import {
  calcularRachaSemanas,
  calcularSemanaPlan,
  etiquetaDia,
  obtenerUltimaFechaEntreno,
} from "@/lib/athlete-dias";

describe("calcularSemanaPlan", () => {
  it("plan asignado hoy (días 0–6) es semana 1 y día 7 pasa a semana 2", () => {
    expect(calcularSemanaPlan("2026-10-30", null, new Date(2026, 9, 30)).actual).toBe(1);
    expect(calcularSemanaPlan("2026-10-30", null, new Date(2026, 10, 5)).actual).toBe(1);
    expect(calcularSemanaPlan("2026-10-30", null, new Date(2026, 10, 6)).actual).toBe(2);
    expect(calcularSemanaPlan("2026-10-30", null, new Date(2026, 10, 12)).actual).toBe(2);
    expect(calcularSemanaPlan("2026-10-30", null, new Date(2026, 10, 13)).actual).toBe(3);
  });
  it("calcula semana y total reales", () => {
    expect(calcularSemanaPlan("2026-10-01", "2026-11-25", new Date(2026, 9, 30))).toEqual({ actual: 5, total: 8 });
  });
  it("no aplica tope artificial por fecha_fin cuando continúa el plan", () => {
    expect(calcularSemanaPlan("2026-01-01", "2026-01-28", new Date(2026, 9, 30)).actual).toBe(44);
  });
});

describe("calcularRachaSemanas y obtenerUltimaFechaEntreno", () => {
  it("devuelve 0 sin sesiones o con racha cortada", () => {
    const hoy = new Date("2026-11-20T12:00:00-03:00");
    expect(calcularRachaSemanas([], hoy)).toBe(0);
    expect(calcularRachaSemanas(["2026-10-01T10:00:00-03:00"], hoy)).toBe(0);
  });

  it("cuenta semanas consecutivas desde la semana actual o la anterior", () => {
    const hoy = new Date("2026-11-20T12:00:00-03:00"); // viernes semana 2026-11-16
    expect(
      calcularRachaSemanas(
        [
          "2026-11-18T10:00:00-03:00", // esta semana
          "2026-11-11T10:00:00-03:00", // semana pasada
          "2026-11-04T10:00:00-03:00", // hace 2 semanas
          "2026-10-15T10:00:00-03:00", // hueco previo
        ],
        hoy,
      ),
    ).toBe(3);

    // Si aún no entrenó esta semana, conserva la racha vigente desde la semana anterior
    expect(
      calcularRachaSemanas(
        ["2026-11-11T10:00:00-03:00", "2026-11-04T10:00:00-03:00"],
        hoy,
      ),
    ).toBe(2);
  });

  it("selecciona la fecha de entrenamiento más reciente", () => {
    expect(obtenerUltimaFechaEntreno([null, undefined])).toBeNull();
    expect(
      obtenerUltimaFechaEntreno([
        "2026-11-10T10:00:00Z",
        "2026-11-19T18:00:00Z",
        "2026-11-15T12:00:00Z",
      ]),
    ).toBe("2026-11-19T18:00:00Z");
  });
});

describe("etiquetaDia", () => {
  it("no duplica el prefijo si el nombre ya trae 'Día N:'", () => {
    expect(etiquetaDia({ orden: 1, nombre: "Día 1: Torso Pesado" })).toBe("Día 1: Torso Pesado");
  });
  it("antepone el prefijo si no lo trae", () => {
    expect(etiquetaDia({ orden: 2, nombre: "Piernas" })).toBe("Día 2 · Piernas");
  });
});
