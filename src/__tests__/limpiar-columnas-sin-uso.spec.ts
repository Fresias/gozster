import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

// GOZS-721 (PL-9): columnas sin uso eliminadas; las que la app usa se conservan.
const MIGRACION = "20261123130000_limpiar_columnas_sin_uso.sql";
const ALUMNO = "00000000-0000-0000-0000-0000000007a1";
const EJERCICIO = "00000000-0000-0000-0000-0000000007e1";

let db: PGlite;

async function columnas(tabla: string): Promise<string[]> {
  const r = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tabla],
  );
  return r.rows.map((x) => x.column_name);
}

describe("GOZS-721: limpiar columnas sin uso", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  it("elimina estado_recuperacion, athlete_feedback y whatsapp_habilitado", async () => {
    expect(await columnas("alumno_historial_dolor")).not.toContain("estado_recuperacion");
    expect(await columnas("v_dolor_activo")).not.toContain("estado_recuperacion");
    expect(await columnas("registro_sesiones")).not.toContain("athlete_feedback");
    expect(await columnas("perfiles")).not.toContain("whatsapp_habilitado");
  });

  it("conserva las columnas en uso (estado, tags, etiqueta, es_superserie, tempo, tempo_activo)", async () => {
    expect(await columnas("alumno_historial_dolor")).toContain("estado");
    expect(await columnas("planes_entrenamiento")).toEqual(expect.arrayContaining(["tags", "etiqueta"]));
    expect(await columnas("ejercicios_en_rutina")).toEqual(
      expect.arrayContaining(["es_superserie", "grupo_superserie", "tempo", "tempo_activo"]),
    );
  });

  it("ninguna función de public referencia las columnas eliminadas", async () => {
    const r = await db.query<{ proname: string }>(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosrc ~ '(estado_recuperacion|athlete_feedback|whatsapp_habilitado)'`,
    );
    expect(r.rows.map((x) => x.proname)).toEqual([]);
  });

  it("actualizar_estado_dolor sigue funcionando solo con estado", async () => {
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_app_meta_data) VALUES ('${ALUMNO}', 'a721@test.local', '{"rol":"ALUMNO"}');
      INSERT INTO public.perfiles (id, email, nombre_completo, rol) VALUES ('${ALUMNO}', 'a721@test.local', 'Alumno 721', 'ALUMNO')
        ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.ejercicios (id, nombre) VALUES ('${EJERCICIO}', 'Ejercicio 721');
    `);
    const ins = await db.query<{ id: string; estado: string }>(
      `INSERT INTO public.alumno_historial_dolor (alumno_id, ejercicio_id, zona_articular, severidad)
       VALUES ($1, $2, 'RODILLA', 'LEVE') RETURNING id, estado`,
      [ALUMNO, EJERCICIO],
    );
    expect(ins.rows[0]!.estado).toBe("PENDIENTE");

    const upd = await db.query<{ estado: string }>(
      `SELECT estado FROM public.actualizar_estado_dolor($1, 'ATENDIDO', NULL)`,
      [ins.rows[0]!.id],
    );
    expect(upd.rows[0]!.estado).toBe("ATENDIDO");
  });

  it("la migración es idempotente", async () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACION), "utf-8");
    await expect(aplicarMigracion(db, sql)).resolves.toBeUndefined();
  });
});
