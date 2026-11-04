import { describe, it, expect } from "vitest";
import { validarRutina, repsValidas, claveDia, claveEjercicio, claveRutina } from "@/lib/validar-rutina";

const ej = (o: Partial<{ series: number | null; repeticiones: string; descanso_segundos: number | null; rpe_objetivo: number | null }> = {}) => ({
  id: "e1",
  series: 3,
  repeticiones: "10",
  descanso_segundos: 90,
  rpe_objetivo: 8 as number | null,
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
