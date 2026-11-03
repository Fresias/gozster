import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import type {
  Database,
  AlertaEntrenador,
  AlumnoHistorialDolor,
  EjercicioAlternativa,
  SustitucionEjercicio,
} from "@/types/database.types";

// ============================================================================
// Issue #67 (ADR-002, GOZS-41): Biblioteca de alternativas, sustituciones
// trazables, Red Flags y bloqueo RLS de quick_swap al alumno.
// ============================================================================

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261019110000_molestias_red_flags_sustituciones.sql";

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH = "00000000-0000-0000-0000-00000000c0ac";
const OTRO_COACH = "00000000-0000-0000-0000-0000000000c2";
const ALUMNO = "00000000-0000-0000-0000-00000000000a";
const OTRO_ALUMNO = "00000000-0000-0000-0000-00000000000b";

const EJ_BANCA = "30000000-0000-0000-0000-000000000001";
const EJ_MANCUERNAS = "30000000-0000-0000-0000-000000000002";
const EJ_FLEXIONES = "30000000-0000-0000-0000-000000000003";

const PLAN_ID = "40000000-0000-0000-0000-000000000001";
const DIA_ID = "50000000-0000-0000-0000-000000000001";
const ITEM_RUTINA_ID = "60000000-0000-0000-0000-000000000001";
const SESION_ID = "70000000-0000-0000-0000-000000000001";
const SERIE_ID = "80000000-0000-0000-0000-000000000001";

type Rol = "anon" | "authenticated" | "service_role";

const SUPABASE_STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role' $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

const SEED_DATA = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}','admin@t'),('${COACH}','coach@t'),('${OTRO_COACH}','c2@t'),
    ('${ALUMNO}','a@t'),('${OTRO_ALUMNO}','b@t');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin@t','Admin Principal','ADMIN',NULL,'ACTIVA'),
    ('${COACH}','coach@t','Profesor Asignado','ENTRENADOR',NULL,'ACTIVA'),
    ('${OTRO_COACH}','c2@t','Otro Entrenador','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','a@t','Alumno Activo','ALUMNO','${COACH}','ACTIVA'),
    ('${OTRO_ALUMNO}','b@t','Otro Alumno','ALUMNO','${OTRO_COACH}','ACTIVA');

  INSERT INTO public.entrenador_alumnos (entrenador_id, alumno_id, es_principal) VALUES
    ('${COACH}','${ALUMNO}',true),
    ('${OTRO_COACH}','${OTRO_ALUMNO}',true);

  INSERT INTO public.ejercicios (id, nombre, musculos_principales, creado_por) VALUES
    ('${EJ_BANCA}', 'Press Banca con Barra', '{PECHO,TRICEPS}', '${COACH}'),
    ('${EJ_MANCUERNAS}', 'Press con Mancuernas Neutro', '{PECHO,TRICEPS}', '${COACH}'),
    ('${EJ_FLEXIONES}', 'Flexiones en Suelo', '{PECHO,TRICEPS}', '${COACH}');

  INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre) VALUES
    ('${PLAN_ID}', '${COACH}', '${ALUMNO}', 'Plan Fuerza P1');

  INSERT INTO public.dias_rutina (id, plan_id, nombre, orden) VALUES
    ('${DIA_ID}', '${PLAN_ID}', 'Día 1 - Torso', 1);

  INSERT INTO public.ejercicios_en_rutina (id, dia_id, ejercicio_id, orden, series, repeticiones) VALUES
    ('${ITEM_RUTINA_ID}', '${DIA_ID}', '${EJ_BANCA}', 1, 4, '8-10');

  INSERT INTO public.registro_sesiones (id, alumno_id, dia_id, fecha, volumen_total_kg) VALUES
    ('${SESION_ID}', '${ALUMNO}', '${DIA_ID}', '2026-10-18 10:00:00+00', 3200.00);

  INSERT INTO public.registro_series (id, sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, pain_reported) VALUES
    ('${SERIE_ID}', '${SESION_ID}', '${EJ_BANCA}', 1, 100, 8, true, false);
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

const DENEGADO = /row-level security|permission denied|No autorizado|no tiene permitido/;

