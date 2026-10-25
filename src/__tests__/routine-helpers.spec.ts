import { describe, expect, it } from "vitest";
import {
  parseDefaultReps,
  isWarmupExercise,
  sortExercisesWithWarmupFirst,
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
});
