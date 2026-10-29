import { describe, it, expect, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  useChatStore,
  STAFF_COACH_PRINCIPAL,
  DEFAULT_ATHLETE_SENDER,
} from "@/store/use-chat-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { MOCK_ALUMNOS } from "@/services/coach-mock-data";

describe("GOZS-244: FE Studio - Botón de mensaje por la app (chat) en acciones del alumno", () => {
  const coachStudioViewPath = path.resolve(
    __dirname,
    "../components/coach/coach-studio-view.tsx"
  );
  const studentCardPath = path.resolve(
    __dirname,
    "../components/coach/student-card.tsx"
  );
  const studentDetailPath = path.resolve(
    __dirname,
    "../components/coach/student-detail.tsx"
  );
  const chatFabPath = path.resolve(
    __dirname,
    "../components/coach/chat-fab.tsx"
  );

  const viewContent = fs.readFileSync(coachStudioViewPath, "utf-8");
  const cardContent = fs.readFileSync(studentCardPath, "utf-8");
  const detailContent = fs.readFileSync(studentDetailPath, "utf-8");
  const chatFabContent = fs.readFileSync(chatFabPath, "utf-8");

  beforeEach(() => {
    useChatStore.getState().resetToDefaults();
    useOfflineQueueStore.getState().clearQueue();
    useOfflineQueueStore.getState().setOnlineStatus(true);
    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      chatAlumnoId: null,
      isChatOpen: false,
      isWhatsAppEnabled: false,
    });
  });

  describe("1. Criterio de Aceptación: Botón 'Enviar mensaje' en lista de acciones", () => {
    it("GIVEN un alumno en la lista de acciones, CoachStudioView expone el botón 'Enviar mensaje' con data-testid accesible", () => {
      expect(viewContent).toContain("btn-enviar-mensaje-${alumno.id}");
      expect(viewContent).toContain('title="Enviar mensaje"');
      expect(viewContent).toContain("aria-label={`Enviar mensaje a ${alumno.nombre_completo}`}");
    });

    it("WHEN el coach toca 'Enviar mensaje', THEN se abre el chat en la app para ese alumno específico", () => {
      const alumnoId = MOCK_ALUMNOS[0]!.id;

      expect(useCoachStudioStore.getState().isChatOpen).toBe(false);
      expect(useCoachStudioStore.getState().chatAlumnoId).toBeNull();

      // Coach toca 'Enviar mensaje'
      useCoachStudioStore.getState().openChatForAlumno(alumnoId);

      expect(useCoachStudioStore.getState().isChatOpen).toBe(true);
      expect(useCoachStudioStore.getState().chatAlumnoId).toBe(alumnoId);
      expect(useChatStore.getState().selectedAlumnoId).toBe(alumnoId);
    });

    it("THEN el mensaje enviado por el coach llega reactivamente al alumno en su app", () => {
      const alumno = MOCK_ALUMNOS[0]!;
      const alumnoId = alumno.id;

      // El coach abre el chat y envía un mensaje
      useCoachStudioStore.getState().openChatForAlumno(alumnoId);

      useChatStore.getState().sendMessage({
        alumnoId,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Hola Lucas, acordate de calentar bien los hombros hoy.",
      });

      // El alumno abre su conversación en Athlete App y encuentra el mensaje
      const conv = useChatStore.getState().getConversation(alumnoId);
      const ultimoMensaje = conv.mensajes[conv.mensajes.length - 1];

      expect(ultimoMensaje).toBeDefined();
      expect(ultimoMensaje?.contenido).toBe("Hola Lucas, acordate de calentar bien los hombros hoy.");
      expect(ultimoMensaje?.es_staff).toBe(true);
      expect(ultimoMensaje?.remitente_nombre).toBe("Coach Principal");
    });
  });

  describe("2. Criterio de Aceptación: WhatsApp solo visible si está habilitado en config (apagado por defecto)", () => {
    it("el toggle de WhatsApp está apagado por defecto en useCoachStudioStore", () => {
      expect(useCoachStudioStore.getState().isWhatsAppEnabled).toBe(false);
    });

    it("CoachStudioView expone el toggle de configuración con data-testid='toggle-whatsapp-config'", () => {
      expect(viewContent).toContain('data-testid="toggle-whatsapp-config"');
      expect(viewContent).toContain("WhatsApp en acciones");
    });

    it("en la lista de acciones de la tabla, el botón de WhatsApp está condicionado a isWhatsAppEnabled", () => {
      expect(viewContent).toContain("isWhatsAppEnabled && (");
      expect(viewContent).toContain("btn-whatsapp-${alumno.id}");
    });

    it("permite al coach activar y desactivar WhatsApp opcional mediante el store", () => {
      const store = useCoachStudioStore.getState();

      store.setWhatsAppEnabled(true);
      expect(useCoachStudioStore.getState().isWhatsAppEnabled).toBe(true);

      store.toggleWhatsAppEnabled();
      expect(useCoachStudioStore.getState().isWhatsAppEnabled).toBe(false);

      store.toggleWhatsAppEnabled();
      expect(useCoachStudioStore.getState().isWhatsAppEnabled).toBe(true);
    });
  });

  describe("3. Ergonomía Táctil M3 (Fat-Finger Friendly ≥ 48px y separación ≥ 8px)", () => {
    it("el botón de 'Enviar mensaje' cumple con touch target de 48x48px (min-h-[48px] min-w-[48px])", () => {
      expect(viewContent).toContain("h-12 w-12 min-h-[48px] min-w-[48px]");
    });

    it("mantiene la separación táctil mínima entre botones de al menos 8px (gap-2)", () => {
      expect(viewContent).toContain("gap-2");
    });
  });

  describe("4. Integración en StudentCard y StudentDetail", () => {
    it("StudentCard incorpora botón de mensaje en app y condiciona WhatsApp a config", () => {
      expect(cardContent).toContain("btn-enviar-mensaje-${alumno.id}");
      expect(cardContent).toContain("isWhatsAppEnabled && (");
    });

    it("StudentDetail incorpora botón de mensaje por app con data-testid='enviar-mensaje-btn'", () => {
      expect(detailContent).toContain('data-testid="enviar-mensaje-btn"');
      expect(detailContent).toContain("openChatForAlumno(alumno.id)");
    });
  });

  describe("5. Soporte Offline-First en el envío de mensajes", () => {
    it("GIVEN conexión caída, WHEN el coach envía un mensaje, THEN se encola en useOfflineQueueStore", () => {
      const offlineQueue = useOfflineQueueStore.getState();
      offlineQueue.setOnlineStatus(false);

      const alumnoId = MOCK_ALUMNOS[1]!.id;
      useCoachStudioStore.getState().openChatForAlumno(alumnoId);

      const msg = useChatStore.getState().sendMessage({
        alumnoId,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Mensaje en modo avión desde el gimnasio.",
      });

      expect(msg.estado_envio).toBe("pendiente");
      const queueState = useOfflineQueueStore.getState();
      expect(queueState.pendingEvents.length).toBeGreaterThan(0);
      expect(queueState.pendingEvents[0]?.action).toBe("ENVIAR_MENSAJE_CHAT");
    });
  });
});
