import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

const MIGRATION_FILE = "20261124050000_sync_rol_app_metadata_update.sql";

const U_ADMIN_2STEP = "00000000-0000-4000-8000-000000000791";
const U_COACH_2STEP = "00000000-0000-4000-8000-000000000792";
const U_ALUMNO_META = "00000000-0000-4000-8000-000000000793";
const U_INVALID_ROL = "00000000-0000-4000-8000-000000000794";
const U_SERVICE_JWT = "00000000-0000-4000-8000-000000000795";

type RolPg = "anon" | "authenticated" | "service_role";

let db: PGlite;

function como<T>(rol: RolPg, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    const claims = sub ? { sub, role: rol } : { role: rol };
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

async function obtenerRolPerfil(userId: string): Promise<string | undefined> {
  const res = await db.query<{ rol: string }>(
    `SELECT rol::text AS rol FROM public.perfiles WHERE id = $1`,
    [userId],
  );
  return res.rows[0]?.rol;
}

describe("GOZS-793: sincronizar perfiles.rol al actualizar raw_app_meta_data en auth.users (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("la migración tiene versión mayor a 20261124040000, es idempotente y define el trigger con privilegios restringidos", async () => {
    expect(MIGRATION_FILE > "20261124040000_rpc_listar_entrenadores_staff.sql").toBe(true);

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), "utf-8");
    await expect(aplicarMigracion(db, sql)).resolves.toBeUndefined();

    const proc = await db.query<{ prosecdef: boolean; proconfig: string[] | null }>(
      `SELECT prosecdef, proconfig
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_sync_rol_from_app_metadata'`,
    );
    expect(proc.rows[0]?.prosecdef).toBe(true);
    expect(proc.rows[0]?.proconfig).toContain("search_path=public");

    const privs = await db.query<{ anon: boolean; auth: boolean; srv: boolean }>(
      `SELECT
         has_function_privilege('anon', 'public.fn_sync_rol_from_app_metadata()', 'EXECUTE') AS anon,
         has_function_privilege('authenticated', 'public.fn_sync_rol_from_app_metadata()', 'EXECUTE') AS auth,
         has_function_privilege('service_role', 'public.fn_sync_rol_from_app_metadata()', 'EXECUTE') AS srv`,
    );
    expect(privs.rows[0]).toEqual({ anon: false, auth: false, srv: true });

    const trg = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'auth'
          AND c.relname = 'users'
          AND t.tgname = 'trg_auth_users_sync_rol_app_metadata'`,
    );
    expect(trg.rows[0]?.n).toBe(1);
  });

  it("GIVEN usuario insertado sin rol en raw_app_meta_data WHEN UPDATE agrega rol ADMIN THEN perfiles.rol pasa a ADMIN", async () => {
    await db.query(
      `INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
       VALUES ($1, 'admin-2step@test.local', '{"provider":"email","providers":["email"]}'::jsonb, '{"nombre_completo":"Admin Dos Pasos"}'::jsonb)`,
      [U_ADMIN_2STEP],
    );
    expect(await obtenerRolPerfil(U_ADMIN_2STEP)).toBe("ALUMNO");

    await db.query(
      `UPDATE auth.users
          SET raw_app_meta_data = raw_app_meta_data || '{"rol":"ADMIN"}'::jsonb
        WHERE id = $1`,
      [U_ADMIN_2STEP],
    );
    expect(await obtenerRolPerfil(U_ADMIN_2STEP)).toBe("ADMIN");
  });

  it("GIVEN usuario creado vía UPDATE posterior con rol ENTRENADOR (normalizado) THEN perfiles.rol queda ENTRENADOR y soporta cambio a ALUMNO", async () => {
    await db.query(
      `INSERT INTO auth.users (id, email, raw_app_meta_data)
       VALUES ($1, 'coach-2step@test.local', '{"provider":"email"}'::jsonb)`,
      [U_COACH_2STEP],
    );
    expect(await obtenerRolPerfil(U_COACH_2STEP)).toBe("ALUMNO");

    await db.query(
      `UPDATE auth.users
          SET raw_app_meta_data = raw_app_meta_data || '{"rol":"  entrenador  "}'::jsonb
        WHERE id = $1`,
      [U_COACH_2STEP],
    );
    expect(await obtenerRolPerfil(U_COACH_2STEP)).toBe("ENTRENADOR");

    await db.query(
      `UPDATE auth.users
          SET raw_app_meta_data = raw_app_meta_data || '{"rol":"ALUMNO"}'::jsonb
        WHERE id = $1`,
      [U_COACH_2STEP],
    );
    expect(await obtenerRolPerfil(U_COACH_2STEP)).toBe("ALUMNO");
  });

  it("GIVEN UPDATE que solo cambia raw_user_meta_data o claves sin rol en raw_app_meta_data THEN perfiles.rol permanece ALUMNO", async () => {
    await db.query(
      `INSERT INTO auth.users (id, email, raw_app_meta_data)
       VALUES ($1, 'alumno-meta@test.local', '{"provider":"email"}'::jsonb)`,
      [U_ALUMNO_META],
    );
    expect(await obtenerRolPerfil(U_ALUMNO_META)).toBe("ALUMNO");

    await db.query(
      `UPDATE auth.users
          SET raw_user_meta_data = '{"rol":"ADMIN"}'::jsonb
        WHERE id = $1`,
      [U_ALUMNO_META],
    );
    expect(await obtenerRolPerfil(U_ALUMNO_META)).toBe("ALUMNO");

    await db.query(
      `UPDATE auth.users
          SET raw_app_meta_data = raw_app_meta_data || '{"must_change_password":true}'::jsonb
        WHERE id = $1`,
      [U_ALUMNO_META],
    );
    expect(await obtenerRolPerfil(U_ALUMNO_META)).toBe("ALUMNO");
  });

  it("si raw_app_meta_data ->> rol pasa a NULL, se elimina o contiene un valor inválido, no modifica perfiles.rol", async () => {
    await db.query(
      `INSERT INTO auth.users (id, email, raw_app_meta_data)
       VALUES ($1, 'invalid-rol@test.local', '{"provider":"email","rol":"ADMIN"}'::jsonb)`,
      [U_INVALID_ROL],
    );
    expect(await obtenerRolPerfil(U_INVALID_ROL)).toBe("ADMIN");

    await db.query(
      `UPDATE auth.users
          SET raw_app_meta_data = raw_app_meta_data || '{"rol":"SUPERADMIN"}'::jsonb
        WHERE id = $1`,
      [U_INVALID_ROL],
    );
    expect(await obtenerRolPerfil(U_INVALID_ROL)).toBe("ADMIN");

    await db.query(
      `UPDATE auth.users
          SET raw_app_meta_data = raw_app_meta_data || '{"rol":null}'::jsonb
        WHERE id = $1`,
      [U_INVALID_ROL],
    );
    expect(await obtenerRolPerfil(U_INVALID_ROL)).toBe("ADMIN");

    await db.query(
      `UPDATE auth.users
          SET raw_app_meta_data = raw_app_meta_data - 'rol'
        WHERE id = $1`,
      [U_INVALID_ROL],
    );
    expect(await obtenerRolPerfil(U_INVALID_ROL)).toBe("ADMIN");
  });

  it("funciona con contexto JWT de service_role y mantiene intactas las restricciones para authenticated", async () => {
    await db.query(
      `INSERT INTO auth.users (id, email, raw_app_meta_data)
       VALUES ($1, 'service-jwt@test.local', '{"provider":"email"}'::jsonb)`,
      [U_SERVICE_JWT],
    );
    expect(await obtenerRolPerfil(U_SERVICE_JWT)).toBe("ALUMNO");

    await db.transaction(async (tx: Transaction) => {
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ role: "service_role" }),
      ]);
      await tx.query(
        `UPDATE auth.users
            SET raw_app_meta_data = raw_app_meta_data || '{"rol":"ADMIN"}'::jsonb
          WHERE id = $1`,
        [U_SERVICE_JWT],
      );
    });
    expect(await obtenerRolPerfil(U_SERVICE_JWT)).toBe("ADMIN");

    await expect(
      como(
        "authenticated",
        U_ALUMNO_META,
        `UPDATE auth.users SET raw_app_meta_data = '{"rol":"ADMIN"}'::jsonb WHERE id = $1`,
        [U_ALUMNO_META],
      ),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      como(
        "authenticated",
        U_ALUMNO_META,
        `UPDATE public.perfiles SET rol = 'ADMIN' WHERE id = auth.uid()`,
      ),
    ).rejects.toMatchObject({ code: "42501" });

    expect(await obtenerRolPerfil(U_ALUMNO_META)).toBe("ALUMNO");
  });
});
