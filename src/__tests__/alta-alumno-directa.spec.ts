import { describe, it, expect, beforeAll, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import {
  crearHandler,
  generarPasswordTemporal,
  type AltaAlumnoDeps,
} from "../../supabase/functions/alta-alumno-directa/handler";

// Issue #55: alta directa de alumnos con contraseña temporal y cambio obligatorio
// en el primer login. Migración probada sobre Postgres real (PGlite) y lógica de
// la Edge Function con dependencias simuladas.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261018100000_alta_alumno_directa_primer_login.sql";

const COACH = "00000000-0000-0000-0000-00000000c0ac";
const OTRO_COACH = "00000000-0000-0000-0000-0000000000c2";
const ALUMNO = "00000000-0000-0000-0000-00000000000a";

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

const SEED = `
  INSERT INTO auth.users (id, email, encrypted_password) VALUES
    ('${COACH}','coach@t','x'),('${OTRO_COACH}','c2@t','x'),('${ALUMNO}','a@t','hash-temporal');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id) VALUES
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL),
    ('${OTRO_COACH}','c2@t','Otro coach','ENTRENADOR',NULL),
    ('${ALUMNO}','a@t','Alumno','ALUMNO','${COACH}');
`;

let db: PGlite;

async function aplicarMigracion(sql: string) {
  // Statements previos a BEGIN (ALTER TYPE ... ADD VALUE) requieren su propia transacción
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

async function flagAlumno(): Promise<boolean> {
  const r = await db.query<{ f: boolean }>(`SELECT debe_cambiar_password AS f FROM public.perfiles WHERE id = '${ALUMNO}'`);
  return r.rows[0]!.f;
}

/** Simula al alta (service_role) dejando el flag activo. */
async function activarFlag() {
  await como("service_role", null, `UPDATE public.perfiles SET debe_cambiar_password = true WHERE id = '${ALUMNO}'`);
}

const DENEGADO = /row-level security|permission denied|Solo|permisos/;

describe("Issue #55: migración debe_cambiar_password (PGlite)", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      if (archivo === NEW_MIGRATION) await db.exec(SEED);
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    // Idempotencia
    await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
  }, 60_000);

  it("crea la columna NOT NULL DEFAULT false y su índice parcial", async () => {
    const col = await db.query<{ is_nullable: string; column_default: string }>(
      `SELECT is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'perfiles' AND column_name = 'debe_cambiar_password'`
    );
    expect(col.rows[0]).toEqual({ is_nullable: "NO", column_default: "false" });
    const idx = await db.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'idx_perfiles_debe_cambiar_password'`);
    expect(idx.rows).toHaveLength(1);
    expect(await flagAlumno()).toBe(false);
  });

  it("service_role (Edge Function) crea el perfil con debe_cambiar_password = true", async () => {
    await activarFlag();
    expect(await flagAlumno()).toBe(true);
  });

  describe("alumno", () => {
    it("puede apagar su propio flag (true -> false) pero NO puede reactivarlo (false -> true)", async () => {
      await activarFlag();
      await como("authenticated", ALUMNO, `UPDATE public.perfiles SET debe_cambiar_password = false WHERE id = '${ALUMNO}'`);
      expect(await flagAlumno()).toBe(false);
      await expect(
        como("authenticated", ALUMNO, `UPDATE public.perfiles SET debe_cambiar_password = true WHERE id = '${ALUMNO}'`)
      ).rejects.toThrow(DENEGADO);
      expect(await flagAlumno()).toBe(false);
    });

    it.each([["rol = 'ADMIN'"], [`profesor_asignado_id = '${OTRO_COACH}'`]])(
      "sigue sin poder auto-modificar %s",
      async (cambio) => {
        await expect(
          como("authenticated", ALUMNO, `UPDATE public.perfiles SET ${cambio} WHERE id = '${ALUMNO}'`)
        ).rejects.toThrow(DENEGADO);
      }
    );

    it("al cambiar su contraseña en Auth el flag se apaga", async () => {
      await activarFlag();
      // Supabase Auth escribe auth.users con su propio rol y sin JWT de PostgREST
      await db.exec(`UPDATE auth.users SET encrypted_password = 'hash-definitivo' WHERE id = '${ALUMNO}'`);
      expect(await flagAlumno()).toBe(false);
    });

    it("tras el cambio puede confirmar debe_cambiar_password = false (no-op permitido)", async () => {
      await expect(
        como("authenticated", ALUMNO, `UPDATE public.perfiles SET debe_cambiar_password = false WHERE id = '${ALUMNO}'`)
      ).resolves.toBeDefined();
    });

    it("otras actualizaciones de auth.users no tocan el flag", async () => {
      await activarFlag();
      await db.exec(`UPDATE auth.users SET email = 'a2@t' WHERE id = '${ALUMNO}'`);
      expect(await flagAlumno()).toBe(true);
    });
  });

  describe("entrenador", () => {
    it("su entrenador asignado puede reactivar el flag", async () => {
      await db.exec(`UPDATE auth.users SET encrypted_password = 'otro-hash' WHERE id = '${ALUMNO}'`);
      await como("authenticated", COACH, `UPDATE public.perfiles SET debe_cambiar_password = true WHERE id = '${ALUMNO}'`);
      expect(await flagAlumno()).toBe(true);
    });

    it("otro entrenador no puede tocarlo", async () => {
      const r = await como(
        "authenticated",
        OTRO_COACH,
        `UPDATE public.perfiles SET debe_cambiar_password = false WHERE id = '${ALUMNO}' RETURNING id`
      );
      expect(r.rows).toHaveLength(0);
      expect(await flagAlumno()).toBe(true);
    });
  });

  it("authenticated no puede ejecutar la función del trigger directamente", async () => {
    await expect(
      como("authenticated", ALUMNO, `SELECT public.fn_limpiar_debe_cambiar_password()`)
    ).rejects.toThrow(/permission denied|trigger functions can only be called as triggers/);
  });
});

describe("Issue #55: generarPasswordTemporal", () => {
  const muestras = Array.from({ length: 500 }, () => generarPasswordTemporal());

  it("genera 14 caracteres por defecto y respeta el rango 12-16", () => {
    expect(muestras.every((p) => p.length === 14)).toBe(true);
    expect(generarPasswordTemporal(12)).toHaveLength(12);
    expect(generarPasswordTemporal(16)).toHaveLength(16);
    expect(() => generarPasswordTemporal(11)).toThrow(RangeError);
    expect(() => generarPasswordTemporal(17)).toThrow(RangeError);
  });

  it("incluye mayúscula, minúscula, dígito y símbolo legible", () => {
    for (const p of muestras) {
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[!@#$%*?\-_+=]/);
      expect(p).toMatch(/^[A-Za-z0-9!@#$%*?\-_+=]+$/);
    }
  });

  it("excluye caracteres ambiguos (0 O 1 l I)", () => {
    expect(muestras.some((p) => /[0O1lI]/.test(p))).toBe(false);
  });

  it("no repite contraseñas", () => {
    expect(new Set(muestras).size).toBe(muestras.length);
  });
});

describe("Issue #55: handler alta-alumno-directa", () => {
  const TOKENS: Record<string, string> = { "tok-coach": COACH, "tok-alumno": ALUMNO };
  const ROLES: Record<string, string> = { [COACH]: "ENTRENADOR", [ALUMNO]: "ALUMNO" };
  const NUEVO_ID = "00000000-0000-0000-0000-00000000000e";

  function deps(over: Partial<AltaAlumnoDeps> = {}) {
    const d: AltaAlumnoDeps = {
      usuarioDesdeToken: vi.fn(async (t: string) => TOKENS[t] ?? null),
      rolDePerfil: vi.fn(async (id: string) => ROLES[id] ?? null),
      crearUsuario: vi.fn(async () => ({ id: NUEVO_ID })),
      upsertPerfil: vi.fn(async () => true),
      eliminarUsuario: vi.fn(async () => {}),
      enviarCredenciales: vi.fn(async () => true),
      ...over,
    };
    return d;
  }

  function post(body: unknown, token?: string) {
    return new Request("https://x/functions/v1/alta-alumno-directa", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("ENTRENADOR: 201 con contraseña temporal, email confirmado y perfil con flag", async () => {
    const d = deps();
    const res = await crearHandler(d, "https://gozster.vercel.app")(post({ email: " Nuevo@Alumno.com " }, "tok-coach"));
    expect(res.status).toBe(201);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ alumno_id: NUEVO_ID, email: "nuevo@alumno.com", email_enviado: true });
    expect(body.password_temporal).toMatch(/^.{14}$/);
    expect(typeof body.mensaje).toBe("string");

    expect(d.crearUsuario).toHaveBeenCalledWith({
      email: "nuevo@alumno.com",
      password: body.password_temporal,
      email_confirm: true,
      user_metadata: { must_change_password: true, rol: "ALUMNO", nombre_completo: "nuevo" },
    });
    expect(d.upsertPerfil).toHaveBeenCalledWith({
      id: NUEVO_ID,
      email: "nuevo@alumno.com",
      nombre_completo: "nuevo",
      rol: "ALUMNO",
      estado_membresia: "ACTIVA",
      profesor_asignado_id: COACH,
      debe_cambiar_password: true,
      telefono: null,
    });
    expect(d.enviarCredenciales).toHaveBeenCalledWith({
      email: "nuevo@alumno.com",
      nombre: "nuevo",
      password: body.password_temporal,
    });
  });

  it("usa el nombre provisto cuando se envía", async () => {
    const d = deps();
    await crearHandler(d, "*")(post({ email: "a@b.co", nombre_completo: "Ana Pérez" }, "tok-coach"));
    expect(d.upsertPerfil).toHaveBeenCalledWith(expect.objectContaining({ nombre_completo: "Ana Pérez" }));
  });

  it("anónimo (sin token): 401", async () => {
    const d = deps();
    const res = await crearHandler(d, "*")(post({ email: "a@b.co" }));
    expect(res.status).toBe(401);
    expect(d.crearUsuario).not.toHaveBeenCalled();
  });

  it("token inválido: 401", async () => {
    const res = await crearHandler(deps(), "*")(post({ email: "a@b.co" }, "tok-falso"));
    expect(res.status).toBe(401);
  });

  it("ALUMNO: 403", async () => {
    const d = deps();
    const res = await crearHandler(d, "*")(post({ email: "a@b.co" }, "tok-alumno"));
    expect(res.status).toBe(403);
    expect(d.crearUsuario).not.toHaveBeenCalled();
  });

  it("email existente: 409 con mensaje claro", async () => {
    const d = deps({ crearUsuario: vi.fn(async () => ({ error: "email_existe" as const })) });
    const res = await crearHandler(d, "*")(post({ email: "a@b.co" }, "tok-coach"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Ya existe/);
    expect(d.upsertPerfil).not.toHaveBeenCalled();
  });

  it.each([[{ email: "no-es-email" }], [{}], ["{json roto"], ["null"]])("entrada inválida %j: 400", async (body) => {
    const d = deps();
    const res = await crearHandler(d, "*")(post(body, "tok-coach"));
    expect(res.status).toBe(400);
    expect(d.crearUsuario).not.toHaveBeenCalled();
  });

  it("si falla el perfil elimina el usuario de Auth (sin huérfanos): 500", async () => {
    const d = deps({ upsertPerfil: vi.fn(async () => false) });
    const res = await crearHandler(d, "*")(post({ email: "a@b.co" }, "tok-coach"));
    expect(res.status).toBe(500);
    expect(d.eliminarUsuario).toHaveBeenCalledWith(NUEVO_ID);
  });

  it("si el email no se puede enviar igual responde 201 con la contraseña (contingencia)", async () => {
    const d = deps({ enviarCredenciales: vi.fn(async () => Promise.reject(new Error("smtp"))) });
    const res = await crearHandler(d, "*")(post({ email: "a@b.co" }, "tok-coach"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email_enviado).toBe(false);
    expect(body.password_temporal).toBeTruthy();
    expect(body.mensaje).toContain("https://gozster.vercel.app/login");
  });

  it("OPTIONS responde CORS y otros métodos 405", async () => {
    const h = crearHandler(deps(), "https://gozster.vercel.app");
    const pre = await h(new Request("https://x", { method: "OPTIONS" }));
    expect(pre.headers.get("Access-Control-Allow-Origin")).toBe("https://gozster.vercel.app");
    expect((await h(new Request("https://x", { method: "GET" }))).status).toBe(405);
  });
});
