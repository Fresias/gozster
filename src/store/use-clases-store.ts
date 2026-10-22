import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { supabase } from "@/lib/supabase/client";
import { MENSAJES_ERROR, mensajeErrorReserva, ocupaCupo, semanaEnCurso } from "@/lib/clases";
import { safeStorage, useOfflineQueueStore } from "@/store/use-offline-queue";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import {
  DEMO_ALUMNOS_CLASES,
  DEMO_CONTRATACIONES_CLASES,
  DEMO_PLANES_MEMBRESIA,
  generarDemoClasesSemana,
  generarDemoReservasIniciales,
} from "@/services/coach-demo-dataset";
import type { Clase, Contratacion, PlanMembresia, Reserva } from "@/types/database.types";

// Clases presenciales y reservas (#113 / GH #122).
// En modo producción las escrituras van solo por RPC (el backend valida cupo, límite y membresía).
// En modo testeo opera sobre el dataset demo (Lucía Ferraro, Valentina Ríos, Sofía Benítez, Joaquín Paz, Tomás Ledesma).
// El caché persistido mantiene la semana cargada visible sin conexión.

export interface ReservaAgenda extends Reserva {
  alumno_nombre: string;
}

interface ClasesState {
  semanaInicio: string | null;
  clases: Clase[];
  misReservas: Reserva[];
  membresia: Contratacion | null;
  plan: PlanMembresia | null;
  sinCupo: string[];
  agendaReservas: ReservaAgenda[];
  actualizadoAt: string | null;

  // Modo testeo (GH #122)
  demoAlumnoId: string;
  testAhora: string | null;
  setDemoAlumnoId: (id: string) => void;
  setTestAhora: (fechaIso: string | null) => void;
  resetDemoDataset: (fechaRef?: Date) => void;

  cargando: boolean;
  accionEnCurso: string | null;
  error: string | null;
  aviso: string | null;

  cargarClasesAlumno: () => Promise<void>;
  reservar: (claseId: string) => Promise<void>;
  cancelarReserva: (reservaId: string) => Promise<void>;
  cargarAgenda: () => Promise<void>;
  marcarAusente: (reservaId: string) => Promise<void>;
  cancelarClase: (claseId: string, motivo: string) => Promise<boolean>;
  limpiarMensajes: () => void;
}

const SIN_CONEXION = "Sin conexión: mostramos lo último guardado. Reintentá al reconectar.";

const enLinea = () => useOfflineQueueStore.getState().isOnline;
const esModoTesteo = () => useWorkspaceModeStore.getState().mode === "TESTEO";

async function clasesDeLaSemana(): Promise<{ semanaInicio: string; clases: Clase[] }> {
  const { inicio, fin } = semanaEnCurso();
  const { data, error } = await supabase
    .from("clases")
    .select("*")
    .gte("inicio", inicio.toISOString())
    .lte("inicio", fin.toISOString())
    .order("inicio");
  if (error) throw error;
  return { semanaInicio: inicio.toISOString(), clases: data ?? [] };
}

