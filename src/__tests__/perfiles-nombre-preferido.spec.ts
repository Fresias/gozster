import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const COACH = "00000000-0000-0000-0000-000000000002";
const ALUMNO = "00000000-0000-0000-0000-000000000004";
const OTRO_ALUMNO = "00000000-0000-0000-0000-000000000005";

type Rol = "anon" | "authenticated" | "service_role";

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    instance_id uuid,
    aud text,
    role text,
    email text,
    encrypted_password text,
    email_confirmed_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
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
    ('${COACH}','coach@t'),('${ALUMNO}','a@t'),('${OTRO_ALUMNO}','b@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','a@t','Lucía Fernández','ALUMNO','${COACH}','ACTIVA'),
    ('${OTRO_ALUMNO}','b@t','Marcos Díaz','ALUMNO','${COACH}','ACTIVA');
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

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe("BE-01 (D-53): perfiles.nombre_preferido y RPC actualizar_nombre_preferido (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);

    const archivos = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const archivo of archivos) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8");
      await aplicarMigracion(sql);
    }

    await db.exec(SEED_PERFILES);
  }, 120_000);

  it("1. permite al alumno actualizar su propio nombre_preferido (recortado) y leerlo", async () => {
    const res = await como<{ actualizar_nombre_preferido: string | null }>(
      "authenticated",
      ALUMNO,
      `SELECT public.actualizar_nombre_preferido($1)`,
      ["  Lu  "],
    );
    expect(res.rows[0]?.actualizar_nombre_preferido).toBe("Lu");

    const lectura = await como<{ nombre_preferido: string | null }>(
      "authenticated",
      ALUMNO,
      `SELECT nombre_preferido FROM public.perfiles WHERE id = $1`,
      [ALUMNO],
    );
    expect(lectura.rows[0]?.nombre_preferido).toBe("Lu");

    // Límite exacto de 30 caracteres también es válido
    const treinta = "A".repeat(30);
    const res30 = await como<{ actualizar_nombre_preferido: string | null }>(
      "authenticated",
      ALUMNO,
      `SELECT public.actualizar_nombre_preferido($1)`,
      [treinta],
    );
    expect(res30.rows[0]?.actualizar_nombre_preferido).toBe(treinta);
  });

  it("2. rechaza un nombre de 31 caracteres con ERRCODE 22001", async () => {
    const treintaYUno = "A".repeat(31);
    let capturedCode: string | undefined;
    try {
      await como(
        "authenticated",
        ALUMNO,
        `SELECT public.actualizar_nombre_preferido($1)`,
        [treintaYUno],
      );
    } catch (err: unknown) {
      capturedCode = (err as { code?: string }).code;
    }
    expect(capturedCode).toBe("22001");

    // El check constraint de la tabla también protege contra escrituras directas fuera de rango
    await expect(
      db.query(
        `UPDATE public.perfiles SET nombre_preferido = $1 WHERE id = $2`,
        [treintaYUno, ALUMNO],
      ),
    ).rejects.toThrow(/perfiles_nombre_preferido_check/);
  });

  it("3. convierte string vacío o solo espacios (y NULL) en NULL", async () => {
    await como(
      "authenticated",
      ALUMNO,
      `SELECT public.actualizar_nombre_preferido($1)`,
      ["Lu"],
    );

    const resVacio = await como<{ actualizar_nombre_preferido: string | null }>(
      "authenticated",
      ALUMNO,
      `SELECT public.actualizar_nombre_preferido($1)`,
      ["   "],
    );
    expect(resVacio.rows[0]?.actualizar_nombre_preferido).toBeNull();

    const lectura = await db.query<{ nombre_preferido: string | null }>(
      `SELECT nombre_preferido FROM public.perfiles WHERE id = $1`,
      [ALUMNO],
    );
    expect(lectura.rows[0]?.nombre_preferido).toBeNull();

    // Llamada sin argumentos usa DEFAULT NULL
    const resDefault = await como<{ actualizar_nombre_preferido: string | null }>(
      "authenticated",
      ALUMNO,
      `SELECT public.actualizar_nombre_preferido()`,
    );
    expect(resDefault.rows[0]?.actualizar_nombre_preferido).toBeNull();
  });

  it("4. no permite cambiar el nombre_preferido de otro alumno ni ejecutar sin autenticación", async () => {
    await como(
      "authenticated",
      OTRO_ALUMNO,
      `SELECT public.actualizar_nombre_preferido($1)`,
      ["Marquitos"],
    );

    // ALUMNO solo puede modificar su propia fila via RPC
    await como(
      "authenticated",
      ALUMNO,
      `SELECT public.actualizar_nombre_preferido($1)`,
      ["Intento"],
    );

    const otro = await db.query<{ nombre_preferido: string | null }>(
      `SELECT nombre_preferido FROM public.perfiles WHERE id = $1`,
      [OTRO_ALUMNO],
    );
    expect(otro.rows[0]?.nombre_preferido).toBe("Marquitos");

    // Tampoco por UPDATE directo (RLS filtra 0 filas)
    const upd = await como(
      "authenticated",
      ALUMNO,
      `UPDATE public.perfiles SET nombre_preferido = 'Hack' WHERE id = $1`,
      [OTRO_ALUMNO],
    );
    expect(upd.affectedRows).toBe(0);

    const otroDespues = await db.query<{ nombre_preferido: string | null }>(
      `SELECT nombre_preferido FROM public.perfiles WHERE id = $1`,
      [OTRO_ALUMNO],
    );
    expect(otroDespues.rows[0]?.nombre_preferido).toBe("Marquitos");

    // anon no tiene permiso EXECUTE; authenticated sin sub falla con 42501
    await expect(
      como("anon", null, `SELECT public.actualizar_nombre_preferido('Anon')`),
    ).rejects.toThrow();

    let unauthCode: string | undefined;
    try {
      await como(
        "authenticated",
        null,
        `SELECT public.actualizar_nombre_preferido('SinSub')`,
      );
    } catch (err: unknown) {
      unauthCode = (err as { code?: string }).code;
    }
    expect(unauthCode).toBe("42501");
  });
});
