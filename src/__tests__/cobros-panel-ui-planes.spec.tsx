import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CobrosPanel } from "@/components/coach/cobros-panel";
import { useCobrosStore } from "@/store/use-cobros-store";
import { getMananaFechaString } from "@/lib/planes";

describe("UI Coach Studio / Cobros: Botones y diálogos para crear/modificar planes (GOZS-255)", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
  });

  it("GIVEN el coach en /studio/cobros THEN renderiza botones para gestionar y crear planes", () => {
    const html = renderToStaticMarkup(<CobrosPanel />);

    // Botones en la cabecera
    expect(html).toContain('data-testid="btn-gestionar-planes"');
    expect(html).toContain("Planes y precios");
    // Objetivo Cobros.html: dos acciones en la cabecera; crear plan vive en "Planes y precios"
    expect(html).toContain('data-testid="btn-registrar-pago-cabecera"');
    expect(html).toContain("Crear Nuevo Plan");
  });

  it("GIVEN el diálogo de gestión de planes THEN incluye aviso de vigencia futura y tabla de planes", () => {
    const html = renderToStaticMarkup(<CobrosPanel />);

    expect(html).toContain('data-testid="gestion-planes-dialog"');
    expect(html).toContain('data-testid="aviso-vigencia-futura-banner"');
    expect(html).toContain("Regla de vigencia futura");
    expect(html).toContain("No alteran pagos ya cobrados ni cuotas vencidas");

    // Tabla con planes
    expect(html).toContain('data-testid="planes-table"');
    expect(html).toContain('data-testid="btn-crear-plan"');
  });

  it("GIVEN el formulario de crear/modificar plan THEN contiene aviso, selector de actividades y opciones trimestral/semestral/anual", () => {
    const html = renderToStaticMarkup(<CobrosPanel />);

    // Diálogo del formulario
    expect(html).toContain('data-testid="plan-form-dialog"');
    expect(html).toContain('data-testid="aviso-vigencia-futura"');

    // Inputs requeridos
    expect(html).toContain('data-testid="input-plan-nombre"');
    expect(html).toContain('data-testid="select-plan-actividad"');
    expect(html).toContain('value="FUNCIONAL"');
    expect(html).toContain('value="BOXEO"');
    expect(html).toContain('value="RUTINAS"');
    expect(html).toContain('value="FUNCIONAL_BOXEO"');

    // Duraciones: Mensual, Trimestral, Semestral, Anual
    expect(html).toContain('data-testid="select-plan-duracion"');
    expect(html).toContain('value="1"');
    expect(html).toContain("Mensual (1 mes)");
    expect(html).toContain('value="3"');
    expect(html).toContain("Trimestral (3 meses)");
    expect(html).toContain('value="6"');
    expect(html).toContain("Semestral (6 meses)");
    expect(html).toContain('value="12"');
    expect(html).toContain("Anual (12 meses)");

    // Límite semanal y precio
    expect(html).toContain('data-testid="select-plan-limite"');
    expect(html).toContain('data-testid="input-plan-precio"');

    // Fecha de vigencia futura con mínimo mañana
    const manana = getMananaFechaString();
    expect(html).toContain('data-testid="input-plan-fecha-vigencia"');
    expect(html).toContain(`min="${manana}"`);

    // Botones de acción
    expect(html).toContain('data-testid="btn-guardar-plan"');
    expect(html).toContain('data-testid="btn-cancelar-plan"');
  });
});
