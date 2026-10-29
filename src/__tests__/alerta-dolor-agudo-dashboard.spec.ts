import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("GOZS-237: dolor agudo (>= 7) genera alerta persistente para el coach", () => {
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  const original = fs.readFileSync(path.join(dir, "20261019110000_molestias_red_flags_sustituciones.sql"), "utf-8");
  const fix = fs.readFileSync(path.join(dir, "20261028130000_alerta_dolor_agudo_dashboard.sql"), "utf-8");

  it("reproduce el fallo original: el trigger solo miraba es_sintoma_alarma", () => {
    expect(original).toContain("IF NEW.es_sintoma_alarma = true AND");
    expect(original).not.toContain("severidad = 'AGUDO'");
  });

  it("la nueva migración dispara también con severidad AGUDO (dolor 7-10)", () => {
    expect(fix).toContain("NEW.es_sintoma_alarma = true OR NEW.severidad = 'AGUDO'");
    expect(fix).toContain("AFTER INSERT OR UPDATE OF es_sintoma_alarma, severidad");
  });

  it("crea la alerta PENDIENTE (persiste hasta que el coach la descarte) y rellena reportes perdidos", () => {
    expect(fix).toContain("'DOLOR_ARTICULAR', 'CRITICA'");
    expect(fix).toContain("'PENDIENTE'");
    expect(fix).toContain("WHERE h.severidad = 'AGUDO'");
    expect(fix).toContain("NOT EXISTS");
  });
});
