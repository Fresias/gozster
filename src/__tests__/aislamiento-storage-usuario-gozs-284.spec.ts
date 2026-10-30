import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({ auth: { signOut: vi.fn().mockResolvedValue({}) } }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

const mem = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};

import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useChatStore } from "@/store/use-chat-store";
import { activarUsuarioStorage, cerrarSesionAlumno } from "@/lib/session-scope";
import { setStorageUser } from "@/lib/user-storage";

describe("GOZS-284: aislamiento de stores persistidos por usuario", () => {
  beforeEach(() => {
    mem.clear();
    setStorageUser(null);
    vi.stubGlobal("window", { localStorage: fakeLocalStorage, location: { replace: vi.fn() } });
  });

  it("GIVEN alumno A con cola y plan WHEN B inicia sesión THEN B no ve datos de A", async () => {
    await activarUsuarioStorage("user-a");
    useOfflineQueueStore.getState().enqueueEvent({
      id: "ev-a", action: "x", payload: {}
    });
    useAthleteStore.setState({ onboardingCompletado: true });
    expect(mem.has("gozster-offline-queue:user-a")).toBe(true);

    await activarUsuarioStorage("user-b");
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    expect(useAthleteStore.getState().onboardingCompletado).toBe(false);

    await activarUsuarioStorage("user-a");
    expect(useOfflineQueueStore.getState().pendingEvents.map((e) => e.id)).toEqual(["ev-a"]);
  });

  it("GIVEN datos legado sin id de usuario THEN no se rehidratan y se purgan", async () => {
    mem.set("gozster-chat-store", JSON.stringify({ state: { isAthleteChatOpen: true }, version: 0 }));
    await activarUsuarioStorage("user-b");
    expect(useChatStore.getState().isAthleteChatOpen).toBe(false);
    expect(mem.has("gozster-chat-store")).toBe(false);
  });

  it("GIVEN usuario autenticado WHEN cierra sesión THEN se limpian stores persistidos", async () => {
    await activarUsuarioStorage("user-a");
    useOfflineQueueStore.getState().enqueueEvent({
      id: "ev-a", action: "x", payload: {}
    });
    await cerrarSesionAlumno();
    expect([...mem.keys()].filter((k) => k.startsWith("gozster-"))).toEqual([]);
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
  });
});
