import { beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AgendaResumenPanel } from "@/components/coach/agenda-resumen-panel";
import { AgendaReservasTable } from "@/components/coach/agenda-reservas-table";
import type { Clase } from "@/types/database.types";
import type { ReservaAgenda } from "@/store/use-clases-store";
import { semanaEnCurso } from "@/lib/clases";

const readSource = (relPath: string) =>
  fs.readFileSync(path.resolve(__dirname, relPath), "utf-8");

const mockClases: Clase[] = [
  {
    id: "clase-1",
    horario_id: null,
    actividad: "FUNCIONAL",
    inicio: "2026-10-26T18:00:00-03:00",
    duracion_minutos: 60,
    capacidad: 10,
    estado: "PROGRAMADA",
    motivo_cancelacion: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: "clase-2",
    horario_id: null,
    actividad: "BOXEO",
    inicio: "2026-10-27T19:00:00-03:00",
    duracion_minutos: 60,
    capacidad: 6,
    estado: "PROGRAMADA",
    motivo_cancelacion: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: "clase-3",
    horario_id: null,
    actividad: "FUNCIONAL",
    inicio: "2026-10-28T10:00:00-03:00",
    duracion_minutos: 60,
    capacidad: 4,
    estado: "CANCELADA",
    motivo_cancelacion: "Corte de agua",
    created_at: "",
    updated_at: "",
  },
];

const mockReservas: ReservaAgenda[] = [
  {
    id: "res-1",
    clase_id: "clase-1",
    alumno_id: "al-1",
    alumno_nombre: "Valentina Gómez",
    estado: "ANOTADO",
    created_at: "",
    updated_at: "",
  },
  {
    id: "res-2",
    clase_id: "clase-1",
    alumno_id: "al-2",
    alumno_nombre: "Joaquín Díaz",
    estado: "AUSENTE",
    created_at: "",
    updated_at: "",
  },
  {
    id: "res-3",
    clase_id: "clase-2",
    alumno_id: "al-3",
    alumno_nombre: "Sofía Martínez",
    estado: "ANOTADO",
    created_at: "",
    updated_at: "",
  },
  {
    id: "res-4",
    clase_id: "clase-3",
    alumno_id: "al-4",
    alumno_nombre: "Tomás Rossi",
    estado: "CANCELADO",
    created_at: "",
    updated_at: "",
  },
];

