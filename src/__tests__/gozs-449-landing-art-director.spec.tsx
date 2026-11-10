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

describe("GOZS-449: Rediseño integral de landing según dictamen de Dirección de Arte", () => {
  const pagePath = path.resolve(__dirname, "../app/page.tsx");
  const pageCode = fs.readFileSync(pagePath, "utf-8");
  const html = renderToStaticMarkup(createElement(HomePage));
  const text = cleanText(html);

  describe("Criterio 1: Hero Section con titular axiomático, CTA a WhatsApp y telemetría de sesión plana", () => {
    it("GIVEN la Hero Section THEN presenta el titular axiomático 'La técnica no se negocia. El progreso se mide.'", () => {
      expect(text).toContain("La técnica no se negocia. El progreso se mide.");
      expect(pageCode).toContain("La técnica no se negocia. El progreso se mide.");
    });

    it("GIVEN la Hero Section THEN incluye bajada ultra-sintética", () => {
      expect(text).toContain(
        "Entrenar no es cansarse hasta transpirar. Es mover más peso con mejor técnica, semana a semana."
      );
    });

    it("GIVEN la Hero Section THEN incluye CTA primario directo a WhatsApp", () => {
      expect(text).toContain("Consultar por WhatsApp");
      expect(html).toContain("https://wa.me/5491100000000");
    });

    it("GIVEN la Hero Section THEN renderiza la tarjeta de telemetría de sesión plana con 140.0 kg y RPE 8.5", () => {
      expect(text).toContain("TELEMETRÍA DE SESIÓN");
      expect(text).toContain("140.0");
      expect(text).toContain("RPE");
      expect(text).toContain("8.5");
      expect(text).toContain("Carga Efectiva");
      expect(text).toContain("Esfuerzo Real");
      // Sin rotaciones 3D rotas ni transform-style-3d desbordante
      expect(pageCode).not.toContain("rotateY(-6deg)");
      expect(pageCode).not.toContain("-mt-20");
    });
  });

  describe("Criterio 2: Sección comparativa con 4 Fichas Técnicas de Diagnóstico Biomecánico ('Protocolo de Descarte')", () => {
    it("GIVEN la sección comparativa THEN erradica el formato de tabla genérica SaaS y presenta el Protocolo de Descarte", () => {
      expect(html).toContain('data-testid="seccion-contraste-realidad"');
      expect(text).toContain("Protocolo de Descarte");
      expect(text).toContain("Fichas Técnicas de Diagnóstico Biomecánico");
      // No contiene elementos de tabla clásicos de SaaS
      expect(pageCode).not.toContain("grid-cols-[9rem_1fr_1fr]");
    });

    it("GIVEN las 4 fichas técnicas THEN cubren Sobrecarga, Técnica, Individualización y Tecnología", () => {
      // 01. Sobrecarga
      expect(text).toContain("Sobrecarga Progresiva Kilo por Kilo");
      expect(text).toContain("Adivinar el peso y levantar la misma mancuerna hace 6 meses.");
      expect(text).toContain("Sobrecarga progresiva kilo por kilo registrado.");

      // 02. Técnica
      expect(text).toContain("Auditoría Biomecánica y Ojos de DT");
      expect(text).toContain("Profesor en recepción mirando el celular");
      expect(text).toContain("Ojos de Director Técnico (Romero Brest, FAB, Halterofilia).");

      // 03. Individualización
      expect(text).toContain("Prescripción Antropométrica Real");
      expect(text).toContain("Fotocopia arrugada y genérica");
      expect(text).toContain("Plan individualizado según tus palancas y movilidad.");

      // 04. Tecnología
      expect(text).toContain("Infraestructura Soberana Offline");
      expect(text).toContain("Apps comerciales lentas en dólares");
      expect(text).toContain("GOZSter, tecnología propia, offline y sin suscripción.");
    });
  });

  describe("Criterio 3: Sección de trayectoria con 4 Insignias de Acreditación Oficial y transferencia pragmática", () => {
    it("GIVEN la sección de trayectoria THEN presenta las 4 acreditaciones con monogramas y transferencia al alumno", () => {
      expect(html).toContain('id="trayectoria"');
      expect(text).toContain("Formación Académica y Dirección Técnica");

      // 4 Acreditaciones con monogramas
      expect(text).toContain("ISEF");
      expect(text).toContain('ISEF N°1 "Dr. Enrique Romero Brest"');
      expect(text).toContain("Profesor Nacional de Educación Física");

      expect(text).toContain("CEEF");
      expect(text).toContain("Centro Europeo de Educación Física");
      expect(text).toContain("Personal Trainer Certificado");

      expect(text).toContain("GPO");
      expect(text).toContain("Grupo GPO Latam");
      expect(text).toContain("Entrenador en Halterofilia");

      expect(text).toContain("FAB");
      expect(text).toContain("Federación Argentina de Boxeo (FAB)");
      expect(text).toContain("Director Técnico de Boxeo");

      // Transferencia pragmática del beneficio al alumno
      expect(text).toContain("Transferencia al Alumno");
      expect(html).toContain('data-testid="franja-cv-1"');
      expect(html).toContain('data-testid="franja-cv-2"');
      expect(html).toContain('data-testid="franja-cv-3"');
      expect(html).toContain('data-testid="franja-cv-4"');
    });
  });

  describe("Criterio 4: Sección de modalidades con tríptico visual, fotografía B&N en duotono y reducción 75%", () => {
    it("GIVEN la sección de modalidades THEN despliega el tríptico de 3 disciplinas con fotografía B&N y chips", () => {
      expect(html).toContain('id="modalidades"');
      expect(text).toContain("Modalidades de Trabajo");

      // Funcional
      expect(text).toContain("Funcional");
      expect(text).toContain("Presencial");
      expect(text).toContain("Patrones Motores");
      expect(text).toContain("Blindaje Articular");

      // Boxeo
      expect(text).toContain("Boxeo");
      expect(text).toContain("Escuela FAB");
      expect(text).toContain("Transferencia Cinética");
      expect(text).toContain("Potencia Rotacional");

      // Rutinas online
      expect(text).toContain("Rutinas online");
      expect(text).toContain("100% Offline-First PWA");
      expect(text).toContain("Sobrecarga Kilo a Kilo");

      // Fotografía B&N en duotono
      expect(pageCode).toContain("grayscale contrast-125");
      expect(pageCode).toContain("mix-blend-multiply");
    });
  });

  describe("Criterio 5: Plataforma para profesionales con Walkthrough Lineal en 3 Actos", () => {
    it("GIVEN la sección de profesionales THEN presenta el Walkthrough Lineal en 3 Actos bajo paleta Zinc", () => {
      expect(html).toContain('id="infraestructura"');
      expect(html).toContain('data-testid="seccion-entrenadores"');

      // Acto 01: Creación
      expect(text).toContain("Acto 01");
      expect(text).toContain("Constructor de rutinas con superseries en segundos.");

      // Acto 02: Ejecución Offline
      expect(text).toContain("Acto 02");
      expect(text).toContain("Funciona 100% offline en sótanos sin señal.");

      // Acto 03: Auditoría & Récords
      expect(text).toContain("Acto 03");
      expect(text).toContain("Seguimiento de retención y alertas automáticas de sobrecarga.");

      // Soberanía $0
      expect(text).toContain("$0 en licencias comerciales (software libre y soberano).");
      expect(text).toContain("Ingresar a Coach Studio Gratis (Sin tarjeta)");
      expect(html).toContain('href="/studio"');
      expect(html).toContain('href="/athlete"');
    });
  });

  describe("Criterio 6: Restricciones de diseño, ergonomía y a11y", () => {
    it("cumple con áreas táctiles mínimas de 48px y overflow-x controlado", () => {
      expect(pageCode).toContain("min-h-[48px]");
      expect(pageCode).toContain("overflow-x-hidden");
    });

    it("prohíbe el uso de emojis estructurales (Anti-Slop)", () => {
      expect(pageCode).not.toMatch(/🏋️|🏋️‍♂️|📊|⚡|🔥|👥|📈|💪/);
    });

    it("no contiene gradientes chillones ni polígonos difusos", () => {
      expect(pageCode).not.toContain("blur-3xl");
      expect(pageCode).not.toContain("clip-path");
      expect(pageCode).not.toContain("polygon");
    });
  });
});
