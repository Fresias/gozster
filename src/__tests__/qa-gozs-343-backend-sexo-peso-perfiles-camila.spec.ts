import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { REAL_ALUMNOS } from "@/services/real-mynter-data";
import { DEMO_ALUMNOS, DEMO_ALUMNOS_CLASES } from "@/services/coach-demo-dataset";
import { calcularRankingRelativo } from "@/store/use-ranking-store";
import { crearHandler, type AltaAlumnoDeps } from "../../supabase/functions/alta-alumno-directa/handler";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NUEVA_MIGRACION = "20261103200000_perfiles_sexo_peso_camila_navarro.sql";

const COACH_ID = "20685bca-6304-4e55-abba-37a1cf8f6113";
const ALUMNO_ID = "e8b1a08c-3430-4000-8000-000000000008"; // Camila Navarro

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

function como(rol: "anon" | "authenticated" | "service_role", sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query(sql);
  });
}

describe("GOZS-343: DB & Seeds - Sexo biológico y peso corporal en perfiles", () => {
  describe("1. Dataset REAL_ALUMNOS y Demostración", () => {
    it("Camila Navarro está presente en REAL_ALUMNOS con sexo 'F' y peso_corporal_kg 55.0", () => {
      const camila = REAL_ALUMNOS.find((a) => a.nombre_completo.toLowerCase() === "camila navarro");
      expect(camila).toBeDefined();
      expect(camila?.sexo).toBe("F");
      expect(camila?.peso_corporal_kg).toBe(55.0);
      expect(camila?.rol).toBe("ALUMNO");
      expect(camila?.estado_membresia).toBe("ACTIVA");
    });

    it("todos los alumnos en REAL_ALUMNOS tienen sexo biológico ('M' | 'F') y peso corporal definido", () => {
      expect(REAL_ALUMNOS.length).toBeGreaterThanOrEqual(14);
      for (const alumno of REAL_ALUMNOS) {
        expect(["M", "F"]).toContain(alumno.sexo);
        expect(typeof alumno.peso_corporal_kg).toBe("number");
        expect(alumno.peso_corporal_kg).toBeGreaterThan(0);
        expect(alumno.peso_corporal_kg).toBeLessThanOrEqual(500);
      }
    });

    it("Camila Navarro en DEMO_ALUMNOS cuenta con sexo 'F' y peso 55.0", () => {
      const camilaDemo = DEMO_ALUMNOS.find((a) => a.nombre_completo === "Camila Navarro");
      expect(camilaDemo).toBeDefined();
      expect(camilaDemo?.sexo).toBe("F");
      expect(camilaDemo?.peso_corporal_kg).toBe(55.0);
    });

    it("GIVEN la clase funcional con Camila Navarro, WHEN se calcula ranking, THEN clasifica automáticamente sin inputs manuales", () => {
      const camila = REAL_ALUMNOS.find((a) => a.nombre_completo === "Camila Navarro")!;
      const resultado = calcularRankingRelativo({
        prs: [
          {
            id: "pr-camila-test",
            clase_id: "clase-func-1",
            alumno_id: camila.id,
            ejercicio_id: "ej-dominadas",
            fecha: "2026-11-03",
            peso_kg: 22,
            reps: 1,
            registrado_por: COACH_ID,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        claseId: "clase-func-1",
        ejercicioId: "ej-dominadas",
        alumnos: [camila],
      });

      expect(resultado.sinClasificar).toHaveLength(0);
      expect(resultado.mujeres).toHaveLength(1);
      expect(resultado.mujeres[0]!.nombre_completo).toBe("Camila Navarro");
      expect(resultado.mujeres[0]!.ratio).toBe(0.4); // 22 / 55 = 0.4
      expect(resultado.mujeres[0]!.sexo).toBe("F");
      expect(resultado.mujeres[0]!.peso_corporal_kg).toBe(55);
    });
  });

  describe("2. Edge Function alta-alumno-directa: recepción y persistencia de sexo y peso", () => {
    function crearDepsMock(): AltaAlumnoDeps & {
      ultimoUsuarioCreado: any;
      ultimoPerfilUpsert: any;
    } {
      const mock = {
        ultimoUsuarioCreado: null as any,
        ultimoPerfilUpsert: null as any,
        usuarioDesdeToken: vi.fn().mockResolvedValue(COACH_ID),
        rolDePerfil: vi.fn().mockResolvedValue("ENTRENADOR"),
        crearUsuario: vi.fn().mockImplementation(async (attrs) => {
          mock.ultimoUsuarioCreado = attrs;
          return { id: "nuevo-alumno-uuid" };
        }),
        upsertPerfil: vi.fn().mockImplementation(async (perfil) => {
          mock.ultimoPerfilUpsert = perfil;
          return true;
        }),
        eliminarUsuario: vi.fn().mockResolvedValue(undefined),
        enviarCredenciales: vi.fn().mockResolvedValue(true),
      };
      return mock;
    }

    it("persiste sexo = 'F' y peso_corporal_kg = 55.0 cuando se envían en el alta", async () => {
      const deps = crearDepsMock();
      const handler = crearHandler(deps, "https://test.local");

      const req = new Request("https://test.local/alta-alumno-directa", {
        method: "POST",
        headers: {
          Authorization: "Bearer coach-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "camila.navarro@ficticio.ar",
          nombre_completo: "Camila Navarro",
          sexo: "F",
          peso_corporal_kg: 55.0,
        }),
      });

      const res = await handler(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.sexo).toBe("F");
      expect(json.peso_corporal_kg).toBe(55.0);

      // Verificado en user_metadata de Auth
      expect(deps.ultimoUsuarioCreado.user_metadata.sexo).toBe("F");
      expect(deps.ultimoUsuarioCreado.user_metadata.peso_corporal_kg).toBe(55.0);

      // Verificado en public.perfiles
      expect(deps.ultimoPerfilUpsert.sexo).toBe("F");
      expect(deps.ultimoPerfilUpsert.peso_corporal_kg).toBe(55.0);
    });

    it("rechaza sexo inválido con 400", async () => {
      const deps = crearDepsMock();
      const handler = crearHandler(deps, "https://test.local");

      const req = new Request("https://test.local/alta-alumno-directa", {
        method: "POST",
        headers: {
          Authorization: "Bearer coach-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "alumno@test.com",
          nombre_completo: "Alumno Test",
          sexo: "INVALIDO",
          peso_corporal_kg: 70,
        }),
      });

      const res = await handler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("sexo biológico");
    });

    it("rechaza peso corporal no plausible (<= 0 o > 500) con 400", async () => {
      const deps = crearDepsMock();
      const handler = crearHandler(deps, "https://test.local");

      const req = new Request("https://test.local/alta-alumno-directa", {
        method: "POST",
        headers: {
          Authorization: "Bearer coach-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "alumno@test.com",
          nombre_completo: "Alumno Test",
          sexo: "M",
          peso_corporal_kg: -10,
        }),
      });

      const res = await handler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("peso corporal");
    });
  });

  describe("3. Migración SQL PGlite e Idempotencia", () => {
    beforeAll(async () => {
      db = new PGlite({ extensions: { pgcrypto } });
      await db.exec(SUPABASE_STUBS);

      const archivos = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      for (const archivo of archivos) {
        if (archivo === NUEVA_MIGRACION) {
          await db.exec(`
            INSERT INTO auth.users (id, email) VALUES ('${COACH_ID}', 'coach@gozster.local') ON CONFLICT DO NOTHING;
            INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
            VALUES ('${COACH_ID}', 'coach@gozster.local', 'Coach Principal', 'ENTRENADOR', 'ACTIVA')
            ON CONFLICT DO NOTHING;
          `);
        }
        const contenido = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8");
        await aplicarMigracion(contenido);
      }

      // Idempotencia: ejecutar la nueva migración una segunda vez
      const migracionGozs343 = fs.readFileSync(path.join(MIGRATIONS_DIR, NUEVA_MIGRACION), "utf-8");
      await aplicarMigracion(migracionGozs343);
    }, 60_000);

    it("las columnas sexo y peso_corporal_kg existen en public.perfiles con restricciones activas", async () => {
      const cols = await db.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'perfiles'
           AND column_name IN ('sexo', 'peso_corporal_kg')
         ORDER BY column_name`
      );
      expect(cols.rows).toHaveLength(2);
      expect(cols.rows.find((c) => c.column_name === "sexo")?.data_type).toBe("text");
      expect(cols.rows.find((c) => c.column_name === "peso_corporal_kg")?.data_type).toBe("numeric");
    });

    it("Camila Navarro figura en public.perfiles con sexo = 'F' y peso_corporal_kg = 55.0", async () => {
      const res = await db.query<{ nombre_completo: string; sexo: string; peso_corporal_kg: string }>(
        `SELECT nombre_completo, sexo, peso_corporal_kg FROM public.perfiles
         WHERE lower(nombre_completo) = 'camila navarro'`
      );
      expect(res.rows.length).toBeGreaterThanOrEqual(1);
      const camila = res.rows[0]!;
      expect(camila.sexo).toBe("F");
      expect(Number(camila.peso_corporal_kg)).toBe(55.0);
    });

    it("RPC actualizar_peso_sexo_alumno actualiza el perfil con validación de rango y sexo", async () => {
      // Como service_role
      const rpcOk = await como(
        "service_role",
        null,
        `SELECT public.actualizar_peso_sexo_alumno('${ALUMNO_ID}'::uuid, 56.5, 'F') AS res`
      );
      const data = (rpcOk.rows[0] as any).res;
      expect(data.ok).toBe(true);
      expect(data.sexo).toBe("F");
      expect(data.peso_corporal_kg).toBe(56.5);

      const check = await db.query<{ peso_corporal_kg: string }>(
        `SELECT peso_corporal_kg FROM public.perfiles WHERE id = '${ALUMNO_ID}'`
      );
      expect(Number(check.rows[0]?.peso_corporal_kg)).toBe(56.5);
    });

    it("RPC actualizar_peso_sexo_alumno rechaza sexo inválido o peso fuera de rango", async () => {
      const rpcInvalido = await como(
        "service_role",
        null,
        `SELECT public.actualizar_peso_sexo_alumno('${ALUMNO_ID}'::uuid, -10, 'F') AS res`
      );
      expect((rpcInvalido.rows[0] as any).res.ok).toBe(false);

      const rpcSexoInvalido = await como(
        "service_role",
        null,
        `SELECT public.actualizar_peso_sexo_alumno('${ALUMNO_ID}'::uuid, 60, 'X') AS res`
      );
      expect((rpcSexoInvalido.rows[0] as any).res.ok).toBe(false);
    });

    it("trigger handle_new_user() persiste sexo y peso_corporal_kg desde raw_user_meta_data", async () => {
      const nuevoUserId = "33333333-3333-4333-8333-333333333333";
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${nuevoUserId}', 'nuevo.alumno@test.local', '{"nombre_completo":"Nuevo Alumno","sexo":"M","peso_corporal_kg":84.5}'::jsonb);
      `);

      const perfil = await db.query<{ nombre_completo: string; sexo: string; peso_corporal_kg: string }>(
        `SELECT nombre_completo, sexo, peso_corporal_kg FROM public.perfiles WHERE id = '${nuevoUserId}'`
      );
      expect(perfil.rows).toHaveLength(1);
      expect(perfil.rows[0]!.nombre_completo).toBe("Nuevo Alumno");
      expect(perfil.rows[0]!.sexo).toBe("M");
      expect(Number(perfil.rows[0]!.peso_corporal_kg)).toBe(84.5);
    });
  });
});
