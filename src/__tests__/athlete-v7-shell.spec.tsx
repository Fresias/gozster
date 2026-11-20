import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockPathname = "/athlete";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
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

vi.mock("@/store/use-chat-store", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/store/use-chat-store")>();
  const hook = Object.assign(
    (sel?: (s: any) => unknown) => (sel ? sel(mod.useChatStore.getState()) : mod.useChatStore.getState()),
    mod.useChatStore,
  );
  return { ...mod, useChatStore: hook };
});

import { AthleteThemeButton } from "@/components/athlete/athlete-theme-button";
import { AthleteBottomNav } from "@/components/athlete/athlete-bottom-nav";
import { AthleteChat } from "@/components/athlete/athlete-chat";
import {
  AthleteShell,
  debeOcultarNavegacion,
  estadoChipRed,
  IndicadorEstadoRed,
} from "@/components/athlete/athlete-shell";
import { useAthleteStore } from "@/store/use-athlete-store";
import { DEFAULT_ATHLETE_SENDER, STAFF_COACH_PRINCIPAL, useChatStore } from "@/store/use-chat-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

describe("Athlete v7 · FE-02 Shell (CP1–CP3)", () => {
  beforeEach(() => {
    mockPathname = "/athlete";
    useChatStore.getState().resetToDefaults();
    useChatStore.getState().markAsRead(DEFAULT_ATHLETE_SENDER.id);
    useAthleteStore.setState({
      onboardingCompletado: true,
      diaActivoId: null,
      ejercicioAbiertoId: null,
      cierreAbierto: false,
      cuestionarioAbierto: false,
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

  it("AthleteShell renderiza encabezado .a-ahead, logo de 19px y 1 solo ícono verde (online) sin texto ni .a-chev", () => {
    const html = renderToStaticMarkup(
      <AthleteShell>
        <div>Contenido</div>
      </AthleteShell>,
    );

    expect(html).not.toContain("a-chev");
    expect(html).toContain("a-ahead");
    expect(html).toContain('data-testid="chip-red"');
    expect(html).toContain('data-testid="online-dot-icon"');
    expect(html).not.toContain('data-testid="plane-icon-ios"');
    expect(html).not.toContain('data-testid="plane-icon-android"');
    expect(html).not.toContain(">Online<");
    expect(html).toContain("a-logo");
    expect(html).toContain('aria-label="Cerrar sesión"');
    expect(html).not.toContain('data-testid="network-status-popover"');
  });

  it("AthleteShell sin señal muestra solo el ícono de avión SVG (sin texto visible) y aria-label con series pendientes", () => {
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

    expect(html).toContain('data-testid="plane-icon-ios"');
    expect(html).not.toContain('data-testid="online-dot-icon"');
    expect(html).not.toContain(">Sin señal · 3 series<");
    expect(html).toContain('aria-label="Sin señal, 3 series guardadas en el teléfono"');
    expect(html).toContain("a-off");
  });

  it("IndicadorEstadoRed diferencia SVG iOS vs Android en offline y abre popover breve role='dialog'", () => {
    const htmlIos = renderToStaticMarkup(
      <IndicadorEstadoRed isOnline={false} pendingSeriesCount={0} syncingSeriesCount={0} phoneOsOverride="ios" />,
    );
    expect(htmlIos).toContain('data-testid="plane-icon-ios"');
    expect(htmlIos).toContain("M22.2 12c0");

    const htmlAndroid = renderToStaticMarkup(
      <IndicadorEstadoRed isOnline={false} pendingSeriesCount={0} syncingSeriesCount={0} phoneOsOverride="android" />,
    );
    expect(htmlAndroid).toContain('data-testid="plane-icon-android"');
    expect(htmlAndroid).toContain("M21 16v-2l-8-5V3.5");

    const htmlPopover = renderToStaticMarkup(
      <IndicadorEstadoRed
        isOnline={false}
        pendingSeriesCount={0}
        syncingSeriesCount={0}
        phoneOsOverride="ios"
        initialPopoverOpen={true}
      />,
    );
    expect(htmlPopover).toContain('data-testid="network-status-popover"');
    expect(htmlPopover).toContain('role="dialog"');
    expect(htmlPopover).toContain("En línea");
    expect(htmlPopover).toContain("Modo avión");
    expect(htmlPopover).toContain("Tus series se guardan y sincronizan al instante.");
    expect(htmlPopover).toContain("Entrenás igual: se guarda en el teléfono y se envía al volver.");

    // Verificar interacción de toggle, Escape y clic afuera con hooks stub
    let setPopoverMock = vi.fn();
    let cleanupFn: (() => void) | undefined;
    const listeners: Record<string, (e: any) => void> = {};
    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = {
      addEventListener: (ev: string, fn: (e: any) => void) => {
        listeners[ev] = fn;
      },
      removeEventListener: vi.fn(),
    };
    const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
    const prevDispatcher = internals.H;
    let stateCall = 0;
    internals.H = {
      useState: (init: unknown) => {
        stateCall += 1;
        const val = typeof init === "function" ? (init as () => unknown)() : init;
        if (stateCall === 2) return [true, setPopoverMock];
        return [val, vi.fn()];
      },
      useEffect: (fn: () => void | (() => void)) => {
        const res = fn();
        if (typeof res === "function") cleanupFn = res;
      },
      useMemo: (fn: () => unknown) => fn(),
      useCallback: (fn: unknown) => fn,
      useRef: (v: unknown) => ({ current: v }),
    };
    try {
      const tree = IndicadorEstadoRed({
        isOnline: true,
        pendingSeriesCount: 0,
        syncingSeriesCount: 0,
      }) as any;
      const btn = tree.props.children[0];
      btn.props.onClick();
      expect(setPopoverMock).toHaveBeenCalledTimes(1);
      // Escape cierra el popover
      listeners.keydown?.({ key: "Escape" });
      expect(setPopoverMock).toHaveBeenCalledWith(false);
      cleanupFn?.();
    } finally {
      internals.H = prevDispatcher;
      (globalThis as any).document = prevDoc;
    }
  });

  it("AthleteBottomNav renderiza 4 secciones con .a-ni y aria-current='page' en /athlete", () => {
    const html = renderToStaticMarkup(<AthleteBottomNav />);
    expect(html).toContain('data-testid="nav-inferior"');
    expect(html).toContain("a-bnav");
    expect(html).toContain('href="/athlete"');
    expect(html).toContain('href="/athlete/historial"');
    expect(html).toContain('href="/athlete/progreso"');
    expect(html).toContain('href="/athlete/clases"');
    expect(html).toContain("Entrenar");
    expect(html).toContain("Historial");
    expect(html).toContain("Progreso");
    expect(html).toContain("Clases");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('class="a-ni"');
  });

  it("debeOcultarNavegacion oculta la nav en rutina, ejercicio, cierre, onboarding y cuestionario", () => {
    const base = {
      pathname: "/athlete",
      onboardingCompletado: true,
      diaActivoId: null,
      ejercicioAbiertoId: null,
      cierreAbierto: false,
      cuestionarioAbierto: false,
    };

    expect(debeOcultarNavegacion(base)).toBe(false);
    expect(debeOcultarNavegacion({ ...base, onboardingCompletado: false })).toBe(true);
    expect(debeOcultarNavegacion({ ...base, diaActivoId: "dia-1" })).toBe(true);
    expect(debeOcultarNavegacion({ ...base, ejercicioAbiertoId: "ej-1" })).toBe(true);
    expect(debeOcultarNavegacion({ ...base, cierreAbierto: true })).toBe(true);
    expect(debeOcultarNavegacion({ ...base, cuestionarioAbierto: true })).toBe(true);
    expect(debeOcultarNavegacion({ ...base, pathname: "/athlete/cuestionario" })).toBe(true);
    expect(debeOcultarNavegacion({ ...base, pathname: "/athlete/historial" })).toBe(false);
  });

  it("AthleteShell oculta nav-inferior en rutina y agrega clase a-no-nav", () => {
    useAthleteStore.setState({ diaActivoId: "dia-1" });
    const html = renderToStaticMarkup(
      <AthleteShell>
        <div>Rutina</div>
      </AthleteShell>,
    );
    expect(html).toContain("a-no-nav");
    expect(html).not.toContain('data-testid="nav-inferior"');
    expect(html).not.toContain('data-testid="athlete-chat-fab"');
  });

  it("AthleteShell renderiza botón flotante de chat .a-fab solo en Entrenar con insignia de no leídos", () => {
    useAthleteStore.setState({
      planAlumno: {
        alumnos: [{ id: DEFAULT_ATHLETE_SENDER.id, nombre_completo: "Lucas", rol: "ALUMNO" } as any],
        planes: [],
        dias: [],
        ejerciciosEnRutina: [],
        ejercicios: [],
      },
    });
    useChatStore.getState().sendMessage({
      alumnoId: DEFAULT_ATHLETE_SENDER.id,
      remitente: STAFF_COACH_PRINCIPAL,
      contenido: "Mensaje nuevo del coach",
    });

    const htmlInicio = renderToStaticMarkup(
      <AthleteShell>
        <div>Inicio</div>
      </AthleteShell>,
    );
    expect(htmlInicio).toContain('data-testid="athlete-chat-fab"');
    expect(htmlInicio).toContain("a-fab");
    expect(htmlInicio).toContain('aria-label="Chat con el coach, 1 mensaje nuevo"');
    expect(htmlInicio).toContain('data-testid="unread-chat-badge"');

    mockPathname = "/athlete/historial";
    const htmlHist = renderToStaticMarkup(
      <AthleteShell>
        <div>Historial</div>
      </AthleteShell>,
    );
    expect(htmlHist).not.toContain('data-testid="athlete-chat-fab"');
    expect(htmlHist).toContain('data-testid="nav-inferior"');
  });

  it("AthleteChat ya no renderiza disparador propio cuando está cerrado y muestra hoja al abrirse", () => {
    expect(renderToStaticMarkup(<AthleteChat />)).toBe("");

    useChatStore.getState().setAthleteChatOpen(true);
    const htmlOpen = renderToStaticMarkup(<AthleteChat />);
    expect(htmlOpen).toContain('id="athlete-chat-drawer"');
  });
});
