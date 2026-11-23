import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach } from "vitest";
import { BusinessKpiStrip } from "@/components/coach/business-kpi-strip";
import { mapearRpcAKpis } from "@/lib/kpis-negocio";
import { mapearCobrosDataset, useCobrosStore } from "@/store/use-cobros-store";
import type { Cobro } from "@/types/database.types";

// GOZS-694: "alumno al día" sale de una sola fuente (v_estado_alumno, derivada de
// contrataciones y cobros). El KPI recibe el conteo que calcula la misma tabla
// y Cobros marca vencido con el mismo criterio que la vista.

const kpisRpc = mapearRpcAKpis({ activos_fin: 0, alumnos_al_dia: 0, ingresos: 0 }, "oct.", "ADMIN");

function valorKpi(html: string): string {
  const m = html.match(/data-testid="kpi-alumnos-al-dia"[^>]*>([^<]*)</);
  return m?.[1] ?? "";
}

describe("GOZS-694: fuente única para alumno al día", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
  });

  it("GIVEN alumnosAlDia de la tabla WHEN se renderiza el KPI THEN muestra ese conteo y no el del RPC", () => {
    const html = renderToStaticMarkup(
      <BusinessKpiStrip kpis={kpisRpc} totalAlumnos={2} alumnosAlDia={2} puedeVer rol="ADMIN" />,
    );
    expect(valorKpi(html)).toBe("2 de 2");
  });

  it("GIVEN sin alumnosAlDia (modo demo) WHEN se renderiza el KPI THEN conserva el valor previo", () => {
    const html = renderToStaticMarkup(
      <BusinessKpiStrip kpis={kpisRpc} totalAlumnos={2} puedeVer rol="ADMIN" />,
    );
    expect(valorKpi(html)).toBe("0 de 2");
  });

  it("GIVEN cobros impagos con vencimiento pasado WHEN se mapean para Cobros THEN quedan VENCIDO como en v_estado_alumno", () => {
    const base = { contratacion_id: "c1", alumno_id: "a1", monto: 1000, concepto: null, notas: null };
    const cobros = [
      { ...base, id: "pend-pasado", estado: "PENDIENTE", fecha_vencimiento: "2000-01-10" },
      { ...base, id: "pend-futuro", estado: "PENDIENTE", fecha_vencimiento: "2999-01-10" },
      { ...base, id: "pagado-pasado", estado: "PAGADO", fecha_vencimiento: "2000-01-10" },
    ] as unknown as Cobro[];
    const { cobros: items } = mapearCobrosDataset({
      cobros,
      contrataciones: [],
      planesMembresia: [],
      pagos: [],
    } as unknown as Parameters<typeof mapearCobrosDataset>[0]);
    const estado = Object.fromEntries(items.map((i) => [i.id, i.estado]));
    expect(estado).toEqual({
      "pend-pasado": "VENCIDO",
      "pend-futuro": "PENDIENTE",
      "pagado-pasado": "PAGADO",
    });
  });
});
