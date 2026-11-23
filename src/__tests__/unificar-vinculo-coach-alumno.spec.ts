import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { aplicarMigracion, crearDbMigrada, listarMigraciones, MIGRATIONS_DIR, STUBS } from "./helpers/pglite-migrada";

// GOZS-718 (PL-6): el vínculo coach↔alumno vive solo en perfiles.profesor_asignado_id.

const MIGRACION = "20261123120000_unificar_vinculo_coach_alumno.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRACION), "utf-8");

const ADMIN = "00000000-0000-0000-0000-0000000718ad";
const COACH_1 = "00000000-0000-0000-0000-0000000718c1";
const COACH_2 = "00000000-0000-0000-0000-0000000718c2";
const COACH_3 = "00000000-0000-0000-0000-0000000718c3";
const A_PRINCIPAL = "00000000-0000-0000-0000-0000000718a1";
const A_PLAN = "00000000-0000-0000-0000-0000000718a2";
const A_YA_ASIGNADO = "00000000-0000-0000-0000-0000000718a3";
const A_HUERFANO = "00000000-0000-0000-0000-0000000718a4";

function seedPerfiles(asignados: Record<string, string | null>) {
  const filas: Array<[string, string, string, string | null]> = [
    [ADMIN, "Admin 718", "ADMIN", null],
    [COACH_1, "Coach Uno", "ENTRENADOR", null],
    [COACH_2, "Coach Dos", "ENTRENADOR", null],
    [COACH_3, "Coach Tres", "ENTRENADOR", null],
    [A_PRINCIPAL, "Alumno Principal", "ALUMNO", asignados[A_PRINCIPAL] ?? null],
    [A_PLAN, "Alumno Plan", "ALUMNO", asignados[A_PLAN] ?? null],
    [A_YA_ASIGNADO, "Alumno Asignado", "ALUMNO", asignados[A_YA_ASIGNADO] ?? null],
    [A_HUERFANO, "Alumno Sin Vinculo", "ALUMNO", asignados[A_HUERFANO] ?? null],
  ];
  const sqlId = (v: string | null) => (v ? `'${v}'` : "NULL");
  return `
    INSERT INTO auth.users (id, email) VALUES
      ${filas.map(([id]) => `('${id}', '${id.slice(-4)}@t718')`).join(",\n      ")};
    INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
      ${filas.map(([id, n, rol, prof]) => `('${id}', '${id.slice(-4)}@t718', '${n}', '${rol}', ${sqlId(prof)}, 'ACTIVA')`).join(",\n      ")}
    ON CONFLICT (id) DO UPDATE SET nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol,
      profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;
  `;
}

async function asignado(db: PGlite, alumnoId: string): Promise<string | null> {
  const r = await db.query<{ p: string | null }>(
    `SELECT profesor_asignado_id::text AS p FROM public.perfiles WHERE id = $1`,
    [alumnoId]
  );
  return r.rows[0]!.p;
}

