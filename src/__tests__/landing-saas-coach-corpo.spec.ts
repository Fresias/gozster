import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import HomePage from "@/app/page";
import * as landingSessionModule from "@/lib/use-landing-session";

// Helper para convertir markup HTML a texto normalizado
const texto = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("GOZS-337: Landing Unificada SaaS Corpo (landing-saas-coach-corpo.html) en src/app/page.tsx", () => {
  const pagePath = path.resolve(__dirname, "../app/page.tsx");
  const pageContent = fs.readFileSync(pagePath, "utf-8");
  const prototypePath = path.resolve(__dirname, "../../docs/prototypes/landing-saas-coach-corpo.html");

  it("GIVEN el prototipo aprobado THEN existe docs/prototypes/landing-saas-coach-corpo.html", () => {
    expect(fs.existsSync(prototypePath)).toBe(true);
    const prototypeContent = fs.readFileSync(prototypePath, "utf-8");
    expect(prototypeContent).toContain("SaaS Coach & Gym Platform + Portal Atleta");
  });

  describe("Criterios de Aceptación Gherkin", () => {
    const htmlMarkup = renderToStaticMarkup(createElement(HomePage));
    const textContent = texto(htmlMarkup);

    it("1. Barra de navegación fija con enlaces, indicador inteligente de sesión y botón 'Portal Alumnos'", () => {
      expect(htmlMarkup).toContain("<header");
      expect(htmlMarkup).toContain("sticky top-0");
      expect(textContent).toContain("GOZSter");
      expect(textContent).toContain("ENTERPRISE");
      expect(htmlMarkup).toContain('href="#features"');
      expect(htmlMarkup).toContain('href="#demo"');
      expect(htmlMarkup).toContain('href="#athlete"');
      expect(htmlMarkup).toContain('href="#pricing"');
      expect(htmlMarkup).toContain('href="/athlete"');
      expect(textContent).toContain("Portal Alumnos");
      expect(htmlMarkup).toContain('href="/studio"');
      expect(textContent).toContain("Coach Studio");
      expect(htmlMarkup).toContain('data-testid="theme-toggle"');
    });

    it("2. Hero corporativo B2B enfocado en retención de alumnos y $0 costo en licencias", () => {
      expect(textContent).toContain("INFRAESTRUCTURA DE FUERZA");
      expect(textContent).toContain("$0 COSTO EN LICENCIAS MENSUALES");
      expect(textContent).toContain("potencia tu negocio");
      expect(textContent).toContain("sin pagar licencias");
      expect(textContent).toContain("Reemplazá plataformas de gimnasio comerciales");
      expect(htmlMarkup).toContain('href="/studio"');
      expect(htmlMarkup).toContain('href="/athlete"');
    });

    it("3. Módulo interactivo de previsualización (Coach Studio Desktop vs Athlete App Mobile)", () => {
      expect(htmlMarkup).toContain('id="demo"');
      expect(textContent).toContain("Vista Coach Studio (Desktop)");
      expect(textContent).toContain("Vista Athlete App (Mobile PWA)");
      expect(textContent).toContain("gozster.vercel.app/studio • Panel General de Alumnos y Retención");
      expect(textContent).toContain("PRODUCCIÓN ACTIVA");
      // Contenido por defecto (Coach Studio View)
      expect(textContent).toContain("Gabriel Sanchez");
      expect(textContent).toContain("GABI AGOSTO");
      expect(textContent).toContain("Celeste Gerardi");
      expect(textContent).toContain("Esteban Papic");
      expect(textContent).toContain("Michelle Roach");
      expect(textContent).toContain("Constructor Visual de Rutinas y Superseries");
    });

    it("4. Live Proof Metrics reales de producción (No-AI Slop)", () => {
      expect(textContent).toContain("13");
      expect(textContent).toContain("Atletas y alumnos con membresía activa");
      expect(textContent).toContain("100%");
      expect(textContent).toContain("Tolerancia a sótanos sin señal (Offline-First)");
      expect(textContent).toContain("$0");
      expect(textContent).toContain("Gasto en licencias corporativas por mes");
      expect(textContent).toContain("1RM");
      expect(textContent).toContain("Fórmulas científicas Epley y Brzycki auditadas");
    });

    it("5. Banner de acceso exclusivo para socios y atletas de fuerza", () => {
      expect(htmlMarkup).toContain('id="athlete"');
      expect(textContent).toContain("ACCESO EXCLUSIVO ALUMNOS");
      expect(textContent).toContain("MODO OFFLINE PWA");
      expect(textContent).toContain("¿Sos socio, alumno o atleta de GOZSter?");
      expect(textContent).toContain("Abrí tu rutina en vivo directamente en tu celular");
      expect(textContent).toContain("Abrir mi Entrenamiento en Vivo");
    });

    it("6. Grilla de pilares biomecánicos y gobernanza multi-entrenador", () => {
      expect(htmlMarkup).toContain('id="features"');
      expect(textContent).toContain("Diseñado para la Gestión Real de Fuerza");
      expect(textContent).toContain("Estructura Multi-Entrenador");
      expect(textContent).toContain("Gobernanza por roles");
      expect(textContent).toContain("Alertas de Sobrecarga y Récords");
      expect(textContent).toContain("Arquitectura Bimodal Ergonométrica");
    });

    it("7. Footer corporativo institucional", () => {
      expect(htmlMarkup).toContain('id="pricing"');
      expect(textContent).toContain("GOZSter Platform");
      expect(textContent).toContain("Plataforma libre y de código abierto");
      expect(textContent).toContain("Desarrollado para el rendimiento deportivo • Fresias / GOZSter");
    });
  });

  describe("Directrices de Arte, Anti-Slop y Ergonomía (docs/MARCA.md)", () => {
    it("prohíbe el uso de emojis en layout como iconos decorativos", () => {
      // Emojis descartados de la versión AI-slop previa:
      expect(pageContent).not.toMatch(/🏋️|🏋️‍♂️|📊|⚡|🔥|👥|📈|💪/);
    });

    it("prohíbe gradientes difusos con polígonos decorativos (blur-3xl / clip-path)", () => {
      expect(pageContent).not.toContain("blur-3xl");
      expect(pageContent).not.toContain("clip-path");
      expect(pageContent).not.toContain("polygon");
    });

    it("utiliza iconos SVG vectoriales nítidos con trazo consistente", () => {
      expect(pageContent).toContain("<svg");
      expect(pageContent).toContain('stroke="currentColor"');
      expect(pageContent).toContain('fill="none"');
    });

    it("respeta tokens semánticos bimodales (bg-background, text-foreground, bg-card, border-border)", () => {
      expect(pageContent).toContain("bg-background");
      expect(pageContent).toContain("text-foreground");
      expect(pageContent).toContain("bg-card");
      expect(pageContent).toContain("border-border");
      expect(pageContent).toContain("bg-surface-container");
    });
  });

  describe("Adaptación dinámica según sesión activa (Smart Auth Switcher)", () => {
    it("adapta los CTAs y cápsula cuando el usuario es ADMIN (ej. Gabriel o Gonzalo)", () => {
      vi.spyOn(landingSessionModule, "useLandingSession").mockReturnValue({
        user: {
          id: "admin-1",
          email: "ds.gabriel.sanchez@gmail.com",
          displayName: "ds.gabriel.sanchez",
          rol: "ADMIN",
        },
        loading: false,
      });

      const markup = renderToStaticMarkup(createElement(HomePage));
      const txt = texto(markup);

      expect(txt).toContain("ds.gabriel.sanchez (Admin)");
      expect(txt).toContain("Ingresar al Panel de Administrador");
      expect(txt).toContain("Entrenar como Atleta (Mi Rutina)");
    });

    it("adapta los CTAs y cápsula cuando el usuario es ALUMNO", () => {
      vi.spyOn(landingSessionModule, "useLandingSession").mockReturnValue({
        user: {
          id: "alumno-1",
          email: "celeste@example.com",
          displayName: "Celeste Gerardi",
          rol: "ALUMNO",
        },
        loading: false,
      });

      const markup = renderToStaticMarkup(createElement(HomePage));
      const txt = texto(markup);

      expect(txt).toContain("Celeste Gerardi (Atleta)");
      expect(txt).toContain("Entrenar como Atleta (Mi Rutina)");
      expect(txt).toContain("Explorar Coach Studio");
    });

    it("muestra cápsula de login y CTAs por defecto cuando no hay sesión activa (visitante)", () => {
      vi.spyOn(landingSessionModule, "useLandingSession").mockReturnValue({
        user: null,
        loading: false,
      });

      const markup = renderToStaticMarkup(createElement(HomePage));
      const txt = texto(markup);

      expect(txt).toContain("Iniciar Sesión");
      expect(txt).toContain("Ingresar al Panel de Administrador");
      expect(txt).toContain("Entrenar como Atleta (Mi Rutina)");
    });
  });
});
