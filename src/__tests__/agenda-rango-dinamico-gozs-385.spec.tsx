import * as React from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { ClassAgenda } from "@/components/coach/class-agenda";
import { calcularRangoHorarioUtil, claveDia, diasDeLaSemana } from "@/lib/clases";
import { useClasesStore } from "@/store/use-clases-store";
import type { Clase } from "@/types/database.types";

describe("GOZS-385: Coach Studio - Vista de Agenda: Rango Horario Dinámico según Clases Activas", () => {
  const FECHA_DEMO = new Date("2026-11-05T12:00:00-03:00");

  beforeEach(() => {
    useClasesStore.getState().resetDemoDataset(FECHA_DEMO);
  });

  describe("1. Función calcularRangoHorarioUtil (Cálculo dinámico de franja útil)", () => {
    it("GIVEN una lista vacía de clases THEN devuelve rango fallback 07:00 a 21:00 con tieneClases = false", () => {
      const resultado = calcularRangoHorarioUtil([]);
      expect(resultado.tieneClases).toBe(false);
      expect(resultado.horaMin).toBe(7);
      expect(resultado.horaMax).toBe(21);
      expect(resultado.textoLeyenda).toContain("07:00 - 21:00");
    });

    it("GIVEN clases únicamente entre 17:00 y 20:30 THEN acota el rango a 17:00 - 21:00", () => {
      const clases: Array<Pick<Clase, "inicio"> & { duracion_minutos?: number }> = [
        { inicio: "2026-11-05T17:00:00-03:00", duracion_minutos: 60 },
        { inicio: "2026-11-05T18:00:00-03:00", duracion_minutos: 60 },
        { inicio: "2026-11-05T19:30:00-03:00", duracion_minutos: 60 }, // termina 20:30 -> ceil 21
      ];

      const resultado = calcularRangoHorarioUtil(clases);
      expect(resultado.tieneClases).toBe(true);
      expect(resultado.horaMin).toBe(17);
      expect(resultado.horaMax).toBe(21);
      expect(resultado.textoLeyenda).toContain("Mostrando horario con actividad: 17:00 - 21:00");
      expect(resultado.textoLeyenda).toContain("las horas sin clases se ocultan automáticamente");
    });

    it("GIVEN clases con horario matutino agregado a las 09:00 THEN expande automáticamente su límite superior a 09:00", () => {
      const clases: Array<Pick<Clase, "inicio"> & { duracion_minutos?: number }> = [
        { inicio: "2026-11-05T09:00:00-03:00", duracion_minutos: 60 },
        { inicio: "2026-11-05T17:00:00-03:00", duracion_minutos: 60 },
        { inicio: "2026-11-05T19:30:00-03:00", duracion_minutos: 60 },
      ];

      const resultado = calcularRangoHorarioUtil(clases);
      expect(resultado.tieneClases).toBe(true);
      expect(resultado.horaMin).toBe(9);
      expect(resultado.horaMax).toBe(21);
      expect(resultado.textoLeyenda).toContain("Mostrando horario con actividad: 09:00 - 21:00");
    });

    it("GIVEN clases con diferentes duraciones (ej. 45 min y 90 min) THEN calcula finH correctamente redondeando hacia arriba", () => {
      const clases: Array<Pick<Clase, "inicio"> & { duracion_minutos?: number }> = [
        { inicio: "2026-11-05T18:15:00-03:00", duracion_minutos: 45 }, // termina 19:00 -> ceil 19
        { inicio: "2026-11-05T19:00:00-03:00", duracion_minutos: 90 }, // termina 20:30 -> ceil 21
      ];

      const resultado = calcularRangoHorarioUtil(clases);
      expect(resultado.horaMin).toBe(18);
      expect(resultado.horaMax).toBe(21);
    });
  });

  describe("2. Renderizado del Componente ClassAgenda y Criterios Gherkin", () => {
    it("GIVEN una semana con clases programadas únicamente entre 17:00 y 20:30 WHEN el coach accede a /studio/agenda THEN la grilla acota su eje vertical a 17:00-21:00 y oculta las horas muertas de mañana", () => {
      // El dataset demo tiene clases entre 17:00 y 19:30 (fin 20:30)
      const html = renderToString(<ClassAgenda />);

      // Horarios presentes en el eje vertical
      expect(html).toContain("17:00");
      expect(html).toContain("18:00");
      expect(html).toContain("19:00");
      expect(html).toContain("20:00");

      // Horarios de mañana y madrugada ocultos (no deben aparecer en los slots horarios)
      expect(html).not.toContain("07:00");
      expect(html).not.toContain("08:00");
      expect(html).not.toContain("09:00");
      expect(html).not.toContain("10:00");
      expect(html).not.toContain("11:00");
      expect(html).not.toContain("12:00");

      // Leyenda informativa presente en el pie de la tarjeta
      expect(html).toContain("agenda-rango-dinamico-leyenda");
      expect(html).toContain("Mostrando horario con actividad: 17:00 - 21:00");
      expect(html).toContain("las horas sin clases se ocultan automáticamente");
    });

    it("GIVEN un día con clases agregadas en horario matutino (ej. 09:00) THEN la grilla expande automáticamente su límite superior para incluir 09:00", () => {
      const store = useClasesStore.getState();
      const dias = diasDeLaSemana(FECHA_DEMO);
      const claseManana: Clase = {
        id: "clase-test-matutina-09",
        horario_id: "demo-horario-test-09",
        actividad: "FUNCIONAL",
        inicio: `${dias[1]?.clave}T09:00:00-03:00`,
        duracion_minutos: 60,
        capacidad: null,
        estado: "PROGRAMADA",
        motivo_cancelacion: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      useClasesStore.setState({
        clases: [...store.clases, claseManana],
      });

      const html = renderToString(<ClassAgenda />);

      // Ahora el eje vertical incluye las 09:00
      expect(html).toContain("09:00");
      expect(html).toContain("Mostrando horario con actividad: 09:00 - 21:00");
    });

    it("GIVEN el control de semana WHEN se navega a la semana siguiente sin clases THEN el rango dinámico se recalcula", () => {
      // Si la semana no tiene clases, recalcula al rango fallback
      useClasesStore.setState({
        clases: [], // simula semana sin clases
      });

      const html = renderToString(<ClassAgenda />);
      expect(html).toContain("agenda-rango-dinamico-leyenda");
      expect(html).toContain("Sin clases programadas · Mostrando horario general: 07:00 - 21:00");
    });

    it("GIVEN los controles de cabecera THEN expone el selector de semana y navegación temporal accesible", () => {
      const html = renderToString(<ClassAgenda />);

      // Grupo de navegación temporal y selector de semana
      expect(html).toContain('data-testid="week-selector"');
      expect(html).toContain('data-testid="today-btn"');
      expect(html).toContain('data-testid="prev-week-btn"');
      expect(html).toContain('data-testid="next-week-btn"');

      // Botón Hoy accesible
      expect(html).toContain('aria-label="Ir a la fecha de hoy"');

      // Flechas con aria-label
      expect(html).toContain('aria-label="Semana anterior"');
      expect(html).toContain('aria-label="Semana siguiente"');
    });
  });
});
