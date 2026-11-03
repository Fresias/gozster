import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSignOut = vi.fn().mockResolvedValue({});
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } });

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
      getUser: mockGetUser,
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

const mem = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => void mem.clear(),
};

const sessionMem = new Map<string, string>();
const fakeSessionStorage = {
  getItem: (k: string) => sessionMem.get(k) ?? null,
  setItem: (k: string, v: string) => void sessionMem.set(k, v),
  removeItem: (k: string) => void sessionMem.delete(k),
  clear: () => void sessionMem.clear(),
};

let cookieJar: string[] = [];
const fakeDocument = {
  get cookie() {
    return cookieJar.join("; ");
  },
  set cookie(cookieStr: string) {
    if (cookieStr.includes("expires=Thu, 01 Jan 1970")) {
      const name = (cookieStr.split("=")[0] ?? "").trim();
      cookieJar = cookieJar.filter((c) => !c.startsWith(`${name}=`));
    } else {
      cookieJar.push(cookieStr);
    }
  },
};

import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";
import { useChatStore } from "@/store/use-chat-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import {
  activarUsuarioStorage,
  cerrarSesion,
  cerrarSesionAlumno,
  cerrarSesionUniversal,
  purgeAuthCookies,
} from "@/lib/session-scope";
import { setStorageUser } from "@/lib/user-storage";

describe("GOZS-284 & GOZS-340: aislamiento y logout universal con purga de cookies y storage", () => {
  beforeEach(() => {
    mem.clear();
    sessionMem.clear();
    cookieJar = [];
    setStorageUser(null);
    mockSignOut.mockClear();
    mockGetUser.mockReset().mockResolvedValue({ data: { user: null } });

    vi.stubGlobal("window", {
      localStorage: fakeLocalStorage,
      sessionStorage: fakeSessionStorage,
      location: { replace: vi.fn() },
    });
    vi.stubGlobal("document", fakeDocument);
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

  it("GOZS-340: Flujo Universal de Logout ejecuta signOut, purga cookies SSR, localStorage, sessionStorage, caches y redirect /login", async () => {
    const deleteCacheMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", {
      keys: vi.fn().mockResolvedValue(["runtime-cache", "offline-assets"]),
      delete: deleteCacheMock,
    });

    // Simula cookies de SSR
    fakeDocument.cookie = "sb-cutvhrx-auth-token=secret_token";
    fakeDocument.cookie = "sb-cutvhrx-auth-token.0=chunk_0";
    fakeDocument.cookie = "gozster-theme=dark";

    // Simula sesión en sessionStorage y localStorage
    await activarUsuarioStorage("user-coach-123");
    fakeSessionStorage.setItem("gozster-athlete-store:user-coach-123", JSON.stringify({ active: true }));
    fakeSessionStorage.setItem("temp-coach-session", "active");

    useCoachStudioStore.setState({ filtroActividad: "FUNCIONAL" });
    useChatStore.setState({ isAthleteChatOpen: true });

    // Ejecuta cerrarSesion()
    await cerrarSesion();

    // 1. Invoca supabase.auth.signOut()
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    // 2. Purga cookies SSR de Supabase
    expect(fakeDocument.cookie).not.toContain("sb-cutvhrx-auth-token");
    expect(fakeDocument.cookie).toContain("gozster-theme=dark"); // conserva preferencia de tema

    // 3. Purga localStorage y sessionStorage
    expect([...mem.keys()].filter((k) => k.startsWith("gozster-"))).toEqual([]);
    expect(sessionMem.size).toBe(0);

    // 4. Resetea stores en memoria de Zustand
    expect(useCoachStudioStore.getState().filtroActividad).toBe("TODAS");
    expect(useChatStore.getState().isAthleteChatOpen).toBe(false);

    // 5. Purga caches del Service Worker
    expect(deleteCacheMock).toHaveBeenCalledWith("runtime-cache");
    expect(deleteCacheMock).toHaveBeenCalledWith("offline-assets");

    // 6. Redirige de inmediato a /login
    expect((window.location.replace as any)).toHaveBeenCalledWith("/login");
  });

  it("GOZS-340: Aislamiento estricto tras logout: nuevo login de usuario B no hereda datos anteriores", async () => {
    await activarUsuarioStorage("user-alpha");
    useOfflineQueueStore.getState().enqueueEvent({
      id: "ev-alpha",
      action: "WORKOUT_SET_COMPLETED",
      payload: { repeticiones: 10 },
    });
    useAthleteStore.setState({
      onboardingCompletado: true,
      planAlumno: {
        planes: [{ id: "plan-alpha", nombre: "Alpha Plan" } as any],
        alumnos: [],
        dias: [],
        ejerciciosEnRutina: [],
        ejercicios: [],
      },
    });

    await cerrarSesion();

    // Entra usuario Beta
    await activarUsuarioStorage("user-beta");
    expect(useOfflineQueueStore.getState().pendingEvents).toHaveLength(0);
    expect(useAthleteStore.getState().onboardingCompletado).toBe(false);
    expect(useAthleteStore.getState().planAlumno).toBeNull();
  });

  it("GOZS-340: Logout desde Coach Studio o Landing sin storage previo recupera ID via auth.getUser y purga datos", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "user-landing-456", email: "admin@gozster.com" } },
    });

    mem.set("gozster-athlete-store:user-landing-456", JSON.stringify({ data: "secret" }));
    mem.set("gozster-clases", JSON.stringify({ clases: [1, 2] }));

    await cerrarSesion();

    expect(mockSignOut).toHaveBeenCalled();
    expect(mem.has("gozster-athlete-store:user-landing-456")).toBe(false);
    expect(mem.has("gozster-clases")).toBe(false);
    expect((window.location.replace as any)).toHaveBeenCalledWith("/login");
  });

  it("GOZS-340: Aliases cerrarSesionUniversal y cerrarSesionAlumno son equivalentes a cerrarSesion", () => {
    expect(cerrarSesionAlumno).toBe(cerrarSesion);
    expect(cerrarSesionUniversal).toBe(cerrarSesion);
  });
});
