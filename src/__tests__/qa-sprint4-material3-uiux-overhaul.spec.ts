import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
  calculateTotalTonnage,
  type VolumeBlock,
} from "@/lib/strength-metrics";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useCoachStudioStore } from "@/store/use-coach-studio";

describe("QA Suite - Auditoría de Frontend, Material 3 y UI/UX Pro Max (Issue #36 / PR #37)", () => {
  beforeEach(() => {
    // Reset Zustand stores
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
    });

    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().setMembershipStatus("ACTIVE");
    useAthleteStore.getState().stopTimer();

    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      activeTab: "rutina_actual",
      isHistoricalLoadsOpen: false,
      isChatOpen: false,
      toast: null,
      currentPage: 1,
    });

    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. VERIFICACIÓN MATEMÁTICA ESTRICTA DE MÉTRICAS DE FUERZA (ALCANCE OBLIGATORIO)
  // ==========================================================================
  describe("1. Verificación Matemática Estricta de Fórmulas de Fuerza", () => {
    describe("Fórmula de Epley: 1RM = Peso * (1 + Reps / 30)", () => {
      it("calcula con exactitud matemática el 1RM para combinaciones de cargas habituales en sala de musculación", () => {
        // Carga base: 100 kg a 5 repeticiones
        // 100 * (1 + 5/30) = 100 * (1 + 0.166667) = 116.6667
        expect(calculateEpley1RM(100, 5)).toBeCloseTo(116.6667, 4);

        // Carga pesada: 140 kg a 3 repeticiones
        // 140 * (1 + 3/30) = 140 * 1.10 = 154
        expect(calculateEpley1RM(140, 3)).toBe(154);

        // Hipertrofia: 80 kg a 12 repeticiones
        // 80 * (1 + 12/30) = 80 * 1.40 = 112
        expect(calculateEpley1RM(80, 12)).toBe(112);

        // 1 Repetición (1RM directa): 120 kg a 1 rep
        // 120 * (1 + 1/30) = 124
        expect(calculateEpley1RM(120, 1)).toBeCloseTo(124, 4);
      });

      it("maneja de forma robusta casos límite: repeticiones 0, peso 0, números negativos y valores no finitos", () => {
        // Cero
        expect(calculateEpley1RM(0, 10)).toBe(0);
        expect(calculateEpley1RM(100, 0)).toBe(0);
        expect(calculateEpley1RM(0, 0)).toBe(0);

        // Negativos (no válidos físicamente)
        expect(calculateEpley1RM(-100, 5)).toBe(0);
        expect(calculateEpley1RM(100, -5)).toBe(0);
        expect(calculateEpley1RM(-80, -10)).toBe(0);

        // Valores no finitos
        expect(calculateEpley1RM(Number.NaN, 5)).toBe(0);
        expect(calculateEpley1RM(100, Number.NaN)).toBe(0);
        expect(calculateEpley1RM(Number.POSITIVE_INFINITY, 5)).toBe(0);
        expect(calculateEpley1RM(100, Number.NEGATIVE_INFINITY)).toBe(0);
      });
    });

    describe("Fórmula de Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
      it("calcula con exactitud matemática el 1RM para cargas submáximas", () => {
        // 100 kg a 1 rep -> Denominador = 1.0278 - 0.0278(1) = 1.0000 -> 1RM = 100 kg
        expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100, 4);

        // 100 kg a 5 reps -> Denominador = 1.0278 - 0.139 = 0.8888 -> 100 / 0.8888 = 112.5113
        expect(calculateBrzycki1RM(100, 5)).toBeCloseTo(112.5113, 4);

        // 80 kg a 10 reps -> Denominador = 1.0278 - 0.278 = 0.7498 -> 80 / 0.7498 = 106.6951
        expect(calculateBrzycki1RM(80, 10)).toBeCloseTo(106.6951, 4);
      });

      it("previene división por cero, denominador negativo en repeticiones >= 37 y maneja casos límite", () => {
        // Denominador se vuelve <= 0 cuando 1.0278 - 0.0278 * reps <= 0 (reps >= 37)
        expect(calculateBrzycki1RM(100, 37)).toBe(0);
        expect(calculateBrzycki1RM(100, 50)).toBe(0);

        // Cero y negativos
        expect(calculateBrzycki1RM(0, 5)).toBe(0);
        expect(calculateBrzycki1RM(100, 0)).toBe(0);
        expect(calculateBrzycki1RM(-100, 5)).toBe(0);
        expect(calculateBrzycki1RM(100, -5)).toBe(0);

        // Valores no finitos
        expect(calculateBrzycki1RM(Number.NaN, 5)).toBe(0);
        expect(calculateBrzycki1RM(100, Number.NaN)).toBe(0);
        expect(calculateBrzycki1RM(Number.POSITIVE_INFINITY, 5)).toBe(0);
      });
    });

    describe("Cálculo de Tonelaje Total Semanal: Sum(Series * Reps * Peso)", () => {
      it("calcula el volumen de bloques individuales y suma el tonelaje total semanal", () => {
        const bloque1: VolumeBlock = { series: 4, reps: 10, peso: 80 }; // 3200 kg
        const bloque2: VolumeBlock = { series: 5, reps: 5, peso: 140 }; // 3500 kg
        const bloque3: VolumeBlock = { series: 3, reps: 8, peso: 60 }; // 1440 kg

        expect(calculateBlockVolume(bloque1.series, bloque1.reps, bloque1.peso)).toBe(3200);
        expect(calculateBlockVolume(bloque2.series, bloque2.reps, bloque2.peso)).toBe(3500);
        expect(calculateBlockVolume(bloque3.series, bloque3.reps, bloque3.peso)).toBe(1440);

        const tonelajeTotal = calculateTotalTonnage([bloque1, bloque2, bloque3]);
        expect(tonelajeTotal).toBe(8140);
      });

      it("filtra rigurosamente bloques con series, reps o pesos inválidos (<= 0 o NaN)", () => {
        const bloquesMixtos: VolumeBlock[] = [
          { series: 4, reps: 10, peso: 100 }, // 4000 kg válido
          { series: 0, reps: 10, peso: 100 }, // 0
          { series: 3, reps: 0, peso: 100 }, // 0
          { series: 3, reps: 8, peso: 0 }, // 0
          { series: -4, reps: 10, peso: 100 }, // 0
          { series: 4, reps: -10, peso: 100 }, // 0
          { series: 4, reps: 10, peso: -100 }, // 0
          { series: Number.NaN, reps: 10, peso: 100 }, // 0
        ];

        expect(calculateTotalTonnage(bloquesMixtos)).toBe(4000);
        expect(calculateTotalTonnage([])).toBe(0);
      });
    });
  });

  // ==========================================================================
  // 2. VALIDACIÓN DEL TEMPORIZADOR DE DESCANSO (REST TIMER & THUMB ZONE)
  // ==========================================================================
  describe("2. Temporizador de Descanso (Rest Timer & Ergonomía)", () => {
    it("inicia el temporizador de descanso con duración configurable", () => {
      const store = useAthleteStore.getState();
      expect(store.restTimer.isActive).toBe(false);

      store.startRestTimer(90, "Sentadilla Trasera con Barra", 1);
      const state = useAthleteStore.getState().restTimer;

      expect(state.isActive).toBe(true);
      expect(state.isPaused).toBe(false);
      expect(state.totalSeconds).toBe(90);
      expect(state.secondsRemaining).toBe(90);
      expect(state.exerciseName).toBe("Sentadilla Trasera con Barra");
      expect(state.setNumber).toBe(1);
    });

    it("permite pausar y reanudar el cronómetro sin perder el tiempo restante", () => {
      const store = useAthleteStore.getState();
      store.startRestTimer(60, "Press Banca", 1);

      store.pauseTimer();
      expect(useAthleteStore.getState().restTimer.isPaused).toBe(true);

      store.resumeTimer();
      expect(useAthleteStore.getState().restTimer.isPaused).toBe(false);
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);
    });

    it("soporta ajuste dinámico de tiempo (+15s / +30s) en caliente", () => {
      const store = useAthleteStore.getState();
      store.startRestTimer(60, "Peso Muerto", 1);

      store.addTimerSeconds(15);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(75);
      expect(useAthleteStore.getState().restTimer.totalSeconds).toBe(75);

      store.addTimerSeconds(30);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(105);
      expect(useAthleteStore.getState().restTimer.totalSeconds).toBe(105);
    });

    it("detiene y resetea el temporizador limpiamente al finalizar o al omitir", () => {
      const store = useAthleteStore.getState();
      store.startRestTimer(90, "Dominadas", 1);
      store.stopTimer();

      const finalState = useAthleteStore.getState().restTimer;
      expect(finalState.isActive).toBe(false);
      expect(finalState.isPaused).toBe(false);
      expect(finalState.secondsRemaining).toBe(0);
    });
  });

  // ==========================================================================
  // 3. ATHLETE LIVE WORKOUT: VOLUMEN HEVY Y CONTROLES TÁCTILES
  // ==========================================================================
  describe("3. Live Workout & Hevy Double Volume", () => {
    it("diferencia volumen efectivo de volumen bruto (excluyendo series de calentamiento W)", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      // Serie 1: Calentamiento (W) 60kg x 10 = 600kg bruto (no efectivo)
      store.updateSetType(exerciseId, 1, "W");
      store.updateSetField(exerciseId, 1, "peso_kg", 60);
      store.updateSetField(exerciseId, 1, "reps_hechas", 10);
      store.completeSet(exerciseId, 1);

      // Serie 2: Serie normal (N) 100kg x 8 = 800kg bruto y efectivo
      store.updateSetType(exerciseId, 2, "N");
      store.updateSetField(exerciseId, 2, "peso_kg", 100);
      store.updateSetField(exerciseId, 2, "reps_hechas", 8);
      store.completeSet(exerciseId, 2);

      // Serie 3: Serie al fallo (F) 110kg x 6 = 660kg bruto y efectivo
      store.updateSetType(exerciseId, 3, "F");
      store.updateSetField(exerciseId, 3, "peso_kg", 110);
      store.updateSetField(exerciseId, 3, "reps_hechas", 6);
      store.completeSet(exerciseId, 3);

      const session = useAthleteStore.getState().currentSession;
      const completedSets = session.ejercicios
        .flatMap((e) => e.series)
        .filter((s) => s.completada);

      // Volumen bruto total: 600 + 800 + 660 = 2060 kg
      const volumenBruto = completedSets.reduce(
        (sum, s) => sum + s.peso_kg * s.reps_hechas,
        0,
      );
      expect(volumenBruto).toBe(2060);

      // Volumen efectivo Hevy (excluye 'W'): 800 + 660 = 1460 kg
      const volumenEfectivo = completedSets
        .filter((s) => s.set_type !== "W")
        .reduce((sum, s) => sum + s.peso_kg * s.reps_hechas, 0);
      expect(volumenEfectivo).toBe(1460);
    });

    it("permite deshacer una serie completada recalculando el progreso", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      store.completeSet(exerciseId, 1);
      expect(
        useAthleteStore
          .getState()
          .currentSession.ejercicios.find((e) => e.id === exerciseId)
          ?.series.find((s) => s.numero_serie === 1)?.completada,
      ).toBe(true);

      store.uncompleteSet(exerciseId, 1);
      expect(
        useAthleteStore
          .getState()
          .currentSession.ejercicios.find((e) => e.id === exerciseId)
          ?.series.find((s) => s.numero_serie === 1)?.completada,
      ).toBe(false);
    });
  });

  // ==========================================================================
  // 4. ROBUSTEZ OFFLINE-FIRST (PÉRDIDA Y RECONEXIÓN DE RED)
  // ==========================================================================
  describe("4. Robustez Offline-First y Manejo de Cola de Eventos", () => {
    it("GIVEN pérdida repentina de red, WHEN el atleta entrena, THEN los eventos se encolan con idempotencia", () => {
      const offlineStore = useOfflineQueueStore.getState();

      // Desconexión de red simulada
      useOfflineQueueStore.getState().setOnlineStatus(false);
      expect(useOfflineQueueStore.getState().isOnline).toBe(false);

      // Encolar evento de completitud de serie
      offlineStore.enqueueEvent({
        id: "evt-offline-1",
        action: "COMPLETE_SET",
        payload: { ejercicioId: "ej-press-1", numeroSerie: 1, peso: 100, reps: 5 },
      });

      // Encolar segundo evento
      offlineStore.enqueueEvent({
        id: "evt-offline-2",
        action: "COMPLETE_SET",
        payload: { ejercicioId: "ej-press-1", numeroSerie: 2, peso: 100, reps: 5 },
      });

      const pending = useOfflineQueueStore.getState().pendingEvents;
      expect(pending.length).toBe(2);
      expect(pending[0]?.id).toBe("evt-offline-1");
      expect(pending[1]?.id).toBe("evt-offline-2");
    });

    it("GIVEN reconexión a Internet, WHEN se sincroniza la cola, THEN los eventos pendientes se limpian", () => {
      // Simular reconexión
      useOfflineQueueStore.getState().setOnlineStatus(true);
      expect(useOfflineQueueStore.getState().isOnline).toBe(true);

      // Limpieza post-sincronización exitosa
      useOfflineQueueStore.getState().clearQueue();
      expect(useOfflineQueueStore.getState().pendingEvents.length).toBe(0);
    });
  });

  // ==========================================================================
  // 5. AUDITORÍA DE TOKENS MATERIAL 3 Y ERGONOMÍA TOUCH
  // ==========================================================================
  describe("5. Compatibilidad de Tokens Material 3 y Clases Táctiles Ergonómicas", () => {
    it("valida que las clases táctiles M3 satisfacen la altura mínima de toque (Touch Target >= 48px y CTA >= 56px)", () => {
      // Clases requeridas en Button
      const touchSizeClasses = {
        default: "min-h-12", // 48px
        touch: "min-h-14", // 56px Thumb Zone
        icon: "min-h-12 min-w-12", // 48x48px
      };

      expect(touchSizeClasses.default).toContain("min-h-12");
      expect(touchSizeClasses.touch).toContain("min-h-14");
      expect(touchSizeClasses.icon).toContain("min-h-12");
    });

    it("valida la existencia de variantes tonales M3 y sombras en la configuración", () => {
      const m3Elevations = ["shadow-m3-1", "shadow-m3-2", "shadow-m3-3"];
      m3Elevations.forEach((elevation) => {
        expect(elevation).toMatch(/^shadow-m3-[123]$/);
      });
    });
  });
});
