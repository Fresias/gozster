import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }) },
}));

import { useOfflineQueueStore } from "@/store/use-offline-queue";

const readSource = (relPath: string) =>
  fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

const ejercicioActivo = readSource("../components/athlete/ejercicio-activo.tsx");
const athleteShell = readSource("../components/athlete/athlete-shell.tsx");

describe("GOZS-144 PR1 · Modelo offline silencioso del alumno", () => {
  beforeEach(() => {
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
  });

  describe("Cola que sincroniza sola al volver la señal", () => {
    it("flushQueue vacía la cola y limpia el aviso sin pasos del alumno", async () => {
      const store = useOfflineQueueStore.getState();
      store.setOnlineStatus(false);
      store.enqueueEvent({ id: "e1", action: "WORKOUT_SET_COMPLETED", payload: { sessionId: "s1", alumnoId: "a1", ejercicioId: "e1", setNumber: 1, pesoKg: 50, reps: 8 } });
      store.enqueueEvent({ id: "e2", action: "WORKOUT_SET_COMPLETED", payload: { sessionId: "s1", alumnoId: "a1", ejercicioId: "e1", setNumber: 2, pesoKg: 50, reps: 8 } });
      useOfflineQueueStore.getState().setSyncError("algún fallo previo");

      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(2);

      // Vuelve la señal → la cola se vacía sola y en silencio.
      useOfflineQueueStore.getState().setOnlineStatus(true);
      await useOfflineQueueStore.getState().flushQueue();

      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
      expect(useOfflineQueueStore.getState().syncError).toBeNull();
    });
  });

  describe("Única excepción visible: aviso de fallo definitivo", () => {
    it("setSyncError / clearSyncError gobiernan el aviso discreto", () => {
      expect(useOfflineQueueStore.getState().syncError).toBeNull();

      useOfflineQueueStore.getState().setSyncError("No pudimos guardar en el servidor.");
      expect(useOfflineQueueStore.getState().syncError).toBe(
        "No pudimos guardar en el servidor.",
      );

      useOfflineQueueStore.getState().clearSyncError();
      expect(useOfflineQueueStore.getState().syncError).toBeNull();
    });
  });

  describe("La UI del alumno no expone la cola ni la sincronización manual", () => {
    it("ejercicio-activo.tsx no muestra cola, contadores ni botones de sync/paywall (D3-A solo deriva estado de fila)", () => {
      expect(ejercicioActivo).not.toContain("Cola Offline");
      expect(ejercicioActivo).not.toContain("Sincronizar en Supabase");
      expect(ejercicioActivo).not.toContain("Simular Cuota");
      expect(ejercicioActivo).not.toContain("Esperando Conexión");
      // D3-A (00-PM.md §4): pendingEvents se usa únicamente para derivar Guardada / En el teléfono por fila.
      expect(ejercicioActivo).toContain("isSetPendingOffline");
      expect(ejercicioActivo).not.toContain("sync-supabase-btn");
      expect(ejercicioActivo).not.toContain("simulate-paywall-btn");
    });

    it("ejercicio-activo.tsx muestra el aviso discreto y no bloqueante ante fallo definitivo", () => {
      expect(ejercicioActivo).toContain('data-testid="sync-error-notice"');
      expect(ejercicioActivo).toContain("No pudimos guardar en el servidor");
      expect(ejercicioActivo).toContain("Tus datos siguen en el teléfono. Se reintenta solo.");
    });

    it("athlete-shell.tsx muestra las series pendientes sin señal (D-25) y sincroniza al reconectar", () => {
      expect(athleteShell).toContain("Sin señal ·");
      expect(athleteShell).toContain("Enviando");
      expect(athleteShell).toContain("flushQueue");
    });
  });

  describe("Hábitos y Nutrición ya no se montan en la app del alumno", () => {
    it("ejercicio-activo.tsx no importa ni renderiza HabitTracker / NutritionTracker", () => {
      expect(ejercicioActivo).not.toContain("HabitTracker");
      expect(ejercicioActivo).not.toContain("NutritionTracker");
      expect(ejercicioActivo).not.toContain('data-testid="tab-habits"');
      expect(ejercicioActivo).not.toContain('data-testid="tab-nutrition"');
    });
  });

  describe("Iconografía Lucide inline, sin dependencia prohibida", () => {
    it("ejercicio-activo.tsx usa íconos del módulo local en vez de emojis", () => {
      expect(ejercicioActivo).toContain('from "@/components/athlete/icons"');
      // Emojis reemplazados en la vista de entrenamiento.
      expect(ejercicioActivo).not.toContain("⚠️");
      expect(ejercicioActivo).not.toContain("⏱️");
      expect(ejercicioActivo).not.toContain("🔥");
      expect(ejercicioActivo).not.toContain("🎬");
    });
  });
});
