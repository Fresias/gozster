import { describe, expect, it } from "vitest";
import {
  agregarMiProgreso,
  ariaProgreso,
  ejerciciosPrincipales,
  etiquetaEpley,
  etiquetaValor,
  etiquetaVolumen,
  formatearDelta,
  puntosDeEjercicio,
  sesionesDelMes,
  valorPunto,
  volumenDelMes,
  type EjercicioProgreso,
  type SesionHistorica,
} from "@/lib/mi-progreso";
import type { SerieHistorica } from "@/lib/historial-ejercicio";

// Datos inventados (nunca datos reales del export, ADR-005).
const SENTADILLA = "11111111-1111-4111-8111-111111111111";
const PRESS = "22222222-2222-4222-8222-222222222222";
const DOMINADAS = "33333333-3333-4333-8333-333333333333";
const REMO = "44444444-4444-4444-8444-444444444444";
const CURL = "55555555-5555-4555-8555-555555555555";

const HOY = new Date("2026-10-15T12:00:00-03:00"); // octubre 2026, hora de Buenos Aires

let n = 0;
const serie = (over: Partial<SerieHistorica>): SerieHistorica => ({
  ejercicio_id: SENTADILLA,
  sesion_id: `s${n++}`,
  fecha: "2026-10-10T13:00:00Z",
  numero_serie: 1,
  peso_kg: 80,
  reps_hechas: 5,
  rpe_real: null,
  completada: true,
  set_type: null,
  ...over,
});

describe("sesionesDelMes (spec historial-progreso §4.3)", () => {
  it("cuenta el mes calendario en curso y el mes anterior completo", () => {
    const sesiones: SesionHistorica[] = [
      { id: "a", fecha: "2026-10-01T10:00:00-03:00" },
      { id: "b", fecha: "2026-10-14T10:00:00-03:00" },
      { id: "c", fecha: "2026-09-20T10:00:00-03:00" },
      { id: "d", fecha: "2026-08-20T10:00:00-03:00" }, // ni este ni el anterior
    ];
    expect(sesionesDelMes(sesiones, HOY)).toEqual({ esteMes: 2, mesAnterior: 1 });
  });

  it("cruza el año: en enero el mes anterior es diciembre del año previo", () => {
    const enero = new Date("2026-01-10T12:00:00-03:00");
    const sesiones: SesionHistorica[] = [
      { id: "a", fecha: "2026-01-05T10:00:00-03:00" },
      { id: "b", fecha: "2025-12-31T10:00:00-03:00" },
      { id: "c", fecha: "2025-12-01T10:00:00-03:00" },
    ];
    expect(sesionesDelMes(sesiones, enero)).toEqual({ esteMes: 1, mesAnterior: 2 });
  });

  it("respeta la zona horaria de Buenos Aires en el límite de mes", () => {
    // 2026-11-01T01:00Z = 2026-10-31T22:00 en Buenos Aires: sigue siendo octubre.
    const sesiones: SesionHistorica[] = [{ id: "a", fecha: "2026-11-01T01:00:00Z" }];
    expect(sesionesDelMes(sesiones, HOY)).toEqual({ esteMes: 1, mesAnterior: 0 });
  });
});

describe("volumenDelMes (spec historial-progreso §4.3)", () => {
  it("suma effective_volume_kg solo del mes en curso", () => {
    const sesiones: SesionHistorica[] = [
      { id: "a", fecha: "2026-10-01T10:00:00-03:00", effective_volume_kg: 12000 },
      { id: "b", fecha: "2026-10-14T10:00:00-03:00", effective_volume_kg: 8500 },
      { id: "c", fecha: "2026-09-20T10:00:00-03:00", effective_volume_kg: 9000 },
      { id: "d", fecha: "2026-10-05T10:00:00-03:00" }, // sin volumen: cuenta como 0
    ];
    expect(volumenDelMes(sesiones, HOY)).toBe(20500);
  });
});

