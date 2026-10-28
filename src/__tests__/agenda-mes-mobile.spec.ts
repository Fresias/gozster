import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useClasesStore } from "@/store/use-clases-store";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import { diasDeLaSemana, claveDia } from "@/lib/clases";
import { ClassAgendaMonth } from "@/components/coach/class-agenda-month";
import { ClassAgendaMobile } from "@/components/coach/class-agenda-mobile";
import { ClassAgendaTable } from "@/components/coach/class-agenda-table";
import { ClaseBlock } from "@/components/coach/clase-block";
import { AthleteClasses } from "@/components/athlete/athlete-classes";
import type { Clase, Reserva } from "@/types/database.types";

describe("GOZS-190 / GOZS-193 · Agenda: vista Mes y adaptación mobile", () => {
  beforeEach(() => {
    useWorkspaceModeStore.getState().setMode("TESTEO");
    useClasesStore.getState().resetDemoDataset();
  });

  describe("1. Vista Mes (Sección 7 de la spec)", () => {
    const fechaRef = new Date("2026-10-27T12:00:00-03:00");
    const hoyClave = "2026-10-27";

    const clase1: Clase = {
      id: "c1",
      actividad: "FUNCIONAL",
      inicio: "2026-10-27T10:00:00-03:00",
      duracion_minutos: 60,
      capacidad: 12,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      horario_id: null,
      created_at: "",
      updated_at: "",
    };

    const clase2: Clase = {
      id: "c2",
      actividad: "BOXEO",
      inicio: "2026-10-27T15:00:00-03:00",
      duracion_minutos: 60,
      capacidad: 10,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      horario_id: null,
      created_at: "",
      updated_at: "",
    };

    const clase3: Clase = {
      id: "c3",
      actividad: "FUNCIONAL",
      inicio: "2026-10-27T18:00:00-03:00",
      duracion_minutos: 60,
      capacidad: 12,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      horario_id: null,
      created_at: "",
      updated_at: "",
    };

    const clase4: Clase = {
      id: "c4",
      actividad: "BOXEO",
      inicio: "2026-10-27T20:00:00-03:00",
      duracion_minutos: 60,
      capacidad: 8,
      estado: "PROGRAMADA",
      motivo_cancelacion: null,
      horario_id: null,
      created_at: "",
      updated_at: "",
    };

    it("GIVEN la vista Mes THEN renderiza celdas con hasta 3 chips de clase + '+N más' y hoy en pill", () => {
      const clases = [clase1, clase2, clase3, clase4];
      const html = renderToStaticMarkup(
        React.createElement(ClassAgendaMonth, {
          fechaRef,
          clases,
          reservas: [],
          hoyClave,
          onSelectDia: () => {},
          onSelectClase: () => {},
        })
      );

      // Header de 7 días
      expect(html).toContain("LUN");
      expect(html).toContain("DOM");

      // Celdas de día y hoy en pill
      expect(html).toContain('data-testid="month-today-cell"');
      expect(html).toContain('data-testid="month-today-pill"');
      expect(html).toContain("27");

      // Hasta 3 chips con h-5 y tokens act-*
      expect(html).toContain("h-5");
      expect(html).toContain("bg-act-funcional-bg");
      expect(html).toContain("bg-act-boxeo-bg");
      expect(html).toContain("Funcional");
      expect(html).toContain("Boxeo");

      // 4ta clase queda en chip '+1 más'
      expect(html).toContain('data-testid="month-more-chips"');
      expect(html).toContain("+1 más");
    });
  });

  describe("2. Adaptación Mobile (<1024px) (Sección 10 de la spec)", () => {
    const ahoraMs = new Date("2026-10-27T17:35:00-03:00").getTime();
    const hoy = "2026-10-27";
    const dias = diasDeLaSemana(new Date(ahoraMs));

    it("GIVEN un viewport mobile THEN muestra app bar sticky, segmented Día/Semana/Mes y tira de 7 días con dots", async () => {
      const store = useClasesStore.getState();
      await store.cargarAgenda();

      const html = renderToStaticMarkup(
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
          fechaRef: new Date(ahoraMs),
          onIrHoy: () => {},
          onNavegarSemana: () => {},
        })
      );

      // App bar sticky
      expect(html).toContain("sticky top-0");
      expect(html).toContain('data-testid="mobile-today-btn"');
      expect(html).toContain('data-testid="mobile-search-btn"');

      // Segmented Día / Semana / Mes
      expect(html).toContain('data-testid="view-day-btn"');
      expect(html).toContain('data-testid="view-week-btn"');
      expect(html).toContain('data-testid="view-month-btn"');

      // Tira de 7 días con dots de actividad
      expect(html).toContain('data-testid="mobile-days-strip"');
      expect(html).toContain("bg-sky-500");
      expect(html).toContain("bg-orange-500");

      // Carrusel de stats horizontal con 3 tarjetas min-w-[150px]
      expect(html).toContain("min-w-[150px]");
      expect(html).toContain("cupos libres hoy");
      expect(html).toContain("sobrecupo hoy");
      expect(html).toContain("ocupación sem.");

      // Vista Día por defecto con lista-agenda grid-cols-[48px_1fr]
      expect(html).toContain('data-testid="mobile-day-agenda"');
      expect(html).toContain("grid-cols-[48px_1fr]");

      // Línea de 'ahora' insertada en 17:35
      expect(html).toContain('data-testid="current-time-indicator"');
      expect(html).toContain("17:35");

      // FAB 'Nueva clase' de 56x56px (h-14 w-14)
      expect(html).toContain('data-testid="mobile-create-class-fab"');
      expect(html).toContain("h-14 w-14");
    });

    it("GIVEN vista='semana' en mobile THEN la agenda muestra la lista agrupada por día", async () => {
      const store = useClasesStore.getState();
      await store.cargarAgenda();

      const html = renderToStaticMarkup(
        React.createElement(ClassAgendaMobile, {
          vista: "semana",
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
          fechaRef: new Date(ahoraMs),
          onIrHoy: () => {},
          onNavegarSemana: () => {},
        })
      );

      expect(html).toContain('data-testid="mobile-week-grouped"');
      expect(html).toContain("Lun");
      expect(html).toContain("Mar");
      expect(html).toContain("Mié");
    });

    it("GIVEN vista='mes' en mobile THEN renderiza el contenedor de mes móvil", async () => {
      const store = useClasesStore.getState();
      await store.cargarAgenda();

      const html = renderToStaticMarkup(
        React.createElement(ClassAgendaMobile, {
          vista: "mes",
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
          fechaRef: new Date(ahoraMs),
          onIrHoy: () => {},
          onNavegarSemana: () => {},
        })
      );

      expect(html).toContain('data-testid="mobile-month-container"');
      expect(html).toContain('data-testid="month-today-cell"');
    });

    it("GIVEN la tabla de reservas en mobile THEN se renderiza como lista de tarjetas con targets >= 48px", async () => {
      const store = useClasesStore.getState();
      await store.cargarAgenda();

      const html = renderToStaticMarkup(
        React.createElement(ClassAgendaTable, {
          clases: store.clases,
          reservas: store.agendaReservas,
          onMarcarAusente: () => {},
          onQuitarReserva: () => {},
          onAbrirAnotar: () => {},
        })
      );

      // Bloque móvil de tarjetas
      expect(html).toContain('data-testid="mobile-reservations-cards"');
      expect(html).toContain('data-testid="reservation-mobile-card"');
      // Botón táctil móvil con min-h-[48px]
      expect(html).toContain("min-h-[48px]");
      expect(html).toContain('data-testid="mobile-mark-absent-btn"');
    });
  });

  describe("3. Athlete App (athlete-classes.tsx) reutiliza ClaseBlock y tokens act-*", () => {
    it("GIVEN la pantalla AthleteClasses THEN contiene ClaseBlock y los tokens act-*", () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const athleteSrc = fs.readFileSync(
        path.resolve(__dirname, "../components/athlete/athlete-classes.tsx"),
        "utf-8"
      );

      // Reutiliza ClaseBlock
      expect(athleteSrc).toContain("<ClaseBlock");
      expect(athleteSrc).toContain('variant="relative"');
      // Utiliza los tokens act-*
      expect(athleteSrc).toContain("COLOR_ACTIVIDAD");
      // Mantiene datos requeridos para accesibilidad y flujos de reserva
      expect(athleteSrc).toContain('data-testid="class-booking-card"');
      expect(athleteSrc).toContain('data-testid="class-spots"');
      expect(athleteSrc).toContain('data-testid="class-status"');
    });

    it("ClaseBlock admite variant='relative' para uso en listas y cards", () => {
      const claseTest: Clase = {
        id: "c-rel",
        actividad: "BOXEO",
        inicio: "2026-10-27T19:30:00-03:00",
        duracion_minutos: 60,
        capacidad: 8,
        estado: "PROGRAMADA",
        motivo_cancelacion: null,
        horario_id: null,
        created_at: "",
        updated_at: "",
      };

      const html = renderToStaticMarkup(
        React.createElement(ClaseBlock, {
          clase: claseTest,
          ocupados: 6,
          ahoraMs: new Date("2026-10-27T12:00:00-03:00").getTime(),
          variant: "relative",
          mostrarProgreso: true,
        })
      );

      expect(html).toContain("relative w-full");
      expect(html).not.toContain("absolute left-1 right-1");
      expect(html).toContain("bg-act-boxeo-bg");
      expect(html).toContain("bg-act-boxeo-bar");
      expect(html).toContain("Boxeo");
      expect(html).toContain("19:30 · 6/8");
    });
  });
});
