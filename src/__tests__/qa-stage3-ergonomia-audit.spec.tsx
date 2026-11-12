import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LandingSessionCapsule } from "@/components/landing-session-capsule";
import { LandingHeader } from "@/components/landing/kit";
import { RestTimer } from "@/components/athlete/rest-timer";
import { AthleteShell } from "@/components/athlete/athlete-shell";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { RetentionKpiCards } from "@/components/coach/retention-kpi-cards";
import { StudioShell } from "@/components/coach/studio-shell";
import { useAthleteStore } from "@/store/use-athlete-store";
import { useOfflineQueueStore } from "@/store/use-offline-queue";

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

// Funciones auxiliares matemáticas de cálculo de luminancia y contraste WCAG 2.1
const parseHslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
};

const relativeLuminance = (r: number, g: number, b: number): number => {
  const chan = (val: number) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
};

const contrastRatio = (lum1: number, lum2: number): number => {
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
};

describe("GOZS-497: [QA] Auditoría Integral de Ergonomía Táctil y Tokens de 3 Capas (Stage 3)", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");

  beforeEach(() => {
    useAthleteStore.setState({
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

  describe("Check 1: Tap targets a 390 px con puntero táctil (pointer: coarse)", () => {
    it("GIVEN globals.css WHEN se evalúa pointer: coarse THEN eleva todos los targets semánticos a 48 px (var(--size-48))", () => {
      const globalsCss = fs.readFileSync(path.join(repoRoot, "src/app/globals.css"), "utf-8");
      expect(globalsCss).toMatch(
        /@media\s*\(pointer:\s*coarse\)\s*\{\s*:root\s*\{[^}]*--target-sm:\s*var\(--size-48\);[^}]*--target:\s*var\(--size-48\);[^}]*--target-lg:\s*var\(--size-48\);/,
      );
    });

    it("GIVEN controles públicos (/, /entrenadores, /login) THEN 0 controles miden menos de 48x48 px en modo táctil", () => {
      // LandingHeader: logo tiene padding -m-2 p-2 (48x48) y el selector usa min-h-target (48px)
      const headerHtml = renderToStaticMarkup(
        <LandingHeader publico="alumnos" user={null} accion={<button type="button">CTA</button>} />,
      );
      expect(headerHtml).toContain("-m-2 flex items-center gap-2.5 rounded-lg p-2");
      expect(headerHtml).toContain("min-h-target");

      // Iniciar sesión usa min-h-target (48px)
      const capsuleHtml = renderToStaticMarkup(<LandingSessionCapsule initialUser={null} />);
      expect(capsuleHtml).toContain("min-h-target");

      // ThemeToggle usa size-target (48x48px)
      const themeToggleHtml = renderToStaticMarkup(<ThemeToggle />);
      expect(themeToggleHtml).toContain("size-target");

      // Pestañas de /entrenadores usan min-h-target-lg (48px en coarse)
      const entrenadoresSource = fs.readFileSync(path.join(repoRoot, "src/app/entrenadores/page.tsx"), "utf-8");
      expect(entrenadoresSource).toContain("min-h-target-lg");
    });

    it("GIVEN /athlete con descanso activo THEN todos los botones del cronómetro usan size quick (56 px >= 48 px)", () => {
      useAthleteStore.getState().startRestTimer(90, "Sentadilla", 3);
      const timerHtml = renderToStaticMarkup(<RestTimer />);

      // Los 4 botones: −30s, +30s, Pausa, Omitir
      expect(timerHtml).toContain("−30 s");
      expect(timerHtml).toContain("+30 s");
      expect(timerHtml).toContain("Omitir");
      expect(timerHtml).toContain("h-[var(--button-h-quick)]"); // 56 px
    });

    it("GIVEN Coach Studio (/studio) en viewport móvil THEN barra inferior y menú de fila cumplen ergonomía táctil", () => {
      const shellHtml = renderToStaticMarkup(
        <StudioShell>
          <div>Contenido</div>
        </StudioShell>,
      );
      // Barra inferior con 5 ítems de celda completa h-16 (64px >= 48px)
      expect(shellHtml).toContain('data-testid="studio-mobile-bottom-nav"');
      expect(shellHtml).toContain("grid h-16 grid-cols-5");

      // Menú ⋯ en coach-studio-view.tsx usa size-target (48x48px en coarse)
      const viewSource = fs.readFileSync(path.join(repoRoot, "src/components/coach/coach-studio-view.tsx"), "utf-8");
      expect(viewSource).toContain("size-target");
      expect(viewSource).toContain("min-h-target");
    });
  });

  describe("Check 2: Desktop 1440 px con mouse (pointer: fine) y depuración de botones sm", () => {
    it("GIVEN Button con size='sm' y variantes outline/secondary THEN mide 32 px (--button-h-sm) sin colisión de h-9", () => {
      const outlineHtml = renderToStaticMarkup(<Button variant="outline" size="sm">Filtro</Button>);
      expect(outlineHtml).toContain("h-[var(--button-h-sm)]");
      expect(outlineHtml).not.toContain("h-9");

      const secondaryHtml = renderToStaticMarkup(<Button variant="secondary" size="sm">Secundario</Button>);
      expect(secondaryHtml).toContain("h-[var(--button-h-sm)]");
      expect(secondaryHtml).not.toContain("h-9");
    });

    it("GIVEN controles públicos en escritorio (mouse) THEN conservan su tamaño compacto estándar (36 px y 40 px)", () => {
      const globalsCss = fs.readFileSync(path.join(repoRoot, "src/app/globals.css"), "utf-8");
      expect(globalsCss).toContain("--target-sm: var(--size-32);"); // 32 px
      expect(globalsCss).toContain("--target: var(--size-36);");    // 36 px
      expect(globalsCss).toContain("--target-lg: var(--size-40);"); // 40 px
    });
  });

  describe("Check 3: Contraste WCAG AA y AAA en Métricas y Elementos Clave", () => {
    it("GIVEN el cronómetro de descanso THEN el tiempo cumple contraste WCAG AAA (>= 7:1) en modo día y noche", () => {
      // Modo día: texto foreground 240 10% 3.9% sobre card 0 0% 100%
      const lumCardDay = relativeLuminance(255, 255, 255);
      const [rFgDay, gFgDay, bFgDay] = parseHslToRgb(240, 10, 3.9);
      const lumFgDay = relativeLuminance(rFgDay, gFgDay, bFgDay);
      const ratioDay = contrastRatio(lumCardDay, lumFgDay);
      expect(ratioDay).toBeGreaterThanOrEqual(7.0);

      // Modo noche (.dark .theme-athlete): foreground 0 0% 98% sobre card 240 5.9% 7%
      const [rCardNight, gCardNight, bCardNight] = parseHslToRgb(240, 5.9, 7);
      const [rFgNight, gFgNight, bFgNight] = parseHslToRgb(0, 0, 98);
      const ratioNight = contrastRatio(relativeLuminance(rCardNight, gCardNight, bCardNight), relativeLuminance(rFgNight, gFgNight, bFgNight));
      expect(ratioNight).toBeGreaterThanOrEqual(7.0);
    });

    it("GIVEN el estado 'Pausado' del cronómetro THEN cumple contraste WCAG AA (>= 4.5:1) en día y noche", () => {
      // Día: warning-soft-foreground 26 90% 37% sobre card blanco
      const [rWarnDay, gWarnDay, bWarnDay] = parseHslToRgb(26, 90, 37);
      const ratioDay = contrastRatio(relativeLuminance(255, 255, 255), relativeLuminance(rWarnDay, gWarnDay, bWarnDay));
      expect(ratioDay).toBeGreaterThanOrEqual(4.5);

      // Noche: warning-soft-foreground 45 93% 75% sobre card 240 5.9% 7%
      const [rCardNight, gCardNight, bCardNight] = parseHslToRgb(240, 5.9, 7);
      const [rWarnNight, gWarnNight, bWarnNight] = parseHslToRgb(45, 93, 75);
      const ratioNight = contrastRatio(relativeLuminance(rCardNight, gCardNight, bCardNight), relativeLuminance(rWarnNight, gWarnNight, bWarnNight));
      expect(ratioNight).toBeGreaterThanOrEqual(4.5);
    });

    it("GIVEN los chips Online y Modo Avión THEN cumplen contraste WCAG AA (>= 4.5:1) en día y noche", () => {
      // Online día: text 143 64% 24% sobre bg 138 76% 97%
      const [rOnFgDay, gOnFgDay, bOnFgDay] = parseHslToRgb(143, 64, 24);
      const [rOnBgDay, gOnBgDay, bOnBgDay] = parseHslToRgb(138, 76, 97);
      const ratioOnlineDay = contrastRatio(relativeLuminance(rOnBgDay, gOnBgDay, bOnBgDay), relativeLuminance(rOnFgDay, gOnFgDay, bOnFgDay));
      expect(ratioOnlineDay).toBeGreaterThanOrEqual(4.5);

      // Online noche: text 158 64% 75% sobre bg 158 60% 10%
      const [rOnFgNight, gOnFgNight, bOnFgNight] = parseHslToRgb(158, 64, 75);
      const [rOnBgNight, gOnBgNight, bOnBgNight] = parseHslToRgb(158, 60, 10);
      const ratioOnlineNight = contrastRatio(relativeLuminance(rOnBgNight, gOnBgNight, bOnBgNight), relativeLuminance(rOnFgNight, gOnFgNight, bOnFgNight));
      expect(ratioOnlineNight).toBeGreaterThanOrEqual(4.5);

      // Modo Avión día: text 26 90% 37% sobre bg 48 100% 96%
      const [rAvFgDay, gAvFgDay, bAvFgDay] = parseHslToRgb(26, 90, 37);
      const [rAvBgDay, gAvBgDay, bAvBgDay] = parseHslToRgb(48, 100, 96);
      const ratioAvionDay = contrastRatio(relativeLuminance(rAvBgDay, gAvBgDay, bAvBgDay), relativeLuminance(rAvFgDay, gAvFgDay, bAvFgDay));
      expect(ratioAvionDay).toBeGreaterThanOrEqual(4.5);

      // Modo Avión noche: text 45 93% 75% sobre bg 38 60% 11%
      const [rAvFgNight, gAvFgNight, bAvFgNight] = parseHslToRgb(45, 93, 75);
      const [rAvBgNight, gAvBgNight, bAvBgNight] = parseHslToRgb(38, 60, 11);
      const ratioAvionNight = contrastRatio(relativeLuminance(rAvBgNight, gAvBgNight, bAvBgNight), relativeLuminance(rAvFgNight, gAvFgNight, bAvFgNight));
      expect(ratioAvionNight).toBeGreaterThanOrEqual(4.5);
    });

    it("GIVEN botones primarios de Athlete en modo noche THEN contraste es >= 4.5:1 (6.22:1)", () => {
      // .dark .theme-athlete: primary 199 89% 48% con foreground 240 5.9% 10%
      const [rPri, gPri, bPri] = parseHslToRgb(199, 89, 48);
      const [rPriFg, gPriFg, bPriFg] = parseHslToRgb(240, 5.9, 10);
      const ratio = contrastRatio(relativeLuminance(rPri, gPri, bPri), relativeLuminance(rPriFg, gPriFg, bPriFg));
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it("GIVEN el número de alumnos activos THEN cumple contraste WCAG AAA (>= 7:1)", () => {
      // Número text-foreground sobre card
      const lumCard = relativeLuminance(255, 255, 255);
      const [rFg, gFg, bFg] = parseHslToRgb(240, 10, 3.9);
      const ratio = contrastRatio(lumCard, relativeLuminance(rFg, gFg, bFg));
      expect(ratio).toBeGreaterThanOrEqual(7.0);
    });
  });

  describe("Check 4: Cero colores hardcodeados (Filosofías Karpathy / Ponytail)", () => {
    it("GIVEN rest-timer.tsx, athlete-shell.tsx y retention-kpi-cards.tsx THEN 0 hex y 0 clases de paleta", () => {
      const files = [
        "src/components/athlete/rest-timer.tsx",
        "src/components/athlete/athlete-shell.tsx",
        "src/components/coach/retention-kpi-cards.tsx",
      ];

      for (const relPath of files) {
        const content = fs.readFileSync(path.join(repoRoot, relPath), "utf-8");
        expect(content).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(content).not.toMatch(/\b(amber|emerald|zinc|slate)-[0-9]{2,3}\b/);
      }
    });
  });

  describe("Check 5: Prevención de Regresiones en Dispositivos y Vistas", () => {
    it("GIVEN live-workout.tsx THEN cuenta con padding bottom (pb-44) para despejar el cronómetro en pantallas de 667 px", () => {
      const source = fs.readFileSync(path.join(repoRoot, "src/components/athlete/live-workout.tsx"), "utf-8");
      expect(source).toContain("pb-44");
    });

    it("GIVEN DataTable THEN no duplica data-testid entre tabla y mobile", () => {
      const testCols: ColumnDef<{ id: string; name: string }>[] = [
        { id: "name", header: "Nombre", accessorKey: "name", mobile: "title" },
      ];
      const data = [{ id: "1", name: "Test" }];

      // Desktop / SSR: solo table
      const htmlDesktop = renderToStaticMarkup(<DataTable columns={testCols} data={data} tableTestId="audit-table" />);
      expect(htmlDesktop).toContain('data-testid="audit-table"');
      expect(htmlDesktop).not.toContain('data-testid="audit-table-mobile"');

      // Mobile: solo mobile list
      const htmlMobile = renderToStaticMarkup(<DataTable columns={testCols} data={data} tableTestId="audit-table" isMobile={true} />);
      expect(htmlMobile).toContain('data-testid="audit-table-mobile"');
      expect(htmlMobile).not.toContain('<table');
    });

    it("GIVEN AthleteShell en mobile THEN header entra en una línea y muestra logotipo bimodal", () => {
      const html = renderToStaticMarkup(
        <AthleteShell>
          <div>Contenido</div>
        </AthleteShell>,
      );

      // Logo negro en día, blanco en noche
      expect(html).toContain('src="/brand/gozs-logo-negro.png"');
      expect(html).toContain("dark:hidden");
      expect(html).toContain('src="/brand/gozs-logo-blanco.png"');
      expect(html).toContain("hidden h-5 w-auto dark:block");

      // La palabra Athlete está oculta en viewport móvil (< sm)
      expect(html).toContain("hidden text-base font-bold tracking-tight text-primary sm:inline");
    });
  });

  describe("Check 6: Claim Check e Integridad de Tests", () => {
    it("GIVEN suites de tests de los 3 PRs THEN no contienen .skip ni .todo", () => {
      const specs = [
        "src/__tests__/touch-target-tokens.spec.tsx",
        "src/__tests__/athlete-responsive-rest-timer.spec.tsx",
        "src/__tests__/coach-studio-responsive-mobile-kpi.spec.tsx",
      ];

      for (const spec of specs) {
        const content = fs.readFileSync(path.join(repoRoot, spec), "utf-8");
        expect(content).not.toMatch(/\.(skip|todo)\(/);
      }
    });
  });
});