describe("GOZS-718: backfill del vínculo único (esquema previo a la migración)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await PGlite.create({ extensions: { pgcrypto } });
    await db.exec(STUBS);
    for (const archivo of listarMigraciones().filter((f) => f < MIGRACION)) {
      await aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
    }
    await db.exec(seedPerfiles({ [A_YA_ASIGNADO]: COACH_3 }));
    await db.exec(`
      INSERT INTO public.entrenador_alumnos (entrenador_id, alumno_id, es_principal, created_at) VALUES
        ('${COACH_2}', '${A_PRINCIPAL}', false, now() - interval '10 days'),
        ('${COACH_1}', '${A_PRINCIPAL}', true,  now() - interval '1 day'),
        ('${COACH_1}', '${A_YA_ASIGNADO}', true, now());
      INSERT INTO public.planes_entrenamiento (profesor_id, alumno_id, nombre, estado, created_at) VALUES
        ('${COACH_1}', '${A_PLAN}', 'Plan viejo', 'INACTIVO', now() - interval '20 days'),
        ('${COACH_2}', '${A_PLAN}', 'Plan nuevo', 'ACTIVO', now() - interval '2 days');
    `);
    await aplicarMigracion(db, SQL);
  }, 180_000);

  it("prioriza el vínculo principal de la tabla N:M sobre uno no principal más antiguo", async () => {
    expect(await asignado(db, A_PRINCIPAL)).toBe(COACH_1);
  });

  it("sin vínculo N:M toma al profesor del plan más reciente", async () => {
    expect(await asignado(db, A_PLAN)).toBe(COACH_2);
  });

  it("no sobrescribe un profesor_asignado_id ya cargado", async () => {
    expect(await asignado(db, A_YA_ASIGNADO)).toBe(COACH_3);
  });

  it("un alumno sin ningún vínculo queda sin asignar", async () => {
    expect(await asignado(db, A_HUERFANO)).toBeNull();
  });

  it("es idempotente: re-aplicarla no falla ni cambia asignaciones", async () => {
    await expect(aplicarMigracion(db, SQL)).resolves.toBeUndefined();
    expect(await asignado(db, A_PRINCIPAL)).toBe(COACH_1);
    expect(await asignado(db, A_PLAN)).toBe(COACH_2);
    expect(await asignado(db, A_YA_ASIGNADO)).toBe(COACH_3);
  });

  it("elimina la tabla N:M", async () => {
    const r = await db.query<{ t: string | null }>(`SELECT to_regclass('public.entrenador_alumnos')::text AS t`);
    expect(r.rows[0]!.t).toBeNull();
  });
});

