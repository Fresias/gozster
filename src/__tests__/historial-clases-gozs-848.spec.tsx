import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistorialClases } from "@/components/athlete/historial-clases";
import { AthleteClasses } from "@/components/athlete/athlete-classes";
import type { AsistenciaClaseItem } from "@/lib/clases";

const asistencia: AsistenciaClaseItem = {
  reserva_id: "r1",
  clase_id: "c1",
  actividad: "FUNCIONAL",
  inicio: "2026-11-20T12:00:00.000Z",
  sensacion: null,
  nota: null,
};

describe("GOZS-848 Historial de clases", () => {
  it("GIVEN asistencias WHEN se renderiza THEN muestra la sección por semana", () => {
    const html = renderToStaticMarkup(<HistorialClases asistencias={[asistencia]} />);
    expect(html).toContain('data-testid="historial-clases-section"');
    expect(html).toContain("Historial de clases");
    expect(html).toContain('data-testid="historial-clase-item"');
  });

  it("GIVEN sin asistencias THEN no renderiza nada", () => {
    expect(renderToStaticMarkup(<HistorialClases asistencias={[]} />)).toBe("");
  });

  it("la leyenda de Clases ya no usa 'seleccionado'", () => {
    const html = renderToStaticMarkup(<AthleteClasses />);
    expect(html).not.toContain("seleccionado");
    expect(html).toContain("día elegido");
    expect(html).toContain("hoy");
  });
});
