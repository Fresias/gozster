import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState()),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

vi.mock("@/store/use-chat-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-chat-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useChatStore.getState()) : mod.useChatStore.getState()),
    mod.useChatStore,
  );
  return { ...mod, useChatStore: hook };
});

vi.mock("@/store/use-clases-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-clases-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useClasesStore.getState()) : mod.useClasesStore.getState()),
    mod.useClasesStore,
  );
  return { ...mod, useClasesStore: hook };
});

vi.mock("@/store/use-offline-queue", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-offline-queue")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useOfflineQueueStore.getState()) : mod.useOfflineQueueStore.getState()),
    mod.useOfflineQueueStore,
  );
  return { ...mod, useOfflineQueueStore: hook };
});

vi.mock("@/store/use-coach-studio", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-coach-studio")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useCoachStudioStore.getState()) : mod.useCoachStudioStore.getState()),
    mod.useCoachStudioStore,
  );
  return { ...mod, useCoachStudioStore: hook };
});

import { AthleteClasses } from "@/components/athlete/athlete-classes";
import { InicioMisDias } from "@/components/athlete/inicio-mis-dias";
import { MiProgreso } from "@/components/athlete/mi-progreso";
import { ClassAgenda } from "@/components/coach/class-agenda";
import {
  agruparAsistenciasPorSemana,
  derivarAsistenciasLocal,
  obtenerClasePendienteFeedback,
  resumirSensacionesClase,
} from "@/lib/clases";
import { supabase } from "@/lib/supabase/client";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useChatStore } from "@/store/use-chat-store";
import { useClasesStore } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import type { Clase, Reserva } from "@/types/database.types";

function crearClase(over: Partial<Clase> = {}): Clase {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    horario_id: null,
    actividad: "FUNCIONAL",
    inicio: "2026-11-20T18:00:00-03:00",
    duracion_minutos: 60,
    capacidad: 12,
    estado: "PROGRAMADA",
    motivo_cancelacion: null,
    nota: null,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...over,
  };
}

function crearReserva(over: Partial<Reserva> = {}): Reserva {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    clase_id: "11111111-1111-4111-8111-111111111111",
    alumno_id: "al-1",
    estado: "ANOTADO",
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...over,
  };
}

function setSoloClasesAthlete(ahoraIso = "2026-11-20T19:00:00-03:00") {
  useAthleteStore.setState({
    planAlumno: {
      alumnos: [
        {
          id: "al-1",
          email: "ana@ejemplo.com",
          nombre_completo: "Ana Pérez",
          nombre_preferido: null,
          rol: "ALUMNO",
          estado_membresia: "ACTIVA",
          estado_cuenta: "ACTIVO",
          nivel_vista_alumno: "SIMPLE",
          profesor_asignado_id: "prof-1",
          fecha_baja: null,
          debe_cambiar_password: false,
          peso_corporal_kg: 60,
          sexo: "F",
          created_at: "2026-10-01T10:00:00Z",
          updated_at: ahoraIso,
        } as any,
      ],
      planes: [],
      dias: [],
      ejerciciosEnRutina: [],
      ejercicios: [],
    },
    cargandoPlan: false,
    errorPlan: false,
  });
  useClasesStore.setState({
    testAhora: ahoraIso,
    membresia: {
      id: "cont-1",
      alumno_id: "al-1",
      plan_membresia_id: "pm-1",
      actividad: "FUNCIONAL",
      estado: "ACTIVA",
      fecha_inicio: "2026-11-01",
      fecha_fin: "2026-11-30",
    } as any,
    plan: {
      id: "pm-1",
      nombre: "Funcional 3x",
      cantidad_actividades: 1,
      limite_semanal: 3,
    } as any,
    actividadesHabilitadas: ["FUNCIONAL"],
  });
}

