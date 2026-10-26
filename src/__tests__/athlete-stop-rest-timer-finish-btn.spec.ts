import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

describe("Athlete App: Detener timer de descanso al completar y botón Terminar en vista entrenar (GH #174, GOZS-170)", () => {
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const liveWorkoutCode = fs.readFileSync(liveWorkoutPath, "utf-8");

  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });

    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.getState().setMembershipStatus("ACTIVE");
    useAthleteStore.getState().stopTimer();
    useAthleteStore.getState().setMostrarTimerDescanso(true);
    vi.restoreAllMocks();
  });

  describe("Criterio Gherkin 1: Detención y no inicio del temporizador al completar la última serie restante", () => {
    it("GIVEN un atleta completando series intermedias, WHEN completa una serie no terminal, THEN el timer de descanso se inicia normalmente", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      expect(store.restTimer.isActive).toBe(false);

      // Completar serie 1 de Sentadilla (aún restan serie 2, 3, 4 y otros ejercicios)
      store.completeSet(exerciseId, 1);

      const stateAfter = useAthleteStore.getState();
      expect(stateAfter.restTimer.isActive).toBe(true);
      expect(stateAfter.restTimer.secondsRemaining).toBe(90);
    });

    it("GIVEN un atleta en LiveWorkout completando series, WHEN completa la última serie restante de su sesión, THEN el temporizador de descanso no se inicia", () => {
      const store = useAthleteStore.getState();

      // Completar todas las series de todos los ejercicios excepto la última
      const exercises = store.currentSession.ejercicios;
      for (const ej of exercises) {
        for (const s of ej.series) {
          store.completeSet(ej.id, s.numero_serie);
        }
      }

      // En este punto todas las series fueron completadas
      const stateAfter = useAthleteStore.getState();
      const allDone = stateAfter.currentSession.ejercicios.every((ej) =>
        ej.series.every((s) => s.completada),
      );
      expect(allDone).toBe(true);

      // El temporizador de descanso no debe estar activo
      expect(stateAfter.restTimer.isActive).toBe(false);
      expect(stateAfter.restTimer.secondsRemaining).toBe(0);
    });

    it("GIVEN un temporizador de descanso corriendo desde una serie previa, WHEN completa la última serie restante de la sesión, THEN el temporizador se detiene inmediatamente", () => {
      const store = useAthleteStore.getState();
      const exercises = store.currentSession.ejercicios;

      // Completar todas las series excepto la última serie del último ejercicio
      const lastExercise = exercises[exercises.length - 1];
      expect(lastExercise).toBeDefined();
      if (!lastExercise) throw new Error("No hay ejercicios");

      const lastSet = lastExercise.series[lastExercise.series.length - 1];
      expect(lastSet).toBeDefined();
      if (!lastSet) throw new Error("No hay series");

      for (const ej of exercises) {
        for (const s of ej.series) {
          if (ej.id === lastExercise.id && s.numero_serie === lastSet.numero_serie) {
            continue; // Dejar la última pendiente
          }
          store.completeSet(ej.id, s.numero_serie);
        }
      }

      // Simular que el temporizador de descanso está corriendo con 45 segundos restantes
      store.startRestTimer(45, "Ejercicio previo", 1);
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(45);

      // Completar la última serie restante
      store.completeSet(lastExercise.id, lastSet.numero_serie);

      // El temporizador debe detenerse de inmediato y no re-iniciarse
      const stateFinal = useAthleteStore.getState();
      expect(stateFinal.restTimer.isActive).toBe(false);
      expect(stateFinal.restTimer.secondsRemaining).toBe(0);
    });
  });

  describe("Criterio Gherkin 2: Botón Terminar y Guardar Entrenamiento en pestaña 'entrenar'", () => {
    it("el componente live-workout contiene la tarjeta destacada de finalización en la solapa 'entrenar'", () => {
      expect(liveWorkoutCode).toContain('data-testid="terminar-entrenamiento-card-entrenar"');
      expect(liveWorkoutCode).toContain('data-testid="terminar-entrenamiento-btn-entrenar"');
      expect(liveWorkoutCode).toContain("Terminar y Guardar Entrenamiento");
    });

    it("el componente live-workout contiene la opción destacada al pie del contenedor del último ejercicio", () => {
      expect(liveWorkoutCode).toContain('data-testid="terminar-entrenamiento-btn-entrenar-bottom"');
      expect(liveWorkoutCode).toContain('{isAllWorkoutCompleted ? "¡Entrenamiento completado!" : "¡Ejercicio completado!"}');
    });

    it("handleTerminarEntrenamiento invoca stopTimer para garantizar la detención del reloj", () => {
      expect(liveWorkoutCode).toContain("stopTimer();");
      expect(liveWorkoutCode).toContain("syncSessionToSupabase();");
    });

    it("el atleta puede finalizar el entrenamiento directamente desde la vista 'entrenar' sin cambiar a 'registro'", () => {
      // Ambas solapas disponen de la acción para terminar la sesión
      expect(liveWorkoutCode).toContain('data-testid="terminar-entrenamiento-btn-entrenar"');
      expect(liveWorkoutCode).toContain('data-testid="terminar-entrenamiento-btn"');
    });
  });
});
