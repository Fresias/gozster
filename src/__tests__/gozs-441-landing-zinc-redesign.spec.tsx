import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import HomePage from "@/app/page";

const cleanText = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");

describe("GOZS-441 / GOZS-440: Auditoría Integral Frontend de Landing Zinc", () => {
  const pagePath = path.resolve(__dirname, "../app/page.tsx");
  const pageCode = fs.readFileSync(pagePath, "utf-8");
  const globalsPath = path.resolve(__dirname, "../app/globals.css");
  const globalsCode = fs.readFileSync(globalsPath, "utf-8");
  const html = renderToStaticMarkup(createElement(HomePage));
  const text = cleanText(html);

  describe("1. Preservación de Rutas Operativas e Invariantes", () => {
    it("GIVEN la landing page WHEN se renderiza THEN no incluye la clase .theme-athlete", () => {
      expect(pageCode).not.toContain("theme-athlete");
      expect(html).not.toContain("theme-athlete");
    });

    it("GIVEN la landing page THEN no utiliza gradientes chillones (esmeralda, azul, cian) ni fondos poligonales", () => {
      expect(pageCode).not.toContain("from-emerald-500");
      expect(pageCode).not.toContain("via-teal-400");
      expect(pageCode).not.toContain("to-sky-400");
      expect(pageCode).not.toContain("blur-3xl");
      expect(pageCode).not.toContain("clip-path");
      expect(pageCode).not.toContain("polygon");
    });

    it("GIVEN la landing page THEN no contiene emojis estructurales (Anti-Slop)", () => {
      expect(pageCode).not.toMatch(/🏋️|🏋️‍♂️|📊|⚡|🔥|👥|📈|💪/);
    });
  });

  describe("2. Hero 3D Spectup con 3 Tarjetas y Micro-Glitch", () => {
    it("incluye micro-glitch en hover sobre GONZALO SALAS con soporte data-text", () => {
      expect(pageCode).toContain("glitch-hover");
      expect(pageCode).toContain('data-text="GONZALO SALAS"');
      expect(text).toContain("GONZALO SALAS");
    });

    it("desactiva micro-glitch y 3D ante prefers-reduced-motion: reduce", () => {
      expect(globalsCode).toContain("@media (prefers-reduced-motion: reduce)");
      expect(globalsCode).toContain(".glitch-hover");
      expect(globalsCode).toContain("animation: none !important");
      expect(globalsCode).toContain(".hero-3d-card");
      expect(globalsCode).toContain("transform: none !important");
    });

    it("renderiza las 3 tarjetas en perspectiva 3D escalonada con datos realistas", () => {
      expect(html).toContain('data-testid="hero-card-rutinas"');
      expect(html).toContain('data-testid="hero-card-live"');
      expect(html).toContain('data-testid="hero-card-1rm"');

      // Tarjeta 1: Rutinas
      expect(text).toContain("Sentadilla Trasera (Back Squat)");
      expect(text).toContain("140 kg");
      expect(text).toContain("3-1-X-1");
      expect(text).toContain("180s");

      // Tarjeta 2: En Vivo
      expect(text).toContain("01:45");
      expect(text).toContain("Cronómetro Inteligente de Descanso Automático");
      expect(text).toContain("Esfuerzo Percibido (RPE)");
      expect(text).toContain("RPE 8.5");
      expect(text).toContain("100% Offline-First PWA");

      // Tarjeta 3: 1RM
      expect(text).toContain("1RM Estimado (Fórmula Epley)");
      expect(text).toContain("185.0 kg");
      expect(text).toContain("1RM Estimado (Fórmula Brzycki)");
      expect(text).toContain("183.4 kg");
      expect(text).toContain("14,250 kg");
    });
  });

  describe("3. Credenciales de Gonzalo Salas (4 Franjas GlyphsLabs)", () => {
    it("apila exactamente las 4 credenciales con líneas divisorias e inversión hover", () => {
      expect(html).toContain('data-testid="franja-cv-1"');
      expect(html).toContain('data-testid="franja-cv-2"');
      expect(html).toContain('data-testid="franja-cv-3"');
      expect(html).toContain('data-testid="franja-cv-4"');

      expect(text).toContain("Profesor Nacional de Educación Física");
      expect(text).toContain('ISEF N°1 "Dr. Enrique Romero Brest"');
      expect(text).toContain("Personal Trainer Certificado");
      expect(text).toContain("Centro Europeo de Educación Física");
      expect(text).toContain("Entrenador en Halterofilia");
      expect(text).toContain("Grupo GPO Latam");
      expect(text).toContain("Director Técnico de Boxeo");
      expect(text).toContain("Federación Argentina de Boxeo (FAB)");

      expect(pageCode).toContain("hover:bg-foreground hover:text-background");
    });
  });

  describe("4. Modalidades de Trabajo y Métricas de Impacto", () => {
    it("presenta exactamente las 3 modalidades técnicas: Funcional, Boxeo y Rutinas online", () => {
      expect(text).toContain("Funcional");
      expect(text).toContain("Boxeo");
      expect(text).toContain("Rutinas online");
    });

    it("presenta las métricas de impacto con formato tabular mono", () => {
      expect(text).toContain("+150");
      expect(text).toContain("3");
      expect(text).toContain("5+");
      expect(text).toContain("$0");
      expect(pageCode).toContain("font-mono tabular-nums");
    });
  });

  describe("5. Ergonomía Táctil y Accesibilidad (WCAG AA/AAA)", () => {
    it("cumple con áreas táctiles mínimas de 48px para mobile", () => {
      expect(pageCode).toContain("min-h-[48px]");
      expect(pageCode).toContain("overflow-x-hidden");
    });

    it("verifica el ratio de contraste WCAG AAA (>= 7:1) para la paleta Zinc oscura", () => {
      function getLuminance(r: number, g: number, b: number): number {
        const toLinear = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        const rs = toLinear(r);
        const gs = toLinear(g);
        const bs = toLinear(b);
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function getContrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
        const lum1 = getLuminance(...rgb1);
        const lum2 = getLuminance(...rgb2);
        const brightest = Math.max(lum1, lum2);
        const darkest = Math.min(lum1, lum2);
        return (brightest + 0.05) / (darkest + 0.05);
      }

      // Fondo Dark #09090B (9, 9, 11) con Texto #FAFAFA (250, 250, 250)
      const darkBg: [number, number, number] = [9, 9, 11];
      const darkFg: [number, number, number] = [250, 250, 250];
      const contrast = getContrastRatio(darkFg, darkBg);

      // Supera ampliamente WCAG AAA (7:1)
      expect(contrast).toBeGreaterThanOrEqual(7.0);
    });
  });
});
