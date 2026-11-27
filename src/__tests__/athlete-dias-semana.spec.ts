import { describe, expect, it } from "vitest";
import {
  calcularEstadosDias,
  calcularTeTocaHoy,
  esMismoDiaLocal,
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

describe("Día calendario AR tras entrenar: 'Próximo día' vs 'Te toca hoy' (GOZS-908)", () => {
  const dias: DiaRutinaItem[] = [
    { id: "dia-1", orden: 1, nombre: "Día 1", ejerciciosCount: 5 },
    { id: "dia-2", orden: 2, nombre: "Día 2", ejerciciosCount: 6 },
    { id: "dia-3", orden: 3, nombre: "Día 3", ejerciciosCount: 6 },
  ];
  // Jueves 26/11/2026 en America/Argentina/Buenos_Aires (UTC-3).
  const hoyTarde = new Date("2026-11-26T20:00:00-03:00");
  const dia1Hoy: RegistroSesionSimple = { id: "s-1", dia_id: "dia-1", fecha: "2026-11-26T15:00:00-03:00" };

  it("esMismoDiaLocal compara en hora AR y devuelve false ante fechas vacías o inválidas", () => {
    expect(esMismoDiaLocal("2026-11-26T09:00:00-03:00", hoyTarde)).toBe(true);
    expect(esMismoDiaLocal("2026-11-25T23:59:00-03:00", hoyTarde)).toBe(false);
    expect(esMismoDiaLocal(null, hoyTarde)).toBe(false);
    expect(esMismoDiaLocal("", hoyTarde)).toBe(false);
    expect(esMismoDiaLocal("no-es-fecha", hoyTarde)).toBe(false);
  });

  it("(a) sin sesiones hoy → Día 1 'Te toca hoy'", () => {
    const r = calcularEstadosDias({ dias, sesionesSemana: [], fechaReferencia: hoyTarde });
    expect(r.yaEntrenoHoy).toBe(false);
    expect(r.diasConEstado[0]?.estado).toBe("TODAY");
    expect(r.diasConEstado[0]?.subtitulo).toBe("Te toca hoy");
  });

  it("(b) Día 1 completado hoy → Día 2 'NEXT' / 'Próximo día' y Día 1 'Hecho hoy', sin 'Te toca hoy'", () => {
    const r = calcularEstadosDias({ dias, sesionesSemana: [dia1Hoy], fechaReferencia: hoyTarde });
    expect(r.yaEntrenoHoy).toBe(true);
    expect(r.semanaCompleta).toBe(false);
    expect(r.diaHechoHoy?.id).toBe("dia-1");
    expect(r.diaProximo?.id).toBe("dia-2");
    expect(r.diasConEstado[0]).toMatchObject({ estado: "DONE", hechoHoy: true, subtitulo: "Hecho hoy" });
    expect(r.diasConEstado[1]).toMatchObject({ estado: "NEXT", esSiguiente: true, subtitulo: "Próximo día" });
    expect(r.diasConEstado.some((d) => d.subtitulo === "Te toca hoy")).toBe(false);
  });

  it("(c) al día calendario siguiente (00:05 AR) → Día 2 pasa a 'Te toca hoy' y Día 1 'Hecho esta semana'", () => {
    const manana = new Date("2026-11-27T00:05:00-03:00");
    const r = calcularEstadosDias({ dias, sesionesSemana: [dia1Hoy], fechaReferencia: manana });
    expect(r.yaEntrenoHoy).toBe(false);
    expect(r.diasConEstado[0]).toMatchObject({ estado: "DONE", hechoHoy: false });
    expect(r.diasConEstado[0]?.subtitulo).toContain("Hecho esta semana");
    expect(r.diasConEstado[1]).toMatchObject({ estado: "TODAY", subtitulo: "Te toca hoy" });
  });

  it("(d) cambio manual el mismo día en que ya entrenó (doble turno) → 'Hoy'; expira al día siguiente", () => {
    const mismoDia = calcularEstadosDias({
      dias,
      sesionesSemana: [dia1Hoy],
      diaElegidoHoyId: "dia-3",
      diaElegidoFecha: "2026-11-26",
      fechaReferencia: hoyTarde,
    });
    expect(mismoDia.cambioDeDia).toBe(true);
    expect(mismoDia.diaActivoHoy?.id).toBe("dia-3");
    expect(mismoDia.diasConEstado[2]).toMatchObject({ estado: "TODAY", subtitulo: "Hoy" });
    expect(mismoDia.diasConEstado[1]?.estado).toBe("PENDING_SKIPPED");

    const alDiaSiguiente = calcularEstadosDias({
      dias,
      sesionesSemana: [dia1Hoy],
      diaElegidoHoyId: "dia-3",
      diaElegidoFecha: "2026-11-26",
      fechaReferencia: new Date("2026-11-27T00:05:00-03:00"),
    });
    expect(alDiaSiguiente.cambioDeDia).toBe(false);
    expect(alDiaSiguiente.diaActivoHoy?.id).toBe("dia-2");
    expect(alDiaSiguiente.diasConEstado[1]).toMatchObject({ estado: "TODAY", subtitulo: "Te toca hoy" });
  });

  it("(e) semana completa → semanaCompleta y diaProximo = Día 1, sin 'Te toca hoy'", () => {
    const sesiones: RegistroSesionSimple[] = [
      { id: "s-1", dia_id: "dia-1", fecha: "2026-11-23T10:00:00-03:00" },
      { id: "s-2", dia_id: "dia-2", fecha: "2026-11-24T10:00:00-03:00" },
      { id: "s-3", dia_id: "dia-3", fecha: "2026-11-25T10:00:00-03:00" },
    ];
    const r = calcularEstadosDias({ dias, sesionesSemana: sesiones, fechaReferencia: hoyTarde });
    expect(r.semanaCompleta).toBe(true);
    expect(r.diaActivoHoy).toBeNull();
    expect(r.diaProximo?.id).toBe("dia-1");
    expect(r.diasConEstado.every((d) => d.estado === "DONE")).toBe(true);
    expect(r.diasConEstado.some((d) => d.subtitulo === "Te toca hoy")).toBe(false);
  });

  it("(f) 22:30 AR (= 01:30 UTC del día siguiente) sigue siendo el mismo día calendario AR", () => {
    const sesionNoche: RegistroSesionSimple = { id: "s-1", dia_id: "dia-1", fecha: "2026-11-27T01:30:00Z" };
    const r = calcularEstadosDias({
      dias,
      sesionesSemana: [sesionNoche],
      fechaReferencia: new Date("2026-11-27T02:00:00Z"), // 23:00 AR del 26/11
    });
    expect(r.yaEntrenoHoy).toBe(true);
    expect(r.diasConEstado[0]?.subtitulo).toBe("Hecho hoy");
    expect(r.diasConEstado[1]?.estado).toBe("NEXT");
  });
});
