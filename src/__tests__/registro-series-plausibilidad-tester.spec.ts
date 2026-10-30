import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "../../supabase");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf-8");

describe("GOZS-199: CHECK de plausibilidad y seed del tester", () => {
  const mig = read("migrations/20261028130000_registro_series_checks_plausibilidad.sql");
  const seed = read("seed_tester.sql");

  it("la migración define CHECKs de peso, reps y RPE, idempotentes", () => {
    expect(mig).toContain("peso_kg >= 0 AND peso_kg <= 1000");
    expect(mig).toContain("reps_hechas >= 0 AND reps_hechas <= 100");
    expect(mig).toContain("rpe_real >= 1 AND rpe_real <= 10");
    expect(mig.match(/IF NOT EXISTS \(SELECT 1 FROM pg_constraint/g)).toHaveLength(3);
  });

  it("RLS de series y sesiones sigue limitado al dueño (sin USING true)", () => {
    const init = read("migrations/20261016000000_initial_schema_rls.sql");
    expect(init).toContain("s.alumno_id = auth.uid()");
    expect(init).not.toMatch(/ON public\.registro_(series|sesiones)[\s\S]{0,80}USING \(\s*true\s*\)/);
  });

  it("el seed del tester es idempotente, sin secretos y escopado al tester", () => {
    expect(seed).toContain("94.gabriel.sanchez@gmail.com");
    expect(seed).toContain("'ALUMNO'");
    expect(seed).toContain("ON CONFLICT (id) DO UPDATE");
    expect(seed).not.toMatch(/password|crypt\(|DELETE FROM|TRUNCATE/i);
    for (const n of ["Press Plano con Barra", "Prensa 45°", "Jalón al pecho agarre neutro"]) {
      expect(seed).toContain(n);
    }
  });
});
