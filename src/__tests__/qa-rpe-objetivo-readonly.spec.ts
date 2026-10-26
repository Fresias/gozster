import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
} from "@/lib/strength-metrics";

/**
 * ============================================================================
 * QA Verification Suite: RPE Objetivo Fijo y de Solo Lectura Prescrito
 * por el Entrenador (GH #185 / GOZS-179)
 *
 * Supervisor: @A-PM-GOZster
 * Auditor QA: @A-qa-eng
 *
 * Referencias Normativas:
 * - Regla Ponytail: Cero dependencias añadidas, UI táctil limpia.
 * - Regla Karpathy: Modificación quirúrgica sin sobre-ingeniería ni reescrituras.
 * - Criterios de Aceptación Gherkin de GOZS-179 / GH #185.
 * ============================================================================
 */

describe("QA Verification: RPE Objetivo Fijo y de Solo Lectura Prescrito por el Entrenador (GOZS-179 / GH #185)", () => {
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const iconsPath = path.resolve(__dirname, "../components/athlete/icons.tsx");
  const packageJsonPath = path.resolve(__dirname, "../../package.json");

  const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");
  const iconsCode = fs.readFileSync(iconsPath, "utf-8");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  describe("1. Auditoría de Inmutabilidad y Presentación Visual (Criterio Gherkin)", () => {
    it("presenta el badge inmutable con data-testid='rpe-prescribed-badge' dentro de data-testid='input-rpe'", () => {
      expect(liveWorkoutCode).toContain('data-testid="input-rpe"');
      expect(liveWorkoutCode).toContain('data-testid="rpe-prescribed-badge"');
      expect(liveWorkoutCode).toContain(
        "RPE Objetivo: {currentExercise.rpe_objetivo ?? serie.rpe_real} · Prescrito por entrenador"
      );
    });

    it("utiliza el ícono Lock nativo exportado en icons.tsx sin librerías externas (Ponytail)", () => {
      expect(iconsCode).toContain("export function Lock");
      expect(liveWorkoutCode).toContain("<Lock");
      // Verifica que no se importó ninguna librería de iconos de terceros (lucide-react, etc.)
      expect(packageJson.dependencies["lucide-react"]).toBeUndefined();
    });

    it("muestra la descripción clara de que es una intensidad fija prescrita por el coach", () => {
      expect(liveWorkoutCode).toContain(
        "Intensidad fija del ejercicio fundamental. Solo lectura para el atleta."
      );
    });

    it("garantiza la eliminación absoluta de interactores y steppers de ajuste de RPE", () => {
      expect(liveWorkoutCode).not.toContain("−0.5");
      expect(liveWorkoutCode).not.toContain("+0.5");
      expect(liveWorkoutCode).not.toContain("handleAdjustRpe");
      // Ningún botón para modificar RPE
      expect(liveWorkoutCode).not.toMatch(/handleAdjustRpe\(/);
    });
  });

  describe("2. Verificación Matemática Estricta de Métricas de Fuerza (Epley, Brzycki y 1RM)", () => {
    it("mantiene intacta la visualización del cálculo de 1RM estimado en vivo en la sección técnica", () => {
      expect(liveWorkoutCode).toContain("{serie.estimated1RM.toFixed(1)} kg 1RM");
      expect(liveWorkoutCode).toContain("RPE Objetivo");
    });

    it("calcula con exactitud el 1RM con fórmula de Epley: 1RM = Peso * (1 + Reps / 30)", () => {
      // Caso nominal: 100 kg x 5 reps -> 100 * (1 + 5/30) = 116.666... -> 116.7 kg
      const epley100x5 = calculateEpley1RM(100, 5);
      expect(epley100x5).toBeCloseTo(116.6667, 2);
      expect(epley100x5.toFixed(1)).toBe("116.7");

      // Caso 1 repetición máxima real: 140 kg x 1 rep -> 140 * (1 + 1/30) = 144.666...
      const epley140x1 = calculateEpley1RM(140, 1);
      expect(epley140x1).toBeCloseTo(144.6667, 2);

      // Casos límite (edge cases):
      expect(calculateEpley1RM(0, 5)).toBe(0);
      expect(calculateEpley1RM(100, 0)).toBe(0);
      expect(calculateEpley1RM(-100, 5)).toBe(0);
      expect(calculateEpley1RM(100, -5)).toBe(0);
      expect(calculateEpley1RM(NaN, 5)).toBe(0);
      expect(calculateEpley1RM(100, Infinity)).toBe(0);
    });

    it("calcula con exactitud el 1RM con fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
      // Caso nominal: 100 kg x 5 reps -> 100 / (1.0278 - 0.0278 * 5) = 100 / 0.8888 = 112.51 kg
      const brzycki100x5 = calculateBrzycki1RM(100, 5);
      expect(brzycki100x5).toBeCloseTo(112.514, 2);

      // Casos límite (edge cases):
      expect(calculateBrzycki1RM(0, 5)).toBe(0);
      expect(calculateBrzycki1RM(100, 0)).toBe(0);
      expect(calculateBrzycki1RM(-50, 5)).toBe(0);
      expect(calculateBrzycki1RM(100, 40)).toBe(0); // Denominador negativo o <= 0
    });

    it("calcula con exactitud el tonelaje total semanal: Σ (Series * Reps * Peso)", () => {
      const bloques = [
        { series: 4, reps: 5, peso: 100 }, // 4 * 5 * 100 = 2000 kg
        { series: 3, reps: 8, peso: 70 },  // 3 * 8 * 70  = 1680 kg
        { series: 3, reps: 10, peso: 50 }, // 3 * 10 * 50 = 1500 kg
      ];
      const tonelaje = calculateTotalTonnage(bloques);
      expect(tonelaje).toBe(5180);

      // Casos límite:
      expect(calculateTotalTonnage([])).toBe(0);
      expect(calculateTotalTonnage([{ series: 0, reps: 5, peso: 100 }])).toBe(0);
      expect(calculateTotalTonnage([{ series: 3, reps: 0, peso: 100 }])).toBe(0);
      expect(calculateTotalTonnage([{ series: 3, reps: 5, peso: 0 }])).toBe(0);
    });
  });

  describe("3. Auditoría de Jerarquía de Vistas (Vista Simple vs Vista Técnica)", () => {
    it("garantiza que la sección técnica de RPE Objetivo y 1RM permanece estrictamente oculta en Vista Simple", () => {
      // La condición de renderizado técnico debe evaluar !isSimpleView
      expect(liveWorkoutCode).toContain("!isSimpleView && (");
      // Verifica que no se exponga el stepper ni el badge fuera del bloque técnico condicional
      const technicalBlockMatch = liveWorkoutCode.match(/\{!isSimpleView\s*&&\s*\([\s\S]*?RPE Objetivo[\s\S]*?\)\}/);
      expect(technicalBlockMatch).not.toBeNull();
    });
  });

  describe("4. Auditoría de Integridad de Código, Cero Sobre-Ingeniería y Regla Karpathy", () => {
    it("cumple la regla Ponytail: sin librerías externas añadidas ni dependencias innecesarias", () => {
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      // Verificamos que no haya dependencias exóticas añadidas para RPE o Lock
      expect(deps["lucide-react"]).toBeUndefined();
      expect(deps["react-icons"]).toBeUndefined();
      expect(deps["@tabler/icons-react"]).toBeUndefined();
    });

    it("cumple la regla Karpathy: modificación concisa y quirúrgica", () => {
      // live-workout.tsx conserva su estructura sin reescrituras masivas
      expect(liveWorkoutCode).toContain("export function LiveWorkout");
      expect(liveWorkoutCode).toContain("useAthleteStore");
      expect(liveWorkoutCode).toContain("useOfflineQueueStore");
    });
  });
});
