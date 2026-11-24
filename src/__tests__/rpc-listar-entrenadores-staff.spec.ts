import { beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

// GOZS-761: RPC mínima listar_entrenadores_staff (SECURITY DEFINER, solo id y nombre_completo).

const MIGRACION = "20261124040000_rpc_listar_entrenadores_staff.sql";

const ADMIN = "00000000-0000-0000-0000-0000000761ad";
const COACH_A = "00000000-0000-0000-0000-0000000761ca";
const COACH_B = "00000000-0000-0000-0000-0000000761cb";
const COACH_BAJA = "00000000-0000-0000-0000-0000000761cc";
const COACH_SUSP = "00000000-0000-0000-0000-0000000761cd";
const COACH_FECHA_BAJA = "00000000-0000-0000-0000-0000000761ce";
const ALUMNO = "00000000-0000-0000-0000-0000000761a1";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}', 'admin761@gozster.test'),
    ('${COACH_A}', 'ca761@gozster.test'),
    ('${COACH_B}', 'cb761@gozster.test'),
    ('${COACH_BAJA}', 'baja761@gozster.test'),
    ('${COACH_SUSP}', 'susp761@gozster.test'),
    ('${COACH_FECHA_BAJA}', 'fb761@gozster.test'),
    ('${ALUMNO}', 'al761@gozster.test');

  INSERT INTO public.perfiles (id, email, telefono, nombre_completo, rol, estado_membresia, estado_cuenta, fecha_baja, profesor_asignado_id) VALUES
    ('${ADMIN}', 'admin761@gozster.test', '+5491100000001', 'Admin Principal 761', 'ADMIN', 'ACTIVA', 'ACTIVO', NULL, NULL),
    ('${COACH_A}', 'ca761@gozster.test', '+5491100000002', 'Coach Alfa 761', 'ENTRENADOR', 'ACTIVA', 'ACTIVO', NULL, NULL),
    ('${COACH_B}', 'cb761@gozster.test', '+5491100000003', 'Coach Beta 761', 'ENTRENADOR', 'ACTIVA', 'ACTIVO', NULL, NULL),
    ('${COACH_BAJA}', 'baja761@gozster.test', '+5491100000004', 'Coach Baja 761', 'ENTRENADOR', 'ACTIVA', 'BAJA_ADMINISTRATIVA', NULL, NULL),
    ('${COACH_SUSP}', 'susp761@gozster.test', '+5491100000005', 'Coach Suspendido 761', 'ENTRENADOR', 'ACTIVA', 'SUSPENDIDO', NULL, NULL),
    ('${COACH_FECHA_BAJA}', 'fb761@gozster.test', '+5491100000006', 'Coach Fecha Baja 761', 'ENTRENADOR', 'ACTIVA', 'ACTIVO', '2026-10-01T00:00:00Z', NULL),
    ('${ALUMNO}', 'al761@gozster.test', '+5491100000007', 'Alumno 761', 'ALUMNO', 'ACTIVA', 'ACTIVO', NULL, '${COACH_A}')
  ON CONFLICT (id) DO UPDATE SET
    rol = EXCLUDED.rol,
    estado_cuenta = EXCLUDED.estado_cuenta,
    fecha_baja = EXCLUDED.fecha_baja,
    telefono = EXCLUDED.telefono,
    nombre_completo = EXCLUDED.nombre_completo;
`;

let db: PGlite;

function como<T>(rolPg: "authenticated" | "anon", sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      sub ? JSON.stringify({ sub, role: rolPg }) : "",
    ]);
    await tx.query(`SET LOCAL ROLE ${rolPg}`);
    return tx.query<T>(sql);
  });
}

describe("GOZS-761: RPC listar_entrenadores_staff (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED);
  }, 120_000);

  it("define search_path fijo y revoca ejecución a PUBLIC/anon", async () => {
    const fn = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(
      `SELECT p.prosecdef, p.proconfig
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'listar_entrenadores_staff'`,
    );
    expect(fn.rows).toHaveLength(1);
    expect(fn.rows[0]?.prosecdef).toBe(true);
    expect(fn.rows[0]?.proconfig).toContain("search_path=public, pg_temp");

    const privs = await db.query<{ anon_exec: boolean; auth_exec: boolean }>(
      `SELECT
         has_function_privilege('anon', 'public.listar_entrenadores_staff()', 'EXECUTE') AS anon_exec,
         has_function_privilege('authenticated', 'public.listar_entrenadores_staff()', 'EXECUTE') AS auth_exec`,
    );
    expect(privs.rows[0]).toEqual({ anon_exec: false, auth_exec: true });
  });

  it("deniega ejecución a anon y a ALUMNO con código 42501", async () => {
    await expect(
      como("anon", null, `SELECT * FROM public.listar_entrenadores_staff()`),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      como("authenticated", ALUMNO, `SELECT * FROM public.listar_entrenadores_staff()`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("devuelve solo id y nombre_completo de ENTRENADOR/ADMIN activos para ENTRENADOR y ADMIN", async () => {
    const resCoach = await como<Record<string, unknown>>(
      "authenticated",
      COACH_A,
      `SELECT * FROM public.listar_entrenadores_staff()`,
    );
    const resAdmin = await como<Record<string, unknown>>(
      "authenticated",
      ADMIN,
      `SELECT * FROM public.listar_entrenadores_staff()`,
    );

    expect(resCoach.rows).toEqual(resAdmin.rows);

    const ids = resCoach.rows.map((r) => r.id);
    expect(ids).toContain(ADMIN);
    expect(ids).toContain(COACH_A);
    expect(ids).toContain(COACH_B);

    // Excluye alumnos y staff inactivo / dado de baja
    expect(ids).not.toContain(ALUMNO);
    expect(ids).not.toContain(COACH_BAJA);
    expect(ids).not.toContain(COACH_SUSP);
    expect(ids).not.toContain(COACH_FECHA_BAJA);

    // Verifica estrictamente que no se filtran emails, teléfonos ni otros datos personales
    for (const row of resCoach.rows) {
      expect(Object.keys(row).sort()).toEqual(["id", "nombre_completo"]);
    }
  });

  it("la migración es idempotente", async () => {
    await expect(
      aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACION), "utf-8")),
    ).resolves.toBeUndefined();
  });
});
