import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LandingSessionCapsule } from "@/components/landing-session-capsule";
import { LandingHeader } from "@/components/landing/kit";

describe("GOZS-494: Tokens de tamaño táctil (3 capas), Button y controles públicos", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");

  describe("1. Tokens CSS y Tailwind (3 capas)", () => {
    it("GIVEN globals.css THEN define la escala de 3 capas (primitivos, semánticos y componentes)", () => {
      const globalsCss = fs.readFileSync(path.join(repoRoot, "src/app/globals.css"), "utf-8");

      // Primitivos
      expect(globalsCss).toContain("--size-32: 2rem;");
      expect(globalsCss).toContain("--size-36: 2.25rem;");
      expect(globalsCss).toContain("--size-40: 2.5rem;");
      expect(globalsCss).toContain("--size-48: 3rem;");
      expect(globalsCss).toContain("--size-56: 3.5rem;");

      // Semánticos
      expect(globalsCss).toContain("--target-sm: var(--size-32);");
      expect(globalsCss).toContain("--target: var(--size-36);");
      expect(globalsCss).toContain("--target-lg: var(--size-40);");
      expect(globalsCss).toContain("--target-quick: var(--size-56);");

      // Componente
      expect(globalsCss).toContain("--button-h-sm: var(--target-sm);");
      expect(globalsCss).toContain("--button-h: var(--target);");
      expect(globalsCss).toContain("--button-h-lg: var(--target-lg);");
      expect(globalsCss).toContain("--button-h-quick: var(--target-quick);");

      // Media query táctil coarse
      expect(globalsCss).toMatch(/@media\s*\(pointer:\s*coarse\)\s*\{\s*:root\s*\{[^}]*--target-sm:\s*var\(--size-48\);[^}]*--target:\s*var\(--size-48\);[^}]*--target-lg:\s*var\(--size-48\);/);
    });

    it("GIVEN tailwind.config.ts THEN extiende spacing con tokens de target táctil", () => {
      const tailwindConfig = fs.readFileSync(path.join(repoRoot, "tailwind.config.ts"), "utf-8");
      expect(tailwindConfig).toContain('"target-sm": "var(--target-sm)"');
      expect(tailwindConfig).toContain('target: "var(--target)"');
      expect(tailwindConfig).toContain('"target-lg": "var(--target-lg)"');
      expect(tailwindConfig).toContain('"target-quick": "var(--target-quick)"');
    });

    it("GIVEN .dark .theme-athlete THEN contraste de texto botón primario sobre cian es >= 4.5:1", () => {
      const globalsCss = fs.readFileSync(path.join(repoRoot, "src/app/globals.css"), "utf-8");
      expect(globalsCss).toContain(".dark .theme-athlete { --primary: 199 89% 48%; --primary-foreground: 240 5.9% 10%; --ring: 199 89% 48%; }");

      // Cálculo matemático de contraste WCAG AA
      // Cian 199 89% 48% -> HSL(199, 89%, 48%) -> sRGB ~ (14, 165, 233)
      // Texto 240 5.9% 10% -> HSL(240, 5.9%, 10%) -> sRGB ~ (24, 24, 27)
      const parseHslToRgb = (h: number, s: number, l: number): [number, number, number] => {
        s /= 100;
        l /= 100;
        const k = (n: number) => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return [f(0), f(8), f(4)];
      };
      const luminance = (r: number, g: number, b: number) => {
        const v1 = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
        const v2 = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
        const v3 = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
        return v1 * 0.2126 + v2 * 0.7152 + v3 * 0.0722;
      };

      const [r1, g1, b1] = parseHslToRgb(199, 89, 48);
      const [r2, g2, b2] = parseHslToRgb(240, 5.9, 10);
      const l1 = luminance(r1, g1, b1);
      const l2 = luminance(r2, g2, b2);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeCloseTo(6.22, 0.5);
    });
  });

  describe("2. Componente Button: Tamaños y fusión de variantes sin colisión de h-9", () => {
    it("GIVEN Button default THEN usa --button-h", () => {
      const html = renderToStaticMarkup(<Button>Aceptar</Button>);
      expect(html).toContain("h-[var(--button-h)]");
      expect(html).not.toContain("h-9");
    });

    it("GIVEN Button size='sm' con variant='outline' o 'secondary' THEN no incluye h-9 espurio", () => {
      const htmlOutline = renderToStaticMarkup(<Button variant="outline" size="sm">Filtrar</Button>);
      expect(htmlOutline).toContain("h-[var(--button-h-sm)]");
      expect(htmlOutline).not.toContain("h-9");

      const htmlSecondary = renderToStaticMarkup(<Button variant="secondary" size="sm">Secundario</Button>);
      expect(htmlSecondary).toContain("h-[var(--button-h-sm)]");
      expect(htmlSecondary).not.toContain("h-9");
    });

    it("GIVEN Button con todos los tamaños THEN usa las clases semánticas correctas", () => {
      const htmlSm = renderToStaticMarkup(<Button size="sm">SM</Button>);
      expect(htmlSm).toContain("h-[var(--button-h-sm)]");
      expect(htmlSm).toContain("px-3");
      expect(htmlSm).toContain("text-xs");

      const htmlLg = renderToStaticMarkup(<Button size="lg">LG</Button>);
      expect(htmlLg).toContain("h-[var(--button-h-lg)]");
      expect(htmlLg).toContain("px-5");
      expect(htmlLg).toContain("text-sm");

      const htmlQuick = renderToStaticMarkup(<Button size="quick">Acción rápida</Button>);
      expect(htmlQuick).toContain("h-[var(--button-h-quick)]");
      expect(htmlQuick).toContain("rounded-xl");
      expect(htmlQuick).toContain("font-bold");

      const htmlTouch = renderToStaticMarkup(<Button size="touch">Entrenamiento</Button>);
      expect(htmlTouch).toContain("min-h-14");
      expect(htmlTouch).toContain("rounded-xl");
      expect(htmlTouch).toContain("font-bold");

      const htmlIcon = renderToStaticMarkup(<Button size="icon" aria-label="Cerrar">X</Button>);
      expect(htmlIcon).toContain("size-[var(--button-h)]");
      expect(htmlIcon).toContain("p-0");
    });
  });

  describe("3. Controles públicos con tokens táctiles", () => {
    it("GIVEN ThemeToggle THEN usa size-target", () => {
      const html = renderToStaticMarkup(<ThemeToggle />);
      expect(html).toContain("size-target");
      expect(html).not.toContain("size-9");
    });

    it("GIVEN LandingSessionCapsule sin sesión THEN 'Iniciar Sesión' usa min-h-target", () => {
      const html = renderToStaticMarkup(<LandingSessionCapsule initialUser={null} />);
      expect(html).toContain("min-h-target");
      expect(html).not.toContain("min-h-[36px]");
    });

    it("GIVEN LandingHeader THEN el logo tiene padding táctil -m-2 p-2 y el selector usa min-h-target", () => {
      const html = renderToStaticMarkup(
        <LandingHeader
          publico="alumnos"
          user={null}
          accion={<button type="button">CTA</button>}
        />
      );
      expect(html).toContain("-m-2 flex items-center gap-2.5 rounded-lg p-2");
      expect(html).toContain("min-h-target");
      expect(html).not.toContain("min-h-[36px]");
    });

    it("GIVEN entrenadores/page.tsx THEN las pestañas de planes usan min-h-target-lg", () => {
      const pageCode = fs.readFileSync(path.join(repoRoot, "src/app/entrenadores/page.tsx"), "utf-8");
      expect(pageCode).toContain("min-h-target-lg rounded-full px-5 text-sm font-bold");
      expect(pageCode).not.toContain("min-h-[40px] rounded-full");
    });
  });
});
