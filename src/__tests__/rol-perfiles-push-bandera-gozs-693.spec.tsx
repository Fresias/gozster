import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverClient = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => serverClient.current }));
vi.mock("@/services/alumnos-service", () => ({
  fetchLiveDatasetFromSupabase: vi.fn().mockResolvedValue(null),
  fetchAlumnosEstancados: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/components/coach/coach-studio-view", () => ({ CoachStudioView: () => null }));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

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

import CoachStudioPage from "@/app/(coach)/studio/page";
import { AthleteChat } from "@/components/athlete/athlete-chat";
import { pushHabilitado } from "@/lib/push-notifications";
import { useChatStore } from "@/store/use-chat-store";

function clienteCon(perfil: { rol: string; nombre_completo: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: perfil });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "coach-1", user_metadata: { rol: "ADMIN", nombre_completo: "Meta Nombre" } } },
      }),
    },
    from: vi.fn().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  };
}

async function propsDelStudio() {
  vi.stubGlobal("React", React); // page.tsx usa JSX sin importar React (runtime clásico en vitest)
  const el = (await CoachStudioPage({})) as React.ReactElement<{ userRole: string; coachName: string }>;
  return el.props;
}

describe("GOZS-693: rol desde perfiles y push detrás de bandera", () => {
  beforeEach(() => {
    useChatStore.getState().setAthleteChatOpen(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("GIVEN un ENTRENADOR con user_metadata.rol = ADMIN WHEN entra al Studio THEN el rol sale de perfiles.rol", async () => {
    serverClient.current = clienteCon({ rol: "ENTRENADOR", nombre_completo: "Coach Real" });
    const props = await propsDelStudio();
    expect(props.userRole).toBe("ENTRENADOR");
    expect(props.coachName).toBe("Coach Real");
  });

  it("GIVEN un usuario sin perfil WHEN entra al Studio THEN degrada a ENTRENADOR sin nombre por defecto", async () => {
    serverClient.current = clienteCon(null);
    const props = await propsDelStudio();
    expect(props.userRole).toBe("ENTRENADOR");
    expect(props.coachName).toBe("");
  });

  it("GIVEN la bandera sin definir WHEN se abre el chat del alumno THEN no aparece la opción de avisos push", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_PUSH", "");
    expect(pushHabilitado()).toBe(false);
    const html = renderToStaticMarkup(<AthleteChat athleteId="alumno-1" athleteName="Alumno" />);
    expect(html).not.toContain('data-testid="push-subscription-container"');
    expect(html).not.toContain("Activar avisos");
  });

  it("GIVEN NEXT_PUBLIC_ENABLE_PUSH=true WHEN se abre el chat THEN la opción vuelve (PL-1)", () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_PUSH", "true");
    expect(pushHabilitado()).toBe(true);
    const html = renderToStaticMarkup(<AthleteChat athleteId="alumno-1" athleteName="Alumno" />);
    expect(html).toContain('data-testid="push-subscription-container"');
  });
});
