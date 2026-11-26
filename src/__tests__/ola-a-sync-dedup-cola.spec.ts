import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase/client";
import { setStorageUser } from "@/lib/user-storage";
import { useAthleteStore, type LiveWorkoutSession } from "@/store/use-athlete-store";
import { useOfflineQueueStore, type OfflineSyncEvent } from "@/store/use-offline-queue";

// GOZS-881 · Ola A: guardado batch al finalizar entrenamiento sin re-envío redundante,
// timeout de 6.000 ms (6 s), anti-zombi en la cola y dedup de cargarMiProgreso.

const ALUMNO_ID = "11111111-1111-4111-8111-111111111111";
const DIA_ID = "22222222-2222-4222-8222-222222222222";
const S1 = "44444444-4444-4444-8444-444444444441";
const OTRA_SESION = "44444444-4444-4444-8444-444444444449";
const ejCatalogo = (i: number) => `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`;

const originalCargarMiProgreso = useAthleteStore.getState().cargarMiProgreso;
const originalFlushQueue = useOfflineQueueStore.getState().flushQueue;

/** Sesión con `ejercicios` x `seriesPorEj` series completadas. */
function sesionCompleta(ejercicios: number, seriesPorEj: number): LiveWorkoutSession {
  const ahora = Date.now();
  return {
    id: S1,
    nombre_rutina: "Fuerza: Día 1",
    fecha: "2026-11-26",
    studentId: ALUMNO_ID,
    dia_id: DIA_ID,
    molestias: [],
    ejercicios: Array.from({ length: ejercicios }, (_, e) => ({
      id: `er-${e + 1}`,
      ejercicio_id: ejCatalogo(e + 1),
      nombre: `Ejercicio ${e + 1}`,
      musculos_principales: ["Piernas"],
      descanso_segundos: 90,
      rpe_objetivo: 8,
      repeticiones_objetivo: "8",
      series: Array.from({ length: seriesPorEj }, (_, s) => ({
        numero_serie: s + 1,
        peso_kg: 50 + s,
        reps_hechas: 8,
        rpe_real: 8,
        completada: true,
        estimated1RM: 60,
        completedAt: new Date(ahora - 30 * 60_000 + s * 60_000).toISOString(),
      })),
    })),
  };
}

function eventoSerie(
  id: string,
  opts: { sessionId?: string; exerciseId?: string; ejercicioId: string; setNumber: number },
  action = "WORKOUT_SET_COMPLETED",
): OfflineSyncEvent {
  return {
    id,
    action,
    payload: {
      sessionId: opts.sessionId ?? S1,
      alumnoId: ALUMNO_ID,
      diaId: DIA_ID,
      ejercicioId: opts.ejercicioId,
      ...(opts.exerciseId ? { exerciseId: opts.exerciseId } : {}),
      setNumber: opts.setNumber,
      pesoKg: 50,
      reps: 8,
    },
    createdAt: new Date().toISOString(),
  };
}

const eventoChat: OfflineSyncEvent = {
  id: "chat-1",
  action: "ENVIAR_MENSAJE_CHAT",
  payload: { alumno_id: ALUMNO_ID, contenido: "Hola coach" },
  createdAt: new Date().toISOString(),
};

type Llamada = { table: string; payload: unknown; opts: unknown };

/** Mock de supabase.from: upsert devuelve una Promise plana (como los mocks existentes). */
function mockUpserts(resultado: (table: string, payload: unknown) => Promise<{ error: unknown }>) {
  const llamadas: Llamada[] = [];
  const fromSpy = vi.spyOn(supabase, "from").mockImplementation(((table: string) => ({
    upsert: vi.fn().mockImplementation((payload: unknown, opts: unknown) => {
      llamadas.push({ table, payload, opts });
      return resultado(table, payload);
    }),
  })) as any);
  return { llamadas, fromSpy };
}

function contarSetsCola() {
  let n = 0;
  const unsub = useOfflineQueueStore.subscribe(() => {
    n += 1;
  });
  return { get: () => n, unsub };
}

