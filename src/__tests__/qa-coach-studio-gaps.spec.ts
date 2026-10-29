import { beforeEach, describe, expect, it } from "vitest";
import { useCobrosStore } from "@/store/use-cobros-store";
import { generateWhatsAppReactivationUrl } from "@/lib/strength-metrics";

// GOZS-205 — gaps del Coach Studio no cubiertos por QA previos.
describe("QA Coach Studio GOZS-205 — cobros: métricas y registro de pago", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
  });

  it("CS-COB-01 métricas sin NaN/Infinity con lista vacía", () => {
    useCobrosStore.setState({ cobros: [] });
    const m = useCobrosStore.getState().metricas();
    for (const v of Object.values(m)) expect(Number.isFinite(v as number)).toBe(true);
    expect(m.tasaCobranzaPct).toBe(0);
  });

  it("CS-COB-02 ingresosMes + pendiente + vencida coincide con la suma del detalle", () => {
    const s = useCobrosStore.getState();
    const m = s.metricas();
    const suma = s.cobros.reduce(
      (a, c) => a + (c.estado === "PAGADO" ? c.ultimoPago?.monto ?? c.monto : c.monto),
      0
    );
    expect(m.ingresosMes + m.cobranzaPendiente + m.cobranzaVencida).toBe(suma);
  });

  it("CS-COB-03 pago a contratación inexistente se rechaza sin tocar estado", async () => {
    const antes = JSON.stringify(useCobrosStore.getState().cobros);
    await expect(
      useCobrosStore.getState().registrarPago({ contratacionId: "no-existe", monto: 1, medioPago: "EFECTIVO" })
    ).rejects.toThrow();
    expect(JSON.stringify(useCobrosStore.getState().cobros)).toBe(antes);
  });

  it("CS-COB-04 WhatsApp: teléfono con basura se sanea a dígitos y el nombre HTML/JS queda URL-encoded", () => {
    const url = generateWhatsAppReactivationUrl({
      phone: "javascript:alert(1)//+54 9 11-5555",
      studentName: "<img src=x onerror=alert(1)>",
    });
    expect(url.startsWith("https://wa.me/1549115555?text=")).toBe(true);
    expect(url).not.toContain("<");
  });
});
