import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useChatStore, DEFAULT_ATHLETE_SENDER } from "@/store/use-chat-store";
import {
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  getPushSubscriptionStatus,
} from "@/lib/push-notifications";

describe("GOZS-281: FE App - superserie violeta, aviso RPE sin bloqueo, chat y push", () => {
  beforeEach(() => {
    useAthleteStore.getState().resetSessionToDefaults();
    useChatStore.getState().resetToDefaults();
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.clear();
    }
  });

  describe("Criterio Gherkin 1: Rutina con superserie (circuito violeta)", () => {
    it("la sesión por defecto tiene ejercicios configurados como superserie conectada", () => {
      const session = useAthleteStore.getState().currentSession;
      const superseries = session.ejercicios.filter((ej) => ej.es_superserie);

      expect(superseries.length).toBeGreaterThanOrEqual(2);
      expect(superseries[0]?.grupo_superserie).toBe(1);
      expect(superseries[1]?.grupo_superserie).toBe(1);
    });

    it("los ejercicios de superserie contienen los metadatos requeridos para renderizar el circuito", () => {
      const session = useAthleteStore.getState().currentSession;
      const superseries = session.ejercicios.filter((ej) => ej.es_superserie);

      for (const ej of superseries) {
        expect(ej.es_superserie).toBe(true);
        expect(typeof ej.grupo_superserie).toBe("number");
        expect(ej.grupo_superserie).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("Criterio Gherkin 2: Aviso de RPE obligatorio sin bloqueo", () => {
    it("identifica ejercicios con RPE obligatorio pendiente de registro", () => {
      const session = useAthleteStore.getState().currentSession;
      const rpeRequiredExercise = session.ejercicios.find((ej) => ej.force_rpe_required);

      expect(rpeRequiredExercise).toBeDefined();
      expect(rpeRequiredExercise?.force_rpe_required).toBe(true);

      const hasPendingRpe = rpeRequiredExercise?.series.some(
        (s) => !s.rpe_real || s.rpe_real < 6 || s.rpe_real > 10,
      );
      expect(hasPendingRpe).toBe(true);
    });

    it("en flujo normal de la app: completeSet completa la serie SIN BLOQUEO y emite recordatorio", () => {
      const store = useAthleteStore.getState();
      store.setNivelVistaAlumno("SIMPLE");

      const session = store.currentSession;
      const targetExercise = session.ejercicios.find((ej) => ej.force_rpe_required)!;
      expect(targetExercise).toBeDefined();

      const ejId = targetExercise.id;
      const setNum = 1;

      // Asegurar que no tiene RPE
      store.updateSetField(ejId, setNum, "rpe_real", 0);
      store.uncompleteSet(ejId, setNum);

      // Completar la serie sin RPE cargado
      store.completeSet(ejId, setNum);

      const updatedState = useAthleteStore.getState();
      const completedSet = updatedState.currentSession.ejercicios
        .find((e) => e.id === ejId)
        ?.series.find((s) => s.numero_serie === setNum);

      // NO debe bloquearse: la serie queda completada
      expect(completedSet?.completada).toBe(true);
      // El bloqueo estricto es nulo
      expect(updatedState.rpeValidationError).toBeNull();
      // Emite el recordatorio no bloqueante
      expect(updatedState.rpeReminderNotification).toContain("Recordatorio: Registrá el RPE");
    });

    it("clearRpeReminderNotification limpia el aviso no bloqueante", () => {
      const store = useAthleteStore.getState();
      store.setNivelVistaAlumno("SIMPLE");

      const targetExercise = store.currentSession.ejercicios.find((ej) => ej.force_rpe_required)!;
      store.updateSetField(targetExercise.id, 1, "rpe_real", 0);
      store.completeSet(targetExercise.id, 1);

      expect(useAthleteStore.getState().rpeReminderNotification).not.toBeNull();
      useAthleteStore.getState().clearRpeReminderNotification();
      expect(useAthleteStore.getState().rpeReminderNotification).toBeNull();
    });
  });

  describe("Criterio Gherkin 3: Bandeja de chat con mensajes sin leer", () => {
    it("el alumno ve el mensaje nuevo del coach como no leído al abrir la app", () => {
      const chatStore = useChatStore.getState();
      const unreadCount = chatStore.getUnreadStaffCount(DEFAULT_ATHLETE_SENDER.id);

      expect(unreadCount).toBeGreaterThanOrEqual(1);

      const latestUnread = chatStore.getLatestUnreadStaffMessage(DEFAULT_ATHLETE_SENDER.id);
      expect(latestUnread).not.toBeNull();
      expect(latestUnread?.es_staff).toBe(true);
      expect(latestUnread?.leido).toBe(false);
    });

    it("al abrir el chat o marcar como leído, el conteo de no leídos vuelve a 0", () => {
      const chatStore = useChatStore.getState();
      expect(chatStore.getUnreadStaffCount(DEFAULT_ATHLETE_SENDER.id)).toBeGreaterThanOrEqual(1);

      chatStore.markAsRead(DEFAULT_ATHLETE_SENDER.id);

      const updatedCount = useChatStore.getState().getUnreadStaffCount(DEFAULT_ATHLETE_SENDER.id);
      expect(updatedCount).toBe(0);
      expect(useChatStore.getState().getLatestUnreadStaffMessage(DEFAULT_ATHLETE_SENDER.id)).toBeNull();
    });

    it("cuando el coach envía un mensaje, se marca como no leído para el alumno", () => {
      const chatStore = useChatStore.getState();
      chatStore.markAsRead(DEFAULT_ATHLETE_SENDER.id);
      expect(useChatStore.getState().getUnreadStaffCount(DEFAULT_ATHLETE_SENDER.id)).toBe(0);

      chatStore.sendMessage({
        alumnoId: DEFAULT_ATHLETE_SENDER.id,
        remitente: {
          id: "coach-001",
          nombre: "Coach Principal",
          rol: "ENTRENADOR",
          esStaff: true,
        },
        contenido: "¡Excelente entrenamiento hoy! Buen progreso.",
      });

      const count = useChatStore.getState().getUnreadStaffCount(DEFAULT_ATHLETE_SENDER.id);
      expect(count).toBe(1);

      const latest = useChatStore.getState().getLatestUnreadStaffMessage(DEFAULT_ATHLETE_SENDER.id);
      expect(latest?.contenido).toBe("¡Excelente entrenamiento hoy! Buen progreso.");
      expect(latest?.leido).toBe(false);
    });
  });

  describe("Registro de Push (PWA Web Push)", () => {
    it("detecta entorno de soporte push de manera segura", () => {
      const supported = isPushSupported();
      expect(typeof supported).toBe("boolean");
    });

    it("gestiona la suscripción offline-first en localStorage", async () => {
      const usuarioId = DEFAULT_ATHLETE_SENDER.id;

      // Mock de entorno de navegador con Notification y serviceWorker
      const originalNotification = global.Notification;
      const originalNavigator = global.navigator;
      const mockNotification = {
        permission: "granted" as NotificationPermission,
        requestPermission: vi.fn().mockResolvedValue("granted"),
      };

      (globalThis as any).window = {
        PushManager: class PushManager {},
        Notification: mockNotification,
        localStorage: {
          store: {} as Record<string, string>,
          getItem(k: string) { return this.store[k] ?? null; },
          setItem(k: string, v: string) { this.store[k] = v; },
          removeItem(k: string) { delete this.store[k]; },
          clear() { this.store = {}; }
        }
      };

      Object.defineProperty(global, "Notification", {
        value: mockNotification,
        configurable: true,
        writable: true,
      });

      const mockSubscribe = vi.fn().mockResolvedValue({
        toJSON: () => ({
          endpoint: "https://fcm.googleapis.com/fcm/send/test-token",
          keys: {
            p256dh: "mock-p256dh-key",
            auth: "mock-auth-secret",
          },
        }),
      });

      Object.defineProperty(global, "navigator", {
        value: {
          ...originalNavigator,
          onLine: false, // Prueba Offline-First
          serviceWorker: {
            register: vi.fn().mockResolvedValue({
              pushManager: {
                getSubscription: vi.fn().mockResolvedValue(null),
                subscribe: mockSubscribe,
              },
            }),
            getRegistration: vi.fn().mockResolvedValue({
              pushManager: {
                getSubscription: vi.fn().mockResolvedValue(null),
                subscribe: mockSubscribe,
              },
            }),
          },
        },
        configurable: true,
        writable: true,
      });

      try {
        const subRes = await subscribeToPush(usuarioId);
        expect(subRes.success).toBe(true);
        expect(subRes.subscription?.usuario_id).toBe(usuarioId);
        expect(subRes.subscription?.endpoint).toBeDefined();

        const status = await getPushSubscriptionStatus(usuarioId);
        expect(status.isSubscribed).toBe(true);
        expect(status.subscription?.endpoint).toBe(subRes.subscription?.endpoint);

        const unsub = await unsubscribeFromPush(usuarioId);
        expect(unsub).toBe(true);

        const statusAfter = await getPushSubscriptionStatus(usuarioId);
        expect(statusAfter.isSubscribed).toBe(false);
      } finally {
        delete (globalThis as any).window;
        Object.defineProperty(global, "Notification", {
          value: originalNotification,
          configurable: true,
          writable: true,
        });
        Object.defineProperty(global, "navigator", {
          value: originalNavigator,
          configurable: true,
          writable: true,
        });
      }
    });
  });
});
