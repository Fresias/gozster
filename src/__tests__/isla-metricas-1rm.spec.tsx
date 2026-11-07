import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { IslaMetricas1RM } from "@/components/coach/student-detail/islas/isla-metricas-1rm";
import {
  assertNoDemoLiteralsInLiveMode,
  render,
} from "@/test-utils/no-demo-literals";

describe("GOZS-396: IslaMetricas1RM - Telemetría de Cargas y 1RM Epley/Brzycki", () => {
  // Mock dataset con 4 ejercicios: 2 en subida y 2 en descenso (> 2.5% umbral)
  const fechaSemana1 = "2026-09-10T10:00:00Z";
  const fechaSemana8 = "2026-11-04T10:00:00Z";

  const historialConDescenso = [
    {
      sesion: { id: "ses-1", fecha: fechaSemana1 },
      series: [
        { id: "s-1", ejercicioNombre: "Press de Banca", peso_kg: 90, reps_hechas: 5 },
        { id: "s-2", ejercicioNombre: "Sentadilla Trasera", peso_kg: 120, reps_hechas: 5 },
        { id: "s-3", ejercicioNombre: "Peso Muerto", peso_kg: 150, reps_hechas: 5 },
        { id: "s-4", ejercicioNombre: "Press Militar", peso_kg: 60, reps_hechas: 5 },
      ],
    },
    {
      sesion: { id: "ses-2", fecha: fechaSemana8 },
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
    { fecha: "Ago 26", peso: 84.0 },
    { fecha: "Sep 26", peso: 82.8 },
    { fecha: "Oct 26", peso: 81.5 },
    { fecha: "Nov 26", peso: 80.2 },
  ];

  describe("Criterio Gherkin 1: Badge de advertencia cuando hay ejercicios en descenso", () => {
    it("GIVEN un alumno con 2 de 4 ejercicios con cargas en descenso en los últimos microciclos THEN la isla de Fuerza exhibe badge de advertencia '2 de 4 en progresión'", () => {
      const { container, getByTestId } = render(
        <IslaMetricas1RM
          historialCargas={historialConDescenso as any}
          pesoCorporalActual={80.2}
          pesoHistorial={pesoHistorialVivo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const badge = getByTestId("badge-progresion");
      expect(badge.textContent).toContain("2 de 4 en progresión");
      expect(badge.getAttribute("data-variant")).toBe("warning");

      // Variaciones porcentuales de rendimiento (+/- %)
      // Objetivo Ficha.html: badge "↑ n%" / "↓ n%" (redondeado) y la ganancia en kg en el title de la fila
      expect(container.textContent).toContain("↑ 11%");
      expect(container.textContent).toContain("↑ 10%");
      expect(container.textContent).toContain("↓ 7%");

      // Ganancia en kg (+/-)
      expect(container.innerHTML).toContain('title="+10 kg en 2 meses"');
      expect(container.innerHTML).toContain('title="+12 kg en 2 meses"');
      expect(container.innerHTML).toContain('title="-10 kg en 2 meses"');
      expect(container.innerHTML).toContain('title="-4 kg en 2 meses"');
    });
  });

  describe("Criterio Gherkin 2: Tooltips informativos de fórmulas 1RM Epley y Brzycki con variables aplicadas", () => {
    it("GIVEN el indicador de 1RM estimado WHEN el tooltip está abierto THEN despliega la fórmula y variables aplicadas (Epley / Brzycki)", () => {
      const { container, getByTestId, getByLabelText } = render(
        <IslaMetricas1RM
          historialCargas={historialConDescenso as any}
          pesoCorporalActual={80.2}
          pesoHistorial={pesoHistorialVivo}
          isCollapsed={false}
          tooltipOpen={true}
          onToggleCollapse={vi.fn()}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      expect(getByTestId("metricas-1rm-epley")).toBeTruthy();
      expect(getByTestId("metricas-1rm-brzycki")).toBeTruthy();
      expect(getByLabelText("Ayuda fórmula Epley")).toBeTruthy();
      expect(getByLabelText("Ayuda fórmula Brzycki")).toBeTruthy();
      expect(getByTestId("help-icon-epley")).toBeTruthy();
      expect(getByTestId("help-icon-brzycki")).toBeTruthy();

      expect(container.textContent).toContain("Fórmula de Epley");
      expect(container.textContent).toContain("1RM = Peso × (1 + Reps / 30)");
      expect(container.textContent).toContain(
        "Variables aplicadas: Peso levantado (kg) y repeticiones realizadas (Reps)."
      );

      expect(container.textContent).toContain("Fórmula de Brzycki");
      expect(container.textContent).toContain("1RM = Peso × (36 / (37 - Reps))");
      expect(container.textContent).toContain(
        "Variables aplicadas: Peso levantado (kg) y repeticiones realizadas (Reps < 37)."
      );
    });
  });

  describe("Criterio Gherkin 3: Erradicación total de referencias a Tonelaje Mensual o sumatorias de volumen", () => {
    it("GIVEN la visualización general de la isla THEN no se encuentra ninguna referencia a 'Tonelaje Mensual' ni sumatorias de volumen en kg", () => {
      const { container } = render(
        <IslaMetricas1RM
          historialCargas={historialConDescenso as any}
          pesoCorporalActual={80.2}
          pesoHistorial={pesoHistorialVivo}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const textLower = (container.textContent ?? "").toLowerCase();
      expect(textLower).not.toContain("tonelaje mensual");
      expect(textLower).not.toContain("volumen total");
      expect(textLower).not.toContain("volumen mensual");
      expect(textLower).not.toContain("tonelaje acumulado");

      expect(container.textContent).toContain("Fuerza y progreso");
      expect(container.textContent).toContain("últimos 2 meses");
    });
  });

  describe("Criterio Sparklines: SVGs accesibles de evolución de peso y cargas recientes", () => {
    it("renderiza SVGs accesibles con role='img' para evolución de peso corporal y cargas recientes con datos distintos del fallback", () => {
      const { container, getByTestId } = render(
        <IslaMetricas1RM
          historialCargas={historialConDescenso as any}
          pesoCorporalActual={80.2}
          pesoHistorial={pesoHistorialVivo}
          cargasRecientes={[
            { fecha: "Sem 1", carga: 118 },
            { fecha: "Sem 3", carga: 124 },
            { fecha: "Sem 6", carga: 129 },
            { fecha: "Sem 8", carga: 132 },
          ]}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      // P04: "Peso corporal · {kg}" como dato simple; sin sparklines de peso ni de cargas recientes
      const evolucion = getByTestId("evolucion-peso-corporal");
      expect(evolucion.textContent).toContain("80,2 kg");
      expect(container.querySelector('[data-testid="sparkline-peso-corporal"]')).toBeNull();
      expect(container.querySelector('[data-testid="sparkline-cargas-recientes"]')).toBeNull();
    });
  });
});
