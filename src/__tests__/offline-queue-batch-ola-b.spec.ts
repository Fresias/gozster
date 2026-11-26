import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GOZS-884 (Ola B): cola batch por sessionId, merge semántico, fallback fila a fila,
// durabilidad de finalizar entrenamiento (WORKOUT_SESSION_COMPLETED), poda por snapshot
// exacto de event.id y presión de localStorage (partialize ≤ 20 sesiones).

type Llamada = {
  table: string;
  op: "upsert" | "update";
  payload: unknown;
  eqs?: [string, unknown][];
};
const llamadas: Llamada[] = [];
let errorPara: (table: string, payload: unknown) => { code?: string; message: string } | null = () => null;
const getUser = vi.fn(async () => ({ data: { user: { id: "u-auth" } } }));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: { getUser: () => getUser() },
    from: (table: string) => ({
      upsert: async (payload: unknown) => {
        llamadas.push({ table, op: "upsert", payload });
        return { error: errorPara(table, payload) };
      },
      update: (payload: unknown) => {
        const llamada: Llamada = { table, op: "update", payload, eqs: [] };
        llamadas.push(llamada);
        const chain = {
          eq: (col: string, val: unknown) => {
            llamada.eqs!.push([col, val]);
            return chain;
          },
          then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
        };
        return chain;
      },
    }),
  },
}));

vi.mock("@/lib/sound", async (orig) => ({
  ...(await orig<typeof import("@/lib/sound")>()),
  playRestTimerAlert: vi.fn(),
  triggerHapticVibration: vi.fn(),
}));

import {
  claveSerieSintetica,
  resetBackoffCola,
  sesionesConPendientes,
  useOfflineQueueStore,
  type OfflineSyncEvent,
} from "@/store/use-offline-queue";
import {
  acotarHistorialPersistido,
  MAX_HISTORIAL_PERSISTIDO,
  useAthleteStore,
  type LiveWorkoutSession,
} from "@/store/use-athlete-store";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";

const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const ALUMNO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EJ = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SERIE_UUID = "99999999-9999-4999-8999-999999999999";

const queue = () => useOfflineQueueStore.getState();
const set = (
  id: string,
  n: number,
  extra: Record<string, unknown> = {},
  action = "WORKOUT_SET_COMPLETED",
): Omit<OfflineSyncEvent, "createdAt"> => ({
  id,
  action,
  payload: { sessionId: S1, alumnoId: ALUMNO, diaId: "d1", ejercicioId: EJ, setNumber: n, pesoKg: 50, reps: 8, ...extra },
});
const completada = (sessionId = S1, extra: Record<string, unknown> = {}) => ({
  id: `session-completed-${sessionId}`,
  action: "WORKOUT_SESSION_COMPLETED",
  payload: {
    sessionId,
    alumnoId: ALUMNO,
    diaId: "d1",
    diaSugeridoId: "d0",
    motivoCambioDia: "CANSANCIO_DEPORTE",
    duracionMinutos: 47,
    estado: "COMPLETADA",
    finalizadaAt: "2026-11-26T18:00:00.000Z",
    ...extra,
  },
});
const series = () =>
  llamadas
    .filter((l) => l.table === "registro_series" && l.op === "upsert")
    .flatMap((l) => [l.payload].flat() as Record<string, unknown>[]);

