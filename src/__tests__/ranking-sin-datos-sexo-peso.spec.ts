import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const onboarding = readFileSync("src/components/athlete/onboarding-alumno.tsx", "utf8");
const ranking = readFileSync("src/components/coach/ranking-funcional.tsx", "utf8");

describe("GOZS-704 · ranking sin datos de sexo y peso", () => {
  it("GIVEN el onboarding WHEN llega al paso de nombre THEN pide sexo y peso como opcionales y explicados", () => {
    expect(onboarding).toContain('data-testid="onboarding-sexo"');
    expect(onboarding).toContain('data-testid="onboarding-peso"');
    expect(onboarding).toContain("Sexo (opcional)");
    expect(onboarding).toContain("Peso corporal en kg (opcional)");
    expect(onboarding).toContain("ranking de fuerza");
    expect(onboarding).toContain('<option value="">Prefiero no decirlo</option>');
  });

  it("GIVEN un ranking sin datos suficientes WHEN se abre THEN muestra un estado vacío que explica qué falta", () => {
    expect(ranking).toContain('data-testid="ranking-estado-vacio"');
    expect(ranking).toContain("ranking.hombres.length === 0 && ranking.mujeres.length === 0");
    expect(ranking).toContain("cargar sexo y/o peso corporal");
    expect(ranking).toContain("Nadie registró una marca");
  });
});
