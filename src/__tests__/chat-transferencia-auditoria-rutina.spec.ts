import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Issue #66 (ADR-004 / GOZS-45): Asignación/transferencia de conversaciones
// con RLS automático y auditoría de cambios de rutina en Supabase (PostgreSQL 15+).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261022000000_chat_gozs_transferencia_auditoria_rutina.sql";

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH_ORIGINAL = "00000000-0000-0000-0000-00000000c0ac";
const COACH_NUEVO = "00000000-0000-0000-0000-0000000000c2";
const COACH_AJENO = "00000000-0000-0000-0000-0000000000c3";
const ALUMNO = "00000000-0000-0000-0000-00000000000a";
const OTRO_ALUMNO = "00000000-0000-0000-0000-00000000000b";
const EJERCICIO_ID = "00000000-0000-0000-0000-0000000000e1";

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
    ('${COACH_ORIGINAL}','coach1@t'),
    ('${COACH_NUEVO}','coach2@t'),
    ('${COACH_AJENO}','coach3@t'),
    ('${ALUMNO}','alumno@t'),
    ('${OTRO_ALUMNO}','otro@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}','admin@t','Admin GOZS','ADMIN',NULL,'ACTIVA'),
    ('${COACH_ORIGINAL}','coach1@t','Coach Original','ENTRENADOR',NULL,'ACTIVA'),
    ('${COACH_NUEVO}','coach2@t','Coach Nuevo','ENTRENADOR',NULL,'ACTIVA'),
    ('${COACH_AJENO}','coach3@t','Coach Ajeno','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','alumno@t','Alumno GOZS','ALUMNO','${COACH_ORIGINAL}','ACTIVA'),
    ('${OTRO_ALUMNO}','otro@t','Otro Alumno','ALUMNO','${COACH_AJENO}','ACTIVA');
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

const DENEGADO = /row-level security|permission denied|No autorizado|No se pudo/;

