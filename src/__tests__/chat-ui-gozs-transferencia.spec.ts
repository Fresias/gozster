import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  useChatStore,
  STAFF_COACH_PRINCIPAL,
  STAFF_COACH_FELIX,
  AVAILABLE_COACH_SENDERS,
  DEFAULT_ATHLETE_SENDER,
} from "@/store/use-chat-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  MOCK_COACH_FELIX_ID,
  MOCK_COACH_PRINCIPAL_ID,
  MOCK_ALUMNOS,
} from "@/services/coach-mock-data";
import { DEMO_CRITICAL_ALERTS } from "@/services/coach-demo-dataset";
import { supabase } from "@/lib/supabase/client";

describe("GOZS-46: feat(chat-ui) - Identidad única 'GOZS' hacia el alumno, autoría interna en Studio y transferencia (#66)", () => {
  beforeEach(() => {
    useChatStore.getState().resetToDefaults();
    useOfflineQueueStore.getState().clearQueue();
    useOfflineQueueStore.getState().setOnlineStatus(true);
    vi.restoreAllMocks();
  });

  describe("1. Identidad Institucional GOZS hacia el Alumno (ADR-004: 'Somos un equipo')", () => {
    const athleteChatPath = path.resolve(
      process.cwd(),
      "src/components/athlete/athlete-chat.tsx",
    );
    const athleteChatSource = fs.readFileSync(athleteChatPath, "utf-8");

    it("la interfaz de AthleteChat muestra únicamente la identidad 'GOZS' y oculta nombres individuales de profesores", () => {
      // Regla de negocio cerrada: prohibido mostrar nombres individuales de coaches en la vista del alumno
      expect(athleteChatSource).not.toContain("Coach Principal & Félix asignados a tus rutinas");
      expect(athleteChatSource).not.toContain("{msg.remitente_nombre} contestó...");
      expect(athleteChatSource).not.toContain("title={msg.remitente_nombre}");

      // Debe mostrar la marca institucional GOZS
      expect(athleteChatSource).toContain("<span>GOZS</span>");
      expect(athleteChatSource).toContain("Tu equipo de entrenadores GOZS");
      expect(athleteChatSource).toContain("Comunícate directamente con el equipo GOZS.");
      expect(athleteChatSource).toContain('placeholder="Escribe al equipo GOZS..."');
      expect(athleteChatSource).toContain('aria-label="Abrir chat con el equipo GOZS"');
    });

    it("cada mensaje emitido por cualquier miembro del staff se rotula hacia el alumno como 'GOZS' con badge 'Equipo'", () => {
      // Las burbujas de staff muestran GOZS y avatar 'G'
      expect(athleteChatSource).toContain('data-testid={`staff-author-${msg.id}`}');
      expect(athleteChatSource).toContain("GOZS");
      expect(athleteChatSource).toContain("Equipo");
      expect(athleteChatSource).toContain('aria-label="Avatar del equipo GOZS"');
    });
  });

  describe("2. Autoría Real Interna y Trazabilidad en Coach Studio", () => {
    it("en useChatStore se preserva el remitente_id real y nombre de cada profesor que responde", () => {
      const alumnoId = "a1111111-1111-4111-8111-111111111101";

      const msgFelix = useChatStore.getState().sendMessage({
        alumnoId,
        remitente: STAFF_COACH_FELIX,
        contenido: "Félix respondiendo internamente al alumno.",
      });

      expect(msgFelix.remitente_id).toBe(MOCK_COACH_FELIX_ID);
      expect(msgFelix.remitente_nombre).toBe("Félix");
      expect(msgFelix.es_staff).toBe(true);

      const msgPrincipal = useChatStore.getState().sendMessage({
        alumnoId,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Coach Principal revisando técnica.",
      });

      expect(msgPrincipal.remitente_id).toBe(MOCK_COACH_PRINCIPAL_ID);
      expect(msgPrincipal.remitente_nombre).toBe("Coach Principal");
      expect(msgPrincipal.es_staff).toBe(true);
    });

    it("el componente ChatFab en Coach Studio expone la autoría real y timestamp en cada burbuja de staff", () => {
      const chatFabPath = path.resolve(
        process.cwd(),
        "src/components/coach/chat-fab.tsx",
      );
      const chatFabSource = fs.readFileSync(chatFabPath, "utf-8");

      expect(chatFabSource).toContain('data-testid={`staff-author-${msg.id}`}');
      expect(chatFabSource).toContain('data-testid={`msg-timestamp-${msg.id}`}');
      expect(chatFabSource).toContain("{msg.remitente_nombre}");
      expect(chatFabSource).toContain("Staff");
      expect(chatFabSource).toContain("{msg.hora}");
    });
  });

  describe("3. Asignación y Transferencia de Responsable (RPC transferir_conversacion_gozs)", () => {
    it("permite transferir una conversación a otro profesor y actualiza el estado optimista en useChatStore", async () => {
      const alumnoId = "a1111111-1111-4111-8111-111111111101";
      const conv = useChatStore.getState().getConversation(alumnoId);
      expect(conv.responsable_id).toBe(MOCK_COACH_PRINCIPAL_ID);
      expect(conv.responsable_nombre).toBe("Coach Principal");

      // Transferir a Félix
      const res = await useChatStore.getState().transferirConversacion({
        conversacionId: conv.id,
        nuevoResponsableId: MOCK_COACH_FELIX_ID,
        motivo: "Reasignación técnica por especialidad en sentadilla",
        alumnoId,
      });

      expect(res.success).toBe(true);

      const convActualizada = useChatStore.getState().getConversation(alumnoId);
      expect(convActualizada.responsable_id).toBe(MOCK_COACH_FELIX_ID);
      expect(convActualizada.responsable_nombre).toBe("Félix");
    });

    it("cuando isOnline = false, encola el evento TRANSFERIR_CONVERSACION_GOZS en useOfflineQueueStore", async () => {
      useOfflineQueueStore.getState().setOnlineStatus(false);
      const alumnoId = "a1111111-1111-4111-8111-111111111101";
      const conv = useChatStore.getState().getConversation(alumnoId);

      const res = await useChatStore.getState().transferirConversacion({
        conversacionId: conv.id,
        nuevoResponsableId: MOCK_COACH_FELIX_ID,
        motivo: "Transferencia sin conexión",
        alumnoId,
      });

      expect(res.success).toBe(true);
      expect(res.offline).toBe(true);

      // Verificamos que se haya encolado en la cola offline
      const pendingEvents = useOfflineQueueStore.getState().pendingEvents;
      const transferEvent = pendingEvents.find(
        (e) => e.action === "TRANSFERIR_CONVERSACION_GOZS",
      );
      expect(transferEvent).toBeDefined();
      expect(transferEvent?.payload.nuevo_responsable_id).toBe(MOCK_COACH_FELIX_ID);
      expect(transferEvent?.payload.motivo).toBe("Transferencia sin conexión");
    });

    it("cuando isOnline = true y son UUIDs válidos, invoca el RPC transferir_conversacion_gozs de Supabase", async () => {
      const validConvId = "c1111111-1111-4111-8111-111111111111";
      const validNuevoResponsableId = MOCK_COACH_FELIX_ID;

      const rpcSpy = vi.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: {
          id: validConvId,
          alumno_id: "a1111111-1111-4111-8111-111111111101",
          responsable_id: validNuevoResponsableId,
          estado: "ABIERTA",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error: null,
      } as any);

      const res = await useChatStore.getState().transferirConversacion({
        conversacionId: validConvId,
        nuevoResponsableId: validNuevoResponsableId,
        motivo: "Rotación programada",
        alumnoId: "a1111111-1111-4111-8111-111111111101",
      });

      expect(res.success).toBe(true);
      expect(rpcSpy).toHaveBeenCalledWith("transferir_conversacion_gozs", {
        p_conversacion_id: validConvId,
        p_nuevo_responsable_id: validNuevoResponsableId,
        p_motivo: "Rotación programada",
      });
    });

    it("StudentDetail renderiza el panel de Chat GOZS y control de transferencia de responsable", () => {
      const studentDetailPath = path.resolve(
        process.cwd(),
        "src/components/coach/student-detail.tsx",
      );
      const studentDetailSource = fs.readFileSync(studentDetailPath, "utf-8");

      expect(studentDetailSource).toContain('data-testid="chat-responsable-panel"');
      expect(studentDetailSource).toContain('data-testid="student-chat-responsable"');
      expect(studentDetailSource).toContain('data-testid="student-chat-estado"');
      expect(studentDetailSource).toContain('data-testid="student-transfer-target-select"');
      expect(studentDetailSource).toContain('data-testid="student-transfer-confirm-btn"');
      expect(studentDetailSource).toContain('data-testid="open-student-chat-btn"');
    });
  });

  describe("4. Notificaciones, Filtros y Desacople de Molestias (GOZS-416)", () => {
    it("ChatFab provee filtros por pestaña ('TODOS', 'NUEVOS', 'PENDIENTES') en Inbox sin pestaña de MOLESTIAS", () => {
      const chatFabPath = path.resolve(
        process.cwd(),
        "src/components/coach/chat-fab.tsx",
      );
      const chatFabSource = fs.readFileSync(chatFabPath, "utf-8");

      expect(chatFabSource).toContain('data-testid="coach-chat-filter-bar"');
      expect(chatFabSource).toContain('chat-filter-${filter.toLowerCase()}');
      expect(chatFabSource).toContain('"TODOS"');
      expect(chatFabSource).toContain('"NUEVOS"');
      expect(chatFabSource).toContain('"PENDIENTES"');
      expect(chatFabSource).not.toContain('"MOLESTIAS"');
    });

    it("se elimina por completo la alerta de molestia física (activePainAlert) dentro del drawer de chat", () => {
      const chatFabPath = path.resolve(
        process.cwd(),
        "src/components/coach/chat-fab.tsx",
      );
      const chatFabSource = fs.readFileSync(chatFabPath, "utf-8");

      expect(chatFabSource).not.toContain('data-testid="chat-pain-alert-banner"');
      expect(chatFabSource).not.toContain("activePainAlert");
      expect(chatFabSource).not.toContain("DEMO_CRITICAL_ALERTS");
    });

    it("permite actualizar el estado de la conversación (ABIERTA, PENDIENTE, ATENDIDA)", async () => {
      const alumnoId = "a1111111-1111-4111-8111-111111111101";
      await useChatStore.getState().cambiarEstadoConversacion(alumnoId, "PENDIENTE");

      const conv = useChatStore.getState().getConversation(alumnoId);
      expect(conv.estado).toBe("PENDIENTE");

      await useChatStore.getState().cambiarEstadoConversacion(alumnoId, "ATENDIDA");
      const convAtendida = useChatStore.getState().getConversation(alumnoId);
      expect(convAtendida.estado).toBe("ATENDIDA");
    });
  });

  describe("5. Resiliencia Offline y Sincronización con Supabase", () => {
    it("syncWithSupabase maneja errores de red de forma transparente sin crashear", async () => {
      vi.spyOn(supabase, "from").mockReturnValueOnce({
        select: vi.fn().mockResolvedValueOnce({
          data: null,
          error: new Error("Network offline timeout"),
        }),
      } as any);

      await expect(
        useChatStore.getState().syncWithSupabase(),
      ).resolves.not.toThrow();
    });

    it("un mensaje enviado offline se encola en useOfflineQueueStore con estado 'pendiente'", () => {
      useOfflineQueueStore.getState().setOnlineStatus(false);
      const alumnoId = "a1111111-1111-4111-8111-111111111101";

      const msg = useChatStore.getState().sendMessage({
        alumnoId,
        remitente: DEFAULT_ATHLETE_SENDER,
        contenido: "Mensaje en modo avión sin conexión a internet.",
      });

      expect(msg.estado_envio).toBe("pendiente");
      const pendingEvents = useOfflineQueueStore.getState().pendingEvents;
      expect(pendingEvents.length).toBeGreaterThan(0);
      expect(pendingEvents[0]?.action).toBe("ENVIAR_MENSAJE_CHAT");
      expect(pendingEvents[0]?.payload.contenido).toBe(
        "Mensaje en modo avión sin conexión a internet.",
      );
    });
  });
});
