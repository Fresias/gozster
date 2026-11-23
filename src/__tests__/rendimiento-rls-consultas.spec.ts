import * as fs from "node:fs";
import * as path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { fetchLiveDatasetFromSupabase } from "@/services/alumnos-service";
import { aplicarMigracion, crearDbMigrada, listarMigraciones, MIGRATIONS_DIR, STUBS } from "./helpers/pglite-migrada";

const IDX_MIGRATION = "20261123070000_indices_fks_dedup_y_v_estado_alumno.sql";
const RLS_MIGRATION = "20261123080000_rls_policies_select_auth_uid.sql";

const WRAPPED_AUTH_RE =
  /\(\s*select\s+auth\.(uid|role|jwt|email)\s*\(\s*\)(?:\s+as\s+\w+)?\s*\)/gi;
const BARE_AUTH_RE = /\bauth\.(uid|role|jwt|email)\s*\(\s*\)|\bcurrent_setting\s*\(/i;

function tieneAuthSinSelect(expr: string | null): boolean {
  if (!expr) return false;
  return BARE_AUTH_RE.test(expr.replace(WRAPPED_AUTH_RE, ""));
}

describe("GOZS-722 (PL-10): rendimiento de RLS, índices FK/duplicados y fetchLiveDatasetFromSupabase", () => {
  describe("1. Migraciones SQL de índices y políticas RLS (PGlite)", () => {
    let db: PGlite;

    beforeAll(async () => {
      db = await crearDbMigrada();
    }, 120_000);

    it("ambas migraciones son idempotentes (re-aplicadas sobre el esquema migrado hasta RLS_MIGRATION)", async () => {
      // Se migra sólo hasta RLS_MIGRATION: migraciones posteriores (p. ej. la poda de
      // tablas de GOZS-720) eliminan tablas que estas dos migraciones referencian.
      const hasta = await PGlite.create({ extensions: { pgcrypto } });
      await hasta.exec(STUBS);
      for (const archivo of listarMigraciones().filter((f) => f <= RLS_MIGRATION)) {
        await aplicarMigracion(hasta, fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
      }
      for (const archivo of [IDX_MIGRATION, RLS_MIGRATION]) {
        await expect(
          aplicarMigracion(hasta, fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8")),
        ).resolves.toBeUndefined();
      }
      await hasta.close();
    }, 180_000);

    it("GIVEN todas las FK de public WHEN se aplica la migración de índices THEN ninguna FK queda sin índice de prefijo", async () => {
      const res = await db.query<{
        table_name: string;
        fk_name: string;
        fk_columns: string[];
      }>(`
        WITH fk_cols AS (
          SELECT
            c.oid AS conoid,
            cl.relname AS table_name,
            c.conname AS fk_name,
            c.conrelid,
            c.conkey,
            array_agg(a.attname ORDER BY u.ord) AS fk_columns
          FROM pg_constraint c
          JOIN pg_class cl ON cl.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = cl.relnamespace
          CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = u.attnum
          WHERE c.contype = 'f' AND n.nspname = 'public'
          GROUP BY c.oid, cl.relname, c.conname, c.conrelid, c.conkey
        ),
        idx_cols AS (
          SELECT
            i.indrelid,
            (string_to_array(i.indkey::text, ' '))::int2[] AS key_attnums
          FROM pg_index i
          WHERE i.indisvalid AND i.indisready
        )
        SELECT f.table_name, f.fk_name, f.fk_columns
        FROM fk_cols f
        WHERE NOT EXISTS (
          SELECT 1 FROM idx_cols ic
          WHERE ic.indrelid = f.conrelid
            AND ic.key_attnums[1:array_length(f.conkey, 1)] = f.conkey
        )
        ORDER BY f.table_name, f.fk_name;
      `);

      expect(res.rows).toEqual([]);
    });

    it("GIVEN índices en public WHEN se aplica la migración THEN no quedan índices duplicados y los 5 redundantes fueron eliminados", async () => {
      const dups = await db.query<{ table_name: string; indexes: string[] }>(`
        SELECT
          t.relname AS table_name,
          array_agg(ic.relname ORDER BY ic.relname) AS indexes
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace ns ON ns.oid = t.relnamespace
        JOIN pg_class ic ON ic.oid = i.indexrelid
        WHERE ns.nspname = 'public'
        GROUP BY
          t.relname,
          i.indkey::text,
          COALESCE(pg_get_expr(i.indexprs, i.indrelid), ''),
          COALESCE(pg_get_expr(i.indpred, i.indrelid), '')
        HAVING count(*) > 1;
      `);

      expect(dups.rows).toEqual([]);

      const eliminados = await db.query<{ relname: string }>(`
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'i'
          AND c.relname = ANY(ARRAY[
            'idx_alumno_cuestionario_inicial_alumno_id',
            'idx_conversaciones_alumno',
            'idx_dias_rutina_plan_orden',
            'idx_habitos_alumno_fecha',
            'idx_nutricion_alumno_fecha'
          ]);
      `);

      expect(eliminados.rows).toEqual([]);
    });

    it("crea índices compuestos para v_estado_alumno en contrataciones(alumno_id, fecha_fin) y cobros(alumno_id, fecha_vencimiento)", async () => {
      const res = await db.query<{ indexname: string; indexdef: string }>(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
            'idx_contrataciones_alumno_fecha_fin',
            'idx_cobros_alumno_fecha_vencimiento'
          )
        ORDER BY indexname;
      `);

      expect(res.rows).toHaveLength(2);
      const porNombre = new Map(res.rows.map((r) => [r.indexname, r.indexdef]));
      expect(porNombre.get("idx_contrataciones_alumno_fecha_fin")).toMatch(
        /\(alumno_id,\s*fecha_fin DESC,\s*created_at DESC\)/i,
      );
      expect(porNombre.get("idx_cobros_alumno_fecha_vencimiento")).toMatch(
        /\(alumno_id,\s*fecha_vencimiento\)/i,
      );
    });

    it("GIVEN las políticas RLS actuales WHEN se aplica la migración de políticas THEN ninguna llama auth.uid()/auth.role()/auth.jwt() sin (SELECT ...)", async () => {
      const pols = await db.query<{
        tablename: string;
        policyname: string;
        qual: string | null;
        with_check: string | null;
      }>(`
        SELECT tablename, policyname, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
        ORDER BY tablename, policyname;
      `);

      // 87: GOZS-720 podó 4 tablas sin uso y con ellas sus políticas (antes, >= 90).
      expect(pols.rows.length).toBeGreaterThanOrEqual(87);

      const sinInitPlan = pols.rows.filter(
        (p) => tieneAuthSinSelect(p.qual) || tieneAuthSinSelect(p.with_check),
      );
      expect(sinInitPlan).toEqual([]);
    });

    it("no modifica es_entrenador_de() en ninguna de las dos migraciones (fuera de alcance PL-6)", () => {
      const sqlIdx = fs.readFileSync(path.join(MIGRATIONS_DIR, IDX_MIGRATION), "utf-8");
      const sqlRls = fs.readFileSync(path.join(MIGRATIONS_DIR, RLS_MIGRATION), "utf-8");
      expect(sqlIdx).not.toMatch(/FUNCTION\s+public\.es_entrenador_de/i);
      expect(sqlRls).not.toMatch(/FUNCTION\s+public\.es_entrenador_de/i);
    });
  });

  describe("2. fetchLiveDatasetFromSupabase: proyección explícita y filtros por coach/alumno", () => {
    interface QueryCall {
      table: string;
      select: string;
      filters: Array<{ op: string; args: unknown[] }>;
    }

    function crearMockPostgrest(params: {
      userId: string;
      rol: "ENTRENADOR" | "ALUMNO" | "ADMIN";
      alumnosVinculados?: Array<{ alumno_id: string }>;
      dataByTable: Record<string, unknown[]>;
    }) {
      const calls: QueryCall[] = [];

      const client = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: params.userId } }, error: null }),
        },
        from: vi.fn((table: string) => ({
          select: vi.fn((columns: string) => {
            const call: QueryCall = { table, select: columns, filters: [] };
            calls.push(call);

            const resolveData = () => {
              if (table === "perfiles" && columns === "id, rol") {
                return { data: { id: params.userId, rol: params.rol }, error: null };
              }
              if (table === "entrenador_alumnos") {
                return { data: params.alumnosVinculados ?? [], error: null };
              }
              return { data: params.dataByTable[table] ?? [], error: null };
            };

            const builder: any = {
              eq: vi.fn((...args: unknown[]) => {
                call.filters.push({ op: "eq", args });
                return builder;
              }),
              or: vi.fn((...args: unknown[]) => {
                call.filters.push({ op: "or", args });
                return builder;
              }),
              in: vi.fn((...args: unknown[]) => {
                call.filters.push({ op: "in", args });
                return builder;
              }),
              order: vi.fn(() => Promise.resolve(resolveData())),
              maybeSingle: vi.fn(() => Promise.resolve(resolveData())),
              then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
                Promise.resolve(resolveData()).then(resolve, reject),
            };

            return builder;
          }),
        })),
      } as any;

      return { client, calls };
    }

    it("para un ENTRENADOR selecciona columnas explícitas (sin select('*')) y filtra las 9 tablas por coach y alumnos", async () => {
      const coachId = "00000000-0000-4000-8000-0000000000c1";
      const alu1 = "00000000-0000-4000-8000-0000000000a1";
      const alu2 = "00000000-0000-4000-8000-0000000000a2";
      const plan1 = "00000000-0000-4000-8000-000000000101";
      const dia1 = "00000000-0000-4000-8000-000000000201";

      const { client, calls } = crearMockPostgrest({
        userId: coachId,
        rol: "ENTRENADOR",
        alumnosVinculados: [{ alumno_id: alu2 }],
        dataByTable: {
          perfiles: [
            { id: alu1, nombre_completo: "Ana", rol: "ALUMNO", profesor_asignado_id: coachId },
            { id: alu2, nombre_completo: "Beto", rol: "ALUMNO", profesor_asignado_id: null },
          ],
          planes_entrenamiento: [{ id: plan1, alumno_id: alu1, profesor_id: coachId, nombre: "Plan A", estado: "ACTIVO" }],
          dias_rutina: [{ id: dia1, plan_id: plan1, nombre: "Día 1", orden: 1 }],
          ejercicios_en_rutina: [{ id: "er-1", dia_id: dia1, ejercicio_id: "ej-1", orden: 1 }],
          ejercicios: [{ id: "ej-1", nombre: "Sentadilla" }],
          alumno_actividades: [{ id: "aa-1", alumno_id: alu1, actividad: "FUNCIONAL" }],
          contrataciones: [{ id: "ct-1", alumno_id: alu1, estado: "VIGENTE" }],
          planes_membresia: [{ id: "pm-1", nombre: "Pase Libre", precio: 35000, activo: true }],
          cobros: [{ id: "cb-1", alumno_id: alu1, monto: 35000, estado: "PENDIENTE" }],
        },
      });

      const dataset = await fetchLiveDatasetFromSupabase(client);

      expect(dataset.alumnos).toHaveLength(2);
      expect(dataset.planes).toHaveLength(1);
      expect(dataset.dias).toHaveLength(1);
      expect(dataset.ejerciciosEnRutina).toHaveLength(1);

      // Ninguna consulta usa select("*")
      for (const call of calls) {
        expect(call.select.trim()).not.toBe("*");
        expect(call.select).not.toContain("*");
      }

      const byTable = (t: string) =>
        calls.filter((c) => c.table === t && !(t === "perfiles" && c.select === "id, rol"))[0]!;

      // Perfiles filtrados por profesor_asignado_id o entrenador_alumnos y sin columnas no usadas
      expect(byTable("perfiles").select).not.toContain("debe_cambiar_password");
      expect(byTable("perfiles").select).not.toContain("onboarding_completado");
      expect(byTable("perfiles").filters).toContainEqual({
        op: "or",
        args: [`profesor_asignado_id.eq.${coachId},id.in.(${alu2})`],
      });

      // Planes filtrados por plantillas + profesor_id + alumnos del coach
      expect(byTable("planes_entrenamiento").filters).toContainEqual({
        op: "or",
        args: [`alumno_id.is.null,profesor_id.eq.${coachId},alumno_id.in.(${alu1},${alu2})`],
      });

      // Tablas dependientes filtradas por IDs relacionados
      expect(byTable("dias_rutina").filters).toContainEqual({ op: "in", args: ["plan_id", [plan1]] });
      expect(byTable("ejercicios_en_rutina").filters).toContainEqual({ op: "in", args: ["dia_id", [dia1]] });
      expect(byTable("alumno_actividades").filters).toContainEqual({ op: "in", args: ["alumno_id", [alu1, alu2]] });
      expect(byTable("contrataciones").filters).toContainEqual({ op: "in", args: ["alumno_id", [alu1, alu2]] });
      expect(byTable("cobros").filters).toContainEqual({ op: "in", args: ["alumno_id", [alu1, alu2]] });
    });

    it("para un ALUMNO filtra perfiles y planes por su propio id sin consultar plantillas ajenas", async () => {
      const aluId = "00000000-0000-4000-8000-0000000000a9";
      const { client, calls } = crearMockPostgrest({
        userId: aluId,
        rol: "ALUMNO",
        dataByTable: {
          perfiles: [{ id: aluId, nombre_completo: "Alumno Solo", rol: "ALUMNO" }],
          planes_entrenamiento: [],
          ejercicios: [],
          alumno_actividades: [],
          contrataciones: [],
          planes_membresia: [],
          cobros: [],
        },
      });

      const dataset = await fetchLiveDatasetFromSupabase(client);
      expect(dataset.alumnos).toHaveLength(1);
      expect(dataset.dias).toEqual([]);
      expect(dataset.ejerciciosEnRutina).toEqual([]);

      const perfilCall = calls.find((c) => c.table === "perfiles" && c.select !== "id, rol")!;
      expect(perfilCall.filters).toContainEqual({ op: "eq", args: ["id", aluId] });

      const planCall = calls.find((c) => c.table === "planes_entrenamiento")!;
      expect(planCall.filters).toContainEqual({ op: "eq", args: ["alumno_id", aluId] });

      // Con 0 planes, evita consultas vacías a dias_rutina y ejercicios_en_rutina
      expect(calls.some((c) => c.table === "dias_rutina")).toBe(false);
      expect(calls.some((c) => c.table === "ejercicios_en_rutina")).toBe(false);
    });
  });
});