describe("GOZS-190 / GOZS-192 · Shell, Panel de Resumen y Tabla de Reservas", () => {
  describe("1. Sección 3 · Layout Desktop y Studio Shell", () => {
    const shellSource = readSource("../components/coach/studio-shell.tsx");

    it("el sidebar desktop mide 248 px (lg:grid-cols-[248px_1fr])", () => {
      expect(shellSource).toContain("lg:grid-cols-[248px_1fr]");
      expect(shellSource).not.toContain("lg:grid-cols-[280px_1fr]");
    });

    it("la navegación agrupa secciones con etiquetas: Principal, Administración, Atleta", () => {
      expect(shellSource).toContain("Principal");
      expect(shellSource).toContain("Administración");
      expect(shellSource).toContain("Atleta");
      expect(shellSource).toContain("uppercase tracking-[0.08em] text-muted-foreground");
    });

    it("los ítems de navegación tienen altura h-10, radio rounded-lg y estado activo bg-muted font-semibold", () => {
      expect(shellSource).toContain("h-10");
      expect(shellSource).toContain("rounded-lg");
      expect(shellSource).toContain("bg-muted font-semibold text-foreground");
      expect(shellSource).toContain("text-primary");
    });

    it("se removió el subtítulo 'Executive Workspace • M3 Edition'", () => {
      expect(shellSource).not.toContain("Executive Workspace • M3 Edition");
    });

    it("el modo noche pasa al pie del sidebar como switch con ThemeToggle", () => {
      expect(shellSource).toContain("Modo noche");
      expect(shellSource).toContain("<ThemeToggle");
    });

    it("la top bar incluye título, buscador w-72 h-9, ayuda, notificaciones y CTA Nueva clase (h-9 bg-primary)", () => {
      expect(shellSource).toContain("w-72 h-9");
      expect(shellSource).toContain('aria-label="Ayuda"');
      expect(shellSource).toContain('aria-label="Notificaciones"');
      expect(shellSource).toContain("Nueva clase");
      expect(shellSource).toContain("h-9");
      expect(shellSource).toContain("bg-primary");
      expect(shellSource).toContain('data-testid="topbar-create-class-btn"');
    });
  });

  describe("2. Sección 8 · Panel 'Resumen de la semana'", () => {
    const refDate = new Date("2026-10-27T12:00:00-03:00");
    const { inicio, fin } = semanaEnCurso(refDate);

    it("renderiza las 6 métricas y la leyenda de colores al pie", () => {
      const html = renderToStaticMarkup(
        React.createElement(AgendaResumenPanel, {
          vista: "semana",
          clases: mockClases,
          agendaReservas: mockReservas,
          rangoInicio: inicio,
          rangoFin: fin,
          ahoraMs: refDate.getTime(),
        }),
      );

      // 1. Clases programadas y desglose
      expect(html).toContain("clases programadas");
      expect(html).toContain("Funcional");
      expect(html).toContain("Boxeo");

      // 2. Ocupación
      expect(html).toContain("% de ocupación");

      // 3. Cupos libres hoy
      expect(html).toContain("cupos libres hoy");

      // 4. Clases con sobrecupo
      expect(html).toContain("clases con sobrecupo");

      // 5. Ausentes
      expect(html).toContain("ausente");

      // 6. Canceladas
      expect(html).toContain("cancelada");

      // Referencias y leyenda al pie
      expect(html).toContain("Referencias");
      expect(html).toContain("10/12 = anotados / cupo");
    });

    it("se recalcula según la vista activa Día / Semana / Mes", () => {
      const diaInicio = new Date("2026-10-26T00:00:00-03:00");
      const diaFin = new Date("2026-10-26T23:59:59.999-03:00");

      const htmlDia = renderToStaticMarkup(
        React.createElement(AgendaResumenPanel, {
          vista: "dia",
          clases: mockClases,
          agendaReservas: mockReservas,
          rangoInicio: diaInicio,
          rangoFin: diaFin,
          ahoraMs: diaInicio.getTime(),
        }),
      );

      expect(htmlDia).toContain("Resumen del día");
      expect(htmlDia).toContain("1 clase programada");

      const htmlMes = renderToStaticMarkup(
        React.createElement(AgendaResumenPanel, {
          vista: "mes",
          clases: mockClases,
          agendaReservas: mockReservas,
          rangoInicio: new Date("2026-10-01T00:00:00-03:00"),
          rangoFin: new Date("2026-10-31T23:59:59.999-03:00"),
          ahoraMs: refDate.getTime(),
        }),
      );

      expect(htmlMes).toContain("Resumen del mes");
    });
  });

  describe("3. Sección 9 · Tabla 'Reservas de la semana'", () => {
    const tableSource = readSource("../components/coach/agenda-reservas-table.tsx");

    it("utiliza la especificación Shadcn Table", () => {
      expect(tableSource).toContain("Table");
      expect(tableSource).toContain("TableHeader");
      expect(tableSource).toContain("TableBody");
      expect(tableSource).toContain("TableRow");
      expect(tableSource).toContain("TableHead");
      expect(tableSource).toContain("TableCell");
      expect(tableSource).toContain("h-12");
      expect(tableSource).toContain("hover:bg-muted/50");
    });

    it("define las opciones del menú de acciones ⋯: Marcar ausente, Quitar de la clase y Ver alumno", () => {
      expect(tableSource).toContain("Marcar ausente");
      expect(tableSource).toContain("Quitar de la clase");
      expect(tableSource).toContain("Ver alumno");
    });

    it("renderiza columnas completas, badges y filas de alumnos", () => {
      const html = renderToStaticMarkup(
        React.createElement(AgendaReservasTable, {
          vista: "semana",
          reservas: mockReservas,
          clases: mockClases,
          todasReservas: mockReservas,
          onMarcarAusente: () => {},
          onQuitarReserva: () => {},
          onVerAlumno: () => {},
          onAnotarAlumno: () => {},
          isOnline: true,
          isTestMode: false,
          ahoraMs: new Date("2026-10-27T12:00:00-03:00").getTime(),
        }),
      );

      // Cabecera y filtros
      expect(html).toContain("Reservas de la semana");
      expect(html).toContain("Todas");
      expect(html).toContain("Confirmadas");
      expect(html).toContain("Ausentes");
      expect(html).toContain("Canceladas");
      expect(html).toContain("Buscar alumno…");
      expect(html).toContain("Filtros");

      // Badges
      expect(html).toContain("Confirmada");
      expect(html).toContain("Ausente");
      expect(html).toContain("Cancelada");

      // Filas con alumnos y clases
      expect(html).toContain("Valentina Gómez");
      expect(html).toContain("Joaquín Díaz");
      expect(html).toContain("Funcional");
      expect(html).toContain("Boxeo");

      // Menú ⋯
      expect(html).toContain("⋯");
    });

    it("muestra estado vacío con CTA 'Anotar alumno' cuando no hay reservas", () => {
      const htmlEmpty = renderToStaticMarkup(
        React.createElement(AgendaReservasTable, {
          vista: "semana",
          reservas: [],
          clases: mockClases,
          todasReservas: [],
          onMarcarAusente: () => {},
          onQuitarReserva: () => {},
          onVerAlumno: () => {},
          onAnotarAlumno: () => {},
          isOnline: true,
          isTestMode: false,
          ahoraMs: Date.now(),
        }),
      );

      expect(htmlEmpty).toContain("Sin reservas esta semana");
      expect(htmlEmpty).toContain("Anotar alumno");
    });
  });

  describe("4. Criterio de sincronización y navegación", () => {
    const agendaSource = readSource("../components/coach/class-agenda.tsx");

    it("GIVEN el coach cambia de vista o navega con Hoy y las flechas THEN se sincronizan el rango, panel y tabla", () => {
      expect(agendaSource).toContain("irAHoy");
      expect(agendaSource).toContain("irAnterior");
      expect(agendaSource).toContain("irSiguiente");
      expect(agendaSource).toContain('data-testid="agenda-today-btn"');
      expect(agendaSource).toContain('data-testid="agenda-prev-btn"');
      expect(agendaSource).toContain('data-testid="agenda-next-btn"');
      expect(agendaSource).toContain("rangoVisible");
      expect(agendaSource).toContain("AgendaResumenPanel");
      expect(agendaSource).toContain("AgendaReservasTable");
    });

    it("soporta atajos de teclado para Hoy (T), navegar (←/→) y cambiar de vista (D/S/M)", () => {
      expect(agendaSource).toContain('e.key === "t"');
      expect(agendaSource).toContain('e.key === "ArrowLeft"');
      expect(agendaSource).toContain('e.key === "ArrowRight"');
      expect(agendaSource).toContain('e.key === "d"');
      expect(agendaSource).toContain('e.key === "s"');
      expect(agendaSource).toContain('e.key === "m"');
    });

    it("el cuerpo desktop distribuye grid-cols-[1fr_288px] con calendario a la izquierda y resumen a la derecha", () => {
      expect(agendaSource).toContain("lg:grid-cols-[1fr_288px]");
    });
  });
});
