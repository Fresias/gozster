import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, beforeEach } from "vitest";
import { BusinessKpiStrip } from "@/components/coach/business-kpi-strip";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";

describe("GOZS-238: FE Studio - KPI ingresos del mes desagregado y subtítulo 'a cobrar'; borrar KPI cobranza", () => {
  beforeEach(() => {
    useWorkspaceModeStore.getState().setMode("TESTEO");
    useCobrosStore.getState().resetDemoDataset();
  });

  describe("Criterios de Aceptación (Gherkin)", () => {
    it("GIVEN el dashboard /studio con cuotas pagas y vencidas WHEN se carga THEN el KPI muestra ingreso cobrado desagregado presencial/online, el subtítulo suma las cuotas en rojo y el KPI de cobranza no existe", () => {
      // Configuramos cuotas pagas (presencial y online) y cuotas vencidas (en rojo)
      useCobrosStore.setState({
        cobros: [
          {
            id: "cobro-pago-funcional",
            alumnoId: "alu-1",
            alumnoNombre: "Atleta Funcional",
            alumnoEmail: "f@test.ar",
            alumnoTelefono: null,
            contratacionId: "cont-1",
            servicioNombre: "Funcional 2x semana",
            actividad: "FUNCIONAL",
            monto: 25000,
            diaVencimiento: 10,
            fechaVencimiento: "2026-10-30",
            estado: "PAGADO",
            ultimoPago: {
              id: "pago-1",
              monto: 25000,
              medioPago: "TRANSFERENCIA",
              fechaPago: "2026-10-15T10:00:00Z",
              confirmadoPor: "Coach",
            },
          },
          {
            id: "cobro-pago-boxeo",
            alumnoId: "alu-2",
            alumnoNombre: "Atleta Boxeo",
            alumnoEmail: "b@test.ar",
            alumnoTelefono: null,
            contratacionId: "cont-2",
            servicioNombre: "Boxeo recreativo",
            actividad: "BOXEO",
            monto: 30000,
            diaVencimiento: 12,
            fechaVencimiento: "2026-10-30",
            estado: "PAGADO",
            ultimoPago: {
              id: "pago-2",
              monto: 30000,
              medioPago: "EFECTIVO",
              fechaPago: "2026-10-12T10:00:00Z",
              confirmadoPor: "Coach",
            },
          },
          {
            id: "cobro-pago-rutina-online",
            alumnoId: "alu-3",
            alumnoNombre: "Atleta Rutina Online",
            alumnoEmail: "r@test.ar",
            alumnoTelefono: null,
            contratacionId: "cont-3",
            servicioNombre: "Rutina online personalizada",
            actividad: null,
            monto: 18000,
            diaVencimiento: 5,
            fechaVencimiento: "2026-10-30",
            estado: "PAGADO",
            ultimoPago: {
              id: "pago-3",
              monto: 18000,
              medioPago: "TRANSFERENCIA",
              fechaPago: "2026-10-05T10:00:00Z",
              confirmadoPor: "Coach",
            },
          },
          {
            id: "cobro-vencido-1",
            alumnoId: "alu-4",
            alumnoNombre: "Atleta En Rojo 1",
            alumnoEmail: "v1@test.ar",
            alumnoTelefono: null,
            contratacionId: "cont-4",
            servicioNombre: "Funcional 3x semana",
            actividad: "FUNCIONAL",
            monto: 28000,
            diaVencimiento: 1,
            fechaVencimiento: "2026-10-01",
            estado: "VENCIDO",
          },
          {
            id: "cobro-vencido-2",
            alumnoId: "alu-5",
            alumnoNombre: "Atleta En Rojo 2",
            alumnoEmail: "v2@test.ar",
            alumnoTelefono: null,
            contratacionId: "cont-5",
            servicioNombre: "Rutina online",
            actividad: null,
            monto: 20000,
            diaVencimiento: 10,
            fechaVencimiento: "2026-10-10",
            estado: "VENCIDO",
          },
        ],
      });

      const totalCobrado = 25000 + 30000 + 18000; // 73000
      const presencialCobrado = 25000 + 30000; // 55000 (funcional + boxeo)
      const onlineCobrado = 18000; // 18000 (rutinas)
      const cuotasEnRojo = 28000 + 20000; // 48000 (suma de cuotas vencidas)

      const kpis = {
        ...DEMO_KPIS_NEGOCIO,
        ingresos_mes: totalCobrado,
        ingresos_presencial: presencialCobrado,
        ingresos_online: onlineCobrado,
        a_cobrar: cuotasEnRojo,
      };

      const html = renderToString(
        React.createElement(BusinessKpiStrip, { kpis, isTestMode: true }),
      );
      const clean = html.replace(/<!--.*?-->/g, "");

      // 1. Ingreso cobrado total
      expect(clean).toContain("$73.000");

      // 2. Desagregado presencial / online
      expect(clean).toContain("data-testid=\"kpi-ingresos-desagregado\"");
      expect(clean).toContain("$55.000 presencial");
      expect(clean).toContain("(funcional + boxeo)");
      expect(clean).toContain("$18.000 online");
      expect(clean).toContain("(rutinas)");

      // 3. Subtítulo suma las cuotas en rojo
      expect(clean).toContain("data-testid=\"kpi-ingresos-a-cobrar\"");
      expect(clean).toContain("A cobrar:");
      expect(clean).toContain("$48.000");
      expect(clean).toContain("cuotas en rojo");

      // 4. El KPI de cobranza no existe
      expect(clean).not.toContain("data-testid=\"kpi-cobranza\"");
      expect(clean).not.toContain("Cobranza del mes");
      expect(clean).not.toContain("kpi-skeleton-cobranza");
    });
  });

  describe("Derivación desde useCobrosStore en Modo Testeo", () => {
    it("deriva presencial, online y cuotas en rojo directamente del store de cobros", () => {
      const metricas = useCobrosStore.getState().metricas();
      expect(metricas.ingresosMes).toBeGreaterThan(0);
      expect(metricas.cobranzaVencida).toBeGreaterThan(0);

      const html = renderToString(
        React.createElement(BusinessKpiStrip, { isTestMode: true }),
      );
      const clean = html.replace(/<!--.*?-->/g, "");

      // KPI de ingresos presente con desagregado y a cobrar
      expect(clean).toContain("data-testid=\"kpi-ingresos\"");
      expect(clean).toContain("data-testid=\"kpi-ingresos-desagregado\"");
      expect(clean).toContain("data-testid=\"kpi-ingresos-a-cobrar\"");
      expect(clean).toContain("presencial");
      expect(clean).toContain("online");
      expect(clean).toContain("A cobrar:");

      // KPI cobranza no existe
      expect(clean).not.toContain("data-testid=\"kpi-cobranza\"");
      expect(clean).not.toContain("kpi-skeleton-cobranza");
      expect(clean).not.toContain("Cobranza del mes");
    });
  });
});
