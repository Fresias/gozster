import { describe, expect, it } from "vitest";
import {
  agregarSerieAMarcas,
  detalleRecord,
  esNuevoRecord,
  fronteraPareto,
  lineaEpleyRecord,
  marcasDeEjercicio,
  type MarcasEjercicio,
  type ParFrontera,
} from "@/lib/record-ejercicio";
import type { SerieHistorica } from "@/lib/historial-ejercicio";

// Datos inventados (nunca datos reales del export, ADR-005).
const EJ = "22222222-2222-4222-8222-222222222222";

const par = (peso_kg: number, reps_hechas: number, fecha = "2026-10-10T13:00:00Z"): ParFrontera => ({
  peso_kg,
  reps_hechas,
  fecha,
});

// Marcas con la frontera del §3.7: [100×3, 90×6, 80×8].
const marcasAC: MarcasEjercicio = {
  ejercicio_id: EJ,
  frontera: [par(100, 3), par(90, 6), par(80, 8)],
  max_peso_kg: 100,
  max_epley_kg: Math.max(100 * (1 + 3 / 30), 90 * (1 + 6 / 30), 80 * (1 + 8 / 30)),
};

const serie = (peso_kg: number, reps_hechas: number, set_type?: string | null) => ({
  peso_kg,
  reps_hechas,
  set_type,
});

describe("fronteraPareto (§3.3)", () => {
  it("elimina pares dominados en peso y reps", () => {
    const f = fronteraPareto([par(100, 3), par(90, 6), par(80, 8), par(80, 5), par(70, 4)]);
    expect(f.map((p) => [p.peso_kg, p.reps_hechas])).toEqual([
      [100, 3],
      [90, 6],
      [80, 8],
    ]);
  });

  it("un par no se domina a sí mismo y los duplicados exactos colapsan a uno", () => {
    const f = fronteraPareto([par(80, 5), par(80, 5)]);
    expect(f).toHaveLength(1);
  });
});

describe("marcasDeEjercicio (§0.1, §3.3)", () => {
  const base = (over: Partial<SerieHistorica>): SerieHistorica => ({
    ejercicio_id: EJ,
    sesion_id: "s1",
    fecha: "2026-10-01T13:00:00Z",
    numero_serie: 1,
    peso_kg: 80,
    reps_hechas: 6,
    rpe_real: null,
    completada: true,
    set_type: "NORMAL",
    ...over,
  });

  it("primer registro: sin series válidas devuelve null (§3.4.1)", () => {
    expect(marcasDeEjercicio([], EJ)).toBeNull();
    // Series no completadas o de calentamiento no cuentan.
    expect(marcasDeEjercicio([base({ completada: false }), base({ set_type: "WARMUP" })], EJ)).toBeNull();
  });

  it("calcula frontera, max_peso y max_epley ignorando el calentamiento", () => {
    const m = marcasDeEjercicio(
      [base({ peso_kg: 100, reps_hechas: 3 }), base({ peso_kg: 90, reps_hechas: 6 }), base({ peso_kg: 120, reps_hechas: 1, set_type: "W" })],
      EJ,
    );
    expect(m).not.toBeNull();
    expect(m!.max_peso_kg).toBe(100); // 120 era calentamiento
    expect(m!.frontera).toHaveLength(2);
  });

  it("excluye series de otro ejercicio", () => {
    const m = marcasDeEjercicio([base({ ejercicio_id: "otro", peso_kg: 200, reps_hechas: 1 })], EJ);
    expect(m).toBeNull();
  });
});