describe("GOZS-884 · Ola B · cola batch por sesión", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    llamadas.length = 0;
    errorPara = () => null;
    getUser.mockClear();
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
  });
  afterEach(() => {
    resetBackoffCola();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("GIVEN un entrenamiento finalizado offline con N series y la PWA reabierta WHEN corre flushQueue THEN sube cabecera + series en 2 RTTs con merge semántico y 1 solo removeEvents", async () => {
    queue().enqueueEvent({
      id: "cambio-1",
      action: "CAMBIO_DIA_REGISTRADO",
      payload: { sessionId: S1, alumnoId: ALUMNO, diaElegidoId: "d1", diaSugeridoId: "d0", motivoCambioDia: "CANSANCIO_DEPORTE" },
    });
    queue().enqueueEvent(
      set("a", 1, { rpe: 9, setType: "WARMUP", painReported: true, painNotes: "hombro", videoUrl: "https://v/1" }),
    );
    queue().enqueueEvent(set("b", 2));
    queue().enqueueEvent(set("c", 3));
    queue().enqueueEvent(set("a-edit", 1, { pesoKg: 62.5, reps: 5 }, "WORKOUT_SET_UPDATED"));
    queue().enqueueEvent(completada());
    const removeEvents = vi.spyOn(queue(), "removeEvents");

    await queue().flushQueue();

    expect(llamadas.map((l) => l.table)).toEqual(["registro_sesiones", "registro_series"]);
    expect(llamadas[0]!.payload).toEqual({
      id: S1,
      alumno_id: ALUMNO,
      dia_id: "d1",
      dia_sugerido_id: "d0",
      motivo_cambio_dia: "CANSANCIO_DEPORTE",
      duracion_minutos: 47,
      estado: "COMPLETADA",
      finalizada_at: "2026-11-26T18:00:00.000Z",
    });
    expect(Array.isArray(llamadas[1]!.payload)).toBe(true);
    expect(series()).toHaveLength(3);
    // Merge semántico: la edición cambia peso/reps y preserva rpe, tipo, dolor y video.
    expect(series()[0]).toEqual({
      sesion_id: S1,
      ejercicio_id: EJ,
      numero_serie: 1,
      peso_kg: 62.5,
      reps_hechas: 5,
      rpe_real: 9,
      completada: true,
      set_type: "WARMUP",
      pain_reported: true,
      pain_notes: "hombro",
      video_url: "https://v/1",
    });
    expect(removeEvents).toHaveBeenCalledTimes(1);
    expect(queue().pendingEvents).toEqual([]);
    expect(queue().syncError).toBeNull();
  });

  it("un entrenamiento de 0 series finalizado offline sube la cabecera completa sin tocar registro_series", async () => {
    queue().enqueueEvent(completada());
    await queue().flushQueue();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({
      table: "registro_sesiones",
      payload: { id: S1, duracion_minutos: 47, estado: "COMPLETADA", motivo_cambio_dia: "CANSANCIO_DEPORTE" },
    });
    expect(queue().pendingEvents).toEqual([]);
  });

  it("la cabecera fusionada no envía undefined (solo los campos que traen los eventos)", async () => {
    queue().enqueueEvent(set("a", 1));
    await queue().flushQueue();
    expect(llamadas[0]!.payload).toEqual({ id: S1, alumno_id: ALUMNO, dia_id: "d1" });
    expect(Object.values(llamadas[0]!.payload as object)).not.toContain(undefined);
  });

  it.each(["23514", "23503"])(
    "GIVEN un lote de 3 series donde la #2 viola %s WHEN corre flushQueue THEN el fallback fila a fila guarda #1 y #3 y descarta solo la #2 con syncError",
    async (code) => {
      errorPara = (table, payload) => {
        if (table !== "registro_series") return null;
        const filas = [payload].flat() as { numero_serie: number }[];
        return filas.some((f) => f.numero_serie === 2) ? { code, message: "violación" } : null;
      };
      ["a", "b", "c"].forEach((id, i) => queue().enqueueEvent(set(id, i + 1)));
      await queue().flushQueue();

      const guardadas = llamadas
        .filter((l) => l.table === "registro_series" && !Array.isArray(l.payload))
        .map((l) => (l.payload as { numero_serie: number }).numero_serie);
      expect(guardadas).toEqual([1, 2, 3]); // intentos fila a fila
      expect(queue().pendingEvents).toEqual([]);
      expect(queue().syncError).toBe("No pudimos guardar una serie. Avisá a tu coach.");
    },
  );

  it("una edición sin registro previo en la cola viaja en un lote parcial separado (no pisa rpe/tipo/dolor/video)", async () => {
    queue().enqueueEvent(set("a", 1));
    queue().enqueueEvent(set("x-edit", 4, { pesoKg: 70, reps: 3 }, "WORKOUT_SET_UPDATED"));
    await queue().flushQueue();
    const lotes = llamadas.filter((l) => l.table === "registro_series");
    expect(lotes).toHaveLength(2);
    expect(lotes[1]!.payload).toEqual([
      { sesion_id: S1, ejercicio_id: EJ, numero_serie: 4, peso_kg: 70, reps_hechas: 3 },
    ]);
    expect(queue().pendingEvents).toEqual([]);
  });

  it("ante un fallo de red en el lote de series conserva las series (y poda la cabecera ya confirmada)", async () => {
    errorPara = (table) => (table === "registro_series" ? { message: "network" } : null);
    queue().enqueueEvent(set("a", 1));
    queue().enqueueEvent(completada());
    await queue().flushQueue();
    expect(queue().pendingEvents.map((e) => e.id)).toEqual(["a"]);
    expect(queue().syncError).toBeNull();
  });

  it("agrupa por sessionId: 2 sesiones = 4 RTTs y auth.getUser() se consulta 1 sola vez por corrida", async () => {
    const sinAlumno = (id: string, sid: string, n: number) => {
      const ev = set(id, n, { sessionId: sid });
      delete (ev.payload as Record<string, unknown>).alumnoId;
      return ev;
    };
    queue().enqueueEvent(sinAlumno("a", S1, 1));
    queue().enqueueEvent(sinAlumno("b", S2, 1));
    queue().enqueueEvent(sinAlumno("c", S1, 2));
    await queue().flushQueue();
    expect(llamadas.map((l) => l.table)).toEqual([
      "registro_sesiones",
      "registro_series",
      "registro_sesiones",
      "registro_series",
    ]);
    expect((llamadas[0]!.payload as { alumno_id: string }).alumno_id).toBe("u-auth");
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(queue().pendingEvents).toEqual([]);
  });

  it("HISTORIAL_SERIE_UPDATED se compacta por serie y envía solo la última edición (UUID)", async () => {
    queue().enqueueEvent({
      id: "h1",
      action: "HISTORIAL_SERIE_UPDATED",
      payload: { sesionId: S1, serieId: SERIE_UUID, pesoKg: 40, repsHechas: 10 },
    });
    queue().enqueueEvent({
      id: "h2",
      action: "HISTORIAL_SERIE_UPDATED",
      payload: { sesionId: S1, serieId: SERIE_UUID, pesoKg: 45, repsHechas: 9 },
    });
    await queue().flushQueue();
    const updates = llamadas.filter((l) => l.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.payload).toMatchObject({ peso_kg: 45, reps_hechas: 9 });
    expect(updates[0]!.eqs).toEqual([["id", SERIE_UUID]]);
    expect(queue().pendingEvents).toEqual([]);
  });

  it("HISTORIAL_SERIE_UPDATED con id sintético ser-... actualiza por clave compuesta (sesion_id, ejercicio_id, numero_serie)", async () => {
    const serieId = `ser-${S1}-${EJ}-3`;
    expect(claveSerieSintetica(serieId)).toEqual({ sesionId: S1, ejercicioId: EJ, numeroSerie: 3 });
    queue().enqueueEvent({
      id: "h1",
      action: "HISTORIAL_SERIE_UPDATED",
      payload: { sesionId: S1, serieId, pesoKg: 55, repsHechas: 7 },
    });
    await queue().flushQueue();
    const updates = llamadas.filter((l) => l.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.eqs).toEqual([
      ["sesion_id", S1],
      ["ejercicio_id", EJ],
      ["numero_serie", 3],
    ]);
    expect(queue().pendingEvents).toEqual([]);
  });

  it("expone isFlushing/syncingSeriesCount efímeros durante la corrida y no los persiste", async () => {
    queue().enqueueEvent(set("a", 1));
    queue().enqueueEvent(set("b", 2));
    let visto: { isFlushing: boolean; syncingSeriesCount: number } | null = null;
    errorPara = () => {
      visto ??= { isFlushing: queue().isFlushing, syncingSeriesCount: queue().syncingSeriesCount };
      return null;
    };
    await queue().flushQueue();
    expect(visto).toEqual({ isFlushing: true, syncingSeriesCount: 2 });
    expect(queue().isFlushing).toBe(false);
    expect(queue().syncingSeriesCount).toBe(0);
    const persistido = useOfflineQueueStore.persist.getOptions().partialize!(queue()) as object;
    expect(Object.keys(persistido)).not.toContain("isFlushing");
    expect(Object.keys(persistido)).not.toContain("syncingSeriesCount");
  });

  it("sesionesConPendientes reconoce sessionId y sesionId", () => {
    expect(
      sesionesConPendientes([
        { id: "1", action: "WORKOUT_SET_COMPLETED", payload: { sessionId: S1 }, createdAt: "" },
        { id: "2", action: "HISTORIAL_SERIE_UPDATED", payload: { sesionId: S2 }, createdAt: "" },
        { id: "3", action: "ENVIAR_MENSAJE_CHAT", payload: {}, createdAt: "" },
      ]),
    ).toEqual(new Set([S1, S2]));
  });
});

