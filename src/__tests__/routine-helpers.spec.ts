import { describe, expect, it } from "vitest";
import {
  parseDefaultReps,
  isWarmupExercise,
  sortExercisesWithWarmupFirst,
  clampSeries,
  MAX_SERIES_PER_EXERCISE,
  MIN_SERIES_PER_EXERCISE,
} from "@/lib/routine-helpers";

describe("routine-helpers (Ponytail & Karpathy)", () => {
  describe("parseDefaultReps", () => {
    it("parsea series descendentes con guión", () => {
      expect(parseDefaultReps("10-8-6", 1)).toBe(10);
      expect(parseDefaultReps("10-8-6", 2)).toBe(8);
      expect(parseDefaultReps("10-8-6", 3)).toBe(6);
      expect(parseDefaultReps("10-8-6", 4)).toBe(6); // cap at last element
    });

    it("parsea rangos como '4 a 6' o '8-10'", () => {
      expect(parseDefaultReps("4 a 6", 1)).toBe(4);
      expect(parseDefaultReps("8-10", 1)).toBe(8);
    });

    it("parsea segundos e isométricos como '15'' x lado'", () => {
      expect(parseDefaultReps("15'' x lado", 1)).toBe(15);
    });

    it("devuelve 10 por defecto ante strings vacíos o no numéricos", () => {
      expect(parseDefaultReps("", 1)).toBe(10);
      expect(parseDefaultReps(undefined, 1)).toBe(10);
      expect(parseDefaultReps("DROP-SET", 1)).toBe(10);
    });
  });

  describe("isWarmupExercise", () => {
    it("detecta warm up, calentamiento y entrada en calor", () => {
      expect(isWarmupExercise("Sentadilla isométrica unilateral (Warm up)")).toBe(true);
      expect(isWarmupExercise("Calentamiento de manguito rotador")).toBe(true);
      expect(isWarmupExercise("Entrada en calor con banda")).toBe(true);
      expect(isWarmupExercise("Press de Banca Plano")).toBe(false);
    });
  });

  describe("sortExercisesWithWarmupFirst", () => {
    it("ordena poniendo los ejercicios de entrada en calor al principio", () => {
      const list = [
        { nombre: "Sentadilla Trasera con Barra" },
        { nombre: "Press de Banca Plano" },
        { nombre: "Sentadilla isométrica unilateral (Warm up)" },
        { nombre: "Press Inclinado" },
      ];

      const sorted = sortExercisesWithWarmupFirst(list);
      expect(sorted[0]!.nombre).toBe("Sentadilla isométrica unilateral (Warm up)");
      expect(sorted[1]!.nombre).toBe("Sentadilla Trasera con Barra");
      expect(sorted[2]!.nombre).toBe("Press de Banca Plano");
      expect(sorted[3]!.nombre).toBe("Press Inclinado");
    });
  });

  describe("clampSeries (D-R6)", () => {
    it("limita 9999 al máximo permitido de 10 series", () => {
      expect(clampSeries(9999)).toBe(MAX_SERIES_PER_EXERCISE);
      expect(clampSeries("9999")).toBe(10);
    });

    it("rechaza o limita valores por debajo del mínimo (<= 0 o negativos) a 1", () => {
      expect(clampSeries(0)).toBe(MIN_SERIES_PER_EXERCISE);
      expect(clampSeries(-5)).toBe(MIN_SERIES_PER_EXERCISE);
      expect(clampSeries("-10")).toBe(1);
    });

    it("maneja valores vacíos o no numéricos retornando 1", () => {
      expect(clampSeries("")).toBe(1);
      expect(clampSeries(undefined)).toBe(1);
      expect(clampSeries(null)).toBe(1);
      expect(clampSeries("abc")).toBe(1);
    });

    it("preserva valores válidos dentro del rango fisiológico [1, 10]", () => {
      expect(clampSeries(1)).toBe(1);
      expect(clampSeries(3)).toBe(3);
      expect(clampSeries(5)).toBe(5);
      expect(clampSeries(10)).toBe(10);
      expect(clampSeries("4")).toBe(4);
    });

    it("trunca números decimales a enteros válidos", () => {
      expect(clampSeries(3.7)).toBe(3);
      expect(clampSeries("4.2")).toBe(4);
    });
  });
});
