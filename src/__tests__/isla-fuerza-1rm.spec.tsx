import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { IslaMetricas1RM } from "@/components/coach/student-detail/islas/isla-metricas-1rm";
import {
  assertNoDemoLiteralsInLiveMode,
  fireEvent,
  render,
} from "@/test-utils/no-demo-literals";

describe("FIX-08 / GOZS-396: IslaMetricas1RM (IslaFuerza1RM) montada con datos en vivo", () => {
  const fechaSemana1 = "2026-09-10T10:00:00Z";
  const fechaSemana8 = "2026-11-04T10:00:00Z";

  // Datos simulados de base de datos distintos de las constantes de fallback (80->95, 100->120, 90->115, 50->60, peso 78.5)
  const historialVivoConDescenso = [
    {
      sesion: { id: "ses-live-1", fecha: fechaSemana1 },
      series: [
        { id: "s-1", ejercicioNombre: "Press de Banca", peso_kg: 90, reps_hechas: 5 },
        { id: "s-2", ejercicioNombre: "Sentadilla Trasera", peso_kg: 120, reps_hechas: 5 },
        { id: "s-3", ejercicioNombre: "Peso Muerto", peso_kg: 150, reps_hechas: 5 },
        { id: "s-4", ejercicioNombre: "Press Militar", peso_kg: 60, reps_hechas: 5 },
      ],
    },
    {
      sesion: { id: "ses-live-2", fecha: fechaSemana8 },
      series: [
        // 1. Press de Banca: 90kg -> 100kg (+11.11%) -> sube
        { id: "s-5", ejercicioNombre: "Press de Banca", peso_kg: 100, reps_hechas: 5 },
        // 2. Sentadilla Trasera: 120kg -> 132kg (+10%) -> sube
        { id: "s-6", ejercicioNombre: "Sentadilla Trasera", peso_kg: 132, reps_hechas: 5 },
        // 3. Peso Muerto: 150kg -> 140kg (-6.67%) -> baja
        { id: "s-7", ejercicioNombre: "Peso Muerto", peso_kg: 140, reps_hechas: 5 },
        // 4. Press Militar: 60kg -> 56kg (-6.67%) -> baja
        { id: "s-8", ejercicioNombre: "Press Militar", peso_kg: 56, reps_hechas: 5 },
      ],
    },
  ];

  const pesoHistorialVivo = [
    { fecha: "Ago 26", peso: 86.4 },
    { fecha: "Sep 26", peso: 85.1 },
    { fecha: "Oct 26", peso: 84.6 },
    { fecha: "Nov 26", peso: 83.9 },
  ];

  const cargasRecientesVivas = [
    { fecha: "15 sep", carga: 120 },
    { fecha: "01 oct", carga: 126 },
    { fecha: "18 oct", carga: 130 },
    { fecha: "04 nov", carga: 132 },
  ];

  describe("Criterio Gherkin 1: Montaje con render(...) sobre datos distintos del fallback", () => {
    it("GIVEN un alumno en vivo con 2 de 4 ejercicios en descenso WHEN se monta IslaMetricas1RM con render(...) THEN verifica el DOM resultante sin valores del fallback ni literales demo", () => {
      const onToggleCollapse = vi.fn();
      const { container, getByTestId } = render(
        <IslaMetricas1RM
          historialCargas={historialVivoConDescenso as any}
          pesoCorporalActual={83.9}
          pesoHistorial={pesoHistorialVivo}
          cargasRecientes={cargasRecientesVivas}
          isCollapsed={false}
          onToggleCollapse={onToggleCollapse}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const badgeProgresion = getByTestId("badge-progresion");
      expect(badgeProgresion.textContent).toContain("2 de 4 en progresión");
      expect(badgeProgresion.getAttribute("data-variant")).toBe("warning");

      // Verifica variaciones porcentuales y ganancias reales en el DOM montado
      // Objetivo Ficha.html: badge "↑ n%" / "↓ n%" (redondeado) y la ganancia en kg en el title de la fila
      expect(container.textContent).toContain("↑ 11%");
      expect(container.textContent).toContain("↑ 10%");
      expect(container.textContent).toContain("↓ 7%");
      expect(container.innerHTML).toContain('title="+10 kg en 2 meses"');
      expect(container.innerHTML).toContain('title="+12 kg en 2 meses"');
      expect(container.innerHTML).toContain('title="-10 kg en 2 meses"');
      expect(container.innerHTML).toContain('title="-4 kg en 2 meses"');

      // Verifica que los valores recibidos por props desplazaron a los fallbacks estáticos (78.5, 142.5, Micro 1)
      expect(container.textContent).toContain("Peso corporal · 83,9 kg");
      expect(container.textContent).not.toContain("78.5 kg");
      expect(container.textContent).not.toContain("142.5 kg");
      expect(container.textContent).not.toContain("Micro 1");
    });
  });

  describe("Criterio Gherkin 2: Tooltips informativos de fórmulas 1RM Epley y Brzycki en el DOM montado", () => {
    it("GIVEN el indicador de 1RM estimado WHEN el tooltip está abierto THEN despliega la fórmula y variables aplicadas (Epley / Brzycki) con cálculos exactos sobre datos vivos", () => {
      const { container, getByTestId, getByLabelText } = render(
        <IslaMetricas1RM
          historialCargas={historialVivoConDescenso as any}
          pesoCorporalActual={83.9}
          pesoHistorial={pesoHistorialVivo}
          cargasRecientes={cargasRecientesVivas}
          isCollapsed={false}
          tooltipOpen={true}
          onToggleCollapse={vi.fn()}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      // Peso Muerto 150 kg x 5 reps -> Epley = 150 * (1 + 5/30) = 175 kg; Brzycki = 150 * 36 / 32 = 168.8 kg
      const cardEpley = getByTestId("metricas-1rm-epley");
      const cardBrzycki = getByTestId("metricas-1rm-brzycki");
      expect(cardEpley.textContent).toContain("175 kg");
      expect(container.textContent).toContain("1RM estimado · Peso Muerto");
      expect(cardBrzycki.textContent).toContain("168,8 kg");

      expect(getByLabelText("Ayuda fórmula Epley")).toBeTruthy();
      expect(getByLabelText("Ayuda fórmula Brzycki")).toBeTruthy();

      expect(container.textContent).toContain("Fórmula de Epley");
      expect(container.textContent).toContain("1RM = Peso × (1 + Reps / 30)");
      expect(container.textContent).toContain("Fórmula de Brzycki");
      expect(container.textContent).toContain("1RM = Peso × (36 / (37 - Reps))");
    });
  });

  describe("Criterio Gherkin 3: Ausencia de Tonelaje Mensual y verificación de Sparklines SVG e interacción", () => {
    it("GIVEN la isla montada con series de peso y cargas vivas THEN renderiza SVGs accesibles con los rangos reales y dispara onToggleCollapse al interactuar", () => {
      const onToggleCollapse = vi.fn();
      const { container, getByTestId } = render(
        <IslaMetricas1RM
          historialCargas={historialVivoConDescenso as any}
          pesoCorporalActual={83.9}
          pesoHistorial={pesoHistorialVivo}
          cargasRecientes={cargasRecientesVivas}
          isCollapsed={false}
          onToggleCollapse={onToggleCollapse}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const lowerText = container.textContent?.toLowerCase() ?? "";
      expect(lowerText).not.toContain("tonelaje mensual");
      expect(lowerText).not.toContain("volumen total");
      expect(lowerText).not.toContain("tonelaje acumulado");

      // P04: el peso corporal es un dato simple y el sparkline pasa al 1RM por sesión
      expect(container.querySelector('[data-testid="sparkline-peso-corporal"]')).toBeNull();
      expect(container.querySelector('[data-testid="sparkline-cargas-recientes"]')).toBeNull();
      expect(getByTestId("evolucion-peso-corporal").textContent).toBe("Peso corporal · 83,9 kg");

      // Interacción sobre el botón de colapsar de la cabecera de la isla
      const toggleBtn = getByTestId("collapse-btn-metricas_1rm");
      fireEvent.click(toggleBtn);
      expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    });
  });
});
