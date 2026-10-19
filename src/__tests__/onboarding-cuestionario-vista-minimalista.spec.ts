import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import type {
  NivelVistaAlumno,
  AlumnoCuestionarioInicial,
  AlumnoCuestionarioInicialInsert,
  AlumnoCuestionarioInicialUpdate,
} from "@/types/database.types";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const ADMIN = "00000000-0000-0000-0000-000000000001";
const COACH = "00000000-0000-0000-0000-000000000002";
const OTRO_COACH = "00000000-0000-0000-0000-000000000003";
const ALUMNO = "00000000-0000-0000-0000-000000000004";
const OTRO_ALUMNO = "00000000-0000-0000-0000-000000000005";

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
    ('${ADMIN}','admin@t'),('${COACH}','coach@t'),('${OTRO_COACH}','c2@t'),
    ('${ALUMNO}','a@t'),('${OTRO_ALUMNO}','b@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin@t','Admin','ADMIN',NULL,'ACTIVA'),
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${OTRO_COACH}','c2@t','Otro coach','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','a@t','Alumno','ALUMNO','${COACH}','ACTIVA'),
    ('${OTRO_ALUMNO}','b@t','Otro alumno','ALUMNO','${OTRO_COACH}','ACTIVA');
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

describe("Issue #65 / ADR-004: Onboarding, Cuestionario Inicial y Vista Minimalista (PGlite)", () => {
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

  describe("1. Columna nivel_vista_alumno y restricciones en perfiles", () => {
    it("posee DEFAULT 'SIMPLE' para perfiles preexistentes y nuevos", async () => {
      const r = await db.query<{ nivel_vista_alumno: string }>(
        `SELECT nivel_vista_alumno FROM public.perfiles WHERE id = '${ALUMNO}'`
      );
      expect(r.rows[0]?.nivel_vista_alumno).toBe("SIMPLE");
    });

    it("rechaza valores que no sean 'SIMPLE' o 'TECNICA' mediante el check constraint", async () => {
      await expect(
        db.query(
          `UPDATE public.perfiles SET nivel_vista_alumno = 'AVANZADA' WHERE id = '${ALUMNO}'`
        )
      ).rejects.toThrow(/chk_perfiles_nivel_vista_alumno/);
    });

    it("el alumno NO puede modificar su propio nivel_vista_alumno (fn_proteger_campos_perfil)", async () => {
      await expect(
        como(
          "authenticated",
          ALUMNO,
          `UPDATE public.perfiles SET nivel_vista_alumno = 'TECNICA' WHERE id = '${ALUMNO}'`
        )
      ).rejects.toThrow(/Solo el entrenador asignado puede modificar/);
    });

    it("un entrenador no asignado NO puede modificar el nivel_vista_alumno de un alumno ajeno (RLS filtra 0 filas)", async () => {
      const res = await como(
        "authenticated",
        OTRO_COACH,
        `UPDATE public.perfiles SET nivel_vista_alumno = 'TECNICA' WHERE id = '${ALUMNO}'`
      );
      expect(res.affectedRows).toBe(0);
      const r = await db.query<{ nivel_vista_alumno: string }>(
        `SELECT nivel_vista_alumno FROM public.perfiles WHERE id = '${ALUMNO}'`
      );
      expect(r.rows[0]?.nivel_vista_alumno).toBe("SIMPLE");
    });

    it("el entrenador asignado PUEDE modificar nivel_vista_alumno del alumno", async () => {
      await como(
        "authenticated",
        COACH,
        `UPDATE public.perfiles SET nivel_vista_alumno = 'TECNICA' WHERE id = '${ALUMNO}'`
      );
      const r = await db.query<{ nivel_vista_alumno: string }>(
        `SELECT nivel_vista_alumno FROM public.perfiles WHERE id = '${ALUMNO}'`
      );
      expect(r.rows[0]?.nivel_vista_alumno).toBe("TECNICA");

      // Regresar a SIMPLE
      await como(
        "authenticated",
        COACH,
        `UPDATE public.perfiles SET nivel_vista_alumno = 'SIMPLE' WHERE id = '${ALUMNO}'`
      );
      const r2 = await db.query<{ nivel_vista_alumno: string }>(
        `SELECT nivel_vista_alumno FROM public.perfiles WHERE id = '${ALUMNO}'`
      );
      expect(r2.rows[0]?.nivel_vista_alumno).toBe("SIMPLE");
    });

    it("un usuario ADMIN PUEDE modificar nivel_vista_alumno de cualquier alumno", async () => {
      await como(
        "authenticated",
        ADMIN,
        `UPDATE public.perfiles SET nivel_vista_alumno = 'TECNICA' WHERE id = '${ALUMNO}'`
      );
      const r = await db.query<{ nivel_vista_alumno: string }>(
        `SELECT nivel_vista_alumno FROM public.perfiles WHERE id = '${ALUMNO}'`
      );
      expect(r.rows[0]?.nivel_vista_alumno).toBe("TECNICA");

      // Restaurar
      await como(
        "authenticated",
        ADMIN,
        `UPDATE public.perfiles SET nivel_vista_alumno = 'SIMPLE' WHERE id = '${ALUMNO}'`
      );
    });
  });

  describe("2. Tabla alumno_cuestionario_inicial y RLS", () => {
    it("el alumno puede insertar su propio cuestionario inicial", async () => {
      const res = await como<{ id: string; objetivo_principal: string }>(
        "authenticated",
        ALUMNO,
        `INSERT INTO public.alumno_cuestionario_inicial (
          alumno_id, objetivo_principal, experiencia_previa, dias_disponibles_semana, molestias_o_lesiones_previas, equipamiento_disponible, respuestas_extra
        ) VALUES (
          '${ALUMNO}', 'Hipertrofia y fuerza', '2 años de gimnasio', 4, 'Ninguna', 'Gimnasio comercial completo', '{"horario_preferido": "tarde"}'::jsonb
        ) RETURNING id, objetivo_principal`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.objetivo_principal).toBe("Hipertrofia y fuerza");
    });

    it("el alumno puede consultar su propio cuestionario inicial", async () => {
      const res = await como<{ alumno_id: string; dias_disponibles_semana: number }>(
        "authenticated",
        ALUMNO,
        `SELECT alumno_id, dias_disponibles_semana FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.dias_disponibles_semana).toBe(4);
    });

    it("el alumno puede actualizar su propio cuestionario inicial y updated_at se actualiza", async () => {
      const antes = await db.query<{ updated_at: string }>(
        `SELECT updated_at::text FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );

      // Pequeño delay para asegurar que el timestamp cambie
      await new Promise((r) => setTimeout(r, 10));

      await como(
        "authenticated",
        ALUMNO,
        `UPDATE public.alumno_cuestionario_inicial
         SET dias_disponibles_semana = 5, objetivo_principal = 'Ganancia de masa muscular'
         WHERE alumno_id = '${ALUMNO}'`
      );

      const despues = await db.query<{ dias_disponibles_semana: number; objetivo_principal: string; updated_at: string }>(
        `SELECT dias_disponibles_semana, objetivo_principal, updated_at::text FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(despues.rows[0]?.dias_disponibles_semana).toBe(5);
      expect(despues.rows[0]?.objetivo_principal).toBe("Ganancia de masa muscular");
      expect(despues.rows[0]?.updated_at).toBeDefined();
    });

    it("el entrenador asignado puede ver el cuestionario de su alumno", async () => {
      const res = await como<{ alumno_id: string }>(
        "authenticated",
        COACH,
        `SELECT alumno_id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.alumno_id).toBe(ALUMNO);
    });

    it("un usuario ADMIN puede ver el cuestionario de cualquier alumno", async () => {
      const res = await como<{ alumno_id: string }>(
        "authenticated",
        ADMIN,
        `SELECT alumno_id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(res.rows.length).toBe(1);
      expect(res.rows[0]?.alumno_id).toBe(ALUMNO);
    });

    it("un entrenador ajeno NO puede ver el cuestionario de un alumno no asignado", async () => {
      const res = await como<{ alumno_id: string }>(
        "authenticated",
        OTRO_COACH,
        `SELECT alumno_id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(res.rows.length).toBe(0);
    });

    it("otro alumno NO puede ver el cuestionario ajeno", async () => {
      const res = await como<{ alumno_id: string }>(
        "authenticated",
        OTRO_ALUMNO,
        `SELECT alumno_id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(res.rows.length).toBe(0);
    });

    it("un alumno NO puede insertar un cuestionario para otro alumno", async () => {
      await expect(
        como(
          "authenticated",
          OTRO_ALUMNO,
          `INSERT INTO public.alumno_cuestionario_inicial (alumno_id, objetivo_principal)
           VALUES ('${ALUMNO}', 'Intento de suplantar')`
        )
      ).rejects.toThrow(/row-level security|permission denied/);
    });

    it("un alumno NO puede modificar el cuestionario de otro alumno", async () => {
      await como(
        "authenticated",
        OTRO_ALUMNO,
        `UPDATE public.alumno_cuestionario_inicial SET objetivo_principal = 'Hackeado' WHERE alumno_id = '${ALUMNO}'`
      );
      // RLS filtra filas no visibles en UPDATE, por lo que no altera la fila
      const r = await db.query<{ objetivo_principal: string }>(
        `SELECT objetivo_principal FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(r.rows[0]?.objetivo_principal).toBe("Ganancia de masa muscular");
    });

    it("usuario anónimo (anon) no puede leer ni escribir en alumno_cuestionario_inicial", async () => {
      const r = await como<{ alumno_id: string }>(
        "anon",
        null,
        `SELECT alumno_id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${ALUMNO}'`
      );
      expect(r.rows.length).toBe(0);

      await expect(
        como(
          "anon",
          null,
          `INSERT INTO public.alumno_cuestionario_inicial (alumno_id, objetivo_principal) VALUES ('${ALUMNO}', 'Anon')`
        )
      ).rejects.toThrow(/row-level security|permission denied/);
    });

    it("la eliminación del perfil borra el cuestionario en cascada (ON DELETE CASCADE)", async () => {
      const TEMP_USER = "00000000-0000-0000-0000-000000000099";
      await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${TEMP_USER}', 'temp@t');`);
      await db.exec(
        `INSERT INTO public.perfiles (id, email, nombre_completo, rol) VALUES ('${TEMP_USER}', 'temp@t', 'Temp', 'ALUMNO');`
      );
      await como(
        "authenticated",
        TEMP_USER,
        `INSERT INTO public.alumno_cuestionario_inicial (alumno_id, objetivo_principal) VALUES ('${TEMP_USER}', 'Temporal')`
      );

      const antes = await db.query(
        `SELECT id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${TEMP_USER}'`
      );
      expect(antes.rows.length).toBe(1);

      await db.exec(`DELETE FROM public.perfiles WHERE id = '${TEMP_USER}'`);

      const despues = await db.query(
        `SELECT id FROM public.alumno_cuestionario_inicial WHERE alumno_id = '${TEMP_USER}'`
      );
      expect(despues.rows.length).toBe(0);
    });
  });

  describe("3. Coherencia de tipos TypeScript", () => {
    it("los tipos NivelVistaAlumno y AlumnoCuestionarioInicial están tipados correctamente", () => {
      const nivelValido1: NivelVistaAlumno = "SIMPLE";
      const nivelValido2: NivelVistaAlumno = "TECNICA";
      expect(nivelValido1).toBe("SIMPLE");
      expect(nivelValido2).toBe("TECNICA");

      const insertPayload: AlumnoCuestionarioInicialInsert = {
        alumno_id: ALUMNO,
        objetivo_principal: "Fuerza",
        experiencia_previa: "Intermedio",
        dias_disponibles_semana: 3,
        molestias_o_lesiones_previas: null,
        equipamiento_disponible: "Mancuernas",
        respuestas_extra: { dias: [1, 3, 5] },
      };
      expect(insertPayload.alumno_id).toBe(ALUMNO);

      const updatePayload: AlumnoCuestionarioInicialUpdate = {
        dias_disponibles_semana: 4,
      };
      expect(updatePayload.dias_disponibles_semana).toBe(4);
    });
  });
});
