import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Issue #49: pruebas RLS ejecutadas sobre Postgres real (PGlite) con todas las
// migraciones aplicadas y stubs mínimos de Supabase (roles y auth.uid()/auth.role()).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261018000000_auth_invitacion_hardening_rls.sql";
const FUNCTION_PATH = path.resolve(__dirname, "../../supabase/functions/invitar-alumno/index.ts");

const COACH = "00000000-0000-0000-0000-00000000c0ac";
const OTRO_COACH = "00000000-0000-0000-0000-0000000000c2";
const ALUMNO_A = "00000000-0000-0000-0000-00000000000a";
const ALUMNO_B = "00000000-0000-0000-0000-00000000000b";
const NUEVO = "00000000-0000-0000-0000-00000000000e";
const ITEM_RUTINA_A = "00000000-0000-0000-0000-0000000b0001";
const EJERCICIO_2 = "00000000-0000-0000-0000-0000000e0002";

type Rol = "anon" | "authenticated" | "service_role";

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

// Políticas que existen en el proyecto en vivo pero no en las migraciones
const DRIFT_EN_VIVO = `
  CREATE POLICY "drift_anon_perfiles" ON public.perfiles FOR SELECT TO anon USING (true);
  CREATE POLICY "drift_anon_planes" ON public.planes_entrenamiento FOR SELECT TO anon USING (true);
  CREATE POLICY "drift_public_ejercicios" ON public.ejercicios FOR SELECT USING (true);
`;

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${COACH}','coach@t'),('${OTRO_COACH}','c2@t'),('${ALUMNO_A}','a@t'),('${ALUMNO_B}','b@t'),('${NUEVO}','n@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id) VALUES
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL),
    ('${OTRO_COACH}','c2@t','Otro coach','ENTRENADOR',NULL),
    ('${ALUMNO_A}','a@t','Alumno A','ALUMNO','${COACH}'),
    ('${ALUMNO_B}','b@t','Alumno B','ALUMNO','${OTRO_COACH}');
  INSERT INTO public.ejercicios (id, nombre) VALUES
    ('00000000-0000-0000-0000-0000000e0001','Sentadilla'),('${EJERCICIO_2}','Prensa');
  INSERT INTO public.planes_entrenamiento (id, nombre, alumno_id, profesor_id)
    VALUES ('00000000-0000-0000-0000-0000000f0001','Plan A','${ALUMNO_A}','${COACH}');
  INSERT INTO public.dias_rutina (id, plan_id, nombre, orden)
    VALUES ('00000000-0000-0000-0000-0000000d0001','00000000-0000-0000-0000-0000000f0001','Día 1',1);
  INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones)
    VALUES ('${ITEM_RUTINA_A}','00000000-0000-0000-0000-0000000d0001','00000000-0000-0000-0000-0000000e0001',1,3,'10');
  INSERT INTO public.habitos_registros (alumno_id, pasos) VALUES ('${ALUMNO_A}', 1000), ('${ALUMNO_B}', 2000);
