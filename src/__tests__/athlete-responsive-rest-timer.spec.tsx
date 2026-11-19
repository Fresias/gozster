import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

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

// renderToStaticMarkup lee el snapshot de servidor (estado inicial): el hook lee el estado vivo sembrado en beforeEach.
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

import { RestTimer } from "@/components/athlete/rest-timer";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

describe("GOZS-495 Athlete App: Cronómetro de descanso + estructura responsive con logotipo GOZS", () => {
  beforeEach(() => {
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
      mostrarTimerDescanso: true,
    });
    useOfflineQueueStore.setState({
      isOnline: true,
      pendingEvents: [],
      syncError: null,
    });
  });

  describe("A. Cronómetro de descanso (RestTimer)", () => {
    it("GIVEN descanso inactivo THEN no renderiza nada", () => {
      const html = renderToStaticMarkup(<RestTimer />);
      expect(html).toBe("");
    });

    it("GIVEN descanso activo a 390 px THEN renderiza con tokens de componente, tiempo a 60px y botones quick", () => {
      useAthleteStore.getState().startRestTimer(90, "Press de Banca", 2);

      const html = renderToStaticMarkup(<RestTimer />);

      // Banner accesible y posicionado como tarjeta en desktop y fijo en mobile
      expect(html).toContain('data-testid="rest-timer-banner"');
      expect(html).toContain('aria-label="Temporizador de descanso"');
      expect(html).toContain("fixed inset-x-0 bottom-0 z-40");
      expect(html).toContain("lg:w-[400px]");
      expect(html).toContain("lg:bottom-6");
      expect(html).toContain("lg:right-6");
      expect(html).toContain("lg:rounded-2xl");
      expect(html).toContain("lg:border");
      expect(html).toContain("lg:shadow-m3-2");
      expect(html).toContain("bg-rest-timer");

      // Progress bar accesible
      expect(html).toContain('role="progressbar"');
      expect(html).toContain('aria-label="Progreso del descanso"');
      expect(html).toContain("bg-rest-timer-track");
      expect(html).toContain("bg-rest-timer-fill");

      // Tiempo en dígitos 60px (text-6xl) tabular-nums
      expect(html).toContain('role="timer"');
      expect(html).toContain('aria-live="off"');
      expect(html).toContain("text-6xl font-black leading-none tracking-tight tabular-nums text-rest-timer-time");
      expect(html).toContain("01:30");

      // Datos de serie y ejercicio
      expect(html).toContain("Press de Banca · Serie 2");
      expect(html).toContain("Descanso");

      // 4 botones ergonómicos quick (56px) en el orden aprobado: −30 s, +30 s, Pausa, Omitir
      expect(html).toContain("−30 s");
      expect(html).toContain("+30 s");
      expect(html).toContain("Omitir");
      expect(html).toContain('aria-label="Restar 30 segundos"');
      expect(html).toContain('aria-label="Sumar 30 segundos"');
      expect(html).toContain('aria-label="Pausar descanso"');
    });

    it("GIVEN descanso pausado THEN muestra 'Pausado', ícono Play y tokens de pausa", () => {
      useAthleteStore.getState().startRestTimer(60, "Sentadilla", 1);
      useAthleteStore.getState().pauseTimer();

      const html = renderToStaticMarkup(<RestTimer />);

      expect(html).toContain("Pausado");
      expect(html).toContain("text-rest-timer-paused");
      expect(html).toContain("bg-rest-timer-paused");
      expect(html).toContain('aria-label="Reanudar descanso"');
    });
  });

  describe("B. Estructura Responsive de Athlete App (AthleteShell v7)", () => {
    it("GIVEN vista en escritorio THEN mantiene columna centrada de max-width 28rem sin riel lateral (02 §0)", () => {
      const html = renderToStaticMarkup(
        <AthleteShell>
          <div data-testid="contenido">Rutina de hoy</div>
        </AthleteShell>,
      );

      expect(html).toContain("a-app");
      expect(html).toContain("a-scroll");
      expect(html).not.toContain("lg:grid-cols-[240px_minmax(0,1fr)]");

      const cssContent = fs.readFileSync(
        path.resolve(process.cwd(), "src/app/(athlete)/athlete/athlete-v7.css"),
        "utf-8",
      );
      expect(cssContent).toContain("max-width: 28rem;");
    });

    it("GIVEN vista en mobile (390 px) THEN el header muestra franja .a-chev, logotipo GOZS y controles v7 en una línea", () => {
      const html = renderToStaticMarkup(
        <AthleteShell>
          <div>Contenido</div>
        </AthleteShell>,
      );

      expect(html).toContain("a-chev");
      expect(html).toContain("a-ahead");

      // Logotipos bimodal día / noche
      expect(html).toContain('src="/brand/gozs-logo-negro.png"');
      expect(html).toContain("dark:hidden");
      expect(html).toContain('src="/brand/gozs-logo-blanco.png"');
      expect(html).toContain("hidden dark:block");
      expect(html).toContain("a-logo");

      // Chip Online v7
      expect(html).toContain('data-testid="chip-red"');
      expect(html).toContain("Online");
      expect(html).toContain("a-net");

      // Botón Cerrar Sesión con .a-icon-btn y texto sr-only
      expect(html).toContain("a-icon-btn");
      expect(html).toContain('aria-label="Cerrar sesión"');
      expect(html).toContain('<span class="sr-only">Cerrar Sesión</span>');
    });

    it("GIVEN desconexión THEN el chip de red muestra 'Sin señal · se guarda igual' y clase a-off (y conteo con series pendientes)", () => {
      useOfflineQueueStore.setState({ isOnline: false, pendingEvents: [] });

      const htmlSinPendientes = renderToStaticMarkup(
        <AthleteShell>
          <div>Contenido</div>
        </AthleteShell>,
      );

      expect(htmlSinPendientes).toContain("Sin señal · se guarda igual");
      expect(htmlSinPendientes).toContain("a-off");

      useOfflineQueueStore.setState({
        isOnline: false,
        pendingEvents: [
          { id: "s1", action: "WORKOUT_SET_COMPLETED", payload: {}, createdAt: "2026-11-17T10:00:00Z" },
          { id: "s2", action: "WORKOUT_SET_COMPLETED", payload: {}, createdAt: "2026-11-17T10:01:00Z" },
        ],
      });

      const htmlConPendientes = renderToStaticMarkup(
        <AthleteShell>
          <div>Contenido</div>
        </AthleteShell>,
      );

      expect(htmlConPendientes).toContain("Sin señal · 2 series");
      expect(htmlConPendientes).toContain('aria-label="Sin señal, 2 series guardadas en el teléfono"');
    });

    it("GIVEN navegación inferior v7 THEN cuenta con las 4 secciones, pastilla .a-ni y aria-current='page'", () => {
      const html = renderToStaticMarkup(
        <AthleteShell>
          <div>Contenido</div>
        </AthleteShell>,
      );

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
      expect(html).toContain("a-ni");
    });
  });

  describe("C. Verificación Anti-Hardcodeo y WCAG (Filosofía Karpathy/Ponytail)", () => {
    it("GIVEN rest-timer.tsx THEN no contiene valores hex ni clases de paleta hardcodeadas", () => {
      const filePath = path.resolve(process.cwd(), "src/components/athlete/rest-timer.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).not.toMatch(/#[0-9a-fA-F]{3,6}/);
      expect(content).not.toMatch(/\b(amber|emerald|zinc|slate)-[0-9]{2,3}\b/);
    });

    it("GIVEN athlete-shell.tsx THEN no contiene valores hex ni clases de paleta hardcodeadas", () => {
      const filePath = path.resolve(process.cwd(), "src/components/athlete/athlete-shell.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).not.toMatch(/#[0-9a-fA-F]{3,6}/);
      expect(content).not.toMatch(/\b(amber|emerald|zinc|slate)-[0-9]{2,3}\b/);
    });

    it("GIVEN los archivos de logotipo en public/brand THEN ambos existen y pesan menos de 50 KB", () => {
      const negroPath = path.resolve(process.cwd(), "public/brand/gozs-logo-negro.png");
      const blancoPath = path.resolve(process.cwd(), "public/brand/gozs-logo-blanco.png");

      expect(fs.existsSync(negroPath)).toBe(true);
      expect(fs.existsSync(blancoPath)).toBe(true);

      const negroStats = fs.statSync(negroPath);
      const blancoStats = fs.statSync(blancoPath);

      expect(negroStats.size).toBeLessThan(50 * 1024);
      expect(blancoStats.size).toBeLessThan(50 * 1024);
      expect(negroStats.size).toBeGreaterThan(1000);
      expect(blancoStats.size).toBeGreaterThan(1000);
    });

    it("GIVEN live-workout.tsx THEN su contenedor principal usa pb-44 para no tapar acciones con el timer", () => {
      const filePath = path.resolve(process.cwd(), "src/components/athlete/live-workout.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).toContain('data-testid="live-workout-container"');
      expect(content).toContain("pb-44");
    });
  });
});
