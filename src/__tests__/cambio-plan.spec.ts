import { describe, expect, it } from "vitest";
import {
  ariaGraficoCargas,
  calcularPuntosGrafico,
  calcularVigenciaPlanesAlumno,
  esSerieValida,
  formatearFechaDashboard,
  obtenerCambiosDePlan,
  obtenerEjerciciosDisponibles,
  obtenerFechasInicioPlanes,
  obtenerVigenciaPlanes,
} from "@/lib/cambio-plan";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import type { PlanEntrenamiento } from "@/types/database.types";

// Fixture helpers con datos inventados (nunca datos reales del export, ADR-005)
function crearEntrada(
  sesionId: string,
  fecha: string,
  plan: { id: string; nombre: string } | null,
  series: {
    ejercicioId: string;
    ejercicioNombre: string;
    pesoKg: number;
    reps: number;
    completada?: boolean;
    setType?: string;
  }[],
): HistoricalLoadEntry {
  return {
    sesion: {
      id: sesionId,
      alumno_id: "alumno-test-1",
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
      completada: s.completada ?? true,
      set_type: (s.setType as any) ?? "NORMAL",
      pain_reported: false,
      pain_notes: null,
      video_url: null,
      created_at: fecha,
      updated_at: fecha,
    })),
  };
}

describe("formatearFechaDashboard (spec §0.2 y §6.5)", () => {
  it("formatea la fecha en formato Dashboard: 'd mmm yyyy'", () => {
    expect(formatearFechaDashboard("2026-09-01T12:00:00Z")).toBe("1 sep 2026");
    expect(formatearFechaDashboard("2025-03-03T12:00:00Z")).toBe("3 mar 2025");
    expect(formatearFechaDashboard("2026-10-15T12:00:00Z")).toBe("15 oct 2026");
  });
});

describe("esSerieValida (spec §0.1)", () => {
  it("valida sólo series completadas, no calentamiento y con al menos 1 rep", () => {
    expect(esSerieValida({ completada: true, reps_hechas: 5, set_type: "NORMAL" })).toBe(true);
    expect(esSerieValida({ completada: false, reps_hechas: 5, set_type: "NORMAL" })).toBe(false);
    expect(esSerieValida({ completada: true, reps_hechas: 5, set_type: "WARMUP" })).toBe(false);
    expect(esSerieValida({ completada: true, reps_hechas: 5, set_type: "W" })).toBe(false);
    expect(esSerieValida({ completada: true, reps_hechas: 0, set_type: "NORMAL" })).toBe(false);
  });
});

