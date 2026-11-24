import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

const MIGRATION_FILE = "20261123010000_podar_extender_vigencia_plan.sql";
const SRC_DIR = path.resolve(__dirname, "..");

function buscarEnSrc(dir: string, needle: string): string[] {
  const hits: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") hits.push(...buscarEnSrc(ruta, needle));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && fs.readFileSync(ruta, "utf8").includes(needle)) {
      hits.push(ruta);
    }
  }
  return hits;
}

let db: PGlite;

describe("GOZS-712: poda de extender_vigencia_plan (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
  }, 120_000);

  it("la migración es posterior a 20261123000000 y es idempotente", async () => {
    expect(MIGRATION_FILE > "20261123000000_pg_cron_job_diario_contrataciones.sql").toBe(true);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), "utf-8");
    await expect(aplicarMigracion(db, sql)).resolves.toBeUndefined();
  });

  it("la función ya no existe y las RPCs de contrataciones siguen disponibles", async () => {
    const r = await db.query<{ oid: string | null }>(
      `SELECT to_regprocedure('public.extender_vigencia_plan(uuid, integer)')::text AS oid`,
    );
    expect(r.rows[0]?.oid).toBeNull();

    for (const sig of [
      "public.extender_contratacion_excepcional(uuid, date, text)",
      "public.clonar_plan_entrenamiento(uuid, text)",
    ]) {
      const k = await db.query<{ oid: string | null }>(`SELECT to_regprocedure($1)::text AS oid`, [sig]);
      expect(k.rows[0]?.oid, sig).not.toBeNull();
    }
  });

  it("ningún código de src/ ni los tipos referencian la RPC podada", () => {
    expect(buscarEnSrc(SRC_DIR, "extender_vigencia_plan")).toEqual([]);
    const tipos = fs.readFileSync(path.resolve(SRC_DIR, "..", "types", "database.types.ts"), "utf8");
    expect(tipos).not.toContain("extender_vigencia_plan");
  });
});
