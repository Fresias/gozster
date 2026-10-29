import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
  buildGuardarRutinaPayload,
  resumenPayload,
} from "@/components/coach/routine-builder/routine-builder-modal";

const day = {
  id: "d1",
  nombre: "Día 1",
  orden: 1,
  ejercicios: [
    {
      id: "x1",
      ejercicio_id: "e1",
      nombre: "Sentadilla",
      series: 4,
      repeticiones: "8",
      descanso_segundos: 120,
      rpe_objetivo: 8,
      tempo: "3-0-1-0",
      tempo_activo: true,
      force_rpe_required: true,
      notas: "",
      es_superserie: true,
      grupo_superserie: 1,
      tipo_serie: "DROPSET" as const,
    },
  ],
};

describe("constructor → guardar_rutina", () => {
  it("envía plan_id y el mapeo completo al editar", () => {
    const p = buildGuardarRutinaPayload({ planId: "p1", comoNueva: false, nombre: "R", comentarios: "", days: [day] });
    expect(p.plan_id).toBe("p1");
    expect(p).not.toHaveProperty("como_nueva");
    expect(p.dias[0]!.ejercicios[0]).toMatchObject({
      tempo: "3-0-1-0",
      tempo_activo: true,
      tipo_serie: "DROPSET",
      force_rpe_required: true,
      es_superserie: true,
      grupo_superserie: 1,
    });
  });

  it("como_nueva conserva plan_id (plan_origen_id) y alumno opcional", () => {
    const p = buildGuardarRutinaPayload({ planId: "p1", comoNueva: true, nombre: "R", comentarios: "", alumnoId: "a1", days: [day] });
    expect(p).toMatchObject({ plan_id: "p1", como_nueva: true, alumno_id: "a1" });
  });

  it("el resumen no incluye el payload completo", () => {
    const p = buildGuardarRutinaPayload({ comoNueva: false, nombre: "R", comentarios: "", days: [day] });
    expect(resumenPayload(p)).toEqual({ nombre: "R", dias: 1, ejercicios: 1 });
  });
});
