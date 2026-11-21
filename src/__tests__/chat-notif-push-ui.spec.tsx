import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/athlete",
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

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

vi.mock("@/store/use-offline-queue", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-offline-queue")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useOfflineQueueStore.getState()) : mod.useOfflineQueueStore.getState()),
    mod.useOfflineQueueStore,
  );
  return { ...mod, useOfflineQueueStore: hook };
});

vi.mock("@/store/use-clases-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-clases-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useClasesStore.getState()) : mod.useClasesStore.getState()),
    mod.useClasesStore,
  );
  return { ...mod, useClasesStore: hook };
});

import { InicioMisDias } from "@/components/athlete/inicio-mis-dias";
import { RutinaDelDia } from "@/components/athlete/rutina-del-dia";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { AthleteChat } from "@/components/athlete/athlete-chat";
import { ChatFab } from "@/components/coach/chat-fab";
import { ClassAgenda } from "@/components/coach/class-agenda";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";
import {
  DEFAULT_ATHLETE_SENDER,
  STAFF_COACH_PRINCIPAL,
  useChatStore,
} from "@/store/use-chat-store";
import { useClasesStore, type ReservaAgenda } from "@/store/use-clases-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { supabase } from "@/lib/supabase/client";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import type { Clase, Perfil } from "@/types/database.types";

const REAL_ALUMNO_ID = "11111111-1111-4111-8111-111111111199";
const REAL_COACH_ID = "22222222-2222-4222-8222-222222222299";
const REAL_CONV_ID = "33333333-3333-4333-8333-333333333399";

const PLAN_REAL: LiveSupabaseDataset = {
  alumnos: [
    {
      id: REAL_ALUMNO_ID,
      email: "camila@gozster.fit",
      nombre_completo: "Camila Vega",
      nombre_preferido: "Cami",
      rol: "ALUMNO",
      estado_membresia: "ACTIVA",
      estado_cuenta: "ACTIVO",
      nivel_vista_alumno: "SIMPLE",
      profesor_asignado_id: REAL_COACH_ID,
      fecha_baja: null,
      debe_cambiar_password: false,
      peso_corporal_kg: 60,
      sexo: "F",
      created_at: "2026-11-01T10:00:00Z",
      updated_at: new Date().toISOString(),
    } as any,
  ],
  planes: [
    {
      id: "plan-real-1",
      profesor_id: REAL_COACH_ID,
      alumno_id: REAL_ALUMNO_ID,
      nombre: "FUERZA BASE",
      estado: "ACTIVO",
      tipo: "DE_ALUMNO",
      comentarios: null,
      fecha_inicio: "2026-11-01",
      fecha_fin: null,
      created_at: "2026-11-01T10:00:00Z",
      updated_at: "2026-11-01T10:00:00Z",
    } as any,
  ],
  dias: [
    { id: "dia-real-1", plan_id: "plan-real-1", orden: 1, nombre: "DÍA 1", created_at: "", updated_at: "" } as any,
  ],
  ejerciciosEnRutina: [
    { id: "er-real-1", dia_id: "dia-real-1", ejercicio_id: "ej-1", orden: 1, series: 3, repeticiones: "8", descanso_segundos: 90, es_superserie: false } as any,
  ],
  ejercicios: [
    { id: "ej-1", nombre: "Sentadilla", musculos_principales: ["Piernas"] } as any,
  ],
};

