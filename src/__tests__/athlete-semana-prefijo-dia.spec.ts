import { describe, it, expect } from "vitest";
import { calcularSemanaPlan, etiquetaDia } from "@/lib/athlete-dias";

describe("calcularSemanaPlan", () => {
  it("plan asignado hoy es semana 1", () => {
    expect(calcularSemanaPlan("2026-10-30", null, new Date(2026, 9, 30)).actual).toBe(1);
  });
  it("calcula semana y total reales", () => {
    expect(calcularSemanaPlan("2026-10-01", "2026-11-25", new Date(2026, 9, 30))).toEqual({ actual: 5, total: 8 });
  });
  it("no supera el total", () => {
    expect(calcularSemanaPlan("2026-01-01", "2026-01-28", new Date(2026, 9, 30)).actual).toBe(4);
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
