import { beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

// GOZS-759: plantillas privadas por entrenador y compartidas con entrenadores puntuales.

const MIGRACION = "20261123150000_planes_compartidos_rls.sql";

const ADMIN = "00000000-0000-0000-0000-0000000759ad";
const COACH_A = "00000000-0000-0000-0000-0000000759ca";
const COACH_B = "00000000-0000-0000-0000-0000000759cb";
const COACH_C = "00000000-0000-0000-0000-0000000759cc";
const ALUMNO_B = "00000000-0000-0000-0000-0000000759ab";
const ALUMNO_C = "00000000-0000-0000-0000-0000000759ac";

const EJERCICIO = "75900000-0000-4000-8000-000000000001";
const PLANTILLA_A = "75900000-0000-4000-8000-0000000000a1";
const DIA_A = "75900000-0000-4000-8000-0000000000d1";
const PLAN_ALUMNO_B = "75900000-0000-4000-8000-0000000000b1";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}', 'ad@t759'), ('${COACH_A}', 'ca@t759'), ('${COACH_B}', 'cb@t759'),
    ('${COACH_C}', 'cc@t759'), ('${ALUMNO_B}', 'ab@t759'), ('${ALUMNO_C}', 'ac@t759');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id) VALUES
    ('${ADMIN}', 'ad@t759', 'Admin', 'ADMIN', 'ACTIVA', NULL),
    ('${COACH_A}', 'ca@t759', 'Coach A', 'ENTRENADOR', 'ACTIVA', NULL),
    ('${COACH_B}', 'cb@t759', 'Coach B', 'ENTRENADOR', 'ACTIVA', NULL),
    ('${COACH_C}', 'cc@t759', 'Coach C', 'ENTRENADOR', 'ACTIVA', NULL),
    ('${ALUMNO_B}', 'ab@t759', 'Alumno B', 'ALUMNO', 'ACTIVA', '${COACH_B}'),
    ('${ALUMNO_C}', 'ac@t759', 'Alumno C', 'ALUMNO', 'ACTIVA', '${COACH_C}')
  ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id;
  INSERT INTO public.ejercicios (id, nombre) VALUES ('${EJERCICIO}', 'Sentadilla 759');
  INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado, tipo) VALUES
    ('${PLANTILLA_A}', '${COACH_A}', NULL, 'Plantilla A', 'BORRADOR', 'PLANTILLA'),
    ('${PLAN_ALUMNO_B}', '${COACH_B}', '${ALUMNO_B}', 'Plan Alumno B', 'INACTIVO', 'DE_ALUMNO');
  INSERT INTO public.dias_rutina (id, plan_id, nombre, orden) VALUES ('${DIA_A}', '${PLANTILLA_A}', 'Día 1', 1);
  INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones) VALUES
    ('${DIA_A}', '${EJERCICIO}', 1, 3, '10');
