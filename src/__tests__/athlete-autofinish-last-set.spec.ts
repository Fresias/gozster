import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

describe("Athlete App: Auto-finalización en última serie (26/26) y ocultamiento de controles (GOZS-173 / Issue #179)", () => {
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

  describe("Criterio Gherkin 1: Guardado y sincronización automática al completar la última serie pendiente", () => {
    it("GIVEN un atleta completando la serie final de la sesión, THEN finaliza y sincroniza automáticamente sin pasos manuales", async () => {
      const diaId = "6a669097-5bd8-4547-87f7-a43700000001";
      let syncDisparado = false;

      const sesionPrueba: LiveWorkoutSession = {
        id: "session-test-001",
        nombre_rutina: "Rutina Prueba",
        fecha: "2026-10-26",
        studentId: "student-001",
        dia_id: diaId,
        ejercicios: [
          {
            id: "ej-test-1",
            ejercicio_id: "55ddab2b-3449-41af-a04d-1f5ce33ad7d6",
            nombre: "Sentadilla",
            musculos_principales: ["Piernas"],
            descanso_segundos: 90,
            rpe_objetivo: 8,
            repeticiones_objetivo: "6-8",
            series: [
              { numero_serie: 1, peso_kg: 100, reps_hechas: 5, rpe_real: 8, completada: true, estimated1RM: 115 },
              { numero_serie: 2, peso_kg: 105, reps_hechas: 5, rpe_real: 8, completada: false, estimated1RM: 120 },
            ],
          },
        ],
      };

      useAthleteStore.setState({
        diaActivoId: diaId,
        sesionesCompletadas: [],
        currentSession: sesionPrueba,
        syncSessionToSupabase: async () => {
          syncDisparado = true;
          return { success: true };
        },
      });

      // Antes de la última serie: día no completado y sync no disparado
      expect(useAthleteStore.getState().sesionesCompletadas.some((s) => s.dia_id === diaId)).toBe(false);
      expect(syncDisparado).toBe(false);

      // WHEN completa la última serie pendiente (serie 2 de 2)
      useAthleteStore.getState().completeSet("ej-test-1", 2);

      // THEN sincroniza automáticamente
      expect(syncDisparado).toBe(true);

      // AND marca el día completado en sesionesCompletadas
      expect(useAthleteStore.getState().sesionesCompletadas.some((s) => s.dia_id === diaId)).toBe(true);
    });
  });

  describe("Criterio Gherkin 2: Ocultamiento automático de controles interactivos de registro", () => {
    it("el código de LiveWorkout oculta single-set-card cuando el ejercicio o el entrenamiento están completados", () => {
      // Verifica que no se renderiza incondicionalmente {serie ? (
      expect(liveWorkoutCode).not.toMatch(/\{\s*serie\s*\?\s*\(\s*<Card[^>]*data-testid=\{`single-set-card/);

      // Verifica que se condiciona con la completitud de series o del entrenamiento
      expect(liveWorkoutCode).toContain("!currentExercise.series.every((s) => s.completada)");
      expect(liveWorkoutCode).toContain("!isAllWorkoutCompleted");
      expect(liveWorkoutCode).toContain("!workoutFinished");

      // Verifica que se ocultan los controles y se muestra el banner de finalización
      expect(liveWorkoutCode).toContain('data-testid="terminar-entrenamiento-btn-entrenar"');
      expect(liveWorkoutCode).toContain("¡Entrenamiento completado!");
      expect(liveWorkoutCode).toContain("¡Entrenamiento finalizado!");
    });

    it("en handleRegistrarSerie se verifica isLastSetOfWorkout para disparar handleTerminarEntrenamiento", () => {
      expect(liveWorkoutCode).toContain("completedSetsCount + 1 === totalSets");
      expect(liveWorkoutCode).toContain("void handleTerminarEntrenamiento()");
    });
  });

  describe("Criterio Gherkin 3: El temporizador de descanso NO se inicia al completar la última serie", () => {
    it("GIVEN que todas las series previas están completas, WHEN se completa la última serie, THEN el timer permanece inactivo", () => {
      const initialSession = useAthleteStore.getState().currentSession;
      const totalEjercicios = initialSession.ejercicios.length;
      const lastExercise = initialSession.ejercicios[totalEjercicios - 1]!;
      const lastSet = lastExercise.series[lastExercise.series.length - 1]!;

      useAthleteStore.setState({
        currentSession: {
          ...initialSession,
          ejercicios: initialSession.ejercicios.map((ej, eIdx) => ({
            ...ej,
            series: ej.series.map((s, sIdx) => ({
              ...s,
              completada: !(eIdx === totalEjercicios - 1 && sIdx === ej.series.length - 1),
            })),
          })),
        },
      });

      useAthleteStore.getState().setMostrarTimerDescanso(true);
      useAthleteStore.getState().stopTimer();
      expect(useAthleteStore.getState().restTimer.isActive).toBe(false);

      // Completar la última serie (26/26)
      useAthleteStore.getState().completeSet(lastExercise.id, lastSet.numero_serie);

      // El temporizador de descanso NO debe estar activo
      expect(useAthleteStore.getState().restTimer.isActive).toBe(false);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(0);
    });

    it("GIVEN que aún quedan series pendientes en la sesión, WHEN se completa una serie intermedia, THEN sí inicia el temporizador de descanso", () => {
      const store = useAthleteStore.getState();
      store.setMostrarTimerDescanso(true);
      store.stopTimer();
      expect(useAthleteStore.getState().restTimer.isActive).toBe(false);

      // Completar serie 1 de sentadilla (quedan 25 series más pendientes)
      store.completeSet("ej-sentadilla-1", 1);

      // El temporizador DEBE iniciarse
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(90);
    });
  });
});
