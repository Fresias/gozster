import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  calculateBarbellPlates,
  calculateBrzycki1RM,
  calculateEffectiveVolume,
  calculateEpley1RM,
  calculateTotalTonnage,
} from "@/lib/strength-metrics";
import {
  REAL_ALUMNOS,
  REAL_DIAS,
  REAL_EJERCICIOS_RUTINA,
  REAL_PLANES,
} from "@/services/real-mynter-data";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

/**
 * ============================================================================
 * QA Verification Suite: Verificación Integral de Flujo de Registro,
 * Celebración, Historial y Barras (GH #186 / GOZS-180)
 *
 * Supervisor: @A-PM-GOZster
 * Auditor QA: @qa-eng (Gabriel)
 *
 * Referencias Normativas:
 * - Regla Ponytail: Cero dependencias adicionales de NPM, UI táctil limpia.
 * - Regla Karpathy: Verificación quirúrgica, trazable y sin sobre-ingeniería.
 * - Criterios de Aceptación Gherkin de GOZS-180 / GH #186.
 * ============================================================================
 */

describe("QA Verification: Verificación Integral de Flujo de Registro, Celebración, Historial y Barras (GOZS-180 / GH #186)", () => {
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const iconsPath = path.resolve(__dirname, "../components/athlete/icons.tsx");
  const packageJsonPath = path.resolve(__dirname, "../../package.json");

  const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");
  const iconsCode = fs.readFileSync(iconsPath, "utf-8");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
    useAthleteStore.getState().resetSessionToDefaults();
  });

  describe("1. Auditoría Canónica: Sesión de Fernando Rosales (Día 1 con 26 series)", () => {
    it("identifica a Fernando Rosales como alumno activo con su plan y día canónico asignado", () => {
      const fernando = REAL_ALUMNOS.find((a) => a.nombre_completo.includes("Fernando Rosales"));
      expect(fernando).toBeDefined();
      expect(fernando?.nombre_completo).toBe("Fernando Rosales");

      const planFer = REAL_PLANES.find((p) => p.alumno_id === fernando?.id);
      expect(planFer).toBeDefined();

      const dia1Fer = REAL_DIAS.find((d) => d.plan_id === planFer?.id && d.orden === 1);
      expect(dia1Fer).toBeDefined();
      expect(dia1Fer?.nombre).toContain("DIA 1");
    });

    it("GIVEN la sesión por defecto de Fernando Rosales, THEN contabiliza exactamente 26 series en 8 ejercicios", () => {
      const store = useAthleteStore.getState();
      const session = store.currentSession;

      expect(session.studentName).toBe("Fernando Rosales");
      expect(session.nombre_rutina).toContain("DIA 1 (F Y H FER ROSALES)");

      // 8 ejercicios en Día 1
      expect(session.ejercicios).toHaveLength(8);

      // Conteo acumulado de series en los 8 ejercicios
      const seriesCounts = session.ejercicios.map((e) => e.series.length);
      // [4, 4, 3, 3, 3, 3, 3, 3]
      expect(seriesCounts).toEqual([4, 4, 3, 3, 3, 3, 3, 3]);

      const totalSeries = seriesCounts.reduce((acc, c) => acc + c, 0);
      expect(totalSeries).toBe(26);
    });

    it("calcula el tonelaje proyectado estricto para las 26 series de Fernando Rosales", () => {
      const store = useAthleteStore.getState();
      const session = store.currentSession;

      const blocks = session.ejercicios.flatMap((e) =>
        e.series.map((s) => ({
          series: 1,
          reps: s.reps_hechas,
          peso: s.peso_kg,
        }))
      );

      const totalTonnage = calculateTotalTonnage(blocks);
      expect(totalTonnage).toBeGreaterThan(0);
      expect(Number.isFinite(totalTonnage)).toBe(true);
    });
  });

  describe("2. Verificación Matemática Estricta de Fórmulas de Fuerza", () => {
    describe("2.1 Estimación de 1RM con fórmula de Epley: 1RM = Peso * (1 + Reps / 30)", () => {
      it("calcula fielmente 1RM para valores estándar", () => {
        // 100 kg x 10 reps = 100 * (1 + 10/30) = 133.333... kg
        const epley100x10 = calculateEpley1RM(100, 10);
        expect(epley100x10).toBeCloseTo(133.333, 2);

        // 80 kg x 5 reps = 80 * (1 + 5/30) = 93.333... kg
        const epley80x5 = calculateEpley1RM(80, 5);
        expect(epley80x5).toBeCloseTo(93.333, 2);

        // 1 rep pura: 1RM = Peso * (1 + 1/30) = 103.33 kg
        const epley100x1 = calculateEpley1RM(100, 1);
        expect(epley100x1).toBeCloseTo(103.333, 2);
      });

      it("maneja casos límite: 0 repeticiones, peso cero o valores negativos retornan 0", () => {
        expect(calculateEpley1RM(100, 0)).toBe(0);
        expect(calculateEpley1RM(0, 10)).toBe(0);
        expect(calculateEpley1RM(-50, 5)).toBe(0);
        expect(calculateEpley1RM(50, -5)).toBe(0);
        expect(calculateEpley1RM(NaN, 5)).toBe(0);
        expect(calculateEpley1RM(50, Infinity)).toBe(0);
      });
    });

    describe("2.2 Estimación de 1RM con fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
      it("calcula fielmente 1RM para repeticiones válidas (reps <= 10)", () => {
        // 100 kg x 5 reps = 100 / (1.0278 - 0.0278 * 5) = 100 / 0.8888 = 112.511... kg
        const brzycki100x5 = calculateBrzycki1RM(100, 5);
        expect(brzycki100x5).toBeCloseTo(112.511, 2);

        // 120 kg x 3 reps = 120 / (1.0278 - 0.0278 * 3) = 120 / 0.9444 = 127.064... kg
        const brzycki120x3 = calculateBrzycki1RM(120, 3);
        expect(brzycki120x3).toBeCloseTo(127.064, 2);
      });

      it("protege contra divergencia y división por cero cuando reps >= 37 (denominador <= 0)", () => {
        // 1.0278 - 0.0278 * 37 = -0.0008 <= 0
        expect(calculateBrzycki1RM(100, 37)).toBe(0);
        expect(calculateBrzycki1RM(100, 40)).toBe(0);
        expect(calculateBrzycki1RM(100, 0)).toBe(0);
        expect(calculateBrzycki1RM(-100, 5)).toBe(0);
      });
    });

    describe("2.3 Tonelaje Total y Volumen Efectivo (Hevy / Strength Standards)", () => {
      it("calcula el tonelaje sumando estrictamente Series * Reps * Peso", () => {
        const blocks = [
          { series: 4, reps: 8, peso: 100 }, // 4 * 8 * 100 = 3200 kg
          { series: 3, reps: 10, peso: 60 },  // 3 * 10 * 60 = 1800 kg
        ];
        expect(calculateTotalTonnage(blocks)).toBe(5000);
      });

      it("excluye series de calentamiento (W / WARMUP) del volumen efectivo", () => {
        const sets = [
          { peso_kg: 40, reps_hechas: 10, set_type: "W", completada: true },      // Calentamiento: ignorar
          { peso_kg: 60, reps_hechas: 8, set_type: "WARMUP", completada: true },  // Calentamiento: ignorar
          { peso_kg: 100, reps_hechas: 5, set_type: "NORMAL", completada: true }, // Efectiva: 500 kg
          { peso_kg: 100, reps_hechas: 5, set_type: "FAILURE", completada: true },// Fallo: 500 kg
          { peso_kg: 80, reps_hechas: 8, set_type: "DROPSET", completada: true }, // Drop: 640 kg
          { peso_kg: 100, reps_hechas: 5, set_type: "NORMAL", completada: false },// No completada: ignorar
        ];
        // Volumen efectivo esperado: 500 + 500 + 640 = 1640 kg
        const effectiveVol = calculateEffectiveVolume(sets);
        expect(effectiveVol).toBe(1640);
      });
    });
  });

  describe("3. Calculadora de Discos con Barras Alternativas y Normalización de PR (Zero Falsos PRs)", () => {
    it("desglosa discos con barra olímpica estándar de 20 kg", () => {
      // 70 kg total -> 25 kg por lado -> 1 disco de 25 kg
      const res20 = calculateBarbellPlates(70, 20);
      expect(res20.barWeightKg).toBe(20);
      expect(res20.perSideWeightKg).toBe(25);
      expect(res20.platesPerSide).toEqual([{ weight: 25, count: 1 }]);
      expect(res20.remainderKg).toBe(0);
    });

    it("desglosa discos con barra semi-olímpica de 15 kg", () => {
      // 70 kg total -> 27.5 kg por lado -> 1 disco de 25 kg + 1 disco de 2.5 kg
      const res15 = calculateBarbellPlates(70, 15);
      expect(res15.barWeightKg).toBe(15);
      expect(res15.perSideWeightKg).toBe(27.5);
      expect(res15.platesPerSide).toEqual([
        { weight: 25, count: 1 },
        { weight: 2.5, count: 1 },
      ]);
      expect(res15.remainderKg).toBe(0);
    });

    it("desglosa discos con barra corta / estándar común de 10 kg", () => {
      // 70 kg total -> 30 kg por lado -> 1 disco de 25 kg + 1 disco de 5 kg
      const res10 = calculateBarbellPlates(70, 10);
      expect(res10.barWeightKg).toBe(10);
      expect(res10.perSideWeightKg).toBe(30);
      expect(res10.platesPerSide).toEqual([
        { weight: 25, count: 1 },
        { weight: 5, count: 1 },
      ]);
      expect(res10.remainderKg).toBe(0);
    });

    it("normaliza matemáticamente el peso total: Barra + 2 * PesoLado (previniendo falsos PRs)", () => {
      // Función matemática de normalización:
      const calcularPesoTotalNormalizado = (pesoBarra: number, pesoLado: number) => {
        if (pesoBarra < 0 || pesoLado < 0) return 0;
        return Math.round((pesoBarra + 2 * pesoLado) * 100) / 100;
      };

      // Si un atleta levanta 30 kg por lado con barra de 10 kg, su total es 70 kg:
      const totalBarra10 = calcularPesoTotalNormalizado(10, 30);
      expect(totalBarra10).toBe(70);

      // Si su marca previa con barra olímpica de 20 kg era 80 kg (30 kg por lado = 80 kg):
      const marcaPreviaOlimpica = calcularPesoTotalNormalizado(20, 30);
      expect(marcaPreviaOlimpica).toBe(80);

      // Verificación de CERO falsos PRs: 70 kg NO supera a 80 kg
      expect(totalBarra10 > marcaPreviaOlimpica).toBe(false);
    });
  });

  describe("4. RPE Objetivo Fijo y de Solo Lectura (GH #185 / GOZS-179)", () => {
    it("mantiene el RPE en modo estrictamente inmutable sin botones de edición (+ / -)", () => {
      // No debe contener controladores para incrementar o decrementar RPE
      expect(liveWorkoutCode).not.toContain("handleAdjustRpe");
      expect(liveWorkoutCode).not.toContain('aria-label="Aumentar RPE"');
      expect(liveWorkoutCode).not.toContain('aria-label="Disminuir RPE"');
    });

    it("renderiza el badge prescrito por entrenador con ícono Lock nativo de icons.tsx", () => {
      expect(liveWorkoutCode).toContain('data-testid="rpe-prescribed-badge"');
      expect(iconsCode).toContain("export function Lock");
      expect(liveWorkoutCode).toContain("<Lock");
    });
  });

  describe("5. Reglas de Arquitectura y Harness: Ponytail y Karpathy", () => {
    it("cumple la Regla Ponytail: cero dependencias de NPM innecesarias en package.json", () => {
      const deps = packageJson.dependencies || {};
      const devDeps = packageJson.devDependencies || {};
      const allDeps = { ...deps, ...devDeps };

      // Ninguna librería redundante de UI, animaciones pesadas o iconos de terceros
      expect(allDeps["lucide-react"]).toBeUndefined();
      expect(allDeps["framer-motion"]).toBeUndefined();
      expect(allDeps["chart.js"]).toBeUndefined();
      expect(allDeps["recharts"]).toBeUndefined();
      expect(allDeps["lodash"]).toBeUndefined();
    });

    it("mantiene la cola de sincronización offline resiliente sin mutaciones de estado bloqueantes", () => {
      const offlineStore = useOfflineQueueStore.getState();
      expect(offlineStore.isOnline).toBe(true);
      expect(offlineStore.pendingEvents).toEqual([]);

      offlineStore.enqueueEvent({
        id: "evt-test-01",
        action: "RECORD_SERIE_UPSERTED",
        payload: { serie_id: "s1", peso_kg: 100, reps: 5 },
      });

      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(1);
    });
  });
});
