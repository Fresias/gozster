import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { calculateEpley1RM, calculateEffectiveVolume } from "@/lib/strength-metrics";
import { playRestTimerAlert, triggerHapticVibration } from "@/lib/sound";
import { useOfflineQueueStore } from "./use-offline-queue";
import { supabase } from "@/lib/supabase/client";
import {
  REAL_ALUMNOS,
  REAL_PLANES,
  REAL_DIAS,
  REAL_EJERCICIOS,
  REAL_EJERCICIOS_RUTINA,
} from "@/services/real-mynter-data";
import type {
  NivelVistaAlumno,
  AlumnoCuestionarioInicial,
} from "@/types/database.types";
import type { PainReportData } from "@/components/athlete/pain-report-modal";

export type AthleteMembershipStatus = "ACTIVE" | "EXPIRED_PAYMENT_PENDING";

export interface LiveWorkoutSet {
  numero_serie: number;
  peso_kg: number;
  reps_hechas: number;
  rpe_real: number;
  completada: boolean;
  estimated1RM: number;
  completedAt?: string;
  set_type?: "W" | "N" | "F" | "D" | "WARMUP" | "NORMAL" | "FAILURE" | "DROPSET";
  pain_reported?: boolean;
  pain_notes?: string;
  video_url?: string;
  last_session_weight_kg?: number;
  last_session_reps?: number;
}

export interface LiveWorkoutExercise {
  id: string;
  nombre: string;
  musculos_principales: string[];
  descanso_segundos: number;
  rpe_objetivo: number;
  repeticiones_objetivo: string;
  series: LiveWorkoutSet[];
  url_video?: string | null;
  comentario?: string | null;
  tempo?: string;
  force_rpe_required?: boolean;
  es_superserie?: boolean;
  grupo_superserie?: number | null;
}

export interface LiveWorkoutSession {
  id: string;
  nombre_rutina: string;
  fecha: string;
  ejercicios: LiveWorkoutExercise[];
  studentName?: string;
  studentId?: string;
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
  rpeValidationError: string | null;
  stopProtocolActive: boolean;
  nivelVistaAlumno: NivelVistaAlumno;
  vistaElegidaPorAlumno: NivelVistaAlumno | null;
  vistaRecomendadaCoach: NivelVistaAlumno;
  cuestionarioInicial: AlumnoCuestionarioInicial | null;
  // Preferencias locales del onboarding de primera vez (GOZS-145). Este store
  // es el dueño de ambos campos; el ejercicio en vivo consume mostrarTimerDescanso.
  onboardingCompletado: boolean;
  mostrarTimerDescanso: boolean;
  // Estado del Inicio Mis días (GOZS-147)
  diaActivoId: string | null;
  diaElegidoHoyId: string | null;
  sesionesCompletadas: Array<{ id: string; dia_id: string; fecha: string }>;

  // Actions
  empezarDia: (diaId: string) => void;
  volverAlInicio: () => void;
  elegirOtroDia: (diaId: string) => void;
  deshacerCambioDia: () => void;
  marcarDiaCompletado: (diaId: string) => void;
  setMembershipStatus: (status: AthleteMembershipStatus) => void;
  setStopProtocolActive: (active: boolean) => void;
  setNivelVistaAlumno: (nivel: NivelVistaAlumno) => void;
  usarVistaRecomendada: () => void;
  setOnboardingCompletado: (completado: boolean) => void;
  setMostrarTimerDescanso: (mostrar: boolean) => void;
  setCuestionarioInicial: (data: AlumnoCuestionarioInicial | null) => void;
  saveCuestionarioInicial: (
    data: Partial<AlumnoCuestionarioInicial>,
  ) => Promise<{ success: boolean; error?: string }>;
  clearRpeValidationError: () => void;
  updateSetField: (
    exerciseId: string,
    setNumber: number,
    field: "peso_kg" | "reps_hechas" | "rpe_real",
    value: number,
  ) => void;
  updateSetType: (
    exerciseId: string,
    setNumber: number,
    type: "W" | "N" | "F" | "D",
  ) => void;
  reportPainForSet: (
    exerciseId: string,
    setNumber: number,
    notes: string,
  ) => void;
  reportPainEvent: (report: PainReportData) => Promise<void>;
  attachVideoForSet: (
    exerciseId: string,
    setNumber: number,
    videoUrl: string,
  ) => void;
  applyWarmupSetsToExercise: (
    exerciseId: string,
    warmupSets: Array<{ peso_kg: number; reps: number; setNumber: number }>,
  ) => void;
  completeSet: (exerciseId: string, setNumber: number) => void;
  uncompleteSet: (exerciseId: string, setNumber: number) => void;
  editCompletedSet: (
    exerciseId: string,
    setNumber: number,
    pesoKg: number,
    reps: number,
  ) => void;
  syncSessionToSupabase: () => Promise<{ success: boolean; error?: string }>;

