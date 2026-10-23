import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

describe("Athlete App: Ejercicio de a una serie + Registro del día editable (GOZS-148)", () => {
  const liveWorkoutPath = path.resolve(__dirname, "../components/athlete/live-workout.tsx");
  const popoverPath = path.resolve(__dirname, "../components/ui/popover.tsx");
  const tabsPath = path.resolve(__dirname, "../components/ui/tabs.tsx");

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

  describe("1. Avance de a una serie y precarga de peso y reps", () => {
    it("al completar la serie 1, la marca completada y precarga peso y reps en la serie 2", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      // Ajustar serie 1 a 25 kg x 10 reps
      store.updateSetField(exerciseId, 1, "peso_kg", 25);
      store.updateSetField(exerciseId, 1, "reps_hechas", 10);

      // Completar serie 1
      store.completeSet(exerciseId, 1);

      const stateAfter = useAthleteStore.getState();
      const exercise = stateAfter.currentSession.ejercicios.find((e) => e.id === exerciseId);
      const set1 = exercise?.series.find((s) => s.numero_serie === 1);
      const set2 = exercise?.series.find((s) => s.numero_serie === 2);

      // Serie 1 completada
      expect(set1?.completada).toBe(true);
      expect(set1?.peso_kg).toBe(25);
      expect(set1?.reps_hechas).toBe(10);

      // Serie 2 aún no completada pero con peso y reps precargados de la última vez
      expect(set2?.completada).toBe(false);
      expect(set2?.peso_kg).toBe(25);
      expect(set2?.reps_hechas).toBe(10);
    });

    it("el componente live-workout muestra una sola tarjeta visible para la serie actual", () => {
      expect(liveWorkoutCode).toContain('data-testid={`single-set-card-${currentExercise.id}-${serie.numero_serie}`}');
      expect(liveWorkoutCode).toContain('data-testid="registrar-serie-btn"');
      expect(liveWorkoutCode).toContain('{serie.numero_serie}');
      expect(liveWorkoutCode).toContain('{currentExercise.series.length}');
      expect(liveWorkoutCode).toContain("Última vez:");
    });

    it("la confirmación optimista de serie guardada usa los colores y formato de spec", () => {
      expect(liveWorkoutCode).toContain('data-testid="optimistic-saved-banner"');
      expect(liveWorkoutCode).toContain("bg-[#ECFDF5]");
      expect(liveWorkoutCode).toContain("text-[#047857]");
      expect(liveWorkoutCode).toContain("border-[#A7F3D0]");
      expect(liveWorkoutCode).toContain("guardada ·");
    });
  });

  describe("2. Chip de descanso con Popover explicativo", () => {
    it("el chip de descanso está conectado al popover con la explicación del coach", () => {
      expect(liveWorkoutCode).toContain('data-testid={`descanso-chip-${currentExercise.id}`}');
      expect(liveWorkoutCode).toContain('data-testid="descanso-popover-content"');
      expect(liveWorkoutCode).toContain("Descanso: {currentExercise.descanso_segundos} segundos");
      expect(liveWorkoutCode).toContain(
        "Es el tiempo que tu coach recomienda esperar entre una serie y la siguiente para recuperarte."
      );
    });

    it("los componentes primitivos Tabs y Popover existen y son ligeros sin dependencias pesadas", () => {
      expect(fs.existsSync(popoverPath)).toBe(true);
      expect(fs.existsSync(tabsPath)).toBe(true);
      const popoverCode = fs.readFileSync(popoverPath, "utf-8");
      const tabsCode = fs.readFileSync(tabsPath, "utf-8");
      expect(popoverCode).not.toContain("@radix-ui");
      expect(tabsCode).not.toContain("@radix-ui");
    });
  });

  describe("3. Pestañas Entrenar | Registro del día y edición en línea de series", () => {
    it("live-workout expone pestañas con contador para Registro del día", () => {
      expect(liveWorkoutCode).toContain('data-testid="tab-entrenar"');
      expect(liveWorkoutCode).toContain('data-testid="tab-registro-dia"');
      expect(liveWorkoutCode).toContain('data-testid="registro-dia-counter"');
      expect(liveWorkoutCode).toContain('data-testid="registro-dia-container"');
    });

    it("permite editar una serie ya completada y persiste en el store y cola offline", () => {
      const store = useAthleteStore.getState();
      const exerciseId = "ej-sentadilla-1";

      // 1. Completar serie 1 con 20 kg x 8 reps
      store.updateSetField(exerciseId, 1, "peso_kg", 20);
      store.updateSetField(exerciseId, 1, "reps_hechas", 8);
      store.completeSet(exerciseId, 1);

      // 2. Simular modo offline
      useOfflineQueueStore.getState().setOnlineStatus(false);
      useOfflineQueueStore.getState().clearQueue();

      // 3. Editar la serie completada en Registro del día a 25 kg x 10 reps
      store.editCompletedSet(exerciseId, 1, 25, 10);

      const stateAfter = useAthleteStore.getState();
      const updatedSet = stateAfter.currentSession.ejercicios
        .find((e) => e.id === exerciseId)
        ?.series.find((s) => s.numero_serie === 1);

      // Verificación en store local
      expect(updatedSet?.peso_kg).toBe(25);
      expect(updatedSet?.reps_hechas).toBe(10);
      expect(updatedSet?.estimated1RM).toBeCloseTo(33.333, 2);

      // Verificación en cola offline
      const pendingEvents = useOfflineQueueStore.getState().pendingEvents;
      expect(pendingEvents).toHaveLength(1);
      const event = pendingEvents[0];
      expect(event?.action).toBe("WORKOUT_SET_UPDATED");
      expect(event?.payload).toMatchObject({
        exerciseId,
        setNumber: 1,
        pesoKg: 25,
        reps: 10,
      });
    });

    it("expone el lápiz de 48x48, steppers, Guardar cambio, Cancelar y Todo guardado", () => {
      expect(liveWorkoutCode).toContain('data-testid={`edit-set-btn-${ej.id}-${s.numero_serie}`}');
      expect(liveWorkoutCode).toContain('data-testid="cancel-edit-set-btn"');
      expect(liveWorkoutCode).toContain('data-testid="save-edit-set-btn"');
      expect(liveWorkoutCode).toContain("Todo guardado");
      expect(liveWorkoutCode).toContain("Terminar entrenamiento");
      expect(liveWorkoutCode).toContain('data-testid="terminar-entrenamiento-btn"');
    });
  });

  describe("4. Comportamiento del Timer según la preferencia mostrarTimerDescanso", () => {
    it("GIVEN mostrarTimerDescanso === true, WHEN se completa una serie, THEN inicia el temporizador", () => {
      const store = useAthleteStore.getState();
      store.setMostrarTimerDescanso(true);
      expect(useAthleteStore.getState().restTimer.isActive).toBe(false);

      store.completeSet("ej-sentadilla-1", 1);

      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);
      expect(useAthleteStore.getState().restTimer.secondsRemaining).toBe(90);
    });

    it("GIVEN mostrarTimerDescanso === false, WHEN se completa una serie, THEN NO inicia el temporizador", () => {
      const store = useAthleteStore.getState();
      store.setMostrarTimerDescanso(false);
      store.stopTimer();

      expect(useAthleteStore.getState().restTimer.isActive).toBe(false);

      store.completeSet("ej-sentadilla-1", 1);

      // El temporizador debe permanecer inactivo
      expect(useAthleteStore.getState().restTimer.isActive).toBe(false);
    });
  });

  describe("5. Vista Técnica conserva extras dentro de la tarjeta única", () => {
    it("conserva RPE, taxonomía de series, calentamiento y discos en Vista Técnica", () => {
      expect(liveWorkoutCode).toContain("!isSimpleView && (");
      expect(liveWorkoutCode).toContain('data-testid="input-rpe"');
      expect(liveWorkoutCode).toContain("Tipo de Serie");
      expect(liveWorkoutCode).toContain('data-testid={`warmup-btn-${currentExercise.id}`}');
      expect(liveWorkoutCode).toContain("Discos");
      expect(liveWorkoutCode).toContain("serie.estimated1RM.toFixed(1)} kg 1RM");
    });
  });
});
