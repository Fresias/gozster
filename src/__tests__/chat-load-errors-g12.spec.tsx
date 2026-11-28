import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/studio",
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

// SSR / React 19: los hooks Zustand se resuelven vía getState() (AGENTS.md).
vi.mock("@/store/use-chat-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-chat-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useChatStore.getState()) : mod.useChatStore.getState()),
    mod.useChatStore,
  );
  return { ...mod, useChatStore: hook };
});

vi.mock("@/store/use-offline-queue", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-offline-queue")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useOfflineQueueStore.getState()) : mod.useOfflineQueueStore.getState()),
    mod.useOfflineQueueStore,
  );
  return { ...mod, useOfflineQueueStore: hook };
});

vi.mock("@/store/use-coach-studio", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-coach-studio")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useCoachStudioStore.getState()) : mod.useCoachStudioStore.getState()),
    mod.useCoachStudioStore,
  );
  return { ...mod, useCoachStudioStore: hook };
});

import { AthleteChat } from "@/components/athlete/athlete-chat";
import { ChatFab } from "@/components/coach/chat-fab";
import { supabase } from "@/lib/supabase/client";
import { useChatStore, type ChatConversation, type ChatMessage } from "@/store/use-chat-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { fireEvent, render } from "@/test-utils/no-demo-literals";
import type { Perfil } from "@/types/database.types";

const ALUMNO_ID = "11111111-1111-4111-8111-111111111923";
const COACH_REAL_ID = "22222222-2222-4222-8222-222222222923";
const CONV_ID = "33333333-3333-4333-8333-333333333923";
const RAW_SQL = 'relation "public.conversaciones" does not exist';

function mensaje(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: "m-cache-1",
    conversacion_id: CONV_ID,
    remitente_id: ALUMNO_ID,
    remitente_nombre: "Atleta Prueba",
    remitente_rol: "ALUMNO",
    contenido: "Mensaje en caché",
    leido: true,
    created_at: "2026-11-27T10:00:00.000Z",
    hora: "10:00",
    es_staff: false,
    estado_envio: "enviado",
    ...overrides,
  };
}

function conversacionCacheada(): ChatConversation {
  return {
    id: CONV_ID,
    alumno_id: ALUMNO_ID,
    alumno_nombre: "Atleta Prueba",
    created_at: "2026-11-27T10:00:00.000Z",
    updated_at: "2026-11-27T10:00:00.000Z",
    unreadCount: 0,
    mensajes: [
      mensaje({}),
      mensaje({ id: "m-local-pend", contenido: "Pendiente offline", estado_envio: "pendiente" }),
    ],
  };
}

/** Simula `supabase.from(...).select(...)[.eq(...)]` resolviendo `result` (o rechazando). */
function mockFromSelect(result: { data: unknown; error: unknown } | Error) {
  const settle = () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result));
  const builder: any = {
    eq: () => builder,
    then: (onOk: any, onErr: any) => settle().then(onOk, onErr),
  };
  return vi.spyOn(supabase, "from").mockReturnValue({ select: () => builder } as any);
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  useChatStore.getState().resetToDefaults();
  useChatStore.setState({ staffCoaches: [], conversations: { [ALUMNO_ID]: conversacionCacheada() } });
  useOfflineQueueStore.setState({ isOnline: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GOZS-923: syncWithSupabase propaga errores sin perder caché", () => {
  it("GIVEN error de PostgREST THEN registra chatSyncError humano y preserva caché + pendientes", async () => {
    mockFromSelect({ data: null, error: { message: RAW_SQL, code: "42P01" } });
    await useChatStore.getState().syncWithSupabase(ALUMNO_ID);

    const st = useChatStore.getState();
    expect(st.chatSyncError).toBeTruthy();
    expect(st.chatSyncError).not.toContain("relation");
    expect(st.chatSyncError).not.toContain("42P01");
    expect(st.conversations[ALUMNO_ID]).toEqual(conversacionCacheada());
  });

  it("GIVEN falla de red (rechazo) THEN no crashea y registra chatSyncError", async () => {
    mockFromSelect(new Error("TypeError: Failed to fetch at stack.js:1:1"));
    await expect(useChatStore.getState().syncWithSupabase()).resolves.toBeUndefined();

    const st = useChatStore.getState();
    expect(st.chatSyncError).toBeTruthy();
    expect(st.chatSyncError).not.toMatch(/stack|TypeError/);
    expect(st.conversations[ALUMNO_ID]?.mensajes.map((m) => m.id)).toEqual(["m-cache-1", "m-local-pend"]);
  });

  it("GIVEN chatSyncError activo THEN no se persiste (partialize)", () => {
    useChatStore.setState({ chatSyncError: "No pudimos actualizar el chat." });
    const partialize = useChatStore.persist.getOptions().partialize!;
    const persisted = partialize(useChatStore.getState()) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty("chatSyncError");
    expect(persisted).toHaveProperty("conversations");
  });

  it("GIVEN recuperación con data = [] (base vacía) THEN limpia el error sin inyectar datos demo", async () => {
    useChatStore.setState({ conversations: {}, chatSyncError: "No pudimos actualizar el chat." });
    mockFromSelect({ data: [], error: null });
    await useChatStore.getState().syncWithSupabase(ALUMNO_ID);

    const st = useChatStore.getState();
    expect(st.chatSyncError).toBeNull();
    expect(st.conversations).toEqual({});
  });

  it("GIVEN recuperación con datos reales THEN limpia el error y resuelve nombres desde staffCoaches", async () => {
    useChatStore.setState({
      chatSyncError: "No pudimos actualizar el chat.",
      staffCoaches: [{ id: COACH_REAL_ID, nombre: "Entrenadora Real", rol: "ENTRENADOR", esStaff: true }],
    });
    mockFromSelect({
      data: [
        {
          id: CONV_ID,
          alumno_id: ALUMNO_ID,
          responsable_id: COACH_REAL_ID,
          estado: "ABIERTA",
          created_at: "2026-11-27T10:00:00.000Z",
          updated_at: "2026-11-28T10:00:00.000Z",
          mensajes: [
            {
              id: "m-srv-1",
              conversacion_id: CONV_ID,
              remitente_id: COACH_REAL_ID,
              contenido: "Hola desde el staff",
              leido: false,
              requiere_lectura_inicio: false,
              created_at: "2026-11-28T09:00:00.000Z",
            },
          ],
        },
      ],
      error: null,
    });
    await useChatStore.getState().syncWithSupabase(ALUMNO_ID);

    const st = useChatStore.getState();
    const conv = st.conversations[ALUMNO_ID]!;
    expect(st.chatSyncError).toBeNull();
    expect(conv.responsable_nombre).toBe("Entrenadora Real");
    expect(conv.mensajes.find((m) => m.id === "m-srv-1")?.remitente_nombre).toBe("Entrenadora Real");
    // El pendiente local offline se conserva tras la sincronización.
    expect(conv.mensajes.some((m) => m.id === "m-local-pend" && m.estado_envio === "pendiente")).toBe(true);
  });
});

