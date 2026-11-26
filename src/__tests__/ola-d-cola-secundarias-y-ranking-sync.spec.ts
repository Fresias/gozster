import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";

// GOZS-885 · Ola D: acciones secundarias de la cola offline con destino real en
// Supabase y señal de sincronización del Ranking. Datos 100 % sintéticos.

type Llamada = {
  tipo: "upsert" | "update" | "rpc";
  destino: string;
  args: Record<string, unknown>;
  opts?: unknown;
  eq?: [string, unknown];
};
const llamadas: Llamada[] = [];
let erroresPendientes: ({ message: string; code?: string } | null)[] = [];
let rankingFalla: "error" | "throw" | null = null;
let rankingLecturas = 0;

const respuesta = () => ({ data: null, error: erroresPendientes.shift() ?? null });

vi.mock("@/lib/supabase/client", () => {
  const consulta = () => {
    const q: Record<string, unknown> = {
      eq: () => q,
      in: () => q,
      then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
        rankingLecturas++;
        const p =
          rankingFalla === "throw"
            ? Promise.reject(new Error("timeout de red"))
            : Promise.resolve(
                rankingFalla === "error"
                  ? { data: null, error: { message: "boom" } }
                  : { data: [], error: null },
              );
        return p.then(ok, ko);
      },
    };
    return q;
  };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } } }) },
      rpc: async (fn: string, args: Record<string, unknown>) => {
        llamadas.push({ tipo: "rpc", destino: fn, args });
        return respuesta();
      },
      from: (table: string) => ({
        upsert: async (row: Record<string, unknown>, opts?: unknown) => {
          llamadas.push({ tipo: "upsert", destino: table, args: row, opts });
          return respuesta();
        },
        update: (row: Record<string, unknown>) => ({
          eq: async (col: string, val: unknown) => {
            llamadas.push({ tipo: "update", destino: table, args: row, eq: [col, val] });
            return respuesta();
          },
        }),
        select: () => consulta(),
      }),
    },
  };
});

// SSR (React 19): los hooks de Zustand leen getState() para reflejar el estado del test.
const { comoHookSsr } = vi.hoisted(() => ({
  comoHookSsr: <T extends { getState: () => unknown }>(store: T) =>
    Object.assign(
      (sel?: (s: any) => unknown) => (typeof sel === "function" ? sel(store.getState()) : store.getState()),
      store,
    ),
}));
vi.mock("@/store/use-ranking-store", async (orig) => {
  const mod = await orig<typeof import("@/store/use-ranking-store")>();
  return { ...mod, useRankingStore: comoHookSsr(mod.useRankingStore) };
});
vi.mock("@/store/use-offline-queue", async (orig) => {
  const mod = await orig<typeof import("@/store/use-offline-queue")>();
  return { ...mod, useOfflineQueueStore: comoHookSsr(mod.useOfflineQueueStore) };
});
vi.mock("@/store/use-athlete-store", async (orig) => {
  const mod = await orig<typeof import("@/store/use-athlete-store")>();
  return { ...mod, useAthleteStore: comoHookSsr(mod.useAthleteStore) };
});

import { resetBackoffCola, useOfflineQueueStore } from "@/store/use-offline-queue";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import {
  RANKING_SYNC_ERROR_MSG,
  resolverEstadoSincronizacionRanking,
  useRankingStore,
} from "@/store/use-ranking-store";
import { RankingFuncional } from "@/components/coach/ranking-funcional";
import type { Perfil } from "@/types/database.types";

const ALUMNO = "22222222-2222-4222-8222-222222222222";
const CONV = "33333333-3333-4333-8333-333333333333";
const COACH = "44444444-4444-4444-8444-444444444444";
const CLASE = "55555555-5555-4555-8555-555555555555";

const cola = () => useOfflineQueueStore.getState();

