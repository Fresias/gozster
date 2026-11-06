import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import tailwindConfig from "../../tailwind.config";

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const norm = [r, g, b].map((v) => {
    const vn = v / 255;
    return vn <= 0.03928 ? vn / 12.92 : Math.pow((vn + 0.055) / 1.055, 2.4);
  });
  const rs = norm[0] ?? 0;
  const gs = norm[1] ?? 0;
  const bs = norm[2] ?? 0;
  return rs * 0.2126 + gs * 0.7152 + bs * 0.0722;
}

function calculateContrast(hsl1: [number, number, number], hsl2: [number, number, number]): number {
  const l1 = relativeLuminance(...hslToRgb(...hsl1));
  const l2 = relativeLuminance(...hslToRgb(...hsl2));
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function parseHslString(hslStr: string): [number, number, number] {
  const parts = hslStr.trim().split(/\s+/);
  const h = parseFloat(parts[0] ?? "0");
  const s = parseFloat((parts[1] ?? "0").replace("%", ""));
  const l = parseFloat((parts[2] ?? "0").replace("%", ""));
  return [h, s, l];
}

describe("GOZS-374: Sistema de Tokens Visuales, Tipografía Geist y Radios 8/12px shadcn", () => {
  const globalsPath = path.resolve(__dirname, "../app/globals.css");
  const globalsCss = fs.readFileSync(globalsPath, "utf-8");

  describe("1. Gherkin: Radios de 8px (rounded-lg) y 12px (rounded-xl) shadcn", () => {
    it("GIVEN globals.css, THEN define --radius: 0.5rem en :root y .dark", () => {
      const rootMatch = globalsCss.match(/:root\s*\{([\s\S]*?)\}/);
      expect(rootMatch).toBeTruthy();
      expect(rootMatch?.[1]).toContain("--radius: 0.5rem");

      const darkMatch = globalsCss.match(/\.dark\s*\{([\s\S]*?)\}/);
      expect(darkMatch).toBeTruthy();
      expect(darkMatch?.[1]).toContain("--radius: 0.5rem");
    });

    it("GIVEN tailwind.config.ts, THEN lg = var(--radius) (8px) y xl = calc(var(--radius) + 4px) (12px)", () => {
      const radii = (tailwindConfig.theme?.extend as Record<string, any> | undefined)?.borderRadius;
      expect(radii).toBeDefined();
      expect(radii.lg).toBe("var(--radius)");
      expect(radii.xl).toBe("calc(var(--radius) + 4px)");
    });
  });

  describe("2. Gherkin: Tokens de Estado Suave (fondo, foreground, border) y Contraste WCAG ≥ 4.5:1", () => {
    const states = ["success-soft", "warning-soft", "danger-soft", "neutral-soft"];

    it("GIVEN globals.css, THEN existen todas las variables en :root y .dark", () => {
      const rootBlock = globalsCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || "";
      const darkBlock = globalsCss.match(/\.dark\s*\{([\s\S]*?)\}/)?.[1] || "";

      for (const st of states) {
        expect(rootBlock).toContain(`--${st}:`);
        expect(rootBlock).toContain(`--${st}-foreground:`);
        expect(rootBlock).toContain(`--${st}-border:`);

        expect(darkBlock).toContain(`--${st}:`);
        expect(darkBlock).toContain(`--${st}-foreground:`);
        expect(darkBlock).toContain(`--${st}-border:`);
      }
    });

    it("GIVEN los tokens de estado suave en :root (Light Mode), THEN el ratio de contraste es ≥ 4.5:1", () => {
      const rootBlock = globalsCss.match(/:root\s*\{([\s\S]*?)\}/)?.[1] || "";
      for (const st of states) {
        const bgRegex = new RegExp(`--${st}:\\s*([^;]+);`);
        const fgRegex = new RegExp(`--${st}-foreground:\\s*([^;]+);`);
        const bgMatch = rootBlock.match(bgRegex);
        const fgMatch = rootBlock.match(fgRegex);
        expect(bgMatch).toBeTruthy();
        expect(fgMatch).toBeTruthy();

        const bgVal = parseHslString(bgMatch?.[1] ?? "");
        const fgVal = parseHslString(fgMatch?.[1] ?? "");

        const contrast = calculateContrast(bgVal, fgVal);
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("GIVEN los tokens de estado suave en .dark (Dark Mode), THEN el ratio de contraste es ≥ 4.5:1", () => {
      const darkBlock = globalsCss.match(/\.dark\s*\{([\s\S]*?)\}/)?.[1] || "";
      for (const st of states) {
        const bgRegex = new RegExp(`--${st}:\\s*([^;]+);`);
        const fgRegex = new RegExp(`--${st}-foreground:\\s*([^;]+);`);
        const bgMatch = darkBlock.match(bgRegex);
        const fgMatch = darkBlock.match(fgRegex);
        expect(bgMatch).toBeTruthy();
        expect(fgMatch).toBeTruthy();

        const bgVal = parseHslString(bgMatch?.[1] ?? "");
        const fgVal = parseHslString(fgMatch?.[1] ?? "");

        const contrast = calculateContrast(bgVal, fgVal);
        expect(contrast).toBeGreaterThanOrEqual(4.5);
      }
    });
  });

  describe("3. Gherkin: Configuración de Colores en tailwind.config.ts", () => {
    it("GIVEN tailwind.config.ts, THEN colors incluye success-soft, warning-soft, danger-soft, neutral-soft", () => {
      const colors = (tailwindConfig.theme?.extend as Record<string, any> | undefined)?.colors;
      expect(colors).toBeDefined();

      const requiredStates = ["success-soft", "warning-soft", "danger-soft", "neutral-soft"];
      for (const st of requiredStates) {
        expect(colors[st]).toBeDefined();
        expect(colors[st].DEFAULT).toContain(`var(--${st})`);
        expect(colors[st].foreground).toContain(`var(--${st}-foreground)`);
        expect(colors[st].border).toContain(`var(--${st}-border)`);
      }
    });

    it("GIVEN Tailwind CSS compilation, THEN genera las clases de estado suave y radios", async () => {
      const postcss = (await import("postcss")).default;
      const tailwindcss = (await import("tailwindcss")).default;

      const sampleHtml = `
        <div class="bg-success-soft text-success-soft-foreground border-success-soft-border"></div>
        <div class="bg-warning-soft text-warning-soft-foreground border-warning-soft-border"></div>
        <div class="bg-danger-soft text-danger-soft-foreground border-danger-soft-border"></div>
        <div class="bg-neutral-soft text-neutral-soft-foreground border-neutral-soft-border"></div>
        <div class="rounded-lg rounded-xl font-sans font-mono"></div>
      `;

      const result = await postcss([
        tailwindcss({
          ...tailwindConfig,
          content: [{ raw: sampleHtml, extension: "html" }],
        }),
      ]).process("@tailwind utilities;", { from: undefined });

      expect(result.css).toContain(".bg-success-soft");
      expect(result.css).toContain(".text-success-soft-foreground");
      expect(result.css).toContain(".border-success-soft-border");
      expect(result.css).toContain(".bg-warning-soft");
      expect(result.css).toContain(".text-warning-soft-foreground");
      expect(result.css).toContain(".border-warning-soft-border");
      expect(result.css).toContain(".bg-danger-soft");
      expect(result.css).toContain(".text-danger-soft-foreground");
      expect(result.css).toContain(".border-danger-soft-border");
      expect(result.css).toContain(".bg-neutral-soft");
      expect(result.css).toContain(".text-neutral-soft-foreground");
      expect(result.css).toContain(".border-neutral-soft-border");
      expect(result.css).toContain(".rounded-lg");
      expect(result.css).toContain(".rounded-xl");
    });
  });

  describe("4. Gherkin: Configuración Tipográfica Geist para Body y Geist Mono para Números Tabulares", () => {
    it("GIVEN tailwind.config.ts, THEN fontFamily.sans prioriza Geist y fontFamily.mono prioriza Geist Mono", () => {
      const fonts = (tailwindConfig.theme?.extend as Record<string, any> | undefined)?.fontFamily;
      expect(fonts).toBeDefined();
      expect(fonts.sans[0]).toBe("Geist");
      expect(fonts.mono[0]).toBe("Geist Mono");
    });

    it("GIVEN globals.css, THEN body incluye font-sans y los números tabulares configuran tnum y tabular-nums", () => {
      expect(globalsCss).toContain("font-sans");
      expect(globalsCss).toContain("font-variant-numeric: tabular-nums");
      expect(globalsCss).toContain('font-feature-settings: "tnum"');
    });
  });
});
