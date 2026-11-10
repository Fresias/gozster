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

describe("GOZS-449: Rediseño Integral de Landing según Dictamen de Dirección de Arte", () => {
  const pagePath = path.resolve(__dirname, "../app/page.tsx");
  const pageCode = fs.readFileSync(pagePath, "utf-8");
  const html = renderToStaticMarkup(createElement(HomePage));
  const text = cleanText(html);

  describe("1. Hero Section Ultra-Punchy & Athletic HUD Card", () => {
    it("renderiza el titular axiomático H1 y la bajada sintética aprobados por Dirección de Arte", () => {
      expect(text).toContain("La técnica no se negocia. El progreso se mide.");
      expect(text).toContain("Entrenar no es cansarse hasta transpirar. Es mover más peso con mejor técnica, semana a semana.");
      expect(text).toContain("Biomecánica individual según tus palancas anatómicas. Cero fotocopias.");
    });

    it("presenta el Athletic HUD Card en la derecha con telemetría en vivo sin rotaciones 3D descalibradas", () => {
      expect(html).toContain('data-testid="hero-card-layer-back"');
      expect(html).toContain('data-testid="hero-card-layer-middle"');
      expect(html).toContain('data-testid="hero-card-layer-front"');

      expect(text).toContain("SESIÓN AUDITADA #104 · SALA DE FUERZA");
      expect(text).toContain("140.0");
      expect(text).toContain("RPE 8.5 · Serie 4/4 ✓");
      expect(text).toContain("la técnica se audita antes de subir los kilos");
    });

    it("mantiene el glitch-hover en el nombre GONZALO SALAS y los CTAs táctiles", () => {
      expect(pageCode).toContain("glitch-hover");
      expect(pageCode).toContain('data-text="GONZALO SALAS"');
      expect(html).toContain('href="https://wa.me/5491100000000');
      expect(html).toContain('href="/studio"');
      expect(html).toContain('href="/athlete"');
    });
  });

  describe("2. Fichas Técnicas de Diagnóstico Biomecánico (Sección 01)", () => {
    it("sustituye la tabla SaaS genérica por 4 fichas técnicas de diagnóstico con categorización clínica", () => {
      expect(html).toContain('data-testid="seccion-contraste-realidad"');
      expect(text).toContain("Diagnóstico Biomecánico");
      expect(text).toContain("SOBRECARGA & PLANIFICACIÓN");
      expect(text).toContain("PROGRESIÓN MATEMÁTICA");
      expect(text).toContain("SUPERVISIÓN CLÍNICA");
      expect(text).toContain("TECNOLOGÍA SOBERANA");

      expect(text).toContain("Fotocopia arrugada y genérica");
      expect(text).toContain("Plan individualizado según tus palancas y movilidad.");
      expect(text).toContain("Adivinar el peso");
      expect(text).toContain("Sobrecarga progresiva kilo por kilo registrado.");
      expect(text).toContain("Profesor en recepción mirando el celular");
      expect(text).toContain("Ojos de Director Técnico (Romero Brest, FAB, Halterofilia).");
    });
  });

  describe("3. Sellos de Autoridad Técnica y Dirección Oficial (Sección 02)", () => {
    it("presenta los 4 sellos con monogramas oficiales y transferencia pragmática del beneficio al alumno", () => {
      expect(html).toContain('data-testid="franja-cv-1"');
      expect(html).toContain('data-testid="franja-cv-2"');
      expect(html).toContain('data-testid="franja-cv-3"');
      expect(html).toContain('data-testid="franja-cv-4"');

      expect(text).toContain("ISEF");
      expect(text).toContain("CEEF");
      expect(text).toContain("GPO");
      expect(text).toContain("FAB");

      expect(text).toContain("Impacto atlético:");
      expect(text).toContain("Tu plan se programa con bases fisiológicas reales");
      expect(text).toContain("Volumen de entrenamiento exacto para ganar masa muscular");
      expect(text).toContain("Trayectoria vertical de la barra");
      expect(text).toContain("Mecánica de golpeo, velocidad de reacción");
    });
  });

  describe("4. Modalidades de Trabajo con Fotografía Editorial y Chips (Sección 03)", () => {
    it("despliega el tríptico visual de las 3 disciplinas con fotografía B&N y chips mecánicos", () => {
      expect(text).toContain("Funcional");
      expect(text).toContain("Boxeo");
      expect(text).toContain("Rutinas online");

      expect(text).toContain("Bisagras de cadera");
      expect(text).toContain("Mecánica de golpe");
      expect(text).toContain("100% Offline");

      expect(pageCode).toContain("grayscale contrast-125 brightness-90");
    });
  });

  describe("5. Walkthrough en 3 Actos para Profesionales (Sección 04)", () => {
    it("ordena la narrativa del software en Creación -> Ejecución -> Auditoría bajo paleta Zinc estricta", () => {
      expect(html).toContain('data-testid="seccion-entrenadores"');
      expect(text).toContain("PASO 01 · CREACIÓN");
      expect(text).toContain("PASO 02 · EJECUCIÓN");
      expect(text).toContain("PASO 03 · AUDITORÍA");

      expect(text).toContain("Constructor de rutinas con superseries en segundos.");
      expect(text).toContain("Funciona 100% offline en sótanos sin señal.");
      expect(text).toContain("Seguimiento de retención y alertas automáticas de sobrecarga.");

      expect(text).toContain("$0 en licencias comerciales (software libre y soberano).");
      expect(text).toContain("$0");
      expect(text).toContain("por alumno · por mes");
    });
  });

  describe("6. Ergonomía, Anti-Slop y Accesibilidad WCAG", () => {
    it("cumple con áreas táctiles mínimas de 48px y sin desborde horizontal", () => {
      expect(pageCode).toContain("min-h-[48px]");
      expect(pageCode).toContain("overflow-x-hidden");
    });

    it("prohíbe el uso de emojis en layout como iconos decorativos", () => {
      expect(pageCode).not.toMatch(/🏋️|🏋️‍♂️|📊|⚡|🔥|👥|📈|💪/);
    });

    it("no incluye gradientes chillones ni fondos poligonales difusos de Canva/AI", () => {
      expect(pageCode).not.toContain("from-emerald-500");
      expect(pageCode).not.toContain("via-teal-400");
      expect(pageCode).not.toContain("to-sky-400");
      expect(pageCode).not.toContain("blur-3xl");
      expect(pageCode).not.toContain("clip-path");
      expect(pageCode).not.toContain("polygon");
    });
  });
});