const EVENTOS = {
  cuestionario: {
    id: "ev-cuest",
    action: "UPSERT_CUESTIONARIO_INICIAL",
    payload: {
      id: "cuest-local",
      alumno_id: ALUMNO,
      objetivo_principal: "Fuerza",
      experiencia_previa: null,
      dias_disponibles_semana: 3,
      molestias_o_lesiones_previas: null,
      equipamiento_disponible: null,
      respuestas_extra: {},
      completado_at: "2026-11-26T10:00:00.000Z",
      updated_at: "2026-11-26T10:00:00.000Z",
    },
  },
  transferir: {
    id: "ev-transfer",
    action: "TRANSFERIR_CONVERSACION_GOZS",
    payload: { conversacion_id: CONV, nuevo_responsable_id: COACH, motivo: "Vacaciones" },
  },
  estado: {
    id: "ev-estado",
    action: "CAMBIAR_ESTADO_CONVERSACION",
    payload: { conversacion_id: CONV, alumno_id: ALUMNO, estado: "CERRADA" },
  },
  nivel: {
    id: "ev-nivel",
    action: "UPDATE_ALUMNO_NIVEL_VISTA",
    payload: { alumnoId: ALUMNO, nivel: "TECNICA" },
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  llamadas.length = 0;
  erroresPendientes = [];
  rankingFalla = null;
  rankingLecturas = 0;
  useOfflineQueueStore.setState({ isOnline: true, pendingEvents: [], syncError: null, isFlushing: false });
});
afterEach(() => {
  resetBackoffCola();
  vi.useRealTimers();
});

