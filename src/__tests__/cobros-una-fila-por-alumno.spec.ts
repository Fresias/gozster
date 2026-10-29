import { describe, expect, it } from "vitest";
import { ultimaSuscripcionPorAlumno, type CobroItem } from "@/store/use-cobros-store";

const base = {
  alumnoNombre: "A",
  alumnoEmail: "a@x.com",
  alumnoTelefono: null,
  servicioNombre: "Plan",
  actividad: null,
  monto: 1000,
  diaVencimiento: 10,
  estado: "PENDIENTE",
} as const;

const cobro = (id: string, alumnoId: string, fechaVencimiento: string): CobroItem => ({
  ...base,
  id,
  alumnoId,
  contratacionId: id,
  fechaVencimiento,
});

describe("ultimaSuscripcionPorAlumno (GOZS-257)", () => {
  it("deja una sola fila por alumno con el mayor vencimiento", () => {
    const res = ultimaSuscripcionPorAlumno([
      cobro("c1", "a1", "2026-08-10"),
      cobro("c2", "a1", "2026-10-10"),
      cobro("c3", "a2", "2026-09-10"),
    ]);
    expect(res.map((r) => r.id).sort()).toEqual(["c2", "c3"]);
  });
});