describe("Issue #67 / GOZS-41: Molestias, Red Flags, Alternativas y Sustituciones Trazables", () => {
  beforeAll(async () => {
    db = new PGlite({ extensions: { pgcrypto } });
    await db.exec(SUPABASE_STUBS);

    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      if (archivo === NEW_MIGRATION) {
        await db.exec(SEED_DATA);
      }
      await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
  }, 60_000);

  // ============================================================================
  // 1. EXTENSIÓN Y TRIGGERS DE DOLOR Y RED FLAGS
  // ============================================================================
  describe("1. Historial de Dolor y Red Flags (public.alumno_historial_dolor)", () => {
    it("debe permitir registrar momento_aparicion, flags de alarma y estado PENDIENTE", async () => {
      const reporteId = "90000000-0000-0000-0000-000000000001";
      await como(
        "authenticated",
        ALUMNO,
        `INSERT INTO public.alumno_historial_dolor (
          id, alumno_id, ejercicio_id, zona_articular, severidad, notas_alumno,
          momento_aparicion, es_sintoma_alarma, sintomas_alarma, estado
        ) VALUES (
          '${reporteId}', '${ALUMNO}', '${EJ_BANCA}', 'HOMBRO', 'MODERADO', 'Pinchazo anterior',
          'EN_SERIE', false, '{}', 'PENDIENTE'
        )`
      );

      const r = await db.query<{ momento_aparicion: string; es_sintoma_alarma: boolean; estado: string }>(
        `SELECT momento_aparicion, es_sintoma_alarma, estado FROM public.alumno_historial_dolor WHERE id = '${reporteId}'`
      );
      expect(r.rows[0]).toEqual({
        momento_aparicion: "EN_SERIE",
        es_sintoma_alarma: false,
        estado: "PENDIENTE",
      });
    });

    it("rechaza momento_aparicion o estado inválidos según los CHECK constraints", async () => {
      await expect(
        db.query(`INSERT INTO public.alumno_historial_dolor (
          alumno_id, ejercicio_id, zona_articular, momento_aparicion
        ) VALUES ('${ALUMNO}', '${EJ_BANCA}', 'HOMBRO', 'DESAYUNO')`)
      ).rejects.toThrow(/check/i);

      await expect(
        db.query(`INSERT INTO public.alumno_historial_dolor (
          alumno_id, ejercicio_id, zona_articular, estado
        ) VALUES ('${ALUMNO}', '${EJ_BANCA}', 'HOMBRO', 'ARCHIVADO')`)
      ).rejects.toThrow(/check/i);
    });

    it("trigger crea automáticamente una alerta CRITICA cuando es_sintoma_alarma = true", async () => {
      const dolorAlarmaId = "90000000-0000-0000-0000-000000000002";
      await como(
        "authenticated",
        ALUMNO,
        `INSERT INTO public.alumno_historial_dolor (
          id, alumno_id, ejercicio_id, zona_articular, severidad, notas_alumno,
          momento_aparicion, es_sintoma_alarma, sintomas_alarma, estado
        ) VALUES (
          '${dolorAlarmaId}', '${ALUMNO}', '${EJ_BANCA}', 'HOMBRO', 'AGUDO', 'Adormecimiento en brazo',
          'EN_SERIE', true, ARRAY['IRRADIACION_ADORMECIMIENTO', 'DOLOR_PUNZANTE_SUBITO'], 'PENDIENTE'
        )`
      );

      const alerta = await db.query<{
        tipo_alerta: string;
        severidad: string;
        titulo: string;
        profesor_id: string;
        estado: string;
      }>(
        `SELECT tipo_alerta, severidad, titulo, profesor_id, estado
         FROM public.alertas_entrenador
         WHERE alumno_id = '${ALUMNO}' AND severidad = 'CRITICA'
         ORDER BY created_at DESC LIMIT 1`
      );

      expect(alerta.rows).toHaveLength(1);
      expect(alerta.rows[0]!.severidad).toBe("CRITICA");
      expect(alerta.rows[0]!.profesor_id).toBe(COACH);
      expect(alerta.rows[0]!.estado).toBe("PENDIENTE");
      expect(alerta.rows[0]!.titulo).toContain("RED FLAG");
    });
  });

  // ============================================================================
  // 2. BIBLIOTECA DE ALTERNATIVAS (public.ejercicios_alternativas)
  // ============================================================================
  describe("2. Biblioteca de Alternativas (public.ejercicios_alternativas)", () => {
    it("el entrenador puede registrar una alternativa biomecánica clasificada", async () => {
      const altId = "a1000000-0000-0000-0000-000000000001";
      await como(
        "authenticated",
        COACH,
        `INSERT INTO public.ejercicios_alternativas (
          id, ejercicio_origen_id, ejercicio_alternativo_id, patron_movimiento,
          equipamiento, nivel_exigencia, restricciones_articulares, explicacion_tecnica
        ) VALUES (
          '${altId}', '${EJ_BANCA}', '${EJ_MANCUERNAS}', 'EMPUJE_HORIZONTAL',
          'MANCUERNAS', 'MEDIO', ARRAY['HOMBRO'], 'Permite rotación neutra reduciendo estrés subacromial'
        )`
      );

      const r = await db.query<{ patron_movimiento: string; restricciones_articulares: string[] }>(
        `SELECT patron_movimiento, restricciones_articulares FROM public.ejercicios_alternativas WHERE id = '${altId}'`
      );
      expect(r.rows[0]!.patron_movimiento).toBe("EMPUJE_HORIZONTAL");
      expect(r.rows[0]!.restricciones_articulares).toEqual(["HOMBRO"]);
    });

    it("el alumno autenticado puede leer el catálogo de alternativas", async () => {
      const r = await como<{ id: string }>(
        "authenticated",
        ALUMNO,
        `SELECT id FROM public.ejercicios_alternativas WHERE ejercicio_origen_id = '${EJ_BANCA}'`
      );
      expect(r.rows.length).toBeGreaterThanOrEqual(1);
    });

    it("el alumno NO puede insertar ni modificar alternativas en la biblioteca (RLS)", async () => {
      await expect(
        como(
          "authenticated",
          ALUMNO,
          `INSERT INTO public.ejercicios_alternativas (
            ejercicio_origen_id, ejercicio_alternativo_id, patron_movimiento
          ) VALUES ('${EJ_BANCA}', '${EJ_FLEXIONES}', 'EMPUJE_HORIZONTAL')`
        )
      ).rejects.toThrow(DENEGADO);
    });
  });

  // ============================================================================
  // 3. SEGURIDAD ESTRICTA: BLOQUEO DE QUICK_SWAP AL ALUMNO
  // ============================================================================
  describe("3. Bloqueo RLS y Seguridad Estricta en RPC quick_swap_ejercicio", () => {
    it("rechaza la invocación con SQLSTATE 42501 si quien invoca es ALUMNO", async () => {
      await expect(
        como(
          "authenticated",
          ALUMNO,
          `SELECT public.quick_swap_ejercicio(
            '${ITEM_RUTINA_ID}', '${EJ_MANCUERNAS}', NULL, 'Intento de auto-reemplazo'
          )`
        )
      ).rejects.toThrow(/42501|no puede elegir ni ejecutar/);
    });

    it("rechaza la invocación si quien invoca es un entrenador no asignado ni admin", async () => {
      await expect(
        como(
          "authenticated",
          OTRO_COACH,
          `SELECT public.quick_swap_ejercicio(
            '${ITEM_RUTINA_ID}', '${EJ_MANCUERNAS}', NULL, 'Reemplazo sin ser entrenador del alumno'
          )`
        )
      ).rejects.toThrow(/42501|No autorizado/);
    });

    it("permite la ejecución al entrenador asignado, registrando en sustituciones_ejercicios", async () => {
      const result = await como<{ id: string; ejercicio_id: string; notas: string }>(
        "authenticated",
        COACH,
        `SELECT id, ejercicio_id, notas
         FROM public.quick_swap_ejercicio(
           '${ITEM_RUTINA_ID}',
           '${EJ_MANCUERNAS}',
           NULL,
           'Molestia en hombro durante calentamiento'
         )`
      );

      // Verificamos que ejercicios_en_rutina fue actualizado
      expect(result.rows[0]!.ejercicio_id).toBe(EJ_MANCUERNAS);
      expect(result.rows[0]!.notas).toContain("Sustituido por Press con Mancuernas Neutro");

      // Verificamos la fila obligatoria en sustituciones_ejercicios
      const sustitucion = await db.query<{
        plan_id: string;
        ejercicio_original_id: string;
        ejercicio_sustituto_id: string;
        responsable_id: string;
        motivo: string;
      }>(
        `SELECT plan_id, ejercicio_original_id, ejercicio_sustituto_id, responsable_id, motivo
         FROM public.sustituciones_ejercicios
         WHERE ejercicio_en_rutina_id = '${ITEM_RUTINA_ID}'
         ORDER BY created_at DESC LIMIT 1`
      );

      expect(sustitucion.rows).toHaveLength(1);
      expect(sustitucion.rows[0]!.plan_id).toBe(PLAN_ID);
      expect(sustitucion.rows[0]!.ejercicio_original_id).toBe(EJ_BANCA);
      expect(sustitucion.rows[0]!.ejercicio_sustituto_id).toBe(EJ_MANCUERNAS);
      expect(sustitucion.rows[0]!.responsable_id).toBe(COACH);
      expect(sustitucion.rows[0]!.motivo).toBe("Molestia en hombro durante calentamiento");
    });

    it("inmutabilidad: registro_sesiones y registro_series históricas NO fueron modificadas", async () => {
      const serie = await db.query<{ ejercicio_id: string; peso_kg: number; reps_hechas: number }>(
        `SELECT ejercicio_id, peso_kg, reps_hechas FROM public.registro_series WHERE id = '${SERIE_ID}'`
      );
      // Sigue guardando el ejercicio original ejecutado históricamente
      expect(serie.rows[0]!.ejercicio_id).toBe(EJ_BANCA);
      expect(Number(serie.rows[0]!.peso_kg)).toBe(100);
      expect(serie.rows[0]!.reps_hechas).toBe(8);
    });
  });

  // ============================================================================
  // 4. RLS DE SUSTITUCIONES_EJERCICIOS
  // ============================================================================
  describe("4. RLS en public.sustituciones_ejercicios", () => {
    it("el alumno puede consultar las sustituciones de su propio plan", async () => {
      const r = await como<{ id: string }>(
        "authenticated",
        ALUMNO,
        `SELECT id FROM public.sustituciones_ejercicios WHERE plan_id = '${PLAN_ID}'`
      );
      expect(r.rows.length).toBeGreaterThanOrEqual(1);
    });

    it("otro alumno NO puede ver las sustituciones de este alumno", async () => {
      const r = await como<{ id: string }>(
        "authenticated",
        OTRO_ALUMNO,
        `SELECT id FROM public.sustituciones_ejercicios WHERE plan_id = '${PLAN_ID}'`
      );
      expect(r.rows).toHaveLength(0);
    });

    it("el alumno NO puede insertar directamente sustituciones (RLS)", async () => {
      await expect(
        como(
          "authenticated",
          ALUMNO,
          `INSERT INTO public.sustituciones_ejercicios (
            plan_id, ejercicio_original_id, ejercicio_sustituto_id
          ) VALUES ('${PLAN_ID}', '${EJ_BANCA}', '${EJ_FLEXIONES}')`
        )
      ).rejects.toThrow(DENEGADO);
    });
  });

  // ============================================================================
  // 5. TIPOS TYPESCRIPT
  // ============================================================================
  describe("5. Tipos TypeScript Sincronizados", () => {
    it("valida la compilación estática de EjercicioAlternativa y SustitucionEjercicio", () => {
      const dummyAlt: EjercicioAlternativa = {
        id: "a1",
        ejercicio_origen_id: EJ_BANCA,
        ejercicio_alternativo_id: EJ_MANCUERNAS,
        patron_movimiento: "EMPUJE_HORIZONTAL",
        equipamiento: "MANCUERNAS",
        nivel_exigencia: "MEDIO",
        restricciones_articulares: ["HOMBRO"],
        explicacion_tecnica: "Prueba técnica",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      expect(dummyAlt.patron_movimiento).toBe("EMPUJE_HORIZONTAL");

      const dummySust: SustitucionEjercicio = {
        id: "s1",
        plan_id: PLAN_ID,
        ejercicio_en_rutina_id: ITEM_RUTINA_ID,
        ejercicio_original_id: EJ_BANCA,
        ejercicio_sustituto_id: EJ_MANCUERNAS,
        reporte_dolor_id: null,
        motivo: "Dolor subacromial",
        responsable_id: COACH,
        created_at: new Date().toISOString(),
      };
      expect(dummySust.motivo).toBe("Dolor subacromial");

      const dummyAlerta: Partial<AlertaEntrenador> = {
        severidad: "CRITICA",
        estado: "ATENDIDO",
      };
      expect(dummyAlerta.severidad).toBe("CRITICA");

      const dummyDolor: Partial<AlumnoHistorialDolor> = {
        momento_aparicion: "CALENTAMIENTO",
        es_sintoma_alarma: true,
        sintomas_alarma: ["IRRADIACION_ADORMECIMIENTO"],
        estado: "PENDIENTE",
      };
      expect(dummyDolor.es_sintoma_alarma).toBe(true);
    });
  });
});