describe("GOZS-885 · handlers reales de acciones secundarias en flushQueue()", () => {
  it("GIVEN los 4 eventos encolados offline WHEN vuelve la señal THEN cada uno ejecuta su write/RPC real y sale de la cola", async () => {
    useOfflineQueueStore.setState({ isOnline: false });
    for (const ev of Object.values(EVENTOS)) cola().enqueueEvent(ev);
    expect(cola().pendingEvents).toHaveLength(4);

    useOfflineQueueStore.setState({ isOnline: true });
    await cola().flushQueue();

    expect(cola().pendingEvents).toHaveLength(0);
    expect(cola().syncError).toBeNull();
    expect(llamadas).toHaveLength(4);

    const [cuest, transfer, estado, nivel] = llamadas;
    expect(cuest).toMatchObject({
      tipo: "upsert",
      destino: "alumno_cuestionario_inicial",
      opts: { onConflict: "alumno_id" },
      args: { alumno_id: ALUMNO, objetivo_principal: "Fuerza", dias_disponibles_semana: 3 },
    });
    // El id local ("cuest-…") nunca viaja al servidor.
    expect(cuest!.args).not.toHaveProperty("id");

    expect(transfer).toEqual({
      tipo: "rpc",
      destino: "transferir_conversacion_gozs",
      args: { p_conversacion_id: CONV, p_nuevo_responsable_id: COACH, p_motivo: "Vacaciones" },
    });
    expect(estado).toMatchObject({
      tipo: "update",
      destino: "conversaciones",
      args: { estado: "CERRADA" },
      eq: ["id", CONV],
    });
    expect(typeof estado!.args.updated_at).toBe("string");
    expect(nivel).toEqual({
      tipo: "update",
      destino: "perfiles",
      args: { nivel_vista_alumno: "TECNICA" },
      eq: ["id", ALUMNO],
    });
  });

  it.each(Object.entries(EVENTOS))(
    "%s: ante error transitorio retiene el evento con backoff y solo lo elimina tras confirmación",
    async (_nombre, ev) => {
      cola().enqueueEvent(ev);
      erroresPendientes = [{ message: "network" }];

      await cola().flushQueue();
      expect(cola().pendingEvents.map((e) => e.id)).toEqual([ev.id]);
      expect(llamadas).toHaveLength(1);

      // El backoff reintenta solo y, confirmado por el servidor, lo quita.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(cola().pendingEvents).toHaveLength(0);
      expect(llamadas).toHaveLength(2);
    },
  );

  it("un fallo transitorio corta la corrida y preserva el orden de los eventos siguientes", async () => {
    cola().enqueueEvent(EVENTOS.transferir);
    cola().enqueueEvent(EVENTOS.estado);
    erroresPendientes = [{ message: "network" }];

    await cola().flushQueue();
    expect(cola().pendingEvents.map((e) => e.id)).toEqual(["ev-transfer", "ev-estado"]);
    expect(llamadas).toHaveLength(1);
  });

  it.each([
    ["TRANSFERIR_CONVERSACION_GOZS con conversación no-UUID", { ...EVENTOS.transferir, payload: { conversacion_id: "conv-local", nuevo_responsable_id: COACH } }, "No pudimos transferir la conversación."],
    ["TRANSFERIR_CONVERSACION_GOZS con responsable no-UUID", { ...EVENTOS.transferir, payload: { conversacion_id: CONV, nuevo_responsable_id: "coach-demo" } }, "No pudimos transferir la conversación."],
    ["CAMBIAR_ESTADO_CONVERSACION sin conversacion_id", { ...EVENTOS.estado, payload: { alumno_id: ALUMNO, estado: "CERRADA" } }, "No pudimos actualizar el estado de la conversación."],
    ["UPSERT_CUESTIONARIO_INICIAL con alumno no-UUID", { ...EVENTOS.cuestionario, payload: { alumno_id: "demo-alumno" } }, "No pudimos guardar tu cuestionario inicial."],
    ["UPDATE_ALUMNO_NIVEL_VISTA con nivel inválido", { ...EVENTOS.nivel, payload: { alumnoId: ALUMNO, nivel: "EXPERTO" } }, "No pudimos guardar el nivel de vista del alumno."],
  ])("%s: rechazo permanente sin red, no bloquea la cola", async (_n, ev, msg) => {
    cola().enqueueEvent(ev);
    cola().enqueueEvent({ ...EVENTOS.nivel, id: "ev-nivel-ok" });
    await cola().flushQueue();
    expect(cola().pendingEvents).toHaveLength(0);
    expect(cola().syncError).toBe(msg);
    // Solo viajó el evento válido que venía detrás.
    expect(llamadas.map((l) => l.destino)).toEqual(["perfiles"]);
  });

  it("error permanente de RLS (42501) descarta el evento y avisa sin reintentar", async () => {
    cola().enqueueEvent(EVENTOS.estado);
    erroresPendientes = [{ message: "denied", code: "42501" }];
    await cola().flushQueue();
    expect(cola().pendingEvents).toHaveLength(0);
    expect(cola().syncError).toBe("No pudimos actualizar el estado de la conversación.");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(llamadas).toHaveLength(1);
  });

  it("RPC_ASIGNAR_PLAN_URGENTE (flujo solo local, sin RPC en Supabase) se descarta sin red ni bloquear la cola", async () => {
    cola().enqueueEvent({ id: "ev-urg", action: "RPC_ASIGNAR_PLAN_URGENTE", payload: { alumnoId: ALUMNO, planId: "plan-urgente-1", nombre: "X" } });
    cola().enqueueEvent(EVENTOS.nivel);
    await cola().flushQueue();
    expect(cola().pendingEvents).toHaveLength(0);
    expect(cola().syncError).toBeNull();
    expect(llamadas.map((l) => l.destino)).toEqual(["perfiles"]);
  });

  it("una acción genuinamente desconocida sigue sin bloquear la cola (forward-compat)", async () => {
    cola().enqueueEvent({ id: "x", action: "ACCION_FUTURA", payload: {} });
    cola().enqueueEvent(EVENTOS.transferir);
    await cola().flushQueue();
    expect(cola().pendingEvents).toHaveLength(0);
    expect(llamadas.map((l) => l.destino)).toEqual(["transferir_conversacion_gozs"]);
  });
});

