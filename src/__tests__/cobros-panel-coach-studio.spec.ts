import { beforeEach, describe, expect, it } from "vitest";
import { useCobrosStore } from "@/store/use-cobros-store";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { computeAnchoredRenewalDate } from "@/lib/contrataciones";

describe("Panel de Cobros en Coach Studio (GOZS-184 / GH #181)", () => {
  beforeEach(() => {
    useWorkspaceModeStore.getState().setMode("TESTEO");
    useCobrosStore.getState().resetDemoDataset();
  });

  describe("Cálculo de métricas del mes e inicialización", () => {
    it("GIVEN el panel de cobros WHEN se cargan los datos THEN calcula ingresos del mes, pendientes, vencidos y morosos", () => {
      const store = useCobrosStore.getState();
      expect(store.cobros.length).toBeGreaterThan(0);

      const metricas = store.metricas();
      expect(metricas.totalCobros).toBe(store.cobros.length);
      expect(metricas.ingresosMes).toBeGreaterThan(0);
      expect(metricas.cobranzaPendiente).toBeGreaterThanOrEqual(0);
      expect(metricas.cobranzaVencida).toBeGreaterThanOrEqual(0);
      expect(metricas.alumnosMorosos).toBeGreaterThan(0);
      expect(metricas.tasaCobranzaPct).toBeGreaterThanOrEqual(0);
      expect(metricas.tasaCobranzaPct).toBeLessThanOrEqual(100);
    });

    it("identifica alumnos morosos con cobros vencidos", () => {
      const store = useCobrosStore.getState();
      const vencidos = store.cobros.filter((c) => c.estado === "VENCIDO");
      expect(vencidos.length).toBeGreaterThan(0);

      // Tomás Ledesma debe figurar entre los vencidos
      const tomas = vencidos.find((c) => c.alumnoId === "demo-alumno-tomas");
      expect(tomas).toBeDefined();
      expect(tomas?.estado).toBe("VENCIDO");
    });
  });

  describe("Registro manual de pagos (Transferencia y Efectivo) con anclaje de fecha", () => {
    it("GIVEN un alumno moroso (Tomás) WHEN el coach registra pago por Transferencia THEN el cobro pasa a PAGADO, fecha se ancla al día original y suben los ingresos del mes", async () => {
      const store = useCobrosStore.getState();
      const metricasAntes = store.metricas();

      const cobroTomas = store.cobros.find((c) => c.alumnoId === "demo-alumno-tomas");
      expect(cobroTomas).toBeDefined();
      expect(cobroTomas!.estado).toBe("VENCIDO");

      const fechaVencimientoAnterior = cobroTomas!.fechaVencimiento;
      const diaVencimientoOriginal = cobroTomas!.diaVencimiento;

      // Registrar pago por transferencia
      const comprobante = await store.registrarPago({
        contratacionId: cobroTomas!.contratacionId,
        monto: cobroTomas!.monto,
        medioPago: "TRANSFERENCIA",
        notas: "Transferencia recibida por WhatsApp",
      });

      expect(comprobante).toBeDefined();
      expect(comprobante.reciboNumero).toContain("REC-");
      expect(comprobante.alumnoNombre).toBe(cobroTomas!.alumnoNombre);
      expect(comprobante.medioPago).toBe("TRANSFERENCIA");
      expect(comprobante.monto).toBe(cobroTomas!.monto);

      // Verificar que el estado del cobro pasó a PAGADO
      const cobroActualizado = useCobrosStore
        .getState()
        .cobros.find((c) => c.contratacionId === cobroTomas!.contratacionId);
      expect(cobroActualizado?.estado).toBe("PAGADO");
      expect(cobroActualizado?.ultimoPago?.medioPago).toBe("TRANSFERENCIA");

      // Regla de anclaje de fecha ADR-001: el vencimiento nuevo mantiene el día de corte original
      const fechaEsperada = computeAnchoredRenewalDate(fechaVencimientoAnterior, diaVencimientoOriginal);
      expect(cobroActualizado?.fechaVencimiento).toBe(fechaEsperada);

      // Verificar que los ingresos del mes se incrementaron en el monto cobrado
      const metricasDespues = useCobrosStore.getState().metricas();
      expect(metricasDespues.ingresosMes).toBe(metricasAntes.ingresosMes + cobroTomas!.monto);
      expect(metricasDespues.alumnosMorosos).toBe(metricasAntes.alumnosMorosos - 1);
    });

    it("GIVEN un cobro pendiente WHEN el coach registra pago en Efectivo THEN emite comprobante interno y marca pagado", async () => {
      const store = useCobrosStore.getState();
      const pendiente = store.cobros.find((c) => c.estado === "PENDIENTE");
      expect(pendiente).toBeDefined();

      const comprobante = await store.registrarPago({
        contratacionId: pendiente!.contratacionId,
        monto: pendiente!.monto,
        medioPago: "EFECTIVO",
        notas: "Pago en mostrador del gimnasio",
      });

      expect(comprobante.medioPago).toBe("EFECTIVO");
      expect(comprobante.confirmadoPor).toBe("Lucía Ferraro");
      expect(useCobrosStore.getState().comprobanteActivo).toEqual(comprobante);

      // Comprobante consultable a posteriori
      const recuperado = store.obtenerComprobante(pendiente!.contratacionId);
      expect(recuperado?.reciboNumero).toBe(comprobante.reciboNumero);
      expect(recuperado?.medioPago).toBe("EFECTIVO");
    });

    it("la regla de anclaje respeta el día de vencimiento original (vence 10/10, paga 27/10 -> vence 10/11)", () => {
      const nuevaFecha = computeAnchoredRenewalDate("2026-10-10", 10);
      expect(nuevaFecha).toBe("2026-11-10");
    });
  });

  describe("Filtros y Búsqueda en el Panel de Cobros", () => {
    it("permite filtrar cobros por PENDIENTES, VENCIDOS y PAGADOS", () => {
      const store = useCobrosStore.getState();

      store.setFiltroEstado("PENDIENTES");
      expect(useCobrosStore.getState().filtroEstado).toBe("PENDIENTES");

      store.setFiltroEstado("VENCIDOS");
      expect(useCobrosStore.getState().filtroEstado).toBe("VENCIDOS");

      store.setFiltroEstado("PAGADOS");
      expect(useCobrosStore.getState().filtroEstado).toBe("PAGADOS");

      store.setFiltroEstado("TODOS");
      expect(useCobrosStore.getState().filtroEstado).toBe("TODOS");
    });

    it("permite buscar alumnos por nombre reactivamente", () => {
      const store = useCobrosStore.getState();
      store.setBusqueda("Valentina");
      expect(useCobrosStore.getState().busqueda).toBe("Valentina");
    });
  });
});
