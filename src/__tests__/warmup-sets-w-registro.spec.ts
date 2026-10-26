import { beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  calculateEffectiveVolume,
  calcularVolumenEfectivo,
  calculateWarmupSets,
} from "@/lib/strength-metrics";
import {
  esNuevoRecord,
  esRecord,
  agregarSerieAMarcas,
  type MarcasEjercicio,
} from "@/lib/record-ejercicio";

describe("Registro explícito de series de calentamiento (W) en ejercicio activo (GH #182, GOZS-176)", () => {
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const warmupModalPath = path.resolve(__dirname, "../components/athlete/warmup-modal.tsx");
  const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");
  const warmupModalCode = fs.readFileSync(warmupModalPath, "utf-8");

  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });

    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().setMembershipStatus("ACTIVE");
    useAthleteStore.getState().setNivelVistaAlumno("TECNICA");
  });

  describe("1. Asignación y estructura de series de calentamiento (W)", () => {
    it("applyWarmupSetsToExercise agrega series con set_type 'W' y renumera las efectivas", () => {
      const store = useAthleteStore.getState();
      const exerciseId = store.currentSession.ejercicios[0]!.id;
      const initialEffectiveCount = store.currentSession.ejercicios[0]!.series.length;

      const warmups = [
        { setNumber: 1, peso_kg: 20, reps: 10 },
        { setNumber: 2, peso_kg: 50, reps: 5 },
        { setNumber: 3, peso_kg: 75, reps: 3 },
        { setNumber: 4, peso_kg: 90, reps: 1 },
      ];

      store.applyWarmupSetsToExercise(exerciseId, warmups);

      const updatedExercise = useAthleteStore
        .getState()
        .currentSession.ejercicios.find((e) => e.id === exerciseId)!;

      // 4 de calentamiento + series efectivas originales
      expect(updatedExercise.series.length).toBe(4 + initialEffectiveCount);

      // Primeras 4 series son de calentamiento 'W'
      for (let i = 0; i < 4; i++) {
        const s = updatedExercise.series[i]!;
        expect(s.numero_serie).toBe(i + 1);
        expect(s.set_type).toBe("W");
        expect(s.completada).toBe(false);
      }

      // La serie efectiva original ahora tiene número correlativo posterior
      const firstEffective = updatedExercise.series[4]!;
      expect(firstEffective.numero_serie).toBe(5);
      expect(firstEffective.set_type).not.toBe("W");
    });

    it("registerWarmupSet asienta una serie de calentamiento completada y encola evento offline", () => {
      const store = useAthleteStore.getState();
      const exerciseId = store.currentSession.ejercicios[0]!.id;

      store.registerWarmupSet(exerciseId, {
        peso_kg: 20,
        reps: 10,
        rpe_real: 6.0,
      });

      const updatedExercise = useAthleteStore
        .getState()
        .currentSession.ejercicios.find((e) => e.id === exerciseId)!;

      const firstSet = updatedExercise.series[0]!;
      expect(firstSet.set_type).toBe("W");
      expect(firstSet.completada).toBe(true);
      expect(firstSet.peso_kg).toBe(20);
      expect(firstSet.reps_hechas).toBe(10);

      const pendingEvents = useOfflineQueueStore.getState().pendingEvents;
      expect(pendingEvents.some((ev) => ev.payload.setType === "W")).toBe(true);
    });

    it("el selector de taxonomía permite marcar una serie con tipo 'W'", () => {
      const store = useAthleteStore.getState();
      const exerciseId = store.currentSession.ejercicios[0]!.id;

      store.updateSetType(exerciseId, 1, "W");
      expect(
        useAthleteStore.getState().currentSession.ejercicios[0]!.series[0]!.set_type
      ).toBe("W");
    });
  });

  describe("2. Exclusión estricta de series W en volumen efectivo y marcas de PR", () => {
    it("calcularVolumenEfectivo y calculateEffectiveVolume excluyen series 'W' y 'WARMUP'", () => {
      const sets = [
        { peso_kg: 20, reps_hechas: 10, set_type: "W", completada: true }, // 200 kg -> EXCLUIDO
        { peso_kg: 50, reps_hechas: 5, set_type: "WARMUP", completada: true }, // 250 kg -> EXCLUIDO
        { peso_kg: 100, reps_hechas: 8, set_type: "NORMAL", completada: true }, // 800 kg -> INCLUIDO
        { peso_kg: 100, reps_hechas: 5, set_type: "N", completada: true }, // 500 kg -> INCLUIDO
        { peso_kg: 100, reps_hechas: 5, set_type: "N", completada: false }, // Incompleta -> EXCLUIDA
      ];

      expect(calculateEffectiveVolume(sets)).toBe(1300);
      expect(calcularVolumenEfectivo(sets)).toBe(1300);
    });

    it("esNuevoRecord y esRecord ignoran series 'W' y 'WARMUP' evitando falsos récords", () => {
      const marcas: MarcasEjercicio = {
        ejercicio_id: "ej-bench",
        frontera: [{ peso_kg: 80, reps_hechas: 5, fecha: "2026-10-20" }],
        max_peso_kg: 80,
        max_epley_kg: 93.3,
      };

      // Serie pesada pero marcada como W (calentamiento)
      const serieWarmup = { peso_kg: 120, reps_hechas: 5, set_type: "W" };
      expect(esNuevoRecord(serieWarmup, marcas).esRecord).toBe(false);
      expect(esRecord(serieWarmup, marcas)).toBe(false);

      const serieWarmupFull = { peso_kg: 120, reps_hechas: 5, set_type: "WARMUP" };
      expect(esNuevoRecord(serieWarmupFull, marcas).esRecord).toBe(false);
      expect(esRecord(serieWarmupFull, marcas)).toBe(false);

      // Serie normal supera la marca
      const serieNormal = { peso_kg: 85, reps_hechas: 5, set_type: "NORMAL" };
      expect(esNuevoRecord(serieNormal, marcas).esRecord).toBe(true);
      expect(esRecord(serieNormal, marcas)).toBe(true);
    });

    it("agregarSerieAMarcas no altera la frontera ni los máximos cuando la serie es de calentamiento", () => {
      const marcas: MarcasEjercicio = {
        ejercicio_id: "ej-bench",
        frontera: [{ peso_kg: 80, reps_hechas: 5, fecha: "2026-10-20" }],
        max_peso_kg: 80,
        max_epley_kg: 93.3,
      };

      const warmup = { peso_kg: 90, reps_hechas: 5, set_type: "W", fecha: "2026-10-26" };
      const marcasTrasWarmup = agregarSerieAMarcas(marcas, "ej-bench", warmup);

      expect(marcasTrasWarmup.max_peso_kg).toBe(80);
      expect(marcasTrasWarmup.frontera).toHaveLength(1);
    });
  });

  describe("3. Presencia de componentes visuales en LiveWorkout y WarmupModal", () => {
    it("el badge ámbar 'Calentamiento (W)' se muestra claramente identificado", () => {
      expect(liveWorkoutCode).toContain('data-testid="warmup-badge"');
      expect(liveWorkoutCode).toContain("Calentamiento (W)");
      expect(liveWorkoutCode).toContain("border-amber-500");
    });

    it("el bloque visual dedicado 'Series de Calentamiento' está separado de las series efectivas en vivo", () => {
      expect(liveWorkoutCode).toContain('data-testid="warmup-sets-section"');
      expect(liveWorkoutCode).toContain("Series de Calentamiento");
      expect(liveWorkoutCode).toContain('data-testid="effective-sets-section"');
      expect(liveWorkoutCode).toContain("Series Efectivas");
    });

    it("en el registro del día se separan las series de calentamiento de las efectivas", () => {
      expect(liveWorkoutCode).toContain('data-testid={`registro-warmup-section-${ej.id}`}');
      expect(liveWorkoutCode).toContain('data-testid={`registro-effective-section-${ej.id}`}');
    });

    it("el modal de calentamiento expone botones de registro directo y carga de 4 series", () => {
      expect(warmupModalCode).toContain('data-testid="warmup-calculator-modal"');
      expect(warmupModalCode).toContain('data-testid="apply-warmup-sets-btn"');
      expect(warmupModalCode).toContain('data-testid={`register-warmup-btn-${p.setNumber}`}');
    });
  });
});