describe("ejerciciosPrincipales (spec historial-progreso §4.3)", () => {
  it("ordena por sesiones distintas y toma hasta 4", () => {
    const series: SerieHistorica[] = [
      serie({ ejercicio_id: SENTADILLA, sesion_id: "x1" }),
      serie({ ejercicio_id: SENTADILLA, sesion_id: "x2" }),
      serie({ ejercicio_id: SENTADILLA, sesion_id: "x3" }),
      serie({ ejercicio_id: PRESS, sesion_id: "x1" }),
      serie({ ejercicio_id: PRESS, sesion_id: "x2" }),
      serie({ ejercicio_id: DOMINADAS, sesion_id: "x1" }),
      serie({ ejercicio_id: REMO, sesion_id: "x1" }),
      serie({ ejercicio_id: CURL, sesion_id: "x1" }),
    ];
    expect(ejerciciosPrincipales(series, HOY).slice(0, 2)).toEqual([SENTADILLA, PRESS]);
    expect(ejerciciosPrincipales(series, HOY)).toHaveLength(4);
  });

  it("desempata por mayor peso máximo", () => {
    const series: SerieHistorica[] = [
      serie({ ejercicio_id: PRESS, sesion_id: "x1", peso_kg: 60 }),
      serie({ ejercicio_id: SENTADILLA, sesion_id: "x1", peso_kg: 120 }),
    ];
    // Ambos 1 sesión; gana el de mayor peso máximo.
    expect(ejerciciosPrincipales(series, HOY)[0]).toBe(SENTADILLA);
  });

  it("ignora calentamientos y series no completadas", () => {
    const series: SerieHistorica[] = [
      serie({ ejercicio_id: PRESS, sesion_id: "x1", set_type: "WARMUP" }),
      serie({ ejercicio_id: PRESS, sesion_id: "x2", completada: false }),
      serie({ ejercicio_id: SENTADILLA, sesion_id: "x1" }),
    ];
    expect(ejerciciosPrincipales(series, HOY)).toEqual([SENTADILLA]);
  });

  it("si no hay nada en 90 días, usa los más frecuentes de todo el historial", () => {
    const viejo = "2026-01-01T10:00:00Z"; // > 90 días antes de HOY
    const series: SerieHistorica[] = [
      serie({ ejercicio_id: SENTADILLA, sesion_id: "v1", fecha: viejo }),
      serie({ ejercicio_id: SENTADILLA, sesion_id: "v2", fecha: viejo }),
      serie({ ejercicio_id: PRESS, sesion_id: "v1", fecha: viejo }),
    ];
    expect(ejerciciosPrincipales(series, HOY)).toEqual([SENTADILLA, PRESS]);
  });
});

describe("puntosDeEjercicio (spec historial-progreso §4.3)", () => {
  it("un punto por sesión en orden cronológico, con peso/reps/Epley máximos", () => {
    const series: SerieHistorica[] = [
      serie({ sesion_id: "s2", fecha: "2026-10-10T13:00:00Z", peso_kg: 85, reps_hechas: 5 }),
      serie({ sesion_id: "s2", fecha: "2026-10-10T13:00:00Z", peso_kg: 80, reps_hechas: 8 }),
      serie({ sesion_id: "s1", fecha: "2026-09-10T13:00:00Z", peso_kg: 75, reps_hechas: 6 }),
    ];
    const puntos = puntosDeEjercicio(series, SENTADILLA);
    expect(puntos.map((p) => p.fecha)).toEqual(["2026-09-10T13:00:00Z", "2026-10-10T13:00:00Z"]);
    expect(puntos[1].peso_max_kg).toBe(85);
    expect(puntos[1].reps_max).toBe(8);
    // Epley máx de la sesión 2: max(85*(1+5/30), 80*(1+8/30)).
    expect(puntos[1].epley_max_kg).toBeCloseTo(Math.max(85 * (1 + 5 / 30), 80 * (1 + 8 / 30)), 5);
  });

  it("toma solo las últimas 12 sesiones", () => {
    const series: SerieHistorica[] = Array.from({ length: 15 }, (_, i) =>
      serie({ sesion_id: `s${i}`, fecha: `2026-${String((i % 9) + 1).padStart(2, "0")}-0${(i % 9) + 1}T10:00:00Z` }),
    );
    expect(puntosDeEjercicio(series, SENTADILLA)).toHaveLength(12);
  });

  it("excluye del Epley las series de más de 12 reps", () => {
    const series: SerieHistorica[] = [serie({ sesion_id: "s1", peso_kg: 40, reps_hechas: 20 })];
    expect(puntosDeEjercicio(series, SENTADILLA)[0].epley_max_kg).toBe(0);
  });
});

describe("agregarMiProgreso (spec historial-progreso §4.3)", () => {
  it("arma el modelo completo con nombres y detecta peso corporal", () => {
    const series: SerieHistorica[] = [
      serie({ ejercicio_id: SENTADILLA, sesion_id: "s1", fecha: "2026-09-10T10:00:00Z", peso_kg: 75, reps_hechas: 6 }),
      serie({ ejercicio_id: SENTADILLA, sesion_id: "s2", fecha: "2026-10-10T10:00:00Z", peso_kg: 85, reps_hechas: 5 }),
      serie({ ejercicio_id: DOMINADAS, sesion_id: "s1", fecha: "2026-10-10T10:00:00Z", peso_kg: 0, reps_hechas: 12 }),
    ];
    const sesiones: SesionHistorica[] = [
      { id: "s1", fecha: "2026-09-10T10:00:00Z", effective_volume_kg: 5000 },
      { id: "s2", fecha: "2026-10-10T10:00:00Z", effective_volume_kg: 6000 },
    ];
    const data = agregarMiProgreso(series, sesiones, { [SENTADILLA]: "Sentadilla", [DOMINADAS]: "Dominadas" }, HOY);
    expect(data.sesiones_mes).toBe(1);
    expect(data.volumen_mes_kg).toBe(6000);
    const sent = data.ejercicios.find((e) => e.ejercicio_id === SENTADILLA)!;
    expect(sent.nombre).toBe("Sentadilla");
    expect(sent.a_peso_corporal).toBe(false);
    const dom = data.ejercicios.find((e) => e.ejercicio_id === DOMINADAS)!;
    expect(dom.a_peso_corporal).toBe(true);
  });
});

