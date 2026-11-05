import { describe, expect, it } from "vitest";
import {
  parseDefaultReps,
  parseRepRange,
  parsePyramidSeriesCount,
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

    it("interpreta secuencia piramidal '10-8-6-4'", () => {
      expect(parseDefaultReps("10-8-6-4", 1)).toBe(10);
      expect(parseDefaultReps("10-8-6-4", 2)).toBe(8);
      expect(parseDefaultReps("10-8-6-4", 3)).toBe(6);
      expect(parseDefaultReps("10-8-6-4", 4)).toBe(4);
    });

    it("interpreta notación de rango con barra '8/12' retornando el target máximo (12)", () => {
      expect(parseDefaultReps("8/12", 1)).toBe(12);
      expect(parseDefaultReps("10/12", 1)).toBe(12);
    });

    it("soporta variantes con espacios tipo '8 / 12' y '10/15' retornando el máximo (GOZS-364)", () => {
      expect(parseDefaultReps("8 / 12", 1)).toBe(12);
      expect(parseDefaultReps("8/ 12", 1)).toBe(12);
      expect(parseDefaultReps("8 /12", 1)).toBe(12);
      expect(parseDefaultReps("10/15", 1)).toBe(15);
      expect(parseDefaultReps("10 / 15", 1)).toBe(15);
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

  describe("parseRepRange (GOZS-360)", () => {
    it("reconoce notación con barra '8/12' con mínimo 8 y máximo 12", () => {
      const res = parseRepRange("8/12");
      expect(res).not.toBeNull();
      expect(res?.isRange).toBe(true);
      expect(res?.min).toBe(8);
      expect(res?.max).toBe(12);
    });

    it("reconoce '10/12' ordenando mínimo y máximo correctamente", () => {
      const res = parseRepRange("10/12");
      expect(res).toEqual({ isRange: true, min: 10, max: 12 });
    });

    it("soporta variantes limpias tipo '8 / 12', '8/ 12', '8 /12' y '10/15' (GOZS-364)", () => {
      expect(parseRepRange("8 / 12")).toEqual({ isRange: true, min: 8, max: 12 });
      expect(parseRepRange("8/ 12")).toEqual({ isRange: true, min: 8, max: 12 });
      expect(parseRepRange("8 /12")).toEqual({ isRange: true, min: 8, max: 12 });
      expect(parseRepRange("10/15")).toEqual({ isRange: true, min: 10, max: 15 });
    });

    it("retorna null para formatos sin barra o no numéricos", () => {
      expect(parseRepRange("10")).toBeNull();
      expect(parseRepRange("10-8-6")).toBeNull();
      expect(parseRepRange("")).toBeNull();
      expect(parseRepRange(undefined)).toBeNull();
    });
  });

  describe("parsePyramidSeriesCount (GOZS-360)", () => {
    it("determina la cantidad de series para secuencias con guión '10-8-6-4'", () => {
      expect(parsePyramidSeriesCount("10-8-6-4")).toBe(4);
      expect(parsePyramidSeriesCount("12-10-8-6-4")).toBe(5);
      expect(parsePyramidSeriesCount("12-10")).toBe(2);
    });

    it("rechaza espacios '10 8 6 4' retornando null", () => {
      expect(parsePyramidSeriesCount("10 8 6 4")).toBeNull();
      expect(parsePyramidSeriesCount("10 - 8 - 6")).toBeNull();
    });

    it("no interpreta un número simple como piramidal", () => {
      expect(parsePyramidSeriesCount("10")).toBeNull();
      expect(parsePyramidSeriesCount("")).toBeNull();
      expect(parsePyramidSeriesCount(undefined)).toBeNull();
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
