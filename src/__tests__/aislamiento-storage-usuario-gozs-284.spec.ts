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
      id: "ev-a",
      action: "WORKOUT_SET_COMPLETED",
      payload: {},
    });
    useAthleteStore.setState({
      onboardingCompletado: true,
      planAlumno: {
        planes: [{ id: "plan-a", nombre: "Plan A" } as any],
        alumnos: [{ id: "user-a", nombre_completo: "Alumno A" } as any],
        dias: [],
        ejerciciosEnRutina: [],
        ejercicios: [],
      },
    });
    expect(mem.has("gozster-offline-queue:user-a")).toBe(true);
    expect(mem.has("gozster-athlete-store:user-a")).toBe(true);

    await activarUsuarioStorage("user-b");
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    expect(useAthleteStore.getState().onboardingCompletado).toBe(false);
    expect(useAthleteStore.getState().planAlumno).toBeNull();

    await activarUsuarioStorage("user-a");
    expect(useOfflineQueueStore.getState().pendingEvents.map((e) => e.id)).toEqual(["ev-a"]);
    expect(useAthleteStore.getState().onboardingCompletado).toBe(true);
    expect(useAthleteStore.getState().planAlumno?.planes[0]?.id).toBe("plan-a");
  });

  it("GIVEN datos legado sin id de usuario THEN no se rehidratan y se purgan", async () => {
    mem.set("gozster-chat-store", JSON.stringify({ state: { isAthleteChatOpen: true }, version: 0 }));
    await activarUsuarioStorage("user-b");
    expect(useChatStore.getState().isAthleteChatOpen).toBe(false);
    expect(mem.has("gozster-chat-store")).toBe(false);
  });

  it("GIVEN usuario autenticado WHEN cierra sesión THEN se limpian stores persistidos", async () => {
    const deleteCacheMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", {
      keys: vi.fn().mockResolvedValue(["workbox-precache", "user-data"]),
      delete: deleteCacheMock,
    });

    await activarUsuarioStorage("user-a");
    useOfflineQueueStore.getState().enqueueEvent({
      id: "ev-a",
      action: "WORKOUT_SET_COMPLETED",
      payload: {},
    });
    useAthleteStore.setState({ onboardingCompletado: true });

    await cerrarSesionAlumno();
    expect([...mem.keys()].filter((k) => k.startsWith("gozster-"))).toEqual([]);
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    expect(useAthleteStore.getState().onboardingCompletado).toBe(false);
    expect(deleteCacheMock).toHaveBeenCalledTimes(2);
    expect((window.location.replace as any)).toHaveBeenCalledWith("/login");
  });
});
