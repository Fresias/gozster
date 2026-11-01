import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("GOZS-331: asignar_rutina_a_alumno acepta p_nombre opcional", () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/migrations/20261031230000_asignar_rutina_nombre_opcional.sql"),
    "utf8"
  );

  it("reemplaza la firma vieja y agrega p_nombre TEXT DEFAULT NULL", () => {
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.asignar_rutina_a_alumno\(UUID, UUID\)/);
    expect(sql).toMatch(/p_nombre TEXT DEFAULT NULL/);
  });

  it("usa p_nombre si viene y el de la plantilla si no", () => {
    expect(sql).toMatch(/COALESCE\(NULLIF\(btrim\(p_nombre\), ''\), v_origen\.nombre\)/);
  });

  it("mantiene SECURITY DEFINER y los GRANT solo a authenticated", () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.asignar_rutina_a_alumno\(UUID, UUID, TEXT\) FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.asignar_rutina_a_alumno\(UUID, UUID, TEXT\) TO authenticated/);
  });
});
