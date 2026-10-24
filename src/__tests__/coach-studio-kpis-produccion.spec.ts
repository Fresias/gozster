import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, beforeEach } from "vitest";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { CoachStudioView } from "@/components/coach/coach-studio-view";

const vacio = { alumnos: [], planes: [], dias: [], ejerciciosEnRutina: [], ejercicios: [] };
const render = (esAdmin: boolean) =>
  renderToString(React.createElement(() => CoachStudioView({ initialDataset: vacio, esAdmin })));

describe("GOZS-137: CoachStudioView muestra la franja de KPIs reales en Producción", () => {
  beforeEach(() => {
    useWorkspaceModeStore.getState().setMode("PRODUCCION");
  });

  it("ADMIN en Producción ve la franja cargando datos reales (skeleton de la RPC), no RetentionKpiCards", () => {
    const html = render(true);
    expect(html).toContain('data-testid="business-kpi-strip"');
    expect(html).toContain('data-testid="kpi-skeleton-ingresos"');
    expect(html).not.toContain('data-testid="retention-executive-banner"');
  });

  it("ENTRENADOR en Producción sigue viendo RetentionKpiCards (la RPC es solo para ADMIN)", () => {
    const html = render(false);
    expect(html).toContain('data-testid="retention-executive-banner"');
    expect(html).not.toContain('data-testid="business-kpi-strip"');
  });
});
