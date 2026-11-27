import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { crearDbMigrada } from "./helpers/pglite-migrada";

// GOZS-705 (D-1/D-2): seed de producción versionado, idempotente, sin personas y con feriados 2026-2027.

const ROOT = path.resolve(__dirname, "../..");
const SEED_PATH = path.join(ROOT, "supabase/seed_produccion.sql");
const SEED_GOZS_PATH = path.join(ROOT, "supabase/seed_gozs.sql");
const FERIADOS_2027_PATH = path.join(ROOT, "supabase/seed_data/feriados_ar_2027.sql");

const ALUMNO = "00000000-0000-0000-0000-0000000000b1";

const FERIADOS_2027_ESPERADOS = [
  "2027-01-01",
  "2027-02-08",
  "2027-02-09",
  "2027-03-24",
  "2027-03-26",
  "2027-04-02",
  "2027-05-01",
  "2027-05-25",
  "2027-06-20",
  "2027-06-21",
  "2027-07-09",
  "2027-08-16",
  "2027-10-11",
  "2027-11-20",
  "2027-12-08",
  "2027-12-25",
];

let db: PGlite;
let seedSql: string;

function comoAutenticado<T>(sub: string, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub, role: "authenticated" }),
    ]);
    await tx.query(`SET LOCAL ROLE authenticated`);
    return tx.query<T>(sql);
  });
}

