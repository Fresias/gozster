import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  FORBIDDEN_DEMO_LITERALS,
  assertNoDemoLiteralsInLiveMode,
  createDomContainer,
  render,
} from "@/test-utils/no-demo-literals";
import { IslaSaludAnamnesis } from "@/components/coach/student-detail/islas/isla-salud-anamnesis";

describe("FIX-08: Helper y Guard contra literales de demo en modo en vivo (no-demo-literals)", () => {
  describe("Criterio 1: Detección de literales de ejemplo en contenedores DOM", () => {
    it("GIVEN un contenedor DOM con datos reales sin literales prohibidos WHEN se invoca assertNoDemoLiteralsInLiveMode THEN pasa sin errores", () => {
      const { container } = render(
        <div data-testid="ficha-real">
          <h2>Fernando Rosales</h2>
          <p>Dolor lumbar · EVA 6 · Controlar bisagra de cadera</p>
        </div>
      );

      expect(() => assertNoDemoLiteralsInLiveMode(container)).not.toThrow();
    });

    it("GIVEN el helper assertNoDemoLiteralsInLiveMode WHEN se le pasa un contenedor DOM que incluye '28 oct: agarre neutro' o 'Lucas M.' THEN lanza un error de aserción claro indicando qué literal de demo se filtró en modo en vivo", () => {
      const containerConNotaDemo = createDomContainer(
        `<div class="nota">28 oct: agarre neutro y Landmine Press 3x10 25 kg sin molestia</div>`
      );
      expect(() => assertNoDemoLiteralsInLiveMode(containerConNotaDemo)).toThrow(
        /Literal de demo filtrado en modo en vivo: "28 oct: agarre neutro"/
      );

      const containerConAlumnoDemo = createDomContainer(
        `<div class="fila-alerta"><span>Lucas M.</span><span>Hombro anterior</span></div>`
      );
      expect(() => assertNoDemoLiteralsInLiveMode(containerConAlumnoDemo)).toThrow(
        /Literal de demo filtrado en modo en vivo: "Lucas M\."/
      );
    });

    it.each(FORBIDDEN_DEMO_LITERALS)(
      "detecta y rechaza el literal prohibido de fallback '%s'",
      (literalProhibido) => {
        const { container } = render(
          <section>
            <p>Dato filtrado: {literalProhibido}</p>
          </section>
        );

        expect(() => assertNoDemoLiteralsInLiveMode(container)).toThrow(
          new RegExp(`Literal de demo filtrado en modo en vivo: "${literalProhibido.replace(".", "\\.")}"`)
        );
      }
    );
  });

  describe("Criterio 2: IslaSaludAnamnesis montada con un caso de dolor real sin vestigios de Landmine Press", () => {
    it("GIVEN un caso de dolor real WHEN se monta IslaSaludAnamnesis con render(...) THEN renderiza zona, eva y notas_profesor reales sin el string de ejemplo de Landmine Press", () => {
      const { container, getByTestId } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          alumnoId="alumno-real-fernando"
          dolorActivo={{
            id: "dolor-real-901",
            alumno_id: "alumno-real-fernando",
            zona_articular: "Columna lumbar baja",
            ejercicio_nombre: "Peso muerto rumano con barra",
            eva: 6,
            severidad: "MODERADO",
            nivel: "medio",
            estado: "PENDIENTE",
            fecha_reporte: "06 nov 10:15",
            notas_profesor: "Reducir carga al 70% y priorizar variante en bloques altos.",
          }}
          anamnesisData={{
            objetivo: "Fuerza General",
            frecuencia: "3 días / semana",
            molestiaPrevia: "Lumbar",
            cirugias: "Apendicectomía 2019",
          }}
        />
      );

      // Verificamos con el guard que no hay literales de ejemplo
      assertNoDemoLiteralsInLiveMode(container);

      const alertSalud = getByTestId("alert-salud");
      expect(alertSalud.textContent?.toLowerCase()).toContain("columna lumbar baja");
      expect(alertSalud.textContent).toContain("EVA 6");
      expect(alertSalud.textContent).toContain("Moderado");
      expect(alertSalud.textContent).toContain("Peso muerto rumano con barra");

      const textarea = getByTestId("nota-intervencion-textarea") as HTMLTextAreaElement;
      expect(textarea.value).toBe("Reducir carga al 70% y priorizar variante en bloques altos.");
      expect(container.textContent).not.toContain("Landmine Press");
      expect(container.textContent).not.toContain("28 oct: agarre neutro");
    });

    it("GIVEN un caso de dolor real sin notas_profesor WHEN se monta IslaSaludAnamnesis THEN la nota inicia vacía ('') y no contiene el ejemplo de Landmine Press", () => {
      const { container, getByTestId } = render(
        <IslaSaludAnamnesis
          isCollapsed={false}
          onToggleCollapse={vi.fn()}
          alumnoId="alumno-real-sin-nota"
          dolorActivo={{
            id: "dolor-real-902",
            alumno_id: "alumno-real-sin-nota",
            zona_articular: "Codo izquierdo",
            ejercicio_nombre: "Dominadas pronas",
            eva: 4,
            severidad: "MODERADO",
            nivel: "medio",
            estado: "PENDIENTE",
            fecha_reporte: "Hoy 11:00",
            notas_profesor: null,
          }}
        />
      );

      assertNoDemoLiteralsInLiveMode(container);

      const textarea = getByTestId("nota-intervencion-textarea") as HTMLTextAreaElement;
      expect(textarea.value).toBe("");
      expect(container.innerHTML).not.toContain("Landmine Press");
      expect(container.innerHTML).not.toContain("28 oct");
    });
  });
});
