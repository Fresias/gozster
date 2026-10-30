import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: () => ({ upsert: async () => ({ error: null }) }) },
}));

import { useOfflineQueueStore } from "@/store/use-offline-queue";

const readSource = (relPath: string) =>
  fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

const liveWorkout = readSource("../components/athlete/live-workout.tsx");
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
    it("live-workout.tsx no muestra cola, contadores ni botones de sync/paywall", () => {
      expect(liveWorkout).not.toContain("Cola Offline");
      expect(liveWorkout).not.toContain("Sincronizar en Supabase");
      expect(liveWorkout).not.toContain("Simular Cuota");
      expect(liveWorkout).not.toContain("Esperando Conexión");
      expect(liveWorkout).not.toContain("pendingEvents");
      expect(liveWorkout).not.toContain("sync-supabase-btn");
      expect(liveWorkout).not.toContain("simulate-paywall-btn");
    });

    it("live-workout.tsx muestra el aviso discreto y no bloqueante ante fallo definitivo", () => {
      expect(liveWorkout).toContain('data-testid="sync-error-notice"');
      expect(liveWorkout).toContain(
        "No pudimos guardar en el servidor. Tus datos siguen en el teléfono.",
      );
    });

    it("athlete-shell.tsx quita el contador de pendientes y sincroniza al reconectar", () => {
      expect(athleteShell).not.toContain("pendingEvents.length");
      expect(athleteShell).toContain("flushQueue");
    });
  });

  describe("Hábitos y Nutrición ya no se montan en la app del alumno", () => {
    it("live-workout.tsx no importa ni renderiza HabitTracker / NutritionTracker", () => {
      expect(liveWorkout).not.toContain("HabitTracker");
      expect(liveWorkout).not.toContain("NutritionTracker");
      expect(liveWorkout).not.toContain('data-testid="tab-habits"');
      expect(liveWorkout).not.toContain('data-testid="tab-nutrition"');
    });
  });

  describe("Iconografía Lucide inline, sin dependencia prohibida", () => {
    it("live-workout.tsx usa íconos del módulo local en vez de emojis", () => {
      expect(liveWorkout).toContain('from "@/components/athlete/icons"');
      // Emojis reemplazados en la vista de entrenamiento.
      expect(liveWorkout).not.toContain("⚠️");
      expect(liveWorkout).not.toContain("⏱️");
      expect(liveWorkout).not.toContain("🔥");
      expect(liveWorkout).not.toContain("🎬");
    });
  });
});
