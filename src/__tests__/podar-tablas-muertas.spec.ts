import { describe, it, expect, beforeAll } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";

// GOZS-720 (PL-8): poda de tablas sin uso sobre el esquema migrado completo (PGlite).

const PODADAS = ["habitos_registros", "nutricion_registros", "ejercicios_alternativas", "ranking_prs"];

let db: PGlite;

function comoServiceRole(sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: "service_role" })]);
    await tx.query(`SET LOCAL ROLE service_role`);
    return tx.query(sql);
  });
}

describe("GOZS-720: poda de tablas muertas", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
  }, 120_000);

  it.each(PODADAS)("la tabla %s ya no existe", async (tabla) => {
    const r = await db.query<{ t: string | null }>(`SELECT to_regclass('public.${tabla}')::text AS t`);
    expect(r.rows[0]!.t).toBeNull();
  });

  it("push_cola se conserva (la usa el procesador de push)", async () => {
    const r = await db.query<{ t: string | null }>(`SELECT to_regclass('public.push_cola')::text AS t`);
    expect(r.rows[0]!.t).toBe("push_cola");
  });

  it("eliminar_clase_vacia ya no referencia ranking_prs", async () => {
    const r = await db.query<{ def: string }>(
      `SELECT pg_get_functiondef('public.eliminar_clase_vacia(uuid)'::regprocedure) AS def`
    );
    expect(r.rows[0]!.def).not.toContain("ranking_prs");
    expect(r.rows[0]!.def).toContain("No se puede eliminar una clase con alumnos inscriptos");
  });

  it.each(PODADAS)("restaurar_filas_respaldo rechaza la tabla podada %s", async (tabla) => {
    await expect(
      comoServiceRole(`SELECT public.restaurar_filas_respaldo('${tabla}', '[]'::jsonb)`)
    ).rejects.toThrow(/no restaurable/);
  });

  it("restaurar_filas_respaldo sigue aceptando tablas vigentes", async () => {
    const r = await comoServiceRole(`SELECT public.restaurar_filas_respaldo('push_cola', '[]'::jsonb) AS n`);
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });
});
