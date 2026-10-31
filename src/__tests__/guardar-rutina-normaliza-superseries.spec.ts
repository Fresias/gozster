import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("GOZS-315: guardar_rutina normaliza superseries inválidas", () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, "../../supabase/migrations/20261030001300_guardar_rutina_normaliza_superseries.sql"),
    "utf-8",
  );

  it("reemplaza guardar_rutina conservando permisos", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.guardar_rutina(p_payload JSONB)");
    expect(sql).toContain("FROM PUBLIC, anon");
    expect(sql).toContain("TO authenticated");
  });

  it("grupo de 1 ejercicio se guarda como ejercicio normal", () => {
    expect(sql).toContain("HAVING count(*) >= 2");
    expect(sql).toContain("= ANY (v_grupos_validos)");
    expect(sql).toContain("CASE WHEN v_es_ss THEN (v_ej ->> 'grupo_superserie')::INTEGER END");
  });

  it("los grupos se acotan por día (se calculan dentro del bucle de cada día)", () => {
    const dia = sql.indexOf("FOR v_dia IN");
    expect(dia).toBeGreaterThan(-1);
    expect(sql.indexOf("INTO v_grupos_validos")).toBeGreaterThan(dia);
    expect(sql.indexOf("INTO v_grupos_validos")).toBeLessThan(sql.indexOf("FOR v_ej IN"));
  });

  it("UPDATE idempotente de datos existentes por (dia_id, grupo)", () => {
    expect(sql).toMatch(/UPDATE public\.ejercicios_en_rutina e\s+SET es_superserie = false, grupo_superserie = NULL/);
    expect(sql).toContain("o.dia_id = e.dia_id");
    expect(sql).toContain(") < 2");
  });

  it("no toca la migración original ni agrega triggers", () => {
    expect(sql).not.toMatch(/CREATE\s+TRIGGER/i);
  });
});