describe("GOZS-718: comportamiento sobre el esquema migrado completo", () => {
  let db: PGlite;
  let conversacionId: string;

  function como<T>(rol: string, sub: string, sql: string, params: unknown[] = []) {
    return db.transaction(async (tx: Transaction) => {
      await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: rol })]);
      await tx.query(`SET LOCAL ROLE ${rol}`);
      return tx.query<T>(sql, params);
    });
  }

  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(seedPerfiles({ [A_PRINCIPAL]: COACH_1, [A_PLAN]: COACH_1 }));
    // COACH_2 solo armó un plan de A_PLAN: no es su profesor asignado.
    await db.exec(`
      INSERT INTO public.planes_entrenamiento (profesor_id, alumno_id, nombre)
      VALUES ('${COACH_2}', '${A_PLAN}', 'Plan de otro coach');
    `);
    const conv = await db.query<{ id: string }>(
      `INSERT INTO public.conversaciones (alumno_id, responsable_id) VALUES ($1, $2) RETURNING id`,
      [A_PRINCIPAL, COACH_1]
    );
    conversacionId = conv.rows[0]!.id;
  }, 180_000);

  it("ninguna función, vista ni política referencia la tabla eliminada", async () => {
    const f = await db.query(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosrc ILIKE '%entrenador_alumnos%'`
    );
    const v = await db.query(
      `SELECT viewname FROM pg_views WHERE schemaname = 'public' AND definition ILIKE '%entrenador_alumnos%'`
    );
    const pol = await db.query(
      `SELECT policyname FROM pg_policies
       WHERE qual ILIKE '%entrenador_alumnos%' OR with_check ILIKE '%entrenador_alumnos%'`
    );
    expect(f.rows).toEqual([]);
    expect(v.rows).toEqual([]);
    expect(pol.rows).toEqual([]);
  });

  it("una serie con dolor de un alumno sin plan ni profesor asignado crea la alerta sin error", async () => {
    const ej = await db.query<{ id: string }>(
      `INSERT INTO public.ejercicios (nombre, musculos_principales) VALUES ('Sentadilla 718', '{CUADRICEPS}') RETURNING id`
    );
    const ses = await db.query<{ id: string }>(
      `INSERT INTO public.registro_sesiones (alumno_id) VALUES ($1) RETURNING id`,
      [A_HUERFANO]
    );
    await db.query(
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, pain_reported, pain_notes)
       VALUES ($1, $2, 1, true, 'Molestia en rodilla')`,
      [ses.rows[0]!.id, ej.rows[0]!.id]
    );
    const alertas = await db.query<{ profesor_id: string }>(
      `SELECT profesor_id::text AS profesor_id FROM public.alertas_entrenador WHERE alumno_id = $1`,
      [A_HUERFANO]
    );
    expect(alertas.rows).toHaveLength(1);
    const historial = await db.query(`SELECT id FROM public.alumno_historial_dolor WHERE alumno_id = $1`, [A_HUERFANO]);
    expect(historial.rows).toHaveLength(1);
  });

  it("un coach que solo armó un plan no es entrenador del alumno ni ve su perfil", async () => {
    const r = await como<{ ok: boolean }>("authenticated", COACH_2, `SELECT public.es_entrenador_de($1) AS ok`, [A_PLAN]);
    expect(r.rows[0]!.ok).toBe(false);
    const perfil = await como("authenticated", COACH_2, `SELECT id FROM public.perfiles WHERE id = $1`, [A_PLAN]);
    expect(perfil.rows).toHaveLength(0);

    const asignadoVe = await como<{ ok: boolean }>("authenticated", COACH_1, `SELECT public.es_entrenador_de($1) AS ok`, [A_PLAN]);
    expect(asignadoVe.rows[0]!.ok).toBe(true);
  });

  it("un alumno no puede dirigir una alerta a un coach que solo armó su plan", async () => {
    await expect(
      como(
        "authenticated",
        A_PLAN,
        `INSERT INTO public.alertas_entrenador (alumno_id, profesor_id, tipo_alerta, severidad, titulo)
         VALUES ($1, $2, 'DOLOR_ARTICULAR', 'BAJA', 'Molestia')`,
        [A_PLAN, COACH_2]
      )
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("obtener_metricas_retencion cuenta solo a los alumnos asignados al coach", async () => {
    const r = await como<{ cantActivas: string }>(
      "authenticated",
      COACH_1,
      `SELECT "cantActivas"::text AS "cantActivas" FROM public.obtener_metricas_retencion($1)`,
      [COACH_1]
    );
    expect(Number(r.rows[0]!.cantActivas)).toBe(2);
    const otro = await como<{ cantActivas: string }>(
      "authenticated",
      COACH_2,
      `SELECT "cantActivas"::text AS "cantActivas" FROM public.obtener_metricas_retencion($1)`,
      [COACH_2]
    );
    expect(Number(otro.rows[0]!.cantActivas)).toBe(0);
  });

  it("un mensaje del alumno encola push para el responsable y el profesor asignado", async () => {
    await db.query(`UPDATE public.conversaciones SET responsable_id = $1 WHERE id = $2`, [COACH_3, conversacionId]);
    const m = await db.query<{ id: string }>(
      `INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido) VALUES ($1, $2, 'Hola') RETURNING id`,
      [conversacionId, A_PRINCIPAL]
    );
    const cola = await db.query<{ d: string }>(
      `SELECT destinatario_id::text AS d FROM public.push_cola WHERE mensaje_id = $1 ORDER BY 1`,
      [m.rows[0]!.id]
    );
    expect(cola.rows.map((r) => r.d)).toEqual([COACH_1, COACH_3].sort());
    await db.query(`UPDATE public.conversaciones SET responsable_id = $1 WHERE id = $2`, [COACH_1, conversacionId]);
  });

  it("transferir a un ADMIN cambia el responsable pero conserva el profesor asignado", async () => {
    const r = await como<{ responsable_id: string }>(
      "authenticated",
      COACH_1,
      `SELECT responsable_id FROM public.transferir_conversacion_gozs($1, $2, 'Escala a admin')`,
      [conversacionId, ADMIN]
    );
    expect(r.rows[0]!.responsable_id).toBe(ADMIN);
    expect(await asignado(db, A_PRINCIPAL)).toBe(COACH_1);
  });

  it("transferir a un ENTRENADOR lo deja como profesor asignado y el anterior pierde acceso", async () => {
    await como("authenticated", ADMIN, `SELECT public.transferir_conversacion_gozs($1, $2, 'Traspaso')`, [
      conversacionId,
      COACH_2,
    ]);
    expect(await asignado(db, A_PRINCIPAL)).toBe(COACH_2);
    const anterior = await como<{ ok: boolean }>("authenticated", COACH_1, `SELECT public.es_entrenador_de($1) AS ok`, [
      A_PRINCIPAL,
    ]);
    expect(anterior.rows[0]!.ok).toBe(false);
  });
});
