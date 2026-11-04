import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it, beforeEach } from "vitest";
import { StudioIngresosView } from "@/components/coach/studio-ingresos-view";
import { CANONICAL_SANKEY_DATA } from "@/components/coach/studio-sankey-modal";
import {
  generarDemoClasesSemana,
  generarDemoReservasIniciales,
} from "@/services/coach-demo-dataset";
import { useClasesStore } from "@/store/use-clases-store";

const coachStudioViewCode = fs.readFileSync(
  path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
  "utf-8"
);
const ingresosPageCode = fs.readFileSync(
  path.resolve(__dirname, "../app/(coach)/studio/ingresos/page.tsx"),
  "utf-8"
);
const classAgendaCode = fs.readFileSync(
  path.resolve(__dirname, "../components/coach/class-agenda.tsx"),
  "utf-8"
);

const cleanHtml = (raw: string) => raw.replace(/<!-- -->/g, "");

describe("GOZS-356: Auditoría Integral QA - Clases sin Cupo por Defecto y Vista Dedicada Sankey reui.io", () => {
  beforeEach(() => {
    useClasesStore.getState().resetDemoDataset();
  });

  describe("A. Verificación de Clases sin Cupo por Defecto (GOZS-354)", () => {
    it("GIVEN el catálogo de horarios demo WHEN se generan las clases de la semana THEN todas las clases base inician con capacidad = null", () => {
      const clases = generarDemoClasesSemana(new Date());
      expect(clases.length).toBeGreaterThan(0);
      for (const clase of clases) {
        expect(clase.capacidad).toBeNull();
      }
    });

    it("GIVEN la clase de Funcional del miércoles 4 de noviembre WHEN se consulta en el store THEN tiene capacidad = null y ningún alumno forzado a EN_ESPERA", () => {
      const clases = useClasesStore.getState().clases;
      const claseMiercoles = clases.find((c) => c.id === "demo-clase-func-miercoles");
      expect(claseMiercoles).toBeDefined();
      expect(claseMiercoles?.capacidad).toBeNull();

      const reservasMiercoles = useClasesStore
        .getState()
        .agendaReservas.filter((r) => r.clase_id === "demo-clase-func-miercoles");
      expect(reservasMiercoles.length).toBe(5);
      // Ningún alumno relegado a espera obligatoria por un cupo default ficticio
      expect(reservasMiercoles.every((r) => r.estado === "ANOTADO")).toBe(true);
    });

    it("GIVEN el componente ClassAgenda WHEN una clase no tiene cupo definido (capacidad = null) THEN renderiza '${ocupados} anot.' sin franja de límite ni barra de saturación", () => {
      // Verificación en el código de ClassAgenda del renderizado condicional correcto
      expect(classAgendaCode).toContain(
        'capacidad !== null ? `${ocupados}/${capacidad}` : `${ocupados} anot.`'
      );
      // La barra de saturación solo se dibuja cuando la capacidad NO es nula
      expect(classAgendaCode).toContain("vista === \"dia\" && capacidad !== null && !cancelada");
    });

    it("GIVEN un alumno inscribiéndose en una clase sin límite WHEN reserva plaza THEN no es rechazado por falta de cupos", async () => {
      useClasesStore.getState().setDemoAlumnoId("demo-alumno-sofia");
      await useClasesStore.getState().cargarClasesAlumno();

      await useClasesStore.getState().reservar("demo-clase-func-miercoles");
      expect(useClasesStore.getState().error).toBeNull();
      expect(useClasesStore.getState().sinCupo).not.toContain("demo-clase-func-miercoles");
    });

    it("GIVEN una clase donde el entrenador define un límite explícito con 'Editar cupo' THEN adopta el nuevo cupo numérico", async () => {
      await useClasesStore.getState().actualizarCupoClase("demo-clase-func-miercoles", 10);
      const claseActualizada = useClasesStore
        .getState()
        .clases.find((c) => c.id === "demo-clase-func-miercoles");
      expect(claseActualizada?.capacidad).toBe(10);
    });
  });

  describe("B. Verificación de Vista Dedicada /studio/ingresos y Diagrama Sankey reui.io (GOZS-355)", () => {
    it("GIVEN la ruta /studio/ingresos/page.tsx WHEN se inspecciona THEN es Server Component dinámico que renderiza StudioIngresosView", () => {
      expect(ingresosPageCode).toContain('export const dynamic = "force-dynamic"');
      expect(ingresosPageCode).toContain("<StudioIngresosView");
    });

    it("GIVEN CoachStudioView WHEN el entrenador hace clic en el KPI de Ingresos THEN redirige a /studio/ingresos", () => {
      expect(coachStudioViewCode).toContain('router.push("/studio/ingresos")');
      expect(coachStudioViewCode).toContain("onIngresosClick");
    });

    it("GIVEN el componente StudioIngresosView WHEN se renderiza THEN exhibe la franja superior de 4 KPIs ejecutivos estilo reui.io", () => {
      const html = cleanHtml(renderToString(React.createElement(StudioIngresosView, { data: CANONICAL_SANKEY_DATA })));
      expect(html).toContain('data-testid="studio-ingresos-view"');
      expect(html).toContain('data-testid="top-metrics-strip"');

      // 1. Facturación Potencial: $100.000 (+15.2% vs mes anterior)
      expect(html).toContain('data-testid="kpi-facturacion-potencial"');
      expect(html).toContain("Facturación Potencial");
      expect(html).toContain("$100.000");
      expect(html).toContain("+15.2% vs mes anterior");

      // 2. Cobranza Efectiva: $80.000 (80.0% tasa de efectividad)
      expect(html).toContain('data-testid="kpi-cobranza-efectiva"');
      expect(html).toContain("Cobranza Efectiva");
      expect(html).toContain("$80.000");
      expect(html).toContain("80.0% tasa de efectividad");

      // 3. Cartera por Cobrar / Deuda: $20.000
      expect(html).toContain('data-testid="kpi-cartera-por-cobrar"');
      expect(html).toContain("Cartera por Cobrar");
      expect(html).toContain("$20.000");
      expect(html).toContain("2 alumnos con cuotas pendientes");

      // 4. Mix de Negocio: 81% Presencial / 19% Online
      expect(html).toContain('data-testid="kpi-mix-negocio"');
      expect(html).toContain("Mix de Negocio");
      expect(html).toContain("81% Presencial");
      expect(html).toContain("19% Online");
    });

    it("GIVEN el componente StudioIngresosView WHEN se renderiza THEN exhibe la barra de filtros interactiva con bullets de color y texto guía", () => {
      const html = cleanHtml(renderToString(React.createElement(StudioIngresosView, { data: CANONICAL_SANKEY_DATA })));
      expect(html).toContain('data-testid="sankey-filter-bar"');
      expect(html).toContain('data-testid="filter-pill-todos"');
      expect(html).toContain('data-testid="filter-pill-cobrado"');
      expect(html).toContain('data-testid="filter-pill-pendiente"');
      expect(html).toContain('data-testid="filter-pill-presencial"');
      expect(html).toContain('data-testid="filter-pill-online"');
      expect(html).toContain('data-testid="sankey-guide-text"');
      expect(html).toContain("Haz clic en un nodo para trazar su flujo");
    });

    it("GIVEN el lienzo SVG de Sankey WHEN se renderiza THEN dibuja los nodos principales y ribbons Bézier sin duplicar tarjetas de texto inferiores", () => {
      const html = cleanHtml(renderToString(React.createElement(StudioIngresosView, { data: CANONICAL_SANKEY_DATA })));
      expect(html).toContain('data-testid="sankey-node-potencial"');
      expect(html).toContain('data-testid="sankey-node-cobrado"');
      expect(html).toContain('data-testid="sankey-node-pendiente"');
      expect(html).toContain('data-testid="sankey-node-funcional"');
      expect(html).toContain('data-testid="sankey-node-boxeo"');
      expect(html).toContain('data-testid="sankey-node-rutinas"');

      // Verifica que no se repita el bloque redundante antiguo 'data-testid="sankey-summary"'
      expect(html).not.toContain('data-testid="sankey-summary"');

      // Verifica botón de retorno a Studio y selector de período
      expect(html).toContain('data-testid="btn-volver-studio"');
      expect(html).toContain('href="/studio"');
      expect(html).toContain("Volver a Studio");
      expect(html).toContain('data-testid="period-selector"');
    });
  });

  describe("C. Verificación de Casos Límite y Exactitud Matemática (Edge Cases QA)", () => {
    it("EDGE CASE: Reversión de cupo numérico a 'Sin límite' (capacidad = null) restaura la ausencia de restricción", async () => {
      // 1. Asigna cupo explícito de 5
      await useClasesStore.getState().actualizarCupoClase("demo-clase-func-miercoles", 5);
      expect(
        useClasesStore.getState().clases.find((c) => c.id === "demo-clase-func-miercoles")?.capacidad
      ).toBe(5);

      // 2. Vuelve a editar cupo a null (o sin límite)
      await useClasesStore.getState().actualizarCupoClase("demo-clase-func-miercoles", null);
      const claseRestaurada = useClasesStore
        .getState()
        .clases.find((c) => c.id === "demo-clase-func-miercoles");
      expect(claseRestaurada?.capacidad).toBeNull();
    });

    it("EDGE CASE: Exactitud matemática de conservación de flujo en el Sankey (Potencial = Cobrado + Pendiente = Presencial + Online)", () => {
      const { potencialTotal, efectivoCobrado, potencialPendiente } = CANONICAL_SANKEY_DATA;

      // Conservación de flujos contables
      const sumaDestinos = efectivoCobrado.total + potencialPendiente.total;
      expect(sumaDestinos).toBe(potencialTotal);

      const sumaOrigenCobrado =
        efectivoCobrado.presencial.total + efectivoCobrado.online.total;
      expect(sumaOrigenCobrado).toBe(efectivoCobrado.total);

      const sumaOrigenPresencial =
        efectivoCobrado.presencial.funcional + efectivoCobrado.presencial.boxeo;
      expect(sumaOrigenPresencial).toBe(efectivoCobrado.presencial.total);

      const sumaMora =
        potencialPendiente.desgloseActividad.funcional +
        potencialPendiente.desgloseActividad.boxeo +
        potencialPendiente.desgloseActividad.rutinas;
      expect(sumaMora).toBe(potencialPendiente.total);

      // Verificación de porcentajes exactos
      const pctCobrado = (efectivoCobrado.total / potencialTotal) * 100;
      const pctMora = (potencialPendiente.total / potencialTotal) * 100;
      expect(pctCobrado).toBe(80);
      expect(pctMora).toBe(20);
      expect(pctCobrado + pctMora).toBe(100);
    });

    it("EDGE CASE: Las clases demo canceladas conservan capacidad = null y estado = 'CANCELADA'", () => {
      const clases = generarDemoClasesSemana(new Date());
      const claseViernes = clases.find((c) => c.id === "demo-clase-func-viernes");
      expect(claseViernes).toBeDefined();
      expect(claseViernes?.capacidad).toBeNull();
      expect(claseViernes?.estado).toBe("CANCELADA");
      expect(claseViernes?.motivo_cancelacion).toContain("Feriado");
    });
  });
});
