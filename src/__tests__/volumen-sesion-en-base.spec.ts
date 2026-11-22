import { describe, it, expect, beforeAll } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";

// GOZS-701: volumen de sesión derivado de registro_series en la base y tempo '0' -> NULL (PGlite real).

const COACH = "00000000-0000-0000-0000-0000000007c1";
const ALUMNO = "00000000-0000-0000-0000-0000000007a1";
const EJ = "10000000-0000-0000-0000-0000000007e1";
const SES = "20000000-0000-0000-0000-000000000701";
const SES2 = "20000000-0000-0000-0000-000000000702";

let db: PGlite;

const volumen = async (id: string) =>
  (
    await db.query<{ total: string; efectivo: string }>(
      `SELECT volumen_total_kg::text total, effective_volume_kg::text efectivo
       FROM public.registro_sesiones WHERE id = $1`,
      [id],
    )
  ).rows[0]!;

async function comoAlumno(sql: string, params: unknown[] = []) {
  await db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: ALUMNO, role: "authenticated" }),
    ]);
    await tx.query(`SET LOCAL ROLE authenticated`);
    await tx.query(sql, params);
  });
}

beforeAll(async () => {
  db = await crearDbMigrada();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${COACH}','c701@t'), ('${ALUMNO}','a701@t');
    INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
      VALUES ('${COACH}','c701@t','Coach','ENTRENADOR','ACTIVA')
      ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, estado_membresia = EXCLUDED.estado_membresia;
    INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia)
      VALUES ('${ALUMNO}','a701@t','Alumno','ALUMNO','${COACH}','ACTIVA')
      ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;
    INSERT INTO public.ejercicios (id, nombre) VALUES ('${EJ}','Sentadilla 701');
  `);
});

describe("registro_sesiones: volumen calculado desde registro_series", () => {
  it("ignora el volumen del cliente y recalcula al insertar, editar y borrar series", async () => {
    // Patrón de la cola offline: sesión creada sin volumen (o con basura) antes de las series.
    await comoAlumno(
      `INSERT INTO public.registro_sesiones (id, alumno_id, volumen_total_kg, effective_volume_kg)
       VALUES ($1, $2, 9999, 9999)`,
      [SES, ALUMNO],
    );
    expect(await volumen(SES)).toEqual({ total: "0.00", efectivo: "0.00" });

    await comoAlumno(
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, set_type)
       VALUES ($1, $2, 1, 20, 10, true, 'WARMUP'),
              ($1, $2, 2, 100, 5, true, 'NORMAL'),
              ($1, $2, 3, 40, 8, true, 'DROPSET'),
              ($1, $2, 4, 200, 5, false, 'NORMAL')`,
      [SES, EJ],
    );
    // 200 + 500 + 320 (la no completada no cuenta); efectivo sin el calentamiento.
    expect(await volumen(SES)).toEqual({ total: "1020.00", efectivo: "820.00" });

    await comoAlumno(
      `UPDATE public.registro_series SET peso_kg = 110 WHERE sesion_id = $1 AND numero_serie = 2`,
      [SES],
    );
    expect(await volumen(SES)).toEqual({ total: "1070.00", efectivo: "870.00" });

    await comoAlumno(`UPDATE public.registro_series SET completada = true WHERE sesion_id = $1 AND numero_serie = 4`, [SES]);
    expect(await volumen(SES)).toEqual({ total: "2070.00", efectivo: "1870.00" });

    await comoAlumno(`DELETE FROM public.registro_series WHERE sesion_id = $1 AND numero_serie = 4`, [SES]);
    expect(await volumen(SES)).toEqual({ total: "1070.00", efectivo: "870.00" });

    // Un upsert posterior de la sesión con volumen 0 no lo pisa.
    await comoAlumno(
      `INSERT INTO public.registro_sesiones (id, alumno_id, volumen_total_kg, effective_volume_kg)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (id) DO UPDATE SET volumen_total_kg = EXCLUDED.volumen_total_kg,
                                      effective_volume_kg = EXCLUDED.effective_volume_kg`,
      [SES, ALUMNO],
    );
    expect(await volumen(SES)).toEqual({ total: "1070.00", efectivo: "870.00" });
  });

  it("el backfill de la migración corrige sesiones que quedaron en 0 con series", async () => {
    await db.exec(`
      INSERT INTO public.registro_sesiones (id, alumno_id) VALUES ('${SES2}', '${ALUMNO}');
      INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada)
        VALUES ('${SES2}', '${EJ}', 1, 66, 5, true);
      -- Simula el dato roto previo a la migración (sin triggers).
      SET session_replication_role = replica;
      UPDATE public.registro_sesiones SET volumen_total_kg = 0, effective_volume_kg = 0 WHERE id = '${SES2}';
      SET session_replication_role = origin;
    `);
    expect(await volumen(SES2)).toEqual({ total: "0.00", efectivo: "0.00" });

    const fs = await import("node:fs");
    const path = await import("node:path");
    const sql = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/migrations/20261122210000_volumen_sesion_en_base_y_tempo_nulo.sql"),
      "utf8",
    );
    await db.exec(sql); // idempotente: re-aplicarla corrige el dato
    expect(await volumen(SES2)).toEqual({ total: "330.00", efectivo: "330.00" });
  });
});

describe("ejercicios_en_rutina.tempo sin valores '0'", () => {
  it("guarda '0' o vacío como NULL y conserva tempos reales", async () => {
    const r = await db.query<{ id: string }>(
      `INSERT INTO public.planes_entrenamiento (profesor_id, alumno_id, nombre)
       VALUES ($1, $2, 'Plan 701') RETURNING id`,
      [COACH, ALUMNO],
    );
    const d = await db.query<{ id: string }>(
      `INSERT INTO public.dias_rutina (plan_id, nombre, orden) VALUES ($1, 'Día 1', 1) RETURNING id`,
      [r.rows[0]!.id],
    );
    const dia = d.rows[0]!.id;
    await db.query(
      `INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones, tempo)
       VALUES ($1, $2, 1, 3, '8', '0'), ($1, $2, 2, 3, '8', ''), ($1, $2, 3, 3, '8', '3-1-1-0')`,
      [dia, EJ],
    );
    const tempos = await db.query<{ tempo: string | null }>(
      `SELECT tempo FROM public.ejercicios_en_rutina WHERE dia_id = $1 ORDER BY orden`,
      [dia],
    );
    expect(tempos.rows.map((t) => t.tempo)).toEqual([null, null, "3-1-1-0"]);

    await db.query(`UPDATE public.ejercicios_en_rutina SET tempo = '0' WHERE dia_id = $1 AND orden = 3`, [dia]);
    const n = await db.query<{ n: number }>(
      `SELECT count(*)::int n FROM public.ejercicios_en_rutina WHERE tempo = '0'`,
    );
    expect(n.rows[0]!.n).toBe(0);
  });
});
