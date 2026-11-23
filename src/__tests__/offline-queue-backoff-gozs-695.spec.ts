import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOfflineQueueStore, SYNC_REINTENTOS_AGOTADOS_MSG } from "@/store/use-offline-queue";
import { MOLESTIA_ENVIO_ERROR_MSG, useAthleteStore } from "@/store/use-athlete-store";
import { supabase } from "@/lib/supabase/client";
import { SYNC_MAX_REINTENTOS, crearBackoff, delayBackoff } from "@/lib/sync-backoff";
import { activarUsuarioStorage } from "@/lib/session-scope";

// GOZS-695 · Cola offline sin pérdidas silenciosas: un fallo transitorio
// (PGRST202 o red) se reintenta con backoff y nunca se descarta.

const ALUMNO = "00000000-0000-0000-0000-00000000000a";
const SESION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EJ_RUTINA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EJ_CATALOGO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const PGRST202 = {
  code: "PGRST202",
  message: "Could not find the function public.registrar_molestia",
};

const setEvent = (id: string) => ({
  id,
  action: "WORKOUT_SET_COMPLETED",
  payload: { sessionId: SESION, alumnoId: ALUMNO, ejercicioId: EJ_CATALOGO, setNumber: 1, pesoKg: 50, reps: 8 },
});

/** Avanza el reloj falso hasta el próximo reintento y deja correr sus promesas. */
async function avanzarIntento(intento: number) {
  await vi.advanceTimersByTimeAsync(delayBackoff(intento));
}

describe("GOZS-695 · backoff", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("delay exponencial con techo", () => {
    expect([0, 1, 2, 3, 4].map(delayBackoff)).toEqual([2000, 4000, 8000, 16000, 32000]);
    expect(delayBackoff(10)).toBe(60_000);
  });

  it("reprograma hasta agotar y recién ahí avisa", async () => {
    const onAgotado = vi.fn();
    let backoff: ReturnType<typeof crearBackoff>;
    const ejecutar = vi.fn(() => backoff.programar());
    backoff = crearBackoff(ejecutar, onAgotado);
    backoff.programar();
    for (let i = 0; i < SYNC_MAX_REINTENTOS; i++) await avanzarIntento(i);
    expect(ejecutar).toHaveBeenCalledTimes(SYNC_MAX_REINTENTOS);
    expect(onAgotado).toHaveBeenCalledTimes(1);
  });
});

describe("GOZS-695 · cola de series", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({ data: { user: { id: ALUMNO } as any }, error: null });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    ["PGRST202", PGRST202],
    ["red", { message: "Failed to fetch" }],
  ])("un fallo %s se reintenta solo con backoff y el evento se envía", async (_n, error) => {
    const upsert = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error })
      .mockResolvedValue({ data: null, error: null });
    vi.spyOn(supabase, "from").mockImplementation(() => ({ upsert }) as any);

    useOfflineQueueStore.getState().enqueueEvent(setEvent("e1"));
    await useOfflineQueueStore.getState().flushQueue();
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(1);
    expect(upsert).toHaveBeenCalledTimes(1);

    await avanzarIntento(0);
    expect(upsert).toHaveBeenCalledTimes(3); // sesión + serie
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    expect(useOfflineQueueStore.getState().syncError).toBeNull();
  });

  it("si sigue fallando, al agotar los reintentos avisa y el evento queda guardado", async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: PGRST202 });
    vi.spyOn(supabase, "from").mockImplementation(() => ({ upsert }) as any);

    useOfflineQueueStore.getState().enqueueEvent(setEvent("e1"));
    await useOfflineQueueStore.getState().flushQueue();
    for (let i = 0; i < SYNC_MAX_REINTENTOS; i++) {
      expect(useOfflineQueueStore.getState().syncError).toBeNull();
      await avanzarIntento(i);
    }

    expect(upsert).toHaveBeenCalledTimes(1 + SYNC_MAX_REINTENTOS);
    expect(useOfflineQueueStore.getState().syncError).toBe(SYNC_REINTENTOS_AGOTADOS_MSG);
    expect(useOfflineQueueStore.getState().pendingEvents.map((e) => e.id)).toEqual(["e1"]);

    // Sin más reintentos programados: el próximo disparo externo (reconexión) lo envía.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(upsert).toHaveBeenCalledTimes(1 + SYNC_MAX_REINTENTOS);
    upsert.mockResolvedValue({ data: null, error: null });
    await useOfflineQueueStore.getState().flushQueue();
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
  });
});

