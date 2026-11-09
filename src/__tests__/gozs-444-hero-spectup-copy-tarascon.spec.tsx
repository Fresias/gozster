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

describe("GOZS-444 / GOZS-443: Hero 3D Spectup, Tabla de Contraste Tarascón y Sección para Entrenadores", () => {
  const pagePath = path.resolve(__dirname, "../app/page.tsx");
  const pageCode = fs.readFileSync(pagePath, "utf-8");
  const globalsPath = path.resolve(__dirname, "../app/globals.css");
  const globalsCode = fs.readFileSync(globalsPath, "utf-8");
  const html = renderToStaticMarkup(createElement(HomePage));
  const text = cleanText(html);

  describe("1. Hero Section de Alto Impacto (Spectup Style) y Micro-Glitch", () => {
    it("incluye el badge superior con el nuevo copy sin humo", () => {
      expect(text).toContain("PREPARACIÓN FÍSICA DE FUERZA · TECNOLOGÍA PROPIA · 0 HUMO");
    });

    it("presenta el titular contundente y el micro-glitch en hover sobre GONZALO SALAS", () => {
      expect(pageCode).toContain("glitch-hover");
      expect(pageCode).toContain('data-text="GONZALO SALAS"');
      expect(text).toContain("GONZALO SALAS");
      expect(text).toContain(
        "Entrenar no es cansarse hasta transpirar. Es mover más peso con mejor técnica, semana a semana."
      );
    });

    it("incorpora la bajada sin humo de contraste de realidad", () => {
      expect(text).toContain(
        "La mayoría de la gente pasa meses en el gimnasio levantando la misma mancuerna, siguiendo una rutina fotocopiada que nadie mira y adivinando si progresa."
      );
      expect(text).toContain(
        "Con Gonzalo Salas cada serie tiene un número, la técnica se audita antes de subir los kilos y tu avance se mide con datos reales."
      );
    });

    it("renderiza la composición 3D de 3 capas superpuestas con contraste dramático (Spectup Style)", () => {
      expect(pageCode).toContain("perspective-1200");
      expect(html).toContain('data-testid="hero-card-layer-back"');
      expect(html).toContain('data-testid="hero-card-layer-middle"');
      expect(html).toContain('data-testid="hero-card-layer-front"');

      // Capa 1: Posterior (Atmósfera y Fotografía Técnica B&N)
      expect(text).toContain("MÉTODO GONZALO SALAS · 2026");
      expect(pageCode).toContain("grayscale contrast-150");
      expect(text).toContain("Hierro pesado, técnica estricta y magnesio.");

      // Capa 2: Intermedia (Tarjeta Blanca Nítida de Contraste)
      expect(pageCode).toContain("bg-white text-zinc-950");
      expect(text).toContain(
        "El 90% de los que van al gimnasio no tienen un problema de voluntad. Tienen una rutina genérica y nadie que les mire la técnica."
      );

      // Capa 3: Frontal (Tarjeta Técnica de Métricas y Autoridad #121214)
      expect(pageCode).toContain("#121214");
      expect(pageCode).toContain("border-zinc-800");
      expect(text).toContain("+150");
      expect(text).toContain(
        "que dejaron de estancarse y hoy levantan con técnica impecable."
      );
      expect(text).toContain("Halterofilia");
      expect(text).toContain("Fuerza");
      expect(text).toContain("Boxeo");
      expect(text).toContain("Ver metodología auditada");
    });
  });

  describe("2. Bloque de Contraste de Realidad (Estilo Tarascón)", () => {
    it("renderiza la sección comparativa con las 4 oposiciones directas", () => {
      expect(html).toContain('data-testid="seccion-contraste-realidad"');
      expect(text).toContain(
        "Lo que pasa en un gimnasio común vs. Entrenar con Gonzalo Salas"
      );

      // 1. Rutina
      expect(text).toContain("Fotocopia arrugada y genérica");
      expect(text).toContain("Plan individualizado según tus palancas y movilidad.");

      // 2. Carga
      expect(text).toContain("Adivinar el peso");
      expect(text).toContain("Sobrecarga progresiva kilo por kilo registrado.");

      // 3. Técnica
      expect(text).toContain("Profesor en recepción mirando el celular");
      expect(text).toContain("Ojos de Director Técnico (Romero Brest, FAB, Halterofilia).");

      // 4. Software
      expect(text).toContain("Apps comerciales lentas en dólares");
      expect(text).toContain("GOZSter, tecnología propia, offline y sin suscripción.");
    });
  });

  describe("3. Nueva Sección para Entrenadores y Gimnasios", () => {
    it("presenta el titular, los 4 beneficios concretos y el CTA hacia /studio", () => {
      expect(html).toContain('data-testid="seccion-entrenadores"');
      expect(text).toContain(
        "¿Sos entrenador o tenés un gimnasio? Dejá de perder 10 horas por semana con Excels y fotocopias."
      );

      // 4 Beneficios
      expect(text).toContain("Constructor de rutinas con superseries en segundos.");
      expect(text).toContain(
        "Seguimiento de retención y alertas automáticas de sobrecarga."
      );
      expect(text).toContain("Funciona 100% offline en sótanos sin señal.");
      expect(text).toContain(
        "$0 en licencias comerciales (software libre y soberano)."
      );

      // CTA destacado hacia /studio
      expect(text).toContain("Ingresar a Coach Studio Gratis (Sin tarjeta)");
      expect(html).toMatch(/href=["']\/studio["']/);
    });
  });

  describe("4. Modalidades de Trabajo y Credenciales Preservadas", () => {
    it("mantiene las 4 franjas de credenciales de Gonzalo Salas con inversión hover", () => {
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
    });

    it("refina los copys de las 3 modalidades con foco en beneficio físico real", () => {
      expect(text).toContain("Funcional");
      expect(text).toContain(
        "Entrenamiento basado en movimientos humanos reales: empujar, traccionar, bisagras de cadera y acarreos."
      );
      expect(text).toContain("Boxeo");
      expect(text).toContain(
        "Dirección técnica oficial FAB. Aprendés a pegar con la biomecánica correcta"
      );
      expect(text).toContain("Rutinas online");
      expect(text).toContain(
        "Planificación kilo a kilo cargada en tu celular."
      );
    });
  });

  describe("5. Ergonomía Táctil, Anti-Slop y Accesibilidad WCAG", () => {
    it("cumple con áreas táctiles mínimas de 48px y sin desborde horizontal", () => {
      expect(pageCode).toContain("min-h-[48px]");
      expect(pageCode).toContain("overflow-x-hidden");
    });

    it("prohíbe el uso de emojis estructurales (Anti-Slop)", () => {
      expect(pageCode).not.toMatch(/🏋️|🏋️‍♂️|📊|⚡|🔥|👥|📈|💪/);
    });

    it("desactiva micro-glitch y 3D en prefers-reduced-motion: reduce", () => {
      expect(globalsCode).toContain("@media (prefers-reduced-motion: reduce)");
      expect(globalsCode).toContain(".glitch-hover");
      expect(globalsCode).toContain("animation: none !important");
      expect(globalsCode).toContain(".hero-3d-card");
      expect(globalsCode).toContain("transform: none !important");
    });
  });
});