describe("Checkpoint 1: Función pura de fechas de inicio de cada plan (vigencia)", () => {
  it("identifica las fechas de inicio de un alumno con 3 planes a lo largo del tiempo", () => {
    const p1 = { id: "p1", nombre: "Fuerza Base" };
    const p2 = { id: "p2", nombre: "Hipertrofia 2" };
    const p3 = { id: "p3", nombre: "Fuerza 3" };

    const historial: HistoricalLoadEntry[] = [
      crearEntrada("s1", "2026-06-01T10:00:00Z", p1, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 60, reps: 8 },
      ]),
      crearEntrada("s2", "2026-06-15T10:00:00Z", p1, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 65, reps: 8 },
      ]),
      crearEntrada("s3", "2026-07-01T10:00:00Z", p2, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 70, reps: 8 },
      ]),
      crearEntrada("s4", "2026-07-20T10:00:00Z", p2, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 75, reps: 6 },
      ]),
      crearEntrada("s5", "2026-09-01T10:00:00Z", p3, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 80, reps: 5 },
      ]),
    ];

    const vigencias = obtenerVigenciaPlanes(historial);

    expect(vigencias).toHaveLength(3);
    expect(vigencias[0]).toEqual({
      planId: "p1",
      nombre: "Fuerza Base",
      fechaInicio: "2026-06-01T10:00:00Z",
      fechaInicioFormateada: "1 jun 2026",
      sesionId: "s1",
      indiceSesion: 0,
    });
    expect(vigencias[1]).toEqual({
      planId: "p2",
      nombre: "Hipertrofia 2",
      fechaInicio: "2026-07-01T10:00:00Z",
      fechaInicioFormateada: "1 jul 2026",
      sesionId: "s3",
      indiceSesion: 2,
    });
    expect(vigencias[2]).toEqual({
      planId: "p3",
      nombre: "Fuerza 3",
      fechaInicio: "2026-09-01T10:00:00Z",
      fechaInicioFormateada: "1 sep 2026",
      sesionId: "s5",
      indiceSesion: 4,
    });

    // El alias exportado da el mismo resultado
    expect(obtenerFechasInicioPlanes(historial)).toEqual(vigencias);
  });

  it("ordena cronológicamente aun si el historial viene en orden descendente", () => {
    const p1 = { id: "p1", nombre: "Fuerza Base" };
    const p2 = { id: "p2", nombre: "Hipertrofia 2" };

    const historialDescendente: HistoricalLoadEntry[] = [
      crearEntrada("s2", "2026-07-01T10:00:00Z", p2, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 70, reps: 8 },
      ]),
      crearEntrada("s1", "2026-06-01T10:00:00Z", p1, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 60, reps: 8 },
      ]),
    ];

    const vigencias = obtenerVigenciaPlanes(historialDescendente);
    expect(vigencias).toHaveLength(2);
    expect(vigencias[0]!.nombre).toBe("Fuerza Base");
    expect(vigencias[1]!.nombre).toBe("Hipertrofia 2");
  });

  it("trata sesiones con dia_id nulo / plan null como 'Sin plan'", () => {
    const p1 = { id: "p1", nombre: "Fuerza Base" };

    const historialConNulo: HistoricalLoadEntry[] = [
      crearEntrada("s1", "2026-05-01T10:00:00Z", p1, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 60, reps: 8 },
      ]),
      crearEntrada("s2", "2026-06-01T10:00:00Z", null, [
        { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: 62, reps: 8 },
      ]),
    ];

    const vigencias = obtenerVigenciaPlanes(historialConNulo);
    expect(vigencias).toHaveLength(2);
    expect(vigencias[0]!.nombre).toBe("Fuerza Base");
    expect(vigencias[1]!.nombre).toBe("Sin plan");
    expect(vigencias[1]!.planId).toBeNull();
  });

  it("calcula vigencia a partir de PlanEntrenamiento[]", () => {
    const planes: PlanEntrenamiento[] = [
      {
        id: "p1",
        nombre: "Fuerza 1",
        alumno_id: "alumno-1",
        profesor_id: "prof-1",
        fecha_inicio: "2026-01-01T12:00:00Z",
        fecha_fin: "2026-03-31T12:00:00Z",
        estado: "INACTIVO",
        comentarios: null,
        created_at: "2026-01-01T12:00:00Z",
        updated_at: "2026-01-01T12:00:00Z",
      },
      {
        id: "p2",
        nombre: "Fuerza 2",
        alumno_id: "alumno-1",
        profesor_id: "prof-1",
        fecha_inicio: "2026-04-01T12:00:00Z",
        fecha_fin: null,
        estado: "ACTIVO",
        comentarios: null,
        created_at: "2026-04-01T12:00:00Z",
        updated_at: "2026-04-01T12:00:00Z",
      },
    ];

    const v = calcularVigenciaPlanesAlumno(planes);
    expect(v).toHaveLength(2);
    expect(v[0]!.fechaInicioFormateada).toBe("1 ene 2026");
    expect(v[1]!.fechaInicioFormateada).toBe("1 abr 2026");
  });
});

