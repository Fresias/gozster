import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { calculateEpley1RM } from "@/lib/strength-metrics";
import { playRestTimerAlert, triggerHapticVibration } from "@/lib/sound";
import { useOfflineQueueStore } from "./use-offline-queue";

export type AthleteMembershipStatus = "ACTIVE" | "EXPIRED_PAYMENT_PENDING";

export interface LiveWorkoutSet {
  numero_serie: number;
  peso_kg: number;
  reps_hechas: number;
  rpe_real: number;
  completada: boolean;
  estimated1RM: number;
  completedAt?: string;
}

export interface LiveWorkoutExercise {
  id: string;
  nombre: string;
  musculos_principales: string[];
  descanso_segundos: number;
  rpe_objetivo: number;
  repeticiones_objetivo: string;
  series: LiveWorkoutSet[];
}

export interface LiveWorkoutSession {
  id: string;
  nombre_rutina: string;
  fecha: string;
  ejercicios: LiveWorkoutExercise[];
}

export interface RestTimerState {
  isActive: boolean;
  isPaused: boolean;
  secondsRemaining: number;
  totalSeconds: number;
  exerciseName: string;
  setNumber: number;
}

interface AthleteStoreState {
  membershipStatus: AthleteMembershipStatus;
  currentSession: LiveWorkoutSession;
  restTimer: RestTimerState;

  // Actions
  setMembershipStatus: (status: AthleteMembershipStatus) => void;
  updateSetField: (
    exerciseId: string,
    setNumber: number,
    field: "peso_kg" | "reps_hechas" | "rpe_real",
    value: number,
  ) => void;
  completeSet: (exerciseId: string, setNumber: number) => void;
  uncompleteSet: (exerciseId: string, setNumber: number) => void;

  // Timer Actions
  startRestTimer: (seconds: number, exerciseName: string, setNumber: number) => void;
  tickTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => void;
  addTimerSeconds: (seconds: number) => void;

  // Reset / Sync
  resetSessionToDefaults: () => void;
}

const defaultSession: LiveWorkoutSession = {
  id: "session-today-001",
  nombre_rutina: "Día 1: Piernas & Empuje (Fuerza Máxima)",
  fecha: new Date().toISOString().split("T")[0] || "2026-10-16",
  ejercicios: [
    {
      id: "ej-sentadilla-1",
      nombre: "Sentadilla Trasera con Barra",
      musculos_principales: ["Cuádriceps", "Glúteos", "Core"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "6-8",
      series: [
        {
          numero_serie: 1,
          peso_kg: 100,
          reps_hechas: 8,
          rpe_real: 7.5,
          completada: false,
          estimated1RM: calculateEpley1RM(100, 8),
        },
        {
          numero_serie: 2,
          peso_kg: 105,
          reps_hechas: 6,
          rpe_real: 8,
          completada: false,
          estimated1RM: calculateEpley1RM(105, 6),
        },
        {
          numero_serie: 3,
          peso_kg: 110,
          reps_hechas: 5,
          rpe_real: 8.5,
          completada: false,
          estimated1RM: calculateEpley1RM(110, 5),
        },
        {
          numero_serie: 4,
          peso_kg: 110,
          reps_hechas: 5,
          rpe_real: 9,
          completada: false,
          estimated1RM: calculateEpley1RM(110, 5),
        },
      ],
    },
    {
      id: "ej-press-banca-2",
      nombre: "Press de Banca Plano",
      musculos_principales: ["Pectorales", "Tríceps", "Deltoides Frontal"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "8-10",
      series: [
        {
          numero_serie: 1,
          peso_kg: 80,
          reps_hechas: 10,
          rpe_real: 7.5,
          completada: false,
          estimated1RM: calculateEpley1RM(80, 10),
        },
        {
          numero_serie: 2,
          peso_kg: 85,
          reps_hechas: 8,
          rpe_real: 8,
          completada: false,
          estimated1RM: calculateEpley1RM(85, 8),
        },
        {
          numero_serie: 3,
          peso_kg: 85,
          reps_hechas: 8,
          rpe_real: 8.5,
          completada: false,
          estimated1RM: calculateEpley1RM(85, 8),
        },
      ],
    },
    {
      id: "ej-peso-muerto-3",
      nombre: "Peso Muerto Rumano",
      musculos_principales: ["Isquiosurales", "Glúteos", "Espalda Baja"],
      descanso_segundos: 75,
      rpe_objetivo: 7.5,
      repeticiones_objetivo: "10-12",
      series: [
        {
          numero_serie: 1,
          peso_kg: 90,
          reps_hechas: 10,
          rpe_real: 7,
          completada: false,
          estimated1RM: calculateEpley1RM(90, 10),
        },
        {
          numero_serie: 2,
          peso_kg: 95,
          reps_hechas: 10,
          rpe_real: 7.5,
          completada: false,
          estimated1RM: calculateEpley1RM(95, 10),
        },
        {
          numero_serie: 3,
          peso_kg: 95,
          reps_hechas: 10,
          rpe_real: 8,
          completada: false,
          estimated1RM: calculateEpley1RM(95, 10),
        },
      ],
    },
  ],
};

const memoryFallback: Record<string, string> = {};

const safeStorage: StateStorage = {
  getItem: (name: string): string | null => {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(name);
    }
    return memoryFallback[name] ?? null;
  },
  setItem: (name: string, value: string): void => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(name, value);
      return;
    }
    memoryFallback[name] = value;
  },
  removeItem: (name: string): void => {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(name);
      return;
    }
    delete memoryFallback[name];
  },
};

