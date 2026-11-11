import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToString } from "react-dom/server";
import HomePage from "@/app/page";
import {
  calculateDealProgress,
  easeInOutPower2,
  STACK_ROTATIONS,
  STACK_SCALES,
  STACK_Z_INDICES,
  TRIGGER_START_RATIO,
  TRIGGER_END_RATIO,
  TRANSFORM_ORIGIN,
} from "@/components/landing/use-modalidades-deal";

describe("GOZS-485 / GOZS-471: Animación bidireccional Deal-from-center en sección 06 Modalidades", () => {
  describe("1. Parámetros geométricos y cinemáticos (Mockup HI-FI)", () => {
    it("cumple con los ángulos orgánicos de fanning para las 3 tarjetas [-8.5°, +0.4°, +7.8°]", () => {
      expect(STACK_ROTATIONS).toEqual([-8.5, 0.4, 7.8]);
    });

    it("cumple con las escalas de apilamiento [0.93, 0.96, 0.93]", () => {
      expect(STACK_SCALES).toEqual([0.93, 0.96, 0.93]);
    });

    it("establece la jerarquía de apilamiento z-index [1, 3, 2] (Boxeo central al frente)", () => {
      expect(STACK_Z_INDICES).toEqual([1, 3, 2]);
    });

    it("define el rango de scrub ligado a la rueda entre top 88% y top 20%", () => {
      expect(TRIGGER_START_RATIO).toBe(0.88);
      expect(TRIGGER_END_RATIO).toBe(0.2);
    });

    it("pivota el fanning desde el centro inferior para emular un mazo físico (50% 85%)", () => {
      expect(TRANSFORM_ORIGIN).toBe("50% 85%");
    });
  });

  describe("2. Matemática de Scrub y Easing power2.inOut", () => {
    it("evalúa límites exactos en 0 y 1 para easeInOutPower2", () => {
      expect(easeInOutPower2(0)).toBe(0);
      expect(easeInOutPower2(1)).toBe(1);
      expect(easeInOutPower2(0.5)).toBe(0.5);
    });

    it("es monótona creciente y simétrica", () => {
      let prev = -1;
      for (let t = 0; t <= 1; t += 0.05) {
        const val = easeInOutPower2(t);
        expect(val).toBeGreaterThanOrEqual(prev);
        prev = val;
      }
      expect(easeInOutPower2(0.25)).toBeCloseTo(1 - easeInOutPower2(0.75), 4);
    });

    it("GIVEN scroll en sección previa (top >= 88% vh) THEN progress = 0 (apiladas en centro)", () => {
      const vh = 1000;
      expect(calculateDealProgress(880, vh)).toBe(0);
      expect(calculateDealProgress(950, vh)).toBe(0);
      expect(calculateDealProgress(1200, vh)).toBe(0);
    });

    it("GIVEN scroll descendiendo a sección 06 (top 88% -> 20%) THEN progress transiciona suavemente hacia 1", () => {
      const vh = 1000;
      const midTop = 1000 * 0.54; // midpoint between 880 and 200
      expect(calculateDealProgress(midTop, vh)).toBe(0.5);

      const pQuarter = calculateDealProgress(880 - 680 * 0.25, vh);
      expect(pQuarter).toBe(0.125); // power2 quad: 2 * 0.25^2 = 0.125
    });

    it("GIVEN sección asentada en viewport (top <= 20% vh) THEN progress = 1 (abiertas en 3 columnas)", () => {
      const vh = 1000;
      expect(calculateDealProgress(200, vh)).toBe(1);
      expect(calculateDealProgress(100, vh)).toBe(1);
      expect(calculateDealProgress(0, vh)).toBe(1);
      expect(calculateDealProgress(-300, vh)).toBe(1);
    });

    it("GIVEN scroll hacia arriba (top aumentando) THEN la progresión se invierte continuamente hacia 0", () => {
      const vh = 1000;
      const progressDown = calculateDealProgress(400, vh);
      const progressUp = calculateDealProgress(600, vh);
      expect(progressUp).toBeLessThan(progressDown);
    });
  });

  describe("3. Integración en el DOM de la Landing (src/app/page.tsx)", () => {
    const html = renderToString(<HomePage />);

    it("renderiza la sección 06 · Modalidades con id='modalidades'", () => {
      expect(html).toContain('id="modalidades"');
    });

    it("contiene los 3 wrappers estáticos de grilla con data-modalidad-wrapper", () => {
      expect(html).toContain('data-modalidad-wrapper="0"');
      expect(html).toContain('data-modalidad-wrapper="1"');
      expect(html).toContain('data-modalidad-wrapper="2"');
    });

    it("contiene las 3 tarjetas con data-modalidad-card", () => {
      expect(html).toContain('data-modalidad-card="0"');
      expect(html).toContain('data-modalidad-card="1"');
      expect(html).toContain('data-modalidad-card="2"');
    });

    it("conserva intactos los textos, badges y CTAs de WhatsApp de las 3 modalidades", () => {
      expect(html).toContain("Funcional");
      expect(html).toContain("Boxeo");
      expect(html).toContain("Planes online");
      expect(html).toContain("QUIERO entrenar");
      expect(html).toContain("PONERME los guantes");
      expect(html).toContain("PEDIR mi plan");
      expect(html).toContain("https://wa.me/5491162752515");
    });

    it("mantiene perspectiva 3D configurada en el contenedor de grilla", () => {
      expect(html).toContain("perspective:1400px");
    });
  });
});