describe("obtenerCambiosDePlan (spec §6.3)", () => {
  it("GIVEN 3 planes WHEN se analizan los cambios THEN devuelve exactamente 2 marcas y la primera sesión no genera marca", () => {
    const p1 = { id: "p1", nombre: "Fuerza Base" };
    const p2 = { id: "p2", nombre: "Hipertrofia 2" };
    const p3 = { id: "p3", nombre: "Fuerza 3" };

    const historial: HistoricalLoadEntry[] = [
      crearEntrada("s1", "2026-05-01T10:00:00Z", p1, [{ ejercicioId: "e1", ejercicioNombre: "Sentadilla", pesoKg: 60, reps: 8 }]),
      crearEntrada("s2", "2026-06-01T10:00:00Z", p1, [{ ejercicioId: "e1", ejercicioNombre: "Sentadilla", pesoKg: 65, reps: 8 }]),
      crearEntrada("s3", "2026-07-01T10:00:00Z", p2, [{ ejercicioId: "e1", ejercicioNombre: "Sentadilla", pesoKg: 70, reps: 8 }]),
      crearEntrada("s4", "2026-08-01T10:00:00Z", p2, [{ ejercicioId: "e1", ejercicioNombre: "Sentadilla", pesoKg: 75, reps: 6 }]),
      crearEntrada("s5", "2026-09-01T10:00:00Z", p3, [{ ejercicioId: "e1", ejercicioNombre: "Sentadilla", pesoKg: 80, reps: 5 }]),
    ];

    const cambios = obtenerCambiosDePlan(historial);
    expect(cambios).toHaveLength(2);

    expect(cambios[0]).toEqual({
      sesionId: "s3",
      fecha: "2026-07-01T10:00:00Z",
      fechaFormateada: "1 jul 2026",
      planAnterior: { id: "p1", nombre: "Fuerza Base" },
      planNuevo: { id: "p2", nombre: "Hipertrofia 2" },
      indiceSesion: 2,
    });

    expect(cambios[1]).toEqual({
      sesionId: "s5",
      fecha: "2026-09-01T10:00:00Z",
      fechaFormateada: "1 sep 2026",
      planAnterior: { id: "p2", nombre: "Hipertrofia 2" },
      planNuevo: { id: "p3", nombre: "Fuerza 3" },
      indiceSesion: 4,
    });
  });

  it("detecta cambio hacia y desde 'Sin plan'", () => {
    const p1 = { id: "p1", nombre: "Fuerza Base" };

    const historial: HistoricalLoadEntry[] = [
      crearEntrada("s1", "2026-05-01T10:00:00Z", p1, [{ ejercicioId: "e1", ejercicioNombre: "Sentadilla", pesoKg: 60, reps: 8 }]),
      crearEntrada("s2", "2026-06-01T10:00:00Z", null, [{ ejercicioId: "e1", ejercicioNombre: "Sentadilla", pesoKg: 62, reps: 8 }]),
    ];

    const cambios = obtenerCambiosDePlan(historial);
    expect(cambios).toHaveLength(1);
    expect(cambios[0]!.planAnterior.nombre).toBe("Fuerza Base");
    expect(cambios[0]!.planNuevo.nombre).toBe("Sin plan");
  });
});

describe("obtenerEjerciciosDisponibles (spec §6.3)", () => {
  it("ordena los ejercicios por frecuencia descendente", () => {
    const historial: HistoricalLoadEntry[] = [
      crearEntrada("s1", "2026-05-01T10:00:00Z", null, [
        { ejercicioId: "e-press", ejercicioNombre: "Press banca", pesoKg: 50, reps: 10 },
        { ejercicioId: "e-sent", ejercicioNombre: "Sentadilla", pesoKg: 70, reps: 8 },
      ]),
      crearEntrada("s2", "2026-05-03T10:00:00Z", null, [
        { ejercicioId: "e-sent", ejercicioNombre: "Sentadilla", pesoKg: 72.5, reps: 8 },
      ]),
      crearEntrada("s3", "2026-05-05T10:00:00Z", null, [
        { ejercicioId: "e-sent", ejercicioNombre: "Sentadilla", pesoKg: 75, reps: 8 },
      ]),
    ];

    const disponibles = obtenerEjerciciosDisponibles(historial);
    expect(disponibles).toHaveLength(2);
    expect(disponibles[0]!.id).toBe("e-sent");
    expect(disponibles[0]!.frecuencia).toBe(3);
    expect(disponibles[1]!.id).toBe("e-press");
    expect(disponibles[1]!.frecuencia).toBe(1);
  });
});