  // Timer Actions
  startRestTimer: (seconds: number, exerciseName: string, setNumber: number) => void;
  tickTimer: () => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => void;
  addTimerSeconds: (seconds: number) => void;

  // Session & Routine Loaders
  setSession: (session: LiveWorkoutSession) => void;
  loadStudentSession: (studentId?: string, diaId?: string) => boolean;
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
      url_video: "bEv6CCg2BC8",
      comentario: "Mantener el pecho erguido, peso repartido en todo el pie y descenso controlado abriendo caderas.",
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
      url_video: "rT7DgCr-3pg",
      comentario: "Retracción escapular activa, agarre firme simétrico y trayectoria diagonal hacia el pecho inferior.",
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
      url_video: "SEdqd1n0cvg",
      comentario: "Empujar la cadera hacia atrás manteniendo las rodillas semi-flexionadas y espalda completamente neutra.",
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
      nivelVistaAlumno: "SIMPLE",
      vistaElegidaPorAlumno: null,
      vistaRecomendadaCoach: "SIMPLE",
      cuestionarioInicial: null,
      onboardingCompletado: false,
      mostrarTimerDescanso: true,
      diaActivoId: null,
      diaElegidoHoyId: null,
      sesionesCompletadas: [],
      rpeValidationError: null,
      stopProtocolActive: false,
      restTimer: {
        isActive: false,
        isPaused: false,
        secondsRemaining: 0,
        totalSeconds: 0,
        exerciseName: "",
        setNumber: 0,
      },

