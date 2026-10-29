import { describe, expect, it } from "vitest";
import { feriadosDemo } from "@/lib/feriados";

describe("feriadosDemo (GOZS-248)", () => {
  it("GIVEN feriados 2026 WHEN se indexan por dia THEN 25 de mayo existe y no habilita clases", () => {
    const f = feriadosDemo();
    expect(f["2026-05-25"]).toEqual({ nombre: "Día de la Revolución de Mayo", hay_clases: false });
    expect(f["2026-05-26"]).toBeUndefined();
    expect(Object.keys(f)).toHaveLength(19);
  });
});
