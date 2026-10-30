import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
  RoutineBuilderModal,
  clasificarErrorGuardado,
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

  it("GZ010 muestra el mensaje de la RPC y ofrece nueva versión solo al guardar con sesiones", () => {
    const err = { code: "GZ010", message: "Esta rutina ya tiene sesiones registradas y no se puede modificar" };
    expect(clasificarErrorGuardado(err, "guardar")).toMatchObject({ mensaje: err.message, needsNewVersion: true });
    expect(clasificarErrorGuardado(err, "version").needsNewVersion).toBe(false);
    expect(clasificarErrorGuardado({ code: "GZ010", message: "La rutina necesita un nombre" }, "guardar").needsNewVersion).toBe(false);
  });

  it("GZ011 (conflicto de versión) muestra el mensaje humano y envía la versión solo al editar", () => {
    const err = { code: "GZ011", message: "Esta rutina cambió en otra pestaña o dispositivo. Recarga para ver la última versión" };
    expect(clasificarErrorGuardado(err, "guardar")).toMatchObject({ mensaje: err.message, needsNewVersion: false });
    const base = { comoNueva: false, nombre: "R", comentarios: "", days: [] };
    expect(buildGuardarRutinaPayload({ ...base, planId: "p1", version: "2026-10-30T10:00:00.123456+00:00" })).toMatchObject({
      version: "2026-10-30T10:00:00.123456+00:00",
    });
    expect(buildGuardarRutinaPayload({ ...base, version: "v" })).not.toHaveProperty("version");
  });

  it("otros errores usan el mensaje genérico y conservan el detalle técnico", () => {
    const r = clasificarErrorGuardado({ code: "42501", message: "boom", details: "x" }, "guardar");
    expect(r).toEqual({
      mensaje: "No se pudo guardar la rutina. Intenta de nuevo.",
      needsNewVersion: false,
      detalle: "42501 | boom | x",
    });
    expect(clasificarErrorGuardado(new Error(""), "guardar").detalle).toContain("Error");
  });

  it("la casilla de alumno solo aparece sin planInicial", () => {
    const base = { isOpen: true, onClose: () => {}, alumnoId: "a1", alumnoNombre: "Ana", catalogoEjercicios: [] };
    expect(renderToStaticMarkup(createElement(RoutineBuilderModal, base))).toContain("Nueva para Ana");
    const plan = { id: "p1", nombre: "R", comentarios: null } as never;
    expect(renderToStaticMarkup(createElement(RoutineBuilderModal, { ...base, planInicial: plan }))).not.toContain("Nueva para Ana");
  });
});