describe("Issue #66 (ADR-004): Asignación/Transferencia de Chat y Auditoría de Rutina", () => {
  let conversacionId: string;
  let planId: string;
  let diaId: string;
  let ejercicioId: string;

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

    // Probar idempotencia de la nueva migración
    await aplicarMigracion(fs.readFileSync(path.join(MIGRATIONS_DIR, NEW_MIGRATION), "utf-8"));

    // Crear conversación para el alumno (via RPC obtener_o_crear_conversacion)
    const convRes = await como<{ obtener_o_crear_conversacion: string }>(
      "authenticated",
      COACH_ORIGINAL,
      `SELECT public.obtener_o_crear_conversacion('${ALUMNO}')`
    );
    conversacionId = convRes.rows[0]!.obtener_o_crear_conversacion;

    // Insertar un ejercicio en el catálogo para las pruebas de rutina
    await db.exec(
      `INSERT INTO public.ejercicios (id, nombre, musculos_principales)
       VALUES ('${EJERCICIO_ID}', 'Press de Banca', ARRAY['PECHO', 'TRICEPS'])
       ON CONFLICT (id) DO NOTHING`
    );
    ejercicioId = EJERCICIO_ID;
  }, 60_000);

  describe("1. Idempotencia y Schema", () => {
    it("conversaciones contiene columnas responsable_id y estado con check válido", async () => {
      const info = await db.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_name = 'conversaciones'
           AND column_name IN ('responsable_id', 'estado')`
      );
      expect(info.rows).toHaveLength(2);

      const conv = await db.query<{ estado: string; responsable_id: string | null }>(
        `SELECT estado, responsable_id FROM public.conversaciones WHERE id = '${conversacionId}'`
      );
      expect(conv.rows[0]!.estado).toBe("ABIERTA");
      // Inicializado con el profesor_asignado_id del alumno
      expect(conv.rows[0]!.responsable_id).toBe(COACH_ORIGINAL);
    });

    it("auditoria_cambios contiene columna usuario_id", async () => {
      const info = await db.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_name = 'auditoria_cambios'
           AND column_name = 'usuario_id'`
      );
      expect(info.rows).toHaveLength(1);
    });

    it("rechaza estados inválidos en conversaciones", async () => {
      await expect(
        db.query(
          `UPDATE public.conversaciones SET estado = 'INVALIDO' WHERE id = '${conversacionId}'`
        )
      ).rejects.toThrow(/chk_conversaciones_estado/);
    });
  });

  describe("2. RPC public.transferir_conversacion_gozs", () => {
    it("rechaza ejecución por alumno o coach no asignado", async () => {
      await expect(
        como(
          "authenticated",
          ALUMNO,
          `SELECT public.transferir_conversacion_gozs('${conversacionId}', '${COACH_NUEVO}', 'alumno intentando transferir')`
        )
      ).rejects.toThrow(DENEGADO);

      await expect(
        como(
          "authenticated",
          COACH_AJENO,
          `SELECT public.transferir_conversacion_gozs('${conversacionId}', '${COACH_NUEVO}', 'coach ajeno')`
        )
      ).rejects.toThrow(DENEGADO);
    });

    it("rechaza transferir a un usuario que no tiene rol ENTRENADOR o ADMIN", async () => {
      await expect(
        como(
          "authenticated",
          COACH_ORIGINAL,
          `SELECT public.transferir_conversacion_gozs('${conversacionId}', '${OTRO_ALUMNO}', 'transferir a alumno')`
        )
      ).rejects.toThrow(/rol ENTRENADOR o ADMIN/);
    });

    it("rechaza transferir al mismo alumno de la conversación", async () => {
      await expect(
        como(
          "authenticated",
          COACH_ORIGINAL,
          `SELECT public.transferir_conversacion_gozs('${conversacionId}', '${ALUMNO}', 'auto-transferencia')`
        )
      ).rejects.toThrow(/rol ENTRENADOR o ADMIN/);
    });

    it("transfiere exitosamente: actualiza responsable_id, vincula en entrenador_alumnos y audita", async () => {
      const res = await como<{ id: string; responsable_id: string; estado: string }>(
        "authenticated",
        COACH_ORIGINAL,
        `SELECT id, responsable_id, estado
         FROM public.transferir_conversacion_gozs('${conversacionId}', '${COACH_NUEVO}', 'Reasignación de pretemporada')`
      );

      expect(res.rows[0]!.responsable_id).toBe(COACH_NUEVO);

      // Verificar que el nuevo coach fue insertado en entrenador_alumnos
      const vinculacion = await db.query<{ entrenador_id: string; alumno_id: string; rol_entrenador: string }>(
        `SELECT entrenador_id, alumno_id, rol_entrenador
         FROM public.entrenador_alumnos
         WHERE entrenador_id = '${COACH_NUEVO}' AND alumno_id = '${ALUMNO}'`
      );
      expect(vinculacion.rows).toHaveLength(1);
      expect(vinculacion.rows[0]!.rol_entrenador).toBe("COACH");

      // Verificar que ahora es_entrenador_de es true para COACH_NUEVO
      const permiso = await como<{ es_entrenador_de: boolean }>(
        "authenticated",
        COACH_NUEVO,
        `SELECT public.es_entrenador_de('${ALUMNO}')`
      );
      expect(permiso.rows[0]!.es_entrenador_de).toBe(true);

      // Verificar registro en auditoria_cambios
      const audit = await db.query<{
        entidad: string;
        entidad_id: string;
        accion: string;
        motivo: string;
        autorizado_por: string;
        usuario_id: string;
        valores_anteriores: { responsable_id: string };
        valores_nuevos: { responsable_id: string };
      }>(
        `SELECT entidad, entidad_id, accion, motivo, autorizado_por, usuario_id,
                valores_anteriores, valores_nuevos
         FROM public.auditoria_cambios
         WHERE entidad = 'conversaciones' AND entidad_id = '${conversacionId}'`
      );

      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({
        entidad: "conversaciones",
        entidad_id: conversacionId,
        accion: "TRANSFERENCIA_RESPONSABLE",
        motivo: "Reasignación de pretemporada",
        autorizado_por: COACH_ORIGINAL,
        usuario_id: COACH_ORIGINAL,
        valores_anteriores: { responsable_id: COACH_ORIGINAL },
        valores_nuevos: { responsable_id: COACH_NUEVO },
      });
    });

    it("permite transferencia por ADMIN de forma idempotente", async () => {
      // Transferencia ejecutada por ADMIN de vuelta a COACH_ORIGINAL
      const res = await como<{ responsable_id: string }>(
        "authenticated",
        ADMIN,
        `SELECT responsable_id
         FROM public.transferir_conversacion_gozs('${conversacionId}', '${COACH_ORIGINAL}', 'Retorno a coach original por Admin')`
      );

      expect(res.rows[0]!.responsable_id).toBe(COACH_ORIGINAL);

      // Repetir la misma transferencia (idempotente: no debe fallar con conflicto de unicidad en entrenador_alumnos)
      const repeat = await como<{ responsable_id: string }>(
        "authenticated",
        ADMIN,
        `SELECT responsable_id
         FROM public.transferir_conversacion_gozs('${conversacionId}', '${COACH_ORIGINAL}', 'Re-confirmación')`
      );
      expect(repeat.rows[0]!.responsable_id).toBe(COACH_ORIGINAL);
    });
  });

  describe("3. Triggers de Auditoría en Core de Rutinas", () => {
    it("audita INSERT en planes_entrenamiento con autoría real (usuario_id)", async () => {
      const auditCountBefore = (
        await db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM public.auditoria_cambios WHERE entidad = 'planes_entrenamiento'`
        )
      ).rows[0]!.n;

      const planRes = await como<{ id: string }>(
        "authenticated",
        COACH_ORIGINAL,
        `INSERT INTO public.planes_entrenamiento (profesor_id, alumno_id, nombre, comentarios)
         VALUES ('${COACH_ORIGINAL}', '${ALUMNO}', 'Plan Hipertrofia 2026', 'Fase 1 base')
         RETURNING id`
      );
      planId = planRes.rows[0]!.id;

      const audit = await db.query<{
        entidad: string;
        entidad_id: string;
        accion: string;
        usuario_id: string;
        valores_nuevos: { nombre: string };
      }>(
        `SELECT entidad, entidad_id, accion, usuario_id, valores_nuevos
         FROM public.auditoria_cambios
         WHERE entidad = 'planes_entrenamiento' AND entidad_id = '${planId}' AND accion = 'INSERT'`
      );

      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]!.usuario_id).toBe(COACH_ORIGINAL);
      expect(audit.rows[0]!.valores_nuevos.nombre).toBe("Plan Hipertrofia 2026");
    });

    it("audita UPDATE en planes_entrenamiento con valores_anteriores y valores_nuevos", async () => {
      await como(
        "authenticated",
        COACH_ORIGINAL,
        `UPDATE public.planes_entrenamiento
         SET nombre = 'Plan Hipertrofia 2026 - Ajustado'
         WHERE id = '${planId}'`
      );

      const audit = await db.query<{
        accion: string;
        usuario_id: string;
        valores_anteriores: { nombre: string };
        valores_nuevos: { nombre: string };
      }>(
        `SELECT accion, usuario_id, valores_anteriores, valores_nuevos
         FROM public.auditoria_cambios
         WHERE entidad = 'planes_entrenamiento' AND entidad_id = '${planId}' AND accion = 'UPDATE'`
      );

      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]!.usuario_id).toBe(COACH_ORIGINAL);
      expect(audit.rows[0]!.valores_anteriores.nombre).toBe("Plan Hipertrofia 2026");
      expect(audit.rows[0]!.valores_nuevos.nombre).toBe("Plan Hipertrofia 2026 - Ajustado");
    });

    it("audita INSERT y UPDATE en dias_rutina", async () => {
      const diaRes = await como<{ id: string }>(
        "authenticated",
        COACH_ORIGINAL,
        `INSERT INTO public.dias_rutina (plan_id, nombre, orden)
         VALUES ('${planId}', 'Día 1: Torso Pesado', 1)
         RETURNING id`
      );
      diaId = diaRes.rows[0]!.id;

      await como(
        "authenticated",
        COACH_ORIGINAL,
        `UPDATE public.dias_rutina
         SET nombre = 'Día 1: Torso / Empuje'
         WHERE id = '${diaId}'`
      );

      const audit = await db.query<{ accion: string; valores_nuevos: { nombre: string } }>(
        `SELECT accion, valores_nuevos
         FROM public.auditoria_cambios
         WHERE entidad = 'dias_rutina' AND entidad_id = '${diaId}'
         ORDER BY created_at ASC`
      );

      expect(audit.rows).toHaveLength(2);
      expect(audit.rows[0]!.accion).toBe("INSERT");
      expect(audit.rows[0]!.valores_nuevos.nombre).toBe("Día 1: Torso Pesado");
      expect(audit.rows[1]!.accion).toBe("UPDATE");
      expect(audit.rows[1]!.valores_nuevos.nombre).toBe("Día 1: Torso / Empuje");
    });

    it("audita INSERT, UPDATE y DELETE en ejercicios_en_rutina", async () => {
      const ejRutinaRes = await como<{ id: string }>(
        "authenticated",
        COACH_ORIGINAL,
        `INSERT INTO public.ejercicios_en_rutina (
           dia_id, ejercicio_id, orden, series, repeticiones, descanso_segundos, rpe_objetivo
         ) VALUES (
           '${diaId}', '${ejercicioId}', 1, 4, '8-10', 120, 8.5
         ) RETURNING id`
      );
      const ejRutinaId = ejRutinaRes.rows[0]!.id;

      await como(
        "authenticated",
        COACH_ORIGINAL,
        `UPDATE public.ejercicios_en_rutina
         SET series = 5, repeticiones = '6-8'
         WHERE id = '${ejRutinaId}'`
      );

      await como(
        "authenticated",
        COACH_ORIGINAL,
        `DELETE FROM public.ejercicios_en_rutina WHERE id = '${ejRutinaId}'`
      );

      const audit = await db.query<{
        accion: string;
        valores_anteriores: { series?: number };
        valores_nuevos: { series?: number };
      }>(
        `SELECT accion, valores_anteriores, valores_nuevos
         FROM public.auditoria_cambios
         WHERE entidad = 'ejercicios_en_rutina' AND entidad_id = '${ejRutinaId}'
         ORDER BY created_at ASC`
      );

      expect(audit.rows).toHaveLength(3);
      expect(audit.rows[0]!.accion).toBe("INSERT");
      expect(audit.rows[0]!.valores_nuevos.series).toBe(4);

      expect(audit.rows[1]!.accion).toBe("UPDATE");
      expect(audit.rows[1]!.valores_anteriores.series).toBe(4);
      expect(audit.rows[1]!.valores_nuevos.series).toBe(5);

      expect(audit.rows[2]!.accion).toBe("DELETE");
      expect(audit.rows[2]!.valores_anteriores.series).toBe(5);
      expect(audit.rows[2]!.valores_nuevos).toBeNull();
    });
  });

  describe("4. Row Level Security en Conversaciones y Auditoría", () => {
    it("el nuevo responsable puede consultar y actualizar la conversación", async () => {
      // COACH_NUEVO asignado como responsable puede consultar la conversación
      const r = await como<{ id: string; estado: string }>(
        "authenticated",
        COACH_NUEVO,
        `SELECT id, estado FROM public.conversaciones WHERE id = '${conversacionId}'`
      );
      expect(r.rows).toHaveLength(1);

      // Actualizar estado de conversación por el responsable
      const updated = await como<{ id: string; estado: string }>(
        "authenticated",
        COACH_NUEVO,
        `UPDATE public.conversaciones SET estado = 'ATENDIDA' WHERE id = '${conversacionId}' RETURNING id, estado`
      );
      expect(updated.rows[0]!.estado).toBe("ATENDIDA");
    });

    it("un entrenador ajeno sin vinculación no puede ver la conversación", async () => {
      const r = await como<{ id: string }>(
        "authenticated",
        COACH_AJENO,
        `SELECT id FROM public.conversaciones WHERE id = '${conversacionId}'`
      );
      expect(r.rows).toHaveLength(0);
    });

    it("el alumno no puede consultar la tabla de auditoria_cambios", async () => {
      const r = await como<{ id: string }>(
        "authenticated",
        ALUMNO,
        `SELECT id FROM public.auditoria_cambios`
      );
      expect(r.rows).toHaveLength(0);
    });

    it("el entrenador asignado puede consultar las auditorías de su alumno", async () => {
      const r = await como<{ id: string }>(
        "authenticated",
        COACH_ORIGINAL,
        `SELECT id FROM public.auditoria_cambios WHERE entidad = 'planes_entrenamiento' AND entidad_id = '${planId}'`
      );
      expect(r.rows.length).toBeGreaterThanOrEqual(1);
    });

    it("el admin puede consultar todas las auditorías", async () => {
      const r = await como<{ id: string }>(
        "authenticated",
        ADMIN,
        `SELECT id FROM public.auditoria_cambios`
      );
      expect(r.rows.length).toBeGreaterThanOrEqual(2);
    });
  });
});
