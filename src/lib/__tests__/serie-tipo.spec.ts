import { describe, expect, it } from "vitest";
import {
  isDropset,
  isWarmup,
  isWorkingSet,
  normalizeSerieTipo,
  type SerieTipo,
} from "../serie-tipo";

describe("serie-tipo: normalización y vocabulario único", () => {
  describe("normalizeSerieTipo - tabla de entradas canónicas y variantes", () => {
    const casos: Array<[string | null | undefined, SerieTipo]> = [
      ["W", "WARMUP"],
      ["WARMUP", "WARMUP"],
      ["w", "WARMUP"],
      ["warmup", "WARMUP"],
      [" WARMUP ", "WARMUP"],
      ["D", "DROPSET"],
      ["DROPSET", "DROPSET"],
      ["d", "DROPSET"],
      ["dropset", "DROPSET"],
      [" DROPSET ", "DROPSET"],
      ["N", "NORMAL"],
      ["NORMAL", "NORMAL"],
      ["n", "NORMAL"],
      ["normal", "NORMAL"],
      [" NORMAL ", "NORMAL"],
      [null, "NORMAL"],
      [undefined, "NORMAL"],
      ["", "NORMAL"],
      ["   ", "NORMAL"],
      ["DESCONOCIDO", "NORMAL"],
    ];

    it.each(casos)(
      "normalizeSerieTipo(%j) -> %s",
      (input, expected) => {
        expect(normalizeSerieTipo(input)).toBe(expected);
      },
    );
  });

  describe("predicados booleanos de dominio", () => {
    it("isWarmup es true solo para variantes de calentamiento", () => {
      expect(isWarmup("W")).toBe(true);
      expect(isWarmup("WARMUP")).toBe(true);
      expect(isWarmup("w")).toBe(true);
      expect(isWarmup("warmup")).toBe(true);

      expect(isWarmup("N")).toBe(false);
      expect(isWarmup("NORMAL")).toBe(false);
      expect(isWarmup("D")).toBe(false);
      expect(isWarmup("DROPSET")).toBe(false);
      expect(isWarmup(null)).toBe(false);
      expect(isWarmup(undefined)).toBe(false);
      expect(isWarmup("")).toBe(false);
    });

    it("isDropset es true solo para variantes de dropset", () => {
      expect(isDropset("D")).toBe(true);
      expect(isDropset("DROPSET")).toBe(true);
      expect(isDropset("d")).toBe(true);
      expect(isDropset("dropset")).toBe(true);

      expect(isDropset("W")).toBe(false);
      expect(isDropset("WARMUP")).toBe(false);
      expect(isDropset("N")).toBe(false);
      expect(isDropset("NORMAL")).toBe(false);
      expect(isDropset(null)).toBe(false);
      expect(isDropset(undefined)).toBe(false);
      expect(isDropset("")).toBe(false);
    });

    it("isWorkingSet es true para toda serie que no sea de calentamiento (incluye NORMAL y DROPSET)", () => {
      expect(isWorkingSet("NORMAL")).toBe(true);
      expect(isWorkingSet("N")).toBe(true);
      expect(isWorkingSet("DROPSET")).toBe(true);
      expect(isWorkingSet("D")).toBe(true);
      expect(isWorkingSet(null)).toBe(true);
      expect(isWorkingSet(undefined)).toBe(true);
      expect(isWorkingSet("")).toBe(true);

      expect(isWorkingSet("W")).toBe(false);
      expect(isWorkingSet("WARMUP")).toBe(false);
      expect(isWorkingSet("w")).toBe(false);
      expect(isWorkingSet("warmup")).toBe(false);
    });
  });

  describe("snapshot de contadores de serie efectiva y volumen sobre fixture de sesión", () => {
    interface FixtureSerie {
      numero_serie: number;
      peso_kg: number;
      reps_hechas: number;
      set_type: string | null | undefined;
      completada: boolean;
    }

    const fixtureSesion: FixtureSerie[] = [
      { numero_serie: 1, peso_kg: 20, reps_hechas: 10, set_type: "W", completada: true },
      { numero_serie: 2, peso_kg: 50, reps_hechas: 5, set_type: "WARMUP", completada: true },
      { numero_serie: 3, peso_kg: 100, reps_hechas: 8, set_type: "NORMAL", completada: true },
      { numero_serie: 4, peso_kg: 100, reps_hechas: 6, set_type: "N", completada: true },
      { numero_serie: 5, peso_kg: 85, reps_hechas: 8, set_type: "DROPSET", completada: true },
      { numero_serie: 6, peso_kg: 70, reps_hechas: 10, set_type: "D", completada: true },
      { numero_serie: 7, peso_kg: 100, reps_hechas: 5, set_type: "NORMAL", completada: false },
      { numero_serie: 8, peso_kg: 60, reps_hechas: 10, set_type: null, completada: true },
      { numero_serie: 9, peso_kg: 60, reps_hechas: 10, set_type: undefined, completada: true },
    ];

    it("fija métricas de conteo y tonelaje efectivo idénticas al comportamiento pre-refactor", () => {
      const seriesEfectivas = fixtureSesion.filter(
        (s) => isWorkingSet(s.set_type) && s.completada,
      );
      const seriesCalentamiento = fixtureSesion.filter(
        (s) => isWarmup(s.set_type) && s.completada,
      );
      const seriesDropset = fixtureSesion.filter(
        (s) => isDropset(s.set_type) && s.completada,
      );

      const volumenEfectivo = seriesEfectivas.reduce(
        (acc, s) => acc + s.peso_kg * s.reps_hechas,
        0,
      );
      const volumenCalentamiento = seriesCalentamiento.reduce(
        (acc, s) => acc + s.peso_kg * s.reps_hechas,
        0,
      );

      const resultado = {
        totalSeries: fixtureSesion.length,
        efectivasCount: seriesEfectivas.length,
        calentamientoCount: seriesCalentamiento.length,
        dropsetCount: seriesDropset.length,
        volumenEfectivoKg: volumenEfectivo,
        volumenCalentamientoKg: volumenCalentamiento,
      };

      expect(resultado).toMatchInlineSnapshot(`
        {
          "calentamientoCount": 2,
          "dropsetCount": 2,
          "efectivasCount": 6,
          "totalSeries": 9,
          "volumenCalentamientoKg": 450,
          "volumenEfectivoKg": 3980,
        }
      `);
    });
  });
});
