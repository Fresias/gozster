import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  MENSAJES_ERROR,
  mensajeErrorReserva,
  ocupaCupo,
  semanaEnCurso,
  validarAnotacionCoach,
  claveDia,
} from "@/lib/clases";
import { safeStorage } from "@/store/use-offline-queue";
import { useChatStore, STAFF_COACH_PRINCIPAL } from "@/store/use-chat-store";
import {
  DEMO_ALUMNOS,
  DEMO_ALUMNOS_CLASES,
  DEMO_CONTRATACIONES_CLASES,
  DEMO_PLANES_MEMBRESIA,
  generarDemoClasesSemana,
  generarDemoReservasIniciales,
} from "@/services/coach-demo-dataset";
import type { ActividadClase, Clase, Contratacion, PlanMembresia, Reserva } from "@/types/database.types";
import { supabase } from "@/lib/supabase/client";

const NOMBRE_ACTIVIDAD: Record<string, string> = {
  FUNCIONAL: "Funcional",
  BOXEO: "Boxeo",
};

// Clases presenciales y reservas (#113 / GH #122 / GOZS-184).
// Opera sobre el dataset demo (Lucía Ferraro, Valentina, Sofía, Joaquín, Tomás).
// El caché persistido mantiene la agenda visible sin conexión (Offline-First).

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

interface ClasesState {
  vista: VistaAgenda;
  setVista: (v: VistaAgenda) => void;

  semanaInicio: string | null;
  clases: Clase[];
  misReservas: Reserva[];
  clasesFijas: ClaseFijaItem[];
  membresia: Contratacion | null;
  plan: PlanMembresia | null;
  sinCupo: string[];
  agendaReservas: ReservaAgenda[];
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
  aviso: string | null;

  cargarClasesAlumno: () => Promise<void>;
  reservar: (claseId: string) => Promise<void>;
  cancelarReserva: (reservaId: string) => Promise<void>;
  cargarAgenda: () => Promise<void>;
  marcarAusente: (reservaId: string) => Promise<void>;
  cancelarClase: (claseId: string, motivo: string) => Promise<boolean>;

