import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getDemoCriticalAlerts } from "@/components/coach/critical-alerts-data";
import { applyDemoEstados, useDemoAlertEstados } from "@/components/coach/critical-alerts-store";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf-8");

describe("GOZS-133: bandeja de alertas de una línea (Modo Testeo)", () => {
  const inbox = read("../components/coach/critical-alerts-inbox.tsx");
  const pain = read("../components/coach/student-pain-alerts.tsx");

  beforeEach(() => useDemoAlertEstados.setState({ estados: {} }));

  it("filtro efectivo derivado en el render: PENDIENTE en Testeo sin pisar la pestaña", () => {
    expect(inbox).toContain('const statusFilter = isTesteo ? "PENDIENTE" : selectedFilter;');
  });

  it("fila de una línea con la clase del spec y click a onSelectAlumno", () => {
    expect(inbox).toContain("w-full min-h-12 px-4 py-2 flex items-center gap-3 text-left hover:bg-muted/40");
    expect(inbox).toContain("onSelectAlumno?.(alert.alumnoId)");
    expect(inbox).toContain("Síntoma de alarma");
    expect(inbox).toContain("Dolor moderado");
    expect(inbox).toContain("h-2.5 w-2.5");
  });

  it("Producción conserva pestañas y tarjetas completas", () => {
    expect(inbox).toContain("{isExpanded && !isTesteo && (");
    for (const t of ["filter-tab-pendientes", "red-flag-badge", "quick-swap-btn-", "view-student-btn-"]) {
      expect(inbox).toContain(t);
    }
  });

  it("bandeja y ficha comparten el store: Atendido en la ficha saca la alerta de pendientes", () => {
    expect(inbox).toContain("useDemoAlertEstados");
    expect(pain).toContain("setEstado(alertId, nuevoEstado)");
    const demo = getDemoCriticalAlerts();
    const target = demo[0]!;
    useDemoAlertEstados.getState().setEstado(target.id, "ATENDIDO");
    const view = applyDemoEstados(demo, useDemoAlertEstados.getState().estados);
    const pendientes = view.filter((a) => (a.estado || "PENDIENTE") === "PENDIENTE");
    expect(pendientes.find((a) => a.id === target.id)).toBeUndefined();
    expect(pendientes.length).toBe(demo.length - 1);
  });
});
