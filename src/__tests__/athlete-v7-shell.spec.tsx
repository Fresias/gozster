import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/athlete",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => ({
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user-id", email: "atleta@gozster.com" } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
  SUPABASE_URL: "http://localhost",
  SUPABASE_ANON_KEY: "x",
}));

vi.mock("@/store/use-athlete-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-athlete-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useAthleteStore.getState()) : mod.useAthleteStore.getState()),
    mod.useAthleteStore,
  );
  return { ...mod, useAthleteStore: hook };
});

vi.mock("@/store/use-offline-queue", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-offline-queue")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useOfflineQueueStore.getState()) : mod.useOfflineQueueStore.getState()),
    mod.useOfflineQueueStore,
  );
  return { ...mod, useOfflineQueueStore: hook };
});

import { AthleteThemeButton } from "@/components/athlete/athlete-theme-button";
import { AthleteShell, estadoChipRed } from "@/components/athlete/athlete-shell";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

describe("Athlete v7 · FE-02 Shell (CP1)", () => {
  beforeEach(() => {
    useAthleteStore.setState({
      onboardingCompletado: true,
      diaActivoId: null,
      restTimer: {
        isActive: false,
        isPaused: false,
        secondsRemaining: 0,
        totalSeconds: 0,
        exerciseName: "",
        setNumber: 1,
      },
    });
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
  });

  it("AthleteThemeButton usa a-icon-btn, data-testid='theme-toggle' y aria-label de v7", () => {
    const html = renderToStaticMarkup(<AthleteThemeButton />);
    expect(html).toContain('data-testid="theme-toggle"');
    expect(html).toContain("a-icon-btn");
    expect(html).toContain('aria-label="Usar tema claro"');
  });

  it("estadoChipRed cubre los 4 estados de red de 02-pantallas.md §0", () => {
    expect(estadoChipRed(true, 0, 0)).toEqual({
      texto: "Online",
      ariaLabel: "Online",
      esOff: false,
    });
    expect(estadoChipRed(false, 0, 0)).toEqual({
      texto: "Sin señal · se guarda igual",
      ariaLabel: "Sin señal · se guarda igual",
      esOff: true,
    });
    expect(estadoChipRed(false, 1, 0)).toEqual({
      texto: "Sin señal · 1 serie",
      ariaLabel: "Sin señal, 1 serie guardada en el teléfono",
      esOff: true,
    });
    expect(estadoChipRed(false, 3, 0)).toEqual({
      texto: "Sin señal · 3 series",
      ariaLabel: "Sin señal, 3 series guardadas en el teléfono",
      esOff: true,
    });
    expect(estadoChipRed(true, 3, 3)).toEqual({
      texto: "Enviando 3 series…",
      ariaLabel: "Enviando 3 series…",
      esOff: true,
    });
    expect(estadoChipRed(true, 1, 1)).toEqual({
      texto: "Enviando 1 serie…",
      ariaLabel: "Enviando 1 serie…",
      esOff: true,
    });
  });

  it("AthleteShell renderiza franja .a-chev, encabezado .a-ahead, logo de 19px y chip-red", () => {
    const html = renderToStaticMarkup(
      <AthleteShell>
        <div>Contenido</div>
      </AthleteShell>,
    );

    expect(html).toContain("a-chev");
    expect(html).toContain("a-ahead");
    expect(html).toContain('data-testid="chip-red"');
    expect(html).toContain("Online");
    expect(html).toContain("a-logo");
    expect(html).toContain('aria-label="Cerrar sesión"');
    expect(html).not.toContain("Modo Avión");
  });

  it("AthleteShell sin señal y con series pendientes muestra 'Sin señal · 3 series'", () => {
    useOfflineQueueStore.setState({
      isOnline: false,
      pendingEvents: [
        { id: "1", action: "WORKOUT_SET_COMPLETED", payload: {}, createdAt: "2026-11-17T10:00:00Z" },
        { id: "2", action: "WORKOUT_SET_COMPLETED", payload: {}, createdAt: "2026-11-17T10:01:00Z" },
        { id: "3", action: "WORKOUT_SET_UPDATED", payload: {}, createdAt: "2026-11-17T10:02:00Z" },
        { id: "4", action: "ENVIAR_MENSAJE_CHAT", payload: {}, createdAt: "2026-11-17T10:03:00Z" },
      ],
    });

    const html = renderToStaticMarkup(
      <AthleteShell>
        <div>Contenido</div>
      </AthleteShell>,
    );

    expect(html).toContain("Sin señal · 3 series");
    expect(html).toContain('aria-label="Sin señal, 3 series guardadas en el teléfono"');
    expect(html).toContain("a-off");
  });
});