const SESION_REAL: LiveWorkoutSession = {
  id: "44444444-4444-4444-8444-444444444499",
  nombre_rutina: "Camila Vega: DÍA 1",
  fecha: "2026-11-20",
  studentId: REAL_ALUMNO_ID,
  studentName: "Camila Vega",
  dia_id: "dia-real-1",
  molestias: [],
  ejercicios: [
    {
      id: "er-real-1",
      ejercicio_id: "ej-1",
      nombre: "Sentadilla",
      musculos_principales: ["Piernas"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "8",
      series: [
        { numero_serie: 1, peso_kg: 60, reps_hechas: 8, rpe_real: 8, completada: false, estimated1RM: 76 },
      ],
    },
  ],
};

describe("GOZS-627: Chat real sin mocks, toggle Push en inicio, Visto unidireccional y Cancelación con aviso + WhatsApp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useChatStore.getState().resetToDefaults();
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.setState({
      onboardingCompletado: true,
      diaActivoId: null,
      ejercicioAbiertoId: null,
      cierreAbierto: false,
      cuestionarioAbierto: false,
      planAlumno: PLAN_REAL,
      currentSession: structuredClone(SESION_REAL),
      sesionesCompletadas: [],
    });
  });

  describe("1. Eliminación de INITIAL_CONVERSATIONS y ausencia de fallback a DEFAULT_ATHLETE_SENDER", () => {
    it("use-chat-store inicia vacío sin INITIAL_CONVERSATIONS y los selectores sin alumnoId devuelven 0/null", () => {
      const storeSource = fs.readFileSync(
        path.resolve(__dirname, "../store/use-chat-store.ts"),
        "utf-8",
      );
      expect(storeSource).not.toContain("INITIAL_CONVERSATIONS");
      expect(Object.keys(useChatStore.getState().conversations)).toHaveLength(0);
      expect(useChatStore.getState().getUnreadStaffCount()).toBe(0);
      expect(useChatStore.getState().getLatestUnreadStaffMessage()).toBeNull();
      expect(useChatStore.getState().getLatestUnreadPushStaffMessage()).toBeNull();
    });

    it("componentes de producción no caen por defecto en DEFAULT_ATHLETE_SENDER", () => {
      const files = [
        "../components/athlete/inicio-mis-dias.tsx",
        "../components/athlete/athlete-shell.tsx",
        "../components/athlete/use-live-workout.ts",
        "../components/athlete/athlete-chat.tsx",
      ];
      for (const rel of files) {
        const src = fs.readFileSync(path.resolve(__dirname, rel), "utf-8");
        expect(src).not.toContain("DEFAULT_ATHLETE_SENDER");
      }
    });

    it("GIVEN un alumno autenticado sin mensajes reales WHEN abre /athlete THEN no ve tarjeta mock ni contador falso aunque haya mensajes en DEFAULT_ATHLETE_SENDER", () => {
      useChatStore.getState().sendMessage({
        alumnoId: DEFAULT_ATHLETE_SENDER.id,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Mensaje para otro usuario",
        requiereLecturaInicio: true,
      });

      const htmlInicio = renderToStaticMarkup(<InicioMisDias />);
      const htmlShell = renderToStaticMarkup(
        <AthleteShell>
          <div />
        </AthleteShell>,
      );

      expect(htmlInicio).not.toContain('data-testid="unread-coach-message-banner"');
      expect(htmlShell).not.toContain('data-testid="unread-chat-badge"');
    });
  });

  describe("2. Notificación normal (solo globito) vs. Pusheada (globito + tarjeta inicio con cierre al leer)", () => {
    it("GIVEN mensaje normal (requiere_lectura_inicio = false) WHEN el alumno abre /athlete THEN ve globito pero NO la tarjeta de inicio ni en RutinaDelDia", () => {
      useChatStore.getState().sendMessage({
        alumnoId: REAL_ALUMNO_ID,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Hola Cami, ¿cómo sentiste la espalda hoy?",
        requiereLecturaInicio: false,
      });

      expect(useChatStore.getState().getUnreadStaffCount(REAL_ALUMNO_ID)).toBe(1);
      expect(useChatStore.getState().getLatestUnreadPushStaffMessage(REAL_ALUMNO_ID)).toBeNull();

      const htmlShell = renderToStaticMarkup(
        <AthleteShell>
          <div />
        </AthleteShell>,
      );
      const htmlInicio = renderToStaticMarkup(<InicioMisDias />);
      const htmlRutina = renderToStaticMarkup(<RutinaDelDia />);

      expect(htmlShell).toContain('data-testid="unread-chat-badge"');
      expect(htmlInicio).not.toContain('data-testid="unread-coach-message-banner"');
      expect(htmlRutina).not.toContain('data-testid="unread-coach-message-banner"');
    });

    it("GIVEN mensaje pusheado (requiere_lectura_inicio = true) WHEN el alumno abre /athlete THEN ve globito y tarjeta en InicioMisDias (encima de InstalarAppCard) y RutinaDelDia; al leer desaparece", () => {
      useChatStore.getState().sendMessage({
        alumnoId: REAL_ALUMNO_ID,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Importante: hoy hacemos test de 1RM en sentadilla.",
        requiereLecturaInicio: true,
      });

      const inicioSource = fs.readFileSync(
        path.resolve(__dirname, "../components/athlete/inicio-mis-dias.tsx"),
        "utf-8",
      );
      expect(inicioSource.indexOf("{bannerMensajeNoLeido}")).toBeLessThan(
        inicioSource.indexOf("<InstalarAppCard />"),
      );

      const htmlShell = renderToStaticMarkup(
        <AthleteShell>
          <div />
        </AthleteShell>,
      );
      const htmlInicio = renderToStaticMarkup(<InicioMisDias />);
      const htmlRutina = renderToStaticMarkup(<RutinaDelDia />);

      expect(htmlShell).toContain('data-testid="unread-chat-badge"');
      expect(htmlInicio).toContain('data-testid="unread-coach-message-banner"');
      expect(htmlInicio).toContain("Importante: hoy hacemos test de 1RM en sentadilla.");
      expect(htmlRutina).toContain('data-testid="unread-coach-message-banner"');

      // Al entrar y leer la conversación, la tarjeta desaparece automáticamente (sin botón Entendido)
      expect(htmlInicio).not.toContain("Entendido");
      useChatStore.getState().markAsRead(REAL_ALUMNO_ID, "ALUMNO");

      expect(useChatStore.getState().getUnreadStaffCount(REAL_ALUMNO_ID)).toBe(0);
      expect(useChatStore.getState().getLatestUnreadPushStaffMessage(REAL_ALUMNO_ID)).toBeNull();

      const htmlInicioDespues = renderToStaticMarkup(<InicioMisDias />);
      expect(htmlInicioDespues).not.toContain('data-testid="unread-coach-message-banner"');
    });
  });

  describe("3. Coach Studio: Toggle 'Pushear aviso al inicio' y Visto unidireccional (✓ / ✓✓)", () => {
    const alumnoPerfil: Perfil = PLAN_REAL.alumnos[0]!;

    it("ChatFab renderiza el toggle 'Pushear aviso al inicio' apagado por defecto y visto ✓ / ✓✓ solo en mensajes del staff", () => {
      const msgNoLeido = useChatStore.getState().sendMessage({
        alumnoId: REAL_ALUMNO_ID,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Mensaje enviado sin leer",
        requiereLecturaInicio: true,
      });

      const htmlAntes = renderToStaticMarkup(
        <ChatFab alumno={alumnoPerfil} isOpen={true} onToggle={vi.fn()} />,
      );

      expect(htmlAntes).toContain('data-testid="coach-chat-push-checkbox"');
      expect(htmlAntes).toContain("Pushear aviso al inicio");
      expect(htmlAntes).toContain(`data-testid="msg-read-receipt-${msgNoLeido.id}"`);
      expect(htmlAntes).toContain('aria-label="Enviado"');
      expect(htmlAntes).toContain(">✓<");
      expect(htmlAntes).toContain("Aviso inicio");

      // El coach abre el chat (readerRole = "STAFF"): NO debe marcar como leídos sus propios mensajes
      useChatStore.getState().markAsRead(REAL_ALUMNO_ID, "STAFF");
      const msgTrasCoachAbrir = useChatStore
        .getState()
        .getConversation(REAL_ALUMNO_ID)
        .mensajes.find((m) => m.id === msgNoLeido.id);
      expect(msgTrasCoachAbrir?.leido).toBe(false);

      // Cuando el alumno lee el mensaje, Coach Studio muestra ✓✓
      useChatStore.getState().markAsRead(REAL_ALUMNO_ID, "ALUMNO");
      const htmlDespues = renderToStaticMarkup(
        <ChatFab alumno={alumnoPerfil} isOpen={true} onToggle={vi.fn()} />,
      );
      expect(htmlDespues).toContain('aria-label="Leído por el alumno"');
      expect(htmlDespues).toContain(">✓✓<");
    });

    it("AthleteChat nunca muestra indicadores de lectura/visto sobre los mensajes del alumno", () => {
      const msgAlumno = useChatStore.getState().sendMessage({
        alumnoId: REAL_ALUMNO_ID,
        remitente: {
          id: REAL_ALUMNO_ID,
          nombre: "Camila Vega",
          rol: "ALUMNO",
          esStaff: false,
        },
        contenido: "Profe, ¿puedo cambiar la prensa por búlgaras?",
      });

      useChatStore.getState().markAsRead(REAL_ALUMNO_ID, "STAFF");
      useChatStore.getState().setAthleteChatOpen(true);

      const html = renderToStaticMarkup(
        <AthleteChat athleteId={REAL_ALUMNO_ID} athleteName="Camila Vega" />,
      );

      expect(html).toContain(`data-testid="athlete-own-bubble-${msgAlumno.id}"`);
      expect(html).not.toContain("✓✓");
      expect(html).not.toContain("Leído por");
      expect(html).not.toContain("Visto");
    });
  });

  describe("4. Persistencia Supabase, syncWithSupabase, marcar_mensajes_leidos y Realtime", () => {
    it("sendMessage asegura conversación real vía RPC obtener_o_crear_conversacion e inserta requiere_lectura_inicio", async () => {
      const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: REAL_CONV_ID,
        error: null,
      } as any);

      const insertSpy = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "55555555-5555-4555-8555-555555555599",
              conversacion_id: REAL_CONV_ID,
              remitente_id: STAFF_COACH_PRINCIPAL.id,
              contenido: "Aviso real",
              leido: false,
              requiere_lectura_inicio: true,
              created_at: new Date().toISOString(),
            },
            error: null,
          }),
        }),
      });
      vi.spyOn(supabase, "from").mockReturnValue({ insert: insertSpy } as any);
      vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
        data: { user: { id: REAL_COACH_ID } as any },
        error: null,
      });

      useChatStore.getState().sendMessage({
        alumnoId: REAL_ALUMNO_ID,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Aviso real",
        requiereLecturaInicio: true,
      });

      await new Promise((r) => setTimeout(r, 20));

      expect(rpcSpy).toHaveBeenCalledWith("obtener_o_crear_conversacion", {
        p_alumno_id: REAL_ALUMNO_ID,
      });
      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          conversacion_id: REAL_CONV_ID,
          remitente_id: REAL_COACH_ID,
          contenido: "Aviso real",
          leido: false,
          requiere_lectura_inicio: true,
        }),
      );
    });

    it("syncWithSupabase mapea requiere_lectura_inicio y distingue staff real por remitente_id !== alumno_id", async () => {
      vi.spyOn(supabase, "from").mockReturnValueOnce({
        select: vi.fn().mockReturnValueOnce({
          eq: vi.fn().mockResolvedValueOnce({
            data: [
              {
                id: REAL_CONV_ID,
                alumno_id: REAL_ALUMNO_ID,
                responsable_id: REAL_COACH_ID,
                estado: "ABIERTA",
                created_at: "2026-11-20T10:00:00Z",
                updated_at: "2026-11-20T10:05:00Z",
                mensajes: [
                  {
                    id: "66666666-6666-4666-8666-666666666601",
                    conversacion_id: REAL_CONV_ID,
                    remitente_id: REAL_COACH_ID,
                    contenido: "Recordatorio importante",
                    leido: false,
                    requiere_lectura_inicio: true,
                    created_at: "2026-11-20T10:05:00Z",
                  },
                ],
              },
            ],
            error: null,
          }),
        }),
      } as any);

      await useChatStore.getState().syncWithSupabase(REAL_ALUMNO_ID);

      const pushed = useChatStore.getState().getLatestUnreadPushStaffMessage(REAL_ALUMNO_ID);
      expect(pushed).not.toBeNull();
      expect(pushed?.es_staff).toBe(true);
      expect(pushed?.requiere_lectura_inicio).toBe(true);
    });

    it("markAsRead invoca RPC marcar_mensajes_leidos cuando la conversación tiene UUID válido y actualiza Realtime UPDATE", () => {
      const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: 1, error: null } as any);
      const msgUuid = "77777777-7777-4777-8777-777777777701";

      useChatStore.setState({
        conversations: {
          [REAL_ALUMNO_ID]: {
            id: REAL_CONV_ID,
            alumno_id: REAL_ALUMNO_ID,
            alumno_nombre: "Camila Vega",
            created_at: "2026-11-20T10:00:00Z",
            updated_at: "2026-11-20T10:00:00Z",
            unreadCount: 0,
            mensajes: [
              {
                id: msgUuid,
                conversacion_id: REAL_CONV_ID,
                remitente_id: REAL_COACH_ID,
                remitente_nombre: "Coach",
                remitente_rol: "ENTRENADOR",
                contenido: "Leeme",
                leido: false,
                requiere_lectura_inicio: true,
                created_at: "2026-11-20T10:00:00Z",
                hora: "10:00",
                es_staff: true,
                estado_envio: "enviado",
              },
            ],
          },
        },
      });

      useChatStore.getState().markAsRead(REAL_ALUMNO_ID, "ALUMNO");

      expect(rpcSpy).toHaveBeenCalledWith("marcar_mensajes_leidos", {
        p_conversacion_id: REAL_CONV_ID,
      });
    });

    it("subscribeToRealtime escucha INSERT y UPDATE en public.mensajes y limpia el canal al desmontar", () => {
      const handlers: Record<string, (payload: any) => void> = {};
      const mockChannel = {
        on: vi.fn((_type: string, filter: { event: string }, cb: (payload: any) => void) => {
          handlers[filter.event] = cb;
          return mockChannel;
        }),
        subscribe: vi.fn(() => mockChannel),
      };
      const channelSpy = vi.spyOn(supabase, "channel").mockReturnValue(mockChannel as any);
      const removeSpy = vi.spyOn(supabase, "removeChannel").mockResolvedValue("ok" as any);

      useChatStore.setState({
        conversations: {
          [REAL_ALUMNO_ID]: {
            id: REAL_CONV_ID,
            alumno_id: REAL_ALUMNO_ID,
            alumno_nombre: "Camila Vega",
            created_at: "2026-11-20T10:00:00Z",
            updated_at: "2026-11-20T10:00:00Z",
            unreadCount: 0,
            mensajes: [],
          },
        },
      });

      const unsubscribe = useChatStore.getState().subscribeToRealtime(REAL_ALUMNO_ID);
      expect(channelSpy).toHaveBeenCalledWith(`chat-mensajes-${REAL_ALUMNO_ID}`);

      const rtMsgId = "88888888-8888-4888-8888-888888888801";
      handlers.INSERT?.({
        new: {
          id: rtMsgId,
          conversacion_id: REAL_CONV_ID,
          remitente_id: REAL_COACH_ID,
          contenido: "Mensaje en tiempo real",
          leido: false,
          requiere_lectura_inicio: true,
          created_at: "2026-11-20T11:00:00Z",
        },
      });

      expect(useChatStore.getState().getLatestUnreadPushStaffMessage(REAL_ALUMNO_ID)?.id).toBe(rtMsgId);

      handlers.UPDATE?.({
        new: {
          id: rtMsgId,
          conversacion_id: REAL_CONV_ID,
          leido: true,
          requiere_lectura_inicio: true,
        },
      });

      const updatedMsg = useChatStore
        .getState()
        .getConversation(REAL_ALUMNO_ID)
        .mensajes.find((m) => m.id === rtMsgId);
      expect(updatedMsg?.leido).toBe(true);

      unsubscribe();
      expect(removeSpy).toHaveBeenCalledWith(mockChannel);
    });
  });

  describe("5. Cancelación de clase con checkbox Push en inicio + WhatsApp ($0/mes) + Copiar aviso", () => {
    const FECHA_REF = new Date("2026-11-20T12:00:00-03:00");

    beforeEach(() => {
      useClasesStore.getState().resetDemoDataset(FECHA_REF);
    });

    it("diálogo de cancelación con inscriptos incluye checkbox 'Pushear aviso al inicio de la app' tildado por defecto", () => {
      const store = useClasesStore.getState();
      const claseConInscriptos = store.clases.find(
        (c) =>
          c.estado === "PROGRAMADA" &&
          store.agendaReservas.some((r) => r.clase_id === c.id && r.estado === "ANOTADO"),
      )!;

      const html = renderToStaticMarkup(
        <ClassAgenda
          initialSheetOpen={true}
          initialClaseId={claseConInscriptos.id}
          initialCancelDialogOpen={true}
          testAhora={FECHA_REF}
        />,
      );

      expect(html).toContain('data-testid="cancel-push-home-checkbox"');
      expect(html).toContain("Pushear aviso al inicio de la app");
      expect(html).toMatch(/<input[^>]*data-testid="cancel-push-home-checkbox"[^>]*checked=""/);
    });

    it("cancelarClase propaga pushearInicio a los mensajes de inscriptos e invoca RPC cancelar_clase_con_aviso en UUIDs", async () => {
      const claseUuid = "99999999-9999-4999-8999-999999999901";
      const claseMock: Clase = {
        id: claseUuid,
        horario_id: null,
        actividad: "FUNCIONAL",
        inicio: "2026-11-20T19:00:00-03:00",
        duracion_minutos: 60,
        capacidad: 10,
        estado: "PROGRAMADA",
        motivo_cancelacion: null,
        created_at: FECHA_REF.toISOString(),
        updated_at: FECHA_REF.toISOString(),
      };
      const reservaMock: ReservaAgenda = {
        id: "res-cancel-1",
        clase_id: claseUuid,
        alumno_id: "demo-alumno-valentina",
        alumno_nombre: "Valentina Ríos",
        estado: "ANOTADO",
        created_at: FECHA_REF.toISOString(),
        updated_at: FECHA_REF.toISOString(),
      };

      useClasesStore.setState({
        clases: [claseMock],
        agendaReservas: [reservaMock],
      });

      const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: null,
        error: new Error("local demo fallback"),
      } as any);

      const ok = await useClasesStore.getState().cancelarClase(claseUuid, "Corte de luz", false);
      expect(ok).toBe(true);
      expect(rpcSpy).toHaveBeenCalledWith("cancelar_clase_con_aviso", {
        p_clase_id: claseUuid,
        p_motivo: "Corte de luz",
        p_pushear_inicio: false,
      });

      const conv = useChatStore.getState().getConversation("demo-alumno-valentina");
      const msg = conv.mensajes[conv.mensajes.length - 1];
      expect(msg?.requiere_lectura_inicio).toBe(false);
      expect(msg?.contenido).toContain("Corte de luz");
    });

    it("al mostrar una clase cancelada con afectados, renderiza botones individuales de WhatsApp (wa.me) y 'Copiar aviso'", async () => {
      const store = useClasesStore.getState();
      const claseConInscriptos = store.clases.find(
        (c) =>
          c.estado === "PROGRAMADA" &&
          store.agendaReservas.some((r) => r.clase_id === c.id && r.estado === "ANOTADO"),
      )!;
      const inscriptos = store.agendaReservas.filter(
        (r) => r.clase_id === claseConInscriptos.id && r.estado === "ANOTADO",
      );
      expect(inscriptos.length).toBeGreaterThan(0);

      await useClasesStore
        .getState()
        .cancelarClase(claseConInscriptos.id, "Feriado reprogramado", true);

      const html = renderToStaticMarkup(
        <ClassAgenda
          initialSheetOpen={true}
          initialClaseId={claseConInscriptos.id}
          testAhora={FECHA_REF}
        />,
      );

      expect(html).toContain('data-testid="cancel-whatsapp-panel"');
      expect(html).toContain('data-testid="copy-cancel-notice-btn"');
      expect(html).toContain("Copiar aviso");
      for (const r of inscriptos) {
        expect(html).toContain(`data-testid="whatsapp-cancel-btn-${r.alumno_id}"`);
      }
      expect(html).toContain("https://wa.me/");
    });
  });
});
