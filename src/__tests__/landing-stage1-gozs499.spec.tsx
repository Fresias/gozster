import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import HomePage from "../app/page";
import EntrenadoresPage from "../app/entrenadores/page";
import { MICRO_LABEL, CONTAINER, SECCION } from "../components/landing/kit";

const leer = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-499: Landings Stage 1 (Tokens + L1 + L2 + L3 + L5 + Hero /entrenadores)", () => {
  const homeHtml = renderToStaticMarkup(createElement(HomePage));
  const entrenadoresHtml = renderToStaticMarkup(createElement(EntrenadoresPage));
  const homeCode = leer("../app/page.tsx");
  const entrenadoresCode = leer("../app/entrenadores/page.tsx");
  const kitCode = leer("../components/landing/kit.tsx");
  const globalsCss = leer("../app/globals.css");
  const tailwindConfig = leer("../../tailwind.config.ts");

  describe("0. Tokens de landing", () => {
    it("globals.css define primitivos, semánticos y tokens de componente", () => {
      expect(globalsCss).toContain("--size-64: 4rem;");
      expect(globalsCss).toContain("--scale-88: 0.88;");
      expect(globalsCss).toContain("--landing-header-h: var(--size-64);");
      expect(globalsCss).toContain("--landing-zoom-min: var(--scale-88);");
      expect(globalsCss).toContain("--landing-chapter-h: calc(100svh - var(--landing-header-h));");
    });

    it("tailwind.config.ts extiende spacing con landing-header y landing-chapter", () => {
      expect(tailwindConfig).toContain('"landing-header": "var(--landing-header-h)"');
      expect(tailwindConfig).toContain('"landing-chapter": "var(--landing-chapter-h)"');
    });

    it("reemplaza valores sueltos de 4rem por tokens", () => {
      expect(globalsCss).toMatch(/html\.landing-scroll \{[^}]*scroll-padding-top:\s*var\(--landing-header-h\)/);
      expect(kitCode).toContain("flex h-landing-header items-center justify-between");
      expect(kitCode).toContain("min-h-landing-chapter");
      expect(SECCION).toContain("min-h-landing-chapter");
      expect(homeCode).toContain("min-h-landing-chapter");
      expect(entrenadoresCode).toContain("min-h-landing-chapter");
    });
  });

  describe("L1. Sección 02 ¿Te suena? / El método", () => {
    it("usa sticky top-landing-header y h-landing-chapter con padding vertical moderado", () => {
      expect(homeCode).toContain('id="problema-sticky-viewport"');
      expect(homeCode).toMatch(/id="problema-sticky-viewport"[^>]*className="[^"]*sticky top-landing-header flex h-landing-chapter w-full flex-col justify-between overflow-hidden py-4/);
    });

    it("alinea la cabecera, track y pie de la sección 02 con el CONTAINER común", () => {
      expect(homeCode).toContain("className={`${CONTAINER} flex items-center justify-between border-b border-border pb-3`}");
      expect(homeCode).toContain("className={`${CONTAINER} my-auto overflow-hidden`}");
      expect(homeCode).toContain("className={`${CONTAINER} flex items-center justify-end border-t border-border pt-3`}");
    });

    it("el numeral decorativo es más chico en mobile para que las 3 tarjetas entren en 390x844", () => {
      expect(homeCode).toContain("text-2xl font-black leading-none tabular-nums tracking-tighter text-foreground/15 sm:text-5xl");
    });
  });

  describe("L2. Ambas webs: texto en notebooks y etiquetas de capítulo", () => {
    it("globals.css fija el piso de zoom en --landing-zoom-min (0.88) y elimina los 5 escalones inferiores", () => {
      expect(globalsCss).toContain("--landing-zoom: var(--landing-zoom-min);");
      expect(globalsCss).not.toContain("--landing-zoom: 0.82;");
      expect(globalsCss).not.toContain("--landing-zoom: 0.76;");
      expect(globalsCss).not.toContain("--landing-zoom: 0.7;");
      expect(globalsCss).not.toContain("--landing-zoom: 0.64;");
      expect(globalsCss).not.toContain("--landing-zoom: 0.6;");
    });

    it("MICRO_LABEL mide al menos 12px (text-xs) y se usa en los roles del staff", () => {
      expect(MICRO_LABEL).toContain("text-xs");
      expect(homeCode).toContain("<span className={MICRO_LABEL}>\n                      Online Coach");
      expect(homeCode).toContain("<span className={MICRO_LABEL}>\n                      Boxing Coach");
      expect(homeCode).not.toContain("text-[10px]");
    });
  });

  describe("L3. Ambas webs: pie de página", () => {
    it("LandingFooter usa CONTAINER, tamaño de fuente text-sm (14px) y layout responsive sin desborde", () => {
      expect(kitCode).toContain('className="border-t border-border/80 bg-background pb-28 pt-8 text-sm text-muted-foreground md:pb-8"');
      expect(kitCode).toContain("<div className={CONTAINER}>");
      expect(kitCode).toContain('className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 md:justify-between"');
      expect(kitCode).toContain('className="-mx-2 mt-3 flex flex-wrap items-center justify-center gap-x-2 border-t border-border pt-2 md:justify-start"');
    });

    it("el pie renderizado incluye los 8 enlaces de navegación", () => {
      for (const link of ["Para entrenar", "Para entrenadores", "Coach Studio", "Athlete App"]) {
        expect(homeHtml).toContain(link);
        expect(entrenadoresHtml).toContain(link);
      }
    });
  });

  describe("L5. Sección 08 Preguntas frecuentes", () => {
    it("muestra la frase de contacto también en mobile (sin hidden) y tiene botón con enlace a WhatsApp", () => {
      expect(homeHtml).toContain("¿No está tu duda? Escribile al equipo de GOZS y te respondemos.");
      expect(homeHtml).toContain("Hacer mi pregunta");
      expect(homeHtml).toContain("https://wa.me/5491162752515?text=Hola%20equipo%20de%20GOZS%2C%20tengo%20una%20pregunta%20antes%20de%20empezar.");
      expect(homeCode).toContain('className={`${BTN_GHOST} mt-5`}');
    });
  });

  describe("Hero de /entrenadores", () => {
    it("no contiene el párrafo antiguo y mantiene título como único texto principal con espaciado adecuado", () => {
      expect(entrenadoresHtml).not.toContain("Dejá de pelear con interfaces poco intuitivas");
      expect(entrenadoresCode).toContain('className="landing-rise mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center"');
      expect(entrenadoresHtml).toContain("El equipo de GOZS te lo muestra funcionando, con casos reales. Gratis, sin tarjeta.");
    });
  });

  describe("Ajustes menores", () => {
    it("sección 01 tiene h2 accesible para evitar salto de h1 a h3", () => {
      expect(homeHtml).toContain('<h2 class="sr-only">Quién te entrena</h2>');
    });

    it("carruseles mobile de secciones 04, 05 y 06 son accesibles con teclado", () => {
      expect(homeCode).toContain('tabIndex={0}\n              role="group"\n              aria-label="Modalidades de entrenamiento"');
      expect(homeCode).toContain('tabIndex={0} role="group" aria-label="Pasos de trabajo"');
      expect(homeCode).toContain('tabIndex={0} role="group" aria-label="Testimonios de quienes ya entrenan"');
    });

    it("useBarraMovil en /entrenadores se enlaza a la sección empezar para evitar duplicar el CTA", () => {
      expect(entrenadoresCode).toContain('useBarraMovil("empezar")');
    });

    it("reemplaza colores zinc-* en las secciones especificadas por tokens del tema", () => {
      expect(homeCode).not.toContain('figure className="landing-media dark group relative isolate overflow-hidden rounded-2xl bg-zinc-950');
      expect(homeCode).not.toContain('article\n                    ref={(el) => {\n                      deal.cardRefs.current[i] = el;\n                    }}\n                    className="landing-card group relative isolate flex min-h-[380px] w-full flex-col justify-end overflow-hidden rounded-2xl bg-zinc-950');
      expect(entrenadoresCode).not.toContain('border-zinc-700 bg-zinc-950');
    });
  });
});
