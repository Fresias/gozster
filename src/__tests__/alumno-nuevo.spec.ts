import { describe, expect, it } from "vitest";
import { DIAS_ALUMNO_NUEVO, esAlumnoNuevo } from "@/lib/alumno-nuevo";
import { DEMO_ALUMNOS } from "@/services/coach-demo-dataset";

const DIA = 86_400_000;
const ahora = Date.parse("2026-10-22T12:00:00Z");

describe("esAlumnoNuevo (GOZS-138)", () => {
  it("usa una ventana de 90 días", () => {
    expect(DIAS_ALUMNO_NUEVO).toBe(90);
  });
  it("incluye altas dentro de los últimos 90 días", () => {
    expect(esAlumnoNuevo(new Date(ahora - 10 * DIA).toISOString(), ahora)).toBe(true);
    expect(esAlumnoNuevo(new Date(ahora - 90 * DIA).toISOString(), ahora)).toBe(true);
  });
  it("excluye altas de más de 90 días o fechas inválidas", () => {
    expect(esAlumnoNuevo(new Date(ahora - 91 * DIA).toISOString(), ahora)).toBe(false);
    expect(esAlumnoNuevo(null, ahora)).toBe(false);
    expect(esAlumnoNuevo("basura", ahora)).toBe(false);
  });
  it("el dataset demo tiene al menos un alumno nuevo y uno que no", () => {
    const nuevos = DEMO_ALUMNOS.filter((a) => esAlumnoNuevo(a.created_at));
    expect(nuevos.length).toBeGreaterThan(0);
    expect(nuevos.length).toBeLessThan(DEMO_ALUMNOS.length);
  });
});