`;

let db: PGlite;
let politicasAntes: string[] = [];
let anonPerfilesAntes = 0;

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

async function politicas(): Promise<string[]> {
  const r = await db.query<{ p: string }>(
    `SELECT tablename || '.' || policyname AS p FROM pg_policies WHERE schemaname = 'public' ORDER BY 1`
  );
  return r.rows.map((x) => x.p);
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

async function contar(rol: Rol, sub: string | null, tabla: string): Promise<number> {
  const r = await como<{ n: number }>(rol, sub, `SELECT count(*)::int AS n FROM public.${tabla}`);
  return r.rows[0]?.n ?? -1;
}

const DENEGADO = /row-level security|permission denied|Solo|No autorizado/;

describe("Issue #49: hardening de RLS y alta de alumnos por invitación", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);

    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      if (archivo === NEW_MIGRATION) {
        await db.exec(DRIFT_EN_VIVO);
        await db.exec(SEED);
        politicasAntes = await politicas();
        anonPerfilesAntes = await contar("anon", null, "perfiles");
      }
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    // Idempotencia
    await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));
  }, 60_000);

  describe("1. Limpieza de políticas inseguras (drift en vivo)", () => {
    it("reproduce el hallazgo de auditoría: anon leía perfiles antes del fix", () => {
      expect(anonPerfilesAntes).toBe(4);
    });

    it("elimina sólo el drift anónimo y las políticas USING (true) de habitos/nutricion", async () => {
      const despues = await politicas();
      const eliminadas = politicasAntes.filter((p) => !despues.includes(p)).sort();
      expect(eliminadas).toEqual([
        "ejercicios.drift_public_ejercicios",
        "habitos_registros.habitos_escritura_autenticada",
        "habitos_registros.habitos_lectura_autenticada",
        "nutricion_registros.nutricion_escritura_autenticada",
        "nutricion_registros.nutricion_lectura_autenticada",
        "perfiles.drift_anon_perfiles",
        "planes_entrenamiento.drift_anon_planes",
      ]);
    });

    it("no queda ninguna política para anon ni con USING/WITH CHECK (true)", async () => {
      const r = await db.query(
        `SELECT 1 FROM pg_policies WHERE schemaname = 'public'
           AND ('anon' = ANY (roles) OR qual = 'true' OR with_check = 'true')`
      );
      expect(r.rows).toHaveLength(0);
    });
  });

  describe("2. Rol anónimo (clave publishable sin sesión)", () => {
    it.each([
      "perfiles",
      "ejercicios",
      "planes_entrenamiento",
      "dias_rutina",
      "ejercicios_en_rutina",
      "registro_sesiones",
      "registro_series",
      "habitos_registros",
      "nutricion_registros",
      "entrenador_alumnos",
      "conversaciones",
      "mensajes",
      "alertas_entrenador",
      "alumno_historial_dolor",
    ])("no ve filas en %s", async (tabla) => {
      expect(await contar("anon", null, tabla)).toBe(0);
    });

    it("no puede escribir en habitos_registros", async () => {
      await expect(
        como("anon", null, `INSERT INTO public.habitos_registros (alumno_id) VALUES ('${ALUMNO_A}')`)
      ).rejects.toThrow(DENEGADO);
    });

    it("no puede ejecutar quick_swap_ejercicio (REVOKE)", async () => {
      await expect(
        como("anon", null, `SELECT public.quick_swap_ejercicio('${ITEM_RUTINA_A}','${EJERCICIO_2}')`)
      ).rejects.toThrow(/permission denied for function/);
    });
  });

  describe("3. Alumno autenticado", () => {
    it("ve sólo su perfil, su plan y sus hábitos", async () => {
      expect(await contar("authenticated", ALUMNO_A, "perfiles")).toBe(1);
      expect(await contar("authenticated", ALUMNO_A, "planes_entrenamiento")).toBe(1);
      expect(await contar("authenticated", ALUMNO_A, "habitos_registros")).toBe(1);
    });

    it("puede editar datos no privilegiados de su perfil", async () => {
      await expect(
        como("authenticated", ALUMNO_A, `UPDATE public.perfiles SET nombre_completo = 'A editado' WHERE id = '${ALUMNO_A}'`)
      ).resolves.toBeDefined();
    });

    it.each([
      ["rol = 'ADMIN'"],
      ["rol = 'ENTRENADOR'"],
      ["estado_membresia = 'BAJA'"],
      [`profesor_asignado_id = '${OTRO_COACH}'`],
      ["fecha_baja = now()"],
    ])("NO puede auto-modificar %s", async (cambio) => {
      await expect(
        como("authenticated", ALUMNO_A, `UPDATE public.perfiles SET ${cambio} WHERE id = '${ALUMNO_A}'`)
      ).rejects.toThrow(DENEGADO);
    });

    it("registra sus hábitos pero no los de otro alumno", async () => {
      await expect(
        como("authenticated", ALUMNO_A, `INSERT INTO public.habitos_registros (alumno_id, fecha) VALUES ('${ALUMNO_A}', CURRENT_DATE + 1)`)
      ).resolves.toBeDefined();
      await expect(
        como("authenticated", ALUMNO_A, `INSERT INTO public.habitos_registros (alumno_id, fecha) VALUES ('${ALUMNO_B}', CURRENT_DATE + 1)`)
      ).rejects.toThrow(DENEGADO);
    });

    it("un usuario sin perfil no puede auto-crearse un perfil ADMIN o ENTRENADOR", async () => {
      for (const rol of ["ADMIN", "ENTRENADOR"]) {
        await expect(
          como("authenticated", NUEVO, `INSERT INTO public.perfiles (id, email, nombre_completo, rol) VALUES ('${NUEVO}','n@t','N','${rol}')`)
        ).rejects.toThrow(DENEGADO);
      }
    });
  });

  describe("4. Entrenador", () => {
    it("ve su perfil y a sus alumnos, no a los de otro entrenador", async () => {
      const r = await como<{ id: string }>("authenticated", COACH, `SELECT id FROM public.perfiles`);
      const ids = r.rows.map((x) => x.id);
      expect(ids).toEqual(expect.arrayContaining([COACH, ALUMNO_A]));
      expect(ids).not.toContain(ALUMNO_B);
    });

    it("gestiona membresía y baja de su alumno", async () => {
      await expect(
        como("authenticated", COACH, `UPDATE public.perfiles SET estado_membresia = 'INACTIVA', fecha_baja = now() WHERE id = '${ALUMNO_A}'`)
      ).resolves.toBeDefined();
    });

    it("NO puede cambiar roles (ni el de su alumno ni el propio)", async () => {
      for (const id of [ALUMNO_A, COACH]) {
        await expect(
          como("authenticated", COACH, `UPDATE public.perfiles SET rol = 'ADMIN' WHERE id = '${id}'`)
        ).rejects.toThrow(DENEGADO);
      }
    });

    it("NO modifica alumnos de otro entrenador", async () => {
      const r = await como("authenticated", COACH, `UPDATE public.perfiles SET estado_membresia = 'BAJA' WHERE id = '${ALUMNO_B}' RETURNING id`);
      expect(r.rows).toHaveLength(0);
    });

    it("ejecuta quick_swap en la rutina de su alumno", async () => {
      await expect(
        como("authenticated", COACH, `SELECT public.quick_swap_ejercicio('${ITEM_RUTINA_A}','${EJERCICIO_2}')`)
      ).resolves.toBeDefined();
    });
  });

  describe("5. service_role (Edge Function invitar-alumno)", () => {
    it("crea el perfil ALUMNO vinculado al entrenador y queda visible para ambos", async () => {
      await como(
        "service_role",
        null,
        `INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id)
         VALUES ('${NUEVO}','n@t','Nuevo','ALUMNO','${COACH}')
         ON CONFLICT (id) DO UPDATE SET profesor_asignado_id = EXCLUDED.profesor_asignado_id`
      );
      const visibleCoach = await como("authenticated", COACH, `SELECT 1 FROM public.perfiles WHERE id = '${NUEVO}'`);
      expect(visibleCoach.rows).toHaveLength(1);
      expect(await contar("authenticated", NUEVO, "perfiles")).toBe(1);
    });
  });

  describe("6. Edge Function invitar-alumno", () => {
    const fuente = fs.readFileSync(FUNCTION_PATH, "utf-8");

    it("verifica la sesión del llamante y exige rol ENTRENADOR o ADMIN desde perfiles", () => {
      expect(fuente).toContain("admin.auth.getUser(token)");
      expect(fuente).toContain('.from("perfiles")');
      expect(fuente).toContain('["ENTRENADOR", "ADMIN"].includes(perfilEntrenador.rol)');
      expect(fuente).not.toMatch(/user_metadata/);
    });

    it("invita por email (el alumno elige su contraseña) y nunca registra con contraseña", () => {
      expect(fuente).toContain("admin.auth.admin.inviteUserByEmail(email");
      expect(fuente).not.toMatch(/signUp|createUser|password/);
    });

    it("crea el perfil ALUMNO vinculado al entrenador y revierte el usuario si falla", () => {
      expect(fuente).toContain('rol: "ALUMNO"');
      expect(fuente).toContain("profesor_asignado_id: entrenadorId");
      expect(fuente).toContain("admin.auth.admin.deleteUser(alumnoId)");
    });
  });
});
