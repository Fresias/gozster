import { describe, expect, it } from "vitest";
import {
  incrementoKg,
  motivoSugerencia,
  parseObjetivo,
  sugerirCarga,
  tituloSugerencia,
  type Prescripcion,
} from "@/lib/sugerencia-carga";
import type { UltimaVezEjercicio } from "@/lib/historial-ejercicio";

// Datos inventados (nunca datos reales del export, ADR-005).
const uuid = "11111111-1111-4111-8111-111111111111";
const ultima = (series: UltimaVezEjercicio["series"]): UltimaVezEjercicio => ({
  ejercicio_id: uuid,
  fecha: "2026-10-12T13:00:00Z",
  series,
});
const presc = (p: Partial<Prescripcion>): Prescripcion => ({
  numeroSerie: 1,
  repeticionesObjetivo: "8",
  seriesPrescriptas: 1,
  musculosPrincipales: [],
  ...p,
});

describe("parseObjetivo (§2.3.1)", () => {
  it("número solo", () => expect(parseObjetivo("8")).toEqual({ piso: 8, tope: 8 }));
  it("rango con guion / 'a' / en-dash toma piso y tope", () => {
    expect(parseObjetivo("6-8")).toEqual({ piso: 6, tope: 8 });
    expect(parseObjetivo("6 a 8")).toEqual({ piso: 6, tope: 8 });
    expect(parseObjetivo("6–8")).toEqual({ piso: 6, tope: 8 });
  });
  it("texto no numérico → null", () => {
    for (const t of ["AMRAP", "al fallo", "30 s", "", null, undefined]) {
      expect(parseObjetivo(t)).toBeNull();
    }
  });
});

describe("incrementoKg (§2.4)", () => {
  it("tren inferior pesado ≥ 60 kg → +5", () => expect(incrementoKg(80, ["Cuádriceps", "Glúteos"])).toBe(5));
  it("tren inferior liviano < 60 kg → +2,5", () => expect(incrementoKg(40, ["Isquiosurales"])).toBe(2.5));
  it("tren superior ≥ 20 kg → +2,5", () => expect(incrementoKg(60, ["Pectorales"])).toBe(2.5));
  it("liviano < 20 kg → +1", () => expect(incrementoKg(8, ["Deltoides lateral"])).toBe(1));
  it("normaliza tildes/mayúsculas y busca por substring", () => expect(incrementoKg(100, ["ADUCTORES"])).toBe(5));
});

