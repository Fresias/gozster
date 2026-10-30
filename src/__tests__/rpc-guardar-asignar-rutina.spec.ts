import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("GOZS-291: RPCs guardar_rutina y asignar_rutina_a_alumno", () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/migrations/20261029130000_rpc_guardar_asignar_rutina.sql"),
    "utf-8",
  );

  it("rechaza actualizar en el lugar si hay sesiones y pide guardar como nueva versión", () => {
    expect(sql).toContain("JOIN public.dias_rutina d ON d.id = s.dia_id");
    expect(sql).toContain("guárdala como nueva versión");
  });

  it("actualiza el mismo plan_id y crea la copia con plan_origen_id", () => {
    expect(sql).toContain("UPDATE public.planes_entrenamiento");
    expect(sql).toContain("v_plan_id,");
  });

  it("errores humanos en español y ejercicio inválido aborta toda la transacción", () => {
    expect(sql).toContain("el ejercicio ya no existe en el catálogo");
    expect(sql).toContain("WHEN foreign_key_violation");
  });

  it("asignar deja la ACTIVA anterior INACTIVO con fecha_fin = fecha_inicio de la nueva", () => {
    expect(sql).toContain("SET estado = 'INACTIVO', fecha_fin = v_ahora");
    expect(sql).toContain("fecha_inicio = v_ahora");
    expect(sql).toContain("clonar_plan_entrenamiento(p_plan_id");
  });

  it("restringe a entrenadores de sus alumnos y expone solo a authenticated", () => {
    expect(sql).toContain("es_entrenador_de(p_alumno_id)");
    expect(sql).toContain("FROM PUBLIC, anon");
    expect(sql).not.toMatch(/USING\s*\(\s*true\s*\)/i);
  });

  it("índice único parcial de un ACTIVO por alumno", () => {
    expect(sql).toContain("(alumno_id)");
    expect(sql).toContain("WHERE estado = 'ACTIVO'");
  });

  it("nunca borra planes", () => {
    expect(sql).not.toMatch(/DELETE FROM public\.planes_entrenamiento/);
  });
});
