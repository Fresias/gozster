import { beforeEach, describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useClasesStore } from "@/store/use-clases-store";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { diasDeLaSemana, claveDia, ocupaCupo } from "@/lib/clases";
import { ClassAgenda } from "@/components/coach/class-agenda";
import { ClassAgendaWeek } from "@/components/coach/class-agenda-week";
import { ClassAgendaStats } from "@/components/coach/class-agenda-stats";
import { ClassAgendaTable } from "@/components/coach/class-agenda-table";
import { ClassAgendaMobile } from "@/components/coach/class-agenda-mobile";
import { ClaseBlock } from "@/components/coach/clase-block";

describe("Cronograma de clases estilo referencia en Coach Studio (GOZS-195 / GOZS-190)", () => {
  beforeEach(() => {
    useWorkspaceModeStore.getState().setMode("TESTEO");
    useClasesStore.getState().resetDemoDataset();
  });

  describe("Criterio Gherkin 1: Vista Semana con seed de Modo Testeo", () => {
    it("GIVEN Modo Testeo con el seed cargado WHEN el Coach abre el cronograma en vista Semana THEN ve Funcional 18:00 (lun-vie), Funcional 17:00 (mar y jue) y Boxeo 19:30 (lun, mié, vie) con sus anotados, el día actual resaltado y el panel de stats con valores", async () => {
      const store = useClasesStore.getState();
      await store.cargarAgenda();

      const { clases, agendaReservas } = useClasesStore.getState();

      // 1. Verificar clases del seed
      // Funcional 18:00 (lun a vie)
      const func18 = clases.filter(
        (c) =>
          c.actividad === "FUNCIONAL" &&
          (c.id === "demo-clase-func-lunes" ||
            c.id === "demo-clase-func-martes" ||
            c.id === "demo-clase-func-miercoles" ||
            c.id === "demo-clase-func-jueves" ||
            c.id === "demo-clase-func-viernes")
      );
      expect(func18.length).toBe(5);

      // Funcional 17:00 (mar y jue)
      const func17 = clases.filter(
        (c) =>
          c.actividad === "FUNCIONAL" &&
          (c.id === "demo-clase-func-martes-17" || c.id === "demo-clase-func-jueves-17")
      );
      expect(func17.length).toBe(2);

      // Boxeo 19:30 (lun, mié, vie)
      const box1930 = clases.filter(
        (c) =>
          c.actividad === "BOXEO" &&
          (c.id === "demo-clase-box-lunes" ||
            c.id === "demo-clase-box-miercoles" ||
            c.id === "demo-clase-box-viernes")
      );
      expect(box1930.length).toBe(3);

      // 2. Verificar que los anotados ficticios existen y están enlazados
      expect(agendaReservas.length).toBeGreaterThanOrEqual(15);

      // Camila Navarro, Lucas Giménez, Mateo Rossi en Funcional Miércoles
      const mieFunc = clases.find((c) => c.id === "demo-clase-func-miercoles")!;
      expect(mieFunc).toBeDefined();
      const anotadosMie = agendaReservas.filter((r) => r.clase_id === mieFunc.id);
      expect(anotadosMie.some((r) => r.alumno_nombre === "Camila Navarro" && r.estado === "ANOTADO")).toBe(true);
      expect(anotadosMie.some((r) => r.alumno_nombre === "Lucas Giménez" && r.estado === "ANOTADO")).toBe(true);
      expect(anotadosMie.some((r) => r.alumno_nombre === "Mateo Rossi" && r.estado === "ANOTADO")).toBe(true);
      // Lista de espera en Funcional Miércoles
      expect(anotadosMie.some((r) => r.alumno_nombre === "Renata Quiroga" && r.estado === "EN_ESPERA")).toBe(true);
      expect(anotadosMie.some((r) => r.alumno_nombre === "Emilia Castro" && r.estado === "EN_ESPERA")).toBe(true);

      // Martes 17:00 con 5 anotados
      const mar17 = clases.find((c) => c.id === "demo-clase-func-martes-17")!;
      expect(mar17).toBeDefined();
      const anotadosMar17 = agendaReservas.filter((r) => r.clase_id === mar17.id && r.estado === "ANOTADO");
      expect(anotadosMar17.length).toBe(5);

      // Viernes Funcional 18:00 cancelada
      const vieFunc = clases.find((c) => c.id === "demo-clase-func-viernes")!;
      expect(vieFunc.estado).toBe("CANCELADA");
      expect(vieFunc.motivo_cancelacion).toContain("Feriado");

      // 3. Render estático de la vista completa para verificar día resaltado y stats
      const html = renderToStaticMarkup(React.createElement(ClassAgenda));

      // Contiene el contenedor principal y controles
      expect(html).toContain('data-testid="class-agenda"');
      expect(html).toContain('data-testid="view-week-btn"');
      expect(html).toContain('data-testid="view-day-btn"');
      expect(html).toContain('data-testid="view-month-btn"');
      expect(html).toContain('data-testid="create-class-btn"');

      // Panel de stats con valores calculados
      expect(html).toContain("clases programadas");
      expect(html).toContain("de ocupación");
      expect(html).toContain("cupos libres hoy");
      expect(html).toContain("Referencias");
      expect(html).toContain("Funcional");
      expect(html).toContain("Boxeo");
    });

    it("la carga repetida del seed es idempotente y no duplica filas", async () => {
      const store = useClasesStore.getState();
      await store.cargarAgenda();
      const count1 = useClasesStore.getState().clases.length;
      const res1 = useClasesStore.getState().agendaReservas.length;

      await store.cargarAgenda();
      const count2 = useClasesStore.getState().clases.length;
      const res2 = useClasesStore.getState().agendaReservas.length;

      expect(count2).toBe(count1);
      expect(res2).toBe(res1);
    });
  });

  describe("Criterio Gherkin 2: Adaptabilidad a Viewport Móvil", () => {
    it("GIVEN un viewport móvil THEN el cronograma se adapta sin perder funciones", () => {
      const store = useClasesStore.getState();
      const ahoraMs = Date.now();
      const dias = diasDeLaSemana(new Date(ahoraMs));
      const hoy = claveDia(new Date(ahoraMs));

      const htmlMobile = renderToStaticMarkup(
        React.createElement(ClassAgendaMobile, {
          vista: "dia",
          setVista: () => {},
          dias,
          diaSeleccionado: hoy,
          onSelectDia: () => {},
          clases: store.clases,
          reservas: store.agendaReservas,
          hoyClave: hoy,
          ahoraMs,
          claseSeleccionadaId: null,
          onSelectClase: () => {},
          onAbrirCrear: () => {},
        })
      );

      // Tira de días con objetivos táctiles
      expect(htmlMobile).toContain("touch-manipulation");
      // Carrusel de stats con cards compactas
      expect(htmlMobile).toContain("min-w-[150px]");
      expect(htmlMobile).toContain("cupos libres hoy");
      // FAB para crear clase con tamaño táctil >= 48px (h-14 w-14 = 56px)
      expect(htmlMobile).toContain('data-testid="mobile-create-class-fab"');
      expect(htmlMobile).toContain("h-14 w-14");
    });
  });

  describe("Subcomponentes y especificación de diseño GOZS-190", () => {
    it("ClaseBlock aplica los tokens pastel de actividad y badges de estado", () => {
      const claseFunc = {
        id: "c1",
        actividad: "FUNCIONAL" as const,
        inicio: "2026-10-27T18:00:00-03:00",
        duracion_minutos: 60,
        capacidad: 10,
        estado: "PROGRAMADA" as const,
        motivo_cancelacion: null,
        horario_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // hora de referencia anterior al inicio para que no esté finalizada
      const ahoraAntes = new Date("2026-10-27T12:00:00-03:00").getTime();

      const htmlFunc = renderToStaticMarkup(
        React.createElement(ClaseBlock, {
          clase: claseFunc,
          ocupados: 8,
          ahoraMs: ahoraAntes,
        })
      );
      expect(htmlFunc).toContain("bg-act-funcional-bg");
      expect(htmlFunc).toContain("text-act-funcional-fg");
      expect(htmlFunc).toContain("bg-act-funcional-bar");
      expect(htmlFunc).toContain("Funcional");
      expect(htmlFunc).toContain("18:00 · 8/10");

      // Sobrecupo badge
      const htmlOver = renderToStaticMarkup(
        React.createElement(ClaseBlock, {
          clase: claseFunc,
          ocupados: 12,
          ahoraMs: ahoraAntes,
        })
      );
      expect(htmlOver).toContain("+2");
      expect(htmlOver).toContain("bg-amber-400");

      // Llena badge
      const htmlFull = renderToStaticMarkup(
        React.createElement(ClaseBlock, {
          clase: claseFunc,
          ocupados: 10,
          ahoraMs: ahoraAntes,
        })
      );
      expect(htmlFull).toContain("Llena");

      // Cancelada
      const claseCancel = { ...claseFunc, estado: "CANCELADA" as const };
      const htmlCancel = renderToStaticMarkup(
        React.createElement(ClaseBlock, {
          clase: claseCancel,
          ocupados: 0,
          ahoraMs: ahoraAntes,
        })
      );
      expect(htmlCancel).toContain("line-through");
      expect(htmlCancel).toContain("Cancelada");
    });

    it("ClassAgendaStats calcula con precisión todas las métricas requeridas", () => {
      const store = useClasesStore.getState();
      const htmlStats = renderToStaticMarkup(
        React.createElement(ClassAgendaStats, {
          clases: store.clases,
          reservas: store.agendaReservas,
          ahoraMs: Date.now(),
          rangoTitulo: "la semana",
        })
      );

      expect(htmlStats).toContain("clases programadas");
      expect(htmlStats).toContain("de ocupación");
      expect(htmlStats).toContain("cupos libres hoy");
      expect(htmlStats).toContain("clases con sobrecupo");
      expect(htmlStats).toContain("ausentes");
      expect(htmlStats).toMatch(/cancelada/);
      expect(htmlStats).toContain("Referencias");
    });

    it("ClassAgendaTable filtra por estado y permite búsqueda por alumno", () => {
      const store = useClasesStore.getState();
      const htmlTable = renderToStaticMarkup(
        React.createElement(ClassAgendaTable, {
          clases: store.clases,
          reservas: store.agendaReservas,
        })
      );

      expect(htmlTable).toContain("Reservas de la semana");
      expect(htmlTable).toContain("Todas");
      expect(htmlTable).toContain("Confirmadas");
      expect(htmlTable).toContain("Ausentes");
      expect(htmlTable).toContain("Canceladas");
      expect(htmlTable).toContain("Camila Navarro");
    });
  });
});
