import * as React from "react";
import fs from "node:fs";
import path from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it, beforeEach } from "vitest";
import { BusinessKpiStrip } from "@/components/coach/business-kpi-strip";
import {
  StudioSankeyModal,
  CANONICAL_SANKEY_DATA,
} from "@/components/coach/studio-sankey-modal";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { useCobrosStore } from "@/store/use-cobros-store";
import {
  DEMO_GIMNASIO,
  DEMO_KPIS_NEGOCIO,
  DEMO_ALUMNO_ACTIVIDADES,
  DEMO_CONTRATACIONES_CLASES,
} from "@/services/coach-demo-dataset";
import { alumnoTieneActividad, obtenerActividadesAlumno } from "@/lib/alumno-actividades";

const viewSource = fs.readFileSync(
  path.resolve(__dirname, "../components/coach/coach-studio-view.tsx"),
  "utf-8",
);

describe("GOZS-349: Rediseño KPI Ingresos Studio con Diagrama Sankey y Filtros de Actividad en Lista de Alumnos", () => {
  beforeEach(() => {
    useCoachStudioStore.setState({ filtroActividad: "TODAS", currentPage: 1 });
    useCobrosStore.getState().resetDemoDataset();
  });

  describe("Criterio 1: Tarjeta de Ingresos limpia y clara con llamada al flujo Sankey", () => {
    it("GIVEN el dashboard de /studio WHEN el coach visualiza la franja de KPIs THEN la tarjeta de Ingresos se muestra limpia, con monto principal, píldora de a cobrar y llamada a ver el flujo Sankey", () => {
      let clicked = false;
      const html = renderToString(
        React.createElement(BusinessKpiStrip, {
          kpis: DEMO_KPIS_NEGOCIO,
          onIngresosClick: () => {
            clicked = true;
          },
        }),
      );

      // Tarjeta presente como botón interactivo accesible
      expect(html).toContain('data-testid="kpi-ingresos"');
      expect(html).toContain('<button');

      // Monto principal cobrado claro y legible
      expect(html).toContain('data-testid="kpi-ingresos-total"');
      expect(html).toContain("$800.000");

      // Píldora sutil de "A cobrar"
      expect(html).toContain('data-testid="kpi-ingresos-a-cobrar"');
      expect(html).toContain("A cobrar:");
      expect(html).toContain("$195.000");

      // Llamada interactiva al flujo Sankey
      expect(html).toContain("Ver flujo Sankey →");

      // Descompresión visual: ya no contiene el SVG de polyline intrusivo de sparkline
      expect(html).not.toContain("polyline");
    });

    it("CoachStudioView cablea onIngresosClick hacia la vista de ingresos /studio/ingresos", () => {
      expect(viewSource).toContain('router.push("/studio/ingresos")');
      expect(viewSource).toContain("<StudioSankeyModal");
      expect(viewSource).toContain("isOpen={isSankeyModalOpen}");
      expect(viewSource).toContain("onClose={() => setIsSankeyModalOpen(false)}");
    });
  });

  describe("Criterio 2: Modal de Diagrama de Sankey interactivo con flujo de fondos", () => {
    it("GIVEN un clic en la tarjeta de Ingresos WHEN se abre el modal THEN se visualiza Potencial Total ($100.000) bifurcándose en Cobrado ($80.000) y Pendiente ($20.000)", () => {
      const html = renderToString(
        React.createElement(StudioSankeyModal, {
          isOpen: true,
          onClose: () => {},
          data: CANONICAL_SANKEY_DATA,
        }),
      );

      // Modal accesible
      expect(html).toContain('data-testid="sankey-modal"');
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-labelledby="sankey-modal-title"');

      // Diagrama SVG presente
      expect(html).toContain('data-testid="sankey-diagram"');

      // Potencial Total ($100.000)
      expect(html).toContain("Potencial Total");
      expect(html).toContain("$100.000");
      expect(html).toContain('data-testid="sankey-node-potencial"');

      // Bifurcación: Efectivo Cobrado ($80.000)
      expect(html).toContain("Efectivo Cobrado");
      expect(html).toContain("$80.000");
      expect(html).toContain('data-testid="sankey-node-cobrado"');

      // Bifurcación: Potencial Pendiente ($20.000)
      expect(html).toContain("Potencial Pendiente");
      expect(html).toContain("$20.000");
      expect(html).toContain('data-testid="sankey-node-pendiente"');
    });

    it("AND el bloque Cobrado se desagrega en Presencial (Funcional, Boxeo) y Online (Rutinas)", () => {
      const html = renderToString(
        React.createElement(StudioSankeyModal, {
          isOpen: true,
          onClose: () => {},
          data: CANONICAL_SANKEY_DATA,
        }),
      );

      // Desglose en Nodos y Resumen
      expect(html).toContain('data-testid="sankey-node-presencial-funcional"');
      expect(html).toContain('data-testid="sankey-node-presencial-boxeo"');
      expect(html).toContain('data-testid="sankey-node-online-rutinas"');

      // Presencial Funcional ($50.000) y Boxeo ($15.000)
      expect(html).toContain("Presencial");
      expect(html).toContain("Funcional");
      expect(html).toContain("$50.000");
      expect(html).toContain("Boxeo");
      expect(html).toContain("$15.000");

      // Online Rutinas ($15.000)
      expect(html).toContain("Online");
      expect(html).toContain("Rutinas");
    });

    it("AND el bloque Pendiente muestra el desglose de deudores por actividad", () => {
      const html = renderToString(
        React.createElement(StudioSankeyModal, {
          isOpen: true,
          onClose: () => {},
          data: CANONICAL_SANKEY_DATA,
        }),
      );
      const clean = html.replace(/<!--.*?-->/g, "");

      // Desglose de deudores en el diagrama y tabla
      expect(clean).toContain('data-testid="sankey-node-pendiente-funcional"');
      expect(clean).toContain('data-testid="sankey-node-pendiente-boxeo"');
      expect(clean).toContain('data-testid="sankey-node-pendiente-rutinas"');

      // Deudores por actividad
      expect(clean).toContain("Deudores Funcional: $10.000");
      expect(clean).toContain("Deudores Boxeo: $5.000");
      expect(clean).toContain("Deudores Rutinas: $5.000");

      // Nombres de atletas deudores
      expect(clean).toContain("Joaquín Paz");
      expect(clean).toContain("Gonzalo Peralta");
      expect(clean).toContain("Facundo Medina");
    });

    it("no renderiza el modal cuando isOpen es false", () => {
      const html = renderToString(
        React.createElement(StudioSankeyModal, {
          isOpen: false,
          onClose: () => {},
        }),
      );
      expect(html).toBe("");
    });
  });

  describe("Criterio 3: Filtros rápidos por actividad en la tabla inferior de alumnos", () => {
    it("GIVEN la tabla inferior de atletas en /studio WHEN el entrenador visualiza los controles THEN existen los chips para Funcional, Boxeo y Rutina online", () => {
      expect(viewSource).toContain('data-testid="filtro-actividad-chips"');
      expect(viewSource).toContain('data-testid="filtro-actividad-todas"');
      expect(viewSource).toContain('data-testid="filtro-actividad-funcional"');
      expect(viewSource).toContain('data-testid="filtro-actividad-boxeo"');
      expect(viewSource).toContain('data-testid="filtro-actividad-rutinas"');

      // Botones con sus etiquetas
      expect(viewSource).toMatch(/data-testid="filtro-actividad-todas"[\s\S]*?>\s*Todas\s*<\/button>/);
      expect(viewSource).toMatch(/data-testid="filtro-actividad-funcional"[\s\S]*?>\s*Funcional\s*<\/button>/);
      expect(viewSource).toMatch(/data-testid="filtro-actividad-boxeo"[\s\S]*?>\s*Boxeo\s*<\/button>/);
      expect(viewSource).toMatch(/data-testid="filtro-actividad-rutinas"[\s\S]*?>\s*Rutina online\s*<\/button>/);
    });

    it("WHEN el entrenador pulsa el chip Funcional THEN se filtran los alumnos mostrando aquellos con Funcional (incluyendo Sofía Benítez)", () => {
      useCoachStudioStore.getState().setFiltroActividad("FUNCIONAL");
      expect(useCoachStudioStore.getState().filtroActividad).toBe("FUNCIONAL");

      const { alumnos, planes } = DEMO_GIMNASIO;
      const alumnosFuncional = alumnos.filter((a) =>
        alumnoTieneActividad({
          alumnoId: a.id,
          actividad: "FUNCIONAL",
          alumnoActividades: DEMO_ALUMNO_ACTIVIDADES,
          contrataciones: DEMO_CONTRATACIONES_CLASES,
          planes,
          alumno: a,
        }),
      );

      // Alumnos con funcional deben incluir a Sofía Benítez (pase libre)
      const tieneSofia = alumnosFuncional.some((a) => a.nombre_completo.includes("Sofía Benítez"));
      expect(tieneSofia).toBe(true);
      expect(alumnosFuncional.length).toBeGreaterThan(0);

      // Valentina Ríos es solo funcional
      const tieneValentina = alumnosFuncional.some((a) => a.nombre_completo.includes("Valentina Ríos"));
      expect(tieneValentina).toBe(true);

      // Atleta exclusivamente online no debe figurar en Funcional
      const tieneFacundo = alumnosFuncional.some((a) => a.nombre_completo.includes("Facundo Medina"));
      expect(tieneFacundo).toBe(false);
    });

    it("WHEN el entrenador pulsa el chip Boxeo THEN Sofía Benítez sigue visible por tener múltiples actividades simultáneas", () => {
      useCoachStudioStore.getState().setFiltroActividad("BOXEO");
      expect(useCoachStudioStore.getState().filtroActividad).toBe("BOXEO");

      const { alumnos, planes } = DEMO_GIMNASIO;
      const alumnosBoxeo = alumnos.filter((a) =>
        alumnoTieneActividad({
          alumnoId: a.id,
          actividad: "BOXEO",
          alumnoActividades: DEMO_ALUMNO_ACTIVIDADES,
          contrataciones: DEMO_CONTRATACIONES_CLASES,
          planes,
          alumno: a,
        }),
      );

      // Sofía Benítez tiene múltiples actividades (Funcional + Boxeo)
      const sofia = alumnos.find((a) => a.nombre_completo.includes("Sofía Benítez"));
      expect(sofia).toBeDefined();

      const actividadesSofia = obtenerActividadesAlumno({
        alumnoId: sofia!.id,
        alumnoActividades: DEMO_ALUMNO_ACTIVIDADES,
        contrataciones: DEMO_CONTRATACIONES_CLASES,
        planes,
        alumno: sofia,
      });

      expect(actividadesSofia).toContain("FUNCIONAL");
      expect(actividadesSofia).toContain("BOXEO");
      expect(actividadesSofia.length).toBeGreaterThanOrEqual(2);

      expect(alumnosBoxeo.some((a) => a.id === sofia!.id)).toBe(true);

      // Valentina Ríos (solo funcional) no debe figurar en Boxeo
      const tieneValentina = alumnosBoxeo.some((a) => a.nombre_completo.includes("Valentina Ríos"));
      expect(tieneValentina).toBe(false);
    });

    it("WHEN se pulsa 'Rutina online' THEN se filtran atletas con rutinas online", () => {
      useCoachStudioStore.getState().setFiltroActividad("RUTINAS");
      expect(useCoachStudioStore.getState().filtroActividad).toBe("RUTINAS");

      const { alumnos, planes } = DEMO_GIMNASIO;
      const alumnosRutinas = alumnos.filter((a) =>
        alumnoTieneActividad({
          alumnoId: a.id,
          actividad: "RUTINAS",
          alumnoActividades: DEMO_ALUMNO_ACTIVIDADES,
          contrataciones: DEMO_CONTRATACIONES_CLASES,
          planes,
          alumno: a,
        }),
      );

      expect(alumnosRutinas.length).toBeGreaterThan(0);

      // Sofía Benítez es pase libre presencial (Funcional + Boxeo), no rutinas online
      const sofiaEnRutinas = alumnosRutinas.some((a) => a.nombre_completo.includes("Sofía Benítez"));
      expect(sofiaEnRutinas).toBe(false);

      // Facundo Medina tiene rutina online
      const facundoEnRutinas = alumnosRutinas.some((a) => a.nombre_completo.includes("Facundo Medina"));
      expect(facundoEnRutinas).toBe(true);
    });

    it("permite restablecer a 'TODAS' y muestra la totalidad de alumnos", () => {
      useCoachStudioStore.getState().setFiltroActividad("FUNCIONAL");
      expect(useCoachStudioStore.getState().filtroActividad).toBe("FUNCIONAL");

      useCoachStudioStore.getState().setFiltroActividad("TODAS");
      expect(useCoachStudioStore.getState().filtroActividad).toBe("TODAS");
      expect(useCoachStudioStore.getState().currentPage).toBe(1);
    });
  });
});
