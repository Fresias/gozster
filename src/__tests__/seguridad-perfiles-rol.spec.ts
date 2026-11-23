import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { aplicarMigracion, crearDbMigrada, listarMigraciones, MIGRATIONS_DIR, STUBS } from "./helpers/pglite-migrada";

const SUPABASE_DIR = path.resolve(__dirname, "../../supabase");
const MIGRATION_FILE = "20261122020000_seguridad_perfiles_rol.sql";

const ADMIN = "f4819866-b758-424e-90b2-555b7887c601";
const COACH = "00000000-0000-0000-0000-0000000000c1";
const ALUMNO_1 = "00000000-0000-0000-0000-0000000000a1";
const ALUMNO_2 = "00000000-0000-0000-0000-0000000000a2";
const PLANTILLA_GLOBAL = "22222222-2222-4222-8222-222222222201";
const EJERCICIO_1 = "11111111-1111-4111-8111-111111111101";

type Rol = "anon" | "authenticated" | "service_role";

let db: PGlite;

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    const claims = sub ? { sub, role: rol } : { role: rol };
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe("GOZS-683: seguridad de perfiles, handle_new_user y RPCs de planes (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${COACH}', 'coach@test.local'),
        ('${ALUMNO_1}', 'alumno1@test.local'),
        ('${ALUMNO_2}', 'alumno2@test.local')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
        ('${COACH}', 'coach@test.local', 'Coach Uno', 'ENTRENADOR', NULL, 'ACTIVA'),
        ('${ALUMNO_1}', 'alumno1@test.local', 'Alumno Uno', 'ALUMNO', '${COACH}', 'ACTIVA'),
        ('${ALUMNO_2}', 'alumno2@test.local', 'Alumno Dos', 'ALUMNO', NULL, 'ACTIVA')
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        nombre_completo = EXCLUDED.nombre_completo,
        rol = EXCLUDED.rol,
        profesor_asignado_id = EXCLUDED.profesor_asignado_id,
        estado_membresia = EXCLUDED.estado_membresia;

      INSERT INTO public.ejercicios (id, nombre) VALUES ('${EJERCICIO_1}', 'Sentadilla')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre, estado)
      VALUES ('${PLANTILLA_GLOBAL}', NULL, NULL, 'Plantilla Global', 'ACTIVO')
      ON CONFLICT (id) DO NOTHING;
    `);
  }, 120_000);

  it("la migración tiene versión posterior a 20261121223500 y es idempotente", async () => {
    expect(MIGRATION_FILE > "20261121223500_registrar_logro_racha_fix_conflict.sql").toBe(true);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), "utf-8");

    // Verificar idempotencia sobre el estado exacto hasta MIGRATION_FILE (antes de podas posteriores)
    const dbIdemp = await PGlite.create({ extensions: { pgcrypto } });
    try {
      await dbIdemp.exec(STUBS);
      for (const archivo of listarMigraciones()) {
        if (archivo > MIGRATION_FILE) break;
        await aplicarMigracion(dbIdemp, fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
      }
      await expect(aplicarMigracion(dbIdemp, sql)).resolves.toBeUndefined();
    } finally {
      await dbIdemp.close();
    }

    const trg = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'trg_00_upsert_perfiles'`,
    );
    expect(trg.rows[0]?.n).toBe(0);

    const fn = await db.query<{ oid: string | null }>(
      `SELECT to_regprocedure('public.fn_upsert_perfil_si_existe()')::text AS oid`,
    );
    expect(fn.rows[0]?.oid).toBeNull();
  });

  it("handle_new_user ignora rol en raw_user_meta_data y solo respeta raw_app_meta_data", async () => {
    const idAuto = "00000000-0000-0000-0000-0000000000e1";
    const idStaff = "00000000-0000-0000-0000-0000000000e2";

    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES ('${idAuto}', 'auto@test.local', '{"rol":"ADMIN"}');
      INSERT INTO auth.users (id, email, raw_app_meta_data)
      VALUES ('${idStaff}', 'staff@test.local', '{"rol":"ENTRENADOR"}');
    `);

    const rAuto = await db.query<{ rol: string }>(
      `SELECT rol::text FROM public.perfiles WHERE id = $1`,
      [idAuto],
    );
    expect(rAuto.rows[0]?.rol).toBe("ALUMNO");

    const rStaff = await db.query<{ rol: string }>(
      `SELECT rol::text FROM public.perfiles WHERE id = $1`,
      [idStaff],
    );
    expect(rStaff.rows[0]?.rol).toBe("ENTRENADOR");
  });

  it("alumno autenticado no puede hacer INSERT ni upsert sobre el perfil de otro usuario (42501)", async () => {
    await expect(
      como(
        "authenticated",
        ALUMNO_2,
        `INSERT INTO public.perfiles (id, email, nombre_completo) VALUES ($1, 'evil@test.local', 'X')`,
        [ADMIN],
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      como(
        "authenticated",
        ALUMNO_2,
        `INSERT INTO public.perfiles (id, nombre_completo) VALUES ($1, 'X')
         ON CONFLICT (id) DO UPDATE SET nombre_completo = 'X'`,
        [ADMIN],
      ),
    ).rejects.toMatchObject({ code: "42501" });

    const adminRow = await db.query<{ email: string; rol: string }>(
      `SELECT email, rol::text FROM public.perfiles WHERE id = $1`,
      [ADMIN],
    );
    expect(adminRow.rows[0]?.email).toBe("gonzasalas2016@gmail.com");
    expect(adminRow.rows[0]?.rol).toBe("ADMIN");
  });

  it("INSERT plano sobre perfil existente falla con 23505 y upsert propio conserva debe_cambiar_password", async () => {
    await expect(
      como(
        "service_role",
        null,
        `INSERT INTO public.perfiles (id, email, nombre_completo) VALUES ($1, 'gonzasalas2016@gmail.com', 'Gonzalo')`,
        [ADMIN],
      ),
    ).rejects.toThrow(/duplicate key|23505/i);

    await db.query(`UPDATE public.perfiles SET debe_cambiar_password = true WHERE id = $1`, [ALUMNO_2]);
    await expect(
      como(
        "authenticated",
        ALUMNO_2,
        `INSERT INTO public.perfiles (id, nombre_completo) VALUES (auth.uid(), 'Alumno Dos')`,
      ),
    ).rejects.toThrow(/duplicate key|23505/i);

    await como(
      "authenticated",
      ALUMNO_2,
      `INSERT INTO public.perfiles (id, nombre_completo) VALUES (auth.uid(), 'Alumno Dos')
       ON CONFLICT (id) DO UPDATE SET nombre_completo = 'Alumno Dos Editado'`,
    );

    const row = await db.query<{ debe_cambiar_password: boolean; nombre_completo: string }>(
      `SELECT debe_cambiar_password, nombre_completo FROM public.perfiles WHERE id = $1`,
      [ALUMNO_2],
    );
    expect(row.rows[0]?.debe_cambiar_password).toBe(true);
    expect(row.rows[0]?.nombre_completo).toBe("Alumno Dos Editado");

    await db.query(`UPDATE public.perfiles SET debe_cambiar_password = false WHERE id = $1`, [ALUMNO_2]);
  });

  it("protege fecha_vencimiento_cuota y rol contra modificaciones del propio alumno, permitiendo al coach asignado", async () => {
    await expect(
      como(
        "authenticated",
        ALUMNO_2,
        `UPDATE public.perfiles SET fecha_vencimiento_cuota = '2030-01-01' WHERE id = auth.uid()`,
      ),
    ).rejects.toThrow(/Solo el entrenador asignado/i);

    await expect(
      como("authenticated", ALUMNO_2, `UPDATE public.perfiles SET rol = 'ADMIN' WHERE id = auth.uid()`),
    ).rejects.toThrow(/Solo un administrador/i);

    await expect(
      como(
        "authenticated",
        COACH,
        `UPDATE public.perfiles SET fecha_vencimiento_cuota = '2027-01-10' WHERE id = $1`,
        [ALUMNO_1],
      ),
    ).resolves.toBeDefined();
  });

  it("restringe obtener_ranking_ejercicio (podada) y protege las RPCs de planes contra anon, alumno y profesor_id NULL", async () => {
    const rankingFn = await db.query<{ oid: string | null }>(
      `SELECT to_regprocedure('public.obtener_ranking_ejercicio(uuid)')::text AS oid`,
    );
    expect(rankingFn.rows[0]?.oid).toBeNull();
    await expect(
      como("authenticated", ALUMNO_2, `SELECT * FROM public.obtener_ranking_ejercicio(gen_random_uuid())`),
    ).rejects.toThrow(/does not exist|permission denied/i);

    await expect(
      como("anon", null, `SELECT public.clonar_plan_entrenamiento($1, 'x')`, [PLANTILLA_GLOBAL]),
    ).rejects.toThrow(/permission denied|Debes iniciar sesión/i);

    await expect(
      como("authenticated", ALUMNO_2, `SELECT public.clonar_plan_entrenamiento($1, 'robado')`, [PLANTILLA_GLOBAL]),
    ).rejects.toThrow(/No autorizado/i);

    await expect(
      como("authenticated", ALUMNO_2, `SELECT public.extender_vigencia_plan($1, 365)`, [PLANTILLA_GLOBAL]),
    ).rejects.toThrow(/does not exist/i);

    const activarFn = await db.query<{ oid: string | null }>(
      `SELECT to_regprocedure('public.activar_rutina(uuid)')::text AS oid`,
    );
    expect(activarFn.rows[0]?.oid).toBeNull();
    const planHuerfano = "33333333-3333-4333-8333-333333333333";
    await expect(
      como("authenticated", ALUMNO_2, `SELECT public.activar_rutina($1)`, [planHuerfano]),
    ).rejects.toThrow(/does not exist|No tienes permiso/i);

    await expect(
      como("authenticated", ADMIN, `SELECT public.clonar_plan_entrenamiento($1, 'copia admin')`, [PLANTILLA_GLOBAL]),
    ).resolves.toBeDefined();
  });

  it("los seeds de supabase/ cargan sin error y mantienen los mismos 19 perfiles", async () => {
    const dbSeed = await crearDbMigrada();
    await dbSeed.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('00000000-0000-0000-0000-000000000101', '94.gabriel.sanchez@gmail.com'),
        ('00000000-0000-0000-0000-000000000102', 'ds.gabriel.sanchez@gmail.com'),
        ('00000000-0000-0000-0000-000000000103', 'alumno.b.tester@gozster.local')
      ON CONFLICT (id) DO NOTHING;
    `);
    await aplicarMigracion(dbSeed, fs.readFileSync(path.join(SUPABASE_DIR, "seed.sql"), "utf-8"));
    await aplicarMigracion(dbSeed, fs.readFileSync(path.join(SUPABASE_DIR, "seed_gozs.sql"), "utf-8"));
    await aplicarMigracion(dbSeed, fs.readFileSync(path.join(SUPABASE_DIR, "seed_tester.sql"), "utf-8"));

    const count = await dbSeed.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.perfiles`);
    expect(count.rows[0]?.n).toBe(19);
    await dbSeed.close();
  }, 120_000);
});
