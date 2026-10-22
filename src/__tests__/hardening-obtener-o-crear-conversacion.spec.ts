import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Issue GH #125 (GOZS-116): obtener_o_crear_conversacion debe rechazar llamadas
// anónimas (auth.uid() NULL) con ERRCODE 42501 y no crear filas. Entrenador ajeno
// también 42501. El alumno, su entrenador y un ADMIN reciben el ID y responsable_id
// queda inicializado con profesor_asignado_id.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH_ASIGNADO = "00000000-0000-0000-0000-00000000c0ac";
const COACH_AJENO = "00000000-0000-0000-0000-0000000000c3";
const ALUMNO = "00000000-0000-0000-0000-00000000000a";

type Rol = "anon" | "authenticated" | "service_role";

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, encrypted_password text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

const SEED_PERFILES = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}','admin@t'),
    ('${COACH_ASIGNADO}','coach1@t'),
    ('${COACH_AJENO}','coach3@t'),
    ('${ALUMNO}','alumno@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin@t','Admin GOZS','ADMIN',NULL,'ACTIVA'),
    ('${COACH_ASIGNADO}','coach1@t','Coach Asignado','ENTRENADOR',NULL,'ACTIVA'),
    ('${COACH_AJENO}','coach3@t','Coach Ajeno','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','alumno@t','Alumno GOZS','ALUMNO','${COACH_ASIGNADO}','ACTIVA');
`;

let db: PGlite;

async function aplicarMigracion(sql: string) {
  const inicio = sql.search(/^BEGIN;/m);
  if (inicio > 0) {
    await db.exec(sql.slice(0, inicio));
    await db.exec(sql.slice(inicio));
  } else {
    await db.exec(sql);
  }
}

function como<T>(rol: Rol, sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql);
  });
}

async function contarConversaciones(alumnoId: string): Promise<number> {
  const res = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public.conversaciones WHERE alumno_id = '${alumnoId}'`
  );
  return res.rows[0]!.n;
}

describe("GH #125 (GOZS-116): hardening de obtener_o_crear_conversacion", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);

    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      if (archivo === "20261019000000_contrataciones_pagos_auditoria_backup.sql") {
        await db.exec(SEED_PERFILES);
      }
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
  }, 60_000);

  describe("1. Rechazos (ERRCODE 42501) sin efectos secundarios", () => {
    it("un usuario anónimo recibe 42501 y no se crea ninguna fila", async () => {
      await expect(
        como("anon", null, `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`)
      ).rejects.toMatchObject({ code: "42501" });
      expect(await contarConversaciones(ALUMNO)).toBe(0);
    });

    it("un entrenador ajeno recibe 42501 y no se crea ninguna fila", async () => {
      await expect(
        como(
          "authenticated",
          COACH_AJENO,
          `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`
        )
      ).rejects.toMatchObject({ code: "42501" });
      expect(await contarConversaciones(ALUMNO)).toBe(0);
    });
  });

  describe("2. Accesos autorizados inicializan responsable_id", () => {
    it("el alumno recibe el ID y responsable_id = profesor_asignado_id", async () => {
      const res = await como<{ obtener_o_crear_conversacion: string }>(
        "authenticated",
        ALUMNO,
        `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`
      );
      const convId = res.rows[0]!.obtener_o_crear_conversacion;
      expect(convId).toBeTruthy();

      const conv = await db.query<{ responsable_id: string | null }>(
        `SELECT responsable_id FROM public.conversaciones WHERE id = '${convId}'`
      );
      expect(conv.rows[0]!.responsable_id).toBe(COACH_ASIGNADO);
      expect(await contarConversaciones(ALUMNO)).toBe(1);
    });

    it("su entrenador recibe el mismo ID (idempotente)", async () => {
      const res = await como<{ obtener_o_crear_conversacion: string }>(
        "authenticated",
        COACH_ASIGNADO,
        `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`
      );
      expect(res.rows[0]!.obtener_o_crear_conversacion).toBeTruthy();
      expect(await contarConversaciones(ALUMNO)).toBe(1);
    });

    it("un ADMIN recibe el ID de la conversación", async () => {
      const res = await como<{ obtener_o_crear_conversacion: string }>(
        "authenticated",
        ADMIN,
        `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`
      );
      expect(res.rows[0]!.obtener_o_crear_conversacion).toBeTruthy();
      expect(await contarConversaciones(ALUMNO)).toBe(1);
    });
  });
});
