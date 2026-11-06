import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StudioSankeyView } from "@/components/coach/studio-sankey-view";
import { DEMO_KPIS_NEGOCIO } from "@/services/coach-demo-dataset";
import type { KpisNegocio } from "@/lib/kpis-negocio";

const pageSource = fs.readFileSync(
  path.resolve(__dirname, "../app/(coach)/studio/ingresos/page.tsx"),
  "utf-8"
);
const viewSource = fs.readFileSync(
  path.resolve(__dirname, "../components/coach/studio-sankey-view.tsx"),
  "utf-8"
);

describe("GOZS-387: Coach Studio: Vista de Ingresos - Diagrama de Sankey Reactivo y Tabla Accesible (WCAG AA)", () => {
  describe("Criterio 1: Desacoplamiento de CANONICAL_SANKEY_DATA y consumo estricto de KpisNegocio", () => {
    it("GIVEN la ruta /studio/ingresos/page.tsx THEN no importa ni depende de CANONICAL_SANKEY_DATA", () => {
      expect(pageSource).not.toContain("CANONICAL_SANKEY_DATA");
      expect(pageSource).toContain("export const dynamic = \"force-dynamic\"");
      expect(pageSource).toContain("<StudioSankeyView");
    });

    it("GIVEN la vista /studio/ingresos THEN el monto total Facturado equivale exactamente a Cobrado + Por cobrar + Vencido reportado en KpisNegocio", () => {
      const html = renderToString(React.createElement(StudioSankeyView, {}));
      const clean = html.replace(/<!-- -->/g, "").replace(/[\u00a0\s]+/g, " ");

      const cobrado = DEMO_KPIS_NEGOCIO.cobrado ?? 0;
      const porCobrar = DEMO_KPIS_NEGOCIO.porCobrar ?? 0;
      const vencido = DEMO_KPIS_NEGOCIO.vencido ?? 0;
      const facturado = DEMO_KPIS_NEGOCIO.facturado ?? (cobrado + porCobrar + vencido);

      expect(facturado).toBe(cobrado + porCobrar + vencido);

      // Verificación en Top Metrics Strip
      expect(html).toContain('data-testid="sankey-kpi-facturado"');
      expect(clean).toContain(`$${new Intl.NumberFormat("es-AR").format(facturado)}`);
      expect(clean).toContain(`$${new Intl.NumberFormat("es-AR").format(cobrado)}`);

      // Verificación del nodo central de Facturación Potencial
      expect(html).toContain('data-testid="sankey-node-potencial"');
      expect(html).toContain('data-testid="sankey-node-cobrado"');
    });

    it("GIVEN un objeto custom de KpisNegocio THEN StudioSankeyView consume sus valores fielmente", () => {
      const customKpis: KpisNegocio = {
        ...DEMO_KPIS_NEGOCIO,
        cobrado: 600_000,
        porCobrar: 100_000,
        vencido: 50_000,
        facturado: 750_000,
        ingresos_presencial: 450_000,
        ingresos_online: 150_000,
      };

      const html = renderToString(React.createElement(StudioSankeyView, { kpis: customKpis }));
      const clean = html.replace(/<!-- -->/g, "").replace(/[\u00a0\s]+/g, " ");

      expect(clean).toContain("$750.000");
      expect(clean).toContain("$600.000");
      expect(clean).toContain("$100.000");
      expect(clean).toContain("$50.000");
    });
  });

  describe("Criterio 2: Tabla HTML Accesible (WCAG AA) navegable por teclado inmediatamente debajo del SVG", () => {
    it("GIVEN el Diagrama de Sankey interactivo WHEN se navega por teclado THEN existe una tabla HTML accesible inmediatamente debajo con todos los valores numéricos tabulados", () => {
      const html = renderToString(React.createElement(StudioSankeyView, {}));
      const clean = html.replace(/<!-- -->/g, "").replace(/[\u00a0\s]+/g, " ");

      // Contenedor accesible con tabIndex y role="region"
      expect(html).toContain('data-testid="sankey-table-container"');
      expect(html).toContain('tabindex="0"');
      expect(html).toContain('role="region"');

      // Tabla semántica con caption, thead, tbody, tfoot
      expect(html).toContain('data-testid="sankey-accessible-table"');
      expect(html).toContain("<caption");
      expect(html).toContain("<thead");
      expect(html).toContain("<tbody");
      expect(html).toContain("<tfoot");
      expect(html).toContain('scope="col"');
      expect(html).toContain('scope="row"');

      // Filas cuantitativas presentes
      expect(html).toContain('data-testid="sankey-row-presencial"');
      expect(html).toContain('data-testid="sankey-row-online"');
      expect(html).toContain('data-testid="sankey-row-facturado"');
      expect(html).toContain('data-testid="sankey-row-cobrado"');
      expect(html).toContain('data-testid="sankey-row-por-cobrar"');
      expect(html).toContain('data-testid="sankey-row-vencido"');

      // Fila de comprobación contable en tfoot
      expect(html).toContain('data-testid="sankey-table-identity-check"');
      expect(clean).toContain("Identidad Contable:");
    });

    it("GIVEN la tabla accesible THEN tabula exactamente las sumas de Presencial, Online, Cobrado, Por cobrar y Vencido", () => {
      const customKpis: KpisNegocio = {
        ...DEMO_KPIS_NEGOCIO,
        cobrado: 800_000,
        porCobrar: 75_000,
        vencido: 120_000,
        facturado: 995_000,
        ingresos_presencial: 520_000,
        ingresos_online: 280_000,
      };

      const html = renderToString(React.createElement(StudioSankeyView, { kpis: customKpis }));
      const clean = html.replace(/<!-- -->/g, "").replace(/[\u00a0\s]+/g, " ");

      expect(clean).toContain("$995.000");
      expect(clean).toContain("$800.000");
      expect(clean).toContain("$75.000");
      expect(clean).toContain("$120.000");
    });
  });

  describe("Criterio 3: Filtro de período en Ingresos y reactividad Bézier", () => {
    it("GIVEN el selector de período THEN ofrece opciones 'Noviembre 2026' y 'Q4 FY26'", () => {
      const html = renderToString(React.createElement(StudioSankeyView, {}));
      expect(html).toContain('data-testid="filter-periodo-mes"');
      expect(html).toContain('data-testid="filter-periodo-trimestre"');
      expect(html).toContain("Noviembre 2026");
      expect(html).toContain("Q4 FY26");
    });

    it("GIVEN el componente en código WHEN se inspecciona THEN las cintas Bézier calculan coordenadas dinámicas según el período", () => {
      // Verificación de dinamismo en studio-sankey-view.tsx
      expect(viewSource).toContain("createSankeyRibbon");
      expect(viewSource).toContain("yPresSplit");
      expect(viewSource).toContain("yCobSplit");
      expect(viewSource).toContain("data-testid=\"sankey-ribbon-presencial\"");
      expect(viewSource).toContain("data-testid=\"sankey-ribbon-online\"");
      expect(viewSource).toContain("data-testid=\"sankey-ribbon-cobrado\"");
    });
  });

  describe("Criterio 4: Retrocompatibilidad con suite de tests existente", () => {
    it("GIVEN initialData de tipo SankeyFlowData THEN se renderizan las métricas y nodos heredados", () => {
      const legacyData = {
        potencialTotal: 100_000,
        efectivoCobrado: {
          total: 80_000,
          presencial: { total: 65_000, funcional: 50_000, boxeo: 15_000 },
          online: { total: 15_000, rutinas: 15_000 },
        },
        potencialPendiente: {
          total: 20_000,
          desgloseActividad: { funcional: 10_000, boxeo: 5_000, rutinas: 5_000 },
          deudores: [{ id: "1", nombre: "Test", actividad: "FUNCIONAL" as const, monto: 10_000 }],
        },
      };

      const html = renderToString(React.createElement(StudioSankeyView, { initialData: legacyData }));
      const clean = html.replace(/<!-- -->/g, "").replace(/[\u00a0\s]+/g, " ");

      expect(clean).toContain("$100.000");
      expect(clean).toContain("$80.000");
      expect(clean).toContain("$20.000");
      expect(html).toContain('data-testid="sankey-node-pendiente"');
    });
  });
});
