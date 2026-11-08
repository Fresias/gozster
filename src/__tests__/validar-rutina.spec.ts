import { describe, it, expect } from "vitest";
import { validarRutina, repsValidas, claveDia, claveEjercicio, claveRutina } from "@/lib/validar-rutina";

const ej = (o: Partial<{ series: number | null; repeticiones: string; descanso_segundos: number | null; rpe_objetivo: number | string | null }> = {}) => ({
  id: "e1",
  series: 3,
  repeticiones: "10",
  descanso_segundos: 90,
  rpe_objetivo: 8 as number | string | null,
  ...o,
});
const rutina = (e = ej(), nombre = "Rutina", diaNombre = "Día 1") =>
  validarRutina({ nombre, days: [{ id: "d1", nombre: diaNombre, ejercicios: [e] }] });

describe("validarRutina (GOZS-322)", () => {
  it("una rutina correcta no tiene errores ni avisos", () => {
    const r = rutina();
    expect(r.errores).toEqual({});
    expect(r.avisos).toEqual({});
  });

  it.each([0, -3, 21, 2.5, null, NaN])("series %s es inválida", (s) => {
    expect(rutina(ej({ series: s })).errores[claveEjercicio("e1", "series")]).toBe("Series: entre 1 y 20");
  });
  it.each([1, 20])("series %s es válida", (s) => {
    expect(rutina(ej({ series: s })).errores).toEqual({});
  });

  it.each(["10", "10-8-6", "3x12", "100", "12-10-8-6", "10-8-6-4", "8/12", "10/12", "AL FALLO", "al fallo"])("reps %s es válida", (r) => {
    expect(repsValidas(r)).toBe(true);
  });
  it.each(["", "abc", "10--8", "💪", "0", "101", "10-0", "200x1", "1".repeat(200), "10-", "3x101", "10 8 6 4", "10 8", "8 / 12", "15/10"])("reps %j es inválida", (r) => {
    expect(rutina(ej({ repeticiones: r })).errores[claveEjercicio("e1", "reps")]).toBeDefined();
  });

  it.each([null, NaN, -1, 901, 99999, 1.5])("descanso %s es inválido", (d) => {
    expect(rutina(ej({ descanso_segundos: d })).errores[claveEjercicio("e1", "descanso")]).toBe("Descanso: entre 0 y 900 s");
  });
  it.each([0, 900])("descanso %s es válido", (d) => {
    expect(rutina(ej({ descanso_segundos: d })).errores).toEqual({});
  });

  it.each([NaN, 0, 0.5, 10.5, 11, -1, 7.3])("RPE %s es inválido", (v) => {
    expect(rutina(ej({ rpe_objetivo: v })).errores[claveEjercicio("e1", "rpe")]).toBeDefined();
  });
  it.each([null, 1, 7.5, 10])("RPE %s es válido (opcional)", (v) => {
    expect(rutina(ej({ rpe_objetivo: v })).errores).toEqual({});
  });

  describe("RPE piramidal escalonado con guiones (GOZS-418)", () => {
    it("acepta RPE con guiones '6-7-8-9' sincronizado con 4 series (ej. '12-10-8-6')", () => {
      const r = rutina(ej({ series: 4, repeticiones: "12-10-8-6", rpe_objetivo: "6-7-8-9" }));
      expect(r.errores).toEqual({});
    });

    it("acepta RPE con decimales escalonados '6-7-8.5-9' para 4 series", () => {
      const r = rutina(ej({ series: 4, repeticiones: "12-10-8-6", rpe_objetivo: "6-7-8.5-9" }));
      expect(r.errores).toEqual({});
    });

    it("rechaza explícitamente secuencias con espacios '6 7 8 9'", () => {
      const r = rutina(ej({ series: 4, repeticiones: "12-10-8-6", rpe_objetivo: "6 7 8 9" }));
      expect(r.errores[claveEjercicio("e1", "rpe")]).toBe("RPE no debe contener espacios (ej. 6-7-8-9)");
    });

    it("rechaza cuando la cantidad de escalones de RPE no coincide con las series", () => {
      const r = rutina(ej({ series: 4, repeticiones: "12-10-8-6", rpe_objetivo: "6-7-8" }));
      expect(r.errores[claveEjercicio("e1", "rpe")]).toContain("la cantidad de escalones (3) debe coincidir con las series (4)");
    });

    it("rechaza cuando un valor se sale de la escala 1 a 10", () => {
      const rMax = rutina(ej({ series: 4, repeticiones: "12-10-8-6", rpe_objetivo: "6-7-8-11" }));
      expect(rMax.errores[claveEjercicio("e1", "rpe")]).toBe("RPE: cada valor debe estar entre 1 y 10");

      const rMin = rutina(ej({ series: 4, repeticiones: "12-10-8-6", rpe_objetivo: "0-7-8-9" }));
      expect(rMin.errores[claveEjercicio("e1", "rpe")]).toBe("RPE: cada valor debe estar entre 1 y 10");
    });
  });

  it("nombre de rutina y de día obligatorios, sin solo espacios", () => {
    const r = rutina(ej(), "   ", "");
    expect(r.errores[claveRutina]).toBeDefined();
    expect(r.errores[claveDia("d1")]).toBeDefined();
  });

  it("día sin ejercicios: aviso, no bloqueo", () => {
    const r = validarRutina({ nombre: "R", days: [{ id: "d1", nombre: "Día 1", ejercicios: [] }] });
    expect(r.errores).toEqual({});
    expect(r.avisos[claveDia("d1")]).toBeDefined();
  });
});
