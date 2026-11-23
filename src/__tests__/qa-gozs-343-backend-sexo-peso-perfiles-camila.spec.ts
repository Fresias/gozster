import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { aplicarMigracion, crearDbMigrada, listarMigraciones, MIGRATIONS_DIR, STUBS } from "./helpers/pglite-migrada";
import { SINT_ALUMNOS } from "@/__tests__/helpers/datos-sinteticos";
import { DEMO_ALUMNOS } from "@/services/coach-demo-dataset";
import { calcularRankingRelativo } from "@/store/use-ranking-store";
import { crearHandler, type AltaAlumnoDeps } from "../../supabase/functions/alta-alumno-directa/handler";

const NUEVA_MIGRACION = "20261103200000_perfiles_sexo_peso_camila_navarro.sql";

const COACH_ID = "20685bca-6304-4e55-abba-37a1cf8f6113";
const OTRO_COACH_ID = "20685bca-6304-4e55-abba-37a1cf8f6114";
const ALUMNO_ID = "e8b1a08c-3430-4000-8000-000000000008"; // Camila Navarro

let db: PGlite;

function como<T = Record<string, unknown>>(rol: "anon" | "authenticated" | "service_role", sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql);
  });
}

describe("GOZS-343: DB & Seeds - Sexo biológico y peso corporal en perfiles", () => {
  describe("1. Dataset SINT_ALUMNOS y Demostración", () => {
    it("todos los alumnos en SINT_ALUMNOS tienen sexo biológico ('M' | 'F') y peso corporal definido", () => {
      expect(SINT_ALUMNOS.length).toBeGreaterThanOrEqual(3);
      for (const alumno of SINT_ALUMNOS) {
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
      const camila = DEMO_ALUMNOS.find((a) => a.nombre_completo === "Camila Navarro")!;
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
      for (const pesoInvalido of [-10, 0, 500.01]) {
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
            peso_corporal_kg: pesoInvalido,
          }),
        });

        const res = await handler(req);
        expect(res.status, `peso=${pesoInvalido}`).toBe(400);
        const json = await res.json();
        expect(json.error).toContain("peso corporal");
      }
    });
  });

  describe("3. Migración SQL PGlite, RLS y Trigger handle_new_user", () => {
    beforeAll(async () => {
      db = await crearDbMigrada();
      await db.exec(`
        INSERT INTO auth.users (id, email) VALUES
          ('${COACH_ID}', 'coach@gozster.local'),
          ('${OTRO_COACH_ID}', 'otro.coach@gozster.local'),
          ('${ALUMNO_ID}', 'camila.navarro@ficticio.ar')
        ON CONFLICT DO NOTHING;
        INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, profesor_asignado_id, sexo, peso_corporal_kg)
        VALUES
          ('${COACH_ID}', 'coach@gozster.local', 'Coach Principal', 'ENTRENADOR', 'ACTIVA', NULL, NULL, NULL),
          ('${OTRO_COACH_ID}', 'otro.coach@gozster.local', 'Otro Coach', 'ENTRENADOR', 'ACTIVA', NULL, NULL, NULL),
          ('${ALUMNO_ID}', 'camila.navarro@ficticio.ar', 'Camila Navarro', 'ALUMNO', 'ACTIVA', '${COACH_ID}', 'F', 55.0)
        ON CONFLICT (id) DO UPDATE SET
          nombre_completo = EXCLUDED.nombre_completo,
          rol = EXCLUDED.rol,
          estado_membresia = EXCLUDED.estado_membresia,
          profesor_asignado_id = EXCLUDED.profesor_asignado_id,
          sexo = EXCLUDED.sexo,
          peso_corporal_kg = EXCLUDED.peso_corporal_kg;
      `);
    }, 60_000);

    it("las columnas sexo y peso_corporal_kg existen en public.perfiles con restricciones CHECK activas", async () => {
      const cols = await db.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'perfiles'
           AND column_name IN ('sexo', 'peso_corporal_kg')
         ORDER BY column_name`
      );
      expect(cols.rows).toHaveLength(2);
      expect(cols.rows.find((c) => c.column_name === "sexo")?.data_type).toBe("text");
      expect(cols.rows.find((c) => c.column_name === "peso_corporal_kg")?.data_type).toBe("numeric");

      const checks = await db.query<{ conname: string; convalidated: boolean }>(
        `SELECT conname, convalidated FROM pg_constraint
         WHERE conrelid = 'public.perfiles'::regclass
           AND contype = 'c'
           AND conname IN ('chk_perfiles_sexo', 'chk_perfiles_peso_corporal_kg')
         ORDER BY conname`
      );
      expect(checks.rows).toEqual([
        { conname: "chk_perfiles_peso_corporal_kg", convalidated: true },
        { conname: "chk_perfiles_sexo", convalidated: true },
      ]);
    });

    it("la migración 20261103200000 siembra a Camila Navarro (F, 55.0) cuando existe el coach y es idempotente", async () => {
      // Aislado hasta NUEVA_MIGRACION para no resucitar RPCs podadas en db principal
      const dbIdemp = await PGlite.create({ extensions: { pgcrypto } });
      try {
        await dbIdemp.exec(STUBS);
        for (const archivo of listarMigraciones()) {
          if (archivo >= NUEVA_MIGRACION) break;
          await aplicarMigracion(dbIdemp, fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
        }
        await dbIdemp.exec(`
          INSERT INTO auth.users (id, email) VALUES ('${COACH_ID}', 'coach@gozster.local') ON CONFLICT DO NOTHING;
          INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
          VALUES ('${COACH_ID}', 'coach@gozster.local', 'Coach Principal', 'ENTRENADOR', 'ACTIVA')
          ON CONFLICT DO NOTHING;
        `);

        const sqlNueva = fs.readFileSync(path.join(MIGRATIONS_DIR, NUEVA_MIGRACION), "utf-8");
        await aplicarMigracion(dbIdemp, sqlNueva);
        await expect(aplicarMigracion(dbIdemp, sqlNueva)).resolves.toBeUndefined();

        const res = await dbIdemp.query<{ nombre_completo: string; sexo: string; peso_corporal_kg: string }>(
          `SELECT nombre_completo, sexo, peso_corporal_kg FROM public.perfiles
           WHERE lower(nombre_completo) = 'camila navarro'`
        );
        expect(res.rows.length).toBeGreaterThanOrEqual(1);
        expect(res.rows[0]!.sexo).toBe("F");
        expect(Number(res.rows[0]!.peso_corporal_kg)).toBe(55.0);
      } finally {
        await dbIdemp.close();
      }
    }, 60_000);

    it("UPDATE directo en public.perfiles actualiza sexo y peso_corporal_kg para alumno y entrenador asignado y bloquea a terceros", async () => {
      // Verificar que las RPCs legadas podadas en S-2 no están presentes en el esquema actual
      for (const sig of [
        "public.actualizar_peso_sexo_alumno(uuid, numeric, text)",
        "public.actualizar_perfil_alumno(uuid, numeric, text)",
      ]) {
        const fn = await db.query<{ oid: string | null }>(`SELECT to_regprocedure($1)::text AS oid`, [sig]);
        expect(fn.rows[0]?.oid, sig).toBeNull();
      }

      // Alumno actualiza su propio perfil (onboarding / inicio)
      await como(
        "authenticated",
        ALUMNO_ID,
        `UPDATE public.perfiles SET peso_corporal_kg = 56.5, sexo = 'F' WHERE id = '${ALUMNO_ID}'`
      );
      const trasAlumno = await db.query<{ sexo: string; peso_corporal_kg: string }>(
        `SELECT sexo, peso_corporal_kg FROM public.perfiles WHERE id = '${ALUMNO_ID}'`
      );
      expect(trasAlumno.rows[0]!.sexo).toBe("F");
      expect(Number(trasAlumno.rows[0]!.peso_corporal_kg)).toBe(56.5);

      // Entrenador asignado actualiza al alumno
      await como(
        "authenticated",
        COACH_ID,
        `UPDATE public.perfiles SET peso_corporal_kg = 57.0, sexo = 'F' WHERE id = '${ALUMNO_ID}'`
      );
      const trasCoach = await db.query<{ peso_corporal_kg: string }>(
        `SELECT peso_corporal_kg FROM public.perfiles WHERE id = '${ALUMNO_ID}'`
      );
      expect(Number(trasCoach.rows[0]!.peso_corporal_kg)).toBe(57.0);

      // Entrenador ajeno no puede modificar el perfil (RLS bloquea el UPDATE)
      await como(
        "authenticated",
        OTRO_COACH_ID,
        `UPDATE public.perfiles SET peso_corporal_kg = 99.0 WHERE id = '${ALUMNO_ID}'`
      );
      const trasAjeno = await db.query<{ peso_corporal_kg: string }>(
        `SELECT peso_corporal_kg FROM public.perfiles WHERE id = '${ALUMNO_ID}'`
      );
      expect(Number(trasAjeno.rows[0]!.peso_corporal_kg)).toBe(57.0);
    });

    it("restricciones CHECK en public.perfiles rechazan sexo inválido o peso fuera de rango (<= 0 o > 500)", async () => {
      for (const pesoInvalido of [-10, 0, 500.01]) {
        await expect(
          como(
            "authenticated",
            ALUMNO_ID,
            `UPDATE public.perfiles SET peso_corporal_kg = ${pesoInvalido} WHERE id = '${ALUMNO_ID}'`
          )
        ).rejects.toMatchObject({ code: "23514" });
      }

      await expect(
        como("authenticated", ALUMNO_ID, `UPDATE public.perfiles SET sexo = 'X' WHERE id = '${ALUMNO_ID}'`)
      ).rejects.toMatchObject({ code: "23514" });

      const check = await db.query<{ sexo: string; peso_corporal_kg: string }>(
        `SELECT sexo, peso_corporal_kg FROM public.perfiles WHERE id = '${ALUMNO_ID}'`
      );
      expect(check.rows[0]!.sexo).toBe("F");
      expect(Number(check.rows[0]!.peso_corporal_kg)).toBe(57.0);
    });

    it("trigger handle_new_user() actual persiste sexo y peso_corporal_kg desde raw_user_meta_data y sanitiza valores inválidos", async () => {
      const nuevoUserId = "33333333-3333-4333-8333-333333333333";
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${nuevoUserId}', 'nuevo.alumno@test.local', '{"nombre_completo":"Nuevo Alumno","sexo":"M","peso_corporal_kg":84.5,"rol":"ADMIN"}'::jsonb);
      `);

      const perfil = await db.query<{ nombre_completo: string; sexo: string; peso_corporal_kg: string; rol: string }>(
        `SELECT nombre_completo, sexo, peso_corporal_kg, rol FROM public.perfiles WHERE id = '${nuevoUserId}'`
      );
      expect(perfil.rows).toHaveLength(1);
      expect(perfil.rows[0]!.nombre_completo).toBe("Nuevo Alumno");
      expect(perfil.rows[0]!.sexo).toBe("M");
      expect(Number(perfil.rows[0]!.peso_corporal_kg)).toBe(84.5);
      // Confirmar que corre el handle_new_user() actual (ignora rol en raw_user_meta_data)
      expect(perfil.rows[0]!.rol).toBe("ALUMNO");

      const invalidoUserId = "44444444-4444-4444-8444-444444444444";
      await db.exec(`
        INSERT INTO auth.users (id, email, raw_user_meta_data)
        VALUES ('${invalidoUserId}', 'invalido.alumno@test.local', '{"nombre_completo":"Invalido","sexo":"X","peso_corporal_kg":-5}'::jsonb);
      `);
      const perfilInv = await db.query<{ sexo: string | null; peso_corporal_kg: string | null }>(
        `SELECT sexo, peso_corporal_kg FROM public.perfiles WHERE id = '${invalidoUserId}'`
      );
      expect(perfilInv.rows).toEqual([{ sexo: null, peso_corporal_kg: null }]);
    });
  });
});
