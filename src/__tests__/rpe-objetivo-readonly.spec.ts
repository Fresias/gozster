import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("Athlete App: RPE objetivo fijo y de solo lectura prescrito por el entrenador (GH #185, GOZS-179)", () => {
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const iconsPath = path.resolve(__dirname, "../components/athlete/icons.tsx");

  const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");
  const iconsCode = fs.readFileSync(iconsPath, "utf-8");

  describe("Criterio Gherkin 1: RPE como valor inmutable prescrito por el entrenador", () => {
    it("presenta el badge con el formato 'RPE Objetivo: <valor> · Prescrito por entrenador'", () => {
      expect(liveWorkoutCode).toContain('data-testid="input-rpe"');
      expect(liveWorkoutCode).toContain('data-testid="rpe-prescribed-badge"');
      expect(liveWorkoutCode).toContain("RPE Objetivo: {currentExercise.rpe_objetivo ?? serie.rpe_real} · Prescrito por entrenador");
    });

    it("incluye el ícono de bloqueo (Lock) para reforzar visualmente el estado inmutable", () => {
      expect(iconsCode).toContain("export function Lock");
      expect(liveWorkoutCode).toContain("<Lock");
    });

    it("muestra la descripción informativa de que es un valor de solo lectura fijado por el coach", () => {
      expect(liveWorkoutCode).toContain("Intensidad fija del ejercicio fundamental. Solo lectura para el atleta.");
    });
  });

  describe("Criterio Gherkin 2: Eliminación total de steppers interactivos de modificación (−0.5 / +0.5)", () => {
    it("elimina los botones de incremento y decremento de RPE (-0.5 y +0.5)", () => {
      expect(liveWorkoutCode).not.toContain("−0.5");
      expect(liveWorkoutCode).not.toContain("+0.5");
      expect(liveWorkoutCode).not.toContain("handleAdjustRpe");
    });
  });

  describe("Criterio Gherkin 3: Conservación de métricas avanzadas y jerarquía de vistas", () => {
    it("mantiene visible el cálculo de 1RM estimado junto al RPE objetivo", () => {
      expect(liveWorkoutCode).toContain("serie.estimated1RM.toFixed(1)} kg 1RM");
      expect(liveWorkoutCode).toContain("RPE Objetivo");
    });

    it("se ubica dentro de la sección técnica exclusiva y permanece oculta en Vista Simple", () => {
      expect(liveWorkoutCode).toContain("!isSimpleView && (");
    });
  });
});
