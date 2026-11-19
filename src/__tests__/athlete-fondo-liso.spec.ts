import { describe, expect, it } from "vitest";
import { fondoEsLiso } from "@/components/athlete/fondo-generativo";

const base = {
  pathname: "/athlete",
  onboardingCompletado: true,
  ejercicioAbiertoId: null,
  cuestionarioAbierto: false,
};

describe("fondoEsLiso (F-20)", () => {
  it("Inicio con malla", () => expect(fondoEsLiso(base)).toBe(false));
  it("liso en el ejercicio", () =>
    expect(fondoEsLiso({ ...base, ejercicioAbiertoId: "e1" })).toBe(true));
  it("liso en el onboarding", () =>
    expect(fondoEsLiso({ ...base, onboardingCompletado: false })).toBe(true));
  it("liso en el cuestionario", () => {
    expect(fondoEsLiso({ ...base, cuestionarioAbierto: true })).toBe(true);
    expect(fondoEsLiso({ ...base, pathname: "/athlete/cuestionario" })).toBe(true);
  });
  it("malla en historial", () =>
    expect(fondoEsLiso({ ...base, pathname: "/athlete/historial" })).toBe(false));
});
