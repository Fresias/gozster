import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  calcularPeriodoMesEnCurso,
  mapearRpcAKpis,
  type RpcKpiRow,
} from "@/lib/kpis-negocio";
import { BusinessKpiStrip } from "@/components/coach/business-kpi-strip";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";

describe("GOZS-137: Conectar la franja de KPIs a datos reales (promoción)", () => {
  describe("1. Período: del día 1 del mes en curso a hoy en hora de Argentina", () => {
    it("calcula día 1 a hoy y label del mes anterior completo", () => {
      // 23 de octubre de 2026 a las 15:00 UTC (12:00 en Argentina)
      const fecha = new Date("2026-10-23T15:00:00Z");
      const periodo = calcularPeriodoMesEnCurso(fecha);

      expect(periodo.p_desde).toBe("2026-10-01");
      expect(periodo.p_hasta).toBe("2026-10-23");
      expect(periodo.mesAnteriorLabel).toMatch(/sep/i);
    });

    it("maneja correctamente la hora peligrosa (02:30 UTC = 23:30 del día previo en Argentina)", () => {
      // 23/10 a las 02:30 UTC es 22/10 a las 23:30 en Argentina
      const fechaPeligrosa = new Date("2026-10-23T02:30:00Z");
      const periodo = calcularPeriodoMesEnCurso(fechaPeligrosa);

      expect(periodo.p_desde).toBe("2026-10-01");
      expect(periodo.p_hasta).toBe("2026-10-22");
    });

    it("maneja cruce de año en enero (el mes anterior es diciembre)", () => {
      const primeroEnero = new Date("2026-01-05T12:00:00Z");
      const periodo = calcularPeriodoMesEnCurso(primeroEnero);

      expect(periodo.p_desde).toBe("2026-01-01");
      expect(periodo.p_hasta).toBe("2026-01-05");
      expect(periodo.mesAnteriorLabel).toMatch(/dic/i);
    });
  });

  describe("2. Fórmulas de variación y cobranza según especificación", () => {
    const mockRow: RpcKpiRow = {
      ingresos: 20000,
      ingresos_6m: [0, 0, 0, 0, 7000, 20000],
      ingresos_periodo_anterior: 7000,
      cobranza_esperada: 40000,
      cobranza_pendiente_monto: 20000,
      cobranza_vencidas_cant: 1,
      sin_entrenar_7d_ids: ["uuid-1", "uuid-2"],
      activos_fin: 3,
      altas: 1,
      bajas: 1,
    };

    it("variación de ingresos: (ingresos - anterior) / anterior", () => {
      const kpis = mapearRpcAKpis(mockRow, "sept.");
      // (20000 - 7000) / 7000 = 1.8571 -> 186%
      expect(kpis.ingresos_variacion_pct).toBe(186);
      expect(kpis.ingresos_mes).toBe(20000);
      expect(kpis.ingresos_ultimos_6_meses).toEqual([0, 0, 0, 0, 7000, 20000]);
    });

    it("si anterior = 0, variación de ingresos devuelve null (para mostrar '—')", () => {
      const rowSinAnterior = { ...mockRow, ingresos_periodo_anterior: 0 };
      const kpis = mapearRpcAKpis(rowSinAnterior, "sept.");
      expect(kpis.ingresos_variacion_pct).toBeNull();
    });

    it("cobranza: (esperada - pendiente) / esperada", () => {
      const kpis = mapearRpcAKpis(mockRow, "sept.");
      // (40000 - 20000) / 40000 = 50%
      expect(kpis.cobranza_pct).toBe(50);
      expect(kpis.cobranza_faltante).toBe(20000);
      expect(kpis.cobranza_vencidas).toBe(1);
    });

    it("si esperada = 0, cobranza devuelve null (para mostrar '—')", () => {
      const rowSinEsperada = { ...mockRow, cobranza_esperada: 0, cobranza_pendiente_monto: 0 };
      const kpis = mapearRpcAKpis(rowSinEsperada, "sept.");
      expect(kpis.cobranza_pct).toBeNull();
    });

    it("mapea alumnos activos, altas, bajas y sin entrenar correctamente", () => {
      const kpis = mapearRpcAKpis(mockRow, "sept.");
      expect(kpis.alumnos_activos).toBe(3);
      expect(kpis.altas_mes).toBe(1);
      expect(kpis.bajas_mes).toBe(1);
      expect(kpis.sin_entrenar_7d_ids).toEqual(["uuid-1", "uuid-2"]);
    });
  });

  describe("3. Criterios de aceptación del componente visual", () => {
    it("GIVEN kpis mapeados desde la RPC THEN los números coinciden", () => {
      const kpisReales = mapearRpcAKpis(
        {
          ingresos: 20000,
          ingresos_6m: [0, 0, 0, 0, 7000, 20000],
          ingresos_periodo_anterior: 7000,
          cobranza_esperada: 40000,
          cobranza_pendiente_monto: 20000,
          cobranza_vencidas_cant: 1,
          sin_entrenar_7d_ids: ["uuid-1"],
          activos_fin: 3,
          altas: 1,
          bajas: 1,
        },
        "sept.",
      );

      const html = renderToString(
        React.createElement(BusinessKpiStrip, {
          kpis: kpisReales,
          sinEntrenarNombres: ["Alumno Uno"],
          sinRutina: 2,
        }),
      );

      const clean = html.replace(/<!--.*?-->/g, "");
      // Ingresos: $20.000 y variación +186% vs sept.
      expect(clean).toContain("$20.000");
      expect(clean).toContain("186% vs sept.");
      // GOZS-238: Borrar KPI cobranza; ingresos muestra desagregado y 'a cobrar'
      expect(clean).not.toContain("data-testid=\"kpi-cobranza\"");
      expect(clean).not.toContain("Cobranza del mes");
      expect(clean).toContain("presencial");
      expect(clean).toContain("online");
      expect(clean).toContain("por cobrar");
      expect(clean).toContain("$20.000");
      // Sin entrenar: 1 y avatar con iniciales AU
      expect(clean).toContain("AU");
      // Activos: 3, +1 altas · −1 baja este mes, 2 sin rutina
      expect(clean).toContain("3");
      expect(clean).toContain("+1 altas, −1 baja este mes");
      expect(clean).toContain("2 sin rutina");
    });

    it("GIVEN anterior = 0 THEN muestra '—' en variación", () => {
      const kpis = mapearRpcAKpis(
        {
          ingresos: 15000,
          ingresos_6m: [0, 0, 0, 0, 0, 15000],
          ingresos_periodo_anterior: 0,
          cobranza_esperada: 15000,
          cobranza_pendiente_monto: 0,
          cobranza_vencidas_cant: 0,
          sin_entrenar_7d_ids: [],
          activos_fin: 5,
          altas: 2,
          bajas: 0,
        },
        "sept.",
      );

      const html = renderToString(
        React.createElement(BusinessKpiStrip, { kpis }),
      );

      expect(html).toContain("$15.000");
      // Chip de variación muestra "—"
      expect(html).toMatch(/<span[^>]*bg-foreground\/\[0\.06\][^>]*>—<\/span>/);
    });

    it("GIVEN esperada = 0 THEN el KPI de cobranza no existe (GOZS-238)", () => {
      const kpis = mapearRpcAKpis(
        {
          ingresos: 0,
          ingresos_6m: [0, 0, 0, 0, 0, 0],
          ingresos_periodo_anterior: 0,
          cobranza_esperada: 0,
          cobranza_pendiente_monto: 0,
          cobranza_vencidas_cant: 0,
          sin_entrenar_7d_ids: [],
          activos_fin: 0,
          altas: 0,
          bajas: 0,
        },
        "sept.",
      );

      const html = renderToString(
        React.createElement(BusinessKpiStrip, { kpis }),
      );

      expect(html).not.toContain("data-testid=\"kpi-cobranza\"");
      expect(html).not.toContain("Cobranza del mes");
    });

    it("con kpis demo muestra los valores sin KPI cobranza", () => {
      const html = renderToString(
        React.createElement(BusinessKpiStrip, {
          kpis: DEMO_KPIS_NEGOCIO,
          sinEntrenarNombres: ["Alumno Demo"],
        }),
      );

      expect(html).toContain("data-testid=\"business-kpi-strip\"");
      expect(html).toContain("data-testid=\"kpi-ingresos\"");
      expect(html).not.toContain("data-testid=\"kpi-cobranza\"");
    });
  });
});