describe("GOZS-884 · Ola B · finalizar entrenamiento duradero y poda por snapshot", () => {
  const sesion = (): LiveWorkoutSession => ({
    id: S1,
    nombre_rutina: "Rutina",
    fecha: "2026-11-26",
    studentId: ALUMNO,
    dia_id: "d1",
    dia_sugerido_id: "d0",
    motivo_cambio_dia: "CANSANCIO_DEPORTE",
    ejercicios: [
      {
        id: "er-1",
        ejercicio_id: EJ,
        nombre: "Sentadilla",
        musculos_principales: [],
        descanso_segundos: 90,
        rpe_objetivo: 8,
        repeticiones_objetivo: "8",
        series: [{ numero_serie: 1, peso_kg: 100, reps_hechas: 5, rpe_real: 8, completada: true, estimated1RM: 115 }],
      },
    ],
  } as LiveWorkoutSession);

  let cargarMiProgreso: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    llamadas.length = 0;
    errorPara = () => null;
    useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null });
    cargarMiProgreso = vi.fn(async () => undefined);
    useAthleteStore.setState({
      currentSession: sesion(),
      diaActivoId: "d1",
      historialSesiones: [],
      sesionesCompletadas: [],
      sessionStartedAt: Date.now() - 47 * 60_000,
      syncingSessionId: null,
      cargarMiProgreso,
    } as never);
  });
  afterEach(() => {
    resetBackoffCola();
    vi.useRealTimers();
  });

  it("marcarDiaCompletado encola WORKOUT_SESSION_COMPLETED idempotente con la cabecera completa", () => {
    useAthleteStore.getState().marcarDiaCompletado("d1", { omitirRecargaProgreso: true });
    useAthleteStore.getState().marcarDiaCompletado("d1", { omitirRecargaProgreso: true });
    const eventos = queue().pendingEvents.filter((e) => e.action === "WORKOUT_SESSION_COMPLETED");
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.id).toBe(`session-completed-${S1}`);
    expect(eventos[0]!.payload).toMatchObject({
      sessionId: S1,
      alumnoId: ALUMNO,
      diaId: "d1",
      diaSugeridoId: "d0",
      motivoCambioDia: "CANSANCIO_DEPORTE",
      duracionMinutos: 47,
      estado: "COMPLETADA",
    });
    expect(typeof eventos[0]!.payload.finalizadaAt).toBe("string");
  });

  it("con omitirRecargaProgreso no dispara cargarMiProgreso en t = 0 ms; sin la opción sí", async () => {
    useAthleteStore.getState().marcarDiaCompletado("d1", { omitirRecargaProgreso: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(cargarMiProgreso).not.toHaveBeenCalled();

    useAthleteStore.setState({ historialSesiones: [], sesionesCompletadas: [] });
    useAthleteStore.getState().marcarDiaCompletado("d1");
    await vi.advanceTimersByTimeAsync(0);
    expect(cargarMiProgreso).toHaveBeenCalledTimes(1);
  });

  it("syncSessionToSupabase envía estado COMPLETADA + finalizada_at, poda por id exacto (snapshot) y recarga miProgreso 1 vez", async () => {
    queue().enqueueEvent(set("serie-1", 1));
    queue().enqueueEvent({
      id: "cambio-1",
      action: "CAMBIO_DIA_REGISTRADO",
      payload: { sessionId: S1, alumnoId: ALUMNO, diaElegidoId: "d1", diaSugeridoId: "d0" },
    });
    useAthleteStore.getState().marcarDiaCompletado("d1", { omitirRecargaProgreso: true });
    const finalizadaAt = queue().pendingEvents.find((e) => e.action === "WORKOUT_SESSION_COMPLETED")!.payload
      .finalizadaAt;

    const promesa = useAthleteStore.getState().syncSessionToSupabase();
    expect(useAthleteStore.getState().syncingSessionId).toBe(S1);
    // Evento que entra en vuelo (p. ej. un video): no está en el snapshot y se conserva.
    queue().enqueueEvent(set("en-vuelo", 1, { videoUrl: "https://v" }));
    await expect(promesa).resolves.toEqual({ success: true });

    expect(llamadas[0]).toMatchObject({
      table: "registro_sesiones",
      payload: { id: S1, estado: "COMPLETADA", finalizada_at: finalizadaAt, duracion_minutos: 47 },
    });
    // El evento en vuelo no se podó: viaja después por la cola (flush en segundo plano).
    await queue().flushQueue();
    expect(series().filter((r) => r.video_url === "https://v")).toHaveLength(1);
    expect(queue().pendingEvents).toEqual([]);
    expect(useAthleteStore.getState().syncingSessionId).toBeNull();
    expect(cargarMiProgreso).toHaveBeenCalledTimes(1);
  });

  it("repararSesionesNoUuid también repara WORKOUT_SESSION_COMPLETED y CAMBIO_DIA_REGISTRADO", async () => {
    const { repararSesionesNoUuid } = await import("@/store/use-athlete-store");
    useOfflineQueueStore.setState({ isOnline: false });
    queue().enqueueEvent(completada("session-viejo-1"));
    queue().enqueueEvent({
      id: "cambio-viejo",
      action: "CAMBIO_DIA_REGISTRADO",
      payload: { sessionId: "session-viejo-1", diaElegidoId: "d1" },
    });
    repararSesionesNoUuid();
    const ids = queue().pendingEvents.map((e) => e.payload.sessionId as string);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toBe(ids[0]);
  });
});