describe("GOZS-881 · Ola A: guardado batch, timeout, anti-zombi y dedup MiProgreso", () => {
  let cargarMiProgresoMock: ReturnType<typeof vi.fn>;
  let flushQueueMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setStorageUser(null);
    vi.restoreAllMocks();
    cargarMiProgresoMock = vi.fn().mockResolvedValue(undefined);
    flushQueueMock = vi.fn().mockResolvedValue(undefined);
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
      flushQueue: flushQueueMock as any,
    });
    useAthleteStore.getState().resetSessionToDefaults();
    useAthleteStore.setState({
      planAlumno: null,
      sesionesCompletadas: [],
      historialSesiones: [],
      toastSesion: null,
      sessionStartedAt: Date.now() - 40 * 60_000,
      cargarMiProgreso: cargarMiProgresoMock as any,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis.navigator as { onLine?: boolean }).onLine;
    vi.restoreAllMocks();
    useOfflineQueueStore.setState({ flushQueue: originalFlushQueue });
    useAthleteStore.setState({ cargarMiProgreso: originalCargarMiProgreso });
    setStorageUser(null);
  });

  describe("removeEvents (cola offline)", () => {
    it("sin ids o sin coincidencias no escribe; con coincidencias poda en 1 solo set()", () => {
      useOfflineQueueStore.setState({
        pendingEvents: [eventoChat, eventoSerie("a", { ejercicioId: ejCatalogo(1), setNumber: 1 })],
      });
      const sets = contarSetsCola();
      useOfflineQueueStore.getState().removeEvents([]);
      useOfflineQueueStore.getState().removeEvents(["no-existe"]);
      expect(sets.get()).toBe(0);
      useOfflineQueueStore.getState().removeEvents(["a", "chat-1", "no-existe"]);
      expect(sets.get()).toBe(1);
      expect(useOfflineQueueStore.getState().pendingEvents).toEqual([]);
      sets.unsub();
    });
  });

  describe("syncSessionToSupabase", () => {
    it("GIVEN 26 series + 2 ediciones en cola WHEN finaliza THEN 2 upserts, poda los 28 en 1 set() y no reenvía con flushQueue", async () => {
      const sesion = sesionCompleta(13, 2); // 26 series
      useAthleteStore.setState({ currentSession: sesion });
      const eventos: OfflineSyncEvent[] = [];
      sesion.ejercicios.forEach((ej) =>
        ej.series.forEach((s) =>
          eventos.push(
            eventoSerie(`set-${ej.id}-${s.numero_serie}`, {
              exerciseId: ej.id,
              ejercicioId: ej.ejercicio_id!,
              setNumber: s.numero_serie,
            }),
          ),
        ),
      );
      eventos.push(
        eventoSerie("edit-1", { exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 1 }, "WORKOUT_SET_UPDATED"),
        eventoSerie("edit-2", { exerciseId: "er-2", ejercicioId: ejCatalogo(2), setNumber: 2 }, "WORKOUT_SET_UPDATED"),
      );
      expect(eventos).toHaveLength(28);
      useOfflineQueueStore.setState({ pendingEvents: eventos });

      const { llamadas } = mockUpserts(async () => ({ error: null }));
      const sets = contarSetsCola();
      const res = await useAthleteStore.getState().syncSessionToSupabase();
      sets.unsub();

      expect(res).toEqual({ success: true });
      expect(llamadas.map((l) => l.table)).toEqual(["registro_sesiones", "registro_series"]);
      expect(llamadas[1]!.opts).toEqual({ onConflict: "sesion_id,ejercicio_id,numero_serie" });
      expect((llamadas[1]!.payload as unknown[]).length).toBe(26);
      expect(useOfflineQueueStore.getState().pendingEvents).toEqual([]);
      expect(sets.get()).toBe(1);
      expect(flushQueueMock).not.toHaveBeenCalled();
      expect(cargarMiProgresoMock).toHaveBeenCalledTimes(1);
      expect(cargarMiProgresoMock).toHaveBeenCalledWith({ forceRefresh: true });
    });

    it("GIVEN eventos de S1 + chat y entra un evento de S1 en vuelo WHEN termina OK THEN solo poda el snapshot y flushQueue corre en background", async () => {
      useAthleteStore.setState({ currentSession: sesionCompleta(1, 2) });
      useOfflineQueueStore.setState({
        pendingEvents: [
          eventoSerie("s1-a", { exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 1 }),
          eventoChat,
          eventoSerie("s1-b", { exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 2 }),
        ],
      });
      // flushQueue nunca resuelve: si se esperara, syncSessionToSupabase quedaría colgado.
      flushQueueMock.mockReturnValue(new Promise(() => undefined));
      mockUpserts(async (table) => {
        if (table === "registro_sesiones") {
          useOfflineQueueStore.getState().enqueueEvent({
            ...eventoSerie("s1-video", { exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 1 }),
          });
        }
        return { error: null };
      });

      const res = await useAthleteStore.getState().syncSessionToSupabase();

      expect(res).toEqual({ success: true });
      expect(useOfflineQueueStore.getState().pendingEvents.map((e) => e.id)).toEqual([
        "chat-1",
        "s1-video",
      ]);
      expect(flushQueueMock).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["isOnline === false", () => useOfflineQueueStore.setState({ isOnline: false })],
      [
        "navigator.onLine === false",
        () => Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true }),
      ],
    ])("GIVEN %s WHEN finaliza THEN 0 HTTP, falla rápido, conserva la cola y no setea syncError", async (_, sinSenal) => {
      useAthleteStore.setState({ currentSession: sesionCompleta(1, 2) });
      const eventos = [eventoSerie("s1-a", { exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 1 })];
      useOfflineQueueStore.setState({ pendingEvents: eventos });
      sinSenal();
      const { fromSpy } = mockUpserts(async () => ({ error: null }));

      const t0 = performance.now();
      const res = await useAthleteStore.getState().syncSessionToSupabase();
      const ms = performance.now() - t0;

      expect(res.success).toBe(false);
      expect(res.error).toBeTruthy();
      expect(ms).toBeLessThan(10);
      expect(fromSpy).not.toHaveBeenCalled();
      expect(useOfflineQueueStore.getState().pendingEvents).toEqual(eventos);
      expect(useOfflineQueueStore.getState().syncError).toBeNull();
      expect(flushQueueMock).not.toHaveBeenCalled();
      expect(cargarMiProgresoMock).not.toHaveBeenCalled();

      // Al volver la señal, el rechazo offline no queda cacheado: el siguiente intento guarda.
      useOfflineQueueStore.setState({ isOnline: true });
      delete (globalThis.navigator as { onLine?: boolean }).onLine;
      await expect(useAthleteStore.getState().syncSessionToSupabase()).resolves.toEqual({ success: true });
      expect(useOfflineQueueStore.getState().pendingEvents).toEqual([]);
    });

    it("GIVEN error en registro_sesiones WHEN finaliza THEN corta sin subir series, sin podar ni recargar", async () => {
      useAthleteStore.setState({ currentSession: sesionCompleta(1, 2) });
      const eventos = [eventoSerie("s1-a", { exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 1 })];
      useOfflineQueueStore.setState({ pendingEvents: eventos });
      const { llamadas } = mockUpserts(async (table) =>
        table === "registro_sesiones" ? { error: { message: "RLS sesiones" } } : { error: null },
      );

      const res = await useAthleteStore.getState().syncSessionToSupabase();

      expect(res).toEqual({ success: false, error: "RLS sesiones" });
      expect(llamadas.map((l) => l.table)).toEqual(["registro_sesiones"]);
      expect(useOfflineQueueStore.getState().pendingEvents).toEqual(eventos);
      expect(flushQueueMock).not.toHaveBeenCalled();
      expect(cargarMiProgresoMock).not.toHaveBeenCalled();
    });

    it("GIVEN error en registro_series WHEN finaliza THEN corta sin podar ni recargar", async () => {
      useAthleteStore.setState({ currentSession: sesionCompleta(1, 2) });
      const eventos = [eventoSerie("s1-a", { exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 1 })];
      useOfflineQueueStore.setState({ pendingEvents: eventos });
      mockUpserts(async (table) =>
        table === "registro_series" ? { error: { message: "FK series" } } : { error: null },
      );

      const res = await useAthleteStore.getState().syncSessionToSupabase();

      expect(res).toEqual({ success: false, error: "FK series" });
      expect(useOfflineQueueStore.getState().pendingEvents).toEqual(eventos);
      expect(flushQueueMock).not.toHaveBeenCalled();
      expect(cargarMiProgresoMock).not.toHaveBeenCalled();
    });

    it("GIVEN una petición colgada (builder con abortSignal) WHEN vencen 6.000 ms (6 s) THEN aborta y conserva la cola", async () => {
      vi.useFakeTimers();
      useAthleteStore.setState({ currentSession: sesionCompleta(1, 2) });
      const eventos = [eventoSerie("s1-a", { exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 1 })];
      useOfflineQueueStore.setState({ pendingEvents: eventos });
      const senales: AbortSignal[] = [];
      vi.spyOn(supabase, "from").mockImplementation((() => ({
        upsert: () => ({
          abortSignal: (signal: AbortSignal) => {
            senales.push(signal);
            return new Promise(() => undefined);
          },
        }),
      })) as any);

      const pendiente = useAthleteStore.getState().syncSessionToSupabase();
      await vi.advanceTimersByTimeAsync(5_999);
      expect(senales[0]?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const res = await pendiente;

      expect(senales).toHaveLength(1);
      expect(senales[0]!.aborted).toBe(true);
      expect(res.success).toBe(false);
      expect(res.error).toBeTruthy();
      expect(useOfflineQueueStore.getState().pendingEvents).toEqual(eventos);
      expect(flushQueueMock).not.toHaveBeenCalled();
    });

    it("GIVEN un mock sin abortSignal que nunca resuelve WHEN vencen 6.000 ms (6 s) THEN resuelve con error (fallback seguro)", async () => {
      vi.useFakeTimers();
      useAthleteStore.setState({ currentSession: sesionCompleta(1, 2) });
      mockUpserts(() => new Promise(() => undefined));

      const pendiente = useAthleteStore.getState().syncSessionToSupabase();
      await vi.advanceTimersByTimeAsync(6_000);
      const res = await pendiente;

      expect(res.success).toBe(false);
      expect(res.error).toBeTruthy();
    });

    it("GIVEN sessionStartedAt === null y la sesión ya en historial WHEN se re-sincroniza THEN conserva duracion_minutos previa", async () => {
      useAthleteStore.setState({ currentSession: sesionCompleta(1, 2) });
      useAthleteStore.getState().marcarDiaCompletado(DIA_ID);
      const previa = useAthleteStore.getState().historialSesiones[0]!.sesion.duracion_minutos;
      expect(previa).toBe(40);
      expect(useAthleteStore.getState().sessionStartedAt).toBeNull();

      const { llamadas } = mockUpserts(async () => ({ error: null }));
      await useAthleteStore.getState().syncSessionToSupabase();

      expect((llamadas[0]!.payload as { duracion_minutos: number }).duracion_minutos).toBe(previa);
    });
  });

  describe("cargarMiProgreso (dedup in-flight)", () => {
    it("GIVEN 3 llamadas concurrentes y una 4ª con forceRefresh WHEN se resuelven THEN 0 corridas en paralelo y 1 solo refresco secuencial", async () => {
      useAthleteStore.setState({ cargarMiProgreso: originalCargarMiProgreso });
      let activas = 0;
      let maxActivas = 0;
      const resolvers: Array<() => void> = [];
      const getUserSpy = vi.spyOn(supabase.auth, "getUser").mockImplementation((() => {
        activas += 1;
        maxActivas = Math.max(maxActivas, activas);
        return new Promise((ok) => {
          resolvers.push(() => ok({ data: { user: { id: ALUMNO_ID } }, error: null }));
        });
      }) as any);
      // Una corrida queda "activa" desde getUser hasta que resuelve su consulta de sesiones.
      vi.spyOn(supabase, "from").mockImplementation(((table: string) => {
        const cadena: Record<string, unknown> = {};
        for (const m of ["select", "eq", "gte", "or", "order", "limit", "in"]) cadena[m] = () => cadena;
        cadena.then = (ok: (r: unknown) => unknown) => {
          if (table === "registro_sesiones") activas -= 1;
          return Promise.resolve(ok({ data: [] }));
        };
        return cadena;
      }) as any);
      const { cargarMiProgreso } = useAthleteStore.getState();

      const p1 = cargarMiProgreso();
      const p2 = cargarMiProgreso();
      const p3 = cargarMiProgreso();
      const p4 = cargarMiProgreso({ forceRefresh: true });
      expect(getUserSpy).toHaveBeenCalledTimes(1);

      resolvers.shift()!();
      await vi.waitFor(() => expect(getUserSpy).toHaveBeenCalledTimes(2));
      resolvers.shift()!();
      await Promise.all([p1, p2, p3, p4]);

      expect(getUserSpy).toHaveBeenCalledTimes(2);
      expect(maxActivas).toBe(1);
      expect(useAthleteStore.getState().cargandoMiProgreso).toBe(false);

      // Sin corrida en vuelo, una nueva llamada abre exactamente 1 corrida más.
      const p5 = cargarMiProgreso();
      await vi.waitFor(() => expect(resolvers).toHaveLength(1));
      resolvers.shift()!();
      await p5;
      expect(getUserSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("marcarDiaCompletado (idempotencia)", () => {
    it("GIVEN auto-finalización (2 llamadas seguidas) WHEN corre la 2ª sin cambios THEN es no-op y preserva duracion_minutos al editar luego", async () => {
      vi.useFakeTimers();
      useAthleteStore.setState({ currentSession: sesionCompleta(2, 2) });

      useAthleteStore.getState().marcarDiaCompletado(DIA_ID);
      const hist1 = useAthleteStore.getState().historialSesiones;
      expect(hist1).toHaveLength(1);
      expect(hist1[0]!.sesion.duracion_minutos).toBe(40);

      let setsAtleta = 0;
      const unsub = useAthleteStore.subscribe(() => {
        setsAtleta += 1;
      });
      useAthleteStore.getState().marcarDiaCompletado(DIA_ID);
      unsub();
      expect(setsAtleta).toBe(0);
      expect(useAthleteStore.getState().historialSesiones).toBe(hist1);

      await vi.runAllTimersAsync();
      expect(cargarMiProgresoMock).toHaveBeenCalledTimes(1);

      // Edición posterior con sessionStartedAt === null: cambia el volumen pero no la duración.
      useAthleteStore.setState((s) => ({
        currentSession: {
          ...s.currentSession,
          ejercicios: s.currentSession.ejercicios.map((ej, i) =>
            i === 0
              ? { ...ej, series: ej.series.map((se) => (se.numero_serie === 1 ? { ...se, peso_kg: 99 } : se)) }
              : ej,
          ),
        },
      }));
      useAthleteStore.getState().marcarDiaCompletado(DIA_ID);
      const hist2 = useAthleteStore.getState().historialSesiones;
      expect(hist2).toHaveLength(1);
      expect(hist2[0]!.sesion.volumen_total_kg).not.toBe(hist1[0]!.sesion.volumen_total_kg);
      expect(hist2[0]!.sesion.duracion_minutos).toBe(40);
    });
  });

  describe("uncompleteSet / deleteCompletedSet (anti-zombi)", () => {
    function prepararSerieDesmarcable() {
      useAthleteStore.setState({ currentSession: sesionCompleta(1, 2) });
      useOfflineQueueStore.setState({
        pendingEvents: [
          eventoSerie("s1-set1", { exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 1 }),
          eventoSerie("s1-set1-edit", { exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 1 }, "WORKOUT_SET_UPDATED"),
          // Evento legado sin exerciseId: se reconoce por el ejercicio del catálogo.
          eventoSerie("s1-set1-legado", { ejercicioId: ejCatalogo(1), setNumber: 1 }),
          eventoSerie("s1-set2", { exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 2 }),
          eventoSerie("otra-set1", { sessionId: OTRA_SESION, exerciseId: "er-1", ejercicioId: ejCatalogo(1), setNumber: 1 }),
          eventoChat,
        ],
      });
    }

    it.each(["uncompleteSet", "deleteCompletedSet"] as const)(
      "GIVEN una serie completada y editada WHEN se desmarca con %s y corre flushQueue THEN no sube ninguna serie zombi",
      async (accion) => {
        prepararSerieDesmarcable();
        const sets = contarSetsCola();
        useAthleteStore.getState()[accion]("er-1", 1);
        sets.unsub();

        expect(sets.get()).toBe(1);
        expect(useOfflineQueueStore.getState().pendingEvents.map((e) => e.id)).toEqual([
          "s1-set2",
          "otra-set1",
          "chat-1",
        ]);

        // flushQueue real: ninguna escritura de la serie 1 de S1.
        useOfflineQueueStore.setState({
          flushQueue: originalFlushQueue,
          pendingEvents: useOfflineQueueStore
            .getState()
            .pendingEvents.filter((e) => e.action !== "ENVIAR_MENSAJE_CHAT"),
        });
        const { llamadas } = mockUpserts(async () => ({ error: null }));
        await useOfflineQueueStore.getState().flushQueue();
        // GOZS-884: la cola envía las series de cada sesión en lote (array por upsert).
        const series = llamadas
          .filter((l) => l.table === "registro_series")
          .flatMap((l) => [l.payload].flat() as { sesion_id: string; numero_serie: number }[]);
        expect(series).toEqual([
          expect.objectContaining({ sesion_id: S1, numero_serie: 2 }),
          expect.objectContaining({ sesion_id: OTRA_SESION, numero_serie: 1 }),
        ]);
        expect(useOfflineQueueStore.getState().pendingEvents).toEqual([]);
      },
    );
  });
});
