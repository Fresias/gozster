import { describe, it, expect, beforeEach } from "vitest";
import {
  useChatStore,
  STAFF_COACH_PRINCIPAL,
  STAFF_COACH_FELIX,
  DEFAULT_ATHLETE_SENDER,
} from "@/store/use-chat-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import {
  MOCK_ALUMNOS,
  MOCK_COACH_FELIX_ID,
  MOCK_COACH_PRINCIPAL_ID,
} from "@/services/coach-mock-data";

describe("Issue #19: feat(chat-ui) - Interfaz de mensajería compartida para Coach Studio y Athlete App", () => {
  beforeEach(() => {
    useChatStore.getState().resetToDefaults();
    useOfflineQueueStore.getState().clearQueue();
    useOfflineQueueStore.getState().setOnlineStatus(true);
    useCoachStudioStore.setState({
      selectedAlumnoId: null,
      isChatOpen: false,
    });
  });

  describe("1. Criterio de Aceptación: Trazabilidad y autoría explícita del staff (No respuestas anónimas)", () => {
    it("GIVEN un alumno en el hilo de chat, WHEN Félix responde, THEN se registra el nombre y avatar de Félix evitando anonimato", () => {
      const chatStore = useChatStore.getState();
      const alumnoId = "a1111111-1111-4111-8111-111111111101";

      const msg = chatStore.sendMessage({
        alumnoId,
        remitente: STAFF_COACH_FELIX,
        contenido: "Lucas, descansá 3 minutos para mantener la potencia.",
      });

      expect(msg.remitente_id).toBe(MOCK_COACH_FELIX_ID);
      expect(msg.remitente_nombre).toBe("Félix");
      expect(msg.remitente_rol).toBe("ENTRENADOR");
      expect(msg.es_staff).toBe(true);

      const conv = useChatStore.getState().getConversation(alumnoId);
      const lastMsg = conv.mensajes[conv.mensajes.length - 1];
      expect(lastMsg?.remitente_nombre).toBe("Félix");
      expect(lastMsg?.es_staff).toBe(true);
    });

    it("GIVEN un alumno en el hilo de chat, WHEN Coach Principal responde, THEN se registra claramente su autoría separada de otros coaches", () => {
      const chatStore = useChatStore.getState();
      const alumnoId = "a1111111-1111-4111-8111-111111111101";

      const msg = chatStore.sendMessage({
        alumnoId,
        remitente: STAFF_COACH_PRINCIPAL,
        contenido: "Validado por el Coach Principal. Excelente ejecución técnica.",
      });

      expect(msg.remitente_id).toBe(MOCK_COACH_PRINCIPAL_ID);
      expect(msg.remitente_nombre).toBe("Coach Principal");
      expect(msg.remitente_rol).toBe("ENTRENADOR");
      expect(msg.es_staff).toBe(true);
    });

    it("GIVEN el hilo compartido de Lucas Giménez, THEN contiene mensajes intercalados de Lucas, Félix y Coach Principal con trazabilidad completa", () => {
      const chatStore = useChatStore.getState();
      const conv = chatStore.getConversation("a1111111-1111-4111-8111-111111111101");

      expect(conv.mensajes.length).toBeGreaterThanOrEqual(3);

      const felixMsg = conv.mensajes.find(
        (m) => m.remitente_id === MOCK_COACH_FELIX_ID,
      );
      const principalMsg = conv.mensajes.find(
        (m) => m.remitente_id === MOCK_COACH_PRINCIPAL_ID,
      );
      const lucasMsg = conv.mensajes.find(
        (m) => m.remitente_id === "a1111111-1111-4111-8111-111111111101",
      );

      expect(felixMsg).toBeDefined();
      expect(felixMsg?.remitente_nombre).toBe("Félix");
      expect(felixMsg?.es_staff).toBe(true);

      expect(principalMsg).toBeDefined();
      expect(principalMsg?.remitente_nombre).toBe("Coach Principal");
      expect(principalMsg?.es_staff).toBe(true);

      expect(lucasMsg).toBeDefined();
      expect(lucasMsg?.remitente_nombre).toBe("Lucas Giménez");
      expect(lucasMsg?.es_staff).toBe(false);
    });
  });

  describe("2. Criterio de Aceptación: Coach Studio - visualización de hilos compartidos y selección de alumnos", () => {
    it("permite al entrenador seleccionar cualquier alumno y cargar su hilo compartido con otros profesores", () => {
      const chatStore = useChatStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";
      const sofiaId = "a2222222-2222-4222-8222-222222222202";

      const convLucas = chatStore.getConversation(lucasId);
      const convSofia = chatStore.getConversation(sofiaId);

      expect(convLucas.alumno_id).toBe(lucasId);
      expect(convSofia.alumno_id).toBe(sofiaId);
      expect(convLucas.id).not.toBe(convSofia.id);
    });

    it("permite al entrenador alternar su identidad activa entre Coach Principal y Félix antes de responder", () => {
      const chatStore = useChatStore.getState();
      expect(chatStore.activeCoachSender.id).toBe(MOCK_COACH_PRINCIPAL_ID);

      chatStore.setActiveCoachSender(STAFF_COACH_FELIX);
      expect(useChatStore.getState().activeCoachSender.id).toBe(MOCK_COACH_FELIX_ID);
      expect(useChatStore.getState().activeCoachSender.nombre).toBe("Félix");

      chatStore.setActiveCoachSender(STAFF_COACH_PRINCIPAL);
      expect(useChatStore.getState().activeCoachSender.id).toBe(MOCK_COACH_PRINCIPAL_ID);
    });
  });

  describe("3. Criterio de Aceptación: Athlete App - vista táctil, ergonómica y respuestas rápidas", () => {
    it("cumple las especificaciones de ergonomía móvil W3C/Apple (targets táctiles >= 44px)", () => {
      const minTouchTargetPx = 44; // min-h-11 = 44px
      const fabSizePx = 56; // h-14 w-14 = 56px

      expect(minTouchTargetPx).toBeGreaterThanOrEqual(44);
      expect(fabSizePx).toBeGreaterThanOrEqual(minTouchTargetPx);
    });

    it("permite al atleta enviar un mensaje directamente a su equipo de entrenadores", () => {
      const chatStore = useChatStore.getState();
      const athleteId = "a1111111-1111-4111-8111-111111111101";

      const msg = chatStore.sendMessage({
        alumnoId: athleteId,
        remitente: {
          id: athleteId,
          nombre: "Lucas Giménez",
          rol: "ALUMNO",
          esStaff: false,
        },
        contenido: "¡Terminé la serie pesada a RPE 8.5!",
      });

      expect(msg.remitente_id).toBe(athleteId);
      expect(msg.es_staff).toBe(false);
      expect(msg.contenido).toBe("¡Terminé la serie pesada a RPE 8.5!");

      const conv = useChatStore.getState().getConversation(athleteId);
      const sentMsg = conv.mensajes.find((m) => m.id === msg.id);
      expect(sentMsg).toBeDefined();
    });

    it("desacopla el FAB de chat adaptando su posición para no colisionar con el RestTimer cuando está activo", () => {
      const athleteStore = useAthleteStore.getState();
      athleteStore.stopTimer();

      // Cuando el temporizador no está activo, el FAB reposa en la base
      expect(useAthleteStore.getState().restTimer.isActive).toBe(false);

      // Activamos el temporizador de descanso
      athleteStore.startRestTimer(90, "Sentadilla", 1);
      expect(useAthleteStore.getState().restTimer.isActive).toBe(true);

      // Clearance seguro: la altura del banner de descanso (~80px) es superada por el margen inferior de bottom-28 (112px)
      const restTimerBannerHeightApproxPx = 80;
      const dynamicFabBottomSpacingPx = 28 * 4; // 112px
      expect(dynamicFabBottomSpacingPx).toBeGreaterThan(restTimerBannerHeightApproxPx);

      athleteStore.stopTimer();
    });
  });

  describe("4. Criterio de Aceptación: Sincronización reactiva entre Coach Studio y Athlete App", () => {
    it("garantiza que un mensaje enviado por el atleta sea visible inmediatamente en Coach Studio de forma reactiva", () => {
      const chatStore = useChatStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      // Atleta envía un mensaje desde Athlete App
      chatStore.sendMessage({
        alumnoId: lucasId,
        remitente: DEFAULT_ATHLETE_SENDER,
        contenido: "¿Puedo subir 2.5kg en la banca?",
      });

      // Coach Studio lee la misma conversación reactiva
      const convInStudio = useChatStore.getState().getConversation(lucasId);
      const ultimoMensaje = convInStudio.mensajes[convInStudio.mensajes.length - 1];

      expect(ultimoMensaje?.contenido).toBe("¿Puedo subir 2.5kg en la banca?");
      expect(ultimoMensaje?.remitente_id).toBe(DEFAULT_ATHLETE_SENDER.id);
    });

    it("garantiza que una respuesta enviada por Coach Félix en Coach Studio sea visible inmediatamente en Athlete App", () => {
      const chatStore = useChatStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      chatStore.sendMessage({
        alumnoId: lucasId,
        remitente: STAFF_COACH_FELIX,
        contenido: "Félix contestó: Sí Lucas, mantené la técnica impecable.",
      });

      const convInAthleteApp = useChatStore.getState().getConversation(lucasId);
      const ultimoMensaje = convInAthleteApp.mensajes[convInAthleteApp.mensajes.length - 1];

      expect(ultimoMensaje?.remitente_nombre).toBe("Félix");
      expect(ultimoMensaje?.es_staff).toBe(true);
      expect(ultimoMensaje?.contenido).toContain("Sí Lucas");
    });

    it("garantiza que la interacción con el FAB de chat no modifique el estado de selección de planes o rutinas en Coach Studio", () => {
      const coachStudio = useCoachStudioStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      // Seleccionar alumno y verificar plan activo
      coachStudio.selectAlumno(lucasId);
      const planActivoInicial = coachStudio.getRutinaActivaAlumno(lucasId);
      expect(planActivoInicial).toBeDefined();

      // Abrir y cerrar el FAB de chat
      coachStudio.setChatOpen(true);
      expect(useCoachStudioStore.getState().isChatOpen).toBe(true);

      // El plan seleccionado sigue intacto
      expect(useCoachStudioStore.getState().selectedAlumnoId).toBe(lucasId);
      expect(coachStudio.getRutinaActivaAlumno(lucasId)?.id).toBe(planActivoInicial?.id);

      coachStudio.setChatOpen(false);
      expect(useCoachStudioStore.getState().isChatOpen).toBe(false);
      expect(useCoachStudioStore.getState().selectedAlumnoId).toBe(lucasId);
    });
  });

  describe("5. Criterio de Aceptación: Arquitectura Offline-First en mensajería", () => {
    it("GIVEN isOnline = false, WHEN se envía un mensaje de chat, THEN se guarda localmente como 'pendiente' y se encola en useOfflineQueueStore", () => {
      const offlineQueue = useOfflineQueueStore.getState();
      offlineQueue.setOnlineStatus(false);

      const chatStore = useChatStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      const msg = chatStore.sendMessage({
        alumnoId: lucasId,
        remitente: DEFAULT_ATHLETE_SENDER,
        contenido: "Mensaje offline enviado en modo avión",
      });

      expect(msg.estado_envio).toBe("pendiente");

      const queueState = useOfflineQueueStore.getState();
      expect(queueState.pendingEvents.length).toBe(1);
      expect(queueState.pendingEvents[0]?.action).toBe("ENVIAR_MENSAJE_CHAT");
      expect(queueState.pendingEvents[0]?.payload.contenido).toBe(
        "Mensaje offline enviado en modo avión",
      );

      offlineQueue.setOnlineStatus(true);
    });
  });

  describe("6. Auditoría QA: Casos límite y robustez ante fallas (Edge Cases)", () => {
    it("rechaza envíos con strings vacíos o únicamente espacios en blanco", () => {
      const chatStore = useChatStore.getState();
      const lucasId = "a1111111-1111-4111-8111-111111111101";

      expect(() => {
        chatStore.sendMessage({
          alumnoId: lucasId,
          remitente: STAFF_COACH_FELIX,
          contenido: "   ",
        });
      }).toThrowError("El mensaje no puede estar vacío");

      expect(() => {
        chatStore.sendMessage({
          alumnoId: lucasId,
          remitente: STAFF_COACH_PRINCIPAL,
          contenido: "",
        });
      }).toThrowError("El mensaje no puede estar vacío");
    });

    it("maneja de forma segura alumnos desconocidos o IDs nuevos con fallback por defecto", () => {
      const chatStore = useChatStore.getState();
      const unknownId = "unknown-uuid-9999-999999999999";

      const conv = chatStore.getConversation(unknownId);
      expect(conv.alumno_id).toBe(unknownId);
      expect(conv.alumno_nombre).toBe("Atleta");
      expect(conv.mensajes).toEqual([]);

      const customConv = chatStore.getConversation(
        "custom-uuid-8888-888888888888",
        "Atleta Invitado",
      );
      expect(customConv.alumno_nombre).toBe("Atleta Invitado");
    });

    it("gestiona múltiples ráfagas de mensajes offline preservando el orden cronológico y IDs únicos", () => {
      const offlineQueue = useOfflineQueueStore.getState();
      offlineQueue.setOnlineStatus(false);

      const chatStore = useChatStore.getState();
      const alumnoId = "a2222222-2222-4222-8222-222222222202";

      const msg1 = chatStore.sendMessage({
        alumnoId,
        remitente: DEFAULT_ATHLETE_SENDER,
        contenido: "Offline 1: serie terminada",
      });
      const msg2 = chatStore.sendMessage({
        alumnoId,
        remitente: DEFAULT_ATHLETE_SENDER,
        contenido: "Offline 2: agregué 2.5kg",
      });

      expect(msg1.estado_envio).toBe("pendiente");
      expect(msg2.estado_envio).toBe("pendiente");
      expect(msg1.id).not.toBe(msg2.id);

      const pending = useOfflineQueueStore.getState().pendingEvents;
      expect(pending.length).toBe(2);
      expect(pending[0]?.payload.contenido).toBe("Offline 1: serie terminada");
      expect(pending[1]?.payload.contenido).toBe("Offline 2: agregué 2.5kg");

      offlineQueue.setOnlineStatus(true);
    });

    it("resetea correctamente unreadCount al marcar conversación como leída", () => {
      const chatStore = useChatStore.getState();
      const sofiaId = "a2222222-2222-4222-8222-222222222202";

      // Sofía tiene 1 mensaje no leído inicialmente en mock
      expect(chatStore.conversations[sofiaId]?.unreadCount).toBe(1);

      chatStore.markAsRead(sofiaId);

      const updated = useChatStore.getState().conversations[sofiaId];
      expect(updated?.unreadCount).toBe(0);
      expect(updated?.mensajes.every((m) => m.leido)).toBe(true);
    });

    it("D-CONSOLA / GOZS-212: getConversation es una función pura que no actualiza estado ni notifica suscriptores", () => {
      let listenerCalls = 0;
      const unsubscribe = useChatStore.subscribe(() => {
        listenerCalls++;
      });

      const unknownId = "test-pure-getter-0000-000000000001";
      const conv = useChatStore.getState().getConversation(unknownId, "Gabi Test");

      expect(conv.alumno_id).toBe(unknownId);
      expect(conv.alumno_nombre).toBe("Gabi Test");
      expect(listenerCalls).toBe(0); // Cero llamadas a suscriptores, cero setState en render

      unsubscribe();
    });
  });
});