  // Métodos Coach Studio (GOZS-184: crear, mover, redimensionar, cupo flexible, anotar)
  crearClase: (datos: {
    actividad: ActividadClase;
    inicio: string;
    duracion_minutos?: number;
    capacidad?: number | null;
  }) => Promise<Clase>;
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
      misReservas: [],
      clasesFijas: [],
      membresia: null,
      plan: null,
      sinCupo: [],
      agendaReservas: [],
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
        set({ membresia: contratacion, plan, misReservas });
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
          clasesFijas: [
            { id: "demo-fija-valentina-1", alumno_id: "demo-alumno-valentina", horario_id: "demo-horario-func-lunes" },
            { id: "demo-fija-valentina-2", alumno_id: "demo-alumno-valentina", horario_id: "demo-horario-func-miercoles" },
          ],
          membresia: contratacion,
          plan,
          sinCupo,
          actualizadoAt: new Date().toISOString(),
          error: null,
          aviso: null,
        });
      },
      resetDemo: (fechaRef?: Date) => get().resetDemoDataset(fechaRef),

      cargando: false,
      accionEnCurso: null,
      error: null,
      aviso: null,

      cargarClasesAlumno: async () => {
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
      },

      reservar: async (claseId) => {
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
        const sinCupo =
          clase.capacidad !== null &&
          nuevaAgenda.filter((r) => r.clase_id === claseId && ocupaCupo(r)).length >= clase.capacidad
            ? [...new Set([...get().sinCupo, claseId])]
            : get().sinCupo;

        set({
          agendaReservas: nuevaAgenda,
          misReservas: nuevasMis,
          sinCupo,
          accionEnCurso: null,
          error: null,
        });
      },

      cancelarReserva: async (reservaId) => {
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
      },

      cargarAgenda: async () => {
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
      },

      marcarAusente: async (reservaId) => {
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

      cancelarClase: async (claseId, motivo) => {
        const clase = get().clases.find((c) => c.id === claseId);
        if (!clase) {
          set({ error: MENSAJES_ERROR.P0002 });
          return false;
        }
        if (clase.estado === "CANCELADA") {
          set({ error: MENSAJES_ERROR.GZ007 });
          return false;
        }

        const inscriptos = get().agendaReservas.filter(
          (r) => r.clase_id === claseId && ocupaCupo(r),
        );

        if (inscriptos.length === 0) {
          // Sin inscriptos: se borra sin avisar y sin mensajes
          set({
            clases: get().clases.filter((c) => c.id !== claseId),
            agendaReservas: get().agendaReservas.filter((r) => r.clase_id !== claseId),
            misReservas: get().misReservas.filter((r) => r.clase_id !== claseId),
            error: null,
          });
          return true;
        }

        // Con inscriptos: notifica a todos los inscriptos por el chat y pasa la clase a CANCELADA
        set({
          clases: get().clases.map((c) =>
            c.id === claseId ? { ...c, estado: "CANCELADA" as const, motivo_cancelacion: motivo || null } : c,
          ),
          agendaReservas: get().agendaReservas.map((r) =>
            r.clase_id === claseId ? { ...r, estado: "ANULADO" as const } : r,
          ),
          misReservas: get().misReservas.map((r) =>
            r.clase_id === claseId ? { ...r, estado: "ANULADO" as const } : r,
          ),
          error: null,
        });

        // Notificar por chat a cada alumno inscripto
        const alumnoIds = Array.from(new Set(inscriptos.map((r) => r.alumno_id)));
        const remitente = useChatStore.getState().activeCoachSender || STAFF_COACH_PRINCIPAL;
        const fechaObj = new Date(clase.inicio);
        const horaStr = fechaObj.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const diaStr = fechaObj.toLocaleDateString("es-AR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        });
        const actividadNombre = NOMBRE_ACTIVIDAD[clase.actividad] || clase.actividad;
        const motivoTexto = motivo?.trim() ? ` Motivo: ${motivo.trim()}` : "";
        const mensajeTexto = `Tu clase de ${actividadNombre} del ${diaStr} ${horaStr} fue cancelada.${motivoTexto}`;

        for (const alumnoId of alumnoIds) {
          try {
            useChatStore.getState().sendMessage({
              alumnoId,
              remitente,
              contenido: mensajeTexto,
            });
          } catch {
            // si falla o se encola offline, no interrumpe
          }
        }

        return true;
      },

      // Métodos Coach Studio (GOZS-184)
      crearClase: async (datos) => {
        const duracion = datos.duracion_minutos ?? 60;
        const capacidad = datos.capacidad !== undefined ? datos.capacidad : null;

        const nuevaClase: Clase = {
          id: `demo-clase-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          horario_id: null,
          actividad: datos.actividad,
          inicio: datos.inicio,
          duracion_minutos: duracion,
          capacidad: capacidad,
          estado: "PROGRAMADA",
          motivo_cancelacion: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set({ clases: [...get().clases, nuevaClase] });
        return nuevaClase;
      },

      actualizarClase: async (claseId, datos) => {
        const claseExistente = get().clases.find((c) => c.id === claseId);
        if (!claseExistente) return false;

        const nuevaCapacidad =
          datos.capacidad !== undefined ? datos.capacidad : claseExistente.capacidad;

        const claseActualizada: Clase = {
          ...claseExistente,
          ...(datos.actividad !== undefined ? { actividad: datos.actividad } : {}),
          ...(datos.inicio !== undefined ? { inicio: datos.inicio } : {}),
          ...(datos.duracion_minutos !== undefined
            ? { duracion_minutos: datos.duracion_minutos }
            : {}),
          ...(datos.capacidad !== undefined ? { capacidad: datos.capacidad } : {}),
          updated_at: new Date().toISOString(),
        };

        const ocupados = get().agendaReservas.filter(
          (r) => r.clase_id === claseId && ocupaCupo(r),
        ).length;
        let sinCupo = get().sinCupo;
        if (nuevaCapacidad !== null && ocupados >= nuevaCapacidad) {
          sinCupo = [...new Set([...sinCupo, claseId])];
        } else {
          sinCupo = sinCupo.filter((id) => id !== claseId);
        }

        set({
          clases: get().clases.map((c) => (c.id === claseId ? claseActualizada : c)),
          sinCupo,
        });

        if (supabase) {
          try {
            const payload: Record<string, any> = {
              updated_at: claseActualizada.updated_at,
            };
            if (datos.actividad !== undefined) payload.actividad = datos.actividad;
            if (datos.inicio !== undefined) payload.inicio = datos.inicio;
            if (datos.duracion_minutos !== undefined)
              payload.duracion_minutos = datos.duracion_minutos;
            if (datos.capacidad !== undefined) payload.capacidad = datos.capacidad;

            await (supabase as any)
              .from("clases")
              .update(payload)
              .eq("id", claseId);
          } catch {
            // Modo offline-first: tolerar fallas de red
          }
        }

        return true;
      },

      editarClase: async (claseId, datos) => {
        return get().actualizarClase(claseId, datos);
      },

      moverClase: async (claseId, nuevoInicio) => {
        set({
          clases: get().clases.map((c) =>
            c.id === claseId ? { ...c, inicio: nuevoInicio, updated_at: new Date().toISOString() } : c,
          ),
        });
        if (supabase) {
          try {
            await (supabase as any)
              .from("clases")
              .update({ inicio: nuevoInicio, updated_at: new Date().toISOString() })
              .eq("id", claseId);
          } catch {}
        }
        return true;
      },

      redimensionarClase: async (claseId, nuevaDuracionMinutos) => {
        set({
          clases: get().clases.map((c) =>
            c.id === claseId
              ? { ...c, duracion_minutos: nuevaDuracionMinutos, updated_at: new Date().toISOString() }
              : c,
          ),
        });
        if (supabase) {
          try {
            await (supabase as any)
              .from("clases")
              .update({ duracion_minutos: nuevaDuracionMinutos, updated_at: new Date().toISOString() })
              .eq("id", claseId);
          } catch {}
        }
        return true;
      },

      actualizarCupoClase: async (claseId, nuevaCapacidad) => {
        set({
          clases: get().clases.map((c) =>
            c.id === claseId
              ? { ...c, capacidad: nuevaCapacidad, updated_at: new Date().toISOString() }
              : c,
          ),
        });
        if (supabase) {
          try {
            await (supabase as any)
              .from("clases")
              .update({ capacidad: nuevaCapacidad, updated_at: new Date().toISOString() })
              .eq("id", claseId);
          } catch {}
        }
        return true;
      },

      anotarAlumnoCoach: async (claseId, alumnoId, forzar = false) => {
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

        const todosAlumnos = [...DEMO_ALUMNOS, ...DEMO_ALUMNOS_CLASES];
        const alumno = todosAlumnos.find((a) => a.id === alumnoId) ?? {
          id: alumnoId,
          nombre_completo: "Alumno",
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

        const contratacion = DEMO_CONTRATACIONES_CLASES.find((c) => c.alumno_id === alumnoId) ?? null;
        const plan = contratacion?.plan_membresia_id
          ? DEMO_PLANES_MEMBRESIA.find((p) => p.id === contratacion.plan_membresia_id) ?? null
          : null;

        const anotadosClaseActual = get().agendaReservas.filter((r) => r.clase_id === claseId && ocupaCupo(r)).length;
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
            .agendaReservas.filter((r) => r.alumno_id === alumnoId && ocupaCupo(r) && clasesSemanaIds.has(r.clase_id))
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
        const sinCupo =
          clase.capacidad !== null &&
          nuevaAgenda.filter((r) => r.clase_id === claseId && ocupaCupo(r)).length >= clase.capacidad
            ? [...new Set([...get().sinCupo, claseId])]
            : get().sinCupo;

        set({
          agendaReservas: nuevaAgenda,
          sinCupo,
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
        const reserva = get().agendaReservas.find((r) => r.id === reservaId);
        if (!reserva) return false;

        set({
          agendaReservas: get().agendaReservas.filter((r) => r.id !== reservaId),
          misReservas: get().misReservas.filter((r) => r.id !== reservaId),
          sinCupo: get().sinCupo.filter((id) => id !== reserva.clase_id),
          error: null,
        });
        return true;
      },

      asignarClaseFija: async (horarioId, alumnoId) => {
        if (!horarioId || !alumnoId) return false;
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
        set((state) => ({
          clasesFijas: state.clasesFijas.filter((f) => f.id !== claseFijaId),
        }));
        return true;
      },

      obtenerClasesFijasAlumno: (alumnoId) => {
        return get().clasesFijas.filter((f) => f.alumno_id === alumnoId);
      },

      limpiarMensajes: () => set({ error: null, aviso: null }),
    }),
    {
      name: "gozster-clases",
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      migrate: (persistedState: any, version: number) => {
        const state = persistedState as Partial<ClasesState>;
        // Si el estado persistido en el navegador del usuario es versión anterior a GOZS-354,
        // purgamos el snapshot viejo donde demo-clase-func-miercoles tenía capacidad: 3 y EN_ESPERA.
        if (!version || version < 2) {
          return {
            ...state,
            clases: generarDemoClasesSemana(),
            agendaReservas: generarDemoReservasIniciales(),
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
        sinCupo: s.sinCupo,
        agendaReservas: s.agendaReservas,
        actualizadoAt: s.actualizadoAt,
      }),
    },
  ),
);
