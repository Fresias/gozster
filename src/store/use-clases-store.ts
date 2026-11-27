import { create } from "zustand";
import { asignarClaseFijaRpc, quitarClaseFijaRpc } from "@/services/clases-fijas-service";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  MENSAJES_ERROR,
  MENSAJE_SIN_SENAL,
  MAX_LARGO_NOTA_CLASE,
  actualizarNotaClase,
  buildCancelacionAvisoTexto,
  guardarFeedbackClase,
  obtenerFeedbackDeReservas,
  obtenerResumenClasesAlumno,
  ocupaCupo,
  resolverActividadesHabilitadas,
  semanaEnCurso,
  validarAnotacionCoach,
  type ResumenClasesAlumno,
} from "@/lib/clases";
import { safeStorage, useOfflineQueueStore } from "@/store/use-offline-queue";
import { useChatStore, STAFF_COACH_PRINCIPAL } from "@/store/use-chat-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import {
  DEMO_ALUMNOS,
  DEMO_ALUMNOS_CLASES,
  DEMO_COACH_LUCIA,
  DEMO_CONTRATACIONES_CLASES,
  DEMO_PLANES_MEMBRESIA,
  generarDemoClasesSemana,
  generarDemoReservasIniciales,
} from "@/services/coach-demo-dataset";
import type {
  ActividadClase,
  AlumnoActividad,
  Clase,
  Contratacion,
  Database,
  FeedbackClase,
  PlanMembresia,
  Reserva,
  SensacionClase,
} from "@/types/database.types";
import { supabase } from "@/lib/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MSG_ERROR_CLASES = "No pudimos cargar las clases. Intentá de nuevo.";

export interface ReservaAgenda extends Reserva {
  alumno_nombre: string;
}

export interface ClaseFijaItem {
  id: string;
  alumno_id: string;
  horario_id: string;
  actividad?: ActividadClase;
  dia_semana?: number;
  hora_inicio?: string;
  created_at?: string;
}

export type VistaAgenda = "semana" | "dia" | "mes";

export interface CrearClasesRecurrentesInput {
  actividad: ActividadClase;
  hora_inicio: string;
  fecha_inicio: string;
  dias_semana: number[];
  semanas?: number;
  fecha_fin?: string | null;
  duracion_minutos?: number;
  capacidad?: number | null;
}

function extraerMensajeRpcError(
  error: { code?: string; message?: string } | null,
  fallback: string,
): string {
  if (!error) return fallback;
  if (error.code && MENSAJES_ERROR[error.code]) {
    return MENSAJES_ERROR[error.code]!;
  }
  return error.message || fallback;
}

