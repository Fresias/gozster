import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { useAthleteStore } from "@/store/use-athlete-store";
import { calculateEffectiveTotalWeight } from "@/lib/strength-metrics";

describe("FE App: quitar la calculadora de discos (GOZS-279)", () => {
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");

  const homePagePath = path.resolve(__dirname, "../app/page.tsx");
  const homePageCode = fs.readFileSync(homePagePath, "utf-8");

  describe("1. GIVEN la app WHEN se navega el registro THEN no hay calculadora de discos", () => {
    it("el registro (LiveWorkout) no contiene el botón táctil de 'Discos'", () => {
      expect(liveWorkoutCode).not.toContain("<span>Discos</span>");
      expect(liveWorkoutCode).not.toContain('data-testid="plate-calculator-btn"');
    });

    it("el registro (LiveWorkout) no renderiza el modal PlateCalculatorModal", () => {
      expect(liveWorkoutCode).not.toContain("<PlateCalculatorModal");
      expect(liveWorkoutCode).not.toContain("data-testid=\"plate-calculator-modal\"");
    });

    it("el botón de Calentamiento ahora ocupa el ancho completo (w-full) con ergonomía táctil >= 44px", () => {
      expect(liveWorkoutCode).toContain('data-testid={`warmup-btn-${currentExercise.id}`}');
      expect(liveWorkoutCode).toContain("w-full min-h-11");
      expect(liveWorkoutCode).toContain("Calentamiento");
    });
  });

  describe("2. GIVEN la app WHEN se audita el código THEN no hay código muerto", () => {
    it("no hay importaciones huérfanas de PlateCalculatorModal en live-workout.tsx", () => {
      expect(liveWorkoutCode).not.toContain('import { PlateCalculatorModal }');
      expect(liveWorkoutCode).not.toContain('from "@/components/athlete/plate-calculator-modal"');
    });

    it("no hay estado muerto ni setters de plateModalWeight en live-workout.tsx", () => {
      expect(liveWorkoutCode).not.toContain("plateModalWeight");
      expect(liveWorkoutCode).not.toContain("setPlateModalWeight");
    });

    it("no hay import huérfano de Dumbbell en live-workout.tsx", () => {
      expect(liveWorkoutCode).not.toContain("Dumbbell");
    });

    it("la landing page (app/page.tsx) no lista la Calculadora de Discos como feature activa", () => {
      expect(homePageCode).not.toContain("Calculadora de Discos");
      expect(homePageCode).toContain("Cronómetro Inteligente");
      expect(homePageCode).toContain("Calentamiento Específico");
    });
  });

  describe("3. Comportamiento intacto del flujo de registro y store", () => {
    it("permite registrar series con peso y repeticiones sin depender de la calculadora de discos", () => {
      const store = useAthleteStore.getState();
      store.resetSessionToDefaults();

      const exerciseId = "ej-sentadilla-1";
      store.updateSetField(exerciseId, 1, "peso_kg", 85);
      store.updateSetField(exerciseId, 1, "reps_hechas", 8);

      store.completeSet(exerciseId, 1);

      const stateAfter = useAthleteStore.getState();
      const exercise = stateAfter.currentSession.ejercicios.find((e) => e.id === exerciseId);
      const set1 = exercise?.series.find((s) => s.numero_serie === 1);

      expect(set1?.completada).toBe(true);
      expect(set1?.peso_kg).toBe(85);
      expect(set1?.reps_hechas).toBe(8);
    });

    it("las métricas de peso efectivo y normalización siguen operativas a nivel dominio", () => {
      // Regla de dominio de normalización para barras
      expect(calculateEffectiveTotalWeight(20, 25)).toBe(70);
    });
  });
});
