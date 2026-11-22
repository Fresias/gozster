import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// GOZS-703 (M-1): un solo juego de valores para public.estado_membresia.
const root = process.cwd();
const sql = readFileSync(
  join(root, "supabase/migrations/20261122200000_normalizar_estado_membresia.sql"),
  "utf8",
);
const dbTypes = readFileSync(join(root, "types/database.types.ts"), "utf8");
const CANONICOS = ["ACTIVA", "INACTIVA", "PENDIENTE", "BAJA", "VENCIDA"];

describe("GOZS-703 · normalizar estado_membresia", () => {
  it("recrea el enum solo con los valores en español", () => {
    expect(sql).toContain(
      "CREATE TYPE public.estado_membresia AS ENUM ('ACTIVA', 'INACTIVA', 'PENDIENTE', 'BAJA', 'VENCIDA')",
    );
    expect(sql).toContain("DROP TYPE public.estado_membresia_old");
  });

  it("mapea los valores en inglés al convertir la columna", () => {
    expect(sql).toMatch(/WHEN 'ACTIVE' THEN 'ACTIVA'/);
    expect(sql).toMatch(/WHEN 'ARCHIVED' THEN 'BAJA'/);
    expect(sql).toMatch(/WHEN 'EXPIRED_PAYMENT_PENDING' THEN 'VENCIDA'/);
  });

  it("conserva el bloqueo de la rutina para el alumno vencido", () => {
    expect(sql).toContain('CREATE POLICY "ejercicios_en_rutina_select_acceso_plan"');
    expect(sql).toContain("perf.estado_membresia = 'VENCIDA'");
  });

  it("es idempotente y falla si una función sigue usando valores en inglés", () => {
    expect(sql).toContain("estado_membresia ya normalizado; nada que hacer");
    expect(sql).toContain("RAISE EXCEPTION 'GOZS-703:");
  });

  it("los tipos generados exponen un único juego de valores", () => {
    const union = CANONICOS.map((v) => `"${v}"`).join("|");
    expect(dbTypes).toContain(`"estado_membresia": ${union},`);
    expect(dbTypes).not.toMatch(/"(ACTIVE|ARCHIVED|EXPIRED_PAYMENT_PENDING)"/);
  });
});
