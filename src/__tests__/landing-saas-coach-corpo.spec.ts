import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import HomePage from "@/app/page";
import * as landingSessionModule from "@/lib/use-landing-session";

// Helper para convertir markup HTML a texto normalizado
const texto = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");

describe("GOZS-441: Rediseño Integral del Inicio (/) — Estética Zinc /studio, Hero 3D, Franjas CV y Conversión Bivalente", () => {
  const pagePath = path.resolve(__dirname, "../app/page.tsx");
  const pageContent = fs.readFileSync(pagePath, "utf-8");
  const globalsPath = path.resolve(__dirname, "../app/globals.css");
  const globalsContent = fs.readFileSync(globalsPath, "utf-8");
  const prototypePath = path.resolve(__dirname, "../../docs/prototypes/landing-saas-coach-corpo.html");

  it("GIVEN el prototipo aprobado THEN existe docs/prototypes/landing-saas-coach-corpo.html", () => {
    expect(fs.existsSync(prototypePath)).toBe(true);
    const prototypeContent = fs.readFileSync(prototypePath, "utf-8");
    expect(prototypeContent).toContain("SaaS Coach & Gym Platform + Portal Atleta");
  });

  describe("Criterios de Aceptación Gherkin (GOZS-441)", () => {
    const htmlMarkup = renderToStaticMarkup(createElement(HomePage));
    const textContent = texto(htmlMarkup);

    it("1. Desacople total de .theme-athlete y adopción de tokens Zinc idénticos a /studio", () => {
      // No incluye la clase .theme-athlete
      expect(pageContent).not.toContain("theme-athlete");
      expect(htmlMarkup).not.toContain("theme-athlete");

      // Utiliza tokens semánticos nativos de shadcn Zinc
      expect(pageContent).toContain("bg-background");
      expect(pageContent).toContain("text-foreground");
      expect(pageContent).toContain("bg-card");
      expect(pageContent).toContain("border-border");
      expect(pageContent).toContain("bg-surface-container");
    });

    it("2. Header / Barra de navegación fija con logo Zinc 'G', enlaces técnicos y accesos a portales", () => {
      expect(htmlMarkup).toContain("<header");
      expect(htmlMarkup).toContain("sticky top-0");
      expect(textContent).toContain("GOZSter");
      expect(pageContent).toContain("size-8 rounded-lg bg-primary text-primary-foreground");

      // Enlaces técnicos requeridos
      expect(htmlMarkup).toContain('href="#trayectoria"');
      expect(htmlMarkup).toContain('href="#modalidades"');
      expect(htmlMarkup).toContain('href="#infraestructura"');
      expect(textContent).toContain("Trayectoria");
      expect(textContent).toContain("Modalidades");
      expect(textContent).toContain("Infraestructura");

      // Accesos directos y controles
      expect(htmlMarkup).toContain('href="/studio"');
      expect(textContent).toContain("Coach Studio");
      expect(htmlMarkup).toContain('href="/athlete"');
      expect(textContent).toContain("Portal Alumnos");
      expect(htmlMarkup).toContain('data-testid="theme-toggle"');
    });

    it("3. Hero Section con composición 3D Spectup, micro-glitch en 'GONZALO SALAS' y 3 pantallas simuladas", () => {
      // Badge superior técnico en monoespaciado
      expect(textContent).toContain("DIRECTOR TÉCNICO & INFRAESTRUCTURA DE FUERZA");
      expect(textContent).toContain("$0 LICENCIAS");

      // Título editorial sobrio y micro-glitch en hover
      expect(textContent).toContain("GONZALO SALAS");
      expect(pageContent).toContain("glitch-hover");
      expect(pageContent).toContain('data-text="GONZALO SALAS"');
      expect(textContent).toContain("Entrenamiento de élite e infraestructura tecnológica soberana.");

      // Escenario 3D en desktop
      expect(pageContent).toContain("perspective-1200");
      expect(htmlMarkup).toContain('data-testid="hero-card-rutinas"');
      expect(htmlMarkup).toContain('data-testid="hero-card-live"');
      expect(htmlMarkup).toContain('data-testid="hero-card-1rm"');

      // Tarjeta 1: Planificación Técnica de Rutinas
      expect(textContent).toContain("PLANIFICACIÓN TÉCNICA");
      expect(textContent).toContain("Sentadilla Trasera (Back Squat)");
      expect(textContent).toContain("4 series × 5 reps @ 80% (140 kg)");
      expect(textContent).toContain("3-1-X-1");

      // Tarjeta 2: Registro en Vivo con Cronómetro y RPE
      expect(textContent).toContain("REGISTRO EN VIVO");
      expect(textContent).toContain("100% Offline-First PWA");
      expect(textContent).toContain("01:45");
      expect(textContent).toContain("Cronómetro Inteligente de Descanso Automático");
      expect(textContent).toContain("Esfuerzo Percibido (RPE)");
      expect(textContent).toContain("Serie 2: 140 kg × 5 reps");

      // Tarjeta 3: Progresión 1RM y Fórmulas Auditadas
      expect(textContent).toContain("PROGRESIÓN Y 1RM");
      expect(textContent).toContain("1RM Estimado (Fórmula Epley)");
      expect(textContent).toContain("185.0 kg");
      expect(textContent).toContain("1RM Estimado (Fórmula Brzycki)");
      expect(textContent).toContain("183.4 kg");
      expect(textContent).toContain("Tonelaje Semanal Acumulado");
      expect(textContent).toContain("14,250 kg");
    });

    it("4. Grilla de Métricas de Impacto con separadores y datos reales", () => {
      expect(textContent).toContain("+150");
      expect(textContent).toContain("Alumnos acompañados en fuerza, hipertrofia y acondicionamiento");
      expect(textContent).toContain("3");
      expect(textContent).toContain("Modalidades de trabajo (Funcional, Boxeo y Rutinas online)");
      expect(textContent).toContain("5+");
      expect(textContent).toContain("Años de trayectoria profesional y formación docente continua");
      expect(textContent).toContain("$0");
      expect(textContent).toContain("Costo en licencias corporativas por mes (Software Soberano)");
    });

    it("5. Credenciales de Gonzalo Salas (4 Franjas GlyphsLabs con inversión de color en hover)", () => {
      expect(htmlMarkup).toContain('id="trayectoria"');
      expect(textContent).toContain("Formación Académica y Dirección Técnica");

      // Franja 01
      expect(htmlMarkup).toContain('data-testid="franja-cv-1"');
      expect(textContent).toContain("01");
      expect(textContent).toContain("Profesor Nacional de Educación Física");
      expect(textContent).toContain('ISEF N°1 "Dr. Enrique Romero Brest"');

      // Franja 02
      expect(htmlMarkup).toContain('data-testid="franja-cv-2"');
      expect(textContent).toContain("02");
      expect(textContent).toContain("Personal Trainer Certificado");
      expect(textContent).toContain("Centro Europeo de Educación Física");

      // Franja 03
      expect(htmlMarkup).toContain('data-testid="franja-cv-3"');
      expect(textContent).toContain("03");
      expect(textContent).toContain("Entrenador en Halterofilia");
      expect(textContent).toContain("Grupo GPO Latam");

      // Franja 04
      expect(htmlMarkup).toContain('data-testid="franja-cv-4"');
      expect(textContent).toContain("04");
      expect(textContent).toContain("Director Técnico de Boxeo");
      expect(textContent).toContain("Federación Argentina de Boxeo (FAB)");

      // Efecto hover con inversión de color nítida instantánea
      expect(pageContent).toContain("hover:bg-foreground hover:text-background");
      expect(pageContent).toContain("duration-150");
    });

    it("6. Modalidades de Trabajo mostrando exactamente las 3 disciplinas", () => {
      expect(htmlMarkup).toContain('id="modalidades"');
      expect(textContent).toContain("Modalidades de Trabajo");
      expect(textContent).toContain("Funcional");
      expect(textContent).toContain("Boxeo");
      expect(textContent).toContain("Rutinas online");
    });

    it("7. Conversión Bivalente (CTAs del Atleta y Coach)", () => {
      expect(textContent).toContain("Comenzar a Entrenar con Gonza");
      expect(htmlMarkup).toMatch(/href=["']https:\/\/wa\.me\//);
      expect(textContent).toContain("Ingresar a Coach Studio");
      expect(htmlMarkup).toContain('href="/studio"');
      expect(htmlMarkup).toContain('href="/athlete"');
    });

    it("8. Respeto estricto de prefers-reduced-motion: reduce", () => {
      expect(globalsContent).toContain("@media (prefers-reduced-motion: reduce)");
      expect(globalsContent).toContain("animation: none !important");
      expect(globalsContent).toContain("transform: none !important");
    });

    it("9. Navegación mobile y ergonomía con áreas de toque >= 48px y sin desborde horizontal", () => {
      expect(pageContent).toContain("overflow-x-hidden");
      expect(pageContent).toContain("min-h-[48px]");
    });
  });

  describe("Directrices de Arte, Anti-Slop y Ergonomía (docs/MARCA.md)", () => {
    it("prohíbe el uso de emojis en layout como iconos decorativos", () => {
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
      expect(txt).toContain("Comenzar a Entrenar con Gonza");
      expect(txt).toContain("Ingresar a Coach Studio");
    });
  });
});
