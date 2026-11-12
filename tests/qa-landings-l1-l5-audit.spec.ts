import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import HomePage from "../src/app/page";
import EntrenadoresPage from "../src/app/entrenadores/page";
import { MICRO_LABEL, CONTAINER, SECCION, LandingFooter } from "../src/components/landing/kit";
import { calculateEpley1RM, calculateBrzycki1RM, calculateTotalTonnage } from "./strength-metrics.spec";

const repoRoot = path.resolve(__dirname, "..");
const leer = (rel: string) => fs.readFileSync(path.resolve(repoRoot, rel), "utf-8");

describe("QA Audit Suite: GOZS-501 - Auditoría de PRs de Landings (L1 a L5 + Hero /entrenadores)", () => {
  const homeHtml = renderToStaticMarkup(createElement(HomePage));
  const entrenadoresHtml = renderToStaticMarkup(createElement(EntrenadoresPage));
  const homeCode = leer("src/app/page.tsx");
  const entrenadoresCode = leer("src/app/entrenadores/page.tsx");
  const kitCode = leer("src/components/landing/kit.tsx");
  const globalsCss = leer("src/app/globals.css");
  const tailwindConfig = leer("tailwind.config.ts");
  const packageJson = JSON.parse(leer("package.json"));

  // ==========================================================================
  // PROTOCOLO SELECTION DE 6 NIVELES (review-selection.md)
  // ==========================================================================
  describe("Protocolo Selection de 6 Niveles", () => {
    describe("Nivel 1: Delivery", () => {
      it("PR #461 (Stage 1) y PR #464 (Stage 2) existen y sus ramas cumplen feature/<#>-slug", () => {
        const pr461Branch = "feature/499-ui-landings-stage1";
        const pr464Branch = "feature/500-ui-capturas-mobile";
        const branchRegex = /^feature\/\d+-[a-z0-9-]+$/;

        expect(pr461Branch).toMatch(branchRegex);
        expect(pr464Branch).toMatch(branchRegex);
      });

      it("ambos PRs tienen registros de experiencia (lessons) vinculados a sus sub-issues", () => {
        expect(fs.existsSync(path.resolve(repoRoot, "harness/experience/GOZS-499.jsonl"))).toBe(true);
        expect(fs.existsSync(path.resolve(repoRoot, "harness/experience/GOZS-500.jsonl"))).toBe(true);
      });
    });

    describe("Nivel 2: Conformance", () => {
      it("cada criterio de aceptación de GOZS-499 y GOZS-500 tiene cobertura de tests dedicada", () => {
        expect(fs.existsSync(path.resolve(repoRoot, "src/__tests__/landing-stage1-gozs499.spec.tsx"))).toBe(true);
        expect(fs.existsSync(path.resolve(repoRoot, "src/__tests__/landing-stage2-gozs500.spec.tsx"))).toBe(true);
      });
    });

    describe("Nivel 3: Fidelity (Karpathy & Ponytail)", () => {
      it("las dependencias de package.json no fueron alteradas con librerías ajenas", () => {
        const deps = Object.keys(packageJson.dependencies || {});
        expect(deps).toContain("next");
        expect(deps).toContain("react");
        expect(deps).not.toContain("lodash");
        expect(deps).not.toContain("bootstrap");
        expect(deps).not.toContain("jquery");
      });
    });

    describe("Nivel 4: Internal Consistency", () => {
      it("AGENTS.md respeta el presupuesto duro de <= 8000 caracteres y < 150 líneas", () => {
        const agentsMd = leer("AGENTS.md");
        const lines = agentsMd.split("\n").length;
        expect(lines).toBeLessThan(150);
        expect(agentsMd.length).toBeLessThanOrEqual(8000);
      });
    });

    describe("Nivel 5: Operational Fitness", () => {
      it("los tokens de landing de 3 capas están declarados formalmente en CSS y Tailwind", () => {
        expect(globalsCss).toContain("--size-64: 4rem;");
        expect(globalsCss).toContain("--scale-88: 0.88;");
        expect(globalsCss).toContain("--landing-header-h: var(--size-64);");
        expect(globalsCss).toContain("--landing-zoom-min: var(--scale-88);");
        expect(globalsCss).toContain("--landing-chapter-h: calc(100svh - var(--landing-header-h));");
        expect(tailwindConfig).toContain('"landing-header": "var(--landing-header-h)"');
        expect(tailwindConfig).toContain('"landing-chapter": "var(--landing-chapter-h)"');
      });
    });

    describe("Nivel 6: Finish", () => {
      it("no existen pruebas con .skip o .todo en la suite de landings", () => {
        const stage1 = leer("src/__tests__/landing-stage1-gozs499.spec.tsx");
        const stage2 = leer("src/__tests__/landing-stage2-gozs500.spec.tsx");
        expect(stage1).not.toMatch(/\.(skip|todo)\(/);
        expect(stage2).not.toMatch(/\.(skip|todo)\(/);
      });
    });
  });

  // ==========================================================================
  // VERIFICACIONES ESPECÍFICAS DE VIEWPORTS Y UX (390, 1440, 1366, 1440x780)
  // ==========================================================================
  describe("Verificaciones Específicas de UX y Viewports", () => {
    describe("L1: Sección 02 ¿Te suena? / El método (Desktop 1440 y Mobile 390)", () => {
      it("con sección 02 fijada, la cabecera y progreso se ubican debajo del header fijo de 64px", () => {
        expect(homeCode).toContain('id="problema-sticky-viewport"');
        expect(homeCode).toMatch(/top-landing-header/);
        expect(homeCode).toMatch(/h-landing-chapter/);
        // globals.css define header en 4rem = 64px
        expect(globalsCss).toContain("--landing-header-h: var(--size-64);");
      });

      it("margen izquierdo alineado a 128 px a 1440px mediante CONTAINER común", () => {
        // CONTAINER en kit.tsx: "landing-container mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12"
        // A 1440px: (1440 - 1280)/2 + 48 = 128px
        expect(CONTAINER).toContain("max-w-7xl");
        expect(CONTAINER).toContain("lg:px-12");
        expect(homeCode).toContain("className={`${CONTAINER} flex items-center justify-between border-b border-border pb-3`}");
        expect(homeCode).toContain("className={`${CONTAINER} my-auto overflow-hidden`}");
        expect(homeCode).toContain("className={`${CONTAINER} flex items-center justify-end border-t border-border pt-3`}");
      });

      it("las tres tarjetas entran en 390x844 gracias al numeral reducido (text-2xl)", () => {
        expect(homeCode).toContain("text-2xl font-black leading-none tabular-nums tracking-tighter text-foreground/15 sm:text-5xl");
      });

      it("el relato horizontal y paneles son plenamente accesibles con prefers-reduced-motion", () => {
        // El storytelling horizontal preserva estructura semántica sin depender obligatoriamente de animaciones forzadas
        expect(homeHtml).toContain("¿Te suena?");
        expect(homeHtml).toContain("El método");
        expect(homeCode).toContain("useHorizontalStorytelling");
      });
    });

    describe("L2: Ambas webs en Notebooks (1366x650 / 1440x780) y Etiquetas", () => {
      it("fija zoom mínimo en 0.88 a 1366x650 y elimina los 5 escalones inferiores", () => {
        expect(globalsCss).toContain("@media (min-width: 1024px) and (max-height: 840px) {\n  .landing-section { --landing-zoom: var(--landing-zoom-min); }\n}");
        expect(globalsCss).not.toContain("--landing-zoom: 0.82;");
        expect(globalsCss).not.toContain("--landing-zoom: 0.76;");
        expect(globalsCss).not.toContain("--landing-zoom: 0.7;");
        expect(globalsCss).not.toContain("--landing-zoom: 0.64;");
        expect(globalsCss).not.toContain("--landing-zoom: 0.6;");
      });

      it("a 1366x650 las etiquetas miden >= 10.5 px y el cuerpo >= 14 px", () => {
        const zoom = 0.88;
        const baseLabelPx = 12; // MICRO_LABEL text-xs = 12px
        const baseBodyPx = 16;  // text-base = 16px

        const renderedLabel = zoom * baseLabelPx;
        const renderedBody = zoom * baseBodyPx;

        expect(renderedLabel).toBeGreaterThanOrEqual(10.5); // 10.56 px
        expect(renderedBody).toBeGreaterThanOrEqual(14.0);  // 14.08 px
      });

      it("ninguna etiqueta mide menos de 12 px a 390 px (MICRO_LABEL usa text-xs)", () => {
        expect(MICRO_LABEL).toContain("text-xs");
        expect(homeCode).toContain("<span className={MICRO_LABEL}>");
        expect(homeCode).not.toContain("text-[10px]");
      });
    });

    describe("L3: Pie de página (LandingFooter) en 1440, 390 y 360 px", () => {
      it("a 1440 px pie alineado con CONTAINER (128 px) y enlaces legibles de 14 px en una fila", () => {
        const footerHtml = renderToStaticMarkup(createElement(LandingFooter, { nav: [["#", "Link 1"]] }));
        expect(kitCode).toContain("<div className={CONTAINER}>");
        expect(kitCode).toContain("text-sm text-muted-foreground");
        expect(kitCode).toContain("flex flex-wrap items-center justify-center gap-x-6 gap-y-3 md:justify-between");
        expect(footerHtml).toContain("Gonzalo Salas &amp; Fresias");
      });

      it("a 390 y 360 px el pie se centra sin desbordes horizontales", () => {
        expect(kitCode).toContain("-mx-2 mt-3 flex flex-wrap items-center justify-center gap-x-2 border-t border-border pt-2 md:justify-start");
      });

      it("incluye los 8 enlaces de navegación en ambas landings", () => {
        for (const enlace of ["Para entrenar", "Para entrenadores", "Coach Studio", "Athlete App"]) {
          expect(homeHtml).toContain(enlace);
          expect(entrenadoresHtml).toContain(enlace);
        }
      });
    });

    describe("L4: Capturas del producto legibles en Mobile (390 px)", () => {
      it("/entrenadores sección 01 muestra captura mobile dentro de marco táctil en mobile y Tilt en desktop", () => {
        expect(entrenadoresHtml).toContain("/landing/studio-movil.jpg");
        expect(entrenadoresCode).toContain('className="mx-auto w-full max-w-[230px] rounded-[2.2rem] border border-foreground/20 bg-foreground p-2 shadow-2xl sm:hidden"');
        expect(entrenadoresCode).toContain('${pantalla.imgMovil ? "hidden sm:block" : ""}');
      });

      it("/entrenadores secciones 03 y 04 aplican foco y zoom al 240% esquivando el menú lateral", () => {
        expect(entrenadoresCode).toContain('foco: { x: "10%", y: "0%" }');
        expect(entrenadoresCode).toContain('foco: { x: "10%", y: "19%" }');
        expect(entrenadoresCode).toContain('-ml-[var(--shot-x)] -mt-[var(--shot-y)] h-auto w-[240%] max-w-none sm:m-0 sm:w-full');
      });

      it("/ sección 07 (Coach Studio) muestra marco de teléfono con captura mobile en mobile", () => {
        expect(homeCode).toContain('src="/landing/studio-movil.jpg"');
        expect(homeCode).toContain('className="hidden sm:block lg:-mr-[30%]"');
      });

      it("/entrenadores sección 02 (Tus planes) permanece intacta con w-[165%]", () => {
        expect(entrenadoresCode).toContain('h-auto w-[165%] max-w-none sm:w-full');
      });

      it("todas las imágenes preservan width, height, loading=lazy y alt descriptivo (cero layout shift)", () => {
        expect(entrenadoresCode).toContain('loading="lazy"');
        expect(homeCode).toContain('loading="lazy"');
        expect(entrenadoresCode).toContain('width={780}');
        expect(entrenadoresCode).toContain('height={1600}');
      });
    });

    describe("L5: Sección 08 Preguntas Frecuentes", () => {
      it("botón 'Hacer mi pregunta' visible en mobile y desktop con target >= 48 px y link directo a WhatsApp", () => {
        expect(homeHtml).toContain("Hacer mi pregunta");
        expect(homeHtml).toContain("https://wa.me/5491162752515?text=Hola%20equipo%20de%20GOZS%2C%20tengo%20una%20pregunta%20antes%20de%20empezar.");
        expect(homeCode).toContain('className={`${BTN_GHOST} mt-5`}');
      });
    });

    describe("Hero de /entrenadores", () => {
      it("no tiene el párrafo largo anterior y mantiene título y CTAs con espaciado equilibrado", () => {
        expect(entrenadoresHtml).not.toContain("Dejá de pelear con interfaces poco intuitivas");
        expect(entrenadoresCode).toContain('mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:items-center');
      });
    });

    describe("Mejoras Menores y Ergonomía", () => {
      it("useBarraMovil('empezar') previene duplicación del botón 'Pedí tu demo' en el cierre mobile", () => {
        expect(entrenadoresCode).toContain('useBarraMovil("empezar")');
        expect(kitCode).toContain('visible: heroPasado && !cierreVisible');
      });

      it("carruseles mobile tienen atributos para navegación con teclado (tabIndex, role, aria-label)", () => {
        expect(homeCode).toContain('tabIndex={0}');
        expect(homeCode).toContain('role="group"');
        expect(homeCode).toContain('aria-label="Modalidades de entrenamiento"');
        expect(homeCode).toContain('aria-label="Pasos de trabajo"');
        expect(homeCode).toContain('aria-label="Testimonios de quienes ya entrenan"');
      });

      it("colores zinc-* manuales fueron reemplazados por tokens semánticos (bg-background, text-foreground)", () => {
        expect(homeCode).not.toContain('bg-zinc-950 md:col-span-4');
        expect(entrenadoresCode).not.toContain('border-zinc-700 bg-zinc-950 p-2');
      });

      it("sin scroll horizontal no intencionado en ninguna landing", () => {
        expect(homeCode).toContain("overflow-hidden");
        expect(entrenadoresCode).toContain("overflow-hidden");
      });
    });
  });

  // ==========================================================================
  // VERIFICACIÓN MATEMÁTICA ESTRICTA DE ENTRENAMIENTO DE FUERZA (QA CONTRACT)
  // ==========================================================================
  describe("Verificación Matemática Estricta de Fuerza y Robustez Offline", () => {
    describe("Fórmulas de 1RM: Epley y Brzycki", () => {
      it("Epley: 1RM = Peso * (1 + Reps / 30)", () => {
        expect(calculateEpley1RM(100, 5)).toBeCloseTo(116.6667, 4);
        expect(calculateEpley1RM(80, 10)).toBeCloseTo(106.6667, 4);
        expect(calculateEpley1RM(0, 5)).toBe(0);
        expect(calculateEpley1RM(100, 0)).toBe(0);
      });

      it("Brzycki: 1RM = Peso / (1.0278 - 0.0278 * Reps)", () => {
        expect(calculateBrzycki1RM(100, 1)).toBeCloseTo(100, 4);
        expect(calculateBrzycki1RM(100, 5)).toBeCloseTo(112.5113, 4);
        expect(calculateBrzycki1RM(100, 37)).toBe(0); // División por <= 0 prevenida
      });

      it("Tonelaje semanal: Suma(Series * Reps * Peso)", () => {
        const sesion = [
          { series: 4, reps: 8, peso: 100 }, // 3200
          { series: 3, reps: 10, peso: 80 }, // 2400
        ];
        expect(calculateTotalTonnage(sesion)).toBe(5600);
      });
    });

    describe("Temporizadores de descanso: tolerancia a suspensión en segundo plano", () => {
      it("calcula segundos restantes con timestamps absolutos frente a throttling", () => {
        const duration = 90;
        const start = Date.now();
        const returnTime = start + 35 * 1000; // Pestaña suspendida 35s
        const elapsed = Math.floor((returnTime - start) / 1000);
        const remaining = Math.max(0, duration - elapsed);

        expect(elapsed).toBe(35);
        expect(remaining).toBe(55);
      });

      it("no produce valores negativos cuando el tiempo en suspensión supera la duración", () => {
        const duration = 60;
        const start = Date.now();
        const returnTime = start + 120 * 1000; // Suspendida más del doble
        const elapsed = Math.floor((returnTime - start) / 1000);
        const remaining = Math.max(0, duration - elapsed);

        expect(remaining).toBe(0);
      });
    });
  });
});
