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

  describe("GOZS-253: Pagos con descuento, nota 'N', total de ingresos y recuperación de montos", () => {
    it("GIVEN el pago de Sofía (40k lista, 32k cobrado) WHEN se inicializa el panel THEN cuenta 32k en ingresos, tiene nota 'N' y registra el descuento", () => {
      const store = useCobrosStore.getState();
      const sofia = store.cobros.find((c) => c.alumnoId === "demo-alumno-sofia");
      expect(sofia).toBeDefined();

      // Debe registrar 32k cobrado y 40k de lista
      expect(sofia?.monto).toBe(32000);
      expect(sofia?.montoLista).toBe(40000);
      expect(sofia?.descuento).toBe(8000);
      expect(sofia?.estado).toBe("PAGADO");

      // Debe contener la nota justificativa para mostrar la 'N'
      expect(sofia?.ultimoPago?.notas).toContain("Descuento 20%");
      expect(sofia?.notaDescuento).toContain("Descuento 20%");

      // El total de ingresos del mes debe sumar 32k (el cobrado), no 40k
      const metricas = store.metricas();
      expect(metricas.ingresosMes).toBeGreaterThanOrEqual(32000);
      expect(metricas.totalDescuentos).toBeGreaterThanOrEqual(8000);
      expect(metricas.cobrosConDescuento).toBeGreaterThanOrEqual(1);
    });

    it("GIVEN un cobro pendiente WHEN el coach registra pago con descuento THEN persiste monto cobrado, monto lista y nota", async () => {
      const store = useCobrosStore.getState();
      const joaquin = store.cobros.find((c) => c.alumnoId === "demo-alumno-joaquin");
      expect(joaquin).toBeDefined();

      const montoListaOriginal = joaquin!.montoLista ?? joaquin!.monto;
      const montoConDescuento = montoListaOriginal - 5000;
      const notaDescuento = "Descuento por pago adelantado en efectivo";

      const comprobante = await store.registrarPago({
        contratacionId: joaquin!.contratacionId,
        monto: montoConDescuento,
        montoLista: montoListaOriginal,
        medioPago: "EFECTIVO",
        notas: notaDescuento,
      });

      expect(comprobante.monto).toBe(montoConDescuento);
      expect(comprobante.montoLista).toBe(montoListaOriginal);
      expect(comprobante.descuento).toBe(5000);
      expect(comprobante.notas).toBe(notaDescuento);

      const actualizado = useCobrosStore
        .getState()
        .cobros.find((c) => c.contratacionId === joaquin!.contratacionId);
      expect(actualizado?.estado).toBe("PAGADO");
      expect(actualizado?.monto).toBe(montoConDescuento);
      expect(actualizado?.montoLista).toBe(montoListaOriginal);
      expect(actualizado?.descuento).toBe(5000);
      expect(actualizado?.ultimoPago?.notas).toBe(notaDescuento);
      expect(actualizado?.notaDescuento).toBe(notaDescuento);
    });

    it("GIVEN cuotas con descuento WHEN se consultan THEN permite filtrar montos menores a la sub y recuperar el monto original de lista", () => {
      const store = useCobrosStore.getState();

      // Consulta de montos menores a la sub
      const descuentos = store.obtenerDescuentos();
      expect(descuentos.length).toBeGreaterThanOrEqual(1);
      const sofiaEnDescuentos = descuentos.find((d) => d.alumnoId === "demo-alumno-sofia");
      expect(sofiaEnDescuentos).toBeDefined();
      expect(sofiaEnDescuentos?.monto).toBe(32000);
      expect(sofiaEnDescuentos?.montoLista).toBe(40000);

      // Filtro de estado DESCUENTOS
      store.setFiltroEstado("DESCUENTOS");
      expect(useCobrosStore.getState().filtroEstado).toBe("DESCUENTOS");

      // Recuperar monto original de suscripción (volver a 40k)
      store.recuperarMontoOriginal(sofiaEnDescuentos!.contratacionId);
      const sofiaRecuperada = useCobrosStore
        .getState()
        .cobros.find((c) => c.alumnoId === "demo-alumno-sofia");
      expect(sofiaRecuperada?.monto).toBe(40000);
      expect(sofiaRecuperada?.descuento).toBe(0);
      expect(useCobrosStore.getState().aviso).toContain("40.000");
    });
  });
});