      setMembershipStatus: (status) => set({ membershipStatus: status }),
      empezarDia: (diaId) => {
        const studentId = get().currentSession.studentId || "f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7";
        get().loadStudentSession(studentId, diaId);
        set({ diaActivoId: diaId });
      },
      volverAlInicio: () => set({ diaActivoId: null }),
      elegirOtroDia: (diaId) => set({ diaElegidoHoyId: diaId }),
      deshacerCambioDia: () => set({ diaElegidoHoyId: null }),
      marcarDiaCompletado: (diaId) =>
        set((state) => {
          const nuevasSesiones = [
            ...state.sesionesCompletadas.filter((s) => s.dia_id !== diaId),
            {
              id: `sesion-${Date.now()}`,
              dia_id: diaId,
              fecha: new Date().toISOString(),
            },
          ];
          return {
            sesionesCompletadas: nuevasSesiones,
            diaElegidoHoyId: state.diaElegidoHoyId === diaId ? null : state.diaElegidoHoyId,
          };
        }),
      setStopProtocolActive: (active) => set({ stopProtocolActive: active }),
      setNivelVistaAlumno: (nivel) =>
        set({
          vistaElegidaPorAlumno: nivel,
          nivelVistaAlumno: nivel,
        }),
      usarVistaRecomendada: () =>
        set((state) => ({
          vistaElegidaPorAlumno: null,
          nivelVistaAlumno: state.vistaRecomendadaCoach || "SIMPLE",
        })),
      setOnboardingCompletado: (completado) =>
        set({ onboardingCompletado: completado }),
      setMostrarTimerDescanso: (mostrar) =>
        set({ mostrarTimerDescanso: mostrar }),
      setCuestionarioInicial: (data) => set({ cuestionarioInicial: data }),
      saveCuestionarioInicial: async (data) => {
        const studentId =
          get().currentSession.studentId || "f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7";
        const nowIso = new Date().toISOString();
        const prev = get().cuestionarioInicial;
        const fullRecord: AlumnoCuestionarioInicial = {
          id: prev?.id || `cuest-${Date.now()}`,
          alumno_id: studentId,
          objetivo_principal:
            data.objetivo_principal !== undefined
              ? data.objetivo_principal
              : (prev?.objetivo_principal ?? null),
          experiencia_previa:
            data.experiencia_previa !== undefined
              ? data.experiencia_previa
              : (prev?.experiencia_previa ?? null),
          dias_disponibles_semana:
            data.dias_disponibles_semana !== undefined
              ? data.dias_disponibles_semana
              : (prev?.dias_disponibles_semana ?? null),
          molestias_o_lesiones_previas:
            data.molestias_o_lesiones_previas !== undefined
              ? data.molestias_o_lesiones_previas
              : (prev?.molestias_o_lesiones_previas ?? null),
          equipamiento_disponible:
            data.equipamiento_disponible !== undefined
              ? data.equipamiento_disponible
              : (prev?.equipamiento_disponible ?? null),
          respuestas_extra:
            data.respuestas_extra !== undefined
              ? data.respuestas_extra
              : (prev?.respuestas_extra ?? {}),
          completado_at: prev?.completado_at || nowIso,
          updated_at: nowIso,
        };

        set({ cuestionarioInicial: fullRecord });

        useOfflineQueueStore.getState().enqueueEvent({
          id: `cuest-${Date.now()}`,
          action: "UPSERT_CUESTIONARIO_INICIAL",
          payload: fullRecord,
        });

        try {
          if (supabase) {
            const { error } = await supabase
              .from("alumno_cuestionario_inicial")
              .upsert(
                {
                  alumno_id: studentId,
                  objetivo_principal: fullRecord.objetivo_principal,
                  experiencia_previa: fullRecord.experiencia_previa,
                  dias_disponibles_semana: fullRecord.dias_disponibles_semana,
                  molestias_o_lesiones_previas: fullRecord.molestias_o_lesiones_previas,
                  equipamiento_disponible: fullRecord.equipamiento_disponible,
                  respuestas_extra: fullRecord.respuestas_extra,
                  completado_at: fullRecord.completado_at,
                  updated_at: fullRecord.updated_at,
                },
                { onConflict: "alumno_id" }
              );
            if (error) {
              console.warn("Aviso guardando cuestionario inicial en Supabase:", error.message);
            }
          }
        } catch (err: any) {
          console.warn("Excepción guardando cuestionario inicial (guardado local offline):", err?.message || err);
        }

        return { success: true };
      },
      clearRpeValidationError: () => set({ rpeValidationError: null }),

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