describe("GOZS-705: seed de producción sin personas e idempotente", () => {
  beforeAll(async () => {
    seedSql = fs.readFileSync(SEED_PATH, "utf-8");
    db = await crearDbMigrada();
  }, 60_000);

  it("el archivo SQL no contiene emails, perfiles, usuarios ni referencias a personas", () => {
    const sinComentarios = seedSql
      .split(/\r?\n/)
      .filter((linea) => !linea.trimStart().startsWith("--"))
      .join("\n");

    const emails = sinComentarios.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g) ?? [];
    expect(emails).toEqual([]);

    const tablasProhibidas = [
      "auth.users",
      "perfiles",
      "entrenador_alumnos",
      "contrataciones",
      "cobros",
      "pagos",
      "registro_sesiones",
      "registro_series",
      "mensajes",
      "notificaciones",
      "alumno_historial_dolor",
      "alumno_cuestionario_inicial",
    ];
    for (const tabla of tablasProhibidas) {
      const rx = new RegExp(`INSERT\\s+INTO\\s+(?:public\\.)?${tabla.replace(".", "\\.")}\\b`, "i");
      expect(sinComentarios).not.toMatch(rx);
    }

    expect(sinComentarios).not.toMatch(/"(?:creado_por|profesor_id|alumno_id|plan_origen_id)"\s*:\s*"/);
  });

  it("carga catálogo, plantillas y feriados 2026-2027 en base vacía y es idempotente al correrlo dos veces", async () => {
    const contar = async () => {
      const r = await db.query<{
        ejercicios: number;
        ejercicios_con_video: number;
        ejercicios_sin_video: number;
        ejercicios_con_creador: number;
        plantillas: number;
        planes_con_persona: number;
        dias: number;
        ejercicios_rutina: number;
        tempo_cero: number;
        feriados: number;
        feriados_2026: number;
        feriados_2027: number;
        usuarios: number;
        perfiles: number;
        contrataciones: number;
        sesiones: number;
        series: number;
        usa_barra_true: number;
        usa_barra_false: number;
      }>(`
        SELECT
          (SELECT count(*)::int FROM public.ejercicios) AS ejercicios,
          (SELECT count(*)::int FROM public.ejercicios WHERE url_video IS NOT NULL AND btrim(url_video) <> '') AS ejercicios_con_video,
          (SELECT count(*)::int FROM public.ejercicios WHERE url_video IS NULL OR btrim(url_video) = '') AS ejercicios_sin_video,
          (SELECT count(*)::int FROM public.ejercicios WHERE creado_por IS NOT NULL) AS ejercicios_con_creador,
          (SELECT count(*)::int FROM public.planes_entrenamiento WHERE alumno_id IS NULL) AS plantillas,
          (SELECT count(*)::int FROM public.planes_entrenamiento WHERE alumno_id IS NOT NULL OR profesor_id IS NOT NULL OR plan_origen_id IS NOT NULL) AS planes_con_persona,
          (SELECT count(*)::int FROM public.dias_rutina) AS dias,
          (SELECT count(*)::int FROM public.ejercicios_en_rutina) AS ejercicios_rutina,
          (SELECT count(*)::int FROM public.ejercicios_en_rutina WHERE tempo = '0') AS tempo_cero,
          (SELECT count(*)::int FROM public.feriados) AS feriados,
          (SELECT count(*)::int FROM public.feriados WHERE fecha BETWEEN '2026-01-01' AND '2026-12-31') AS feriados_2026,
          (SELECT count(*)::int FROM public.feriados WHERE fecha BETWEEN '2027-01-01' AND '2027-12-31') AS feriados_2027,
          (SELECT count(*)::int FROM auth.users) AS usuarios,
          (SELECT count(*)::int FROM public.perfiles) AS perfiles,
          (SELECT count(*)::int FROM public.contrataciones) AS contrataciones,
          (SELECT count(*)::int FROM public.registro_sesiones) AS sesiones,
          (SELECT count(*)::int FROM public.registro_series) AS series,
          (SELECT count(*)::int FROM public.ejercicios WHERE usa_barra IS TRUE) AS usa_barra_true,
          (SELECT count(*)::int FROM public.ejercicios WHERE usa_barra IS FALSE) AS usa_barra_false
      `);
      return r.rows[0]!;
    };

    const antes = await contar();
    expect(antes.ejercicios).toBe(0);
    expect(antes.plantillas).toBe(0);
    expect(antes.feriados).toBe(0);

    await db.exec(seedSql);

    const primeraPasada = await contar();
    expect(primeraPasada).toEqual({
      ejercicios: 89,
      ejercicios_con_video: 86,
      ejercicios_sin_video: 3,
      ejercicios_con_creador: 0,
      plantillas: 3,
      planes_con_persona: 0,
      dias: 7,
      ejercicios_rutina: 37,
      tempo_cero: 0,
      feriados: 35,
      feriados_2026: 19,
      feriados_2027: 16,
      usuarios: antes.usuarios,
      perfiles: antes.perfiles,
      contrataciones: 0,
      sesiones: 0,
      series: 0,
      usa_barra_true: 11,
      usa_barra_false: 78,
    });

    const nombresPlantillas = await db.query<{ nombre: string }>(
      "SELECT nombre FROM public.planes_entrenamiento ORDER BY nombre"
    );
    expect(nombresPlantillas.rows.map((r) => r.nombre)).toEqual([
      "Adaptación-3 días",
      "GABI POPURRÍ",
      "Mantenimiento",
    ]);

    // Segunda ejecución completa + script independiente de feriados 2027: cero duplicados.
    await db.exec(seedSql);
    await db.exec(fs.readFileSync(FERIADOS_2027_PATH, "utf-8"));

    const segundaPasada = await contar();
    expect(segundaPasada).toEqual(primeraPasada);
  });

  it("usa_barra: 11 true / 78 false y paridad 1-a-1 con seed_gozs.sql (idempotente)", async () => {
    // seed_produccion ya corrió dos veces en el test anterior: el conteo exacto se preserva.
    const r = await db.query<{ id: string; nombre: string }>(
      "SELECT id, nombre FROM public.ejercicios WHERE usa_barra IS TRUE ORDER BY id"
    );
    expect(r.rows).toHaveLength(11);

    const gozs = fs.readFileSync(SEED_GOZS_PATH, "utf-8");
    const esperados: { id: string; nombre: string }[] = [];
    const rx = /VALUES \('([0-9a-f-]{36})', '((?:[^']|'')*)',[\s\S]*?,\s*(true|false)\)\s*\nON CONFLICT/g;
    for (const m of gozs.matchAll(rx)) {
      if (m[3] === "true") esperados.push({ id: m[1]!, nombre: m[2]!.replace(/''/g, "'") });
    }
    esperados.sort((a, b) => a.id.localeCompare(b.id));
    expect(r.rows).toEqual(esperados);
  });

  it("humo post-corte: tablas operativas en 0, ranking vacío, anon 42501 y triggers de volumen Ola C sobre el catálogo real", async () => {
    const SES = "00000000-0000-0000-0000-0000000000c1";
    const ROLLBACK = new Error("rollback-humo");

    const op = await db.query<{ n: number }>(`
      SELECT (SELECT count(*) FROM public.push_cola)::int
           + (SELECT count(*) FROM public.registro_sesiones)::int
           + (SELECT count(*) FROM public.registro_series)::int
           + (SELECT count(*) FROM public.v_prs)::int AS n`);
    expect(op.rows[0]!.n).toBe(0);

    let resultado: { filas: number; total: string; efectivo: string } | undefined;
    await db
      .transaction(async (tx: Transaction) => {
        await tx.query(`INSERT INTO auth.users (id, email) VALUES ('${ALUMNO}', 'alumno-humo@gozster.local') ON CONFLICT (id) DO NOTHING`);
        await tx.query(
          `INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
           VALUES ('${ALUMNO}', 'alumno-humo@gozster.local', 'Alumno Humo', 'ALUMNO', 'ACTIVA')
           ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, estado_membresia = EXCLUDED.estado_membresia`
        );
        await tx.query(
          `INSERT INTO public.alumno_actividades (alumno_id, actividad, veces_por_semana) VALUES ('${ALUMNO}', 'FUNCIONAL', 3) ON CONFLICT DO NOTHING`
        );
        // Ranking como alumno Funcional en base recién cortada (sin sesiones): 0 filas.
        await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ALUMNO, role: "authenticated" })]);
        await tx.query(`SET LOCAL ROLE authenticated`);
        const rk = await tx.query("SELECT * FROM public.obtener_ranking_funcional_alumno(NULL)");
        const filasRanking = rk.rows.length;
        await tx.query(`RESET ROLE`);
        const ej = await tx.query<{ id: string }>("SELECT id FROM public.ejercicios ORDER BY nombre LIMIT 1");
        const ejId = ej.rows[0]!.id;

        await tx.query(`INSERT INTO public.registro_sesiones (id, alumno_id, estado) VALUES ('${SES}', '${ALUMNO}', 'EN_CURSO')`);
        await tx.query(
          `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, set_type)
           VALUES ('${SES}', '${ejId}', 1, 20, 10, true, 'WARMUP'), ('${SES}', '${ejId}', 2, 50, 10, true, 'NORMAL')`
        );
        await tx.query(`UPDATE public.registro_sesiones SET estado = 'COMPLETADA' WHERE id = '${SES}'`);
        const vol = await tx.query<{ total: string; efectivo: string }>(
          `SELECT volumen_total_kg::text AS total, effective_volume_kg::text AS efectivo FROM public.registro_sesiones WHERE id = '${SES}'`
        );
        resultado = { filas: filasRanking, total: vol.rows[0]!.total, efectivo: vol.rows[0]!.efectivo };
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });

    expect(resultado).toBeDefined();
    expect(resultado!.total).toBe("700.00");
    expect(resultado!.efectivo).toBe("500.00");
    expect(resultado!.filas).toBe(0);

    // Aislamiento: el rollback no deja residuos en las tablas operativas.
    const post = await db.query<{ n: number }>(
      "SELECT ((SELECT count(*) FROM public.registro_sesiones) + (SELECT count(*) FROM public.registro_series))::int AS n"
    );
    expect(post.rows[0]!.n).toBe(0);

    // G2: anon no ejecuta el ranking.
    await expect(
      db.transaction(async (tx: Transaction) => {
        await tx.query(`SET LOCAL ROLE anon`);
        await tx.query("SELECT * FROM public.obtener_ranking_funcional_alumno(NULL)");
      })
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("feriados_en_rango('2027-01-01','2027-12-31') devuelve los 16 feriados de 2027", async () => {
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${ALUMNO}', 'alumno-test@gozster.local');
      INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia)
      VALUES ('${ALUMNO}', 'alumno-test@gozster.local', 'Alumno Test', 'ALUMNO', 'ACTIVA')
      ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, estado_membresia = EXCLUDED.estado_membresia;
    `);

    const r2027 = await comoAutenticado<{ fecha: string; nombre: string; tipo: string; hay_clases: boolean; fuente: string }>(
      ALUMNO,
      "SELECT fecha::text, nombre, tipo, hay_clases, fuente FROM public.feriados_en_rango('2027-01-01', '2027-12-31')"
    );

    expect(r2027.rows.map((x) => x.fecha)).toEqual(FERIADOS_2027_ESPERADOS);
    expect(r2027.rows.every((x) => x.hay_clases === false)).toBe(true);
    expect(r2027.rows.every((x) => x.fuente.includes("feriados-nacionales-2027"))).toBe(true);

    const r2026 = await comoAutenticado<{ fecha: string }>(
      ALUMNO,
      "SELECT fecha::text FROM public.feriados_en_rango('2026-01-01', '2026-12-31')"
    );
    expect(r2026.rows).toHaveLength(19);
  });
});