describe("GOZS-884 · Ola B · presión de localStorage (partialize ≤ 20 sesiones)", () => {
  const entrada = (i: number): HistoricalLoadEntry =>
    ({
      sesion: { id: `ses-${i}`, fecha: new Date(Date.UTC(2026, 9, 1) + (60 - i) * 86_400_000).toISOString() },
      series: [],
    }) as unknown as HistoricalLoadEntry;

  it("GIVEN 60 sesiones con 1 pendiente fuera del top 20 THEN persiste 20 incluyendo obligatoriamente la pendiente", () => {
    const historial = Array.from({ length: 60 }, (_, i) => entrada(i));
    const acotado = acotarHistorialPersistido(historial, new Set(["ses-45"]));
    expect(MAX_HISTORIAL_PERSISTIDO).toBe(20);
    expect(acotado).toHaveLength(20);
    expect(acotado.map((h) => h.sesion.id)).toContain("ses-45");
    expect(acotado.slice(0, 19).map((h) => h.sesion.id)).toEqual(historial.slice(0, 19).map((h) => h.sesion.id));
  });

  it("partialize del store usa la cola (guard defensivo) y la sesión en vuelo para proteger entradas", () => {
    useOfflineQueueStore.setState({
      pendingEvents: [{ id: "x", action: "WORKOUT_SET_COMPLETED", payload: { sessionId: "ses-50" }, createdAt: "" }],
    });
    useAthleteStore.setState({
      historialSesiones: Array.from({ length: 60 }, (_, i) => entrada(i)),
      syncingSessionId: "ses-59",
    });
    const persistido = useAthleteStore.persist.getOptions().partialize!(useAthleteStore.getState()) as {
      historialSesiones: HistoricalLoadEntry[];
      syncingSessionId?: unknown;
    };
    const ids = persistido.historialSesiones.map((h) => h.sesion.id);
    expect(ids).toHaveLength(20);
    expect(ids).toEqual(expect.arrayContaining(["ses-50", "ses-59"]));
    expect(persistido).not.toHaveProperty("syncingSessionId");
    // En RAM se conservan todas.
    expect(useAthleteStore.getState().historialSesiones).toHaveLength(60);
  });

  it("con ≤ 20 sesiones devuelve la misma referencia (sin copias)", () => {
    const historial = Array.from({ length: 5 }, (_, i) => entrada(i));
    expect(acotarHistorialPersistido(historial, new Set())).toBe(historial);
  });
});
