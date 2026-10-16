import { create } from "zustand";
import type {
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  Perfil,
  PlanEntrenamiento,
} from "@/types/database.types";
import {
  MOCK_ALUMNOS,
  MOCK_DIAS,
  MOCK_EJERCICIOS,
  MOCK_EJERCICIOS_RUTINA,
  MOCK_HISTORIAL_CARGAS,
  MOCK_PLANES,
  MOCK_PROFESOR_ID,
  type HistoricalLoadEntry,
} from "@/services/coach-mock-data";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

export type CoachStudioTab = "rutina_actual" | "historial_rutinas";

export interface ToastNotification {
  id: string;
  type: "success" | "info" | "warning";
  title: string;
  message: string;
}

interface CoachStudioState {
  alumnos: Perfil[];
  planes: PlanEntrenamiento[];
  dias: DiaRutina[];
  ejerciciosEnRutina: EjercicioEnRutina[];
  ejercicios: Ejercicio[];
  historialCargas: Record<string, HistoricalLoadEntry[]>;

  selectedAlumnoId: string | null;
  activeTab: CoachStudioTab;
  isHistoricalLoadsOpen: boolean;
  isChatOpen: boolean;
  toast: ToastNotification | null;

  currentPage: number;
  itemsPerPage: number;

  // Actions
  selectAlumno: (alumnoId: string | null) => void;
  setActiveTab: (tab: CoachStudioTab) => void;
  setHistoricalLoadsOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  setCurrentPage: (page: number) => void;
  dismissToast: () => void;

  clonarUltimaRutina: (alumnoId: string) => Promise<PlanEntrenamiento | null>;
  extenderVigenciaPlan: (
    planId: string,
    diasExtra?: number,
  ) => Promise<PlanEntrenamiento | null>;

  // Getters
  getSelectedAlumno: () => Perfil | null;
  getPlanesAlumno: (alumnoId: string) => PlanEntrenamiento[];
  getPlanesAlumnoCronologico: (alumnoId: string) => PlanEntrenamiento[];
  getRutinaActivaAlumno: (alumnoId: string) => PlanEntrenamiento | null;
  getHistorialCargasAlumno: (alumnoId: string) => HistoricalLoadEntry[];
}