async function getAuthenticatedUserId(): Promise<string | null> {
  if (typeof supabase?.auth?.getUser !== "function") return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

function calcularSinCupo(clases: Clase[], reservas: ReservaAgenda[]): string[] {
  return clases
    .filter((c) => {
      if (!c.capacidad) return false;
      const ocupados = reservas.filter((r) => r.clase_id === c.id && ocupaCupo(r)).length;
      return ocupados >= c.capacidad;
    })
    .map((c) => c.id);
}

function recalcularSinCupoClase(
  sinCupoActual: string[],
  clase: Clase | undefined,
  reservas: ReservaAgenda[],
): string[] {
  if (!clase) return sinCupoActual;
  if (clase.capacidad === null) {
    return sinCupoActual.filter((id) => id !== clase.id);
  }
  const ocupados = reservas.filter((r) => r.clase_id === clase.id && ocupaCupo(r)).length;
  if (ocupados >= clase.capacidad) {
    return [...new Set([...sinCupoActual, clase.id])];
  }
  return sinCupoActual.filter((id) => id !== clase.id);
}

function mergeClasesOrdenadas(existentes: Clase[], nuevas: Clase[]): Clase[] {
  const mapa = new Map<string, Clase>();
  for (const c of existentes) mapa.set(c.id, c);
  for (const c of nuevas) mapa.set(c.id, c);
  return Array.from(mapa.values()).sort(
    (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
  );
}

function resolverNombreAlumno(alumnoId: string, perfilJoin?: unknown): string {
  if (perfilJoin && typeof perfilJoin === "object") {
    const row = Array.isArray(perfilJoin) ? perfilJoin[0] : perfilJoin;
    if (row && typeof (row as { nombre_completo?: string }).nombre_completo === "string") {
      return (row as { nombre_completo: string }).nombre_completo;
    }
  }
  const deStudio = useCoachStudioStore
    .getState()
    .alumnos.find((a) => a.id === alumnoId)?.nombre_completo;
  if (deStudio) return deStudio;
  if (!UUID_RE.test(alumnoId)) {
    const deDemo = [...DEMO_ALUMNOS, ...DEMO_ALUMNOS_CLASES].find(
      (a) => a.id === alumnoId,
    )?.nombre_completo;
    if (deDemo) return deDemo;
  }
  return "Alumno";
}

function generarInstanciasRecurrentesDemo(datos: CrearClasesRecurrentesInput): Clase[] {
  const duracion = datos.duracion_minutos ?? 60;
  const capacidad = datos.capacidad !== undefined ? datos.capacidad : null;
  const diasSet = new Set(
    datos.dias_semana.length > 0 ? datos.dias_semana : [1],
  );
  const inicioDate = new Date(`${datos.fecha_inicio}T12:00:00-03:00`);
  const finDate = datos.fecha_fin
    ? new Date(`${datos.fecha_fin}T12:00:00-03:00`)
    : new Date(inicioDate.getTime() + ((datos.semanas ?? 4) * 7 - 1) * 86_400_000);

  const creadas: Clase[] = [];
  const ahoraIso = new Date().toISOString();
  for (
    let t = inicioDate.getTime();
    t <= finDate.getTime();
    t += 86_400_000
  ) {
    const d = new Date(t);
    const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (!diasSet.has(isoDay)) continue;
    const fechaStr = d.toISOString().slice(0, 10);
    const inicioIso = new Date(`${fechaStr}T${datos.hora_inicio}:00-03:00`).toISOString();
    creadas.push({
      id: `demo-clase-${Date.now()}-${creadas.length}-${Math.random().toString(36).slice(2, 6)}`,
      horario_id: null,
      actividad: datos.actividad,
      inicio: inicioIso,
      duracion_minutos: duracion,
      capacidad,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      created_at: ahoraIso,
      updated_at: ahoraIso,
    });
  }
  return creadas;
}

export interface ProfesorClaseInfo {
  id: string;
  nombre_completo: string;
}

interface ClasesState {
  vista: VistaAgenda;
  setVista: (v: VistaAgenda) => void;

  semanaInicio: string | null;
  clases: Clase[];
  profesoresPorClase: Record<string, ProfesorClaseInfo[]>;
  misReservas: Reserva[];
  clasesFijas: ClaseFijaItem[];
  membresia: Contratacion | null;
  plan: PlanMembresia | null;
  contratacionesAlumno: Contratacion[];
  actividadesAlumno: AlumnoActividad[];
  actividadesHabilitadas: ActividadClase[];
  sinCupo: string[];
  agendaReservas: ReservaAgenda[];
  resumenClases: ResumenClasesAlumno | null;
  feedbacksPorReserva: Record<string, SensacionClase>;
  actualizadoAt: string | null;

  // Dataset demo (GH #122)
  demoAlumnoId: string;
  testAhora: string | null;
  setDemoAlumnoId: (id: string) => void;
  setTestAhora: (fechaIso: string | null) => void;
  resetDemoDataset: (fechaRef?: Date) => void;
  resetDemo: (fechaRef?: Date) => void;

  cargando: boolean;
  accionEnCurso: string | null;
  error: string | null;
  /** Efímero (no se persiste): falló la carga online de clases; habilita «Reintentar» (G12). */
  errorCargaClases: boolean;
  aviso: string | null;

  cargarClasesAlumno: () => Promise<void>;
  cargarResumenClases: () => Promise<void>;
  responderFeedbackClase: (
    reservaId: string,
    sensacion: SensacionClase,
  ) => Promise<{ ok: boolean; queued?: boolean; error?: string }>;
  guardarNotaClase: (claseId: string, nota: string | null) => Promise<boolean>;
  subscribeToRealtime: (alumnoId?: string) => () => void;
  reservar: (claseId: string) => Promise<void>;
  cancelarReserva: (reservaId: string) => Promise<void>;
  cargarAgenda: () => Promise<void>;
  marcarAusente: (reservaId: string) => Promise<void>;
  cancelarClase: (claseId: string, motivo: string, pushearInicio?: boolean) => Promise<boolean>;
  eliminarClase: (claseId: string) => Promise<boolean>;
  reactivarClase: (claseId: string) => Promise<boolean>;

  // Métodos Coach Studio (GOZS-184 / GOZS-638)
  crearClase: (datos: {
    actividad: ActividadClase;
    inicio: string;
    duracion_minutos?: number;
    capacidad?: number | null;
  }) => Promise<Clase>;
  crearClasesRecurrentes: (datos: CrearClasesRecurrentesInput) => Promise<Clase[]>;
  actualizarClase: (
    claseId: string,
    datos: {
      actividad?: ActividadClase;
      inicio?: string;
      duracion_minutos?: number;
      capacidad?: number | null;
    },
  ) => Promise<boolean>;
  editarClase: (
    claseId: string,
    datos: {
      actividad?: ActividadClase;
      inicio?: string;
      duracion_minutos?: number;
      capacidad?: number | null;
    },
  ) => Promise<boolean>;
  moverClase: (claseId: string, nuevoInicio: string) => Promise<boolean>;
  redimensionarClase: (claseId: string, nuevaDuracionMinutos: number) => Promise<boolean>;
  actualizarCupoClase: (claseId: string, nuevaCapacidad: number | null) => Promise<boolean>;
  anotarAlumnoCoach: (
    claseId: string,
    alumnoId: string,
    forzar?: boolean,
  ) => Promise<{ ok: boolean; advertencia?: string; requiereConfirmacion?: boolean }>;
  quitarAnotadoCoach: (reservaId: string) => Promise<boolean>;

  // Métodos Clases Fijas (GOZS-225 / GOZS-246)
  asignarClaseFija: (horarioId: string, alumnoId: string) => Promise<boolean>;
  quitarClaseFija: (claseFijaId: string) => Promise<boolean>;
  obtenerClasesFijasAlumno: (alumnoId: string) => ClaseFijaItem[];

  limpiarMensajes: () => void;
}

export const useClasesStore = create<ClasesState>()(
  persist(
    (set, get) => ({
      vista: "semana",
      setVista: (vista) => set({ vista }),

      semanaInicio: null,
      clases: [],
      profesoresPorClase: {},
      misReservas: [],
      clasesFijas: [],
      membresia: null,
      plan: null,
      contratacionesAlumno: [],
      actividadesAlumno: [],
      actividadesHabilitadas: [],
      sinCupo: [],
      agendaReservas: [],
      resumenClases: null,
      feedbacksPorReserva: {},
      actualizadoAt: null,

      demoAlumnoId: "demo-alumno-valentina",
      testAhora: null,
      setDemoAlumnoId: (id: string) => {
        set({ demoAlumnoId: id, error: null, aviso: null });
        const contratacion = DEMO_CONTRATACIONES_CLASES.find((c) => c.alumno_id === id) ?? null;
        const plan = contratacion?.plan_membresia_id
          ? DEMO_PLANES_MEMBRESIA.find((p) => p.id === contratacion.plan_membresia_id) ?? null
          : null;
        const misReservas = get().agendaReservas.filter((r) => r.alumno_id === id);
        const refDate = get().testAhora ? new Date(get().testAhora!) : new Date();
        const actividadesHabilitadas = resolverActividadesHabilitadas({
          contrataciones: contratacion ? [contratacion] : [],
          membresia: contratacion,
          plan,
          ahora: refDate,
        });
        set({
          membresia: contratacion,
          plan,
          contratacionesAlumno: contratacion ? [contratacion] : [],
          actividadesAlumno: [],
          actividadesHabilitadas,
          misReservas,
        });
      },
      setTestAhora: (fechaIso: string | null) => {
        set({ testAhora: fechaIso });
      },
      resetDemoDataset: (fechaRef = new Date()) => {
        const { inicio } = semanaEnCurso(fechaRef);
        // Lunes 12:00 ART como instante de referencia para que clases queden futuras y reservables
        const lunesMediodia = new Date(inicio.getTime() + 12 * 3600 * 1000).toISOString();
        const demoClases = generarDemoClasesSemana(fechaRef);
        const demoReservas = generarDemoReservasIniciales();
        const demoId = get().demoAlumnoId || "demo-alumno-valentina";
        const contratacion = DEMO_CONTRATACIONES_CLASES.find((c) => c.alumno_id === demoId) ?? null;
        const plan = contratacion?.plan_membresia_id
          ? DEMO_PLANES_MEMBRESIA.find((p) => p.id === contratacion.plan_membresia_id) ?? null
          : null;
        const misReservas = demoReservas.filter((r) => r.alumno_id === demoId);
        const sinCupo = calcularSinCupo(demoClases, demoReservas);
        const actividadesHabilitadas = resolverActividadesHabilitadas({
          contrataciones: contratacion ? [contratacion] : [],
          membresia: contratacion,
          plan,
          ahora: fechaRef,
        });

        const profesoresDemo: Record<string, ProfesorClaseInfo[]> = {};
        for (const c of demoClases) {
          profesoresDemo[c.id] = [
            { id: DEMO_COACH_LUCIA.id, nombre_completo: DEMO_COACH_LUCIA.nombre_completo },
          ];
        }

        set({
          semanaInicio: inicio.toISOString(),
          testAhora: lunesMediodia,
          clases: demoClases,
          profesoresPorClase: profesoresDemo,
          agendaReservas: demoReservas,
          misReservas,
          clasesFijas: [
            { id: "demo-fija-valentina-1", alumno_id: "demo-alumno-valentina", horario_id: "demo-horario-func-lunes" },
            { id: "demo-fija-valentina-2", alumno_id: "demo-alumno-valentina", horario_id: "demo-horario-func-miercoles" },
          ],
          membresia: contratacion,
          plan,
          contratacionesAlumno: contratacion ? [contratacion] : [],
          actividadesAlumno: [],
          actividadesHabilitadas,
          sinCupo,
          resumenClases: null,
          feedbacksPorReserva: {},
          actualizadoAt: new Date().toISOString(),
          error: null,
          aviso: null,
        });
      },
      resetDemo: (fechaRef?: Date) => get().resetDemoDataset(fechaRef),

      cargando: false,
      accionEnCurso: null,
      error: null,
      errorCargaClases: false,
      aviso: null,

      cargarClasesAlumno: async () => {
        const { inicio } = semanaEnCurso();
        const isOnline = useOfflineQueueStore.getState().isOnline;

        if (isOnline && typeof supabase?.from === "function") {
          const userId = await getAuthenticatedUserId();
          if (userId) {
            try {
              const [clasesRes, reservasRes, contratacionesRes, actividadesRes] = await Promise.all([
                supabase.from("clases").select("*").order("inicio", { ascending: true }),
                supabase.from("reservas").select("*").eq("alumno_id", userId),
                supabase
                  .from("contrataciones")
                  .select("*")
                  .eq("alumno_id", userId)
                  .order("created_at", { ascending: false }),
                supabase.from("alumno_actividades").select("*").eq("alumno_id", userId),
              ]);

              if (
                !clasesRes.error &&
                !reservasRes.error &&
                Array.isArray(clasesRes.data) &&
                Array.isArray(reservasRes.data)
              ) {
                const clasesReales = clasesRes.data as Clase[];
                const reservasReales = reservasRes.data as Reserva[];
                const contratacionesReales =
                  !contratacionesRes?.error && Array.isArray(contratacionesRes?.data)
                    ? (contratacionesRes.data as Contratacion[])
                    : [];
                const actividadesReales =
                  !actividadesRes?.error && Array.isArray(actividadesRes?.data)
                    ? (actividadesRes.data as AlumnoActividad[])
                    : [];

                const planIds = Array.from(
                  new Set(
                    contratacionesReales
                      .map((c) => c.plan_membresia_id)
                      .filter((id): id is string => Boolean(id)),
                  ),
                );
                const planesPorId: Record<string, PlanMembresia> = {};
                if (planIds.length > 0) {
                  try {
                    const planesQuery = supabase.from("planes_membresia").select("*");
                    const planesRes =
                      typeof (planesQuery as any).in === "function"
                        ? await (planesQuery as any).in("id", planIds)
                        : await planesQuery.eq("id", planIds[0]!).maybeSingle();
                    if (!planesRes?.error && planesRes?.data) {
                      const rows = Array.isArray(planesRes.data)
                        ? (planesRes.data as PlanMembresia[])
                        : [planesRes.data as PlanMembresia];
                      for (const p of rows) planesPorId[p.id] = p;
                    }
                  } catch {
                    // Tolerar fallo parcial de lectura de planes
                  }
                }

                const contratacionReal =
                  contratacionesReales.find(
                    (c) =>
                      c.plan_membresia_id !== null &&
                      c.estado !== "VENCIDA" &&
                      c.estado !== "EN_PAUSA",
                  ) ??
                  contratacionesReales[0] ??
                  null;
                const planReal =
                  (contratacionReal?.plan_membresia_id &&
                    planesPorId[contratacionReal.plan_membresia_id]) ||
                  null;

                const actividadesHabilitadas = resolverActividadesHabilitadas({
                  contrataciones: contratacionesReales,
                  planesPorId,
                  actividadesAlumno: actividadesReales,
                  membresia: contratacionReal,
                  plan: planReal,
                });

                const agendaReservasReales: ReservaAgenda[] = reservasReales.map((r) => ({
                  ...r,
                  alumno_nombre: "Vos",
                }));

                let resumenClases = get().resumenClases;
                const feedbacksMerged: Record<string, SensacionClase> = {
                  ...get().feedbacksPorReserva,
                };
                if (typeof supabase?.rpc === "function") {
                  try {
                    const resumen = await obtenerResumenClasesAlumno(null, supabase);
                    for (const item of resumen.asistencias) {
                      if (item.sensacion !== null) {
                        feedbacksMerged[item.reserva_id] = item.sensacion;
                      }
                    }
                    // Respetar respuestas encoladas offline aún no sincronizadas
                    for (const ev of useOfflineQueueStore.getState().pendingEvents) {
                      if (ev.action === "FEEDBACK_CLASE") {
                        const p = ev.payload as { reservaId?: string; sensacion?: SensacionClase };
                        if (p.reservaId && p.sensacion) {
                          feedbacksMerged[p.reservaId] = p.sensacion;
                        }
                      }
                    }
                    resumenClases = {
                      ...resumen,
                      asistencias: resumen.asistencias.map((item) => ({
                        ...item,
                        sensacion: feedbacksMerged[item.reserva_id] ?? item.sensacion,
                      })),
                    };
                  } catch {
                    // Tolerar ausencia o error transitorio de RPC sin bloquear la vista
                  }
                }

                set({
                  semanaInicio: inicio.toISOString(),
                  clases: clasesReales,
                  misReservas: reservasReales,
                  agendaReservas: agendaReservasReales,
                  membresia: contratacionReal,
                  plan: planReal,
                  contratacionesAlumno: contratacionesReales,
                  actividadesAlumno: actividadesReales,
                  actividadesHabilitadas,
                  sinCupo: [],
                  resumenClases,
                  feedbacksPorReserva: feedbacksMerged,
                  actualizadoAt: new Date().toISOString(),
                  cargando: false,
                  error: null,
                  errorCargaClases: false,
                });
                return;
              }
            } catch {
              // Se trata igual que un error de PostgREST (abajo).
            }
            // Online y autenticado pero la lectura falló: se conserva la caché local,
            // no se marca como carga exitosa y se avisa con opción de reintentar.
            set({ cargando: false, error: MSG_ERROR_CLASES, errorCargaClases: true });
            return;
          }
        }

        // Caché offline-first de sesión real: no pisar reservas reales con dataset demo
        const tieneCacheReal =
          get().misReservas.some((r) => UUID_RE.test(r.id)) ||
          get().clases.some((c) => UUID_RE.test(c.id));
        if (tieneCacheReal) {
          set({ cargando: false });
          return;
        }

        const clases = get().clases;
        const agendaReservas = get().agendaReservas;
        set({
          semanaInicio: inicio.toISOString(),
          clases,
          agendaReservas,
          sinCupo: calcularSinCupo(clases, agendaReservas),
          actualizadoAt: new Date().toISOString(),
          cargando: false,
        });
      },

      subscribeToRealtime: (alumnoId?: string) => {
        if (typeof supabase?.channel !== "function") return () => {};
        const channelName = alumnoId ? `clases-reservas-${alumnoId}` : "clases-reservas-global";
        const channel = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "reservas" },
            (payload: any) => {
              const eventType = payload?.eventType as string | undefined;
              const newRow = payload?.new as Reserva | undefined;
              const oldRow = payload?.old as Partial<Reserva> | undefined;

              if (eventType === "DELETE" && oldRow?.id) {
                set((state) => ({
                  misReservas: state.misReservas.filter((r) => r.id !== oldRow.id),
                  agendaReservas: state.agendaReservas.filter((r) => r.id !== oldRow.id),
                }));
                return;
              }

              if (!newRow?.id) return;
              if (alumnoId && newRow.alumno_id !== alumnoId) return;

              const nombre = resolverNombreAlumno(newRow.alumno_id);
              const reservaAgenda: ReservaAgenda = { ...newRow, alumno_nombre: nombre };

              set((state) => {
                const existsMis = state.misReservas.some((r) => r.id === newRow.id);
                const misReservas =
                  !alumnoId || newRow.alumno_id === alumnoId
                    ? existsMis
                      ? state.misReservas.map((r) => (r.id === newRow.id ? newRow : r))
                      : [...state.misReservas, newRow]
                    : state.misReservas;

                const existsAgenda = state.agendaReservas.some((r) => r.id === newRow.id);
                const agendaReservas = existsAgenda
                  ? state.agendaReservas.map((r) =>
                      r.id === newRow.id
                        ? { ...newRow, alumno_nombre: r.alumno_nombre || nombre }
                        : r,
                    )
                  : [...state.agendaReservas, reservaAgenda];

                return { misReservas, agendaReservas };
              });

              if (!get().clases.some((c) => c.id === newRow.clase_id)) {
                if (alumnoId) {
                  void get().cargarClasesAlumno();
                } else {
                  void get().cargarAgenda();
                }
              }
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "clases" },
            (payload: any) => {
              const eventType = payload?.eventType as string | undefined;
              const newRow = payload?.new as Clase | undefined;
              const oldRow = payload?.old as Partial<Clase> | undefined;

              if (eventType === "DELETE" && oldRow?.id) {
                set((state) => ({
                  clases: state.clases.filter((c) => c.id !== oldRow.id),
                }));
                return;
              }

              if (!newRow?.id) return;
              set((state) => {
                const exists = state.clases.some((c) => c.id === newRow.id);
                const clases = exists
                  ? state.clases.map((c) => (c.id === newRow.id ? newRow : c))
                  : [...state.clases, newRow];
                return { clases };
              });
            },
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "feedback_clase" },
            (payload: any) => {
              const eventType = payload?.eventType as string | undefined;
              const newRow = payload?.new as Partial<FeedbackClase> | undefined;
              const oldRow = payload?.old as Partial<FeedbackClase> | undefined;
              if (eventType === "DELETE" && oldRow?.reserva_id) {
                set((state) => {
                  const next = { ...state.feedbacksPorReserva };
                  delete next[oldRow.reserva_id!];
                  return { feedbacksPorReserva: next };
                });
                return;
              }
              if (newRow?.reserva_id && newRow.sensacion) {
                set((state) => ({
                  feedbacksPorReserva: {
                    ...state.feedbacksPorReserva,
                    [newRow.reserva_id!]: newRow.sensacion!,
                  },
                }));
              }
            },
          )
          .subscribe();

        return () => {
          if (typeof supabase?.removeChannel === "function") {
            void supabase.removeChannel(channel);
          }
        };
      },

      cargarResumenClases: async () => {
        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline || typeof supabase?.rpc !== "function") return;
        const userId = await getAuthenticatedUserId();
        if (!userId) return;
        try {
          const resumen = await obtenerResumenClasesAlumno(null, supabase);
          const feedbacksMerged: Record<string, SensacionClase> = {
            ...get().feedbacksPorReserva,
          };
          for (const item of resumen.asistencias) {
            if (item.sensacion !== null) {
              feedbacksMerged[item.reserva_id] = item.sensacion;
            }
          }
          for (const ev of useOfflineQueueStore.getState().pendingEvents) {
            if (ev.action === "FEEDBACK_CLASE") {
              const p = ev.payload as { reservaId?: string; sensacion?: SensacionClase };
              if (p.reservaId && p.sensacion) {
                feedbacksMerged[p.reservaId] = p.sensacion;
              }
            }
          }
          set({
            resumenClases: {
              ...resumen,
              asistencias: resumen.asistencias.map((item) => ({
                ...item,
                sensacion: feedbacksMerged[item.reserva_id] ?? item.sensacion,
              })),
            },
            feedbacksPorReserva: feedbacksMerged,
          });
        } catch {
          // Mantener resumen persistido offline
        }
      },

      responderFeedbackClase: async (reservaId, sensacion) => {
        const prevFeedback = get().feedbacksPorReserva[reservaId];
        const prevResumen = get().resumenClases;

        set((state) => ({
          feedbacksPorReserva: {
            ...state.feedbacksPorReserva,
            [reservaId]: sensacion,
          },
          resumenClases: state.resumenClases
            ? {
                ...state.resumenClases,
                asistencias: state.resumenClases.asistencias.map((a) =>
                  a.reserva_id === reservaId ? { ...a, sensacion } : a,
                ),
              }
            : null,
        }));

        if (!UUID_RE.test(reservaId)) {
          return { ok: true };
        }

        const queue = useOfflineQueueStore.getState();
        const encolar = () => {
          const eventId = `feedback-${reservaId}`;
          queue.removeEvent(eventId);
          queue.enqueueEvent({
            id: eventId,
            action: "FEEDBACK_CLASE",
            payload: { reservaId, sensacion },
          });
        };

        if (!queue.isOnline || typeof supabase?.from !== "function") {
          encolar();
          return { ok: true, queued: true };
        }

        const userId = await getAuthenticatedUserId();
        if (!userId) {
          encolar();
          return { ok: true, queued: true };
        }

        try {
          await guardarFeedbackClase({ reservaId, sensacion }, supabase);
          queue.removeEvent(`feedback-${reservaId}`);
          return { ok: true };
        } catch (err: any) {
          const code = typeof err?.code === "string" ? err.code : "";
          if (code === "23514" || code === "23503" || code === "42501") {
            set((state) => {
              const nextFeedbacks = { ...state.feedbacksPorReserva };
              if (prevFeedback !== undefined) nextFeedbacks[reservaId] = prevFeedback;
              else delete nextFeedbacks[reservaId];
              return {
                feedbacksPorReserva: nextFeedbacks,
                resumenClases: prevResumen,
              };
            });
            return {
              ok: false,
              error: extraerMensajeRpcError(err, "No pudimos guardar tu devolución."),
            };
          }
          encolar();
          return { ok: true, queued: true };
        }
      },

      guardarNotaClase: async (claseId, nota) => {
        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline) {
          set({ error: MENSAJE_SIN_SENAL });
          return false;
        }

        const claseExistente = get().clases.find((c) => c.id === claseId);
        if (!claseExistente) {
          set({ error: MENSAJES_ERROR.P0002 });
          return false;
        }

        const notaLimpia = nota?.trim() ? nota.trim() : null;
        if (notaLimpia && notaLimpia.length > MAX_LARGO_NOTA_CLASE) {
          set({
            error: `La nota no puede superar los ${MAX_LARGO_NOTA_CLASE} caracteres.`,
          });
          return false;
        }

        let claseActualizada: Clase = {
          ...claseExistente,
          nota: notaLimpia,
          updated_at: new Date().toISOString(),
        };

        const userId = await getAuthenticatedUserId();
        if (userId && UUID_RE.test(claseId) && typeof supabase?.from === "function") {
          try {
            claseActualizada = await actualizarNotaClase(
              { claseId, nota: notaLimpia },
              supabase,
            );
          } catch (err: any) {
            set({
              error: extraerMensajeRpcError(err, "No pudimos guardar la nota de la clase."),
              aviso: null,
            });
            return false;
          }
        }

        set({
          clases: get().clases.map((c) => (c.id === claseId ? claseActualizada : c)),
          aviso: notaLimpia ? "Nota guardada" : "Nota eliminada",
          error: null,
        });
        return true;
      },

      reservar: async (claseId) => {
        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline) {
          set({ accionEnCurso: null, error: MENSAJE_SIN_SENAL });
          return;
        }

        set({ accionEnCurso: claseId, error: null, aviso: null });
        const userId = await getAuthenticatedUserId();

        if (userId && UUID_RE.test(claseId)) {
          try {
            const { data, error } = await supabase.rpc("reservar_clase", {
              p_clase_id: claseId,
            });
            if (error) {
              set({
                accionEnCurso: null,
                error: extraerMensajeRpcError(error, "No pudimos completar tu reserva."),
              });
              return;
            }
            const row = Array.isArray(data) ? data[0] : data;
            const reservaId = row?.reserva_id ?? `res-${Date.now()}`;
            const ahoraIso = new Date().toISOString();
            const nuevaReserva: ReservaAgenda = {
              id: reservaId,
              clase_id: claseId,
              alumno_id: userId,
              alumno_nombre: "Vos",
              estado: "ANOTADO",
              created_at: ahoraIso,
              updated_at: ahoraIso,
            };
            const clase = get().clases.find((c) => c.id === claseId);
            const nuevaAgenda = [
              ...get().agendaReservas.filter((r) => r.id !== reservaId),
              nuevaReserva,
            ];
            const nuevasMis = [
              ...get().misReservas.filter((r) => r.id !== reservaId),
              nuevaReserva,
            ];
            set({
              agendaReservas: nuevaAgenda,
              misReservas: nuevasMis,
              sinCupo: recalcularSinCupoClase(get().sinCupo, clase, nuevaAgenda),
              accionEnCurso: null,
              aviso: row?.aviso || "Reserva confirmada.",
              error: null,
            });
            return;
          } catch (err: any) {
            set({
              accionEnCurso: null,
              error: err?.message || "No pudimos completar tu reserva.",
            });
            return;
          }
        }

        // Fallback controlado para entorno de test/demo sin sesión Supabase real
        const ahoraMs = get().testAhora ? new Date(get().testAhora!).getTime() : Date.now();
        const hoyStr = new Date(ahoraMs).toISOString().split("T")[0]!;

        const alumnoId = get().demoAlumnoId || "demo-alumno-valentina";
        const alumno = DEMO_ALUMNOS_CLASES.find((a) => a.id === alumnoId);
        const clase = get().clases.find((c) => c.id === claseId);

        if (!clase) {
          set({ accionEnCurso: null, error: MENSAJES_ERROR.P0002 });
          return;
        }
        if (clase.estado === "CANCELADA") {
          set({ accionEnCurso: null, error: MENSAJES_ERROR.GZ007 });
          return;
        }
        if (new Date(clase.inicio).getTime() <= ahoraMs) {
          set({ accionEnCurso: null, error: MENSAJES_ERROR.GZ006 });
          return;
        }

        const contratacion = get().membresia;
        const plan = get().plan;
        if (!contratacion || !plan) {
          set({ accionEnCurso: null, error: MENSAJES_ERROR.GZ004 });
          return;
        }

        if (contratacion.estado === "VENCIDA" || (contratacion.fecha_fin && contratacion.fecha_fin < hoyStr)) {
          set({ accionEnCurso: null, error: MENSAJES_ERROR.GZ004 });
          return;
        }
        if (contratacion.fecha_inicio && contratacion.fecha_inicio > hoyStr) {
          set({ accionEnCurso: null, error: MENSAJES_ERROR.GZ004 });
          return;
        }

        if (plan.cantidad_actividades === 1 && contratacion.actividad && contratacion.actividad !== clase.actividad) {
          set({ accionEnCurso: null, error: MENSAJES_ERROR.GZ003 });
          return;
        }

        const yaAnotado = get().misReservas.some(
          (r) => r.clase_id === claseId && r.estado !== "CANCELADO",
        );
        if (yaAnotado) {
          set({ accionEnCurso: null, error: MENSAJES_ERROR.GZ008 });
          return;
        }

        if (plan.limite_semanal !== null) {
          const usadas = new Set(
            get()
              .misReservas.filter((r) => ocupaCupo(r))
              .map((r) => r.clase_id),
          ).size;
          if (usadas >= plan.limite_semanal) {
            set({ accionEnCurso: null, error: MENSAJES_ERROR.GZ002 });
            return;
          }
        }

        if (clase.capacidad !== null) {
          const ocupados = get().agendaReservas.filter(
            (r) => r.clase_id === claseId && ocupaCupo(r),
          ).length;
          if (ocupados >= clase.capacidad) {
            set({
              accionEnCurso: null,
              error: MENSAJES_ERROR.GZ001,
              sinCupo: [...new Set([...get().sinCupo, claseId])],
            });
            return;
          }
        }

        const nuevaReserva: ReservaAgenda = {
          id: `demo-res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          clase_id: claseId,
          alumno_id: alumnoId,
          alumno_nombre: alumno?.nombre_completo ?? "Alumno",
          estado: "ANOTADO",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const nuevaAgenda = [...get().agendaReservas, nuevaReserva];
        const nuevasMis = [...get().misReservas, nuevaReserva];

        set({
          agendaReservas: nuevaAgenda,
          misReservas: nuevasMis,
          sinCupo: recalcularSinCupoClase(get().sinCupo, clase, nuevaAgenda),
          accionEnCurso: null,
          error: null,
        });
      },

      cancelarReserva: async (reservaId) => {
        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline) {
          set({ accionEnCurso: null, error: MENSAJE_SIN_SENAL });
          return;
        }

        set({ accionEnCurso: reservaId, error: null, aviso: null });
        const userId = await getAuthenticatedUserId();

        if (userId && UUID_RE.test(reservaId)) {
          try {
            const { data, error } = await supabase.rpc("cancelar_reserva", {
              p_reserva_id: reservaId,
            });
            if (error) {
              set({
                accionEnCurso: null,
                error: extraerMensajeRpcError(error, "No pudimos cancelar tu reserva."),
              });
              return;
            }
            const updated = (data as Reserva | null) ?? null;
            const claseId = updated?.clase_id ?? get().misReservas.find((r) => r.id === reservaId)?.clase_id;
            set({
              agendaReservas: get().agendaReservas.map((r) =>
                r.id === reservaId ? { ...r, ...(updated ?? {}), estado: "CANCELADO" as const } : r,
              ),
              misReservas: get().misReservas.map((r) =>
                r.id === reservaId ? { ...r, ...(updated ?? {}), estado: "CANCELADO" as const } : r,
              ),
              sinCupo: claseId ? get().sinCupo.filter((id) => id !== claseId) : get().sinCupo,
              accionEnCurso: null,
              aviso: "Reserva cancelada.",
              error: null,
            });
            return;
          } catch (err: any) {
            set({
              accionEnCurso: null,
              error: err?.message || "No pudimos cancelar tu reserva.",
            });
            return;
          }
        }

        const ahoraMs = get().testAhora ? new Date(get().testAhora!).getTime() : Date.now();
        const reserva = get().agendaReservas.find((r) => r.id === reservaId);
        if (!reserva) {
          set({ accionEnCurso: null, error: MENSAJES_ERROR.P0002 });
          return;
        }
        if (reserva.estado !== "ANOTADO") {
          set({ accionEnCurso: null, error: MENSAJES_ERROR.GZ009 });
          return;
        }
        const clase = get().clases.find((c) => c.id === reserva.clase_id);
        if (clase && new Date(clase.inicio).getTime() <= ahoraMs) {
          set({ accionEnCurso: null, error: MENSAJES_ERROR.GZ006 });
          return;
        }

        set({
          agendaReservas: get().agendaReservas.map((r) =>
            r.id === reservaId ? { ...r, estado: "CANCELADO" as const } : r,
          ),
          misReservas: get().misReservas.map((r) =>
            r.id === reservaId ? { ...r, estado: "CANCELADO" as const } : r,
          ),
          sinCupo: get().sinCupo.filter((id) => id !== reserva.clase_id),
          accionEnCurso: null,
          error: null,
        });
      },

      cargarAgenda: async () => {
        const { inicio } = semanaEnCurso();
        const isOnline = useOfflineQueueStore.getState().isOnline;

        if (isOnline && typeof supabase?.from === "function") {
          const userId = await getAuthenticatedUserId();
          if (userId) {
            set({ cargando: true });
            try {
              const [clasesRes, reservasJoinRes, fijasJoinRes, profesoresJoinRes] = await Promise.all([
                supabase.from("clases").select("*").order("inicio", { ascending: true }),
                supabase
                  .from("reservas")
                  .select("*, perfiles(nombre_completo)")
                  .order("created_at", { ascending: true }),
                supabase
                  .from("clases_fijas")
                  .select("id, alumno_id, horario_id, created_at, clases_horario(actividad, dia_semana, hora_inicio)"),
                supabase
                  .from("clases_profesores")
                  .select("clase_id, profesor_id, perfiles(nombre_completo)"),
              ]);

              if (!clasesRes.error && Array.isArray(clasesRes.data)) {
                const clasesReales = clasesRes.data as Clase[];

                let reservasData = reservasJoinRes.data as any[] | null;
                if (reservasJoinRes.error) {
                  const fallbackRes = await supabase
                    .from("reservas")
                    .select("*")
                    .order("created_at", { ascending: true });
                  reservasData = !fallbackRes.error && Array.isArray(fallbackRes.data) ? fallbackRes.data : [];
                }

                const agendaReservasReales: ReservaAgenda[] = (reservasData ?? [])
                  .filter((r) => r.estado !== "CANCELADO")
                  .map((r) => ({
                    id: r.id,
                    clase_id: r.clase_id,
                    alumno_id: r.alumno_id,
                    estado: r.estado,
                    created_at: r.created_at,
                    updated_at: r.updated_at,
                    alumno_nombre: resolverNombreAlumno(r.alumno_id, r.perfiles),
                  }));

                const feedbacksPorReserva: Record<string, SensacionClase> = {
                  ...get().feedbacksPorReserva,
                };
                const reservaIdsReales = agendaReservasReales
                  .map((r) => r.id)
                  .filter((id) => UUID_RE.test(id));
                if (reservaIdsReales.length > 0 && typeof supabase?.from === "function") {
                  try {
                    const feedbacks = await obtenerFeedbackDeReservas(
                      reservaIdsReales,
                      supabase,
                    );
                    for (const fb of feedbacks) {
                      feedbacksPorReserva[fb.reserva_id] = fb.sensacion;
                    }
                  } catch {
                    // Tolerar mocks o fallo parcial de lectura de feedback_clase
                  }
                }

                let fijasData = fijasJoinRes.data as any[] | null;
                if (fijasJoinRes.error) {
                  const fallbackFijas = await supabase.from("clases_fijas").select("*");
                  fijasData = !fallbackFijas.error && Array.isArray(fallbackFijas.data) ? fallbackFijas.data : [];
                }

                const clasesFijasReales: ClaseFijaItem[] = (fijasData ?? []).map((f) => {
                  const horario = Array.isArray(f.clases_horario)
                    ? f.clases_horario[0]
                    : f.clases_horario;
                  return {
                    id: f.id,
                    alumno_id: f.alumno_id,
                    horario_id: f.horario_id,
                    actividad: horario?.actividad,
                    dia_semana: horario?.dia_semana,
                    hora_inicio: horario?.hora_inicio,
                    created_at: f.created_at,
                  };
                });

                const profesoresPorClase: Record<string, ProfesorClaseInfo[]> = {};
                if (profesoresJoinRes && !profesoresJoinRes.error && Array.isArray(profesoresJoinRes.data)) {
                  for (const row of profesoresJoinRes.data as any[]) {
                    if (!row?.clase_id || !row?.profesor_id) continue;
                    const perfilJoin = Array.isArray(row.perfiles) ? row.perfiles[0] : row.perfiles;
                    const nombre =
                      perfilJoin && typeof perfilJoin.nombre_completo === "string" && perfilJoin.nombre_completo.trim()
                        ? perfilJoin.nombre_completo.trim()
                        : "Entrenador asignado";
                    const lista = profesoresPorClase[row.clase_id] ?? [];
                    if (!lista.some((p) => p.id === row.profesor_id)) {
                      lista.push({ id: row.profesor_id, nombre_completo: nombre });
                    }
                    profesoresPorClase[row.clase_id] = lista;
                  }
                }

                set({
                  semanaInicio: inicio.toISOString(),
                  clases: clasesReales,
                  profesoresPorClase,
                  agendaReservas: agendaReservasReales,
                  clasesFijas: clasesFijasReales,
                  sinCupo: calcularSinCupo(clasesReales, agendaReservasReales),
                  feedbacksPorReserva,
                  actualizadoAt: new Date().toISOString(),
                  cargando: false,
                  error: null,
                });
                return;
              }

              if (clasesRes.error) {
                set({
                  cargando: false,
                  error: clasesRes.error.message || "No pudimos cargar la agenda.",
                });
                return;
              }
            } catch (err: any) {
              set({
                cargando: false,
                error: err?.message || "No pudimos cargar la agenda.",
              });
              return;
            }
          }
        }

        // Offline o sin sesión autenticada: preservar caché existente sin inventar datos demo
        const clases = get().clases;
        const agendaReservas = get().agendaReservas;
        set({
          semanaInicio: inicio.toISOString(),
          clases,
          agendaReservas,
          sinCupo: calcularSinCupo(clases, agendaReservas),
          actualizadoAt: new Date().toISOString(),
          cargando: false,
        });
      },

      marcarAusente: async (reservaId) => {
        const isOnline = useOfflineQueueStore.getState().isOnline;
        const userId = isOnline ? await getAuthenticatedUserId() : null;

        if (!isOnline && UUID_RE.test(reservaId)) {
          set({ error: MENSAJE_SIN_SENAL });
          return;
        }

        if (userId && UUID_RE.test(reservaId)) {
          const { data, error } = await supabase.rpc("marcar_ausente", {
            p_reserva_id: reservaId,
          });
          if (error) {
            set({ error: extraerMensajeRpcError(error, "No pudimos marcar ausente.") });
            return;
          }
          const updated = (data as Reserva | null) ?? null;
          set({
            agendaReservas: get().agendaReservas.map((r) =>
              r.id === reservaId ? { ...r, ...(updated ?? {}), estado: "AUSENTE" as const } : r,
            ),
            misReservas: get().misReservas.map((r) =>
              r.id === reservaId ? { ...r, ...(updated ?? {}), estado: "AUSENTE" as const } : r,
            ),
            error: null,
          });
          return;
        }

        const ahoraMs = get().testAhora ? new Date(get().testAhora!).getTime() : Date.now();
        const reserva = get().agendaReservas.find((r) => r.id === reservaId);
        if (!reserva) {
          set({ error: MENSAJES_ERROR.P0002 });
          return;
        }
        const clase = get().clases.find((c) => c.id === reserva.clase_id);
        if (clase && new Date(clase.inicio).getTime() > ahoraMs) {
          set({ error: MENSAJES_ERROR.GZ006 });
          return;
        }
        set({
          agendaReservas: get().agendaReservas.map((r) =>
            r.id === reservaId ? { ...r, estado: "AUSENTE" as const } : r,
          ),
          misReservas: get().misReservas.map((r) =>
            r.id === reservaId ? { ...r, estado: "AUSENTE" as const } : r,
          ),
          error: null,
        });
      },

      eliminarClase: async (claseId) => {
        const clase = get().clases.find((c) => c.id === claseId);
        if (!clase) {
          set({ error: MENSAJES_ERROR.P0002 });
          return false;
        }
        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline) {
          set({ error: MENSAJE_SIN_SENAL });
          return false;
        }

        const userId = await getAuthenticatedUserId();
        if (userId && UUID_RE.test(claseId)) {
          const { error } = await supabase.rpc("eliminar_clase_vacia", {
            p_clase_id: claseId,
          });
          if (error) {
            set({ error: extraerMensajeRpcError(error, "No pudimos eliminar la clase.") });
            return false;
          }
        }

        set({
          clases: get().clases.filter((c) => c.id !== claseId),
          agendaReservas: get().agendaReservas.filter((r) => r.clase_id !== claseId),
          misReservas: get().misReservas.filter((r) => r.clase_id !== claseId),
          sinCupo: get().sinCupo.filter((id) => id !== claseId),
          aviso: "Clase eliminada.",
          error: null,
        });
        return true;
      },

      cancelarClase: async (claseId, motivo, pushearInicio = true) => {
        const clase = get().clases.find((c) => c.id === claseId);
        if (!clase) {
          set({ error: MENSAJES_ERROR.P0002 });
          return false;
        }
        if (clase.estado === "CANCELADA") {
          set({ error: MENSAJES_ERROR.GZ007 });
          return false;
        }

        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline) {
          set({ error: MENSAJE_SIN_SENAL });
          return false;
        }

        const inscriptos = get().agendaReservas.filter(
          (r) => r.clase_id === claseId && ocupaCupo(r),
        );

        if (inscriptos.length === 0) {
          return get().eliminarClase(claseId);
        }

        const isClaseUuid = UUID_RE.test(claseId);
        const userId = await getAuthenticatedUserId();
        let syncedViaRpc = false;

        if (isClaseUuid && isOnline) {
          try {
            const { data, error } = await supabase.rpc("cancelar_clase_con_aviso", {
              p_clase_id: claseId,
              p_motivo: motivo.trim() || null,
              p_pushear_inicio: pushearInicio,
            });
            if (error) {
              if (userId) {
                set({ error: extraerMensajeRpcError(error, "No pudimos cancelar la clase.") });
                return false;
              }
            } else if (data) {
              syncedViaRpc = true;
            }
          } catch (err: any) {
            if (userId) {
              set({ error: err?.message || "No pudimos cancelar la clase." });
              return false;
            }
          }
        }

        set({
          clases: get().clases.map((c) =>
            c.id === claseId
              ? { ...c, estado: "CANCELADA" as const, motivo_cancelacion: motivo || null }
              : c,
          ),
          agendaReservas: get().agendaReservas.map((r) =>
            r.clase_id === claseId && r.estado === "ANOTADO"
              ? { ...r, estado: "ANULADO" as const }
              : r,
          ),
          misReservas: get().misReservas.map((r) =>
            r.clase_id === claseId && r.estado === "ANOTADO"
              ? { ...r, estado: "ANULADO" as const }
              : r,
          ),
          aviso: "Clase cancelada.",
          error: null,
        });

        if (syncedViaRpc) {
          void useChatStore.getState().syncWithSupabase();
        } else {
          const alumnoIds = Array.from(new Set(inscriptos.map((r) => r.alumno_id)));
          const remitente = useChatStore.getState().activeCoachSender || STAFF_COACH_PRINCIPAL;
          const mensajeTexto = buildCancelacionAvisoTexto({
            actividad: clase.actividad,
            inicio: clase.inicio,
            motivo,
          });

          for (const alumnoId of alumnoIds) {
            try {
              useChatStore.getState().sendMessage({
                alumnoId,
                remitente,
                contenido: mensajeTexto,
                requiereLecturaInicio: pushearInicio,
              });
            } catch {
              // si falla o se encola offline, no interrumpe
            }
          }
        }

        return true;
      },

      reactivarClase: async (claseId) => {
        const clase = get().clases.find((c) => c.id === claseId);
        if (!clase) {
          set({ error: MENSAJES_ERROR.P0002 });
          return false;
        }
        if (clase.estado !== "CANCELADA") {
          set({ error: "La clase no está cancelada" });
          return false;
        }

        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline) {
          set({ error: MENSAJE_SIN_SENAL });
          return false;
        }

        const userId = await getAuthenticatedUserId();
        let claseReactivada: Clase = {
          ...clase,
          estado: "PROGRAMADA",
          motivo_cancelacion: null,
          updated_at: new Date().toISOString(),
        };

        if (userId && UUID_RE.test(claseId)) {
          const { data, error } = await supabase.rpc("reactivar_clase", {
            p_clase_id: claseId,
          });
          if (error) {
            set({ error: extraerMensajeRpcError(error, "No pudimos reactivar la clase.") });
            return false;
          }
          if (data) {
            claseReactivada = data as Clase;
          }
          void useChatStore.getState().syncWithSupabase();
        }

        const nuevaAgenda = get().agendaReservas.map((r) =>
          r.clase_id === claseId && r.estado === "ANULADO"
            ? { ...r, estado: "ANOTADO" as const, updated_at: new Date().toISOString() }
            : r,
        );
        const nuevasMis = get().misReservas.map((r) =>
          r.clase_id === claseId && r.estado === "ANULADO"
            ? { ...r, estado: "ANOTADO" as const, updated_at: new Date().toISOString() }
            : r,
        );

        set({
          clases: get().clases.map((c) => (c.id === claseId ? claseReactivada : c)),
          agendaReservas: nuevaAgenda,
          misReservas: nuevasMis,
          sinCupo: recalcularSinCupoClase(get().sinCupo, claseReactivada, nuevaAgenda),
          aviso: "Clase reactivada. Los alumnos anotados volvieron a su lugar.",
          error: null,
        });

        return true;
      },

      // Métodos Coach Studio (GOZS-184 / GOZS-638)
      crearClase: async (datos) => {
        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline) {
          set({ error: MENSAJE_SIN_SENAL });
          throw new Error(MENSAJE_SIN_SENAL);
        }

        const duracion = datos.duracion_minutos ?? 60;
        const capacidad = datos.capacidad !== undefined ? datos.capacidad : null;
        const userId = await getAuthenticatedUserId();

        if (userId) {
          const { data, error } = await supabase.rpc("crear_clases_agenda", {
            p_actividad: datos.actividad,
            p_inicio: datos.inicio,
            p_duracion_minutos: duracion,
            p_capacidad: capacidad,
            p_recurrente: false,
          });
          if (error) {
            const msg = extraerMensajeRpcError(error, "No pudimos crear la clase.");
            set({ error: msg });
            throw new Error(msg);
          }
          const creadas = (Array.isArray(data) ? data : data ? [data] : []) as Clase[];
          const primera = creadas[0];
          if (!primera) {
            const msg = "No se generó ninguna clase en la agenda.";
            set({ error: msg });
            throw new Error(msg);
          }
          set({
            clases: mergeClasesOrdenadas(get().clases, creadas),
            aviso: "Clase creada.",
            error: null,
          });
          return primera;
        }

        const nuevaClase: Clase = {
          id: `demo-clase-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          horario_id: null,
          actividad: datos.actividad,
          inicio: datos.inicio,
          duracion_minutos: duracion,
          capacidad,
          estado: "PROGRAMADA",
          motivo_cancelacion: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set({
          clases: mergeClasesOrdenadas(get().clases, [nuevaClase]),
          aviso: "Clase creada.",
          error: null,
        });
        return nuevaClase;
      },

      crearClasesRecurrentes: async (datos) => {
        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline) {
          set({ error: MENSAJE_SIN_SENAL });
          throw new Error(MENSAJE_SIN_SENAL);
        }

        const duracion = datos.duracion_minutos ?? 60;
        const capacidad = datos.capacidad !== undefined ? datos.capacidad : null;
        const userId = await getAuthenticatedUserId();

        if (userId) {
          const { data, error } = await supabase.rpc("crear_clases_agenda", {
            p_actividad: datos.actividad,
            p_duracion_minutos: duracion,
            p_capacidad: capacidad,
            p_recurrente: true,
            p_dias_semana: datos.dias_semana,
            p_hora_inicio: datos.hora_inicio,
            p_fecha_inicio: datos.fecha_inicio,
            p_fecha_fin: datos.fecha_fin ?? null,
            p_semanas: datos.semanas ?? 4,
          });
          if (error) {
            const msg = extraerMensajeRpcError(error, "No pudimos crear las clases recurrentes.");
            set({ error: msg });
            throw new Error(msg);
          }
          const creadas = (Array.isArray(data) ? data : data ? [data] : []) as Clase[];
          set({
            clases: mergeClasesOrdenadas(get().clases, creadas),
            aviso:
              creadas.length > 0
                ? `Se crearon ${creadas.length} ${creadas.length === 1 ? "clase" : "clases"} en la agenda.`
                : "Los horarios ya estaban creados en la agenda.",
            error: null,
          });
          return creadas;
        }

        const creadas = generarInstanciasRecurrentesDemo(datos);
        set({
          clases: mergeClasesOrdenadas(get().clases, creadas),
          aviso: `Se crearon ${creadas.length} ${creadas.length === 1 ? "clase" : "clases"} en la agenda.`,
          error: null,
        });
        return creadas;
      },

      actualizarClase: async (claseId, datos) => {
        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline) {
          set({ error: MENSAJE_SIN_SENAL });
          return false;
        }

        const claseExistente = get().clases.find((c) => c.id === claseId);
        if (!claseExistente) {
          set({ error: MENSAJES_ERROR.P0002 });
          return false;
        }

        const updatedAt = new Date().toISOString();
        let claseActualizada: Clase = {
          ...claseExistente,
          ...(datos.actividad !== undefined ? { actividad: datos.actividad } : {}),
          ...(datos.inicio !== undefined ? { inicio: datos.inicio } : {}),
          ...(datos.duracion_minutos !== undefined
            ? { duracion_minutos: datos.duracion_minutos }
            : {}),
          ...(datos.capacidad !== undefined ? { capacidad: datos.capacidad } : {}),
          updated_at: updatedAt,
        };

        const userId = await getAuthenticatedUserId();
        if (userId && UUID_RE.test(claseId)) {
          const payload: Database["public"]["Tables"]["clases"]["Update"] = {
            updated_at: updatedAt,
          };
          if (datos.actividad !== undefined) payload.actividad = datos.actividad;
          if (datos.inicio !== undefined) payload.inicio = datos.inicio;
          if (datos.duracion_minutos !== undefined) payload.duracion_minutos = datos.duracion_minutos;
          if (datos.capacidad !== undefined) payload.capacidad = datos.capacidad;

          const { data, error } = await supabase
            .from("clases")
            .update(payload)
            .eq("id", claseId)
            .select("*")
            .maybeSingle();

          if (error) {
            set({
              error: extraerMensajeRpcError(error, "No pudimos actualizar la clase."),
              aviso: null,
            });
            return false;
          }
          if (!data) {
            set({
              error: "No pudimos guardar los cambios de la clase.",
              aviso: null,
            });
            return false;
          }
          claseActualizada = data;
        }

        const sinCupo = recalcularSinCupoClase(
          get().sinCupo,
          claseActualizada,
          get().agendaReservas,
        );

        set({
          clases: get().clases.map((c) => (c.id === claseId ? claseActualizada : c)),
          sinCupo,
          aviso: "Clase actualizada",
          error: null,
        });

        return true;
      },

      editarClase: async (claseId, datos) => {
        return get().actualizarClase(claseId, datos);
      },

      moverClase: async (claseId, nuevoInicio) => {
        return get().actualizarClase(claseId, { inicio: nuevoInicio });
      },

      redimensionarClase: async (claseId, nuevaDuracionMinutos) => {
        return get().actualizarClase(claseId, { duracion_minutos: nuevaDuracionMinutos });
      },

      actualizarCupoClase: async (claseId, nuevaCapacidad) => {
        return get().actualizarClase(claseId, { capacidad: nuevaCapacidad });
      },

      anotarAlumnoCoach: async (claseId, alumnoId, forzar = false) => {
        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline) {
          set({ error: MENSAJE_SIN_SENAL });
          return { ok: false, advertencia: MENSAJE_SIN_SENAL, requiereConfirmacion: false };
        }

        const clase = get().clases.find((c) => c.id === claseId);
        if (!clase) {
          set({ error: MENSAJES_ERROR.P0002 });
          return { ok: false, advertencia: MENSAJES_ERROR.P0002, requiereConfirmacion: false };
        }
        if (clase.estado === "CANCELADA") {
          set({ error: MENSAJES_ERROR.GZ007 });
          return { ok: false, advertencia: MENSAJES_ERROR.GZ007, requiereConfirmacion: false };
        }

        const yaAnotado = get().agendaReservas.some(
          (r) =>
            r.clase_id === claseId &&
            r.alumno_id === alumnoId &&
            r.estado !== "CANCELADO" &&
            r.estado !== "ANULADO",
        );
        if (yaAnotado) {
          set({ error: MENSAJES_ERROR.GZ008 });
          return { ok: false, advertencia: MENSAJES_ERROR.GZ008, requiereConfirmacion: false };
        }

        const studioAlumnos = useCoachStudioStore.getState().alumnos;
        const nombreAlumno = resolverNombreAlumno(alumnoId);
        const userId = await getAuthenticatedUserId();

        if (userId && UUID_RE.test(claseId) && UUID_RE.test(alumnoId)) {
          const { data, error } = await supabase.rpc("anotar_alumno_coach", {
            p_clase_id: claseId,
            p_alumno_id: alumnoId,
            p_forzar: forzar,
          });

          if (error) {
            const msg = extraerMensajeRpcError(error, "No pudimos anotar al alumno.");
            set({ error: msg });
            return { ok: false, advertencia: msg, requiereConfirmacion: false };
          }

          const row = Array.isArray(data) ? data[0] : data;
          if (row?.requiere_confirmacion && !row?.reserva_id) {
            return {
              ok: false,
              advertencia: row.aviso ?? "Esta inscripción requiere confirmación del coach.",
              requiereConfirmacion: true,
            };
          }

          const ahoraIso = new Date().toISOString();
          const nuevaReserva: ReservaAgenda = {
            id: row?.reserva_id ?? `res-coach-${Date.now()}`,
            clase_id: claseId,
            alumno_id: alumnoId,
            alumno_nombre: nombreAlumno,
            estado: "ANOTADO",
            created_at: ahoraIso,
            updated_at: ahoraIso,
          };

          const nuevaAgenda = [...get().agendaReservas, nuevaReserva];
          set({
            agendaReservas: nuevaAgenda,
            sinCupo: recalcularSinCupoClase(get().sinCupo, clase, nuevaAgenda),
            error: null,
            aviso: row?.aviso
              ? `Alumno anotado (${row.aviso}).`
              : "Alumno anotado correctamente.",
          });

          return {
            ok: true,
            advertencia: row?.aviso ?? undefined,
            requiereConfirmacion: false,
          };
        }

        // Fallback controlado para entorno de test/demo
        const todosAlumnos = [...studioAlumnos, ...DEMO_ALUMNOS, ...DEMO_ALUMNOS_CLASES];
        const alumno = todosAlumnos.find((a) => a.id === alumnoId) ?? {
          id: alumnoId,
          nombre_completo: nombreAlumno,
          email: "",
          telefono: null,
          rol: "ALUMNO" as const,
          estado_membresia: "ACTIVA" as const,
          profesor_asignado_id: null,
          fecha_baja: null,
          fecha_vencimiento_cuota: null,
          ultimo_entreno_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const contratacion =
          useCoachStudioStore.getState().contrataciones.find((c) => c.alumno_id === alumnoId) ??
          DEMO_CONTRATACIONES_CLASES.find((c) => c.alumno_id === alumnoId) ??
          null;
        const plan = contratacion?.plan_membresia_id
          ? DEMO_PLANES_MEMBRESIA.find((p) => p.id === contratacion.plan_membresia_id) ?? null
          : null;

        const anotadosClaseActual = get().agendaReservas.filter(
          (r) => r.clase_id === claseId && ocupaCupo(r),
        ).length;
        const { inicio: semIni, fin: semFin } = semanaEnCurso(new Date(clase.inicio));
        const clasesSemanaIds = new Set(
          get()
            .clases.filter((c) => {
              const t = new Date(c.inicio).getTime();
              return t >= semIni.getTime() && t <= semFin.getTime();
            })
            .map((c) => c.id),
        );

        const usadasSemanaAlumno = new Set(
          get()
            .agendaReservas.filter(
              (r) => r.alumno_id === alumnoId && ocupaCupo(r) && clasesSemanaIds.has(r.clase_id),
            )
            .map((r) => r.clase_id),
        ).size;

        const validacion = validarAnotacionCoach({
          clase,
          alumno,
          contratacion,
          plan,
          anotadosClaseActual,
          usadasSemanaAlumno,
          ahora: get().testAhora ? new Date(get().testAhora!) : new Date(),
        });

        if (!forzar && validacion.requiereConfirmacion) {
          return {
            ok: false,
            advertencia: validacion.advertencia,
            requiereConfirmacion: true,
          };
        }

        const nuevaReserva: ReservaAgenda = {
          id: `res-coach-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          clase_id: claseId,
          alumno_id: alumnoId,
          alumno_nombre: alumno.nombre_completo,
          estado: "ANOTADO",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const nuevaAgenda = [...get().agendaReservas, nuevaReserva];
        set({
          agendaReservas: nuevaAgenda,
          sinCupo: recalcularSinCupoClase(get().sinCupo, clase, nuevaAgenda),
          error: null,
          aviso: validacion.requiereConfirmacion
            ? `Alumno anotado por excepción (${validacion.tipoAviso}).`
            : "Alumno anotado correctamente.",
        });

        return {
          ok: true,
          advertencia: validacion.advertencia,
          requiereConfirmacion: false,
        };
      },

      quitarAnotadoCoach: async (reservaId) => {
        const isOnline = useOfflineQueueStore.getState().isOnline;
        if (!isOnline) {
          set({ error: MENSAJE_SIN_SENAL });
          return false;
        }

        const reserva = get().agendaReservas.find((r) => r.id === reservaId);
        if (!reserva) return false;

        const userId = await getAuthenticatedUserId();
        if (userId && UUID_RE.test(reservaId)) {
          const { error } = await supabase.rpc("quitar_reserva_coach", {
            p_reserva_id: reservaId,
          });
          if (error) {
            set({ error: extraerMensajeRpcError(error, "No pudimos quitar al alumno.") });
            return false;
          }
        }

        const nuevaAgenda = get().agendaReservas.filter((r) => r.id !== reservaId);
        const clase = get().clases.find((c) => c.id === reserva.clase_id);

        set({
          agendaReservas: nuevaAgenda,
          misReservas: get().misReservas.filter((r) => r.id !== reservaId),
          sinCupo: recalcularSinCupoClase(get().sinCupo, clase, nuevaAgenda),
          aviso: "Alumno quitado de la clase.",
          error: null,
        });
        return true;
      },

      asignarClaseFija: async (horarioId, alumnoId) => {
        if (!horarioId || !alumnoId) return false;
        if (UUID_RE.test(horarioId) && UUID_RE.test(alumnoId)) {
          try {
            const id = await asignarClaseFijaRpc(horarioId, alumnoId);
            set((state) => ({
              clasesFijas: [
                ...state.clasesFijas.filter((f) => !(f.alumno_id === alumnoId && f.horario_id === horarioId)),
                { id, alumno_id: alumnoId, horario_id: horarioId, created_at: new Date().toISOString() },
              ],
              error: null,
            }));
            return true;
          } catch (e) {
            set({ error: e instanceof Error ? e.message : "No pudimos fijar la clase." });
            return false;
          }
        }
        const nuevaFija: ClaseFijaItem = {
          id: `demo-fija-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          alumno_id: alumnoId,
          horario_id: horarioId,
          created_at: new Date().toISOString(),
        };

        set((state) => ({
          clasesFijas: [
            ...state.clasesFijas.filter((f) => !(f.alumno_id === alumnoId && f.horario_id === horarioId)),
            nuevaFija,
          ],
        }));
        return true;
      },

      quitarClaseFija: async (claseFijaId) => {
        if (UUID_RE.test(claseFijaId)) {
          try {
            await quitarClaseFijaRpc(claseFijaId);
          } catch (e) {
            set({ error: e instanceof Error ? e.message : "No pudimos quitar la clase fija." });
            return false;
          }
        }
        set((state) => ({
          clasesFijas: state.clasesFijas.filter((f) => f.id !== claseFijaId),
        }));
        return true;
      },

      obtenerClasesFijasAlumno: (alumnoId) => {
        return get().clasesFijas.filter((f) => f.alumno_id === alumnoId);
      },

      limpiarMensajes: () => set({ error: null, aviso: null, errorCargaClases: false }),
    }),
    {
      name: "gozster-clases",
      version: 3,
      storage: createJSONStorage(() => safeStorage),
      migrate: (persistedState: any, version: number) => {
        const state = persistedState as Partial<ClasesState>;
        if (!version || version < 3) {
          return {
            ...state,
            clases: (state.clases ?? []).filter((c) => !c.id.startsWith("demo-")),
            agendaReservas: (state.agendaReservas ?? []).filter((r) => !r.id.startsWith("demo-")),
            profesoresPorClase: {},
            sinCupo: [],
          };
        }
        return state;
      },
      partialize: (s) => ({
        vista: s.vista,
        semanaInicio: s.semanaInicio,
        clases: s.clases,
        misReservas: s.misReservas,
        clasesFijas: s.clasesFijas,
        membresia: s.membresia,
        plan: s.plan,
        contratacionesAlumno: s.contratacionesAlumno,
        actividadesAlumno: s.actividadesAlumno,
        actividadesHabilitadas: s.actividadesHabilitadas,
        sinCupo: s.sinCupo,
        agendaReservas: s.agendaReservas,
        resumenClases: s.resumenClases,
        feedbacksPorReserva: s.feedbacksPorReserva,
        actualizadoAt: s.actualizadoAt,
      }),
    },
  ),
);
