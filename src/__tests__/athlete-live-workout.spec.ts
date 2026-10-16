import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { calculateEpley1RM, calculateBrzycki1RM } from "@/lib/strength-metrics";
import * as soundModule from "@/lib/sound";

describe("Athlete App - Suite de Entrenamiento en Vivo, Temporizador y Paywall (Issue #11)", () => {
  beforeEach(() => {
    // Limpiar stores de Zustand
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
    });

    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().setMembershipStatus("ACTIVE");
    useAthleteStore.getState().stopTimer();
    vi.restoreAllMocks();
  });

  describe("Criterio Gherkin 1: Paywall de Alumno Vencido (EXPIRED_PAYMENT_PENDING)", () => {
    it("GIVEN un alumno con estado EXPIRED_PAYMENT_PENDING, THEN el estado bloquea el acceso activo a las rutinas", () => {
      const store = useAthleteStore.getState();
      store.setMembershipStatus("EXPIRED_PAYMENT_PENDING");

      const currentStatus = useAthleteStore.getState().membershipStatus;
      expect(currentStatus).toBe("EXPIRED_PAYMENT_PENDING");
      expect(currentStatus === "ACTIVE").toBe(false);
    });

    it("GIVEN un alumno con cuota regularizada, WHEN pasa a ACTIVE, THEN recupera el acceso al entrenamiento en vivo", () => {
      const store = useAthleteStore.getState();
      store.setMembershipStatus("EXPIRED_PAYMENT_PENDING");
      expect(useAthleteStore.getState().membershipStatus).toBe(
        "EXPIRED_PAYMENT_PENDING",
      );

      store.setMembershipStatus("ACTIVE");
      expect(useAthleteStore.getState().membershipStatus).toBe("ACTIVE");
    });
  });

  describe("Criterio Gherkin 2: Registro Táctil de Series y Estimación de 1RM en Vivo", () => {
    it("calcula y actualiza en vivo el 1RM estimado al ajustar peso o repeticiones", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      // 100 kg x 5 reps -> 1RM Epley = 100 * (1 + 5/30) = 116.6667
      store.updateSetField(exerciseId, 1, "peso_kg", 100);
      store.updateSetField(exerciseId, 1, "reps_hechas", 5);

      const updatedSet = useAthleteStore
        .getState()
        .currentSession.ejercicios.find((e) => e.id === exerciseId)
        ?.series.find((s) => s.numero_serie === 1);

      expect(updatedSet?.peso_kg).toBe(100);
      expect(updatedSet?.reps_hechas).toBe(5);
      expect(updatedSet?.estimated1RM).toBeCloseTo(116.6667, 3);
      expect(calculateBrzycki1RM(100, 5)).toBeCloseTo(112.5113, 3);
    });

    it("permite registrar y modificar el RPE de la serie", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      store.updateSetField(exerciseId, 1, "rpe_real", 9);

      const updatedSet = useAthleteStore
        .getState()
        .currentSession.ejercicios.find((e) => e.id === exerciseId)
        ?.series.find((s) => s.numero_serie === 1);

      expect(updatedSet?.rpe_real).toBe(9);
    });
  });

  describe("Criterio Gherkin 3: Activación Automática del Temporizador de Descanso con Alertas Nativas", () => {
    it("al marcar una serie completada, activa automáticamente el temporizador regresivo de descanso", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      expect(store.restTimer.isActive).toBe(false);

      store.completeSet(exerciseId, 1);

      const stateAfter = useAthleteStore.getState();
      const targetSet = stateAfter.currentSession.ejercicios
        .find((e) => e.id === exerciseId)
        ?.series.find((s) => s.numero_serie === 1);

      // Serie marcada como completada
      expect(targetSet?.completada).toBe(true);
      expect(targetSet?.completedAt).toBeDefined();

      // Temporizador iniciado con la duración del ejercicio (90s para sentadilla)
      expect(stateAfter.restTimer.isActive).toBe(true);
      expect(stateAfter.restTimer.isPaused).toBe(false);
      expect(stateAfter.restTimer.secondsRemaining).toBe(90);
      expect(stateAfter.restTimer.exerciseName).toBe("Sentadilla Trasera con Barra");
      expect(stateAfter.restTimer.setNumber).toBe(1);
    });

    it("soporta pausar, reanudar y sumar tiempo (+15s) al temporizador de descanso", () => {
      const store = useAthleteStore.getState();
      store.startRestTimer(60, "Press de Banca", 2);

      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(60);

      store.pauseTimer();
      expect(useAthleteStore.getState().restTimer.isPaused).toBe(true);

      store.resumeTimer();
      expect(useAthleteStore.getState().restTimer.isPaused).toBe(false);

      store.addTimerSeconds(15);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(75);
    });

    it("dispara alertas sonoras nativas (Web Audio API) y vibración al llegar a 0s", () => {
      const playSoundSpy = vi.spyOn(soundModule, "playRestTimerAlert");
      const vibrateSpy = vi.spyOn(soundModule, "triggerHapticVibration");

      const store = useAthleteStore.getState();
      store.startRestTimer(1, "Press de Banca", 1);

      // Avanza el último segundo
      store.tickTimer();

      const timerState = useAthleteStore.getState().restTimer;
      expect(timerState.isActive).toBe(false);
      expect(timerState.secondsRemaining).toBe(0);

      // Verificación de llamadas nativas sin librerías externas
      expect(playSoundSpy).toHaveBeenCalledTimes(1);
      expect(vibrateSpy).toHaveBeenCalledTimes(1);
      expect(vibrateSpy).toHaveBeenCalledWith([300, 150, 300]);
    });
  });

  describe("Criterio Gherkin 4: Soporte Offline-First y Acumulación en Cola Zustand", () => {
    it("acumula los registros de series completadas en la cola offline de Zustand sin pérdida de datos", () => {
      const athleteStore = useAthleteStore.getState();
      const offlineQueue = useOfflineQueueStore.getState();

      // Simular Modo Avión
      offlineQueue.setOnlineStatus(false);
      expect(useOfflineQueueStore.getState().isOnline).toBe(false);

      // Completar serie 1 de Sentadilla
      athleteStore.updateSetField("ej-sentadilla-1", 1, "peso_kg", 120);
      athleteStore.updateSetField("ej-sentadilla-1", 1, "reps_hechas", 6);
      athleteStore.updateSetField("ej-sentadilla-1", 1, "rpe_real", 8.5);
      athleteStore.completeSet("ej-sentadilla-1", 1);

      // Completar serie 2 de Sentadilla
      athleteStore.updateSetField("ej-sentadilla-1", 2, "peso_kg", 125);
      athleteStore.updateSetField("ej-sentadilla-1", 2, "reps_hechas", 5);
      athleteStore.completeSet("ej-sentadilla-1", 2);

      const pendingEvents = useOfflineQueueStore.getState().pendingEvents;
      expect(pendingEvents).toHaveLength(2);

      const event1 = pendingEvents[0];
      expect(event1?.action).toBe("WORKOUT_SET_COMPLETED");
      expect(event1?.payload).toMatchObject({
        exerciseId: "ej-sentadilla-1",
        setNumber: 1,
        pesoKg: 120,
        reps: 6,
        rpe: 8.5,
      });

      const event2 = pendingEvents[1];
      expect(event2?.payload).toMatchObject({
        exerciseId: "ej-sentadilla-1",
        setNumber: 2,
        pesoKg: 125,
        reps: 5,
      });

      // Simular recuperación de conexión
      useOfflineQueueStore.getState().setOnlineStatus(true);
      expect(useOfflineQueueStore.getState().isOnline).toBe(true);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(2);

      // Limpieza controlada tras sincronización exitosa
      useOfflineQueueStore.getState().clearQueue();
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    });
  });
});