describe("GOZS-695 · QA r1: concurrencia, señal y ciclo de vida de timers", () => {
  let upsert: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({ data: { user: { id: ALUMNO } as any }, error: null });
    upsert = vi.fn().mockResolvedValue({ data: null, error: PGRST202 });
    vi.spyOn(supabase, "from").mockImplementation(() => ({ upsert }) as any);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** Encola, falla una vez y deja un reintento programado. */
  async function fallarYProgramar() {
    useOfflineQueueStore.getState().enqueueEvent(setEvent("e1"));
    await useOfflineQueueStore.getState().flushQueue();
    expect(upsert).toHaveBeenCalledTimes(1);
  }

  it("flushQueue concurrente no envía dos veces el mismo evento", async () => {
    upsert.mockResolvedValue({ data: null, error: null });
    useOfflineQueueStore.getState().enqueueEvent(setEvent("e1"));
    const { flushQueue } = useOfflineQueueStore.getState();
    await Promise.all([flushQueue(), flushQueue(), flushQueue()]);
    expect(upsert).toHaveBeenCalledTimes(2); // una sesión + una serie
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
  });

  it("al perder la señal se corta el reintento sin gastar intentos ni avisar", async () => {
    await fallarYProgramar();
    useOfflineQueueStore.getState().setOnlineStatus(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(useOfflineQueueStore.getState().syncError).toBeNull();
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(1);

    // Al volver la señal el contador arranca de cero: el primer reintento es a los 2s.
    useOfflineQueueStore.getState().setOnlineStatus(true);
    await useOfflineQueueStore.getState().flushQueue();
    await avanzarIntento(0);
    expect(upsert).toHaveBeenCalledTimes(3);
  });

  it("si el timer vence sin señal en el navegador no envía", async () => {
    await fallarYProgramar();
    vi.stubGlobal("navigator", { onLine: false });
    try {
      await avanzarIntento(0);
      expect(upsert).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("clearQueue corta el reintento pendiente", async () => {
    await fallarYProgramar();
    useOfflineQueueStore.getState().clearQueue();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(useOfflineQueueStore.getState().syncError).toBeNull();
  });

  it("cambiar de usuario corta los reintentos del anterior", async () => {
    await fallarYProgramar();
    await activarUsuarioStorage("00000000-0000-0000-0000-0000000000b2");
    useOfflineQueueStore.setState({ isOnline: true });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(useOfflineQueueStore.getState().syncError).toBeNull();
  });
});

describe("GOZS-695 · reporte de molestia", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.setState((prev) => ({
      molestiasPendientesFueraDeSesion: [],
      molestiaEnvioError: null,
      currentSession: { ...prev.currentSession, id: SESION, studentId: ALUMNO, molestias: [] },
    }));
    vi.spyOn(supabase.auth, "getUser").mockResolvedValue({ data: { user: { id: ALUMNO } as any }, error: null });
    vi.spyOn(supabase, "from").mockImplementation(
      () => ({ insert: vi.fn().mockResolvedValue({ data: null, error: null }) }) as any,
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const reportar = () =>
    useAthleteStore.getState().reportarMolestia({
      ejercicioEnRutinaId: EJ_RUTINA,
      ejercicioId: EJ_CATALOGO,
      zona: "HOMBRO",
      eva: 5,
    });

  it("tras un PGRST202 se reintenta con backoff y llega al coach", async () => {
    const rpc = vi
      .spyOn(supabase, "rpc")
      .mockResolvedValueOnce({ data: null, error: PGRST202 } as any)
      .mockResolvedValue({ data: null, error: null } as any);

    const molestia = await reportar();
    expect(molestia.envio).toBe("pendiente");

    await avanzarIntento(0);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]![1]).toMatchObject({ p_id: molestia.id });
    expect(useAthleteStore.getState().currentSession.molestias?.[0]?.envio).toBe("enviada");
    expect(useAthleteStore.getState().molestiaEnvioError).toBeNull();
  });

  it("sin señal se corta el reintento de la molestia y queda pendiente", async () => {
    const rpc = vi
      .spyOn(supabase, "rpc")
      .mockResolvedValue({ data: null, error: { message: "Failed to fetch" } } as any);
    await reportar();
    useOfflineQueueStore.getState().setOnlineStatus(false);
    await useAthleteStore.getState().flushMolestiasPendientes();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(useAthleteStore.getState().molestiaEnvioError).toBeNull();
    expect(useAthleteStore.getState().currentSession.molestias?.[0]?.envio).toBe("pendiente");
  });

  it("un error de red repetido agota los reintentos, avisa y la molestia sigue guardada", async () => {
    const rpc = vi
      .spyOn(supabase, "rpc")
      .mockResolvedValue({ data: null, error: { message: "Failed to fetch" } } as any);

    const molestia = await reportar();
    for (let i = 0; i < SYNC_MAX_REINTENTOS; i++) await avanzarIntento(i);

    expect(rpc).toHaveBeenCalledTimes(1 + SYNC_MAX_REINTENTOS);
    expect(useAthleteStore.getState().molestiaEnvioError).toBe(MOLESTIA_ENVIO_ERROR_MSG);
    expect(useAthleteStore.getState().currentSession.molestias).toEqual([
      expect.objectContaining({ id: molestia.id, envio: "pendiente" }),
    ]);
  });
});
