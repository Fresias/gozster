import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { validarRutina, repsValidas, claveEjercicio } from "@/lib/validar-rutina";
import {
  parsePyramidSeriesCount,
  parsePyramidRpeSteps,
  parseTargetRpe,
  validarRpeObjetivo,
} from "@/lib/routine-helpers";

/**
 * GOZS-418 QA Acceptance Test Suite
 * Motor de Cargas: Soporte de RPE piramidal con guiones sincronizado con repeticiones
 */

describe("GOZS-418: Motor de Cargas - RPE Piramidal Escalonado con Guiones", () => {
  describe("1. Criterios de Aceptación: Validación en el Constructor de Rutinas", () => {
    const buildEx = (overrides = {}) => ({
      id: "ex-1",
      series: 4,
      repeticiones: "12-10-8-6",
      descanso_segundos: 90,
      rpe_objetivo: "6-7-8-9" as string | number | null,
      ...overrides,
    });

    const buildRutina = (exercise = buildEx()) =>
      validarRutina({
        nombre: "Rutina Fuerza Piramidal",
        days: [{ id: "dia-1", nombre: "Día 1: Torso", ejercicios: [exercise] }],
      });

    it("GIVEN repeticiones '12-10-8-6' (4 series) WHEN coach ingresa RPE '6-7-8-9' THEN es válido", () => {
      const res = buildRutina();
      expect(res.errores).toEqual({});
      expect(parsePyramidSeriesCount("12-10-8-6")).toBe(4);
      expect(parsePyramidRpeSteps("6-7-8-9")).toEqual([6, 7, 8, 9]);
    });

    it("rechaza explícitamente cadenas con espacios como '6 7 8 9'", () => {
      const res = buildRutina(buildEx({ rpe_objetivo: "6 7 8 9" }));
      expect(res.errores[claveEjercicio("ex-1", "rpe")]).toBe("RPE no debe contener espacios (ej. 6-7-8-9)");
      expect(parsePyramidRpeSteps("6 7 8 9")).toBeNull();
    });

    it("rechaza cuando la cantidad de escalones de RPE no coincide con las series de repeticiones", () => {
      // 4 series pero solo 3 escalones de RPE
      const resMenos = buildRutina(buildEx({ rpe_objetivo: "6-7-8" }));
      expect(resMenos.errores[claveEjercicio("ex-1", "rpe")]).toContain(
        "la cantidad de escalones (3) debe coincidir con las series (4)"
      );

      // 4 series pero 5 escalones de RPE
      const resMas = buildRutina(buildEx({ rpe_objetivo: "6-7-8-9-10" }));
      expect(resMas.errores[claveEjercicio("ex-1", "rpe")]).toContain(
        "la cantidad de escalones (5) debe coincidir con las series (4)"
      );
    });

    it("valida que cada valor se encuentre en la escala válida (1 a 10)", () => {
      const resMax = buildRutina(buildEx({ rpe_objetivo: "6-7-8-11" }));
      expect(resMax.errores[claveEjercicio("ex-1", "rpe")]).toBe("RPE: cada valor debe estar entre 1 y 10");

      const resMin = buildRutina(buildEx({ rpe_objetivo: "0-7-8-9" }));
      expect(resMin.errores[claveEjercicio("ex-1", "rpe")]).toBe("RPE: cada valor debe estar entre 1 y 10");
    });

    it("routine-builder-modal.tsx contiene data-testid='exercise-rpe-input' accesible con bloqueo de espacios", () => {
      const modalCode = fs.readFileSync(
        path.resolve(__dirname, "../components/coach/routine-builder/routine-builder-modal.tsx"),
        "utf-8"
      );
      expect(modalCode).toContain('data-testid="exercise-rpe-input"');
      expect(modalCode).toContain('placeholder="8 · 6-7-8-9"');
      expect(modalCode).toContain('if (e.key === " ")');
    });
  });

  describe("2. Criterios de Aceptación: Athlete App (live-workout.tsx)", () => {
    it("parseTargetRpe resuelve Serie 1 como 6 y Serie 4 como 9 en pirámide '6-7-8-9'", () => {
      const rpePiramidal = "6-7-8-9";
      expect(parseTargetRpe(rpePiramidal, 1)).toBe(6);
      expect(parseTargetRpe(rpePiramidal, 2)).toBe(7);
      expect(parseTargetRpe(rpePiramidal, 3)).toBe(8);
      expect(parseTargetRpe(rpePiramidal, 4)).toBe(9);
    });

    it("live-workout.tsx vincula parseTargetRpe a la serie actual respetando inmutabilidad readonly", () => {
      const liveWorkoutCode = fs.readFileSync(
        path.resolve(__dirname, "../components/athlete/live-workout.tsx"),
        "utf-8"
      );
      expect(liveWorkoutCode).toContain("parseTargetRpe");
      expect(liveWorkoutCode).toContain('data-testid="rpe-prescribed-badge"');
      expect(liveWorkoutCode).toContain(
        "RPE Objetivo: {currentExercise.rpe_objetivo ?? serie.rpe_real} · Prescrito por entrenador"
      );
    });
  });

  describe("3. Criterios de Aceptación: Migración SQL Append-Only y Persistencia en Base de Datos", () => {
    const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
    const COACH = "00000000-0000-0000-0000-0000000000c1";
    const EJ = "10000000-0000-0000-0000-0000000000e1";

    const STUBS = `
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
    `;

    let db: PGlite;

    async function aplicar(sql: string) {
      const inicio = sql.search(/^BEGIN;/m);
      if (inicio > 0) {
        await db.exec(sql.slice(0, inicio));
        await db.exec(sql.slice(inicio));
      } else {
        await db.exec(sql);
      }
    }

    beforeAll(async () => {
      db = new PGlite({ extensions: { pgcrypto } });
      await db.exec(STUBS);
      for (const f of fs.readdirSync(MIGRATIONS_DIR).filter((x) => x.endsWith(".sql")).sort()) {
        await aplicar(fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf-8"));
      }
      await db.exec(`
        INSERT INTO auth.users (id, email) VALUES ('${COACH}','c@t');
        INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
          VALUES ('${COACH}','c@t','Coach','ENTRENADOR','ACTIVA');
        INSERT INTO public.ejercicios (id, nombre) VALUES ('${EJ}','Sentadilla Trasera');
      `);
    });

    async function guardar(p: unknown) {
      try {
        await db.transaction(async (tx: Transaction) => {
          await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
            JSON.stringify({ sub: COACH, role: "authenticated" }),
          ]);
          await tx.query(`SET LOCAL ROLE authenticated`);
          await tx.query(`SELECT public.guardar_rutina($1::jsonb)`, [JSON.stringify(p)]);
        });
        return null;
      } catch (e) {
        return e as { message: string; code?: string };
      }
    }

    it("almacena exitosamente prescripciones de RPE escalonado '6-7-8-9' en la base de datos", async () => {
      const payload = {
        nombre: "Rutina Pirámide Real",
        dias: [
          {
            nombre: "Día 1",
            ejercicios: [
              {
                ejercicio_id: EJ,
                nombre: "Sentadilla Trasera",
                series: 4,
                repeticiones: "12-10-8-6",
                descanso_segundos: 120,
                rpe_objetivo: "6-7-8-9",
              },
            ],
          },
        ],
      };

      const err = await guardar(payload);
      expect(err).toBeNull();

      // Verificar que se guardó exactamente como TEXT '6-7-8-9'
      const res = await db.query<{ rpe_objetivo: string; repeticiones: string }>(
        `SELECT rpe_objetivo, repeticiones FROM public.ejercicios_en_rutina WHERE repeticiones = '12-10-8-6'`
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.rpe_objetivo).toBe("6-7-8-9");
    });

    it("rechaza en base de datos RPE con espacios '6 7 8 9'", async () => {
      const payload = {
        nombre: "Rutina Basura Espacios",
        dias: [
          {
            nombre: "Día 1",
            ejercicios: [
              {
                ejercicio_id: EJ,
                nombre: "Sentadilla Trasera",
                series: 4,
                repeticiones: "12-10-8-6",
                descanso_segundos: 120,
                rpe_objetivo: "6 7 8 9",
              },
            ],
          },
        ],
      };

      const err = await guardar(payload);
      expect(err).not.toBeNull();
      expect(err?.code).toBe("GZ010");
      expect(err?.message).toContain("el RPE objetivo debe estar entre 1 y 10");
    });

    it("mantiene retrocompatibilidad con RPE numérico fijo '8.5' o null", async () => {
      const payload = {
        nombre: "Rutina RPE Clásico",
        dias: [
          {
            nombre: "Día 1",
            ejercicios: [
              {
                ejercicio_id: EJ,
                nombre: "Sentadilla Trasera",
                series: 3,
                repeticiones: "10",
                descanso_segundos: 90,
                rpe_objetivo: 8.5,
              },
            ],
          },
        ],
      };

      const err = await guardar(payload);
      expect(err).toBeNull();

      const res = await db.query<{ rpe_objetivo: string }>(
        `SELECT rpe_objetivo FROM public.ejercicios_en_rutina WHERE repeticiones = '10'`
      );
      expect(res.rows[0]?.rpe_objetivo).toBe("8.5");
    });
  });
});
