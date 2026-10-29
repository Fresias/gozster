import { beforeEach, describe, expect, it, vi } from "vitest";

const upserts: { table: string; row: Record<string, unknown> }[] = [];
let fail = false;

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>) => {
        if (fail) return { error: { message: "rls" } };
        upserts.push({ table, row });
        return { error: null };
      },
    }),
  },
}));

import { useOfflineQueueStore } from "@/store/use-offline-queue";

const setEvent = (id: string, n: number) => ({
  id,
  action: "WORKOUT_SET_COMPLETED",
  payload: {
    sessionId: "s1",
    alumnoId: "a1",
    diaId: "d1",
    ejercicioId: "e1",
    setNumber: n,
    pesoKg: 50,
    reps: 8,
    rpe: 8,
  },
});

describe("GOZS-283 · flushQueue envía las series a Supabase", () => {
  beforeEach(() => {
    upserts.length = 0;
    fail = false;
    useOfflineQueueStore.setState({ pendingEvents: [], syncError: null });
  });

  it("inserta sesión y serie y vacía solo lo confirmado", async () => {
    useOfflineQueueStore.getState().enqueueEvent(setEvent("x1", 1));
    await useOfflineQueueStore.getState().flushQueue();
    expect(upserts.map((u) => u.table)).toEqual(["registro_sesiones", "registro_series"]);
    expect(upserts[1]!.row).toMatchObject({ sesion_id: "s1", ejercicio_id: "e1", numero_serie: 1, completada: true });
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
  });

  it("ante fallo de red/RLS los eventos permanecen y se reintentan", async () => {
    useOfflineQueueStore.getState().enqueueEvent(setEvent("x1", 1));
    useOfflineQueueStore.getState().enqueueEvent(setEvent("x2", 2));
    fail = true;
    await useOfflineQueueStore.getState().flushQueue();
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(2);
    fail = false;
    await useOfflineQueueStore.getState().flushQueue();
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    // Idempotencia: la serie se envía con onConflict, no con insert.
    expect(upserts.filter((u) => u.table === "registro_series")).toHaveLength(2);
  });
});
