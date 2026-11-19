import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { esUuid } from "@/lib/athlete/uuid";

const upserts: Array<{ table: string; row: Record<string, unknown> }> = [];

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: async () => ({
        data: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
      }),
    },
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>) => {
        // Simula la validación real de Postgres para columnas UUID (22P02)
        const idCol = table === "registro_sesiones" ? row.id : row.sesion_id;
        if (!esUuid(idCol)) {
          return {
            error: {
              code: "22P02",
              message: `invalid input syntax for type uuid: "${String(idCol)}"`,
            },
          };
        }
        upserts.push({ table, row });
        return { error: null };
      },
    }),
  },
}));

import { repararSesionesNoUuid, useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

const setEv = (id: string, sessionId: string, setNumber: number, action = "WORKOUT_SET_COMPLETED") => ({
  id,
  action,
  payload: {
    sessionId,
    alumnoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    diaId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    ejercicioId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    setNumber,
    pesoKg: 80 + setNumber * 5,
    reps: 6,
    rpe: 8,
  },
  createdAt: `2026-11-18T10:00:0${setNumber}Z`,
});

describe("BE-00 CP4 · repararSesionesNoUuid y destrabe de cola (22P02)", () => {
  beforeEach(() => {
    upserts.length = 0;
    useOfflineQueueStore.setState({
      isOnline: false,
      pendingEvents: [],
      syncError: null,
    });
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.setState({
      sesionesCompletadas: [],
    });
    vi.restoreAllMocks();
  });

  it("reagrupa 3 eventos session-A-B y 2 eventos session-C-D con 2 UUIDs distintos preservando orden y otros eventos", () => {
    const yaUuid = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    useOfflineQueueStore.setState({
      isOnline: false,
      pendingEvents: [
        setEv("ev-1", "session-A-B", 1),
        setEv("ev-2", "session-C-D", 1),
        {
          id: "ev-chat",
          action: "CHAT_MESSAGE",
          payload: { sessionId: "session-A-B", text: "hola" },
          createdAt: "2026-11-18T10:00:02Z",
        },
        setEv("ev-3", "session-A-B", 2, "WORKOUT_SET_UPDATED"),
        setEv("ev-4", yaUuid, 1),
        setEv("ev-5", "session-C-D", 2),
        setEv("ev-6", "session-A-B", 3),
      ],
    });

    repararSesionesNoUuid();

    const eventos = useOfflineQueueStore.getState().pendingEvents;
    expect(eventos.map((e) => e.id)).toEqual([
      "ev-1",
      "ev-2",
      "ev-chat",
      "ev-3",
      "ev-4",
      "ev-5",
      "ev-6",
    ]);

    const uuidAB1 = eventos[0]!.payload.sessionId as string;
    const uuidCD1 = eventos[1]!.payload.sessionId as string;
    const uuidAB2 = eventos[3]!.payload.sessionId as string;
    const uuidYa = eventos[4]!.payload.sessionId as string;
    const uuidCD2 = eventos[5]!.payload.sessionId as string;
    const uuidAB3 = eventos[6]!.payload.sessionId as string;

    expect(esUuid(uuidAB1)).toBe(true);
    expect(esUuid(uuidCD1)).toBe(true);
    expect(uuidAB1).not.toBe(uuidCD1);

    // Misma agrupación 3 + 2
    expect(uuidAB2).toBe(uuidAB1);
    expect(uuidAB3).toBe(uuidAB1);
    expect(uuidCD2).toBe(uuidCD1);

    // Eventos ya-UUID y no-WORKOUT_SET_* intactos
    expect(uuidYa).toBe(yaUuid);
    expect(eventos[2]!.payload.sessionId).toBe("session-A-B");
  });

  it("corrige currentSession.id y sesionesCompletadas[].id compartiendo el mapeo con la cola", () => {
    const completadaUuid = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    useOfflineQueueStore.setState({
      isOnline: false,
      pendingEvents: [setEv("ev-1", "session-A-B", 1)],
    });
    useAthleteStore.setState((s) => ({
      currentSession: { ...s.currentSession, id: "session-A-B" },
      sesionesCompletadas: [
        { id: "session-A-B", dia_id: "d1", fecha: "2026-11-18T10:00:00Z" },
        { id: "session-C-D", dia_id: "d2", fecha: "2026-11-17T10:00:00Z" },
        { id: completadaUuid, dia_id: "d3", fecha: "2026-11-16T10:00:00Z" },
      ],
    }));

    repararSesionesNoUuid();

    const uuidCola = useOfflineQueueStore.getState().pendingEvents[0]!.payload.sessionId as string;
    const state = useAthleteStore.getState();

    expect(esUuid(state.currentSession.id)).toBe(true);
    expect(state.currentSession.id).toBe(uuidCola);
    expect(state.sesionesCompletadas[0]!.id).toBe(uuidCola);
    expect(esUuid(state.sesionesCompletadas[1]!.id)).toBe(true);
    expect(state.sesionesCompletadas[1]!.id).not.toBe(uuidCola);
    expect(state.sesionesCompletadas[2]!.id).toBe(completadaUuid);
  });

  it("es idempotente: si todo ya es UUID no reescribe ni dispara flushQueue", () => {
    const sid = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [setEv("ev-1", sid, 1)],
    });
    useAthleteStore.setState((s) => ({
      currentSession: { ...s.currentSession, id: sid },
      sesionesCompletadas: [{ id: sid, dia_id: "d1", fecha: "2026-11-18T10:00:00Z" }],
    }));

    const flushSpy = vi.spyOn(useOfflineQueueStore.getState(), "flushQueue");
    repararSesionesNoUuid();

    expect(useOfflineQueueStore.getState().pendingEvents[0]!.payload.sessionId).toBe(sid);
    expect(useAthleteStore.getState().currentSession.id).toBe(sid);
    expect(flushSpy).not.toHaveBeenCalled();
  });

  it("reproduce el 22P02 que traba la cola con session-<alumno>-<día> y la destraba al reparar", async () => {
    const validUuidBehind = "12121212-1212-4121-8121-121212121212";
    const oldSessionId = "session-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-bbbbbbbb";

    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [
        setEv("ev-old-1", oldSessionId, 1),
        setEv("ev-old-2", oldSessionId, 2),
        setEv("ev-valid-behind", validUuidBehind, 3),
      ],
    });

    // 1. Antes de reparar: Postgres rechaza con 22P02 → retry → corta el flush y traba todo
    await useOfflineQueueStore.getState().flushQueue();
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(3);
    expect(upserts).toHaveLength(0);

    // 2. Al iniciar la app se ejecuta repararSesionesNoUuid() → repara y flushea
    repararSesionesNoUuid();

    // Esperar a que termine flushQueue() disparado por repararSesionesNoUuid()
    await vi.waitFor(() => {
      expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    });

    const sesionUpserts = upserts.filter((u) => u.table === "registro_sesiones");
    const serieUpserts = upserts.filter((u) => u.table === "registro_series");

    expect(sesionUpserts).toHaveLength(3);
    expect(serieUpserts).toHaveLength(3);

    const repairedId1 = sesionUpserts[0]!.row.id as string;
    const repairedId2 = sesionUpserts[1]!.row.id as string;
    const behindId = sesionUpserts[2]!.row.id as string;

    expect(esUuid(repairedId1)).toBe(true);
    expect(repairedId2).toBe(repairedId1);
    expect(behindId).toBe(validUuidBehind);
  });

  it("AthleteShell ejecuta repararSesionesNoUuid al iniciar tras activarUsuarioStorage", () => {
    const shellSource = fs.readFileSync(
      path.resolve(__dirname, "../components/athlete/athlete-shell.tsx"),
      "utf-8",
    );
    expect(shellSource).toContain("repararSesionesNoUuid");
    const idxActivar = shellSource.indexOf("activarUsuarioStorage");
    const idxReparar = shellSource.indexOf("repararSesionesNoUuid()");
    expect(idxActivar).toBeGreaterThan(-1);
    expect(idxReparar).toBeGreaterThan(idxActivar);
  });
});