describe("GOZS-923: banner de error con Reintentar en el chat", () => {
  it("GIVEN chatSyncError en Athlete App THEN muestra role=alert, conserva mensajes y Reintentar sincroniza", () => {
    const syncSpy = vi.fn().mockResolvedValue(undefined);
    useChatStore.setState({
      isAthleteChatOpen: true,
      chatSyncError: "No pudimos actualizar el chat. Revisá tu conexión e intentá de nuevo.",
      syncWithSupabase: syncSpy,
    });
    const { getByTestId, getByText, container } = render(
      <AthleteChat athleteId={ALUMNO_ID} athleteName="Atleta Prueba" />,
    );

    const banner = getByTestId("athlete-chat-sync-error");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(container.textContent).not.toContain("relation");
    expect(container.textContent).toContain("Mensaje en caché");
    fireEvent.click(getByText("Reintentar"));
    expect(syncSpy).toHaveBeenCalledWith(ALUMNO_ID);
  });

  it("GIVEN sin error en Athlete App THEN no hay banner", () => {
    useChatStore.setState({ isAthleteChatOpen: true, chatSyncError: null });
    const { queryByTestId } = render(<AthleteChat athleteId={ALUMNO_ID} athleteName="Atleta Prueba" />);
    expect(queryByTestId("athlete-chat-sync-error")).toBeNull();
  });

  it("GIVEN chatSyncError en Coach Studio THEN muestra role=alert, conserva mensajes y Reintentar sincroniza", () => {
    const syncSpy = vi.fn().mockResolvedValue(undefined);
    useChatStore.setState({
      chatSyncError: "No pudimos actualizar el chat. Revisá tu conexión e intentá de nuevo.",
      syncWithSupabase: syncSpy,
    });
    const alumno = { id: ALUMNO_ID, nombre_completo: "Atleta Prueba" } as Perfil;
    const { getByTestId, getByText, container } = render(
      <ChatFab alumno={alumno} isOpen onToggle={vi.fn()} isLiveMode />,
    );

    const banner = getByTestId("coach-chat-sync-error");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(container.textContent).not.toContain("relation");
    expect(container.textContent).toContain("Mensaje en caché");
    fireEvent.click(getByText("Reintentar"));
    expect(syncSpy).toHaveBeenCalledWith(ALUMNO_ID);
  });

  it("GIVEN chatSyncError en el Inbox del Studio THEN muestra el banner con Reintentar", async () => {
    const syncSpy = vi.fn().mockResolvedValue(undefined);
    useChatStore.setState({ chatSyncError: "No pudimos actualizar el chat.", syncWithSupabase: syncSpy });
    const { getByTestId, getByText } = render(<ChatFab alumno={null} isOpen onToggle={vi.fn()} isLiveMode />);
    await flush();
    expect(getByTestId("coach-chat-sync-error").getAttribute("role")).toBe("alert");
    fireEvent.click(getByText("Reintentar"));
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });
});
