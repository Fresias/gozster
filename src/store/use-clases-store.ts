import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { supabase } from "@/lib/supabase/client";
import { mensajeErrorReserva, semanaEnCurso } from "@/lib/clases";
import { safeStorage, useOfflineQueueStore } from "@/store/use-offline-queue";
import type { Clase, Contratacion, PlanMembresia, Reserva } from "@/types/database.types";

// Clases presenciales y reservas (#113). Las escrituras van solo por RPC (el
// backend valida cupo, límite y membresía); el caché persistido mantiene la
// semana cargada visible sin conexión.

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

      cargando: false,
      accionEnCurso: null,
      error: null,
      aviso: null,

      cargarClasesAlumno: async () => {
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
            sinCupo: error.code === "GZ001" ? [...get().sinCupo, claseId] : get().sinCupo,
          });
          return;
        }
        set({ aviso: data?.[0]?.aviso ?? null });
        await get().cargarClasesAlumno();
        set({ accionEnCurso: null });
      },

      cancelarReserva: async (reservaId) => {
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