export const useCoachStudioStore = create<CoachStudioState>()(
  (set, get) => ({
    alumnos: MOCK_ALUMNOS,
    planes: MOCK_PLANES,
    dias: MOCK_DIAS,
    ejerciciosEnRutina: MOCK_EJERCICIOS_RUTINA,
    ejercicios: MOCK_EJERCICIOS,
    historialCargas: MOCK_HISTORIAL_CARGAS,

    selectedAlumnoId: null,
    activeTab: "rutina_actual",
    isHistoricalLoadsOpen: false,
    isChatOpen: false,
    toast: null,

    currentPage: 1,
    itemsPerPage: 4,

    selectAlumno: (alumnoId) =>
      set({
        selectedAlumnoId: alumnoId,
        activeTab: "rutina_actual",
        isHistoricalLoadsOpen: false,
      }),

    setActiveTab: (activeTab) => set({ activeTab }),

    setHistoricalLoadsOpen: (isHistoricalLoadsOpen) =>
      set({ isHistoricalLoadsOpen }),

    setChatOpen: (isChatOpen) => set({ isChatOpen }),

    setCurrentPage: (currentPage) => set({ currentPage }),

    dismissToast: () => set({ toast: null }),

    getSelectedAlumno: () => {
      const { alumnos, selectedAlumnoId } = get();
      if (!selectedAlumnoId) return null;
      return alumnos.find((a) => a.id === selectedAlumnoId) ?? null;
    },

    getPlanesAlumno: (alumnoId) => {
      const { planes } = get();
      return planes.filter((p) => p.alumno_id === alumnoId);
    },

    getPlanesAlumnoCronologico: (alumnoId) => {
      const { planes } = get();
      return planes
        .filter((p) => p.alumno_id === alumnoId)
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
    },

    getRutinaActivaAlumno: (alumnoId) => {
      const planes = get().getPlanesAlumnoCronologico(alumnoId);
      return planes.find((p) => p.estado === "ACTIVO") ?? planes[0] ?? null;
    },

    getHistorialCargasAlumno: (alumnoId) => {
      const { historialCargas } = get();
      return historialCargas[alumnoId] ?? [];
    },

    clonarUltimaRutina: async (alumnoId: string) => {
      const planesAlumno = get().getPlanesAlumnoCronologico(alumnoId);
      const planBase = planesAlumno[0];

      const nombreBase = planBase ? planBase.nombre : "Plan de Entrenamiento";
      const nowIso = new Date().toISOString();
      const newPlanId = `plan-clone-${Date.now()}`;

      // 1. Optimistic Update in State
      const nuevoPlan: PlanEntrenamiento = {
        id: newPlanId,
        profesor_id: MOCK_PROFESOR_ID,
        alumno_id: alumnoId,
        nombre: `[Clon] ${nombreBase}`,
        estado: "ACTIVO",
        comentarios: `Clonado optimísticamente el ${new Date().toLocaleDateString("es-AR")}. Basado en ${planBase?.id ?? "plantilla"}.`,
        created_at: nowIso,
        updated_at: nowIso,
      };

      // Si había un plan activo previo, pasarlo a INACTIVO
      const updatedPlanes = get().planes.map((p) => {
        if (p.alumno_id === alumnoId && p.estado === "ACTIVO") {
          return { ...p, estado: "INACTIVO" as const, updated_at: nowIso };
        }
        return p;
      });

      // Copiar días y ejercicios si existían para el planBase
      const nuevosDias: DiaRutina[] = [];
      const nuevosEjercicios: EjercicioEnRutina[] = [];

      if (planBase) {
        const diasBase = get().dias.filter((d) => d.plan_id === planBase.id);
        for (const dia of diasBase) {
          const nuevoDiaId = `dia-clone-${Date.now()}-${dia.orden}`;
          nuevosDias.push({
            id: nuevoDiaId,
            plan_id: newPlanId,
            nombre: dia.nombre,
            orden: dia.orden,
            created_at: nowIso,
            updated_at: nowIso,
          });

          const ejerciciosBase = get().ejerciciosEnRutina.filter(
            (er) => er.dia_id === dia.id,
          );
          for (const ej of ejerciciosBase) {
            nuevosEjercicios.push({
              id: `er-clone-${Date.now()}-${ej.orden}`,
              dia_id: nuevoDiaId,
              ejercicio_id: ej.ejercicio_id,
              orden: ej.orden,
              series: ej.series,
              repeticiones: ej.repeticiones,
              descanso_segundos: ej.descanso_segundos,
              rpe_objetivo: ej.rpe_objetivo,
              notas: ej.notas,
              es_superserie: ej.es_superserie,
              grupo_superserie: ej.grupo_superserie,
              created_at: nowIso,
              updated_at: nowIso,
            });
          }
        }
      }

      set((state) => ({
        planes: [nuevoPlan, ...updatedPlanes],
        dias: [...state.dias, ...nuevosDias],
        ejerciciosEnRutina: [...state.ejerciciosEnRutina, ...nuevosEjercicios],
        toast: {
          id: `toast-${Date.now()}`,
          type: "success",
          title: "¡Rutina Clonada Exitosamente!",
          message: `Se ha creado "${nuevoPlan.nombre}" con feedback visual optimista.`,
        },
      }));

      // 2. Offline Queue Enqueueing
      useOfflineQueueStore.getState().enqueueEvent({
        id: `rpc-clonar-${Date.now()}`,
        action: "RPC_CLONAR_ULTIMA_RUTINA",
        payload: {
          alumnoId,
          planBaseId: planBase?.id,
          nuevoPlanId: nuevoPlan.id,
          nombre: nuevoPlan.nombre,
        },
      });

      return nuevoPlan;
    },

    extenderVigenciaPlan: async (planId: string, diasExtra: number = 30) => {
      const nowIso = new Date().toISOString();
      const plan = get().planes.find((p) => p.id === planId);
      if (!plan) return null;

      const notaExtension = ` | Vigencia extendida +${diasExtra} días (${new Date().toLocaleDateString("es-AR")})`;
      const updatedComentarios = (plan.comentarios ?? "") + notaExtension;

      // 1. Optimistic Update
      const planActualizado: PlanEntrenamiento = {
        ...plan,
        estado: "ACTIVO",
        comentarios: updatedComentarios,
        updated_at: nowIso,
      };

      set((state) => ({
        planes: state.planes.map((p) => (p.id === planId ? planActualizado : p)),
        toast: {
          id: `toast-${Date.now()}`,
          type: "success",
          title: "¡Vigencia Extendida!",
          message: `Se extendió la vigencia de "${plan.nombre}" por ${diasExtra} días adicionales.`,
        },
      }));

      // 2. Offline Queue Enqueueing
      useOfflineQueueStore.getState().enqueueEvent({
        id: `rpc-extender-${Date.now()}`,
        action: "RPC_EXTENDER_VIGENCIA_PLAN",
        payload: {
          planId,
          diasExtra,
          updatedAt: nowIso,
        },
      });

      return planActualizado;
    },
  }),
);
