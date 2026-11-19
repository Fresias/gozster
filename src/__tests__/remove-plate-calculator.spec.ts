import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { useAthleteStore } from "@/store/use-athlete-store";
import { calculateEffectiveTotalWeight } from "@/lib/strength-metrics";

describe("FE App: quitar modal de calculadora de discos e integrar discos en Técnica (GOZS-279 / D-21)", () => {
  const ejercicioActivoPath = path.resolve(__dirname, "../components/athlete/ejercicio-activo.tsx");
  const ejercicioActivoCode = fs.readFileSync(ejercicioActivoPath, "utf-8");

  const homePagePath = path.resolve(__dirname, "../app/page.tsx");
  const homePageCode = fs.readFileSync(homePagePath, "utf-8");

  describe("1. GIVEN la app WHEN se navega el registro THEN no hay modal PlateCalculatorModal (D-21)", () => {
    it("el registro (EjercicioActivo) no contiene botón ni modal PlateCalculatorModal (D-21 pasa el cálculo a Técnica)", () => {
      expect(ejercicioActivoCode).not.toContain("<span>Discos</span>");
      expect(ejercicioActivoCode).not.toContain('data-testid="plate-calculator-btn"');
      expect(ejercicioActivoCode).toContain("discosPorLado");
    });

    it("el registro (EjercicioActivo) no renderiza el modal PlateCalculatorModal", () => {
      expect(ejercicioActivoCode).not.toContain("<PlateCalculatorModal");
      expect(ejercicioActivoCode).not.toContain('data-testid="plate-calculator-modal"');
    });

    it("la aproximación en línea (D-20) expone el botón 'Saltar' con data-testid warmup-btn-${ej.id}", () => {
      expect(ejercicioActivoCode).toContain("data-testid={`warmup-btn-${ej.id}`}");
      expect(ejercicioActivoCode).toContain("Aproximación");
    });
  });

  describe("2. GIVEN la app WHEN se audita el código THEN no hay código muerto", () => {
    it("no hay importaciones huérfanas de PlateCalculatorModal en ejercicio-activo.tsx", () => {
      expect(ejercicioActivoCode).not.toContain("import { PlateCalculatorModal }");
      expect(ejercicioActivoCode).not.toContain('from "@/components/athlete/plate-calculator-modal"');
    });

    it("no hay estado muerto ni setters de plateModalWeight en ejercicio-activo.tsx", () => {
      expect(ejercicioActivoCode).not.toContain("plateModalWeight");
      expect(ejercicioActivoCode).not.toContain("setPlateModalWeight");
    });

    it("no hay import huérfano de Dumbbell en ejercicio-activo.tsx", () => {
      expect(ejercicioActivoCode).not.toContain("Dumbbell");
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
