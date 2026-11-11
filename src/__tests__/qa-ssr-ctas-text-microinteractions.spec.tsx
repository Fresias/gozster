import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import HomePage from "@/app/page";
import { ScrambleText, useScrambleText } from "@/components/landing/scramble-text";
import { CharacterReveal } from "@/components/landing/character-reveal";
import { NosotrosInteraction } from "@/components/landing/nosotros-badge";
import * as landingSessionModule from "@/lib/use-landing-session";

const leer = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("QA Audit GOZS-483 / GOZS-484: Optimización SSR de CTAs y Microinteracciones de Texto TS/CSS Puro", () => {
  const homeCode = leer("../app/page.tsx");
  const globalsCode = leer("../app/globals.css");
  const packageJson = JSON.parse(leer("../../package.json"));

  describe("1. Fix de Latencia y Desfasaje en CTAs (Cero Fricción - SSR Instantáneo)", () => {
    it("useLandingSession se inicializa con user: null y loading: false para no bloquear SSR ni primer paint", () => {
      const hookCode = leer("../lib/use-landing-session.ts");
      expect(hookCode).toContain("user: null");
      expect(hookCode).toContain("loading: false");
      expect(hookCode).not.toMatch(/useState<LandingSessionState>\(\s*\{\s*user:\s*null,\s*loading:\s*true\s*\}\s*\)/);
    });

    it("en el HTML inicial de SSR el CTA público a WhatsApp se renderiza inmediatamente sin spinners ni bloqueos", () => {
      const html = renderToStaticMarkup(createElement(HomePage));
      // El CTA de WhatsApp debe estar en el DOM inicial
      expect(html).toContain("https://wa.me/5491162752515");
      expect(html).toContain("Quiero entrenar");
      expect(html).toContain("Quiero empezar a entrenar");
      // Cero texto de loading o bloqueo
      expect(html).not.toContain("Cargando sesión");
      expect(html).not.toContain("loading-spinner");
    });

    it("al existir sesión activa, muta suavemente a 'Abrir mi rutina' (ALUMNO) o 'Ir a Coach Studio' (ADMIN)", () => {
      // Mock ALUMNO
      const alumnoSpy = vi.spyOn(landingSessionModule, "useLandingSession").mockReturnValue({
        user: { id: "a1", email: "atleta@gozster.com", displayName: "Atleta Pro", rol: "ALUMNO" },
        loading: false,
      });
      const htmlAlumno = renderToStaticMarkup(createElement(HomePage));
      expect(htmlAlumno).toContain("Abrir mi rutina");
      expect(htmlAlumno).toContain('href="/athlete"');
      alumnoSpy.mockRestore();

      // Mock ADMIN
      const adminSpy = vi.spyOn(landingSessionModule, "useLandingSession").mockReturnValue({
        user: { id: "adm1", email: "gonzalo@gozster.com", displayName: "Gonzalo Salas", rol: "ADMIN" },
        loading: false,
      });
      const htmlAdmin = renderToStaticMarkup(createElement(HomePage));
      expect(htmlAdmin).toContain("Ir a Coach Studio");
      expect(htmlAdmin).toContain('href="/studio"');
      adminSpy.mockRestore();
    });
  });

  describe("2. Microinteracción Scramble Text en 'novedad'", () => {
    it("el archivo src/components/landing/scramble-text.tsx existe y exporta ScrambleText y useScrambleText", () => {
      expect(typeof ScrambleText).toBe("function");
      expect(typeof useScrambleText).toBe("function");
    });

    it("en SSR renderiza la palabra 'novedad' de forma estática y accesible", () => {
      const html = renderToStaticMarkup(createElement(ScrambleText, { text: "novedad", className: "landing-outline" }));
      expect(html).toContain('aria-label="novedad"');
      expect(html).toContain("novedad");
      expect(html).toContain('data-testid="scramble-text"');
      expect(html).toContain("landing-outline");
    });

    it("HomePage renderiza 'novedad' como texto estático y sobrio (sin ScrambleText)", () => {
      expect(homeCode).not.toContain("ScrambleText");
      const html = renderToStaticMarkup(createElement(HomePage));
      expect(html).toContain("novedad");
      expect(html).not.toContain('data-testid="scramble-text"');
    });

    it("ScrambleText respeta prefers-reduced-motion y usa requestAnimationFrame para 60 FPS", () => {
      const scrambleCode = leer("../components/landing/scramble-text.tsx");
      expect(scrambleCode).toContain("prefers-reduced-motion: reduce");
      expect(scrambleCode).toContain("requestAnimationFrame");
      expect(scrambleCode).toContain("IntersectionObserver");
    });
  });

  describe("3. Microinteracción Character Reveal en 'CERO'", () => {
    it("el componente CharacterReveal renderiza la palabra secuencialmente con delays", () => {
      const html = renderToStaticMarkup(createElement(CharacterReveal, { text: "CERO", className: "font-black" }));
      expect(html).toContain('data-testid="character-reveal"');
      expect(html).toContain('aria-label="CERO"');
      // Cada letra debe tener aria-hidden y su animationDelay escalonado
      expect(html).toContain("C");
      expect(html).toContain("E");
      expect(html).toContain("R");
      expect(html).toContain("O");
      expect(html).toContain("animation-delay:0ms");
      expect(html).toContain("animation-delay:80ms");
    });

    it("HomePage integra 'Tres pasos, CERO adivinanzas.' con color neutro unificado y CharacterReveal", () => {
      expect(homeCode).toMatch(/Tres pasos,\s*<CharacterReveal\s+text="CERO"/);
      const html = renderToStaticMarkup(createElement(HomePage));
      expect(html).toContain("Tres pasos,");
      expect(html).toContain('data-testid="character-reveal"');
      expect(html).toContain("adivinanzas.");
    });

    it("globals.css define keyframes a 60 FPS y apaga la animación con prefers-reduced-motion", () => {
      expect(globalsCode).toContain("@keyframes landing-char-reveal");
      expect(globalsCode).toContain(".landing-char-item");

      const reducedBlock = globalsCode.slice(globalsCode.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
      expect(reducedBlock).toContain(".landing-char-item");
      expect(reducedBlock).toContain("animation: none !important");
      expect(reducedBlock).toContain("opacity: 1 !important");
    });
  });

  describe("4. Microinteracción en 'nosotros' (Testimonios)", () => {
    it("HomePage reemplaza el contorno hueco con NosotrosInteraction", () => {
      expect(homeCode).toContain("<NosotrosInteraction>nosotros</NosotrosInteraction>");
      expect(homeCode).not.toContain('<span className="landing-outline">nosotros</span>');
    });

    it("el componente NosotrosInteraction renderiza el acento cinético de subrayado", () => {
      const html = renderToStaticMarkup(createElement(NosotrosInteraction, {}, "nosotros"));
      expect(html).toContain('data-testid="nosotros-interaction"');
      expect(html).toContain("landing-nosotros-line");
      expect(html).toContain("nosotros");
    });

    it("globals.css apaga la microinteracción de nosotros bajo prefers-reduced-motion", () => {
      const reducedBlock = globalsCode.slice(globalsCode.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
      expect(reducedBlock).toContain(".landing-nosotros-line");
      expect(reducedBlock).toContain(".landing-nosotros-interaction");
      expect(reducedBlock).toContain("transform: none !important");
    });
  });

  describe("5. Regla Ponytail & Karpathy: Cero Dependencias Nuevas de NPM", () => {
    it("package.json no incorpora ninguna librería de animaciones o utilidades pesadas", () => {
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      expect(deps).not.toHaveProperty("framer-motion");
      expect(deps).not.toHaveProperty("gsap");
      expect(deps).not.toHaveProperty("scramble-text");
      expect(deps).not.toHaveProperty("react-spring");
      expect(deps).not.toHaveProperty("motion");
      expect(deps).not.toHaveProperty("animejs");
    });
  });
});