describe("GOZS-885 · guardado online exitoso no deja eventos colgados", () => {
  it("saveCuestionarioInicial online confirmado limpia su evento: el próximo flushQueue() no lo reenvía", async () => {
    useAthleteStore.setState((s) => ({ currentSession: { ...s.currentSession, studentId: ALUMNO } }));
    const r = await useAthleteStore.getState().saveCuestionarioInicial({ objetivo_principal: "Movilidad" });
    expect(r.success).toBe(true);
    expect(cola().pendingEvents.some((e) => e.action === "UPSERT_CUESTIONARIO_INICIAL")).toBe(false);
    expect(llamadas).toHaveLength(1);

    await cola().flushQueue();
    expect(llamadas).toHaveLength(1);
  });

  it("saveCuestionarioInicial sin señal no llama a la red y deja el evento para flushQueue()", async () => {
    useAthleteStore.setState((s) => ({ currentSession: { ...s.currentSession, studentId: ALUMNO } }));
    useOfflineQueueStore.setState({ isOnline: false });
    await useAthleteStore.getState().saveCuestionarioInicial({ objetivo_principal: "Movilidad" });
    expect(llamadas).toHaveLength(0);
    expect(cola().pendingEvents.filter((e) => e.action === "UPSERT_CUESTIONARIO_INICIAL")).toHaveLength(1);
  });

  it("saveCuestionarioInicial con error online conserva el evento para reintentar", async () => {
    useAthleteStore.setState((s) => ({ currentSession: { ...s.currentSession, studentId: ALUMNO } }));
    erroresPendientes = [{ message: "network" }];
    await useAthleteStore.getState().saveCuestionarioInicial({ objetivo_principal: "Movilidad" });
    expect(cola().pendingEvents.filter((e) => e.action === "UPSERT_CUESTIONARIO_INICIAL")).toHaveLength(1);
  });

  const alumno = { id: ALUMNO, nombre_completo: "Alumna Sintética", nivel_vista_alumno: "SIMPLE" } as Perfil;

  it("actualizarNivelVistaAlumno online confirmado limpia su evento", async () => {
    useCoachStudioStore.setState({ alumnos: [alumno] });
    const ok = await useCoachStudioStore.getState().actualizarNivelVistaAlumno(ALUMNO, "TECNICA");
    expect(ok).not.toBe(false);
    expect(cola().pendingEvents.some((e) => e.action === "UPDATE_ALUMNO_NIVEL_VISTA")).toBe(false);
    await cola().flushQueue();
    expect(llamadas).toHaveLength(1);
  });

  it("actualizarNivelVistaAlumno con error de esquema conserva el evento para reintentar", async () => {
    useCoachStudioStore.setState({ alumnos: [alumno] });
    erroresPendientes = [{ message: "Could not find column in the schema cache" }];
    await useCoachStudioStore.getState().actualizarNivelVistaAlumno(ALUMNO, "TECNICA");
    expect(cola().pendingEvents.filter((e) => e.action === "UPDATE_ALUMNO_NIVEL_VISTA")).toHaveLength(1);
  });
});