describe("GOZS-665 · Clases fase 2 (racha, feedback 1 toque, historial y nota del coach)", () => {
  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
    useChatStore.getState().resetToDefaults();
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    useClasesStore.setState({
      clases: [],
      misReservas: [],
      agendaReservas: [],
      resumenClases: null,
      feedbacksPorReserva: {},
      membresia: null,
      plan: null,
      contratacionesAlumno: [],
      actividadesAlumno: [],
      actividadesHabilitadas: [],
      testAhora: null,
      error: null,
      aviso: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("1. Racha semanal por asistencia en inicio de clases", () => {
    it("GIVEN asistí 3 semanas seguidas WHEN abro el inicio THEN veo la racha de 3 semanas", () => {
      setSoloClasesAthlete("2026-11-20T12:00:00-03:00");
      useClasesStore.setState({
        resumenClases: {
          usadas_semana: 1,
          limite_semanal: 3,
          racha_semanas: 3,
          asistencias: [],
        },
      });

      const html = renderToStaticMarkup(<InicioMisDias />);
      expect(html).toContain('data-testid="inicio-clases"');
      expect(html).toContain('data-testid="inicio-clases-cabecera"');
      expect(html).toContain('data-testid="racha-semanas-chip"');
      expect(html).toContain("3 SEM");
    });

    it("calcula racha desde asistencias locales cuando resumenClases aún no está cargado", () => {
      setSoloClasesAthlete("2026-11-20T12:00:00-03:00");
      const c1 = crearClase({ id: "c-w1", inicio: "2026-11-03T18:00:00-03:00" });
      const c2 = crearClase({ id: "c-w2", inicio: "2026-11-10T18:00:00-03:00" });
      const c3 = crearClase({ id: "c-w3", inicio: "2026-11-17T18:00:00-03:00" });
      useClasesStore.setState({
        clases: [c1, c2, c3],
        misReservas: [
          crearReserva({ id: "r-w1", clase_id: "c-w1" }),
          crearReserva({ id: "r-w2", clase_id: "c-w2" }),
          crearReserva({ id: "r-w3", clase_id: "c-w3" }),
        ],
      });

      const html = renderToStaticMarkup(<InicioMisDias />);
      expect(html).toContain('data-testid="racha-semanas-chip"');
      expect(html).toContain("3 SEM");
    });
  });

  describe("2. Feedback post-clase '¿Cómo te fue?' (1 toque, 48h, offline-tolerante)", () => {
    it("GIVEN mi clase de Funcional terminó hace 1 h WHEN abro el inicio THEN veo '¿Cómo te fue?' y al tocar 'Dura' se guarda y desaparece", async () => {
      setSoloClasesAthlete("2026-11-20T20:00:00-03:00");
      const clase = crearClase({
        id: "11111111-1111-4111-8111-111111111111",
        actividad: "FUNCIONAL",
        inicio: "2026-11-20T18:00:00-03:00",
      });
      const reserva = crearReserva({
        id: "22222222-2222-4222-8222-222222222222",
        clase_id: clase.id,
      });

      useClasesStore.setState({
        clases: [clase],
        misReservas: [reserva],
        resumenClases: {
          usadas_semana: 1,
          limite_semanal: 3,
          racha_semanas: 1,
          asistencias: [
            {
              reserva_id: reserva.id,
              clase_id: clase.id,
              actividad: "FUNCIONAL",
              inicio: clase.inicio,
              sensacion: null,
              nota: null,
            },
          ],
        },
      });

      const htmlAntes = renderToStaticMarkup(<InicioMisDias />);
      expect(htmlAntes).toContain('data-testid="feedback-post-clase-card"');
      expect(htmlAntes).toContain("¿Cómo te fue?");
      expect(htmlAntes).toContain("Fácil");
      expect(htmlAntes).toContain("Bien");
      expect(htmlAntes).toContain("Dura");
      expect(htmlAntes).toContain("Durísima");

      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: "al-1" } as any },
        error: null,
      });
      const upsertSpy = vi.fn(() => ({
        select: () => ({
          single: async () => ({
            data: {
              id: "fb-1",
              reserva_id: reserva.id,
              sensacion: 3,
              created_at: "2026-11-20T20:00:00-03:00",
              updated_at: "2026-11-20T20:00:00-03:00",
            },
            error: null,
          }),
        }),
      }));
      vi.spyOn(supabase, "from").mockImplementation((tabla: string) => {
        if (tabla === "feedback_clase") return { upsert: upsertSpy } as any;
        return {} as any;
      });

      const res = await useClasesStore.getState().responderFeedbackClase(reserva.id, 3);
      expect(res.ok).toBe(true);
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(useClasesStore.getState().feedbacksPorReserva[reserva.id]).toBe(3);

      const htmlDespues = renderToStaticMarkup(<InicioMisDias />);
      expect(htmlDespues).not.toContain('data-testid="feedback-post-clase-card"');
    });

    it("GIVEN pasaron más de 48 h o ya respondí WHEN abro el inicio THEN no aparece la tarjeta", () => {
      setSoloClasesAthlete("2026-11-23T12:00:00-03:00");
      useClasesStore.setState({
        resumenClases: {
          usadas_semana: 0,
          limite_semanal: 3,
          racha_semanas: 1,
          asistencias: [
            {
              reserva_id: "res-vieja",
              clase_id: "c-vieja",
              actividad: "FUNCIONAL",
              inicio: "2026-11-20T18:00:00-03:00", // > 48 h
              sensacion: null,
              nota: null,
            },
          ],
        },
      });

      const htmlMas48 = renderToStaticMarkup(<InicioMisDias />);
      expect(htmlMas48).not.toContain('data-testid="feedback-post-clase-card"');

      const pendiente = obtenerClasePendienteFeedback(
        [
          {
            reserva_id: "res-1",
            clase_id: "c-1",
            actividad: "BOXEO",
            inicio: "2026-11-23T10:00:00-03:00",
            sensacion: 2,
            nota: null,
          },
        ],
        new Date("2026-11-23T12:00:00-03:00"),
      );
      expect(pendiente).toBeNull();
    });

    it("offline-tolerante: sin conexión encola FEEDBACK_CLASE, oculta tarjeta y flushQueue sincroniza al volver señal", async () => {
      setSoloClasesAthlete("2026-11-20T20:00:00-03:00");
      useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [] });
      const reservaId = "22222222-2222-4222-8222-222222222222";
      useClasesStore.setState({
        resumenClases: {
          usadas_semana: 1,
          limite_semanal: 3,
          racha_semanas: 1,
          asistencias: [
            {
              reserva_id: reservaId,
              clase_id: "11111111-1111-4111-8111-111111111111",
              actividad: "FUNCIONAL",
              inicio: "2026-11-20T18:00:00-03:00",
              sensacion: null,
              nota: null,
            },
          ],
        },
      });

      const res = await useClasesStore.getState().responderFeedbackClase(reservaId, 4);
      expect(res).toEqual({ ok: true, queued: true });
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(1);
      expect(useOfflineQueueStore.getState().pendingEvents[0]?.action).toBe("FEEDBACK_CLASE");

      const html = renderToStaticMarkup(<InicioMisDias />);
      expect(html).not.toContain('data-testid="feedback-post-clase-card"');

      const upsertSpy = vi.fn(async () => ({ error: null }));
      vi.spyOn(supabase, "from").mockImplementation((tabla: string) => {
        if (tabla === "feedback_clase") return { upsert: upsertSpy } as any;
        return {} as any;
      });

      await useOfflineQueueStore.getState().flushQueue();
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    });

    it("error permanente RLS (42501) revierte estado optimista, no encola y devuelve ok:false", async () => {
      const reservaId = "22222222-2222-4222-8222-222222222222";
      useClasesStore.setState({
        resumenClases: {
          usadas_semana: 1,
          limite_semanal: 3,
          racha_semanas: 1,
          asistencias: [
            {
              reserva_id: reservaId,
              clase_id: "11111111-1111-4111-8111-111111111111",
              actividad: "FUNCIONAL",
              inicio: "2026-11-10T18:00:00-03:00",
              sensacion: null,
              nota: null,
            },
          ],
        },
      });
      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: "al-1" } as any },
        error: null,
      });
      vi.spyOn(supabase, "from").mockImplementation((tabla: string) => {
        if (tabla === "feedback_clase") {
          return {
            upsert: () => ({
              select: () => ({
                single: async () => ({ data: null, error: { code: "42501", message: "forbidden" } }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const res = await useClasesStore.getState().responderFeedbackClase(reservaId, 2);
      expect(res.ok).toBe(false);
      expect(useClasesStore.getState().feedbacksPorReserva[reservaId]).toBeUndefined();
      expect(useClasesStore.getState().resumenClases?.asistencias[0]?.sensacion).toBeNull();
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    });
  });

  describe("3. Historial de asistencias en Progreso (mi-progreso.tsx)", () => {
    it("GIVEN tengo asistencias WHEN entro a Progreso THEN veo mi historial por semana con actividad, fecha, sensación y nota opcional", () => {
      const html = renderToStaticMarkup(
        <MiProgreso
          estado="listo"
          vista="SIMPLE"
          data={{ sesiones_mes: 0, sesiones_mes_anterior: 0, volumen_mes_kg: 0, ejercicios: [] }}
          asistenciasClases={[
            {
              reserva_id: "r1",
              clase_id: "c1",
              actividad: "FUNCIONAL",
              inicio: "2026-11-20T18:00:00-03:00",
              sensacion: 3,
              nota: "Hoy: circuito de piernas",
            },
            {
              reserva_id: "r2",
              clase_id: "c2",
              actividad: "BOXEO",
              inicio: "2026-11-12T19:30:00-03:00",
              sensacion: 2,
              nota: null,
            },
          ]}
        />,
      );

      expect(html).toContain('data-testid="historial-clases-section"');
      expect(html).toContain("Historial de clases");
      expect(html).toContain("Funcional");
      expect(html).toContain("18:00 hs");
      expect(html).toContain("Dura");
      expect(html).toContain("Hoy: circuito de piernas");
      expect(html).toContain("Boxeo");
      expect(html).toContain("Bien");
      expect(html).not.toContain("1RM");
      expect(html.toLowerCase()).not.toContain("volumen");
      expect(html).not.toContain("RPE");
    });

    it("muestra estado vacío amable cuando no hay asistencias", () => {
      const html = renderToStaticMarkup(
        <MiProgreso
          estado="listo"
          vista="SIMPLE"
          data={{ sesiones_mes: 0, sesiones_mes_anterior: 0, volumen_mes_kg: 0, ejercicios: [] }}
          asistenciasClases={[]}
        />,
      );

      expect(html).toContain('data-testid="historial-clases-vacio"');
      expect(html).toContain("Todavía no registraste asistencias");
      expect(html).toContain('href="/athlete/clases"');
    });

    it("agruparAsistenciasPorSemana ordena semanas más recientes primero", () => {
      const grupos = agruparAsistenciasPorSemana(
        [
          {
            reserva_id: "r-old",
            clase_id: "c-old",
            actividad: "BOXEO",
            inicio: "2026-11-11T19:30:00-03:00",
            sensacion: 1,
            nota: null,
          },
          {
            reserva_id: "r-now",
            clase_id: "c-now",
            actividad: "FUNCIONAL",
            inicio: "2026-11-20T18:00:00-03:00",
            sensacion: 3,
            nota: null,
          },
        ],
        new Date("2026-11-21T12:00:00-03:00"),
      );
      expect(grupos).toHaveLength(2);
      expect(grupos[0]?.etiquetaSemana).toBe("Esta semana");
      expect(grupos[1]?.etiquetaSemana).toBe("Semana pasada");
    });
  });

  describe("4 y 5. Nota de la clase (Athlete + Coach) y resumen de sensaciones en Coach Studio", () => {
    it("GIVEN el coach escribió 'Hoy: circuito de piernas' WHEN veo mi clase reservada THEN leo la nota; GIVEN no escribió nada THEN no aparece nada", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-11-20T12:00:00-03:00"));
      setSoloClasesAthlete("2026-11-20T12:00:00-03:00");
      const claseConNota = crearClase({
        id: "clase-nota-1",
        inicio: "2026-11-20T18:00:00-03:00",
        nota: "Hoy: circuito de piernas",
      });
      const reserva = crearReserva({ id: "res-nota-1", clase_id: claseConNota.id });

      useClasesStore.setState({ clases: [claseConNota], misReservas: [reserva] });
      const htmlInicioConNota = renderToStaticMarkup(<InicioMisDias />);
      expect(htmlInicioConNota).toContain('data-testid="clase-reservada-nota"');
      expect(htmlInicioConNota).toContain("Hoy: circuito de piernas");

      const htmlClasesConNota = renderToStaticMarkup(<AthleteClasses />);
      expect(htmlClasesConNota).toContain('data-testid="clase-reservada-nota"');
      expect(htmlClasesConNota).toContain("Hoy: circuito de piernas");

      useClasesStore.setState({
        clases: [{ ...claseConNota, nota: null }],
      });
      const htmlInicioSinNota = renderToStaticMarkup(<InicioMisDias />);
      expect(htmlInicioSinNota).not.toContain('data-testid="clase-reservada-nota"');

      const htmlClasesSinNota = renderToStaticMarkup(<AthleteClasses />);
      expect(htmlClasesSinNota).not.toContain('data-testid="clase-reservada-nota"');
    });

    it("Coach: campo opcional de nota (≤280, sin bloqueos) + resumen de 5 sensaciones en ClassAgenda", async () => {
      const clase = crearClase({
        id: "11111111-1111-4111-8111-111111111111",
        inicio: "2026-11-20T18:00:00-03:00",
        nota: "Traer soga",
      });
      const reservas = [
        { ...crearReserva({ id: "r1", clase_id: clase.id, alumno_id: "a1", estado: "ANOTADO" }), alumno_nombre: "Ana" },
        { ...crearReserva({ id: "r2", clase_id: clase.id, alumno_id: "a2", estado: "ANOTADO" }), alumno_nombre: "Beto" },
        { ...crearReserva({ id: "r3", clase_id: clase.id, alumno_id: "a3", estado: "ANOTADO" }), alumno_nombre: "Carla" },
        { ...crearReserva({ id: "r4", clase_id: clase.id, alumno_id: "a4", estado: "ANOTADO" }), alumno_nombre: "Dani" },
        { ...crearReserva({ id: "r5", clase_id: clase.id, alumno_id: "a5", estado: "ANOTADO" }), alumno_nombre: "Eli" },
        { ...crearReserva({ id: "r6", clase_id: clase.id, alumno_id: "a6", estado: "AUSENTE" }), alumno_nombre: "Fede" },
      ];

      useClasesStore.setState({
        clases: [clase],
        agendaReservas: reservas,
        feedbacksPorReserva: {
          r1: 1,
          r2: 2,
          r3: 3,
          r4: 3,
          r5: 4,
          r6: 1, // AUSENTE no cuenta en resumen de presentes
        },
      });

      const resumen = resumirSensacionesClase(reservas, useClasesStore.getState().feedbacksPorReserva);
      expect(resumen).toEqual({ total: 5, conteo: { 1: 1, 2: 1, 3: 2, 4: 1 } });

      const html = renderToStaticMarkup(
        <ClassAgenda
          clases={[clase]}
          testAhora="2026-11-20T19:00:00-03:00"
          initialClaseId={clase.id}
        />,
      );

      expect(html).toContain('data-testid="class-detail-note-section"');
      expect(html).toContain('data-testid="class-note-input"');
      expect(html).toContain("Traer soga");
      expect(html).toContain('data-testid="class-feedback-summary"');
      expect(html).toContain("Sensaciones (5):");
      expect(html).toContain("Fácil: 1");
      expect(html).toContain("Bien: 1");
      expect(html).toContain("Dura: 2");
      expect(html).toContain("Durísima: 1");
      expect(html).toContain('data-testid="student-feedback-badge"');

      // Verificar guardado opcional de nota (incluyendo nota vacía -> null)
      const okVacia = await useClasesStore.getState().guardarNotaClase(clase.id, "   ");
      expect(okVacia).toBe(true);
      expect(useClasesStore.getState().clases[0]?.nota).toBeNull();

      const okLarga = await useClasesStore.getState().guardarNotaClase(clase.id, "x".repeat(281));
      expect(okLarga).toBe(false);
    });

    it("derivarAsistenciasLocal solo incluye reservas ANOTADO en clases PROGRAMADA ya iniciadas", () => {
      const pasada = crearClase({ id: "c-pasada", inicio: "2026-11-20T18:00:00-03:00" });
      const futura = crearClase({ id: "c-futura", inicio: "2026-11-20T21:00:00-03:00" });
      const cancelada = crearClase({ id: "c-canc", inicio: "2026-11-20T17:00:00-03:00", estado: "CANCELADA" });

      const items = derivarAsistenciasLocal(
        [
          crearReserva({ id: "r-ok", clase_id: "c-pasada", estado: "ANOTADO" }),
          crearReserva({ id: "r-aus", clase_id: "c-pasada", estado: "AUSENTE" }),
          crearReserva({ id: "r-fut", clase_id: "c-futura", estado: "ANOTADO" }),
          crearReserva({ id: "r-can", clase_id: "c-canc", estado: "ANOTADO" }),
        ],
        [pasada, futura, cancelada],
        { "r-ok": 2 },
        new Date("2026-11-20T19:30:00-03:00"),
      );
      expect(items).toHaveLength(1);
      expect(items[0]?.reserva_id).toBe("r-ok");
      expect(items[0]?.sensacion).toBe(2);
    });
  });
});