export const useAthleteStore = create<AthleteStoreState>()(
  persist(
    (set, get) => ({
      membershipStatus: "ACTIVE",
      currentSession: defaultSession,
      restTimer: {
        isActive: false,
        isPaused: false,
        secondsRemaining: 0,
        totalSeconds: 0,
        exerciseName: "",
        setNumber: 0,
      },

      setMembershipStatus: (status) => set({ membershipStatus: status }),

      updateSetField: (exerciseId, setNumber, field, value) => {
        set((state) => {
          const updatedExercises = state.currentSession.ejercicios.map((ej) => {
            if (ej.id !== exerciseId) return ej;
            const updatedSeries = ej.series.map((s) => {
              if (s.numero_serie !== setNumber) return s;
              const updatedSet = { ...s, [field]: value };
              // Recalcula 1RM en vivo cuando cambia peso o reps
              updatedSet.estimated1RM = calculateEpley1RM(
                field === "peso_kg" ? value : updatedSet.peso_kg,
                field === "reps_hechas" ? value : updatedSet.reps_hechas,
              );
              return updatedSet;
            });
            return { ...ej, series: updatedSeries };
          });

          return {
            currentSession: {
              ...state.currentSession,
              ejercicios: updatedExercises,
            },
          };
        });
      },

      completeSet: (exerciseId, setNumber) => {
        const state = get();
        const targetExercise = state.currentSession.ejercicios.find(
          (e) => e.id === exerciseId,
        );
        const targetSet = targetExercise?.series.find(
          (s) => s.numero_serie === setNumber,
        );

        if (!targetExercise || !targetSet) return;

        const completedAt = new Date().toISOString();
        const estimated1RM = calculateEpley1RM(
          targetSet.peso_kg,
          targetSet.reps_hechas,
        );

        // 1. Marcar serie como completada
        set((prevState) => ({
          currentSession: {
            ...prevState.currentSession,
            ejercicios: prevState.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              return {
                ...ej,
                series: ej.series.map((s) => {
                  if (s.numero_serie !== setNumber) return s;
                  return {
                    ...s,
                    completada: true,
                    estimated1RM,
                    completedAt,
                  };
                }),
              };
            }),
          },
        }));

        // 2. Acumular evento en cola offline de Zustand
        useOfflineQueueStore.getState().enqueueEvent({
          id: `set-${exerciseId}-${setNumber}-${Date.now()}`,
          action: "WORKOUT_SET_COMPLETED",
          payload: {
            sessionId: state.currentSession.id,
            exerciseId,
            exerciseName: targetExercise.nombre,
            setNumber,
            pesoKg: targetSet.peso_kg,
            reps: targetSet.reps_hechas,
            rpe: targetSet.rpe_real,
            estimated1RM,
            completedAt,
          },
        });

        // 3. Iniciar automáticamente temporizador de descanso
        const restDuration = targetExercise.descanso_segundos || 90;
        get().startRestTimer(restDuration, targetExercise.nombre, setNumber);
      },

      uncompleteSet: (exerciseId, setNumber) => {
        set((prevState) => ({
          currentSession: {
            ...prevState.currentSession,
            ejercicios: prevState.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              return {
                ...ej,
                series: ej.series.map((s) => {
                  if (s.numero_serie !== setNumber) return s;
                  return {
                    ...s,
                    completada: false,
                    completedAt: undefined,
                  };
                }),
              };
            }),
          },
        }));
      },

      startRestTimer: (seconds, exerciseName, setNumber) => {
        set({
          restTimer: {
            isActive: true,
            isPaused: false,
            secondsRemaining: seconds,
            totalSeconds: seconds,
            exerciseName,
            setNumber,
          },
        });
      },

      tickTimer: () => {
        const { restTimer } = get();
        if (!restTimer.isActive || restTimer.isPaused) return;

        if (restTimer.secondsRemaining <= 1) {
          // Timer terminado: reproducir sonido y vibrar
          playRestTimerAlert();
          triggerHapticVibration([300, 150, 300]);
          set({
            restTimer: {
              ...restTimer,
              isActive: false,
              secondsRemaining: 0,
            },
          });
        } else {
          set({
            restTimer: {
              ...restTimer,
              secondsRemaining: restTimer.secondsRemaining - 1,
            },
          });
        }
      },

      pauseTimer: () => {
        set((state) => ({
          restTimer: { ...state.restTimer, isPaused: true },
        }));
      },

      resumeTimer: () => {
        set((state) => ({
          restTimer: { ...state.restTimer, isPaused: false },
        }));
      },

      stopTimer: () => {
        set({
          restTimer: {
            isActive: false,
            isPaused: false,
            secondsRemaining: 0,
            totalSeconds: 0,
            exerciseName: "",
            setNumber: 0,
          },
        });
      },

      addTimerSeconds: (seconds) => {
        set((state) => ({
          restTimer: {
            ...state.restTimer,
            secondsRemaining: state.restTimer.secondsRemaining + seconds,
            totalSeconds: state.restTimer.totalSeconds + seconds,
          },
        }));
      },

      resetSessionToDefaults: () => {
        set({
          currentSession: defaultSession,
          restTimer: {
            isActive: false,
            isPaused: false,
            secondsRemaining: 0,
            totalSeconds: 0,
            exerciseName: "",
            setNumber: 0,
          },
        });
      },
    }),
    {
      name: "gozster-athlete-store",
      storage: createJSONStorage(() => safeStorage),
      // No persistir el estado dinámico del temporizador para evitar inconsistencias al recargar
      partialize: (state) => ({
        membershipStatus: state.membershipStatus,
        currentSession: state.currentSession,
      }),
    },
  ),
);
