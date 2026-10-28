import { describe, expect, it } from "vitest";
import {
  ariaUltimaVez,
  esSerieValida,
  formatearCarga,
  formatearFechaCorta,
  serieDeReferencia,
  ultimaVezDeEjercicio,
  ultimaVezPorEjercicio,
  type SerieHistorica,
} from "@/lib/historial-ejercicio";

// Datos inventados (nada del export real).
const SENTADILLA = "11111111-1111-4111-8111-111111111111";
const DOMINADAS = "22222222-2222-4222-8222-222222222222";

const serie = (o: Partial<SerieHistorica>): SerieHistorica => ({
  ejercicio_id: SENTADILLA,
  sesion_id: "s-fuerza-base",
  fecha: "2026-10-12T13:00:00Z",
  numero_serie: 1,
  peso_kg: 75,
  reps_hechas: 6,
  rpe_real: null,
  completada: true,
  set_type: "NORMAL",
  ...o,
});

// Plan viejo "Fuerza Base": dos sesiones de Sentadilla; la más reciente es la del 12/10.
const historial: SerieHistorica[] = [
  serie({ sesion_id: "s-vieja", fecha: "2026-10-05T13:00:00Z", numero_serie: 1, peso_kg: 70 }),
  serie({ sesion_id: "s-vieja", fecha: "2026-10-05T13:00:00Z", numero_serie: 2, peso_kg: 72.5 }),
  serie({ numero_serie: 0, peso_kg: 40, reps_hechas: 10, set_type: "WARMUP" }),
  serie({ numero_serie: 1, peso_kg: 77.5 }),
  serie({ numero_serie: 2, peso_kg: 80 }),
  serie({ numero_serie: 3, peso_kg: 82.5, reps_hechas: 4, rpe_real: 9 }),
];

describe("esSerieValida (§0.1)", () => {
  it("descarta no completadas, calentamiento y series sin reps", () => {
    expect(esSerieValida(serie({}))).toBe(true);
    expect(esSerieValida(serie({ completada: false }))).toBe(false);
    expect(esSerieValida(serie({ set_type: "WARMUP" }))).toBe(false);
    expect(esSerieValida(serie({ set_type: "W" }))).toBe(false);
    expect(esSerieValida(serie({ reps_hechas: 0 }))).toBe(false);
    expect(esSerieValida(serie({ atipica: true }))).toBe(false);
  });
});

describe("ultimaVezDeEjercicio", () => {
  it("devuelve la sesión más reciente con sus series válidas, ordenadas", () => {
    const u = ultimaVezDeEjercicio(historial, SENTADILLA);
    expect(u).toEqual({
      ejercicio_id: SENTADILLA,
      fecha: "2026-10-12T13:00:00Z",
      series: [
        { numero_serie: 1, peso_kg: 77.5, reps_hechas: 6, rpe_real: null },
        { numero_serie: 2, peso_kg: 80, reps_hechas: 6, rpe_real: null },
        { numero_serie: 3, peso_kg: 82.5, reps_hechas: 4, rpe_real: 9 },
      ],
    });
  });

  it("ignora el plan: el historial del plan viejo vale para el nuevo (mismo ejercicio_id)", () => {
    // El plan nuevo "Hipertrofia" solo comparte el ejercicio canónico; no hay filtro por plan ni día.
    expect(ultimaVezDeEjercicio(historial, SENTADILLA)?.fecha).toBe("2026-10-12T13:00:00Z");
  });

  it("solo cuenta sesiones anteriores al inicio de la sesión en curso", () => {
    expect(ultimaVezDeEjercicio(historial, SENTADILLA, "2026-10-12T13:00:00Z")?.fecha).toBe("2026-10-05T13:00:00Z");
    expect(ultimaVezDeEjercicio(historial, SENTADILLA, "2026-10-01T00:00:00Z")).toBeNull();
  });

  it("salta una sesión más reciente que solo tiene calentamiento o series no completadas", () => {
    const conRuido = [
      ...historial,
      serie({ sesion_id: "s-ruido", fecha: "2026-10-20T13:00:00Z", set_type: "WARMUP" }),
      serie({ sesion_id: "s-ruido", fecha: "2026-10-20T13:00:00Z", numero_serie: 2, completada: false }),
    ];
    expect(ultimaVezDeEjercicio(conRuido, SENTADILLA)?.fecha).toBe("2026-10-12T13:00:00Z");
  });

  it("null cuando no hay series válidas de ese ejercicio", () => {
    expect(ultimaVezDeEjercicio(historial, DOMINADAS)).toBeNull();
    expect(ultimaVezDeEjercicio([], SENTADILLA)).toBeNull();
  });

  it("ultimaVezPorEjercicio arma el Record del store con null para los que no tienen historial", () => {
    const r = ultimaVezPorEjercicio(historial, [SENTADILLA, DOMINADAS]);
    expect(Object.keys(r)).toEqual([SENTADILLA, DOMINADAS]);
    expect(r[DOMINADAS]).toBeNull();
    expect(r[SENTADILLA]?.series).toHaveLength(3);
  });
});

describe("serieDeReferencia (§1.3)", () => {
  const u = ultimaVezDeEjercicio(historial, SENTADILLA)!;

  it("usa la serie con el mismo número", () => {
    expect(serieDeReferencia(u, 2)).toMatchObject({ peso_kg: 80, reps_hechas: 6 });
  });

  it("si aquella vez hizo menos series, usa la última que tenga", () => {
    expect(serieDeReferencia(u, 4)).toMatchObject({ numero_serie: 3, peso_kg: 82.5 });
  });
});

describe("formato (§0.2 y §1.5)", () => {
  it("peso × reps con coma decimal y peso corporal solo con reps", () => {
    expect(formatearCarga({ peso_kg: 80, reps_hechas: 6 })).toBe("80 kg × 6");
    expect(formatearCarga({ peso_kg: 82.5, reps_hechas: 4 })).toBe("82,5 kg × 4");
    expect(formatearCarga({ peso_kg: 0, reps_hechas: 12 })).toBe("12 reps");
  });

  it("fecha corta dd/MM en el mismo año y dd/MM/yy en otro, en hora de Buenos Aires", () => {
    const hoy = new Date("2026-10-24T12:00:00Z");
    expect(formatearFechaCorta("2026-10-12T13:00:00Z", hoy)).toBe("12/10");
    expect(formatearFechaCorta("2025-10-12T13:00:00Z", hoy)).toBe("12/10/25");
    // 02:00 UTC del 13 es todavía el 12 a la noche en Argentina (UTC-3).
    expect(formatearFechaCorta("2026-10-13T02:00:00Z", hoy)).toBe("12/10");
  });

  it("aria-label hablado", () => {
    expect(ariaUltimaVez("2026-10-12T13:00:00Z", { peso_kg: 80, reps_hechas: 6 })).toBe(
      "Última vez, 12 de octubre: 80 kilos por 6 repeticiones",
    );
    expect(ariaUltimaVez("2026-10-12T13:00:00Z", { peso_kg: 0, reps_hechas: 12 })).toBe(
      "Última vez, 12 de octubre: 12 repeticiones",
    );
  });
});
