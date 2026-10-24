import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  HistoricalLoadsDrawer,
  type HistoricalLoadsDrawerProps,
} from "@/components/coach/historical-loads-drawer";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import type { Perfil } from "@/types/database.types";

const html = (props: HistoricalLoadsDrawerProps) =>
  renderToStaticMarkup(createElement(HistoricalLoadsDrawer, props));
const texto = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// Fixture helpers con datos inventados (ADR-005)
const ALUMNO_MOCK: Perfil = {
  id: "alumno-lucas-1",
  email: "lucas.gimenez@test.com",
  nombre_completo: "Lucas Giménez",
  rol: "ALUMNO",
  estado_membresia: "ACTIVE",
  profesor_asignado_id: "prof-1",
  fecha_baja: null,
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

function crearEntrada(
  sesionId: string,
  fecha: string,
  plan: { id: string; nombre: string } | null,
  series: {
    ejercicioId: string;
    ejercicioNombre: string;
    pesoKg: number;
    reps: number;
  }[],
): HistoricalLoadEntry {
  return {
    sesion: {
      id: sesionId,
      alumno_id: ALUMNO_MOCK.id,
      dia_id: plan ? `dia-${plan.id}` : null,
      fecha,
      dia_sugerido_id: null,
      motivo_cambio_dia: null,
      volumen_total_kg: 1000,
      duracion_minutos: 60,
      created_at: fecha,
      updated_at: fecha,
    },
    plan,
    series: series.map((s, idx) => ({
      id: `${sesionId}-s${idx + 1}`,
      sesion_id: sesionId,
      ejercicio_id: s.ejercicioId,
      ejercicioNombre: s.ejercicioNombre,
      numero_serie: idx + 1,
      peso_kg: s.pesoKg,
      reps_hechas: s.reps,
      rpe_real: 8,
      completada: true,
      set_type: "NORMAL",
      pain_reported: false,
      pain_notes: null,
      video_url: null,
      created_at: fecha,
      updated_at: fecha,
    })),
  };
}

describe("Checkpoint 2: Componente HistoricalLoadsDrawer con marcas de cambio de plan", () => {
  it("GIVEN 24 sesiones con Sentadilla en 3 planes WHEN el coach abre el drawer THEN el gráfico muestra 2 líneas punteadas y 2 separadores", () => {
    const p1 = { id: "p1", nombre: "Fuerza Base" };
    const p2 = { id: "p2", nombre: "Hipertrofia 2" };
    const p3 = { id: "p3", nombre: "Fuerza 3" };

    // Construir 24 sesiones cronológicas (8 por plan) y presentarlas newest-first
    const cronologico: HistoricalLoadEntry[] = [];
    for (let i = 0; i < 24; i++) {
      const plan = i < 8 ? p1 : i < 16 ? p2 : p3;
      const mes = Math.floor(i / 8) + 6;
      const dia = (i % 8) * 3 + 1;
      const fecha = `2026-0${mes}-${String(dia).padStart(2, "0")}T10:00:00Z`;
      cronologico.push(
        crearEntrada(`ses-${i + 1}`, fecha, plan, [
          { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 60 + i, reps: 6 },
        ]),
      );
    }

    // El drawer recibe la lista newest first
    const historialNewestFirst = [...cronologico].reverse();

    const h = html({
      isOpen: true,
      onClose: () => {},
      alumno: ALUMNO_MOCK,
      historial: historialNewestFirst,
    });
    const t = texto(h);

    // Header y título
    expect(t).toContain("Cargas y RPE Históricos");
    expect(t).toContain("Atleta: Lucas Giménez");

    // Gráfico y selector
    expect(t).toContain("CARGA MÁXIMA POR SESIÓN [kg]");
    expect(h).toContain('aria-label="Ejercicio del gráfico"');

    // 2 líneas punteadas de cambio de plan en el gráfico
    const lineas = h.match(/data-testid="cambio-plan-linea"/g);
    expect(lineas).toHaveLength(2);
    expect(h).toContain('stroke-dasharray="2 2"');

    // Nombres de los planes en las etiquetas del gráfico
    expect(t).toContain("Fuerza Base");
    expect(t).toContain("Hipertrofia 2");
    expect(t).toContain("Fuerza 3");

    // Accesibilidad: svg con role img y aria-label
    expect(h).toContain('role="img"');
    expect(h).toContain("carga máxima de 60 a 83 kilos en 24 sesiones, 2 cambios de plan");

    // Pie del gráfico con INDEC
    expect(t).toContain("83 kg máx · 24 sesiones");
    expect(t).toContain("Fuente: Registro GOZSter");

    // 2 separadores en la lista
    const separadores = h.match(/data-testid="cambio-plan-separador"/g);
    expect(separadores).toHaveLength(2);
    expect(t).toContain("Cambio de plan: Fuerza Base → Hipertrofia 2");
    expect(t).toContain("Cambio de plan: Hipertrofia 2 → Fuerza 3");
  });

  it("GIVEN Dominadas a peso corporal THEN el título dice [reps] y el pie muestra reps máx", () => {
    const historial: HistoricalLoadEntry[] = [
      crearEntrada("s2", "2026-09-02T10:00:00Z", { id: "p1", nombre: "Calistenia" }, [
        { ejercicioId: "ej-dom", ejercicioNombre: "Dominadas", pesoKg: 0, reps: 12 },
      ]),
      crearEntrada("s1", "2026-09-01T10:00:00Z", { id: "p1", nombre: "Calistenia" }, [
        { ejercicioId: "ej-dom", ejercicioNombre: "Dominadas", pesoKg: 0, reps: 8 },
      ]),
    ];

    const h = html({
      isOpen: true,
      onClose: () => {},
      alumno: ALUMNO_MOCK,
      historial,
    });
    const t = texto(h);

    expect(t).toContain("CARGA MÁXIMA POR SESIÓN [reps]");
    expect(t).toContain("12 reps máx · 2 sesiones");
  });

  it("GIVEN sesiones sin dia_id en el medio THEN aparece 'Sin plan' como un plan más", () => {
    const p1 = { id: "p1", nombre: "Fuerza Base" };

    const historial: HistoricalLoadEntry[] = [
      crearEntrada("s3", "2026-09-03T10:00:00Z", p1, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 75, reps: 5 },
      ]),
      crearEntrada("s2", "2026-09-02T10:00:00Z", null, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 70, reps: 5 },
      ]),
      crearEntrada("s1", "2026-09-01T10:00:00Z", p1, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 65, reps: 5 },
      ]),
    ];

    const h = html({
      isOpen: true,
      onClose: () => {},
      alumno: ALUMNO_MOCK,
      historial,
    });
    const t = texto(h);

    // Hay 2 cambios: Fuerza Base → Sin plan, y Sin plan → Fuerza Base
    expect(t).toContain("Cambio de plan: Fuerza Base → Sin plan");
    expect(t).toContain("Cambio de plan: Sin plan → Fuerza Base");
  });

  it("GIVEN un solo plan en todo el historial THEN gráfico sin marcas y sin separadores en la lista", () => {
    const p1 = { id: "p1", nombre: "Fuerza Base" };

    const historial: HistoricalLoadEntry[] = [
      crearEntrada("s2", "2026-09-02T10:00:00Z", p1, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 70, reps: 5 },
      ]),
      crearEntrada("s1", "2026-09-01T10:00:00Z", p1, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 65, reps: 5 },
      ]),
    ];

    const h = html({
      isOpen: true,
      onClose: () => {},
      alumno: ALUMNO_MOCK,
      historial,
    });
    const t = texto(h);

    expect(h).not.toContain('data-testid="cambio-plan-linea"');
    expect(h).not.toContain('data-testid="cambio-plan-separador"');
    expect(t).toContain("Fuerza Base");
  });

  it("GIVEN ejercicio con 1 sola sesión THEN mensaje de con 2 sesiones se dibuja evolución", () => {
    const historial: HistoricalLoadEntry[] = [
      crearEntrada("s1", "2026-09-01T10:00:00Z", { id: "p1", nombre: "Fuerza Base" }, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 65, reps: 5 },
      ]),
    ];

    const h = html({
      isOpen: true,
      onClose: () => {},
      alumno: ALUMNO_MOCK,
      historial,
    });
    const t = texto(h);

    expect(t).toContain("Con 2 sesiones de este ejercicio se dibuja la evolución.");
    expect(h).not.toContain("<polyline");
  });

  it("GIVEN sin historial THEN sin gráfico y mantiene el vacío actual", () => {
    const h = html({
      isOpen: true,
      onClose: () => {},
      alumno: ALUMNO_MOCK,
      historial: [],
    });
    const t = texto(h);

    expect(t).toContain("No hay registros de cargas previas para este alumno.");
    expect(t).not.toContain("CARGA MÁXIMA POR SESIÓN");
  });

  it("GIVEN cargando (historial undefined) THEN muestra el esqueleto", () => {
    const h = html({
      isOpen: true,
      onClose: () => {},
      alumno: ALUMNO_MOCK,
      historial: undefined,
    });

    expect(h).toContain('data-testid="cargas-historicas-skeleton"');
  });
});
