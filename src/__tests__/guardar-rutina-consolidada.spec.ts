import { readdirSync, readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const DIR = "supabase/migrations";
const definiciones = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) => /CREATE OR REPLACE FUNCTION public\.guardar_rutina\(/.test(readFileSync(`${DIR}/${f}`, "utf8")));
const final = readFileSync(`${DIR}/${definiciones[definiciones.length - 1]}`, "utf8");

describe("guardar_rutina final (GOZS-324)", () => {
  it("la última definición acumula las 5 reglas", () => {
    expect(definiciones[definiciones.length - 1]).toBe("20261030001700_guardar_rutina_estado_borrador.sql");
    expect(final).toContain("v_grupos_validos"); // GOZS-315 superseries
    expect(final).toContain("fecha_fin = now()"); // GOZS-317 archiva la anterior
    expect(final).toContain("ERRCODE = 'GZ011'"); // GOZS-318 conflicto optimista
    expect(final).toContain("WHEN check_violation"); // GOZS-323 mensajes humanos
    expect(final).toContain("COALESCE(v_estado_pedido, 'BORRADOR')"); // GOZS-308 plantilla nace BORRADOR
  });

  it("plan de alumno: nuevo nace BORRADOR, versión nueva hereda el estado", () => {
    expect(final).toContain("WHEN v_plan_id IS NOT NULL THEN v_plan.estado::TEXT");
    expect(final).toMatch(/WHEN v_plan_id IS NOT NULL THEN v_plan\.estado::TEXT\s+ELSE 'BORRADOR'/);
    expect(final).not.toContain("THEN 'ACTIVO' ELSE");
  });

  it("solo acepta BORRADOR o ACTIVO en el payload", () => {
    expect(final).toContain("NOT IN ('BORRADOR', 'ACTIVO')");
  });

  it("el conflicto de versión se evalúa antes de escribir", () => {
    expect(final.indexOf("GZ011")).toBeLessThan(final.indexOf("DELETE FROM public.dias_rutina"));
  });
});
