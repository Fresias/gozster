import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, beforeEach, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CobrosPanel, type CobrosPanelProps } from "@/components/coach/cobros-panel";
import { useCobrosStore } from "@/store/use-cobros-store";
import {
  calcularKpiAnualIngresos,
  categorizarActividad,
  extraerAnioYMes,
  MESES_CALENDARIO,
  type PagoMensualInput,
} from "@/lib/kpi-anual";

describe("FE Studio/cobros: KPI ingresos de enero a diciembre y desagregado por actividad (GOZS-259)", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
  });

  describe("1. Criterios de Aceptación (Gherkin): Pagos de varios meses, apertura de KPI anual y filtro de actividad", () => {
    it("GIVEN pagos de varios meses WHEN se abre el KPI anual THEN muestra ene-dic y permite filtrar por actividad", () => {
      // GIVEN pagos de varios meses en distintas actividades
      const pagosTest: PagoMensualInput[] = [
        // Enero: Funcional
        {
          id: "pago-ene-func",
          monto: 30000,
          montoCobrado: 30000,
          fechaPago: "2026-01-15T12:00:00Z",
          actividad: "FUNCIONAL",
          servicioNombre: "Funcional 3x semana",
        },
        // Febrero: Boxeo
        {
          id: "pago-feb-box",
          monto: 35000,
          montoCobrado: 35000,
          fechaPago: "2026-02-10T12:00:00Z",
          actividad: "BOXEO",
          servicioNombre: "Boxeo recreativo",
        },
        // Marzo: Rutinas
        {
          id: "pago-mar-rut",
          monto: 20000,
          montoCobrado: 20000,
          fechaPago: "2026-03-05T12:00:00Z",
          actividad: "RUTINAS",
          servicioNombre: "Rutina online",
        },
        // Octubre: Funcional y Boxeo
        {
          id: "pago-oct-func",
          monto: 40000,
          montoCobrado: 40000,
          fechaPago: "2026-10-12T12:00:00Z",
          actividad: "FUNCIONAL",
          servicioNombre: "Funcional 3x semana",
        },
        {
          id: "pago-oct-box",
          monto: 45000,
          montoCobrado: 45000,
          fechaPago: "2026-10-18T12:00:00Z",
          actividad: "BOXEO",
          servicioNombre: "Boxeo intensivo",
        },
        // Diciembre: Rutinas
        {
          id: "pago-dic-rut",
          monto: 25000,
          montoCobrado: 25000,
          fechaPago: "2026-12-20T12:00:00Z",
          actividad: "RUTINAS",
          servicioNombre: "Rutina personalizada",
        },
      ];

      // Seteamos los pagos en el store
      useCobrosStore.setState({
        cobros: [],
        pagosHistorial: pagosTest,
      });

      // WHEN se abre el KPI anual con todas las actividades
      const htmlTodas = renderToString(
        React.createElement<CobrosPanelProps>(CobrosPanel, {
          initialKpiAnualAbierto: true,
          initialFiltroActividad: "TODAS",
        }),
      );
      const cleanTodas = htmlTodas.replace(/<!--.*?-->/g, "");

      // THEN muestra ene-dic (los 12 meses del año calendario)
      expect(cleanTodas).toContain("data-testid=\"kpi-anual-contenedor\"");
      expect(cleanTodas).toContain("data-testid=\"kpi-anual-meses\"");

      for (const m of MESES_CALENDARIO) {
        expect(cleanTodas).toContain(`data-testid="kpi-mes-${m.numero}"`);
        expect(cleanTodas).toContain(`data-testid="kpi-mes-${m.clave}"`);
      }

      // Verificamos los montos de los meses con pagos
      // Enero: 30000
      expect(cleanTodas).toContain("$30.000");
      // Febrero: 35000
      expect(cleanTodas).toContain("$35.000");
      // Marzo: 20000
      expect(cleanTodas).toContain("$20.000");
      // Octubre: 40000 + 45000 = 85000
      expect(cleanTodas).toContain("$85.000");
      // Diciembre: 25000
      expect(cleanTodas).toContain("$25.000");
      // Total anual todas: 30k + 35k + 20k + 85k + 25k = 195.000
      expect(cleanTodas).toContain("$195.000");

      // Verificamos opciones de filtro por actividad: funcional / box / rutinas
      expect(cleanTodas).toContain("data-testid=\"filtro-actividad-todas\"");
      expect(cleanTodas).toContain("data-testid=\"filtro-actividad-funcional\"");
      expect(cleanTodas).toContain("data-testid=\"filtro-actividad-boxeo\"");
      expect(cleanTodas).toContain("data-testid=\"filtro-actividad-rutinas\"");

      // FILTRAR POR FUNCIONAL
      const htmlFuncional = renderToString(
        React.createElement<CobrosPanelProps>(CobrosPanel, {
          initialKpiAnualAbierto: true,
          initialFiltroActividad: "FUNCIONAL",
        }),
      );
      const cleanFunc = htmlFuncional.replace(/<!--.*?-->/g, "");
      // Funcional: Enero (30k) + Octubre (40k) = 70.000
      expect(cleanFunc).toContain("$70.000");

      // FILTRAR POR BOXEO (box)
      const htmlBoxeo = renderToString(
        React.createElement<CobrosPanelProps>(CobrosPanel, {
          initialKpiAnualAbierto: true,
          initialFiltroActividad: "BOXEO",
        }),
      );
      const cleanBox = htmlBoxeo.replace(/<!--.*?-->/g, "");
      // Boxeo: Febrero (35k) + Octubre (45k) = 80.000
      expect(cleanBox).toContain("$80.000");

      // FILTRAR POR RUTINAS
      const htmlRutinas = renderToString(
        React.createElement<CobrosPanelProps>(CobrosPanel, {
          initialKpiAnualAbierto: true,
          initialFiltroActividad: "RUTINAS",
        }),
      );
      const cleanRut = htmlRutinas.replace(/<!--.*?-->/g, "");
      // Rutinas: Marzo (20k) + Diciembre (25k) = 45.000
      expect(cleanRut).toContain("$45.000");
    });

    it("la tarjeta de Ingresos del Mes contiene el botón/trigger para abrir el KPI anual", () => {
      const html = renderToString(React.createElement(CobrosPanel));
      expect(html).toContain("data-testid=\"btn-abrir-kpi-anual\"");
      expect(html).toContain("data-testid=\"abrir-kpi-anual\"");
      expect(html).toContain("Ver año");
    });
  });

  describe("2. Unidad: Función pura calcularKpiAnualIngresos y categorización", () => {
    it("clasifica correctamente actividades Funcional, Boxeo y Rutinas", () => {
      expect(categorizarActividad("FUNCIONAL", null)).toBe("FUNCIONAL");
      expect(categorizarActividad(null, "Clase funcional 2x")).toBe("FUNCIONAL");
      expect(categorizarActividad("BOXEO", null)).toBe("BOXEO");
      expect(categorizarActividad("BOX", null)).toBe("BOXEO");
      expect(categorizarActividad(null, "Boxeo recreativo")).toBe("BOXEO");
      expect(categorizarActividad("RUTINAS", null)).toBe("RUTINAS");
      expect(categorizarActividad("RUTINA", null)).toBe("RUTINAS");
      expect(categorizarActividad(null, "Rutina online personalizada")).toBe("RUTINAS");
      expect(categorizarActividad(null, "Asesoría online")).toBe("RUTINAS");
    });

    it("extrae año y mes de cadenas ISO con zona horaria de Argentina y fechas cortas", () => {
      const r1 = extraerAnioYMes("2026-05-15");
      expect(r1).toEqual({ anio: 2026, mes: 5 });

      const r2 = extraerAnioYMes("2026-01-01T15:00:00Z");
      expect(r2).toEqual({ anio: 2026, mes: 1 });

      const r3 = extraerAnioYMes("2026-12-31T20:00:00Z");
      expect(r3).toEqual({ anio: 2026, mes: 12 });
    });

    it("genera exactamente 12 meses de enero a diciembre con totales y desgloses correctos", () => {
      const pagos: PagoMensualInput[] = [
        { monto: 10000, fechaPago: "2026-01-10", actividad: "FUNCIONAL" },
        { monto: 15000, fechaPago: "2026-01-20", actividad: "BOXEO" },
        { monto: 5000, fechaPago: "2026-01-25", actividad: "RUTINAS" },
        { monto: 20000, fechaPago: "2026-06-15", actividad: "FUNCIONAL" },
        { monto: 50000, fechaPago: "2026-12-05", actividad: "BOXEO" },
      ];

      const res = calcularKpiAnualIngresos(pagos, 2026, "TODAS");
      expect(res.meses).toHaveLength(12);
      expect(res.totalAnual).toBe(100000);

      // Enero (mes 1)
      expect(res.meses[0]!.mesNombre).toBe("Enero");
      expect(res.meses[0]!.ingresos).toBe(30000);
      expect(res.meses[0]!.desagregado.funcional).toBe(10000);
      expect(res.meses[0]!.desagregado.boxeo).toBe(15000);
      expect(res.meses[0]!.desagregado.rutinas).toBe(5000);

      // Junio (mes 6)
      expect(res.meses[5]!.mesNombre).toBe("Junio");
      expect(res.meses[5]!.ingresos).toBe(20000);

      // Diciembre (mes 12)
      expect(res.meses[11]!.mesNombre).toBe("Diciembre");
      expect(res.meses[11]!.ingresos).toBe(50000);

      // Febrero (sin pagos)
      expect(res.meses[1]!.ingresos).toBe(0);

      // Desglose anual total
      expect(res.desagregadoAnual.funcional).toBe(30000);
      expect(res.desagregadoAnual.boxeo).toBe(65000);
      expect(res.desagregadoAnual.rutinas).toBe(5000);
    });
  });

  describe("3. Integración con useCobrosStore", () => {
    it("el store expone kpiIngresosAnual y responde reactivamente al cambio de filtro de actividad", () => {
      const store = useCobrosStore.getState();
      expect(typeof store.kpiIngresosAnual).toBe("function");
      expect(typeof store.setFiltroActividadKpiAnual).toBe("function");
      expect(typeof store.setKpiAnualAbierto).toBe("function");

      // Por defecto el dataset de demo contiene ingresos anuales calculables
      const kpiInicial = store.kpiIngresosAnual(2026);
      expect(kpiInicial.meses).toHaveLength(12);
      expect(kpiInicial.totalAnual).toBeGreaterThan(0);
      expect(kpiInicial.desagregadoAnual.funcional).toBeGreaterThan(0);
      expect(kpiInicial.desagregadoAnual.boxeo).toBeGreaterThan(0);
      expect(kpiInicial.desagregadoAnual.rutinas).toBeGreaterThan(0);

      // Al cambiar el filtro a FUNCIONAL
      store.setFiltroActividadKpiAnual("FUNCIONAL");
      const kpiFunc = store.kpiIngresosAnual(2026);
      expect(kpiFunc.totalAnual).toBe(kpiInicial.desagregadoAnual.funcional);

      // Al cambiar el filtro a BOXEO
      store.setFiltroActividadKpiAnual("BOXEO");
      const kpiBox = store.kpiIngresosAnual(2026);
      expect(kpiBox.totalAnual).toBe(kpiInicial.desagregadoAnual.boxeo);

      // Al cambiar el filtro a RUTINAS
      store.setFiltroActividadKpiAnual("RUTINAS");
      const kpiRut = store.kpiIngresosAnual(2026);
      expect(kpiRut.totalAnual).toBe(kpiInicial.desagregadoAnual.rutinas);
    });

    it("al registrar un pago nuevo en el store se refleja en los ingresos anuales", async () => {
      const store = useCobrosStore.getState();
      const kpiAntes = store.kpiIngresosAnual(2026, "TODAS");

      const pendiente = store.cobros.find((c) => c.estado === "PENDIENTE");
      expect(pendiente).toBeDefined();

      await store.registrarPago({
        contratacionId: pendiente!.contratacionId,
        monto: pendiente!.monto,
        medioPago: "TRANSFERENCIA",
        notas: "Pago anual reflejado",
      });

      const kpiDespues = useCobrosStore.getState().kpiIngresosAnual(2026, "TODAS");
      expect(kpiDespues.totalAnual).toBe(kpiAntes.totalAnual + pendiente!.monto);
    });
  });
});
