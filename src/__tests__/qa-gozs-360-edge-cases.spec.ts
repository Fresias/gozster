import { describe, it, expect } from "vitest";
import {
  parseDefaultReps,
  parseRepRange,
  parsePyramidSeriesCount,
} from "@/lib/routine-helpers";
import { repsValidas, validarRutina, claveEjercicio } from "@/lib/validar-rutina";
import {
  buildGuardarRutinaPayload,
  TAGS_RUTINA_PREDEFINIDAS,
} from "@/components/coach/routine-builder/routine-builder-modal";

describe("QA Edge Cases Suite — GOZS-360 Routine Builder & Athlete App", () => {
  describe("1. parseRepRange Edge Cases", () => {
    it("parses valid ranges regardless of spacing around string", () => {
      expect(parseRepRange("8/12")).toEqual({ isRange: true, min: 8, max: 12 });
      expect(parseRepRange(" 8/12 ")).toEqual({ isRange: true, min: 8, max: 12 });
      expect(parseRepRange("10/12")).toEqual({ isRange: true, min: 10, max: 12 });
    });

    it("handles equal min and max", () => {
      expect(parseRepRange("10/10")).toEqual({ isRange: true, min: 10, max: 10 });
    });

    it("orders min and max correctly even if inverted in input", () => {
      expect(parseRepRange("12/8")).toEqual({ isRange: true, min: 8, max: 12 });
    });

    it("supports clean spacing variants in range (GOZS-364)", () => {
      expect(parseRepRange("8 / 12")).toEqual({ isRange: true, min: 8, max: 12 });
      expect(parseRepRange("8/ 12")).toEqual({ isRange: true, min: 8, max: 12 });
      expect(parseRepRange("8 /12")).toEqual({ isRange: true, min: 8, max: 12 });
    });

    it("rejects non-numeric and negative values", () => {
      expect(parseRepRange("-8/12")).toBeNull();
      expect(parseRepRange("8/-12")).toBeNull();
      expect(parseRepRange("a/b")).toBeNull();
      expect(parseRepRange("8/b")).toBeNull();
      expect(parseRepRange("a/12")).toBeNull();
    });

    it("rejects invalid structures", () => {
      expect(parseRepRange("8/10/12")).toBeNull();
      expect(parseRepRange("8-12")).toBeNull();
      expect(parseRepRange("10")).toBeNull();
      expect(parseRepRange("AL FALLO")).toBeNull();
      expect(parseRepRange("")).toBeNull();
      expect(parseRepRange(undefined)).toBeNull();
    });
  });

  describe("2. parsePyramidSeriesCount Edge Cases", () => {
    it("correctly counts pyramid steps for valid sequences", () => {
      expect(parsePyramidSeriesCount("12-10-8-6-4")).toBe(5);
      expect(parsePyramidSeriesCount("10-8-6-4")).toBe(4);
      expect(parsePyramidSeriesCount("10-8-6")).toBe(3);
      expect(parsePyramidSeriesCount("12-10")).toBe(2);
      expect(parsePyramidSeriesCount(" 10-8-6-4 ")).toBe(4);
    });

    it("strictly rejects spaces anywhere in the sequence", () => {
      expect(parsePyramidSeriesCount("10 8 6 4")).toBeNull();
      expect(parsePyramidSeriesCount("10 - 8 - 6")).toBeNull();
      expect(parsePyramidSeriesCount("10- 8-6")).toBeNull();
      expect(parsePyramidSeriesCount("10 -8-6")).toBeNull();
    });

    it("rejects 0 or negative numbers in pyramid sequences", () => {
      expect(parsePyramidSeriesCount("10-8-0")).toBeNull();
      expect(parsePyramidSeriesCount("0-10-8")).toBeNull();
      expect(parsePyramidSeriesCount("-10-8")).toBeNull();
      expect(parsePyramidSeriesCount("10--8")).toBeNull();
    });

    it("rejects single numbers or empty input", () => {
      expect(parsePyramidSeriesCount("10")).toBeNull();
      expect(parsePyramidSeriesCount("")).toBeNull();
      expect(parsePyramidSeriesCount(undefined)).toBeNull();
      expect(parsePyramidSeriesCount("   ")).toBeNull();
    });
  });

  describe("3. repsValidas Validation Edge Cases", () => {
    it("validates valid ranges with slash", () => {
      expect(repsValidas("8/12")).toBe(true);
      expect(repsValidas("10/12")).toBe(true);
      expect(repsValidas("1/100")).toBe(true);
      expect(repsValidas("12/12")).toBe(true);
    });

    it("invalidates ranges with min > max", () => {
      expect(repsValidas("15/10")).toBe(false);
      expect(repsValidas("12/8")).toBe(false);
    });

    it("invalidates ranges with 0 or > 100", () => {
      expect(repsValidas("0/10")).toBe(false);
      expect(repsValidas("8/101")).toBe(false);
      expect(repsValidas("0/0")).toBe(false);
    });

    it("strictly rejects spaces in reps expressions", () => {
      expect(repsValidas("8 / 12")).toBe(false);
      expect(repsValidas("10 8 6 4")).toBe(false);
      expect(repsValidas("10 8")).toBe(false);
      expect(repsValidas("10 - 8")).toBe(false);
      expect(repsValidas("3 x 12")).toBe(false);
    });

    it("accepts AL FALLO case-insensitively", () => {
      expect(repsValidas("AL FALLO")).toBe(true);
      expect(repsValidas("al fallo")).toBe(true);
      expect(repsValidas("Al Fallo")).toBe(true);
      expect(repsValidas("  AL FALLO  ")).toBe(true);
    });

    it("validates pyramid and standard reps", () => {
      expect(repsValidas("10-8-6-4")).toBe(true);
      expect(repsValidas("12-10-8-6-4")).toBe(true);
      expect(repsValidas("10")).toBe(true);
      expect(repsValidas("3x12")).toBe(true);
    });

    it("rejects invalid formats, null or undefined", () => {
      expect(repsValidas("")).toBe(false);
      expect(repsValidas("   ")).toBe(false);
      expect(repsValidas(null as any)).toBe(false);
      expect(repsValidas(undefined as any)).toBe(false);
      expect(repsValidas("10--8")).toBe(false);
      expect(repsValidas("10-0")).toBe(false);
      expect(repsValidas("10-101")).toBe(false);
    });
  });

  describe("4. parseDefaultReps Athlete App Edge Cases", () => {
    it("returns max value for slash range '8/12' -> 12", () => {
      expect(parseDefaultReps("8/12", 1)).toBe(12);
      expect(parseDefaultReps("8/12", 2)).toBe(12);
      expect(parseDefaultReps("10/12", 1)).toBe(12);
      expect(parseDefaultReps("12/8", 1)).toBe(12);
    });

    it("returns sequential values for pyramid '10-8-6-4'", () => {
      expect(parseDefaultReps("10-8-6-4", 1)).toBe(10);
      expect(parseDefaultReps("10-8-6-4", 2)).toBe(8);
      expect(parseDefaultReps("10-8-6-4", 3)).toBe(6);
      expect(parseDefaultReps("10-8-6-4", 4)).toBe(4);
      // Beyond length clamps to last element
      expect(parseDefaultReps("10-8-6-4", 5)).toBe(4);
      expect(parseDefaultReps("10-8-6-4", 99)).toBe(4);
      // Below 1 clamps to first element
      expect(parseDefaultReps("10-8-6-4", 0)).toBe(10);
      expect(parseDefaultReps("10-8-6-4", -1)).toBe(10);
    });

    it("returns default 10 for AL FALLO and unparseable strings", () => {
      expect(parseDefaultReps("AL FALLO", 1)).toBe(10);
      expect(parseDefaultReps("", 1)).toBe(10);
      expect(parseDefaultReps(undefined, 1)).toBe(10);
    });
  });

  describe("5. buildGuardarRutinaPayload Serialization Edge Cases", () => {
    it("serializes closed list tags correctly", () => {
      const payload = buildGuardarRutinaPayload({
        comoNueva: true,
        nombre: "Rutina Hipertrofia y Potencia",
        comentarios: "Auditoría QA",
        tags: ["Hipertrofia", "Potencia", "Fuerza"],
        days: [],
      });

      expect(payload.como_nueva).toBe(true);
      expect(payload.tags).toEqual(["Hipertrofia", "Potencia", "Fuerza"]);
    });

    it("serializes unilateral, time-based and dropset exercise fields", () => {
      const day = {
        id: "d1",
        nombre: "Día 1",
        orden: 1,
        ejercicios: [
          {
            id: "ex-time",
            ejercicio_id: "cat-1",
            nombre: "Plancha Abdominal",
            series: 3,
            repeticiones: "45",
            descanso_segundos: 60,
            rpe_objetivo: null,
            tempo: "0",
            tempo_activo: false,
            force_rpe_required: false,
            notas: "",
            es_superserie: false,
            grupo_superserie: null,
            tipo_serie: "NORMAL" as const,
            tipo_medicion: "TIEMPO" as const,
            tiempo_objetivo_segundos: 45,
            es_unilateral: false,
          },
          {
            id: "ex-unilateral-dropset",
            ejercicio_id: "cat-2",
            nombre: "Biceps Concentrado",
            series: 3,
            repeticiones: "AL FALLO",
            descanso_segundos: 0,
            rpe_objetivo: null,
            tempo: "0",
            tempo_activo: false,
            force_rpe_required: false,
            notas: "",
            es_superserie: true,
            grupo_superserie: 1,
            tipo_serie: "DROPSET" as const,
            tipo_medicion: "REPS" as const,
            tiempo_objetivo_segundos: null,
            es_unilateral: true,
          },
        ],
      };

      const payload = buildGuardarRutinaPayload({
        comoNueva: false,
        nombre: "Rutina Avanzada",
        comentarios: "",
        days: [day],
      });

      expect(payload.dias[0]!.ejercicios[0]!.tipo_medicion).toBe("TIEMPO");
      expect(payload.dias[0]!.ejercicios[0]!.tiempo_objetivo_segundos).toBe(45);
      expect(payload.dias[0]!.ejercicios[0]!.es_unilateral).toBe(false);

      expect(payload.dias[0]!.ejercicios[1]!.tipo_serie).toBe("DROPSET");
      expect(payload.dias[0]!.ejercicios[1]!.tipo_medicion).toBe("REPS");
      expect(payload.dias[0]!.ejercicios[1]!.tiempo_objetivo_segundos).toBeNull();
      expect(payload.dias[0]!.ejercicios[1]!.es_unilateral).toBe(true);
      expect(payload.dias[0]!.ejercicios[1]!.descanso_segundos).toBe(0);
      expect(payload.dias[0]!.ejercicios[1]!.repeticiones).toBe("AL FALLO");
    });
  });

  describe("6. validarRutina Integration with GOZS-360 Cases", () => {
    it("approves routine with pyramid, range with slash, and AL FALLO", () => {
      const res = validarRutina({
        nombre: "Rutina Válida 360",
        days: [
          {
            id: "d1",
            nombre: "Día 1",
            ejercicios: [
              { id: "e1", series: 4, repeticiones: "10-8-6-4", descanso_segundos: 90, rpe_objetivo: null },
              { id: "e2", series: 4, repeticiones: "8/12", descanso_segundos: 60, rpe_objetivo: null },
              { id: "e3", series: 3, repeticiones: "AL FALLO", descanso_segundos: 0, rpe_objetivo: null },
            ],
          },
        ],
      });

      expect(Object.keys(res.errores).length).toBe(0);
      expect(res.errores).toEqual({});
    });

    it("flags error if reps contains spaces like '10 8 6 4' or '8 / 12'", () => {
      const res = validarRutina({
        nombre: "Rutina Inválida con Espacios",
        days: [
          {
            id: "d1",
            nombre: "Día 1",
            ejercicios: [
              { id: "e1", series: 4, repeticiones: "10 8 6 4", descanso_segundos: 90, rpe_objetivo: null },
              { id: "e2", series: 4, repeticiones: "8 / 12", descanso_segundos: 60, rpe_objetivo: null },
            ],
          },
        ],
      });

      expect(Object.keys(res.errores).length).toBe(2);
      expect(res.errores[claveEjercicio("e1", "reps")]).toBeDefined();
      expect(res.errores[claveEjercicio("e2", "reps")]).toBeDefined();
    });
  });
});
