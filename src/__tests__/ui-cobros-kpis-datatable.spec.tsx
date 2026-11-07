import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CobrosPanel } from "@/components/coach/cobros-panel";
import { useCobrosStore } from "@/store/use-cobros-store";
import type { KpisNegocio } from "@/lib/kpis-negocio";

describe("GOZS-384: Coach Studio - Vista de Cobros (KPIs Superiores y DataTable 15 Filas)", () => {
  beforeEach(() => {
    useCobrosStore.getState().resetDemoDataset();
  });

  describe("Criterio 1: DataTable paginada con 15 contratos por página y vencidos en primer orden", () => {
    it("GIVEN una lista de 36 contratos de alumnos WHEN el coach accede a /studio/cobros THEN se visualizan 15 filas por página con los alumnos vencidos en primer orden y leyenda 'Mostrando 15 de 36'", () => {
      const store = useCobrosStore.getState();
      expect(store.cobros.length).toBe(36);

      const html = renderToStaticMarkup(<CobrosPanel />);

      // 1. Verifica tabla DataTable presente
      expect(html).toContain('data-testid="cobros-table"');

      // 2. Exactamente 15 filas en la primera página
      const rowMatches = html.match(/data-testid="cobro-row"/g);
      expect(rowMatches).not.toBeNull();
      expect(rowMatches?.length).toBe(15);

      // 3. Leyenda "Mostrando 15 de 36"
      expect(html).toContain("Mostrando 15 de 36");

      // 4. Alumnos vencidos en primer orden:
      // Los alumnos morosos/vencidos deben aparecer antes que los alumnos con estado PAGADO en la página 1
      const posTomas = html.indexOf("Tomás Ledesma");
      const posAgustin = html.indexOf("Agustín Molina");
      const posSantiago = html.indexOf("Santiago Ojeda");
      const posCeleste = html.indexOf("Celeste Gerardi"); // Pagada en página 1
      const posSofia = html.indexOf("Sofía Benítez"); // Pagada en página 1

      expect(posTomas).toBeGreaterThan(-1);
      expect(posAgustin).toBeGreaterThan(-1);
      expect(posSantiago).toBeGreaterThan(-1);
      expect(posCeleste).toBeGreaterThan(-1);
      expect(posSofia).toBeGreaterThan(-1);

      // Los vencidos deben preceder a los pagados en el DOM renderizado
      expect(posSantiago).toBeLessThan(posCeleste);
      expect(posAgustin).toBeLessThan(posCeleste);
      expect(posTomas).toBeLessThan(posCeleste);
      expect(posSantiago).toBeLessThan(posSofia);
      expect(posTomas).toBeLessThan(posSofia);
    });
  });

  describe("Criterio 2: 4 KPIs superiores derivados de KpisNegocio", () => {
    it("GIVEN los 4 KPIs superiores WHEN se accede a /studio/cobros THEN los valores de Cobrado, Por cobrar, Vencido y Tasa de cobro coinciden con el store", () => {
      const store = useCobrosStore.getState();
      const metricas = store.metricas();
      const html = renderToStaticMarkup(<CobrosPanel />);

      // Franja contenedora
      expect(html).toContain('data-testid="cobros-kpis"');

      // 1. Cobrado
      expect(html).toContain('data-testid="kpi-ingresos-mes"');
      expect(html).toContain(`$${metricas.ingresosMes.toLocaleString("es-AR")}`);

      // 2. Por cobrar
      expect(html).toContain('data-testid="kpi-cobranza-pendiente"');
      expect(html).toContain(`$${metricas.cobranzaPendiente.toLocaleString("es-AR")}`);

      // 3. Vencido
      expect(html).toContain('data-testid="kpi-alumnos-morosos"');
      expect(html).toContain(`$${metricas.cobranzaVencida.toLocaleString("es-AR")}`);

      // 4. Tasa de cobro
      expect(html).toContain('data-testid="kpi-tasa-cobranza"');
      expect(html).toContain(`${metricas.tasaCobranzaPct}%`);

      // Alumnos al día sincronizados
      expect(html).toContain(`${metricas.alumnosAlDia} alumnos al día`);
    });

    it("GIVEN los 4 KPIs superiores provistos vía prop KpisNegocio (BE-01) THEN los valores coinciden con KpisNegocio con exactitud", () => {
      const kpisCanonicos: KpisNegocio = {
        cobrado: 800000,
        porCobrar: 75000,
        vencido: 120000,
        facturado: 995000,
        tasaCobroPct: 80,
        ingresos_presencial: 500000,
        ingresos_online: 300000,
        alumnos_activos: 36,
        alumnos_al_dia: 32,
        alumnosAlDia: 32,
        alumnos_morosos: 4,
        alumnosMorosos: 4,
        sin_entrenar_7d_ids: [],
        altas_mes: 3,
        bajas_mes: 1,
        ingresos_mes: 800000,
        ingresos_variacion_pct: 12,
        ingresos_mes_anterior_label: "Octubre",
        ingresos_ultimos_6_meses: [700000, 750000, 800000],
        a_cobrar: 195000,
        cobranza_pct: 80,
        cobranza_faltante: 195000,
        cobranza_vencidas: 4,
      };

      const html = renderToStaticMarkup(<CobrosPanel kpis={kpisCanonicos} />);

      expect(html).toContain('data-testid="cobros-kpis"');
      expect(html).toContain("$800.000");
      expect(html).toContain("$75.000");
      expect(html).toContain("$120.000");
      expect(html).toContain("80%");
      expect(html).toContain("32 alumnos al día");
    });
  });

  describe("Criterio 3: Filtro 'Vencidos' exhibe únicamente contratos cuyo vencimiento es anterior a la fecha actual", () => {
    it("GIVEN el filtro 'Vencidos' WHEN se activa THEN la tabla exhibe únicamente los contratos cuyo vencimiento es anterior a la fecha actual", () => {
      const html = renderToStaticMarkup(<CobrosPanel initialFiltroEstado="VENCIDOS" />);

      // Botón de filtro Vencidos activo
      expect(html).toContain('data-testid="filtro-vencidos-btn"');

      // Filas presentes
      const rowMatches = html.match(/data-testid="cobro-row"/g);
      expect(rowMatches).not.toBeNull();
      expect(rowMatches?.length).toBe(7);

      // Todos los alumnos morosos conocidos deben estar en la tabla
      expect(html).toContain("Tomás Ledesma");
      expect(html).toContain("Agustín Molina");
      expect(html).toContain("Micaela Vera");
      expect(html).toContain("Gonzalo Peralta");
      expect(html).toContain("Lara Domínguez");
      expect(html).toContain("Santiago Ojeda");
      expect(html).toContain("Pilar Sánchez");

      // Ningún alumno pagado o por vencer con fecha futura debe estar presente
      expect(html).not.toContain("Celeste Gerardi");
      expect(html).not.toContain("Facundo Medina");
      expect(html).not.toContain("Lucas Giménez");

      // La leyenda debe reflejar los 7 contratos
      expect(html).toContain("Mostrando 7 de 7");
    });
  });

  describe("Criterio 4: Badges semánticos StatusBadge y menú de acciones ⋯ por fila", () => {
    it("GIVEN la tabla de contratos THEN cada fila incluye StatusBadge y botón de menú de acciones ⋯", () => {
      const html = renderToStaticMarkup(<CobrosPanel />);

      // StatusBadge semánticos
      expect(html).toContain('data-testid="estado-cobro-badge"');
      expect(html).toContain("Vencido");
      expect(html).toContain("Pagado");

      // Menú de acciones ⋯
      expect(html).toContain('data-testid="cobro-acciones-menu-btn"');

      // Botón de acción directa
      expect(html).toContain('data-testid="registrar-pago-btn"');
    });
  });
});