describe("esNuevoRecord (§3.4, §3.7)", () => {
  it("primer registro: sin historial no hay récord", () => {
    expect(esNuevoRecord(serie(50, 10), null).esRecord).toBe(false);
  });

  it("95 kg × 5 sobre [100×3, 90×6, 80×8] → récord de reps", () => {
    const r = esNuevoRecord(serie(95, 5), marcasAC);
    expect(r.esRecord).toBe(true);
    expect(r.tipo).toBe("reps");
  });

  it("empate: 90 kg × 6 iguala la frontera → no es récord", () => {
    expect(esNuevoRecord(serie(90, 6), marcasAC).esRecord).toBe(false);
  });

  it("102,5 kg × 1 supera el peso máximo → récord de peso", () => {
    const r = esNuevoRecord(serie(102.5, 1), marcasAC);
    expect(r.esRecord).toBe(true);
    expect(r.tipo).toBe("peso");
  });

  it("60 kg × 15 queda bajo el 80% del máximo → no es récord", () => {
    expect(esNuevoRecord(serie(60, 15), marcasAC).esRecord).toBe(false);
  });

  it("peso corporal: más reps que nunca es récord y la regla del 80% no aplica", () => {
    const marcasBW: MarcasEjercicio = {
      ejercicio_id: EJ,
      frontera: [par(0, 12)],
      max_peso_kg: 0,
      max_epley_kg: 0,
    };
    const r = esNuevoRecord(serie(0, 14), marcasBW);
    expect(r.esRecord).toBe(true);
    expect(r.tipo).toBe("reps");
    // Igualar las reps no es récord.
    expect(esNuevoRecord(serie(0, 12), marcasBW).esRecord).toBe(false);
  });

  it("una serie de calentamiento nunca es récord aunque supere la frontera", () => {
    expect(esNuevoRecord(serie(200, 1, "WARMUP"), marcasAC).esRecord).toBe(false);
    expect(esNuevoRecord(serie(200, 1, "W"), marcasAC).esRecord).toBe(false);
  });

  it("DROPSET y FAILURE cuentan como serie efectiva (§3.4.5)", () => {
    expect(esNuevoRecord(serie(105, 2, "DROPSET"), marcasAC).esRecord).toBe(true);
    expect(esNuevoRecord(serie(105, 2, "FAILURE"), marcasAC).esRecord).toBe(true);
  });

  it("expone el 1RM estimado solo cuando lo supera y reps <= 12", () => {
    // 102,5 × 1 = 102,5 Epley, supera el máximo (~110? no): comparar con marcasAC.max_epley.
    const r = esNuevoRecord(serie(110, 2), marcasAC);
    expect(r.esRecord).toBe(true);
    expect(r.epley_kg).not.toBeNull();
    expect(r.delta_epley_kg).toBeGreaterThan(0);
  });
});

describe("agregarSerieAMarcas (§3.3: serie 3 no repite el récord de la serie 2)", () => {
  it("tras registrar 85 × 5 como récord, repetir 85 × 5 ya no es récord", () => {
    const marcas: MarcasEjercicio = {
      ejercicio_id: EJ,
      frontera: [par(80, 5)],
      max_peso_kg: 80,
      max_epley_kg: 80 * (1 + 5 / 30),
    };
    const serie2 = serie(85, 5);
    expect(esNuevoRecord(serie2, marcas).esRecord).toBe(true);

    const actualizadas = agregarSerieAMarcas(marcas, EJ, { ...serie2, fecha: "2026-10-24T13:00:00Z" });
    expect(esNuevoRecord(serie(85, 5), actualizadas).esRecord).toBe(false);
  });

  it("parte de null cuando todavía no había marcas", () => {
    const m = agregarSerieAMarcas(null, EJ, { peso_kg: 50, reps_hechas: 10, fecha: "2026-10-24T13:00:00Z" });
    expect(m.frontera).toHaveLength(1);
    expect(m.max_peso_kg).toBe(50);
  });
});

describe("copy del aviso (§3.5)", () => {
  it("récord de peso usa «tu mejor marca en {ejercicio}»", () => {
    const r = esNuevoRecord(serie(102.5, 1), marcasAC);
    expect(detalleRecord(r, serie(102.5, 1), "Sentadilla")).toBe("102,5 kg × 1 · tu mejor marca en Sentadilla");
  });

  it("récord de reps con peso resalta las reps", () => {
    const r = esNuevoRecord(serie(95, 5), marcasAC);
    expect(detalleRecord(r, serie(95, 5), "Sentadilla")).toBe("95 kg × 5 · nunca hiciste tantas reps con este peso");
  });

  it("récord de peso corporal se cuenta en reps", () => {
    const marcasBW: MarcasEjercicio = { ejercicio_id: EJ, frontera: [par(0, 12)], max_peso_kg: 0, max_epley_kg: 0 };
    const r = esNuevoRecord(serie(0, 14), marcasBW);
    expect(detalleRecord(r, serie(0, 14), "Dominadas")).toBe("14 reps · tu mejor marca en Dominadas");
  });

  it("línea de 1RM solo si hay 1RM; formato «1RM estimado: X kg (+Y kg)»", () => {
    const sinEpley = { esRecord: true, tipo: "reps" as const, epley_kg: null, delta_epley_kg: null };
    expect(lineaEpleyRecord(sinEpley)).toBeNull();
    const conEpley = { esRecord: true, tipo: "peso" as const, epley_kg: 99.2, delta_epley_kg: 3.1 };
    expect(lineaEpleyRecord(conEpley)).toBe("1RM estimado: 99 kg (+3 kg)");
  });
});
