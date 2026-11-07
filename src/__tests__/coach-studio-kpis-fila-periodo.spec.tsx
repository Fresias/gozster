import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, beforeEach } from "vitest";
import { BusinessKpiStrip } from "@/components/coach/business-kpi-strip";
import {
  rangoPeriodo,
  mapearRpcAKpis,
  puedeVerMontos,
  type KpisNegocio,
} from "@/lib/kpis-negocio";
import { derivarKpisNegocio } from "@/services/coach-demo-generator";
import {
  DEMO_GIMNASIO,
  DEMO_PLANES_MEMBRESIA,
  DEMO_KPIS_NEGOCIO,
} from "@/services/coach-demo-dataset";
import { useCobrosStore } from "@/store/use-cobros-store";

describe("GOZS-379: Coach Studio: Vista Inicio - Fila de 4 KPIs y Selector de Período", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
  });

  describe("1. Helper rangoPeriodo() reactivo ('semana', 'mes', 'trimestre')", () => {
    it("GIVEN rangoPeriodo('mes', fecha) THEN devuelve el 1 al último día del mes en hora AR", () => {
      const fecha = new Date("2026-11-05T15:00:00Z");
      const r = rangoPeriodo("mes", fecha);
      expect(r.desde).toBe("2026-11-01");
      expect(r.hasta).toBe("2026-11-30");
    });

    it("GIVEN rangoPeriodo('semana', fecha) THEN devuelve lunes a domingo en hora AR", () => {
      // Jueves 5 de noviembre de 2026 (Semana 45: 2 al 8 de nov según PDF Página 7)
      const fechaJueves = new Date("2026-11-05T12:00:00Z");
      const r = rangoPeriodo("semana", fechaJueves);
      expect(r.desde).toBe("2026-11-02");
      expect(r.hasta).toBe("2026-11-08");

      // Domingo 8 de noviembre sigue en la misma semana
      const fechaDomingo = new Date("2026-11-08T12:00:00Z");
      expect(rangoPeriodo("semana", fechaDomingo)).toEqual({
        desde: "2026-11-02",
        hasta: "2026-11-08",
      });

      // Lunes 2 de noviembre arranca la semana
      const fechaLunes = new Date("2026-11-02T12:00:00Z");
      expect(rangoPeriodo("semana", fechaLunes)).toEqual({
        desde: "2026-11-02",
        hasta: "2026-11-08",
      });
    });

    it("GIVEN rangoPeriodo('trimestre', fecha) THEN devuelve inicio y fin del trimestre calendario", () => {
      // Noviembre 2026 -> Q4 (1 oct al 31 dic)
      const fechaQ4 = new Date("2026-11-05T12:00:00Z");
      expect(rangoPeriodo("trimestre", fechaQ4)).toEqual({
        desde: "2026-10-01",
        hasta: "2026-12-31",
      });

      // Febrero 2026 -> Q1 (1 ene al 31 mar)
      const fechaQ1 = new Date("2026-02-15T12:00:00Z");
      expect(rangoPeriodo("trimestre", fechaQ1)).toEqual({
        desde: "2026-01-01",
        hasta: "2026-03-31",
      });

      // Mayo 2026 -> Q2 (1 abr al 30 jun)
      const fechaQ2 = new Date("2026-05-10T12:00:00Z");
      expect(rangoPeriodo("trimestre", fechaQ2)).toEqual({
        desde: "2026-04-01",
        hasta: "2026-06-30",
      });
    });

    it("maneja hora peligrosa UTC respetando el día local de Argentina", () => {
      // 01/11 a las 01:30 UTC = 31/10 a las 22:30 en Argentina (Sábado)
      const fechaPeligrosa = new Date("2026-11-01T01:30:00Z");
      const rSemana = rangoPeriodo("semana", fechaPeligrosa);
      // La semana civil en AR para el 31/10 (sábado) es lunes 26/10 a domingo 01/11
      expect(rSemana.desde).toBe("2026-10-26");
      expect(rSemana.hasta).toBe("2026-11-01");
    });
  });

  describe("2. Fila superior de 4 tarjetas de KPIs según PDF Página 4", () => {
    it("renderiza exactamente las 4 tarjetas con sus testids requeridos", () => {
      const html = renderToStaticMarkup(
        <BusinessKpiStrip
          kpis={DEMO_KPIS_NEGOCIO}
          sinRutina={4}
          totalAlumnos={40}
          sinEntrenarNombres={["Lucas Giménez", "Celeste Gerardi"]}
        />,
      );

      // 4 Tarjetas: Cobrado, Alumnos al día, Sin rutina y Sin entrenar +7 días
      expect(html).toContain('data-testid="kpi-ingresos"');
      expect(html).toContain('data-testid="kpi-cobrado"');
      expect(html).toContain('data-testid="kpi-activos"');
      expect(html).toContain('data-testid="kpi-alumnos-al-dia"');
      expect(html).toContain('data-testid="kpi-sin-rutina"');
      expect(html).toContain('data-testid="kpi-sin-entrenar"');

      // Labels y badges
      expect(html).toContain("Cobrado");
      expect(html).toContain("Alumnos al día");
      expect(html).toContain("Sin rutina");
      expect(html).toContain("Sin entrenar");
      expect(html).toContain("+7 días");

      // Valores numéricos exactos
      expect(html).toContain("$800.000"); // Cobrado
      expect(html).toContain("32 de 40"); // Al día (32 de 40 según PDF)
      expect(html).toContain("4"); // Sin rutina
      expect(html).toContain("Asignales una desde Rutinas");
      expect(html).toContain("Ver quiénes →");
    });

    it("coincidencia exacta entre el valor kpi-cobrado de Inicio y Cobrado de Cobros", () => {
      // Coherencia C1: La fuente única de verdad KpisNegocio coincide con Cobros
      const cobradoCanonico = 800_000;
      const kpisCanonicos = {
        ...DEMO_KPIS_NEGOCIO,
        cobrado: cobradoCanonico,
        ingresos_mes: cobradoCanonico,
      };

      const html = renderToStaticMarkup(
        <BusinessKpiStrip kpis={kpisCanonicos} />,
      );

      // Inicio muestra exactamente el monto canónico de Cobros
      expect(html).toContain(`$${new Intl.NumberFormat("es-AR").format(cobradoCanonico)}`);
      expect(html).toContain('data-testid="kpi-cobrado"');
      expect(html).toContain("$800.000");
    });
  });

  describe("3. Control estricto de roles (ENTRENADOR vs ADMIN)", () => {
    it("GIVEN rol ENTRENADOR WHEN visualiza la fila THEN oculta montos monetarios ($) y conserva contadores de alumnos", () => {
      // Helper de autorización
      expect(puedeVerMontos("ENTRENADOR")).toBe(false);
      expect(puedeVerMontos("ADMIN")).toBe(true);

      const kpisEntrenador = mapearRpcAKpis(
        {
          ingresos: 800_000,
          cobranza_pendiente_monto: 195_000,
          cobranza_vencida_monto: 120_000,
          cobranza_por_vencer_monto: 75_000,
          activos_fin: 32,
          alumnos_al_dia: 26,
          alumnos_morosos: 6,
          cobranza_vencidas_cant: 6,
          sin_entrenar_7d_ids: ["id-1", "id-2"],
          altas: 5,
          bajas: 2,
        },
        "oct.",
        "ENTRENADOR",
      );

      const html = renderToStaticMarkup(
        <BusinessKpiStrip
          kpis={kpisEntrenador}
          rol="ENTRENADOR"
          sinRutina={4}
          totalAlumnos={40}
          sinEntrenarNombres={["Alumno 1", "Alumno 2"]}
        />,
      );

      // Criterio estricto: CERO signos de peso ($) en todo el HTML renderizado
      expect(html).not.toContain("$");

      // Sí se renderizan los contadores operativos de atletas
      expect(html).toContain("32 de 40"); // Alumnos activos / al día
      expect(html).toContain("4"); // Sin rutina
      expect(html).toContain("2"); // Sin entrenar
      expect(html).toContain("+5 altas, −2 bajas este mes");
      expect(html).toContain("cuotas en mora");
    });

    it("GIVEN rol ADMIN WHEN visualiza la fila THEN renderiza montos monetarios ($)", () => {
      const html = renderToStaticMarkup(
        <BusinessKpiStrip
          kpis={DEMO_KPIS_NEGOCIO}
          rol="ADMIN"
          sinRutina={4}
          totalAlumnos={40}
        />,
      );

      expect(html).toContain("$800.000");
      expect(html).toContain("por cobrar");
    });
  });

  describe("4. Recalculación reactiva de los 4 KPIs según rangoPeriodo()", () => {
    it("conmuta reactivamente entre 'Semana', 'Mes' y 'Trimestre' derivando cifras distintas y consistentes", () => {
      const ahora = new Date("2026-11-05T12:00:00Z");

      const rangoMes = rangoPeriodo("mes", ahora);
      const kpisMes = derivarKpisNegocio(DEMO_GIMNASIO, DEMO_PLANES_MEMBRESIA, ahora, rangoMes);

      const rangoSemana = rangoPeriodo("semana", ahora);
      const kpisSemana = derivarKpisNegocio(DEMO_GIMNASIO, DEMO_PLANES_MEMBRESIA, ahora, rangoSemana);

      const rangoTrimestre = rangoPeriodo("trimestre", ahora);
      const kpisTrimestre = derivarKpisNegocio(DEMO_GIMNASIO, DEMO_PLANES_MEMBRESIA, ahora, rangoTrimestre);

      // Los rangos de fecha son distintos
      expect(rangoMes).toEqual({ desde: "2026-11-01", hasta: "2026-11-30" });
      expect(rangoSemana).toEqual({ desde: "2026-11-02", hasta: "2026-11-08" });
      expect(rangoTrimestre).toEqual({ desde: "2026-10-01", hasta: "2026-12-31" });

      // Cifras de cobrado y altas son reactivas y matemáticas
      expect(kpisMes.cobrado).toBe(800_000);
      expect(typeof kpisSemana.cobrado).toBe("number");
      expect(typeof kpisTrimestre.cobrado).toBe("number");
      expect(kpisTrimestre.cobrado).toBeGreaterThanOrEqual(kpisMes.cobrado!);

      // Render de la franja con período 'semana'
      const htmlSemana = renderToStaticMarkup(
        <BusinessKpiStrip kpis={kpisSemana} periodo="semana" />,
      );
      expect(htmlSemana).toContain("semana");

      // Render de la franja con período 'trimestre'
      const htmlTrimestre = renderToStaticMarkup(
        <BusinessKpiStrip kpis={kpisTrimestre} periodo="trimestre" />,
      );
      expect(htmlTrimestre).toContain("trimestre");
    });
  });
});
