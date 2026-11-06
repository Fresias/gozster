import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IslaMetricas1RM } from "@/components/coach/student-detail/islas/isla-metricas-1rm";
import { LUCAS_2_MONTHS_HISTORIAL } from "@/services/coach-mock-data";

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

  describe("Criterio Gherkin 1: Badge de advertencia cuando hay ejercicios en descenso", () => {
    it("GIVEN un alumno con 2 de 4 ejercicios con cargas en descenso en los últimos microciclos THEN la isla de Fuerza exhibe badge de advertencia '2 de 4 en progresión'", () => {
      const html = renderToStaticMarkup(
        <IslaMetricas1RM
          historialCargas={historialConDescenso as any}
          pesoCorporalActual={80}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      // Badge semántico de consistencia con '2 de 4 en progresión'
      expect(html).toContain("2 de 4 en progresión");
      expect(html).toContain('data-variant="warning"');

      // Variaciones porcentuales de rendimiento (+/- %)
      expect(html).toContain("+11.11%");
      expect(html).toContain("+10%");
      expect(html).toContain("-6.67%");

      // Ganancia en kg (+/-)
      expect(html).toContain("+10 kg");
      expect(html).toContain("+12 kg");
      expect(html).toContain("-10 kg");
      expect(html).toContain("-4 kg");
    });
  });

  describe("Criterio Gherkin 2: Tooltips informativos de fórmulas 1RM Epley y Brzycki con variables aplicadas", () => {
    it("GIVEN el indicador de 1RM estimado WHEN el tooltip está abierto THEN despliega la fórmula y variables aplicadas (Epley / Brzycki)", () => {
      const html = renderToStaticMarkup(
        <IslaMetricas1RM
          historialCargas={historialConDescenso as any}
          pesoCorporalActual={80}
          isCollapsed={false}
          tooltipOpen={true}
          onToggleCollapse={vi.fn()}
        />
      );

      // Indicadores 1RM
      expect(html).toContain('data-testid="metricas-1rm-epley"');
      expect(html).toContain('data-testid="metricas-1rm-brzycki"');

      // Botones de ayuda accesibles con aria-label
      expect(html).toContain('aria-label="Ayuda fórmula Epley"');
      expect(html).toContain('aria-label="Ayuda fórmula Brzycki"');
      expect(html).toContain('data-testid="help-icon-epley"');
      expect(html).toContain('data-testid="help-icon-brzycki"');

      // Tooltip Epley con fórmula y variables aplicadas
      expect(html).toContain("Fórmula de Epley");
      expect(html).toContain("1RM = Peso × (1 + Reps / 30)");
      expect(html).toContain("Variables aplicadas: Peso levantado (kg) y repeticiones realizadas (Reps).");

      // Tooltip Brzycki con fórmula y variables aplicadas
      expect(html).toContain("Fórmula de Brzycki");
      expect(html).toContain("1RM = Peso × (36 / (37 - Reps))");
      expect(html).toContain("Variables aplicadas: Peso levantado (kg) y repeticiones realizadas (Reps &lt; 37).");
    });
  });

  describe("Criterio Gherkin 3: Erradicación total de referencias a Tonelaje Mensual o sumatorias de volumen", () => {
    it("GIVEN la visualización general de la isla THEN no se encuentra ninguna referencia a 'Tonelaje Mensual' ni sumatorias de volumen en kg", () => {
      const html = renderToStaticMarkup(
        <IslaMetricas1RM
          historialCargas={historialConDescenso as any}
          pesoCorporalActual={80}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      // No debe existir 'Tonelaje Mensual' (case-insensitive)
      expect(html.toLowerCase()).not.toContain("tonelaje mensual");
      expect(html.toLowerCase()).not.toContain("volumen total");
      expect(html.toLowerCase()).not.toContain("volumen mensual");
      expect(html.toLowerCase()).not.toContain("tonelaje acumulado");

      // Debe exhibir la progresión real por ejercicio básico
      expect(html).toContain("Progresión Real de Cargas");
      expect(html).toContain("Sobrecarga");
    });
  });

  describe("Criterio Sparklines: SVGs accesibles de evolución de peso y cargas recientes", () => {
    it("renderiza SVGs accesibles con role='img' para evolución de peso corporal y cargas recientes", () => {
      const html = renderToStaticMarkup(
        <IslaMetricas1RM
          historialCargas={LUCAS_2_MONTHS_HISTORIAL as any}
          pesoCorporalActual={78.5}
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
        />
      );

      // Contenedor de evolución de peso corporal
      expect(html).toContain('data-testid="evolucion-peso-corporal"');
      expect(html).toContain("78.5 kg");

      // Sparkline SVG de peso corporal
      expect(html).toContain('data-testid="sparkline-peso-corporal"');
      expect(html).toContain('aria-label="Evolución de peso corporal:');

      // Sparkline SVG de cargas recientes
      expect(html).toContain('data-testid="sparkline-cargas-recientes"');
      expect(html).toContain('aria-label="Evolución de cargas recientes:');
    });
  });
});
