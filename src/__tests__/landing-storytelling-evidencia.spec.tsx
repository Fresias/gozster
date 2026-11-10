import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import HomePage from "@/app/page";
import * as landingSessionModule from "@/lib/use-landing-session";

const texto = (h: string) =>
  h
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");

const render = () => renderToStaticMarkup(createElement(HomePage));

describe("Home storytelling: 'Entrenamiento basado en evidencia, no en tendencias'", () => {
  const pageCode = fs.readFileSync(path.resolve(__dirname, "../app/page.tsx"), "utf-8");
  const globalsCode = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf-8");
  const html = render();
  const text = texto(html);

  afterEach(() => vi.restoreAllMocks());

  describe("1. Narrativa", () => {
    it("el hero presenta la promesa y a Gonzalo Salas como Head Coach", () => {
      expect(html).toMatch(/<h1[^>]*>.*Entrenamiento basado en evidencia,.*tendencias.*<\/h1>/s);
      expect(text).toContain("Gonzalo Salas · Head Coach");
      expect((html.match(/<h1/g) ?? []).length).toBe(1);
    });

    it("cuenta el relato en orden, un capítulo por pantalla", () => {
      const ids = ["problema", "metodo", "como", "alumnos", "modalidades", "testimonios", "gonzalo", "entrenadores", "faq", "empezar"];
      const posiciones = ids.map((id) => html.indexOf(`id="${id}"`));
      expect(posiciones.every((p) => p > 0)).toBe(true);
      expect([...posiciones].sort((a, b) => a - b)).toEqual(posiciones);
      // hero + 10 capítulos, cada uno con alto mínimo de un viewport (menos el header fijo)
      expect((html.match(/landing-section[^"]*min-h-\[calc\(100svh-4rem\)\]/g) ?? []).length).toBe(11);
    });

    it("cada capítulo termina con un enlace que invita a seguir al siguiente", () => {
      const destinos = [...html.matchAll(/<a href="#([a-z]+)"[^>]*data-siguiente/g)].map((m) => m[1]);
      expect(destinos).toEqual(["problema", "metodo", "como", "alumnos", "modalidades", "testimonios", "gonzalo", "entrenadores", "faq", "empezar"]);
    });

    it("incluye testimonios de alumnos y preguntas frecuentes para los dos públicos", () => {
      for (const nombre of ["Mirko", "Franco", "German"]) expect(text).toContain(nombre);
      expect(html).toContain('data-testid="seccion-faq"');
      expect(text).toContain("Si querés entrenar");
      expect(text).toContain("Si sos entrenador");
      expect((html.match(/<details/g) ?? []).length).toBe(9);
    });

    it("habla desde el dolor del alumno y del entrenador", () => {
      expect(text).toContain("Vas al gimnasio. Cumplís. Y aun así, no avanzás.");
      expect(text).toContain("Tu rutina es una fotocopia.");
      expect(text).toContain("Nadie te mira entrenar.");
      expect(text).toContain("Tu método no entra en una app genérica.");
      expect(html).toContain('data-testid="contraste-tendencia-evidencia"');
      expect(html).toContain('data-testid="tendencias-tachadas"');
      expect(html).toContain('data-testid="mensaje-coach"');
    });

    it("no usa tecnicismos ni nombra a otras apps en el texto visible", () => {
      const prohibidos =
        /telemetr|\bRPE\b|halterofilia|carga efectiva|biomec|\b1RM\b|hipertrofia|microciclo|tonelaje|antropom|churn|offline|\bPWA\b|mynter/i;
      expect(text).not.toMatch(prohibidos);
      expect(pageCode).not.toMatch(/mynter/i);
    });

    it("mantiene las funciones vigentes y no lista la Calculadora de Discos", () => {
      expect(text).toContain("Cronómetro Inteligente");
      expect(text).toContain("Calentamiento Específico");
      expect(text).not.toContain("Calculadora de Discos");
    });
  });

  describe("2. Dos públicos", () => {
    it("ofrece las tres modalidades para alumnos con contacto por WhatsApp", () => {
      expect(html).toContain('id="modalidades"');
      for (const m of ["Funcional", "Boxeo", "Rutinas online"]) {
        expect(text).toContain(`Consultar por ${m}`);
      }
      expect(html).toContain("https://wa.me/541162752515");
    });

    it("presenta Coach Studio a los entrenadores con acceso a /studio", () => {
      expect(html).toContain('data-testid="seccion-entrenadores"');
      expect(text).toContain("Ingresar a Coach Studio");
      expect(html).toContain('href="/studio"');
      expect(html).toContain('href="/athlete"');
    });

    it("respalda el relato con las 4 credenciales de Gonzalo Salas", () => {
      for (const n of [1, 2, 3, 4]) expect(html).toContain(`data-testid="franja-cv-${n}"`);
      expect(text).toContain("Profesor Nacional de Educación Física");
      expect(text).toContain('ISEF N°1 "Dr. Enrique Romero Brest"');
      expect(text).toContain("Personal Trainer Certificado");
      expect(text).toContain("Centro Europeo de Educación Física");
      expect(text).toContain("Grupo GPO Latam");
      expect(text).toContain("Director Técnico de Boxeo");
      expect(text).toContain("Federación Argentina de Boxeo (FAB)");
      expect(pageCode).toContain("hover:bg-foreground hover:text-background");
    });
  });

  describe("3. CTAs coherentes según la sesión", () => {
    const conSesion = (user: { id: string; email: string; displayName: string; rol: "ADMIN" | "ALUMNO" } | null) => {
      vi.spyOn(landingSessionModule, "useLandingSession").mockReturnValue({ user, loading: false } as ReturnType<
        typeof landingSessionModule.useLandingSession
      >);
      return render();
    };
    const hero = (h: string) => texto(h.split('data-testid="hero-cta"')[1]?.split("</div>")[0] ?? "");
    const barra = (h: string) => texto(h.split('data-testid="barra-accion-movil"')[1] ?? "");

    it("visitante: la acción principal es escribirle a Gonzalo en hero, barra móvil y cierre", () => {
      const h = conSesion(null);
      expect(hero(h)).toContain("Quiero entrenar con Gonzalo");
      expect(hero(h)).toContain("Soy entrenador");
      expect(barra(h)).toContain("Quiero entrenar");
      expect(barra(h)).toContain("Soy entrenador");
      const t = texto(h);
      expect(t).toContain("Iniciar Sesión");
      expect(t).toContain("Ingresar a Coach Studio");
      expect(t).toContain("Abrir mi rutina");
    });

    it("ADMIN: la acción principal lleva al panel", () => {
      const h = conSesion({ id: "admin-1", email: "admin@example.com", displayName: "admin", rol: "ADMIN" });
      expect(hero(h)).toContain("Ingresar al Panel de Administrador");
      expect(barra(h)).toContain("Ir a Coach Studio");
      expect(texto(h)).toContain("admin (Admin)");
    });

    it("ALUMNO: la acción principal abre su rutina", () => {
      const h = conSesion({ id: "alumno-1", email: "celeste@example.com", displayName: "Celeste Gerardi", rol: "ALUMNO" });
      expect(hero(h)).toContain("Abrir mi rutina");
      expect(barra(h)).toContain("Abrir mi rutina");
      const t = texto(h);
      expect(t).toContain("Celeste Gerardi (Atleta)");
      expect(t).toContain("Explorar Coach Studio");
      expect(t).toContain("Consultar con Gonzalo");
    });
  });

  describe("4. Invariantes de diseño, ergonomía y accesibilidad", () => {
    it("usa tokens zinc de Coach Studio y no el scope .theme-athlete", () => {
      expect(pageCode).not.toContain("theme-athlete");
      for (const token of ["bg-background", "text-foreground", "bg-card", "border-border", "text-muted-foreground"]) {
        expect(pageCode).toContain(token);
      }
    });

    it("header fijo con logo, anclas del relato, cápsula de sesión y ThemeToggle", () => {
      expect(html).toContain("<header");
      expect(html).toContain("sticky top-0");
      expect(pageCode).toContain("size-8 items-center justify-center rounded-lg bg-primary");
      for (const ancla of ["#metodo", "#alumnos", "#entrenadores", "#gonzalo", "#faq"]) {
        expect(html).toContain(`href="${ancla}"`);
      }
      expect(html).toContain('data-testid="theme-toggle"');
    });

    it("áreas táctiles de 48px y sin desborde horizontal (sin romper el header fijo)", () => {
      expect(pageCode).toContain("min-h-[48px]");
      expect(pageCode).toContain("overflow-x-clip");
      expect(pageCode).not.toContain("overflow-x-hidden");
    });

    it("anti-slop: sin emojis, sin blur-3xl, sin clip-path ni polígonos, iconos SVG de trazo", () => {
      expect(pageCode).not.toMatch(/🏋️|🏋️‍♂️|📊|⚡|🔥|👥|📈|💪/);
      expect(pageCode).not.toContain("blur-3xl");
      expect(pageCode).not.toContain("clip-path");
      expect(pageCode).not.toContain("polygon");
      expect(pageCode).toContain('stroke="currentColor"');
    });

    it("los ejemplos de producto se declaran como ilustrativos y son accesibles", () => {
      expect((html.match(/role="img"/g) ?? []).length).toBe(2);
      expect(text).toContain("Ejemplo ilustrativo de la app.");
      expect(text).toContain("Ejemplo ilustrativo de Coach Studio.");
      // toda imagen declara alt; solo el retrato decorativo del hero lo deja vacío
      expect(html).not.toMatch(/<img(?![^>]*\salt=")[^>]*>/);
      expect((html.match(/<img[^>]*alt=""/g) ?? []).length).toBe(1);
      expect(html).toContain('alt="Retrato de Gonzalo Salas, Head Coach"');
      expect(fs.existsSync(path.resolve(__dirname, "../../public/landing/gonzalo-salas.jpg"))).toBe(true);
    });

    it("todas las animaciones del relato se apagan con prefers-reduced-motion", () => {
      const reduced = globalsCode.slice(globalsCode.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
      for (const sel of [".landing-nudge", "html.landing-scroll", ".landing-rise", ".landing-marquee-track", ".landing-progress", ".landing-strike::after", "[data-reveal]"]) {
        expect(reduced).toContain(sel);
      }
      expect(reduced).toContain("animation: none !important");
      expect(reduced).toContain("transform: none !important");
    });
  });
});
