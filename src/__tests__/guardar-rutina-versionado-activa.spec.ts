import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("GOZS-317: versionado activa la nueva y archiva la anterior", () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/migrations/20261030001400_guardar_rutina_versionado_activa.sql"),
    "utf-8",
  );

  it("reemplaza guardar_rutina conservando permisos y la normalización de GOZS-315", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.guardar_rutina(p_payload JSONB)");
    expect(sql).toContain("FROM PUBLIC, anon");
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("grupo_superserie");
  });

  it("la versión nueva hereda el estado de la anterior", () => {
    expect(sql).toContain("WHEN v_plan_id IS NOT NULL THEN v_plan.estado");
    expect(sql).not.toContain("'BORRADOR' END::public.estado_plan");
  });

  it("si la anterior estaba ACTIVO la archiva antes de insertar (un solo ACTIVO por alumno)", () => {
    const archiva = sql.indexOf("SET estado = 'INACTIVO', fecha_fin = now()");
    const inserta = sql.indexOf("INSERT INTO public.planes_entrenamiento");
    expect(archiva).toBeGreaterThan(-1);
    expect(archiva).toBeLessThan(inserta);
    expect(sql).toContain("v_plan.estado = 'ACTIVO'");
  });

  it("no toca el historial de sesiones", () => {
    expect(sql).not.toMatch(/(UPDATE|DELETE FROM)\s+public\.registro_(sesiones|series)/);
  });
});