describe("calcularPuntosGrafico y marcas visuales (spec §6.4 y §6.7)", () => {
  it("24 sesiones con Sentadilla en 3 planes: 2 líneas punteadas y progresión continua", () => {
    const p1 = { id: "p1", nombre: "Fuerza Base" };
    const p2 = { id: "p2", nombre: "Hipertrofia 2" };
    const p3 = { id: "p3", nombre: "Fuerza 3" };

    const historial: HistoricalLoadEntry[] = [];
    for (let i = 0; i < 24; i++) {
      const plan = i < 8 ? p1 : i < 16 ? p2 : p3;
      const peso = 60 + i * (25 / 23); // De 60 a 85 kg
      historial.push(
        crearEntrada(`s-${i + 1}`, `2026-0${Math.floor(i / 6) + 1}-10T10:00:00Z`, plan, [
          { ejercicioId: "ej-sent", ejercicioNombre: "Sentadilla", pesoKg: Math.round(peso), reps: 6 },
        ]),
      );
    }

    const res = calcularPuntosGrafico(historial, "ej-sent");

    expect(res.puntos).toHaveLength(24);
    expect(res.aPesoCorporal).toBe(false);
    expect(res.unidad).toBe("kg");
    expect(res.minValor).toBe(60);
    expect(res.maxValor).toBe(85);
    expect(res.marcas).toHaveLength(2);

    // Primera marca en la sesión 8 (índice 8)
    expect(res.marcas[0]!.planNuevo).toBe("Hipertrofia 2");
    expect(res.marcas[0]!.indice).toBe(8);
    expect(res.marcas[0]!.x).toBeCloseTo((8 / 23) * 100, 1);

    // Segunda marca en la sesión 16 (índice 16)
    expect(res.marcas[1]!.planNuevo).toBe("Fuerza 3");
    expect(res.marcas[1]!.indice).toBe(16);
    expect(res.marcas[1]!.x).toBeCloseTo((16 / 23) * 100, 1);

    expect(res.etiquetaPrimerPlan).toBe("Fuerza Base");
    expect(res.ariaLabel).toContain("Sentadilla: carga máxima de 60 a 85 kilos en 24 sesiones, 2 cambios de plan");
  });

  it("ejercicio a peso corporal usa reps y cambia unidad", () => {
    const historial: HistoricalLoadEntry[] = [
      crearEntrada("s1", "2026-08-01T10:00:00Z", { id: "p1", nombre: "Calistenia" }, [
        { ejercicioId: "ej-dom", ejercicioNombre: "Dominadas", pesoKg: 0, reps: 6 },
      ]),
      crearEntrada("s2", "2026-08-15T10:00:00Z", { id: "p1", nombre: "Calistenia" }, [
        { ejercicioId: "ej-dom", ejercicioNombre: "Dominadas", pesoKg: 0, reps: 10 },
      ]),
    ];

    const res = calcularPuntosGrafico(historial, "ej-dom");
    expect(res.aPesoCorporal).toBe(true);
    expect(res.unidad).toBe("reps");
    expect(res.minValor).toBe(6);
    expect(res.maxValor).toBe(10);
  });

  it("oculta la etiqueta anterior si dos marcas quedan a menos de 8% de distancia", () => {
    const historial: HistoricalLoadEntry[] = [];
    // 50 sesiones, cambio en sesión 10 y sesión 12 (distancia 2/49 * 100 = ~4.08% < 8%)
    for (let i = 0; i < 50; i++) {
      const plan =
        i < 10
          ? { id: "p1", nombre: "Plan 1" }
          : i < 12
            ? { id: "p2", nombre: "Plan 2" }
            : { id: "p3", nombre: "Plan 3" };
      historial.push(
        crearEntrada(`s-${i}`, `2026-01-01T${String(i).padStart(2, "0")}:00:00Z`, plan, [
          { ejercicioId: "ej-1", ejercicioNombre: "Press", pesoKg: 50, reps: 10 },
        ]),
      );
    }

    const res = calcularPuntosGrafico(historial, "ej-1");
    expect(res.marcas).toHaveLength(2);
    expect(res.marcas[1]!.x - res.marcas[0]!.x).toBeLessThan(8);
    expect(res.marcas[0]!.ocultarEtiqueta).toBe(true);
    expect(res.marcas[1]!.ocultarEtiqueta).toBe(false);
  });
});