export const useClasesStore = create<ClasesState>()(
  persist(
    (set, get) => ({
      semanaInicio: null,
      clases: [],
      misReservas: [],
      membresia: null,
      plan: null,
      sinCupo: [],
      agendaReservas: [],
      actualizadoAt: null,

      demoAlumnoId: "demo-alumno-valentina",
      testAhora: null,
      setDemoAlumnoId: (id: string) => {
        set({ demoAlumnoId: id, error: null, aviso: null });
        if (esModoTesteo()) {
          const contratacion = DEMO_CONTRATACIONES_CLASES.find((c) => c.alumno_id === id) ?? null;
          const plan = contratacion?.plan_membresia_id
            ? DEMO_PLANES_MEMBRESIA.find((p) => p.id === contratacion.plan_membresia_id) ?? null
            : null;
          const misReservas = get().agendaReservas.filter((r) => r.alumno_id === id);
          set({ membresia: contratacion, plan, misReservas });
        }
      },
      setTestAhora: (fechaIso: string | null) => {
        set({ testAhora: fechaIso });
      },
      resetDemoDataset: (fechaRef = new Date()) => {
        const { inicio } = semanaEnCurso(fechaRef);
        // Lunes 12:00 ART como instante de referencia para que lunes 19:00, mié 19:00,
        // jue 19:00 y vie 20:00 queden futuros y reservables.
        const lunesMediodia = new Date(inicio.getTime() + 12 * 3600 * 1000).toISOString();
        const demoClases = generarDemoClasesSemana(fechaRef);
        const demoReservas = generarDemoReservasIniciales();
        const demoId = get().demoAlumnoId || "demo-alumno-valentina";
        const contratacion = DEMO_CONTRATACIONES_CLASES.find((c) => c.alumno_id === demoId) ?? null;
        const plan = contratacion?.plan_membresia_id
          ? DEMO_PLANES_MEMBRESIA.find((p) => p.id === contratacion.plan_membresia_id) ?? null
          : null;
        const misReservas = demoReservas.filter((r) => r.alumno_id === demoId);

        const sinCupo = demoClases
          .filter((c) => {
            if (!c.capacidad) return false;
            const ocupados = demoReservas.filter((r) => r.clase_id === c.id && ocupaCupo(r)).length;
            return ocupados >= c.capacidad;
          })
          .map((c) => c.id);

        set({
          semanaInicio: inicio.toISOString(),
          testAhora: lunesMediodia,
          clases: demoClases,
          agendaReservas: demoReservas,
          misReservas,
          membresia: contratacion,
          plan,
          sinCupo,
          actualizadoAt: new Date().toISOString(),
          error: null,
          aviso: null,
        });
      },

      cargando: false,
      accionEnCurso: null,
      error: null,
      aviso: null,

      cargarClasesAlumno: async () => {
        if (esModoTesteo()) {
          const { inicio } = semanaEnCurso();
          const clases = get().clases.length ? get().clases : generarDemoClasesSemana();
          const agendaReservas = get().agendaReservas.length ? get().agendaReservas : generarDemoReservasIniciales();
          const alumnoId = get().demoAlumnoId || "demo-alumno-valentina";
          const contratacion = DEMO_CONTRATACIONES_CLASES.find((c) => c.alumno_id === alumnoId) ?? null;
          const plan = contratacion?.plan_membresia_id
            ? DEMO_PLANES_MEMBRESIA.find((p) => p.id === contratacion.plan_membresia_id) ?? null
            : null;
          const misReservas = agendaReservas.filter((r) => r.alumno_id === alumnoId);

          const sinCupo = clases
            .filter((c) => {
              if (!c.capacidad) return false;
              const ocupados = agendaReservas.filter((r) => r.clase_id === c.id && ocupaCupo(r)).length;
              return ocupados >= c.capacidad;
            })
            .map((c) => c.id);

          set({
            semanaInicio: inicio.toISOString(),
            clases,
            agendaReservas,
            misReservas,
            membresia: contratacion,
            plan,
            sinCupo,
            actualizadoAt: new Date().toISOString(),
            cargando: false,
          });
          return;
        }

        if (!enLinea()) {
          set({ error: SIN_CONEXION });
          return;
        }
        set({ cargando: true, error: null });
        try {
          const { data: auth } = await supabase.auth.getUser();
          const alumnoId = auth.user?.id;
          if (!alumnoId) throw new Error("sin sesión");

          const { semanaInicio, clases } = await clasesDeLaSemana();
          const [reservas, contratacion] = await Promise.all([
            clases.length
              ? supabase.from("reservas").select("*").eq("alumno_id", alumnoId).in("clase_id", clases.map((c) => c.id))
              : Promise.resolve({ data: [] as Reserva[], error: null }),
            supabase
              .from("contrataciones")
              .select("*")
              .eq("alumno_id", alumnoId)
              .not("plan_membresia_id", "is", null)
              .order("fecha_fin", { ascending: false })
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);
          if (reservas.error) throw reservas.error;
          if (contratacion.error) throw contratacion.error;

          let plan: PlanMembresia | null = null;
          if (contratacion.data?.plan_membresia_id) {
            const res = await supabase
              .from("planes_membresia")
              .select("*")
              .eq("id", contratacion.data.plan_membresia_id)
              .maybeSingle();
            if (res.error) throw res.error;
            plan = res.data;
          }

          set({
            semanaInicio,
            clases,
            misReservas: reservas.data ?? [],
            membresia: contratacion.data,
            plan,
            sinCupo: semanaInicio === get().semanaInicio ? get().sinCupo : [],
            actualizadoAt: new Date().toISOString(),
          });
        } catch {
          set({ error: "No pudimos cargar las clases. Mostramos lo último guardado." });
        } finally {
          set({ cargando: false });
        }
      },

      reservar: async (claseId) => {
        if (esModoTesteo()) {
          set({ accionEnCurso: claseId, error: null, aviso: null });
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
          const nuevaOcupacion = nuevaAgenda.filter((r) => r.clase_id === claseId && ocupaCupo(r)).length;
          const sinCupo =
            clase.capacidad !== null && nuevaOcupacion >= clase.capacidad
              ? [...new Set([...get().sinCupo, claseId])]
              : get().sinCupo;

          set({
            agendaReservas: nuevaAgenda,
            misReservas: nuevasMis,
            sinCupo,
            accionEnCurso: null,
            error: null,
          });
          return;
        }

        if (!enLinea()) {
          set({ error: SIN_CONEXION });
          return;
        }
        set({ accionEnCurso: claseId, error: null, aviso: null });
        const { data, error } = await supabase.rpc("reservar_clase", { p_clase_id: claseId });
        if (error) {
          set({
            accionEnCurso: null,
            error: mensajeErrorReserva(error),
            sinCupo: error.code === "GZ001" ? [...new Set([...get().sinCupo, claseId])] : get().sinCupo,
          });
          return;
        }
        set({ aviso: data?.[0]?.aviso ?? null });
        await get().cargarClasesAlumno();
        set({ accionEnCurso: null });
      },

      cancelarReserva: async (reservaId) => {
        if (esModoTesteo()) {
          set({ accionEnCurso: reservaId, error: null, aviso: null });
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

          const nuevaAgenda = get().agendaReservas.map((r) =>
            r.id === reservaId ? { ...r, estado: "CANCELADO" as const } : r,
          );
          const nuevasMis = get().misReservas.map((r) =>
            r.id === reservaId ? { ...r, estado: "CANCELADO" as const } : r,
          );
          const sinCupo = get().sinCupo.filter((id) => id !== reserva.clase_id);

          set({
            agendaReservas: nuevaAgenda,
            misReservas: nuevasMis,
            sinCupo,
            accionEnCurso: null,
            error: null,
          });
          return;
        }

        if (!enLinea()) {
          set({ error: SIN_CONEXION });
          return;
        }
        set({ accionEnCurso: reservaId, error: null, aviso: null });
        const { error } = await supabase.rpc("cancelar_reserva", { p_reserva_id: reservaId });
        if (error) {
          set({ accionEnCurso: null, error: mensajeErrorReserva(error) });
          return;
        }
        await get().cargarClasesAlumno();
        set({ accionEnCurso: null });
      },

      cargarAgenda: async () => {
        if (esModoTesteo()) {
          const { inicio } = semanaEnCurso();
          const clases = get().clases.length ? get().clases : generarDemoClasesSemana();
          const agendaReservas = get().agendaReservas.length ? get().agendaReservas : generarDemoReservasIniciales();
          set({
            semanaInicio: inicio.toISOString(),
            clases,
            agendaReservas,
            actualizadoAt: new Date().toISOString(),
            cargando: false,
          });
          return;
        }

        if (!enLinea()) {
          set({ error: SIN_CONEXION });
          return;
        }
        set({ cargando: true, error: null });
        try {
          const { semanaInicio, clases } = await clasesDeLaSemana();
          let agendaReservas: ReservaAgenda[] = [];
          if (clases.length) {
            const { data, error } = await supabase
              .from("reservas")
              .select("*, perfiles(nombre_completo)")
              .in("clase_id", clases.map((c) => c.id))
              .neq("estado", "CANCELADO")
              .order("created_at");
            if (error) throw error;
            agendaReservas = (data ?? []).map(({ perfiles, ...r }) => ({
              ...r,
              alumno_nombre: perfiles?.nombre_completo ?? "Alumno",
            }));
          }
          set({ semanaInicio, clases, agendaReservas, actualizadoAt: new Date().toISOString() });
        } catch {
          set({ error: "No pudimos cargar la agenda. Mostramos lo último guardado." });
        } finally {
          set({ cargando: false });
        }
      },

      marcarAusente: async (reservaId) => {
        if (esModoTesteo()) {
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
          return;
        }

        if (!enLinea()) {
          set({ error: SIN_CONEXION });
          return;
        }
        const previas = get().agendaReservas;
        // Optimista: un toque y la fila cambia; si la RPC rechaza, se revierte.
        set({
          accionEnCurso: reservaId,
          error: null,
          agendaReservas: previas.map((r) => (r.id === reservaId ? { ...r, estado: "AUSENTE" } : r)),
        });
        const { error } = await supabase.rpc("marcar_ausente", { p_reserva_id: reservaId });
        set({
          accionEnCurso: null,
          ...(error ? { agendaReservas: previas, error: mensajeErrorReserva(error) } : {}),
        });
      },

      cancelarClase: async (claseId, motivo) => {
        if (esModoTesteo()) {
          const clase = get().clases.find((c) => c.id === claseId);
          if (!clase) {
            set({ error: MENSAJES_ERROR.P0002 });
            return false;
          }
          if (clase.estado === "CANCELADA") {
            set({ error: MENSAJES_ERROR.GZ007 });
            return false;
          }
          set({
            clases: get().clases.map((c) =>
              c.id === claseId ? { ...c, estado: "CANCELADA" as const, motivo_cancelacion: motivo } : c,
            ),
            agendaReservas: get().agendaReservas.map((r) =>
              r.clase_id === claseId ? { ...r, estado: "ANULADO" as const } : r,
            ),
            misReservas: get().misReservas.map((r) =>
              r.clase_id === claseId ? { ...r, estado: "ANULADO" as const } : r,
            ),
            error: null,
          });
          return true;
        }

        if (!enLinea()) {
          set({ error: SIN_CONEXION });
          return false;
        }
        set({ accionEnCurso: claseId, error: null });
        const { error } = await supabase.rpc("cancelar_clase", { p_clase_id: claseId, p_motivo: motivo });
        if (error) {
          set({ accionEnCurso: null, error: mensajeErrorReserva(error) });
          return false;
        }
        await get().cargarAgenda();
        set({ accionEnCurso: null });
        return true;
      },

      limpiarMensajes: () => set({ error: null, aviso: null }),
    }),
    {
      name: "gozster-clases",
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        semanaInicio: s.semanaInicio,
        clases: s.clases,
        misReservas: s.misReservas,
        membresia: s.membresia,
        plan: s.plan,
        sinCupo: s.sinCupo,
        agendaReservas: s.agendaReservas,
        actualizadoAt: s.actualizadoAt,
      }),
    },
  ),
);