describe("sugerirCarga (§2.3)", () => {
  it("sin historial → null (no se muestra el bloque)", () => {
    expect(sugerirCarga(null, presc({}))).toBeNull();
    expect(sugerirCarga(undefined, presc({}))).toBeNull();
  });

  it("completó todas las reps → subir con incremento y reps al piso del rango", () => {
    // AC §2.8: Sentadilla, objetivo 6-8, 4 series, última vez 4×80×8 → Subí a 85, reps 6.
    const s = sugerirCarga(
      ultima([
        { numero_serie: 1, peso_kg: 80, reps_hechas: 8, rpe_real: null },
        { numero_serie: 2, peso_kg: 80, reps_hechas: 8, rpe_real: null },
        { numero_serie: 3, peso_kg: 80, reps_hechas: 8, rpe_real: null },
        { numero_serie: 4, peso_kg: 80, reps_hechas: 8, rpe_real: null },
      ]),
      presc({ repeticionesObjetivo: "6-8", seriesPrescriptas: 4, musculosPrincipales: ["Cuádriceps", "Glúteos"] }),
    );
    expect(s).toMatchObject({ tipo: "subir", motivo: "completo", pesoSugerido: 85, repsSugeridas: 6, esPesoCorporal: false });
    expect(tituloSugerencia(s!)).toBe("Subí a 85 kg");
    expect(motivoSugerencia(s!)).toBe("La última vez completaste todas las reps.");
  });

  it("redondea a 0,5 kg y usa salto chico en aislamiento liviano", () => {
    // AC §2.8: Elevaciones laterales 8 kg × 12 (objetivo 10-12) → 9 kg.
    const s = sugerirCarga(
      ultima([
        { numero_serie: 1, peso_kg: 8, reps_hechas: 12, rpe_real: null },
        { numero_serie: 2, peso_kg: 8, reps_hechas: 12, rpe_real: null },
      ]),
      presc({ repeticionesObjetivo: "10-12", seriesPrescriptas: 2, musculosPrincipales: ["Deltoides lateral"] }),
    );
    expect(s).toMatchObject({ tipo: "subir", pesoSugerido: 9, repsSugeridas: 10 });
  });

  it("no completó las reps → repetir con el mismo peso", () => {
    // AC §2.8: Press de banca 60×8,8,7 (objetivo 8) → Repetí 60 kg.
    const s = sugerirCarga(
      ultima([
        { numero_serie: 1, peso_kg: 60, reps_hechas: 8, rpe_real: null },
        { numero_serie: 2, peso_kg: 60, reps_hechas: 8, rpe_real: null },
        { numero_serie: 3, peso_kg: 60, reps_hechas: 7, rpe_real: null },
      ]),
      presc({ numeroSerie: 1, repeticionesObjetivo: "8", seriesPrescriptas: 3, musculosPrincipales: ["Pectorales"] }),
    );
    expect(s).toMatchObject({ tipo: "repetir", motivo: "incompleto", pesoSugerido: 60 });
    expect(tituloSugerencia(s!)).toBe("Repetí 60 kg");
    expect(motivoSugerencia(s!)).toBe("La última vez quedaron reps sin completar. Primero completalas con este peso.");
  });

  it("peso corporal → progresa en reps y nunca 0 kg", () => {
    // AC §2.8: Dominadas 3×10 (objetivo 10) → Probá 11 reps.
    const s = sugerirCarga(
      ultima([
        { numero_serie: 1, peso_kg: 0, reps_hechas: 10, rpe_real: null },
        { numero_serie: 2, peso_kg: 0, reps_hechas: 10, rpe_real: null },
        { numero_serie: 3, peso_kg: 0, reps_hechas: 10, rpe_real: null },
      ]),
      presc({ repeticionesObjetivo: "10", seriesPrescriptas: 3, musculosPrincipales: ["Dorsal ancho"] }),
    );
    expect(s).toMatchObject({ tipo: "subir", motivo: "completo", pesoSugerido: 0, repsSugeridas: 11, esPesoCorporal: true });
    expect(tituloSugerencia(s!)).toBe("Probá 11 reps");
  });

  it("completó reps pero fue al límite de RPE → repetir por RPE (con y sin sigla)", () => {
    const s = sugerirCarga(
      ultima([
        { numero_serie: 1, peso_kg: 80, reps_hechas: 8, rpe_real: 10 },
        { numero_serie: 2, peso_kg: 80, reps_hechas: 8, rpe_real: 9.5 },
      ]),
      presc({ repeticionesObjetivo: "8", seriesPrescriptas: 2, musculosPrincipales: ["Pectorales"] }),
    );
    expect(s).toMatchObject({ tipo: "repetir", motivo: "rpe-limite", pesoSugerido: 80, rpe: 10 });
    expect(tituloSugerencia(s!)).toBe("Repetí 80 kg");
    expect(motivoSugerencia(s!, "TECNICA")).toBe("La última vez fue al límite (RPE 10). Repetí y buscá más control.");
    expect(motivoSugerencia(s!, "SIMPLE")).toBe("La última vez fue al límite. Repetí y buscá más control.");
  });

  it("sin objetivo numérico → repetir 'mismo peso'", () => {
    const s = sugerirCarga(
      ultima([{ numero_serie: 1, peso_kg: 80, reps_hechas: 12, rpe_real: null }]),
      presc({ repeticionesObjetivo: "AMRAP", seriesPrescriptas: 1 }),
    );
    expect(s).toMatchObject({ tipo: "repetir", motivo: "mismo-peso", pesoSugerido: 80, repsSugeridas: 12 });
    expect(motivoSugerencia(s!)).toBe("Mismo peso que la última vez.");
  });

  it("drop set nunca progresa aunque haya completado", () => {
    const s = sugerirCarga(
      ultima([{ numero_serie: 1, peso_kg: 80, reps_hechas: 8, rpe_real: null }]),
      presc({ repeticionesObjetivo: "8", seriesPrescriptas: 1, setType: "DROPSET" }),
    );
    expect(s).toMatchObject({ tipo: "repetir", motivo: "mismo-peso", pesoSugerido: 80 });
  });

  it("si hoy va por una serie que la última vez no hizo, usa la última serie válida", () => {
    const s = sugerirCarga(
      ultima([
        { numero_serie: 1, peso_kg: 80, reps_hechas: 6, rpe_real: null },
        { numero_serie: 2, peso_kg: 82.5, reps_hechas: 4, rpe_real: null },
      ]),
      presc({ numeroSerie: 4, repeticionesObjetivo: "6-8", seriesPrescriptas: 4, musculosPrincipales: ["Pectorales"] }),
    );
    // No completó (2 < 4 series y 4 < 8 reps) → repetir con el peso de la serie de referencia (la 2).
    expect(s).toMatchObject({ tipo: "repetir", motivo: "incompleto", pesoSugerido: 82.5 });
  });
});
