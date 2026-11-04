import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it, beforeEach } from "vitest";
import { StudioSankeyView } from "@/components/coach/studio-sankey-view";
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
    it("GIVEN la ruta /studio/ingresos/page.tsx WHEN se inspecciona THEN es Server Component dinámico que renderiza StudioSankeyView", () => {
      expect(ingresosPageCode).toContain('export const dynamic = "force-dynamic"');
      expect(ingresosPageCode).toContain("<StudioSankeyView");
      expect(ingresosPageCode).toContain("Flujo de Facturación & Cobranza");
    });

    it("GIVEN CoachStudioView WHEN el entrenador hace clic en el KPI de Ingresos THEN redirige a /studio/ingresos", () => {
      expect(coachStudioViewCode).toContain('router.push("/studio/ingresos")');
      expect(coachStudioViewCode).toContain("onIngresosClick");
    });

    it("GIVEN el componente StudioSankeyView WHEN se renderiza THEN exhibe la franja superior de 4 KPIs ejecutivos estilo reui.io", () => {
      const html = renderToString(React.createElement(StudioSankeyView, { initialData: CANONICAL_SANKEY_DATA }));
      const clean = html.replace(/<!-- -->/g, "").replace(/[\u00a0\s]+/g, " ");
      expect(html).toContain('data-testid="studio-sankey-view"');
      expect(html).toContain('data-testid="sankey-metrics-strip"');

      // 1. Facturación Potencial: $100.000
      expect(html).toContain("Facturación Potencial");
      expect(clean).toMatch(/\$100[.,]000/);

      // 2. Cobranza Efectiva: $80.000 (80.0%)
      expect(html).toContain("Cobranza Efectiva");
      expect(clean).toMatch(/\$80[.,]000/);
      expect(clean).toContain("80.0%");

      // 3. Por Cobrar / Deuda: $20.000 (20.0%)
      expect(html).toContain("Por Cobrar / Deuda");
      expect(clean).toMatch(/\$20[.,]000/);
      expect(clean).toContain("20.0%");

      // 4. Mix Canales: 80% Presencial / 20% Online
      expect(html).toContain("Mix Canales");
      expect(clean).toMatch(/80\s*%\s*Presencial/);
    });

    it("GIVEN el componente StudioSankeyView WHEN se renderiza THEN exhibe la barra de filtros interactiva con bullets de color y texto guía", () => {
      const html = renderToString(React.createElement(StudioSankeyView, { initialData: CANONICAL_SANKEY_DATA }));
      const clean = html.replace(/<!-- -->/g, "").replace(/[\u00a0\s]+/g, " ");
      expect(html).toContain('data-testid="sankey-filter-bar"');
      expect(html).toContain("Todos");
      expect(clean).toMatch(/Cobrado\s*\(\$80[.,]000\)/);
      expect(clean).toMatch(/Por Cobrar\s*\(\$20[.,]000\)/);
      expect(clean).toMatch(/Presencial\s*\(\$80[.,]000\)/);
      expect(clean).toMatch(/Online\s*\(\$20[.,]000\)/);
      expect(html).toContain("Haz clic en un nodo o cinta para trazar su flujo");
    });

    it("GIVEN el lienzo SVG de Sankey WHEN se renderiza THEN dibuja los nodos principales y ribbons Bézier sin duplicar tarjetas de texto inferiores", () => {
      const html = renderToString(React.createElement(StudioSankeyView, { initialData: CANONICAL_SANKEY_DATA }));
      expect(html).toContain('data-testid="sankey-node-presencial"');
      expect(html).toContain('data-testid="sankey-node-online"');
      expect(html).toContain('data-testid="sankey-node-potencial"');
      expect(html).toContain('data-testid="sankey-node-cobrado"');
      expect(html).toContain('data-testid="sankey-node-pendiente"');

      // Verifica que no se repita el bloque redundante antiguo 'data-testid="sankey-summary"'
      expect(html).not.toContain('data-testid="sankey-summary"');

      // Verifica enlace directo de acción a Cobros
      expect(html).toContain('href="/studio/cobros"');
      expect(html).toContain("Gestionar Cobros y Deudores");
    });
  });
});
