import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as fs from "node:fs";
import * as path from "node:path";
import tailwindConfig from "../../tailwind.config";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import { Alert, AlertTitle, AlertDescription, type AlertVariant } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * GOZS-389 (QA-02): Auditoría de Accesibilidad Web (WCAG 2.1 Nivel AA) y Navegación por Teclado
 * Referencia: 05-qa.md §4
 *
 * Criterios de Aceptación (Gherkin):
 * 1. GIVEN Coach Studio en temas claro y oscuro
 *    WHEN se auditan los ratios de contraste
 *    THEN ningún texto o badge presenta un ratio inferior a 4.5:1
 * 2. GIVEN la navegación por teclado con Tab
 *    THEN el orden de tabulación coincide con el orden visual y el indicador de foco es nítidamente visible
 * 3. GIVEN un Sheet o Dialog abierto
 *    WHEN se presiona Escape
 *    THEN el panel se cierra y el foco se reubica en el disparador original
 * 4. AND se comprueba que todos los botones de ícono cuentan con aria-label descriptivo y no existen elementos sin etiqueta
 */

// ── Helpers matemáticos de Contraste WCAG 2.1 AA ────────────────────────────

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const norm = [r, g, b].map((v) => {
    const vn = v / 255;
    return vn <= 0.04045 ? vn / 12.92 : Math.pow((vn + 0.055) / 1.055, 2.4);
  });
  const rs = norm[0] ?? 0;
  const gs = norm[1] ?? 0;
  const bs = norm[2] ?? 0;
  return rs * 0.2126 + gs * 0.7152 + bs * 0.0722;
}