`;

let db: PGlite;

function como<T>(sub: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: "authenticated" }),
    ]);
    await tx.query(`SET LOCAL ROLE authenticated`);
    return tx.query<T>(sql, params);
  });
}

async function filasVisibles(sub: string): Promise<[number, number, number]> {
  const r = await como<{ p: number; d: number; e: number }>(
    sub,
    `SELECT
       (SELECT count(*)::int FROM public.planes_entrenamiento WHERE id = $1) AS p,
       (SELECT count(*)::int FROM public.dias_rutina WHERE plan_id = $1) AS d,
       (SELECT count(*)::int FROM public.ejercicios_en_rutina WHERE dia_id = $2) AS e`,
    [PLANTILLA_A, DIA_A],
  );
  const { p, d, e } = r.rows[0]!;
  return [p, d, e];
}

async function compartir(sub: string, planId: string, destino: string) {
  return como(
    sub,
    `INSERT INTO public.planes_compartidos (plan_id, profesor_id, compartido_por) VALUES ($1, $2, $3)`,
    [planId, destino, sub],
  );
}

describe("GOZS-759: plantillas privadas y compartidas (planes_compartidos + RLS)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED);
  }, 120_000);

  it("crea planes_compartidos con PK (plan_id, profesor_id), FKs, índice en profesor_id y RLS", async () => {
    const pk = await db.query<{ cols: string }>(
      `SELECT pg_get_constraintdef(oid) AS cols FROM pg_constraint
       WHERE conrelid = 'public.planes_compartidos'::regclass AND contype = 'p'`,
    );
    expect(pk.rows[0]?.cols).toBe("PRIMARY KEY (plan_id, profesor_id)");

    const fks = await db.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'public.planes_compartidos'::regclass AND contype = 'f' ORDER BY 1`,
    );
    const defs = fks.rows.map((r) => r.def);
    expect(defs).toContain("FOREIGN KEY (plan_id) REFERENCES planes_entrenamiento(id) ON DELETE CASCADE");
    expect(defs).toContain("FOREIGN KEY (profesor_id) REFERENCES perfiles(id) ON DELETE CASCADE");
    expect(defs).toContain("FOREIGN KEY (compartido_por) REFERENCES perfiles(id)");

    const idx = await db.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_planes_compartidos_profesor_id'`,
    );
    expect(idx.rows).toHaveLength(1);

    const rls = await db.query<{ rls: boolean }>(
      `SELECT relrowsecurity AS rls FROM pg_class WHERE oid = 'public.planes_compartidos'::regclass`,
    );
    expect(rls.rows[0]?.rls).toBe(true);
  });

  it("sin compartir: coach_B no ve la plantilla de coach_A en ninguna tabla; autor y ADMIN sí", async () => {
    expect(await filasVisibles(COACH_B)).toEqual([0, 0, 0]);
    expect(await filasVisibles(COACH_A)).toEqual([1, 1, 1]);
    expect(await filasVisibles(ADMIN)).toEqual([1, 1, 1]);
    expect(await filasVisibles(ALUMNO_B)).toEqual([0, 0, 0]);
  });

  it("sin compartir: coach_B no puede clonar ni asignar la plantilla de coach_A", async () => {
    await expect(
      como(COACH_B, `SELECT public.clonar_plan_entrenamiento($1, 'robo')`, [PLANTILLA_A]),
    ).rejects.toThrow(/No autorizado/);
    await expect(
      como(COACH_B, `SELECT public.asignar_rutina_a_alumno($1, $2)`, [PLANTILLA_A, ALUMNO_B]),
    ).rejects.toThrow(/No tienes permiso/);
  });

  it("solo el autor comparte, y solo plantillas (no planes de alumno)", async () => {
    await expect(compartir(COACH_C, PLANTILLA_A, COACH_B)).rejects.toMatchObject({ code: "42501" });
    await expect(compartir(COACH_B, PLAN_ALUMNO_B, COACH_C)).rejects.toMatchObject({ code: "42501" });
    await expect(
      como(COACH_A, `INSERT INTO public.planes_compartidos (plan_id, profesor_id, compartido_por) VALUES ($1, $2, $3)`, [
        PLANTILLA_A,
        COACH_B,
        COACH_C,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await compartir(COACH_A, PLANTILLA_A, COACH_B);
  });

  it("compartida: coach_B lee la plantilla completa; coach_C sigue aislado", async () => {
    expect(await filasVisibles(COACH_B)).toEqual([1, 1, 1]);
    expect(await filasVisibles(COACH_C)).toEqual([0, 0, 0]);
    const tags = await como<{ profesor_id: string }>(COACH_B, `SELECT profesor_id::text FROM public.planes_compartidos`);
    expect(tags.rows).toEqual([{ profesor_id: COACH_B }]);
    const ajenos = await como<{ n: number }>(COACH_C, `SELECT count(*)::int AS n FROM public.planes_compartidos`);
    expect(ajenos.rows[0]!.n).toBe(0);
  });

  it("compartida: coach_B la duplica a sus plantillas y la asigna a su alumno, no a uno ajeno", async () => {
    const clon = await como<{ id: string }>(COACH_B, `SELECT public.clonar_plan_entrenamiento($1, 'Mía') AS id`, [
      PLANTILLA_A,
    ]);
    const copia = await db.query<{ profesor_id: string; alumno_id: string | null; dias: number }>(
      `SELECT profesor_id::text, alumno_id::text,
              (SELECT count(*)::int FROM public.dias_rutina WHERE plan_id = p.id) AS dias
       FROM public.planes_entrenamiento p WHERE id = $1`,
      [clon.rows[0]!.id],
    );
    expect(copia.rows[0]).toEqual({ profesor_id: COACH_B, alumno_id: null, dias: 1 });

    const asignado = await como<{ id: string }>(COACH_B, `SELECT public.asignar_rutina_a_alumno($1, $2) AS id`, [
      PLANTILLA_A,
      ALUMNO_B,
    ]);
    const plan = await db.query<{ profesor_id: string; alumno_id: string }>(
      `SELECT profesor_id::text, alumno_id::text FROM public.planes_entrenamiento WHERE id = $1`,
      [asignado.rows[0]!.id],
    );
    expect(plan.rows[0]).toEqual({ profesor_id: COACH_B, alumno_id: ALUMNO_B });

    await expect(
      como(COACH_B, `SELECT public.asignar_rutina_a_alumno($1, $2)`, [PLANTILLA_A, ALUMNO_C]),
    ).rejects.toThrow(/no está asignado/);
  });

  it("compartida es solo lectura: coach_B no edita, borra ni re-comparte la original", async () => {
    const upd = await como(COACH_B, `UPDATE public.planes_entrenamiento SET nombre = 'x' WHERE id = $1`, [PLANTILLA_A]);
    expect(upd.affectedRows).toBe(0);
    const del = await como(COACH_B, `DELETE FROM public.planes_entrenamiento WHERE id = $1`, [PLANTILLA_A]);
    expect(del.affectedRows).toBe(0);
    const updDia = await como(COACH_B, `UPDATE public.dias_rutina SET nombre = 'x' WHERE id = $1`, [DIA_A]);
    expect(updDia.affectedRows).toBe(0);
    const delDia = await como(COACH_B, `DELETE FROM public.dias_rutina WHERE id = $1`, [DIA_A]);
    expect(delDia.affectedRows).toBe(0);
    const updEj = await como(COACH_B, `UPDATE public.ejercicios_en_rutina SET series = 9 WHERE dia_id = $1`, [DIA_A]);
    expect(updEj.affectedRows).toBe(0);
    const delEj = await como(COACH_B, `DELETE FROM public.ejercicios_en_rutina WHERE dia_id = $1`, [DIA_A]);
    expect(delEj.affectedRows).toBe(0);
    await expect(
      como(COACH_B, `INSERT INTO public.dias_rutina (plan_id, nombre, orden) VALUES ($1, 'Intruso', 9)`, [PLANTILLA_A]),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(compartir(COACH_B, PLANTILLA_A, COACH_C)).rejects.toMatchObject({ code: "42501" });
    const revoca = await como(COACH_B, `DELETE FROM public.planes_compartidos WHERE plan_id = $1`, [PLANTILLA_A]);
    expect(revoca.affectedRows).toBe(0);
    await expect(
      como(COACH_B, `UPDATE public.planes_compartidos SET profesor_id = $2 WHERE plan_id = $1`, [PLANTILLA_A, COACH_C]),
    ).rejects.toMatchObject({ code: "42501" });

    const original = await db.query<{ nombre: string }>(
      `SELECT nombre FROM public.planes_entrenamiento WHERE id = $1`,
      [PLANTILLA_A],
    );
    expect(original.rows[0]!.nombre).toBe("Plantilla A");
  });

  it("el autor revoca el tag y coach_B pierde el acceso", async () => {
    const revoca = await como(COACH_A, `DELETE FROM public.planes_compartidos WHERE plan_id = $1 AND profesor_id = $2`, [
      PLANTILLA_A,
      COACH_B,
    ]);
    expect(revoca.affectedRows).toBe(1);
    expect(await filasVisibles(COACH_B)).toEqual([0, 0, 0]);
  });

  it("compartir con un alumno no le da acceso a la plantilla", async () => {
    await compartir(COACH_A, PLANTILLA_A, ALUMNO_C);
    expect(await filasVisibles(ALUMNO_C)).toEqual([0, 0, 0]);
  });

  it("la migración es idempotente", async () => {
    await aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACION), "utf-8"));
    expect(await filasVisibles(COACH_C)).toEqual([0, 0, 0]);
  });
});
