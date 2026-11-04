import * as React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import fs from "fs";
import path from "path";
import {
  StudioIngresosView,
  type SankeyFilter,
} from "@/components/coach/studio-ingresos-view";
import { CANONICAL_SANKEY_DATA } from "@/components/coach/studio-sankey-modal";

describe("GOZS-355: Vista Dedicada /studio/ingresos con Diagrama de Sankey estilo reui.io", () => {
  const studioViewPath = path.resolve(
    __dirname,
    "../components/coach/coach-studio-view.tsx",
  );
  const pagePath = path.resolve(
    __dirname,
    "../app/(coach)/studio/ingresos/page.tsx",
  );

  describe("Criterio 1: Navegación desde Coach Studio hacia /studio/ingresos", () => {
    it("GIVEN el dashboard de /studio WHEN el coach pulsa sobre la tarjeta de Ingresos THEN redirige a /studio/ingresos", () => {
      expect(fs.existsSync(studioViewPath)).toBe(true);
      const studioViewCode = fs.readFileSync(studioViewPath, "utf-8");

      // Verifica navegación directa con router.push hacia /studio/ingresos
      expect(studioViewCode).toContain('router.push("/studio/ingresos")');
      // Mantiene contrato y compatibilidad previa
      expect(studioViewCode).toContain("onIngresosClick={() => setIsSankeyModalOpen(true)}");
    });

    it("existe la ruta dedicada en app router src/app/(coach)/studio/ingresos/page.tsx", () => {
      expect(fs.existsSync(pagePath)).toBe(true);
      const pageCode = fs.readFileSync(pagePath, "utf-8");
      expect(pageCode).toContain("StudioIngresosView");
    });
  });

  describe("Criterio 2: Cabecera Ejecutiva, Selector de Período y Retorno ágil", () => {
    it("GIVEN la vista /studio/ingresos THEN despliega título, badge del período activo, selector y botón de retorno al dashboard", () => {
      const html = renderToString(React.createElement(StudioIngresosView));

      // Título y badge
      expect(html).toContain("Flujo de Facturación &amp; Cobranza");
      expect(html).toContain("Noviembre 2026");

      // Selector de período
      expect(html).toContain('data-testid="period-selector"');
      expect(html).toContain("Q4 2026 (Trimestre)");

      // Botón o breadcrumb de retorno a /studio
      expect(html).toContain('data-testid="btn-volver-studio"');
      expect(html).toContain('href="/studio"');
      expect(html).toContain("Volver a Studio");
    });
  });

  describe("Criterio 3: Franja Superior de Métricas Clave (Top Metrics Strip reui.io)", () => {
    it("GIVEN la vista de ingresos THEN expone 4 tarjetas elevadas limpias con tipografía tabular y badges de variación", () => {
      const html = renderToString(
        React.createElement(StudioIngresosView, { data: CANONICAL_SANKEY_DATA }),
      );

      // Franja contenedora
      expect(html).toContain('data-testid="top-metrics-strip"');

      // 1. Facturación Potencial
      expect(html).toContain('data-testid="kpi-facturacion-potencial"');
      expect(html).toContain("Facturación Potencial");
      expect(html).toContain("$100.000");
      expect(html).toContain("+15.2% vs mes anterior");

      // 2. Cobranza Efectiva
      expect(html).toContain('data-testid="kpi-cobranza-efectiva"');
      expect(html).toContain("Cobranza Efectiva");
      expect(html).toContain("$80.000");
      expect(html).toContain("80.0% tasa de efectividad");

      // 3. Cartera por Cobrar
      expect(html).toContain('data-testid="kpi-cartera-por-cobrar"');
      expect(html).toContain("Cartera por Cobrar");
      expect(html).toContain("$20.000");
      expect(html).toContain("2 alumnos con cuotas pendientes");

      // 4. Mix de Negocio
      expect(html).toContain('data-testid="kpi-mix-negocio"');
      expect(html).toContain("Mix de Negocio");
      expect(html).toContain("81% Presencial");
      expect(html).toContain("19% Online");
    });
  });

  describe("Criterio 4: Barra de Filtros interactiva con bullets de color y guía", () => {
    it("GIVEN la barra de filtros THEN presenta los pills Todos, Cobrado, Por Cobrar, Presencial y Online junto con la guía de interacción", () => {
      const html = renderToString(React.createElement(StudioIngresosView));

      // Barra de filtros
      expect(html).toContain('data-testid="sankey-filter-bar"');
      expect(html).toContain('data-testid="filter-pill-todos"');
      expect(html).toContain('data-testid="filter-pill-cobrado"');
      expect(html).toContain('data-testid="filter-pill-pendiente"');
      expect(html).toContain('data-testid="filter-pill-presencial"');
      expect(html).toContain('data-testid="filter-pill-online"');

      // Bullets de color
      expect(html).toContain("bg-emerald-500");
      expect(html).toContain("bg-amber-500");
      expect(html).toContain("bg-sky-500");
      expect(html).toContain("bg-indigo-500");

      // Texto guía a la derecha
      expect(html).toContain('data-testid="sankey-guide-text"');
      expect(html).toContain("Haz clic en un nodo para trazar su flujo");
    });
  });

  describe("Criterio 5: Lienzo Sankey Bézier Responsivo y Conservación Matemática", () => {
    it("GIVEN el lienzo Sankey SVG THEN dibuja los ribbons Bézier y nodos con conservación matemática estricta de flujo ($100k = $80k + $20k)", () => {
      const html = renderToString(React.createElement(StudioIngresosView));

      // Canvas SVG
      expect(html).toContain('data-testid="sankey-canvas"');
      expect(html).toContain('viewBox="0 0 960 420"');

      // Nodos principales
      expect(html).toContain('data-testid="sankey-node-potencial"');
      expect(html).toContain('data-testid="sankey-node-cobrado"');
      expect(html).toContain('data-testid="sankey-node-pendiente"');
      expect(html).toContain('data-testid="sankey-node-funcional"');
      expect(html).toContain('data-testid="sankey-node-boxeo"');
      expect(html).toContain('data-testid="sankey-node-rutinas"');

      // Ribbons presentes en el SVG
      expect(html).toContain('id="ribbon-potencial-cobrado"');
      expect(html).toContain('id="ribbon-potencial-pendiente"');
      expect(html).toContain('id="ribbon-cobrado-funcional"');
      expect(html).toContain('id="ribbon-cobrado-boxeo"');
      expect(html).toContain('id="ribbon-cobrado-rutinas"');
      expect(html).toContain('id="ribbon-pendiente-funcional"');
      expect(html).toContain('id="ribbon-pendiente-boxeo"');
      expect(html).toContain('id="ribbon-pendiente-rutinas"');

      // Conservación de flujo
      const { potencialTotal, efectivoCobrado, potencialPendiente } = CANONICAL_SANKEY_DATA;
      expect(potencialTotal).toBe(100000);
      expect(efectivoCobrado.total).toBe(80000);
      expect(potencialPendiente.total).toBe(20000);
      expect(efectivoCobrado.total + potencialPendiente.total).toBe(potencialTotal);

      const totalActividades =
        efectivoCobrado.presencial.funcional +
        potencialPendiente.desgloseActividad.funcional +
        efectivoCobrado.presencial.boxeo +
        potencialPendiente.desgloseActividad.boxeo +
        efectivoCobrado.online.rutinas +
        potencialPendiente.desgloseActividad.rutinas;
      expect(totalActividades).toBe(potencialTotal);
    });

    it("GIVEN filtros activos THEN atenúa los ribbons no relacionados (opacity: 0.15) y destaca los pertinentes (opacity: 0.85)", () => {
      // Vista con filtro COBRADO
      const htmlCobrado = renderToString(
        React.createElement(StudioIngresosView, { initialFilter: "COBRADO" }),
      );

      // Ribbon de Cobrado debe tener opacity 0.85
      expect(htmlCobrado).toMatch(/id="ribbon-potencial-cobrado"[^>]*opacity:\s*0\.85/);
      // Ribbon de Pendiente debe atenuarse a 0.15
      expect(htmlCobrado).toMatch(/id="ribbon-potencial-pendiente"[^>]*opacity:\s*0\.15/);

      // Vista con filtro PENDIENTE
      const htmlPendiente = renderToString(
        React.createElement(StudioIngresosView, { initialFilter: "PENDIENTE" }),
      );
      expect(htmlPendiente).toMatch(/id="ribbon-potencial-cobrado"[^>]*opacity:\s*0\.15/);
      expect(htmlPendiente).toMatch(/id="ribbon-potencial-pendiente"[^>]*opacity:\s*0\.85/);
    });
  });

  describe("Criterio 6: Cero Redundancia de Tarjetas Inferiores", () => {
    it("GIVEN la vista dedicada /studio/ingresos THEN NO repite bloques ni tablas inferiores duplicadas debajo del gráfico", () => {
      const html = renderToString(React.createElement(StudioIngresosView));

      // No debe contener tablas o tarjetas duplicadas de desglose repetitivo
      expect(html).not.toContain("Desglose detallado de fondos");
      expect(html).not.toContain("Tabla de atletas con saldo");
      expect(html).not.toContain('data-testid="sankey-deudores-table"');

      // En su lugar, contiene el pie de página ejecutivo estilo reui.io
      expect(html).toContain("Cifras expresadas en ARS • Actualizado Noviembre 2026 • Cifras de gestión interna");
    });
  });
});
