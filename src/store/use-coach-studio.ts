import { create } from "zustand";
import type {
  Contratacion,
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  MedioPago,
  Perfil,
  PlanEntrenamiento,
} from "@/types/database.types";
import {
  computeAnchoredRenewalDate,
  derivarContratacionDesdePerfil,
} from "@/lib/contrataciones";
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
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import {
  calculateBlockVolume,
  calculateBrzycki1RM,
  calculateEpley1RM,
} from "@/lib/strength-metrics";

export type CoachStudioTab = "rutina_actual" | "historial_rutinas";

export interface ToastNotification {
  id: string;
  type: "success" | "info" | "warning";
  title: string;
  message: string;
}

export interface MetricasRetencion {
  cantActivas: number;
  cantSinPlanEntrenamiento: number;
  cantClientesPerdidosMes: number;
}

export interface SobrecargaProgresivaResultado {
  sesion_id: string;
  fecha: string;
  volumen_ejercicio_kg: number;
  peso_max_kg: number;
  hubo_sobrecarga: boolean;
}

export interface RecordHistoricoResultado {
  ejercicio_id: string;
  peso_max_kg: number;
  mejor_1rm_epley: number;
  mejor_1rm_brzycki: number;
}

export interface AlertaSobrecargaProgresiva {
  id: string;
  alumnoId: string;
  alumnoNombre: string;
  ejercicioId: string;
  ejercicioNombre: string;
  sesionId: string;
  fecha: string;
  pesoMaxKg: number;
  pesoPrevioKg: number | null;
  deltaPesoKg: number | null;
  volumenEjercicioKg: number;
  volumenPrevioKg: number | null;
  deltaVolumenKg: number | null;
  mejor1rmEpley: number;
  mejor1rmBrzycki: number;
  esNuevoRecord1RM: boolean;
  tipo: "CARGA" | "VOLUMEN" | "RECORD_1RM" | "AMBOS";
}

interface CoachStudioState {
  alumnos: Perfil[];
  planes: PlanEntrenamiento[];
  dias: DiaRutina[];
  ejerciciosEnRutina: EjercicioEnRutina[];
  ejercicios: Ejercicio[];
  historialCargas: Record<string, HistoricalLoadEntry[]>;
  contrataciones: Contratacion[];

  selectedAlumnoId: string | null;
  activeTab: CoachStudioTab;
  isHistoricalLoadsOpen: boolean;
  isChatOpen: boolean;
  isRoutineBuilderOpen: boolean;
  toast: ToastNotification | null;

  currentPage: number;
  itemsPerPage: number;

  isLoading: boolean;
  isLiveDatabase: boolean;
  loadLiveSupabaseData: () => Promise<void>;

  // Actions
  selectAlumno: (alumnoId: string | null) => void;
  setActiveTab: (tab: CoachStudioTab) => void;
  setHistoricalLoadsOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
  setCurrentPage: (page: number) => void;
  setRoutineBuilderOpen: (open: boolean) => void;
  dismissToast: () => void;

  clonarUltimaRutina: (alumnoId: string) => Promise<PlanEntrenamiento | null>;
  extenderVigenciaPlan: (
    planId: string,
    diasExtra?: number,
  ) => Promise<PlanEntrenamiento | null>;
  asignarPlanUrgente: (
    alumnoId: string,
    nombrePlan?: string,
  ) => Promise<PlanEntrenamiento>;

  // Contrataciones y Pagos (ADR-001)
  getContratacionAlumno: (alumno: Perfil) => Contratacion;
  registrarRenovacionManual: (input: {
    contratacion: Contratacion;
    monto: number;
    medioPago: MedioPago;
  }) => Promise<Contratacion>;
  extenderContratacionExcepcional: (input: {
    contratacion: Contratacion;
    nuevaFechaFin: string;
    motivo: string;
  }) => Promise<Contratacion>;

  // Getters & RPCs
  getSelectedAlumno: () => Perfil | null;
  getPlanesAlumno: (alumnoId: string) => PlanEntrenamiento[];
  getPlanesAlumnoCronologico: (alumnoId: string) => PlanEntrenamiento[];
  getRutinaActivaAlumno: (alumnoId: string) => PlanEntrenamiento | null;
  getHistorialCargasAlumno: (alumnoId: string) => HistoricalLoadEntry[];