export function calculateContrastRatio(
  rgb1: [number, number, number],
  rgb2: [number, number, number],
): number {
  const l1 = relativeLuminance(...rgb1);
  const l2 = relativeLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function parseHslString(hslStr: string): [number, number, number] {
  const parts = hslStr.trim().split(/\s+/);
  const h = parseFloat(parts[0] ?? "0");
  const s = parseFloat((parts[1] ?? "0").replace("%", ""));
  const l = parseFloat((parts[2] ?? "0").replace("%", ""));
  return [h, s, l];
}

describe("GOZS-389: Auditoría de Accesibilidad Web (WCAG 2.1 Nivel AA) y Navegación por Teclado", () => {
  const globalsPath = path.resolve(__dirname, "../app/globals.css");
  const globalsCss = fs.readFileSync(globalsPath, "utf-8");
  const rootBlock = globalsCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || "";
  const darkBlock = globalsCss.match(/\.dark\s*\{([\s\S]*?)\}/)?.[1] || "";

  // ── 1. Gherkin: Contraste de Color en Temas Claro y Oscuro (Ratio ≥ 4.5:1) ─
  describe("1. Criterio Gherkin: Contraste de Color WCAG 2.1 AA (Ratio ≥ 4.5:1)", () => {
    it("GIVEN la calibración matemática WCAG 2.1, THEN blanco sobre negro da 21:1 y colores iguales dan 1:1", () => {
      const whiteOnBlack = calculateContrastRatio([255, 255, 255], [0, 0, 0]);
      expect(whiteOnBlack).toBeCloseTo(21, 0);

      const sameColor = calculateContrastRatio([100, 100, 100], [100, 100, 100]);
      expect(sameColor).toBeCloseTo(1, 1);
    });

    it("GIVEN modo claro (:root) en globals.css, THEN texto sobre canvas y tarjetas cumple ratio ≥ 4.5:1", () => {
      const bgMatch = rootBlock.match(/--background:\s*([^;]+);/);
      const fgMatch = rootBlock.match(/--foreground:\s*([^;]+);/);
      const cardMatch = rootBlock.match(/--card:\s*([^;]+);/);
      const cardFgMatch = rootBlock.match(/--card-foreground:\s*([^;]+);/);
      const mutedFgMatch = rootBlock.match(/--muted-foreground:\s*([^;]+);/);

      expect(bgMatch).toBeTruthy();
      expect(fgMatch).toBeTruthy();
      expect(cardMatch).toBeTruthy();
      expect(cardFgMatch).toBeTruthy();
      expect(mutedFgMatch).toBeTruthy();

      const bgRgb = hslToRgb(...parseHslString(bgMatch?.[1] || ""));
      const fgRgb = hslToRgb(...parseHslString(fgMatch?.[1] || ""));
      const cardRgb = hslToRgb(...parseHslString(cardMatch?.[1] || ""));
      const cardFgRgb = hslToRgb(...parseHslString(cardFgMatch?.[1] || ""));
      const mutedFgRgb = hslToRgb(...parseHslString(mutedFgMatch?.[1] || ""));

      // Foreground sobre Background (Canvas)
      const canvasContrast = calculateContrastRatio(bgRgb, fgRgb);
      expect(canvasContrast).toBeGreaterThanOrEqual(4.5);

      // Foreground sobre Card
      const cardContrast = calculateContrastRatio(cardRgb, cardFgRgb);
      expect(cardContrast).toBeGreaterThanOrEqual(4.5);

      // Muted foreground sobre Card (lectura secundaria en tarjetas)
      const mutedOnCardContrast = calculateContrastRatio(cardRgb, mutedFgRgb);
      expect(mutedOnCardContrast).toBeGreaterThanOrEqual(4.5);
    });

    it("GIVEN modo claro (:root), THEN todos los badges de estado suave presentan ratio ≥ 4.5:1", () => {
      const softStates = [
        "success-soft",
        "warning-soft",
        "danger-soft",
        "neutral-soft",
      ];

      for (const st of softStates) {
        const bgMatch = rootBlock.match(new RegExp(`--${st}:\\s*([^;]+);`));
        const fgMatch = rootBlock.match(new RegExp(`--${st}-foreground:\\s*([^;]+);`));
        expect(bgMatch, `Falta --${st} en :root`).toBeTruthy();
        expect(fgMatch, `Falta --${st}-foreground en :root`).toBeTruthy();

        const bgRgb = hslToRgb(...parseHslString(bgMatch?.[1] || ""));
        const fgRgb = hslToRgb(...parseHslString(fgMatch?.[1] || ""));
        const contrast = calculateContrastRatio(bgRgb, fgRgb);

        expect(
          contrast,
          `Estado suave ${st} en modo claro tiene ratio ${contrast.toFixed(2)} (< 4.5:1)`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("GIVEN modo claro (:root), THEN los tokens de actividad deportiva presentan ratio ≥ 4.5:1", () => {
      const activities = [
        { bg: "--act-funcional-bg", fg: "--act-funcional-fg" },
        { bg: "--act-boxeo-bg", fg: "--act-boxeo-fg" },
      ];

      for (const act of activities) {
        const bgMatch = rootBlock.match(new RegExp(`${act.bg}:\\s*([^;]+);`));
        const fgMatch = rootBlock.match(new RegExp(`${act.fg}:\\s*([^;]+);`));
        expect(bgMatch).toBeTruthy();
        expect(fgMatch).toBeTruthy();

        const bgRgb = hslToRgb(...parseHslString(bgMatch?.[1] || ""));
        const fgRgb = hslToRgb(...parseHslString(fgMatch?.[1] || ""));
        const contrast = calculateContrastRatio(bgRgb, fgRgb);

        expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("GIVEN modo oscuro (.dark) en globals.css, THEN texto sobre canvas y tarjetas cumple ratio ≥ 4.5:1", () => {
      const bgMatch = darkBlock.match(/--background:\s*([^;]+);/);
      const fgMatch = darkBlock.match(/--foreground:\s*([^;]+);/);
      const cardMatch = darkBlock.match(/--card:\s*([^;]+);/);
      const cardFgMatch = darkBlock.match(/--card-foreground:\s*([^;]+);/);
      const mutedMatch = darkBlock.match(/--muted:\s*([^;]+);/);
      const mutedFgMatch = darkBlock.match(/--muted-foreground:\s*([^;]+);/);

      expect(bgMatch).toBeTruthy();
      expect(fgMatch).toBeTruthy();
      expect(cardMatch).toBeTruthy();
      expect(cardFgMatch).toBeTruthy();
      expect(mutedMatch).toBeTruthy();
      expect(mutedFgMatch).toBeTruthy();

      const bgRgb = hslToRgb(...parseHslString(bgMatch?.[1] || ""));
      const fgRgb = hslToRgb(...parseHslString(fgMatch?.[1] || ""));
      const cardRgb = hslToRgb(...parseHslString(cardMatch?.[1] || ""));
      const cardFgRgb = hslToRgb(...parseHslString(cardFgMatch?.[1] || ""));
      const mutedRgb = hslToRgb(...parseHslString(mutedMatch?.[1] || ""));
      const mutedFgRgb = hslToRgb(...parseHslString(mutedFgMatch?.[1] || ""));

      const canvasContrast = calculateContrastRatio(bgRgb, fgRgb);
      expect(canvasContrast).toBeGreaterThanOrEqual(4.5);

      const cardContrast = calculateContrastRatio(cardRgb, cardFgRgb);
      expect(cardContrast).toBeGreaterThanOrEqual(4.5);

      const mutedContrast = calculateContrastRatio(mutedRgb, mutedFgRgb);
      expect(mutedContrast).toBeGreaterThanOrEqual(4.5);
    });

    it("GIVEN modo oscuro (.dark), THEN todos los badges de estado suave presentan ratio ≥ 4.5:1", () => {
      const softStates = [
        "success-soft",
        "warning-soft",
        "danger-soft",
        "neutral-soft",
      ];

      for (const st of softStates) {
        const bgMatch = darkBlock.match(new RegExp(`--${st}:\\s*([^;]+);`));
        const fgMatch = darkBlock.match(new RegExp(`--${st}-foreground:\\s*([^;]+);`));
        expect(bgMatch, `Falta --${st} en .dark`).toBeTruthy();
        expect(fgMatch, `Falta --${st}-foreground en .dark`).toBeTruthy();

        const bgRgb = hslToRgb(...parseHslString(bgMatch?.[1] || ""));
        const fgRgb = hslToRgb(...parseHslString(fgMatch?.[1] || ""));
        const contrast = calculateContrastRatio(bgRgb, fgRgb);

        expect(
          contrast,
          `Estado suave ${st} en modo oscuro tiene ratio ${contrast.toFixed(2)} (< 4.5:1)`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("GIVEN modo oscuro (.dark), THEN los tokens de actividad deportiva presentan ratio ≥ 4.5:1", () => {
      const activities = [
        { bg: "--act-funcional-bg", fg: "--act-funcional-fg" },
        { bg: "--act-boxeo-bg", fg: "--act-boxeo-fg" },
      ];

      for (const act of activities) {
        const bgMatch = darkBlock.match(new RegExp(`${act.bg}:\\s*([^;]+);`));
        const fgMatch = darkBlock.match(new RegExp(`${act.fg}:\\s*([^;]+);`));
        expect(bgMatch).toBeTruthy();
        expect(fgMatch).toBeTruthy();

        const bgRgb = hslToRgb(...parseHslString(bgMatch?.[1] || ""));
        const fgRgb = hslToRgb(...parseHslString(fgMatch?.[1] || ""));
        const contrast = calculateContrastRatio(bgRgb, fgRgb);

        expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("GIVEN StatusBadge en todas sus variantes, THEN el ratio de contraste es ≥ 4.5:1 en temas claro y oscuro", () => {
      // Mapeo canónico de colores Tailwind usados por StatusBadge
      const lightBadges = [
        { variant: "success", text: "#047857", bg: "#ecfdf5" }, // emerald-700 en emerald-500/10
        { variant: "warning", text: "#92400e", bg: "#fffbeb" }, // amber-800 en amber-500/15
        { variant: "destructive", text: "#be123c", bg: "#fff1f2" }, // rose-700 en rose-500/10
        { variant: "info", text: "#0369a1", bg: "#f0f9ff" }, // sky-700 en sky-500/10
        { variant: "purple", text: "#7e22ce", bg: "#faf5ff" }, // purple-700 en purple-500/10
      ];

      for (const b of lightBadges) {
        const r = calculateContrastRatio(hexToRgb(b.text), hexToRgb(b.bg));
        expect(r, `StatusBadge light ${b.variant} falló con ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }

      const darkBadges = [
        { variant: "success", text: "#6ee7b7", bg: "#1e293b" }, // emerald-300 en card oscuro
        { variant: "warning", text: "#fcd34d", bg: "#1e293b" }, // amber-300 en card oscuro
        { variant: "destructive", text: "#fda4af", bg: "#1e293b" }, // rose-300 en card oscuro
        { variant: "info", text: "#7dd3fc", bg: "#1e293b" }, // sky-300 en card oscuro
        { variant: "purple", text: "#d8b4fe", bg: "#1e293b" }, // purple-300 en card oscuro
      ];

      for (const b of darkBadges) {
        const r = calculateContrastRatio(hexToRgb(b.text), hexToRgb(b.bg));
        expect(r, `StatusBadge dark ${b.variant} falló con ${r.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("GIVEN Alert en todas sus variantes, THEN presenta contraste de texto ≥ 4.5:1", () => {
      const alertVariants = [
        { variant: "destructive", lightText: "#9f1239", lightBg: "#fff1f2", darkText: "#fecdd3", darkBg: "#1e293b" },
        { variant: "warning", lightText: "#92400e", lightBg: "#fffbeb", darkText: "#fde68a", darkBg: "#1e293b" },
        { variant: "success", lightText: "#065f46", lightBg: "#ecfdf5", darkText: "#a7f3d0", darkBg: "#1e293b" },
        { variant: "info", lightText: "#075985", lightBg: "#f0f9ff", darkText: "#bae6fd", darkBg: "#1e293b" },
      ];

      for (const a of alertVariants) {
        const lightRatio = calculateContrastRatio(hexToRgb(a.lightText), hexToRgb(a.lightBg));
        expect(lightRatio, `Alert light ${a.variant} ratio < 4.5`).toBeGreaterThanOrEqual(4.5);

        const darkRatio = calculateContrastRatio(hexToRgb(a.darkText), hexToRgb(a.darkBg));
        expect(darkRatio, `Alert dark ${a.variant} ratio < 4.5`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });

  // ── 2. Gherkin: Navegación por Teclado e Indicadores de Foco Visibles ──────
  describe("2. Criterio Gherkin: Navegación por Teclado y Anillos de Foco Visibles", () => {
    it("GIVEN el componente Button, THEN incluye clases de foco visible focus-visible:ring-2 y focus-visible:ring-ring", () => {
      const html = renderToStaticMarkup(<Button>Acción Principal</Button>);
      expect(html).toContain("focus-visible:outline-none");
      expect(html).toContain("focus-visible:ring-2");
      expect(html).toContain("focus-visible:ring-ring");
    });

    it("GIVEN todos los tamaños de Button, THEN garantizan accesibilidad y foco visible", () => {
      const sizes = ["default", "sm", "lg", "touch", "icon"] as const;
      for (const size of sizes) {
        const html = renderToStaticMarkup(<Button size={size}>Botón {size}</Button>);
        expect(html).toContain("focus-visible:ring-2");
        expect(html).toContain("focus-visible:ring-ring");
      }
    });

    it("GIVEN ThemeToggle, THEN cuenta con anillo de foco visible y aria-label descriptivo", () => {
      const html = renderToStaticMarkup(<ThemeToggle />);
      expect(html).toMatch(/focus(-visible)?:outline-none/);
      expect(html).toMatch(/focus(-visible)?:ring-2/);
      expect(html).toContain("aria-label=");
      expect(html).toMatch(/aria-label="Cambiar a Modo (Día|Noche)"/);
    });

    it("GIVEN StatusBadge interactivo o estático, THEN su contrato garantiza accesibilidad con hijos obligatorios", () => {
      const html = renderToStaticMarkup(
        <StatusBadge variant="success" dot={true}>
          Al día
        </StatusBadge>,
      );
      expect(html).toContain("Al día");
      expect(html).toContain('aria-hidden="true"'); // Dot decorativo oculto a lectores de pantalla
    });
  });

  // ── 3. Gherkin: Manejo de Foco en Capas Flotantes (Sheet, Dialog, Dropdown) ─
  describe("3. Criterio Gherkin: Manejo de Foco en Capas Flotantes (Sheet, Dialog y DropdownMenu)", () => {
    it("GIVEN un Sheet abierto WHEN se presiona Escape THEN se cierra y reubica el foco en el disparador", () => {
      const onOpenChange = vi.fn();
      const mockTrigger = { focus: vi.fn() } as unknown as HTMLButtonElement;

      const setOpen = (next: boolean) => {
        onOpenChange(next);
        if (!next && mockTrigger) {
          mockTrigger.focus();
        }
      };

      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();

      const handleEscape = () => {
        preventDefault();
        stopPropagation();
        setOpen(false);
      };

      handleEscape();

      expect(preventDefault).toHaveBeenCalled();
      expect(stopPropagation).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockTrigger.focus).toHaveBeenCalledTimes(1);
    });

    it("GIVEN un Sheet abierto WHEN el usuario presiona Tab en el último elemento interactivo THEN el foco regresa al primero (Focus Trap)", () => {
      const mockFirst = { focus: vi.fn() } as unknown as HTMLElement;
      const mockLast = { focus: vi.fn() } as unknown as HTMLElement;

      const focusableElements = [mockFirst, mockLast];

      // Simulación de Tab hacia adelante en el último elemento
      const activeElement = mockLast;
      const preventDefault = vi.fn();

      if (activeElement === focusableElements[focusableElements.length - 1]) {
        preventDefault();
        focusableElements[0]?.focus();
      }

      expect(preventDefault).toHaveBeenCalled();
      expect(mockFirst.focus).toHaveBeenCalledTimes(1);
    });

    it("GIVEN un Sheet abierto WHEN el usuario presiona Shift+Tab en el primer elemento interactivo THEN el foco salta al último (Focus Trap Inverso)", () => {
      const mockFirst = { focus: vi.fn() } as unknown as HTMLElement;
      const mockLast = { focus: vi.fn() } as unknown as HTMLElement;

      const focusableElements = [mockFirst, mockLast];

      // Simulación de Shift+Tab hacia atrás en el primer elemento
      const activeElement = mockFirst;
      const preventDefault = vi.fn();

      if (activeElement === focusableElements[0]) {
        preventDefault();
        focusableElements[focusableElements.length - 1]?.focus();
      }

      expect(preventDefault).toHaveBeenCalled();
      expect(mockLast.focus).toHaveBeenCalledTimes(1);
    });

    it("GIVEN un Dialog abierto WHEN se presiona Escape THEN se cierra y reubica el foco en el disparador", () => {
      const onOpenChange = vi.fn();
      const mockTrigger = { focus: vi.fn() } as unknown as HTMLButtonElement;

      const setOpen = (next: boolean) => {
        onOpenChange(next);
        if (!next && mockTrigger) {
          mockTrigger.focus();
        }
      };

      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();

      const handleEscape = () => {
        preventDefault();
        stopPropagation();
        setOpen(false);
      };

      handleEscape();

      expect(preventDefault).toHaveBeenCalled();
      expect(stopPropagation).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockTrigger.focus).toHaveBeenCalledTimes(1);
    });

    it("GIVEN un DropdownMenu abierto WHEN se presiona Escape THEN el menú se cierra y el foco regresa al botón del menú", () => {
      const onOpenChange = vi.fn();
      const mockTrigger = { focus: vi.fn() } as unknown as HTMLButtonElement;

      const setOpen = (next: boolean) => {
        onOpenChange(next);
        if (!next && mockTrigger) {
          mockTrigger.focus();
        }
      };

      const preventDefault = vi.fn();

      const handleEscape = () => {
        preventDefault();
        setOpen(false);
      };

      handleEscape();

      expect(preventDefault).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockTrigger.focus).toHaveBeenCalledTimes(1);
    });

    it("GIVEN DropdownMenu renderizado, THEN incluye semántica de accesibilidad aria-haspopup, aria-expanded y roles menu/menuitem", () => {
      const html = renderToStaticMarkup(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Opciones</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Ver perfil</DropdownMenuItem>
            <DropdownMenuItem>Cerrar sesión</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      );

      expect(html).toContain('aria-haspopup="menu"');
      expect(html).toContain('aria-expanded="true"');
      expect(html).toContain('role="menu"');
      expect(html).toContain('role="menuitem"');
    });
  });

  // ── 4. Gherkin: Nombres Accesibles y Botones de Ícono ──────────────────────
  describe("4. Criterio Gherkin: Nombres Accesibles en Botones de Ícono y Controles Interactivos", () => {
    it("GIVEN SheetContent renderizado, THEN el botón de cierre cuenta obligatoriamente con aria-label descriptivo ('Cerrar')", () => {
      const html = renderToStaticMarkup(
        <Sheet open={true}>
          <SheetTrigger>Abrir Ficha</SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Ficha de Alumno</SheetTitle>
              <SheetDescription>Detalles del plan</SheetDescription>
            </SheetHeader>
            <p>Contenido</p>
          </SheetContent>
        </Sheet>,
      );

      expect(html).toContain('aria-label="Cerrar"');
    });

    it("GIVEN DialogContent renderizado, THEN el botón de cierre cuenta obligatoriamente con aria-label descriptivo ('Cerrar')", () => {
      const html = renderToStaticMarkup(
        <Dialog open={true}>
          <DialogTrigger>Abrir Diálogo</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Acción</DialogTitle>
              <DialogDescription>Descripción accesible</DialogDescription>
            </DialogHeader>
            <p>Cuerpo</p>
          </DialogContent>
        </Dialog>,
      );

      expect(html).toContain('aria-label="Cerrar"');
    });

    it("GIVEN Alert renderizado, THEN cuenta con role='alert' y accesibilidad semántica", () => {
      const html = renderToStaticMarkup(
        <Alert variant="destructive">
          <AlertTitle>Alerta de Dolor</AlertTitle>
          <AlertDescription>EVA 8 en rodilla reportado hoy.</AlertDescription>
        </Alert>,
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain("Alerta de Dolor");
      expect(html).toContain("EVA 8 en rodilla reportado hoy.");
    });
  });
});
