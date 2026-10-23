import { describe, expect, it } from "vitest";
import {
  calcularEstadosDias,
  calcularTeTocaHoy,
  type DiaRutinaItem,
  type RegistroSesionSimple,
} from "@/lib/athlete-dias";

describe("Cálculo puro de días de rutina y 'Te toca hoy' (GOZS-147)", () => {
  const diasMock: DiaRutinaItem[] = [
    { id: "dia-1", orden: 1, nombre: "Full body", ejerciciosCount: 5 },
    { id: "dia-2", orden: 2, nombre: "Tren inferior", ejerciciosCount: 6 },
    { id: "dia-3", orden: 3, nombre: "Tren superior", ejerciciosCount: 6 },
    { id: "dia-4", orden: 4, nombre: "Movilidad y core", ejerciciosCount: 5 },
  ];

  it("si no hay sesiones esta semana, 'Te toca hoy' es el Día 1", () => {
    const teToca = calcularTeTocaHoy(diasMock, []);
    expect(teToca?.id).toBe("dia-1");

    const resultado = calcularEstadosDias({
      dias: diasMock,
      sesionesSemana: [],
    });

    expect(resultado.diaActivoHoy?.id).toBe("dia-1");
    expect(resultado.diaTeTocaHoy?.id).toBe("dia-1");
    expect(resultado.cambioDeDia).toBe(false);
    expect(resultado.diasHechosCount).toBe(0);
    expect(resultado.totalDias).toBe(4);

    expect(resultado.diasConEstado[0]?.estado).toBe("TODAY");
    expect(resultado.diasConEstado[0]?.subtitulo).toBe("Te toca hoy");
    expect(resultado.diasConEstado[1]?.estado).toBe("PENDING");
  });

  it("al completar el Día 1, 'Te toca hoy' avanza automáticamente al Día 2", () => {
    const sesiones: RegistroSesionSimple[] = [
      { id: "s-1", dia_id: "dia-1" },
    ];

    const teToca = calcularTeTocaHoy(diasMock, ["dia-1"]);
    expect(teToca?.id).toBe("dia-2");

    const resultado = calcularEstadosDias({
      dias: diasMock,
      sesionesSemana: sesiones,
    });

    expect(resultado.diaActivoHoy?.id).toBe("dia-2");
    expect(resultado.diaTeTocaHoy?.id).toBe("dia-2");
    expect(resultado.cambioDeDia).toBe(false);
    expect(resultado.diasHechosCount).toBe(1);

    expect(resultado.diasConEstado[0]?.estado).toBe("DONE");
    expect(resultado.diasConEstado[0]?.subtitulo).toContain("Hecho esta semana");
    expect(resultado.diasConEstado[1]?.estado).toBe("TODAY");
    expect(resultado.diasConEstado[1]?.subtitulo).toBe("Te toca hoy");
    expect(resultado.diasConEstado[2]?.estado).toBe("PENDING");
  });

  it("al cambiar de día (hacer Día 3 en lugar de Día 2), el Día 2 queda pendiente salteado y el Día 3 pasa a Hoy", () => {
    const sesiones: RegistroSesionSimple[] = [
      { id: "s-1", dia_id: "dia-1" },
    ];

    const resultado = calcularEstadosDias({
      dias: diasMock,
      sesionesSemana: sesiones,
      diaElegidoHoyId: "dia-3",
    });

    expect(resultado.cambioDeDia).toBe(true);
    expect(resultado.diaTeTocaHoy?.id).toBe("dia-2"); // El que naturalmente tocaba
    expect(resultado.diaActivoHoy?.id).toBe("dia-3"); // El elegido manualmente

    // Día 1: DONE
    expect(resultado.diasConEstado[0]?.id).toBe("dia-1");
    expect(resultado.diasConEstado[0]?.estado).toBe("DONE");

    // Día 2: PENDING_SKIPPED con la leyenda exacta del mockup
    expect(resultado.diasConEstado[1]?.id).toBe("dia-2");
    expect(resultado.diasConEstado[1]?.estado).toBe("PENDING_SKIPPED");
    expect(resultado.diasConEstado[1]?.subtitulo).toBe("Pendiente · te toca el próximo");

    // Día 3: TODAY con "Hoy"
    expect(resultado.diasConEstado[2]?.id).toBe("dia-3");
    expect(resultado.diasConEstado[2]?.estado).toBe("TODAY");
    expect(resultado.diasConEstado[2]?.subtitulo).toBe("Hoy");

    // Día 4: PENDING normal
    expect(resultado.diasConEstado[3]?.id).toBe("dia-4");
    expect(resultado.diasConEstado[3]?.estado).toBe("PENDING");
  });

  it("al deshacer el cambio (diaElegidoHoyId = null), vuelve al día natural sin perder el estado", () => {
    const sesiones: RegistroSesionSimple[] = [
      { id: "s-1", dia_id: "dia-1" },
    ];

    const resultado = calcularEstadosDias({
      dias: diasMock,
      sesionesSemana: sesiones,
      diaElegidoHoyId: null,
    });

    expect(resultado.cambioDeDia).toBe(false);
    expect(resultado.diaActivoHoy?.id).toBe("dia-2");
    expect(resultado.diasConEstado[1]?.estado).toBe("TODAY");
    expect(resultado.diasConEstado[1]?.subtitulo).toBe("Te toca hoy");
  });

  it("si el alumno intenta elegir un día ya hecho, no lo permite y mantiene el día sugerido", () => {
    const sesiones: RegistroSesionSimple[] = [
      { id: "s-1", dia_id: "dia-1" },
    ];

    const resultado = calcularEstadosDias({
      dias: diasMock,
      sesionesSemana: sesiones,
      diaElegidoHoyId: "dia-1", // Ya hecho
    });

    expect(resultado.cambioDeDia).toBe(false);
    expect(resultado.diaActivoHoy?.id).toBe("dia-2");
  });
});