  obtenerMetricasRetencion: (profesorId?: string | null) => MetricasRetencion;
  detectarSobrecargaProgresiva: (
    alumnoId: string,
    ejercicioId: string,
  ) => SobrecargaProgresivaResultado[];
  obtenerRecordsHistoricos: (
    alumnoId: string,
    ejercicioId?: string | null,
  ) => RecordHistoricoResultado[];
  getAlertasSobrecargaProgresiva: (
    profesorId?: string | null,
  ) => AlertaSobrecargaProgresiva[];
}

export const useCoachStudioStore = create<CoachStudioState>()(
  (set, get) => ({
    alumnos: MOCK_ALUMNOS,
    planes: MOCK_PLANES,
    dias: MOCK_DIAS,
    ejerciciosEnRutina: MOCK_EJERCICIOS_RUTINA,
    ejercicios: MOCK_EJERCICIOS,
    historialCargas: MOCK_HISTORIAL_CARGAS,
    contrataciones: [],

    selectedAlumnoId: null,
    activeTab: "rutina_actual",
    isHistoricalLoadsOpen: false,
    isChatOpen: false,
    isRoutineBuilderOpen: false,
    toast: null,

    currentPage: 1,
    itemsPerPage: 15,

    isLoading: false,
    isLiveDatabase: false,

    loadLiveSupabaseData: async () => {
      set({ isLoading: true });
      const dataset = await fetchLiveDatasetFromSupabase();
      if (dataset && dataset.alumnos.length > 0) {
        set({
          alumnos: dataset.alumnos,
          planes: dataset.planes,
          dias: dataset.dias,
          ejerciciosEnRutina: dataset.ejerciciosEnRutina,
          ejercicios: dataset.ejercicios,
          isLiveDatabase: true,
          isLoading: false,
          selectedAlumnoId: null,
        });
      } else {
        set({ isLoading: false });
      }
    },

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

    setRoutineBuilderOpen: (isRoutineBuilderOpen) => set({ isRoutineBuilderOpen }),

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
        fecha_inicio: nowIso,
        fecha_fin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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

    getContratacionAlumno: (alumno: Perfil) => {
      const stored = get().contrataciones.find(
        (c) => c.alumno_id === alumno.id,
      );
      return stored ?? derivarContratacionDesdePerfil(alumno);
    },

    registrarRenovacionManual: async ({ contratacion, monto, medioPago }) => {
      const nowIso = new Date().toISOString();

      // Regla de anclaje ADR-001: la nueva fecha de corte respeta el día de
      // vencimiento original ("no se corre la fecha"), aunque el pago llegue tarde.
      const nuevaFechaFin = computeAnchoredRenewalDate(
        contratacion.fecha_fin,
        contratacion.dia_vencimiento,
      );

      const idempotencyKey = `renov-${contratacion.id}-${contratacion.fecha_fin}-${medioPago}`;

      const actualizada: Contratacion = {
        ...contratacion,
        estado: "VIGENTE",
        fecha_fin: nuevaFechaFin,
        updated_at: nowIso,
      };

      set((state) => {
        const existe = state.contrataciones.some(
          (c) => c.id === contratacion.id,
        );
        const contrataciones = existe
          ? state.contrataciones.map((c) =>
              c.id === contratacion.id ? actualizada : c,
            )
          : [...state.contrataciones, actualizada];

        return {
          contrataciones,
          toast: {
            id: `toast-${Date.now()}`,
            type: "success",
            title: "Renovación confirmada",
            message: `Pago por ${medioPago === "TRANSFERENCIA" ? "transferencia" : "efectivo"} registrado. Próximo vencimiento: ${nuevaFechaFin} (día ${contratacion.dia_vencimiento} anclado).`,
          },
        };
      });

      useOfflineQueueStore.getState().enqueueEvent({
        id: `rpc-renov-${Date.now()}`,
        action: "RPC_REGISTRAR_Y_CONFIRMAR_RENOVACION",
        payload: {
          p_contratacion_id: contratacion.id,
          p_monto: monto,
          p_medio_pago: medioPago,
          p_idempotency_key: idempotencyKey,
          nuevaFechaFin,
          updatedAt: nowIso,
        },
      });

      return actualizada;
    },

    extenderContratacionExcepcional: async ({
      contratacion,
      nuevaFechaFin,
      motivo,
    }) => {
      const motivoLimpio = motivo.trim();
      if (!motivoLimpio) {
        throw new Error(
          "La extensión excepcional requiere un motivo obligatorio.",
        );
      }

      const nowIso = new Date().toISOString();
      const actualizada: Contratacion = {
        ...contratacion,
        estado: "VIGENTE",
        fecha_fin: nuevaFechaFin,
        updated_at: nowIso,
      };

      set((state) => {
        const existe = state.contrataciones.some(
          (c) => c.id === contratacion.id,
        );
        const contrataciones = existe
          ? state.contrataciones.map((c) =>
              c.id === contratacion.id ? actualizada : c,
            )
          : [...state.contrataciones, actualizada];

        return {
          contrataciones,
          toast: {
            id: `toast-${Date.now()}`,
            type: "warning",
            title: "Extensión excepcional aplicada",
            message: `Vencimiento extendido a ${nuevaFechaFin}. Motivo registrado en auditoría.`,
          },
        };
      });

      useOfflineQueueStore.getState().enqueueEvent({
        id: `rpc-extender-exc-${Date.now()}`,
        action: "RPC_EXTENDER_CONTRATACION_EXCEPCIONAL",
        payload: {
          p_contratacion_id: contratacion.id,
          p_nueva_fecha_fin: nuevaFechaFin,
          p_motivo: motivoLimpio,
          updatedAt: nowIso,
        },
      });

      return actualizada;
    },

    asignarPlanUrgente: async (alumnoId: string, nombrePlan?: string) => {
      const nowIso = new Date().toISOString();
      const planId = `plan-urgente-${Date.now()}`;
      const alumno = get().alumnos.find((a) => a.id === alumnoId);
      const nombreFinal =
        nombrePlan ||
        `Plan de Fuerza & Sobrecarga (${alumno?.nombre_completo.split(" ")[0] ?? "Atleta"})`;

      const nuevoPlan: PlanEntrenamiento = {
        id: planId,
        profesor_id: MOCK_PROFESOR_ID,
        alumno_id: alumnoId,
        nombre: nombreFinal,
        estado: "ACTIVO",
        comentarios: "Plan asignado con urgencia desde el Dashboard de Retención.",
        fecha_inicio: nowIso,
        fecha_fin: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: nowIso,
        updated_at: nowIso,
      };

      const diaId = `dia-urg-${Date.now()}-1`;
      const nuevoDia: DiaRutina = {
        id: diaId,
        plan_id: planId,
        nombre: "Día 1: Fuerza Básica & Sobrecarga",
        orden: 1,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const ej1: EjercicioEnRutina = {
        id: `er-urg-${Date.now()}-1`,
        dia_id: diaId,
        ejercicio_id: "e1111111-1111-4111-8111-111111111101", // Sentadilla Trasera
        orden: 1,
        series: 3,
        repeticiones: "8",
        descanso_segundos: 120,
        rpe_objetivo: 7.5,
        notas: "Iniciando con foco en sobrecarga progresiva.",
        es_superserie: false,
        grupo_superserie: null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const ej2: EjercicioEnRutina = {
        id: `er-urg-${Date.now()}-2`,
        dia_id: diaId,
        ejercicio_id: "e2222222-2222-4222-8222-222222222202", // Press Banca
        orden: 2,
        series: 3,
        repeticiones: "8",
        descanso_segundos: 120,
        rpe_objetivo: 7.5,
        notas: "Pausa en pecho.",
        es_superserie: false,
        grupo_superserie: null,
        created_at: nowIso,
        updated_at: nowIso,
      };

      set((state) => ({
        planes: [nuevoPlan, ...state.planes],
        dias: [...state.dias, nuevoDia],
        ejerciciosEnRutina: [...state.ejerciciosEnRutina, ej1, ej2],
        toast: {
          id: `toast-${Date.now()}`,
          type: "success",
          title: "¡Plan Asignado con Éxito!",
          message: `Se asignó "${nuevoPlan.nombre}" a ${alumno?.nombre_completo ?? "alumno"}.`,
        },
      }));

      useOfflineQueueStore.getState().enqueueEvent({
        id: `rpc-asignar-plan-${Date.now()}`,
        action: "RPC_ASIGNAR_PLAN_URGENTE",
        payload: {
          alumnoId,
          planId: nuevoPlan.id,
          nombre: nuevoPlan.nombre,
        },
      });

      return nuevoPlan;
    },

    obtenerMetricasRetencion: (profesorId?: string | null) => {
      const { alumnos, planes } = get();
      const alumnosFiltrados = profesorId
        ? alumnos.filter((a) => a.profesor_asignado_id === profesorId)
        : alumnos;

      // cantActivas: rol = 'ALUMNO' y estado_membresia IN ('ACTIVA', 'ACTIVE')
      const activas = alumnosFiltrados.filter(
        (a) =>
          a.rol === "ALUMNO" &&
          (a.estado_membresia === "ACTIVA" || a.estado_membresia === "ACTIVE"),
      );

      // cantSinPlanEntrenamiento: activas sin plan con estado = 'ACTIVO'
      const sinPlan = activas.filter((a) => {
        const planActivo = planes.find(
          (p) => p.alumno_id === a.id && p.estado === "ACTIVO",
        );
        return !planActivo;
      });

      // cantClientesPerdidosMes: rol = 'ALUMNO', estado IN ('INACTIVA', 'BAJA', 'ARCHIVED')
      // y fecha_baja >= inicio de mes actual (PostgreSQL date_trunc('month', now()))
      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      const perdidosMes = alumnosFiltrados.filter((a) => {
        if (a.rol !== "ALUMNO") return false;
        const isBaja =
          a.estado_membresia === "INACTIVA" ||
          a.estado_membresia === "BAJA" ||
          a.estado_membresia === "ARCHIVED";
        if (!isBaja) return false;
        if (!a.fecha_baja) return true;
        const fechaBaja = new Date(a.fecha_baja);
        return fechaBaja >= startOfMonth;
      });

      return {
        cantActivas: activas.length,
        cantSinPlanEntrenamiento: sinPlan.length,
        cantClientesPerdidosMes: perdidosMes.length,
      };
    },

    detectarSobrecargaProgresiva: (alumnoId: string, ejercicioId: string) => {
      const { historialCargas } = get();
      const alumnoHistorial = historialCargas[alumnoId] ?? [];

      const metricasPorSesion: {
        sesion_id: string;
        fecha: string;
        volumen_ejercicio_kg: number;
        peso_max_kg: number;
      }[] = [];

      for (const entry of alumnoHistorial) {
        const seriesValidas = entry.series.filter(
          (s) =>
            s.ejercicio_id === ejercicioId &&
            s.completada &&
            s.peso_kg > 0 &&
            s.reps_hechas > 0,
        );
        if (seriesValidas.length > 0) {
          const volumen = seriesValidas.reduce(
            (sum, s) => sum + s.peso_kg * s.reps_hechas,
            0,
          );
          const pesoMax = Math.max(...seriesValidas.map((s) => s.peso_kg));
          metricasPorSesion.push({
            sesion_id: entry.sesion.id,
            fecha: entry.sesion.fecha,
            volumen_ejercicio_kg: Math.round(volumen * 100) / 100,
            peso_max_kg: Math.round(pesoMax * 100) / 100,
          });
        }
      }

      // Ordenar cronológicamente ascendente para calcular LAG
      metricasPorSesion.sort(
        (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
      );

      const resultado: SobrecargaProgresivaResultado[] = [];

      for (let i = 0; i < metricasPorSesion.length; i++) {
        const actual = metricasPorSesion[i]!;
        if (i === 0) {
          resultado.push({
            ...actual,
            hubo_sobrecarga: false,
          });
        } else {
          const previo = metricasPorSesion[i - 1]!;
          const huboSobrecarga =
            actual.peso_max_kg > previo.peso_max_kg ||
            actual.volumen_ejercicio_kg > previo.volumen_ejercicio_kg;
          resultado.push({
            ...actual,
            hubo_sobrecarga: huboSobrecarga,
          });
        }
      }

      // Devolver ordenado DESC por fecha como la RPC de Supabase
      return resultado.sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      );
    },

    obtenerRecordsHistoricos: (alumnoId: string, ejercicioId?: string | null) => {
      const { historialCargas } = get();
      const alumnoHistorial = historialCargas[alumnoId] ?? [];

      const seriesPorEjercicio: Record<
        string,
        { peso_kg: number; reps_hechas: number }[]
      > = {};

      for (const entry of alumnoHistorial) {
        for (const serie of entry.series) {
          if (
            serie.completada &&
            serie.peso_kg > 0 &&
            serie.reps_hechas > 0 &&
            (!ejercicioId || serie.ejercicio_id === ejercicioId)
          ) {
            if (!seriesPorEjercicio[serie.ejercicio_id]) {
              seriesPorEjercicio[serie.ejercicio_id] = [];
            }
            seriesPorEjercicio[serie.ejercicio_id]!.push({
              peso_kg: serie.peso_kg,
              reps_hechas: serie.reps_hechas,
            });
          }
        }
      }

      const records: RecordHistoricoResultado[] = [];

      for (const [ejId, series] of Object.entries(seriesPorEjercicio)) {
        const pesoMax = Math.max(...series.map((s) => s.peso_kg));
        const epleyVals = series.map((s) => calculateEpley1RM(s.peso_kg, s.reps_hechas));
        const brzyckiVals = series.map((s) => calculateBrzycki1RM(s.peso_kg, s.reps_hechas));

        records.push({
          ejercicio_id: ejId,
          peso_max_kg: Math.round(pesoMax * 100) / 100,
          mejor_1rm_epley: Math.round(Math.max(...epleyVals) * 100) / 100,
          mejor_1rm_brzycki: Math.round(Math.max(...brzyckiVals) * 100) / 100,
        });
      }

      return records;
    },

    getAlertasSobrecargaProgresiva: (profesorId?: string | null) => {
      const { alumnos, ejercicios } = get();
      const alumnosFiltrados = profesorId
        ? alumnos.filter((a) => a.profesor_asignado_id === profesorId)
        : alumnos;

      const alertas: AlertaSobrecargaProgresiva[] = [];

      for (const alumno of alumnosFiltrados) {
        for (const ejercicio of ejercicios) {
          const sobrecargas = get().detectarSobrecargaProgresiva(alumno.id, ejercicio.id);
          const records = get().obtenerRecordsHistoricos(alumno.id, ejercicio.id);
          const recordEj = records.find((r) => r.ejercicio_id === ejercicio.id);

          // Recorrer las sobrecargas cronológicas ascendente para hallar previos
          const sobrecargasAsc = [...sobrecargas].sort(
            (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
          );

          for (let i = 0; i < sobrecargasAsc.length; i++) {
            const actual = sobrecargasAsc[i]!;
            if (!actual.hubo_sobrecarga) continue;

            const previo = i > 0 ? sobrecargasAsc[i - 1]! : null;
            const deltaPeso = previo ? Math.round((actual.peso_max_kg - previo.peso_max_kg) * 100) / 100 : null;
            const deltaVolumen = previo ? Math.round((actual.volumen_ejercicio_kg - previo.volumen_ejercicio_kg) * 100) / 100 : null;

            const esRecord = recordEj ? actual.peso_max_kg >= recordEj.peso_max_kg : false;

            const sesionEntry = (get().historialCargas[alumno.id] ?? []).find(
              (e) => e.sesion.id === actual.sesion_id,
            );
            const seriesEj = sesionEntry
              ? sesionEntry.series.filter((s) => s.ejercicio_id === ejercicio.id && s.completada)
              : [];
            const epleyVals = seriesEj.map((s) => calculateEpley1RM(s.peso_kg, s.reps_hechas));
            const brzyckiVals = seriesEj.map((s) => calculateBrzycki1RM(s.peso_kg, s.reps_hechas));

            const mejor1rmEpley = epleyVals.length > 0 ? Math.round(Math.max(...epleyVals) * 100) / 100 : actual.peso_max_kg;
            const mejor1rmBrzycki = brzyckiVals.length > 0 ? Math.round(Math.max(...brzyckiVals) * 100) / 100 : actual.peso_max_kg;

            let tipo: "CARGA" | "VOLUMEN" | "RECORD_1RM" | "AMBOS" = "CARGA";
            if (esRecord) {
              tipo = "RECORD_1RM";
            } else if ((deltaPeso ?? 0) > 0 && (deltaVolumen ?? 0) > 0) {
              tipo = "AMBOS";
            } else if ((deltaPeso ?? 0) > 0) {
              tipo = "CARGA";
            } else {
              tipo = "VOLUMEN";
            }

            alertas.push({
              id: `alerta-${alumno.id}-${ejercicio.id}-${actual.sesion_id}`,
              alumnoId: alumno.id,
              alumnoNombre: alumno.nombre_completo,
              ejercicioId: ejercicio.id,
              ejercicioNombre: ejercicio.nombre,
              sesionId: actual.sesion_id,
              fecha: actual.fecha,
              pesoMaxKg: actual.peso_max_kg,
              pesoPrevioKg: previo ? previo.peso_max_kg : null,
              deltaPesoKg: deltaPeso,
              volumenEjercicioKg: actual.volumen_ejercicio_kg,
              volumenPrevioKg: previo ? previo.volumen_ejercicio_kg : null,
              deltaVolumenKg: deltaVolumen,
              mejor1rmEpley,
              mejor1rmBrzycki,
              esNuevoRecord1RM: esRecord,
              tipo,
            });
          }
        }
      }

      // Ordenar alertas más recientes primero (DESC)
      return alertas.sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      );
    },
  }),
);