      updateSetType: (exerciseId, setNumber, type) => {
        set((state) => ({
          currentSession: {
            ...state.currentSession,
            ejercicios: state.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              return {
                ...ej,
                series: ej.series.map((s) =>
                  s.numero_serie === setNumber ? { ...s, set_type: type } : s
                ),
              };
            }),
          },
        }));
      },

      reportPainForSet: (exerciseId, setNumber, notes) => {
        set((state) => ({
          currentSession: {
            ...state.currentSession,
            ejercicios: state.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              return {
                ...ej,
                series: ej.series.map((s) =>
                  s.numero_serie === setNumber
                    ? { ...s, pain_reported: true, pain_notes: notes }
                    : s
                ),
              };
            }),
          },
        }));
      },

      reportPainEvent: async (report) => {
        const state = get();
        const {
          exerciseId,
          setNumber,
          zonaArticular,
          severidad,
          sintomasAlarma,
          esSintomaAlarma,
          notasAlumno,
          momentoAparicion,
        } = report;

        // 1. Si está asociado a un ejercicio y serie, marcarlo
        if (exerciseId && setNumber) {
          const notesText = `[Dolor: ${severidad}] ${zonaArticular}${
            sintomasAlarma.length > 0 ? ` (Síntomas: ${sintomasAlarma.join(", ")})` : ""
          }${notasAlumno ? ` - ${notasAlumno}` : ""}`;

          set((s) => ({
            currentSession: {
              ...s.currentSession,
              ejercicios: s.currentSession.ejercicios.map((ej) => {
                if (ej.id !== exerciseId) return ej;
                return {
                  ...ej,
                  series: ej.series.map((serie) =>
                    serie.numero_serie === setNumber
                      ? { ...serie, pain_reported: true, pain_notes: notesText }
                      : serie
                  ),
                };
              }),
            },
          }));
        }

        // 2. Activar protocolo de freno si hay Red Flags o dolor agudo
        if (esSintomaAlarma || severidad === "AGUDO") {
          set({ stopProtocolActive: true });
        }

        // 3. Encolar evento offline en Zustand
        useOfflineQueueStore.getState().enqueueEvent({
          id: `pain-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          action: "PAIN_REPORT_SUBMITTED",
          payload: {
            sessionId: state.currentSession.id,
            studentId:
              state.currentSession.studentId || "f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7",
            ...report,
          },
        });

        // 4. Guardar en Supabase si está disponible
        try {
          const studentId =
            state.currentSession.studentId || "f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7";
          const resolvedExerciseId =
            exerciseId && exerciseId.length === 36
              ? exerciseId
              : "30000000-0000-0000-0000-000000000001";

          await supabase.from("alumno_historial_dolor").insert({
            alumno_id: studentId,
            ejercicio_id: resolvedExerciseId,
            zona_articular: zonaArticular,
            severidad,
            momento_aparicion: momentoAparicion,
            es_sintoma_alarma: esSintomaAlarma,
            sintomas_alarma: sintomasAlarma,
            notas_alumno: notasAlumno || null,
            estado: "PENDIENTE",
          });
        } catch {
          // Silencioso en modo offline o test
        }
      },

      attachVideoForSet: (exerciseId, setNumber, videoUrl) => {
        set((state) => ({
          currentSession: {
            ...state.currentSession,
            ejercicios: state.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              return {
                ...ej,
                series: ej.series.map((s) =>
                  s.numero_serie === setNumber ? { ...s, video_url: videoUrl } : s
                ),
              };
            }),
          },
        }));
      },

      applyWarmupSetsToExercise: (exerciseId, warmupSets) => {
        set((state) => ({
          currentSession: {
            ...state.currentSession,
            ejercicios: state.currentSession.ejercicios.map((ej) => {
              if (ej.id !== exerciseId) return ej;
              // Crear series de calentamiento con set_type = 'W'
              const wSets: LiveWorkoutSet[] = warmupSets.map((w, idx) => ({
                numero_serie: idx + 1,
                peso_kg: w.peso_kg,
                reps_hechas: w.reps,
                rpe_real: 6.0,
                completada: false,
                estimated1RM: calculateEpley1RM(w.peso_kg, w.reps),
                set_type: "W",
              }));
              // Re-numerar las series existentes
              const existingSets = ej.series.map((s, idx) => ({
                ...s,
                numero_serie: wSets.length + idx + 1,
              }));
              return {
                ...ej,
                series: [...wSets, ...existingSets],
              };
            }),
          },
        }));
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

        // Hevy control del coach: coach_force_rpe_enabled
        if (
          targetExercise.force_rpe_required &&
          (!targetSet.rpe_real || targetSet.rpe_real < 6.0 || targetSet.rpe_real > 10.0)
        ) {
          set({
            rpeValidationError: `El Coach exige registrar un RPE válido (6.0 a 10.0) en "${targetExercise.nombre}" antes de completar la serie.`,
          });
          return;
        }

        set({ rpeValidationError: null });

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
                  if (s.numero_serie === setNumber) {
                    return {
                      ...s,
                      completada: true,
                      estimated1RM,
                      completedAt,
                    };
                  }
                  if (s.numero_serie === setNumber + 1 && !s.completada) {
                    return {
                      ...s,
                      peso_kg: targetSet.peso_kg,
                      reps_hechas: targetSet.reps_hechas,
                      estimated1RM,
                    };
                  }
                  return s;
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
            setType: targetSet.set_type || "N",
            painReported: targetSet.pain_reported || false,
            painNotes: targetSet.pain_notes || null,
            videoUrl: targetSet.video_url || null,
            estimated1RM,
            completedAt,
          },
        });

        // 3. Iniciar automáticamente temporizador de descanso si mostrarTimerDescanso es true
        if (state.mostrarTimerDescanso !== false) {
          const restDuration = targetExercise.descanso_segundos || 90;
          get().startRestTimer(restDuration, targetExercise.nombre, setNumber);
        }
      },

      editCompletedSet: (
        exerciseId: string,
        setNumber: number,
        pesoKg: number,
        reps: number,
      ) => {
        const state = get();
        const targetExercise = state.currentSession.ejercicios.find(
          (e) => e.id === exerciseId,
        );
        const targetSet = targetExercise?.series.find(
          (s) => s.numero_serie === setNumber,
        );

        if (!targetExercise || !targetSet) return;

        const estimated1RM = calculateEpley1RM(pesoKg, reps);
        const updatedAt = new Date().toISOString();

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
                    peso_kg: pesoKg,
                    reps_hechas: reps,
                    estimated1RM,
                  };
                }),
              };
            }),
          },
        }));

        useOfflineQueueStore.getState().enqueueEvent({
          id: `set-edit-${exerciseId}-${setNumber}-${Date.now()}`,
          action: "WORKOUT_SET_UPDATED",
          payload: {
            sessionId: state.currentSession.id,
            exerciseId,
            exerciseName: targetExercise.nombre,
            setNumber,
            pesoKg,
            reps,
            estimated1RM,
            updatedAt,
          },
        });
      },

      syncSessionToSupabase: async () => {
        const state = get();
        const session = state.currentSession;
        const studentId = session.studentId || "f973b719-6aac-4cbf-a3fa-b5e4d1f8f3e7";

        // Aplanar todas las series
        const allSets = session.ejercicios.flatMap((e) =>
          e.series.map((s) => ({ ...s, exerciseId: e.id }))
        );

        const totalVol = allSets.reduce((acc, s) => {
          if (!s.completada) return acc;
          return acc + s.peso_kg * s.reps_hechas;
        }, 0);

        const effVol = calculateEffectiveVolume(allSets);

        try {
          // Guardar registro_sesiones en Supabase
          const { error: sesErr } = await supabase.from("registro_sesiones").upsert(
            {
              id: session.id,
              alumno_id: studentId,
              duracion_minutos: 45,
              volumen_total_kg: totalVol,
              effective_volume_kg: effVol,
            },
            { onConflict: "id" }
          );

          if (sesErr) {
            console.warn("Aviso guardando sesion en Supabase:", sesErr.message);
          }

          // Guardar cada serie en registro_series
          for (const s of allSets) {
            if (!s.completada) continue;
            const mappedType =
              s.set_type === "W"
                ? "WARMUP"
                : s.set_type === "F"
                ? "FAILURE"
                : s.set_type === "D"
                ? "DROPSET"
                : "NORMAL";

            // Resolver ejercicio_id válido para FK de Supabase
            const resolvedEjId = s.exerciseId.length === 36 ? s.exerciseId : "55ddab2b-3449-41af-a04d-1f5ce33ad7d6";

            await supabase.from("registro_series").upsert(
              {
                sesion_id: session.id,
                ejercicio_id: resolvedEjId,
                numero_serie: s.numero_serie,
                peso_kg: s.peso_kg,
                reps_hechas: s.reps_hechas,
                rpe_real: s.rpe_real,
                completada: true,
                set_type: mappedType,
                pain_reported: s.pain_reported || false,
                pain_notes: s.pain_notes || null,
                video_url: s.video_url || null,
              },
              { onConflict: "sesion_id, ejercicio_id, numero_serie" }
            );
          }

          return { success: true };
        } catch (e: any) {
          console.error("Error sincronizando sesion con Supabase:", e);
          return { success: false, error: e?.message || "Error al sincronizar con Supabase" };
        }
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

      setSession: (session) => {
        set({ currentSession: session });
      },

      loadStudentSession: (studentId, diaId) => {
        const student = studentId
          ? REAL_ALUMNOS.find((a) => a.id === studentId || a.nombre_completo.toLowerCase().includes(studentId.toLowerCase()))
          : REAL_ALUMNOS[0];

        if (!student) return false;

        const plan = REAL_PLANES.find((p) => p.alumno_id === student.id && p.estado === "ACTIVO") ||
          REAL_PLANES.find((p) => p.alumno_id === student.id) ||
          REAL_PLANES[0];

        if (!plan) return false;

        const dias = REAL_DIAS.filter((d) => d.plan_id === plan.id).sort((a, b) => a.orden - b.orden);
        if (dias.length === 0) return false;

        const selectedDia = (diaId ? dias.find((d) => d.id === diaId) : undefined) ?? dias[0];
        if (!selectedDia) return false;

        const ejRutinaList = REAL_EJERCICIOS_RUTINA.filter((er) => er.dia_id === selectedDia.id).sort(
          (a, b) => a.orden - b.orden,
        );

        if (ejRutinaList.length === 0) return false;

        const mappedExercises: LiveWorkoutExercise[] = ejRutinaList.map((er, idx) => {
          const ejMaestro = REAL_EJERCICIOS.find((e) => e.id === er.ejercicio_id);
          const seriesCount = typeof er.series === "number" && er.series > 0 ? er.series : 3;

          const sets: LiveWorkoutSet[] = Array.from({ length: seriesCount }, (_, sIdx) => ({
            numero_serie: sIdx + 1,
            peso_kg: 20,
            reps_hechas: 10,
            rpe_real: er.rpe_objetivo || 7.5,
            completada: false,
            estimated1RM: calculateEpley1RM(20, 10),
          }));

          return {
            id: er.id || `ej-${idx + 1}`,
            nombre: ejMaestro?.nombre || `Ejercicio #${idx + 1}`,
            musculos_principales: ejMaestro?.musculos_principales || [],
            descanso_segundos: er.descanso_segundos || 60,
            rpe_objetivo: er.rpe_objetivo || 8,
            repeticiones_objetivo: er.repeticiones || "10-12",
            series: sets,
            url_video: ejMaestro?.url_video || null,
            comentario: ejMaestro?.comentario || er.notas || null,
          };
        });

        const newSession: LiveWorkoutSession = {
          id: `session-${student.id}-${selectedDia.id}`,
          nombre_rutina: `${student.nombre_completo}: ${selectedDia.nombre}`,
          fecha: new Date().toISOString().split("T")[0] || "2026-10-16",
          ejercicios: mappedExercises,
          studentName: student.nombre_completo,
          studentId: student.id,
        };

        const coachRecomendada =
          (student.nivel_vista_alumno as NivelVistaAlumno) || "SIMPLE";
        const eleccionAlumno = get().vistaElegidaPorAlumno;
        const vistaEfectiva = eleccionAlumno ?? coachRecomendada;

        set({
          currentSession: newSession,
          vistaRecomendadaCoach: coachRecomendada,
          nivelVistaAlumno: vistaEfectiva,
          restTimer: {
            isActive: false,
            isPaused: false,
            secondsRemaining: 0,
            totalSeconds: 0,
            exerciseName: "",
            setNumber: 0,
          },
        });

        return true;
      },

      resetSessionToDefaults: () => {
        const eleccionAlumno = get().vistaElegidaPorAlumno;
        set({
          currentSession: defaultSession,
          vistaRecomendadaCoach: "SIMPLE",
          nivelVistaAlumno: eleccionAlumno ?? "SIMPLE",
          stopProtocolActive: false,
          diaActivoId: null,
          diaElegidoHoyId: null,
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
        nivelVistaAlumno: state.nivelVistaAlumno,
        vistaElegidaPorAlumno: state.vistaElegidaPorAlumno,
        vistaRecomendadaCoach: state.vistaRecomendadaCoach,
        cuestionarioInicial: state.cuestionarioInicial,
        onboardingCompletado: state.onboardingCompletado,
        mostrarTimerDescanso: state.mostrarTimerDescanso,
        sesionesCompletadas: state.sesionesCompletadas,
        diaElegidoHoyId: state.diaElegidoHoyId,
      }),
    },
  ),
);
