import { beforeEach, describe, expect, it } from "vitest";
import { useCobrosStore } from "@/store/use-cobros-store";
import {
  AVISO_VIGENCIA_FUTURA,
  esFechaPosteriorAHoy,
  formatearDuracionPlan,
  getHoyFechaString,
  getMananaFechaString,
  validarVigenciaFutura,
} from "@/lib/planes";

describe("FE Studio/cobros: creación y modificación de planes con vigencia futura (GOZS-255)", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
  });

  describe("Criterio 1: Reglas de validación de fecha de vigencia (solo posterior a hoy)", () => {
    it("GIVEN la fecha actual THEN una fecha igual a hoy es rechazada", () => {
      const hoy = getHoyFechaString();
      const resultado = validarVigenciaFutura(hoy);
      expect(resultado.valida).toBe(false);
      expect(resultado.error).toContain("posterior a hoy");
      expect(esFechaPosteriorAHoy(hoy)).toBe(false);
    });

    it("GIVEN una fecha en el pasado THEN es rechazada", () => {
      const pasado = "2026-01-01";
      const resultado = validarVigenciaFutura(pasado);
      expect(resultado.valida).toBe(false);
      expect(resultado.error).toContain("posterior a hoy");
      expect(esFechaPosteriorAHoy(pasado)).toBe(false);
    });

    it("GIVEN una fecha posterior a hoy (mañana en adelante) THEN es aceptada", () => {
      const manana = getMananaFechaString();
      const resultado = validarVigenciaFutura(manana);
      expect(resultado.valida).toBe(true);
      expect(resultado.error).toBeUndefined();
      expect(esFechaPosteriorAHoy(manana)).toBe(true);
    });

    it("GIVEN el coach en /studio/cobros WHEN intenta crear un plan con fecha de hoy o pasada THEN la acción falla y muestra error", async () => {
      const store = useCobrosStore.getState();
      const hoy = getHoyFechaString();

      await expect(
        store.crearPlan({
          nombre: "Funcional Express",
          actividad: "FUNCIONAL",
          duracionMeses: 1,
          limiteSemanal: 2,
          precio: 30000,
          fechaVigencia: hoy,
        }),
      ).rejects.toThrow(/posterior a hoy/);

      expect(useCobrosStore.getState().error).toContain("posterior a hoy");
    });
  });

  describe("Criterio 2: Aviso de que no altera cobrados ni vencidos", () => {
    it("el texto de aviso de vigencia futura comunica explícitamente que no altera cobrados ni vencidos", () => {
      expect(AVISO_VIGENCIA_FUTURA).toMatch(/no alteran pagos ya cobrados ni cuotas vencidas/i);
    });

    it("GIVEN cobros existentes (pagados y vencidos) WHEN se crea o edita un plan con vigencia futura THEN los cobros históricos mantienen su monto y estado intactos", async () => {
      const store = useCobrosStore.getState();
      const manana = getMananaFechaString();

      // Tomamos cobro vencido y cobro pagado
      const vencidoAntes = store.cobros.find((c) => c.estado === "VENCIDO");
      const pagadoAntes = store.cobros.find((c) => c.estado === "PAGADO");
      expect(vencidoAntes).toBeDefined();
      expect(pagadoAntes).toBeDefined();

      const montoVencidoAntes = vencidoAntes!.monto;
      const montoPagadoAntes = pagadoAntes!.monto;

      // Modificamos el precio del plan a uno mucho más alto con vigencia futura
      const planModificado = await store.modificarPlan({
        planId: "demo-plan-funcional-2x",
        precio: 55000,
        fechaVigencia: manana,
      });

      expect(planModificado.precio).toBe(55000);
      expect(planModificado.vigente_desde).toBe(manana);

      // El aviso en el store debe mencionar que no altera cobros anteriores ni vencidos
      const aviso = useCobrosStore.getState().aviso;
      expect(aviso).toMatch(/no altera|no se modifican/i);

      // Verificamos que los cobros en lista siguen con su monto histórico
      const vencidoDespues = store.cobros.find((c) => c.id === vencidoAntes!.id);
      const pagadoDespues = store.cobros.find((c) => c.id === pagadoAntes!.id);
      expect(vencidoDespues?.monto).toBe(montoVencidoAntes);
      expect(pagadoDespues?.monto).toBe(montoPagadoAntes);
    });
  });

  describe("Criterio 3: Opciones trimestrales, semestrales y anuales con actividades (funcional/boxeo/rutinas)", () => {
    it("permite formatear duraciones mensuales, trimestrales, semestrales y anuales", () => {
      expect(formatearDuracionPlan(1)).toBe("Mensual (1 mes)");
      expect(formatearDuracionPlan(3)).toBe("Trimestral (3 meses)");
      expect(formatearDuracionPlan(6)).toBe("Semestral (6 meses)");
      expect(formatearDuracionPlan(12)).toBe("Anual (12 meses)");
    });

    it("GIVEN el coach en /studio/cobros WHEN crea un plan trimestral de Boxeo THEN se persiste correctamente", async () => {
      const store = useCobrosStore.getState();
      const fechaFutura = "2026-12-01";

      const nuevoPlan = await store.crearPlan({
        nombre: "Boxeo Trimestral 3x",
        actividad: "BOXEO",
        duracionMeses: 3,
        limiteSemanal: 3,
        precio: 85000,
        fechaVigencia: fechaFutura,
      });

      expect(nuevoPlan.id).toBeDefined();
      expect(nuevoPlan.nombre).toBe("Boxeo Trimestral 3x");
      expect(nuevoPlan.duracion_meses).toBe(3);
      expect(nuevoPlan.actividad_tipo).toBe("BOXEO");
      expect(nuevoPlan.precio).toBe(85000);
      expect(nuevoPlan.vigente_desde).toBe(fechaFutura);

      // Está en la lista de planes del store
      const encontrado = useCobrosStore.getState().planes.find((p) => p.id === nuevoPlan.id);
      expect(encontrado).toBeDefined();
    });

    it("GIVEN el coach en /studio/cobros WHEN crea un plan semestral de Funcional THEN se persiste correctamente", async () => {
      const store = useCobrosStore.getState();
      const fechaFutura = "2026-11-15";

      const nuevoPlan = await store.crearPlan({
        nombre: "Funcional Semestral Pase Libre",
        actividad: "FUNCIONAL",
        duracionMeses: 6,
        limiteSemanal: null,
        precio: 180000,
        fechaVigencia: fechaFutura,
      });

      expect(nuevoPlan.duracion_meses).toBe(6);
      expect(nuevoPlan.limite_semanal).toBeNull();
      expect(nuevoPlan.precio).toBe(180000);
    });

    it("GIVEN el coach en /studio/cobros WHEN crea un plan anual de Rutinas Online THEN se persiste correctamente", async () => {
      const store = useCobrosStore.getState();
      const fechaFutura = "2027-01-01";

      const nuevoPlan = await store.crearPlan({
        nombre: "Rutinas & Asesoría Anual",
        actividad: "RUTINAS",
        duracionMeses: 12,
        limiteSemanal: null,
        precio: 290000,
        fechaVigencia: fechaFutura,
      });

      expect(nuevoPlan.duracion_meses).toBe(12);
      expect(nuevoPlan.actividad_tipo).toBe("RUTINAS");
      expect(nuevoPlan.precio).toBe(290000);
      expect(nuevoPlan.vigente_desde).toBe(fechaFutura);
    });
  });
});