describe("GOZS-885 · señal de sincronización del Ranking", () => {
  const base = {
    isOnline: true,
    isFlushing: false,
    hasPendingSeries: false,
    syncingSessionId: null,
    syncError: null,
    ultimaSincronizacionAt: "2026-11-26T12:00:00.000Z",
  };

  it("resolverEstadoSincronizacionRanking: sin señal > error > sincronizando > al día", () => {
    expect(resolverEstadoSincronizacionRanking({ ...base, isOnline: false, syncError: "x", isFlushing: true })).toEqual({
      tipo: "sin-conexion",
      ultimaSincronizacionAt: base.ultimaSincronizacionAt,
    });
    expect(resolverEstadoSincronizacionRanking({ ...base, syncError: "falló", isFlushing: true })).toEqual({ tipo: "error", mensaje: "falló" });
    expect(resolverEstadoSincronizacionRanking({ ...base, isFlushing: true }).tipo).toBe("sincronizando");
    expect(resolverEstadoSincronizacionRanking({ ...base, hasPendingSeries: true }).tipo).toBe("sincronizando");
    expect(resolverEstadoSincronizacionRanking({ ...base, syncingSessionId: "s1" }).tipo).toBe("sincronizando");
    expect(resolverEstadoSincronizacionRanking(base)).toEqual({ tipo: "al-dia", ultimaSincronizacionAt: base.ultimaSincronizacionAt });
  });

  describe("cargarPrsClase()", () => {
    beforeEach(() => {
      useRankingStore.setState({ prs: [], ultimaSincronizacionAt: null, syncError: null, cargando: false });
    });

    it("sin señal no llama a la red y conserva los datos previos", async () => {
      const previo = { id: "pr-1", clase_id: CLASE } as never;
      useRankingStore.setState({ prs: [previo], ultimaSincronizacionAt: "2026-11-25T09:00:00.000Z" });
      useOfflineQueueStore.setState({ isOnline: false });
      await useRankingStore.getState().cargarPrsClase(CLASE);
      expect(rankingLecturas).toBe(0);
      expect(useRankingStore.getState().prs).toEqual([previo]);
      expect(useRankingStore.getState().ultimaSincronizacionAt).toBe("2026-11-25T09:00:00.000Z");
    });

    it("respuesta OK sella ultimaSincronizacionAt y limpia syncError", async () => {
      useRankingStore.setState({ syncError: "viejo" });
      await useRankingStore.getState().cargarPrsClase(CLASE);
      expect(rankingLecturas).toBeGreaterThan(0);
      expect(useRankingStore.getState().syncError).toBeNull();
      expect(useRankingStore.getState().ultimaSincronizacionAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("error del servidor deja syncError descriptivo en español (no se traga el fallo)", async () => {
      rankingFalla = "error";
      await useRankingStore.getState().cargarPrsClase(CLASE);
      expect(useRankingStore.getState().syncError).toContain(RANKING_SYNC_ERROR_MSG);
      expect(useRankingStore.getState().syncError).toContain("boom");
      expect(useRankingStore.getState().cargando).toBe(false);
      expect(useRankingStore.getState().ultimaSincronizacionAt).toBeNull();
    });

    it("excepción de red deja syncError descriptivo", async () => {
      rankingFalla = "throw";
      await useRankingStore.getState().cargarPrsClase(CLASE);
      expect(useRankingStore.getState().syncError).toContain("timeout de red");
    });

    it("persiste ultimaSincronizacionAt pero no el syncError efímero", () => {
      const opts = (useRankingStore as any).persist.getOptions();
      const persistido = opts.partialize({ ...useRankingStore.getState(), ultimaSincronizacionAt: "t", syncError: "e" });
      expect(persistido.ultimaSincronizacionAt).toBe("t");
      expect(persistido).not.toHaveProperty("syncError");
    });
  });

  describe("<RankingFuncional /> cabecera data-testid=ranking-sync-estado", () => {
    const render = () =>
      renderToString(React.createElement(RankingFuncional, { initialClaseId: CLASE, isLiveMode: true }));

    beforeEach(() => {
      useRankingStore.setState({ syncError: null, ultimaSincronizacionAt: null });
      useAthleteStore.setState({ syncingSessionId: null });
    });

    it("sin señal: avisa que el ranking puede estar desactualizado (+ hora de la última sincronización)", () => {
      useOfflineQueueStore.setState({ isOnline: false });
      useRankingStore.setState({ ultimaSincronizacionAt: "2026-11-26T12:00:00.000Z" });
      const html = render();
      expect(html).toContain('data-testid="ranking-sync-estado"');
      expect(html).toContain('role="status"');
      expect(html).toContain('data-estado="sin-conexion"');
      expect(html).toContain("Sin conexión · Ranking puede estar desactualizado");
      expect(html).toContain("(actualizado ");
    });

    it("online con series pendientes: muestra 'Sincronizando…'", () => {
      useOfflineQueueStore.setState({
        pendingEvents: [{ id: "s", action: "WORKOUT_SET_COMPLETED", payload: { sessionId: "s1" }, createdAt: "" }],
      });
      const html = render();
      expect(html).toContain('data-estado="sincronizando"');
      expect(html).toContain("Sincronizando… · El ranking aún no refleja los últimos registros");
    });

    it("online con sesión sincronizándose (syncingSessionId): muestra 'Sincronizando…'", () => {
      useAthleteStore.setState({ syncingSessionId: "s1" });
      expect(render()).toContain('data-estado="sincronizando"');
    });

    it("error al actualizar: muestra el aviso y el botón 'Reintentar'", () => {
      useRankingStore.setState({ syncError: `${RANKING_SYNC_ERROR_MSG}: boom.` });
      const html = render();
      expect(html).toContain('data-estado="error"');
      expect(html).toContain("No se pudo actualizar el ranking");
      expect(html).toContain('data-testid="ranking-sync-reintentar"');
      expect(html).toContain("Reintentar");
    });

    it("al día: sin alertas de conexión, sincronización ni error", () => {
      useRankingStore.setState({ ultimaSincronizacionAt: "2026-11-26T12:00:00.000Z" });
      const html = render();
      expect(html).toContain('data-estado="al-dia"');
      expect(html).not.toContain("Sin conexión");
      expect(html).not.toContain("Sincronizando…");
      expect(html).not.toContain("No se pudo actualizar");
    });
  });
});
