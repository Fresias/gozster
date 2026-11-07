import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CobrosPanel } from "@/components/coach/cobros-panel";
import { useCobrosStore } from "@/store/use-cobros-store";

describe("GOZS-398: Coach Studio - Sheet Lateral de Registro de Pago y Actualización Reactiva", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
  });

  describe("Criterio Gherkin 1: Despliegue de Sheet lateral accesible al registrar pago", () => {
    it("GIVEN un contrato en estado Vencido WHEN se abre el Sheet de pago THEN se despliega el Sheet lateral con orientación right y foco en el formulario", () => {
      const store = useCobrosStore.getState();
      const contratoVencido = store.cobros.find((c) => c.estado === "VENCIDO");
      expect(contratoVencido).toBeDefined();

      const html = renderToStaticMarkup(
        <CobrosPanel initialSheetPagoOpen={true} initialCobroSeleccionado={contratoVencido} />,
      );

      // 1. Contenedor del Sheet accesible (<dialog> nativo con role="dialog" y orientación lateral)
      expect(html).toContain("<dialog");
      expect(html).toContain('role="dialog"');
      expect(html).toContain('data-testid="registrar-pago-dialog"');
      expect(html).toContain("slide-in-from-right");

      // 2. Título y encabezado accesible
      expect(html).toContain("Registrar Pago de Cuota");
      expect(html).toContain('id="registrar-pago-titulo"');

      // 3. Ficha resumen del alumno y contrato
      expect(html).toContain('data-testid="pago-alumno-resumen"');
      expect(html).toContain(contratoVencido!.alumnoNombre);
      expect(html).toContain(contratoVencido!.servicioNombre);

      // 4. Input de monto con foco inicial accesible
      expect(html).toContain('data-testid="input-pago-monto"');
      expect(html).toContain('value="25000"');

      // 5. Input de fecha de cobro y métodos de pago
      expect(html).toContain('data-testid="input-pago-fecha"');
      expect(html).toContain('data-testid="medio-transferencia-btn"');
      expect(html).toContain('data-testid="medio-efectivo-btn"');
      expect(html).toContain('data-testid="input-pago-notas"');
      expect(html).toContain('data-testid="confirmar-pago-submit-btn"');
    });
  });

  describe("Criterio Gherkin 2: Validación estricta de monto <= 0 y método de pago", () => {
    it("GIVEN el formulario de pago WHEN el monto es <= 0 THEN bloquea el envío y muestra mensaje de validación accesible", () => {
      const store = useCobrosStore.getState();
      const contratoVencido = store.cobros.find((c) => c.estado === "VENCIDO")!;

      const contratoConMontoCero = { ...contratoVencido, monto: 0 };
      const html = renderToStaticMarkup(
        <CobrosPanel initialSheetPagoOpen={true} initialCobroSeleccionado={contratoConMontoCero} />,
      );

      // 1. Mensaje de error accesible con role="alert" y aria-live
      expect(html).toContain('data-testid="error-pago-monto"');
      expect(html).toContain('role="alert"');
      expect(html).toContain("El monto debe ser mayor a 0");

      // 2. Input con aria-invalid y aria-describedby
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('aria-describedby="error-pago-monto"');

      // 3. Botón de envío deshabilitado
      expect(html).toContain('data-testid="confirmar-pago-submit-btn"');
      const submitBtnDisabled = html.includes('data-testid="confirmar-pago-submit-btn"') && html.includes("disabled");
      expect(submitBtnDisabled).toBe(true);
    });

    it("GIVEN el formulario de pago WHEN se valida la obligatoriedad de método de pago y fecha THEN expone mensajes accesibles", () => {
      const store = useCobrosStore.getState();
      const contratoVencido = store.cobros.find((c) => c.estado === "VENCIDO")!;

      const html = renderToStaticMarkup(
        <CobrosPanel initialSheetPagoOpen={true} initialCobroSeleccionado={contratoVencido} />,
      );

      // Radiogroup semántico accesible para medios de pago
      expect(html).toContain('role="radiogroup"');
      expect(html).toContain('data-testid="medio-transferencia-btn"');
      expect(html).toContain('data-testid="medio-efectivo-btn"');
      expect(html).toContain('data-testid="input-pago-fecha"');
    });
  });

  describe("Criterio Gherkin 3: Mutación reactiva, transición a 'Pagado' e incremento de KPIs", () => {
    it("GIVEN un pago registrado con éxito THEN el contrato pasa a 'Pagado' y los KPIs superiores incrementan el monto Cobrado de inmediato", async () => {
      const store = useCobrosStore.getState();
      const metricasAntes = store.metricas();

      // Buscamos a Tomás Ledesma (vencido por $25.000)
      const tomas = store.cobros.find((c) => c.alumnoNombre === "Tomás Ledesma");
      expect(tomas).toBeDefined();
      expect(tomas!.estado).toBe("VENCIDO");
      expect(tomas!.monto).toBe(25000);

      // 1. Registro exitoso de pago
      const comprobante = await store.registrarPago({
        contratacionId: tomas!.contratacionId,
        monto: 25000,
        medioPago: "TRANSFERENCIA",
        fechaPago: "2026-11-06",
        notas: "Pago mensual adelantado",
      });

      expect(comprobante).toBeDefined();
      expect(comprobante.reciboNumero).toContain("REC-");
      expect(comprobante.alumnoNombre).toBe("Tomás Ledesma");
      expect(comprobante.monto).toBe(25000);

      // 2. El contrato pasó a PAGADO
      const tomasActualizado = useCobrosStore.getState().cobros.find((c) => c.contratacionId === tomas!.contratacionId);
      expect(tomasActualizado?.estado).toBe("PAGADO");

      // 3. KPIs superiores recalculados de inmediato
      const metricasDespues = useCobrosStore.getState().metricas();
      expect(metricasDespues.ingresosMes).toBe(metricasAntes.ingresosMes + 25000);
      expect(metricasDespues.cobranzaVencida).toBe(metricasAntes.cobranzaVencida - 25000);
      expect(metricasDespues.alumnosAlDia).toBe(metricasAntes.alumnosAlDia + 1);
      expect(metricasDespues.alumnosMorosos).toBe(metricasAntes.alumnosMorosos - 1);

      // 4. Renderizado reactivo en CobrosPanel
      const html = renderToStaticMarkup(<CobrosPanel />);
      expect(html).toContain(`$${metricasDespues.ingresosMes.toLocaleString("es-AR")}`);
      expect(html).toContain(`$${metricasDespues.cobranzaVencida.toLocaleString("es-AR")}`);
      expect(html).toContain(`${metricasDespues.alumnosAlDia} alumnos al día`);
    });
  });

  describe("Criterio Gherkin 4: Acción 'Ver comprobante' en el menú ⋯ para contratos pagados", () => {
    it("GIVEN un contrato en estado Pagado THEN el menú ⋯ incluye la opción 'Ver comprobante'", () => {
      const html = renderToStaticMarkup(<CobrosPanel initialRowMenuOpen={true} />);

      // En el menú desplegable existe la acción contextual 'Ver comprobante'
      expect(html).toContain('data-testid="menu-item-ver-comprobante"');
      expect(html).toContain("Ver comprobante");

      // En la fila principal, el contrato pagado exhibe el botón 'Ver recibo'
      expect(html).toContain('data-testid="ver-recibo-btn"');
    });
  });

  describe("Criterio Gherkin 5: Retorno de foco y contención accesible en filas", () => {
    it("GIVEN cada fila de contrato THEN contiene identificador y target accesible para retorno de foco tras cerrar el Sheet", () => {
      const html = renderToStaticMarkup(<CobrosPanel />);

      // Atributos data-contratacion-id y tabIndex para anclar el foco
      expect(html).toContain("data-contratacion-id=");
      expect(html).toContain('id="cobro-row-');
      expect(html).toContain('tabindex="-1"');
    });
  });
});