describe("helpers de presentación (spec historial-progreso §4.3, §4.4, §4.6)", () => {
  const ej = (over: Partial<EjercicioProgreso>): EjercicioProgreso => ({
    ejercicio_id: SENTADILLA,
    nombre: "Sentadilla",
    a_peso_corporal: false,
    puntos: [
      { fecha: "2026-08-10T10:00:00Z", peso_max_kg: 75, reps_max: 6, epley_max_kg: 90 },
      { fecha: "2026-10-10T10:00:00Z", peso_max_kg: 85, reps_max: 5, epley_max_kg: 99 },
    ],
    ...over,
  });

  it("valorPunto usa peso o reps según peso corporal", () => {
    const p = { fecha: "x", peso_max_kg: 85, reps_max: 14, epley_max_kg: 99 };
    expect(valorPunto(p, false)).toBe(85);
    expect(valorPunto(p, true)).toBe(14);
  });

  it("delta positivo: +10 kg desde agosto, signo positivo", () => {
    expect(formatearDelta(ej({}), HOY)).toEqual({ texto: "+10 kg desde agosto", signo: "positivo" });
  });

  it("delta negativo usa el signo menos tipográfico y no es un reto", () => {
    const d = formatearDelta(ej({ puntos: [
      { fecha: "2026-08-10T10:00:00Z", peso_max_kg: 85, reps_max: 5, epley_max_kg: 99 },
      { fecha: "2026-10-10T10:00:00Z", peso_max_kg: 80, reps_max: 5, epley_max_kg: 95 },
    ] }), HOY);
    expect(d).toEqual({ texto: "−5 kg desde agosto", signo: "negativo" });
  });

  it("delta cero: Igual que en agosto", () => {
    const d = formatearDelta(ej({ puntos: [
      { fecha: "2026-08-10T10:00:00Z", peso_max_kg: 80, reps_max: 5, epley_max_kg: 95 },
      { fecha: "2026-10-10T10:00:00Z", peso_max_kg: 80, reps_max: 5, epley_max_kg: 95 },
    ] }), HOY);
    expect(d).toEqual({ texto: "Igual que en agosto", signo: "cero" });
  });

  it("delta agrega el año si el primer punto es de otro año", () => {
    const d = formatearDelta(ej({ puntos: [
      { fecha: "2025-08-10T10:00:00Z", peso_max_kg: 75, reps_max: 6, epley_max_kg: 90 },
      { fecha: "2026-10-10T10:00:00Z", peso_max_kg: 85, reps_max: 5, epley_max_kg: 99 },
    ] }), HOY);
    expect(d?.texto).toBe("+10 kg desde agosto 2025");
  });

  it("delta a peso corporal cuenta reps", () => {
    const d = formatearDelta(ej({ a_peso_corporal: true, puntos: [
      { fecha: "2026-08-10T10:00:00Z", peso_max_kg: 0, reps_max: 10, epley_max_kg: 0 },
      { fecha: "2026-10-10T10:00:00Z", peso_max_kg: 0, reps_max: 14, epley_max_kg: 0 },
    ] }), HOY);
    expect(d?.texto).toBe("+4 reps desde agosto");
  });

  it("delta null con menos de 2 puntos", () => {
    expect(formatearDelta(ej({ puntos: [{ fecha: "x", peso_max_kg: 80, reps_max: 5, epley_max_kg: 95 }] }), HOY)).toBeNull();
  });

  it("aria-label describe el rango", () => {
    expect(ariaProgreso(ej({}))).toBe("Sentadilla: de 75 a 85 kilos en las últimas 2 sesiones");
    expect(ariaProgreso(ej({ a_peso_corporal: true, puntos: [
      { fecha: "2026-08-10T10:00:00Z", peso_max_kg: 0, reps_max: 10, epley_max_kg: 0 },
      { fecha: "2026-10-10T10:00:00Z", peso_max_kg: 0, reps_max: 14, epley_max_kg: 0 },
    ] }))).toBe("Sentadilla: de 10 a 14 repeticiones en las últimas 2 sesiones");
  });

  it("etiquetas de valor, Epley y volumen", () => {
    const p = { fecha: "x", peso_max_kg: 85, reps_max: 14, epley_max_kg: 98.6 };
    expect(etiquetaValor(p, false)).toBe("85 kg");
    expect(etiquetaValor(p, true)).toBe("14 reps");
    expect(etiquetaEpley(p)).toBe("1RM est. 99 kg");
    expect(etiquetaVolumen(42350)).toBe("Volumen del mes: 42.350 kg");
  });
});
