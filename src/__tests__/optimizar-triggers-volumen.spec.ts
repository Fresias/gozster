import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";
import { procesarCola, type PushPendiente, type PushPayload, type SuscripcionPush } from "../../supabase/functions/enviar-push/handler";

// GOZS-882 (Ola C): Triggers de volumen O(1), poda de índice redundante,
// base Live Tracker (estado / finalizada_at + v_prs + ultimo_entreno_at) y
// push activo al entrenador al finalizar entrenamiento (PGlite real).

const MIGRATION_FILE = "20261126180000_ola_c_triggers_volumen_livetracker_push.sql";

const COACH = "00000000-0000-0000-0000-0000000882c1";
const ALUMNO = "00000000-0000-0000-0000-0000000882a1";
const ALUMNO_SIN_COACH = "00000000-0000-0000-0000-0000000882a2";
const EJ1 = "10000000-0000-0000-0000-0000000882e1";
const EJ2 = "10000000-0000-0000-0000-0000000882e2";
const CLASE_FUNC = "10000000-0000-0000-0000-0000000882f1";

let db: PGlite;

async function como<T>(
  rol: "anon" | "authenticated" | "service_role",
  sql: string,
  params: unknown[] = [],
  sub?: string,
): Promise<T[]> {
  let rows: T[] = [];
  await db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    rows = (await tx.query<T>(sql, params)).rows;
  });
  return rows;
}

const volumenDe = async (sesionId: string) =>
  (
    await db.query<{ total: string; efectivo: string; updated_at: string }>(
      `SELECT volumen_total_kg::text AS total, effective_volume_kg::text AS efectivo, updated_at::text
       FROM public.registro_sesiones WHERE id = $1`,
      [sesionId],
    )
  ).rows[0]!;

beforeAll(async () => {
  db = await crearDbMigrada();
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${COACH}', 'coach882@t'),
      ('${ALUMNO}', 'alumno882@t'),
      ('${ALUMNO_SIN_COACH}', 'sincoach882@t');

    INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia) VALUES
      ('${COACH}', 'coach882@t', 'Coach 882', 'ENTRENADOR', 'ACTIVA')
      ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, estado_membresia = EXCLUDED.estado_membresia;

    INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
      ('${ALUMNO}', 'alumno882@t', 'Alumno 882', 'ALUMNO', '${COACH}', 'ACTIVA'),
      ('${ALUMNO_SIN_COACH}', 'sincoach882@t', 'Libre 882', 'ALUMNO', NULL, 'ACTIVA')
      ON CONFLICT (id) DO UPDATE SET rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;

    INSERT INTO public.alumno_actividades (alumno_id, actividad, veces_por_semana)
      VALUES ('${ALUMNO}', 'FUNCIONAL', 3);

    INSERT INTO public.ejercicios (id, nombre, musculos_principales, creado_por) VALUES
      ('${EJ1}', 'Press Banca 882', '{PECHO}', '${COACH}'),
      ('${EJ2}', 'Sentadilla 882', '{CUADRICEPS}', '${COACH}');

    INSERT INTO public.clases (id, actividad, inicio, duracion_minutos, capacidad, estado)
      VALUES ('${CLASE_FUNC}', 'FUNCIONAL', '2026-11-26 15:00:00+00', 60, 12, 'PROGRAMADA');
  `);
}, 120_000);

describe("GOZS-882: catálogo, seguridad e idempotencia de migración", () => {
  it("elimina índice redundante y función row-level previa, y crea índices/triggers O(1)", async () => {
    const idxViejo = await db.query<{ oid: string | null }>(
      `SELECT to_regclass('public.idx_registro_series_sesion_ejercicio')::text AS oid`,
    );
    expect(idxViejo.rows[0]!.oid).toBeNull();

    const idxNuevos = await db.query<{ nombre: string; oid: string | null }>(`
      SELECT nombre, to_regclass('public.' || nombre)::text AS oid
      FROM unnest(ARRAY['idx_registro_sesiones_en_curso', 'idx_push_cola_sesion_unica']) AS nombre
    `);
    for (const fila of idxNuevos.rows) {
      expect(fila.oid, fila.nombre).not.toBeNull();
    }

    const fnVieja = await db.query<{ oid: string | null }>(
      `SELECT to_regprocedure('public.recalcular_volumen_sesion_por_serie()')::text AS oid`,
    );
    expect(fnVieja.rows[0]!.oid).toBeNull();

    const triggers = await db.query<{ tgname: string; def: string }>(`
      SELECT t.tgname, pg_get_triggerdef(t.oid) AS def
      FROM pg_trigger t
      WHERE NOT t.tgisinternal
        AND t.tgname IN (
          'trg_registro_sesiones_volumen',
          'trg_registro_series_volumen_ins',
          'trg_registro_series_volumen_upd',
          'trg_registro_series_volumen_del',
          'trg_crear_alerta_dolor',
          'trg_actualizar_ultimo_entreno',
          'trg_notificar_sesion_completada'
        )
      ORDER BY t.tgname
    `);
    const porNombre = Object.fromEntries(triggers.rows.map((r) => [r.tgname, r.def]));
    expect(Object.keys(porNombre)).toHaveLength(7);
    expect(porNombre.trg_registro_sesiones_volumen).toContain("BEFORE INSERT OR UPDATE OF volumen_total_kg, effective_volume_kg");
    expect(porNombre.trg_registro_series_volumen_ins).toContain("FOR EACH STATEMENT");
    expect(porNombre.trg_registro_series_volumen_ins).toContain("REFERENCING NEW TABLE AS new_rows");
    expect(porNombre.trg_registro_series_volumen_upd).toContain("FOR EACH STATEMENT");
    expect(porNombre.trg_registro_series_volumen_upd).toContain("REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows");
    expect(porNombre.trg_registro_series_volumen_del).toContain("FOR EACH STATEMENT");
    expect(porNombre.trg_registro_series_volumen_del).toContain("REFERENCING OLD TABLE AS old_rows");
    expect(porNombre.trg_crear_alerta_dolor).toContain("WHEN ((new.pain_reported IS TRUE))");
    expect(porNombre.trg_actualizar_ultimo_entreno).toContain("WHEN ((new.estado = 'COMPLETADA'::text))");
    expect(porNombre.trg_notificar_sesion_completada).toContain("WHEN ((new.estado = 'COMPLETADA'::text))");
  });

  it("fija SECURITY DEFINER, search_path = public, pg_temp y revoca EXECUTE en todas las funciones trigger", async () => {
    const fns = [
      "calcular_volumen_sesion",
      "recalcular_volumen_sesion_stmt_ins",
      "recalcular_volumen_sesion_stmt_upd",
      "recalcular_volumen_sesion_stmt_del",
      "fn_actualizar_ultimo_entreno",
      "fn_notificar_sesion_completada",
    ];
    const r = await db.query<{
      proname: string;
      secdef: boolean;
      proconfig: string[] | null;
      pub_exec: boolean;
      anon_exec: boolean;
      auth_exec: boolean;
    }>(
      `SELECT p.proname,
              p.prosecdef AS secdef,
              p.proconfig,
              has_function_privilege('public', p.oid, 'EXECUTE') AS pub_exec,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
      [fns],
    );
    expect(r.rows).toHaveLength(fns.length);
    for (const fn of r.rows) {
      expect(fn.secdef, fn.proname).toBe(true);
      expect(fn.proconfig, fn.proname).toContain("search_path=public, pg_temp");
      expect(fn.pub_exec, fn.proname).toBe(false);
      expect(fn.anon_exec, fn.proname).toBe(false);
      expect(fn.auth_exec, fn.proname).toBe(false);
    }

    const reclamar = await db.query<{
      proconfig: string[] | null;
      pub_exec: boolean;
      anon_exec: boolean;
      auth_exec: boolean;
      srv_exec: boolean;
    }>(`
      SELECT p.proconfig,
             has_function_privilege('public', p.oid, 'EXECUTE') AS pub_exec,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
             has_function_privilege('service_role', p.oid, 'EXECUTE') AS srv_exec
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'reclamar_push_pendientes'
    `);
    expect(reclamar.rows).toHaveLength(1);
    expect(reclamar.rows[0]!.proconfig).toContain("search_path=public, pg_temp");
    expect(reclamar.rows[0]!.pub_exec).toBe(false);
    expect(reclamar.rows[0]!.anon_exec).toBe(false);
    expect(reclamar.rows[0]!.auth_exec).toBe(false);
    expect(reclamar.rows[0]!.srv_exec).toBe(true);
  });

  it("la migración es estrictamente idempotente al re-aplicarse", async () => {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), "utf-8");
    await expect(aplicarMigracion(db, sql)).resolves.toBeUndefined();
  });
});

describe("GOZS-882: volumen O(1), re-upserts idempotentes, batch mixto, DELETE, cambio sesion_id y WHEN pain_reported", () => {
  const SES_26 = "20000000-0000-0000-0000-000000088201";
  const SES_MIX_A = "20000000-0000-0000-0000-000000088202";
  const SES_MIX_B = "20000000-0000-0000-0000-000000088203";
  const SES_NOCOMP = "20000000-0000-0000-0000-000000088204";

  beforeAll(async () => {
    // Espía de recálculos reales sobre registro_sesiones (solo para medir conteos en tests)
    await db.exec(`
      CREATE TABLE IF NOT EXISTS pg_temp.spy_counters (
        nombre TEXT PRIMARY KEY,
        cuenta INT NOT NULL DEFAULT 0
      );
      INSERT INTO pg_temp.spy_counters (nombre, cuenta) VALUES ('sesion_upd_volumen', 0)
        ON CONFLICT (nombre) DO NOTHING;

      CREATE OR REPLACE FUNCTION pg_temp.fn_spy_sesion_upd_volumen()
      RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
      BEGIN
        UPDATE pg_temp.spy_counters SET cuenta = cuenta + 1 WHERE nombre = 'sesion_upd_volumen';
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS trg_spy_sesion_upd_volumen ON public.registro_sesiones;
      CREATE TRIGGER trg_spy_sesion_upd_volumen
        BEFORE UPDATE OF volumen_total_kg, effective_volume_kg ON public.registro_sesiones
        FOR EACH ROW EXECUTE FUNCTION pg_temp.fn_spy_sesion_upd_volumen();
    `);
  });

  async function resetSpy(): Promise<void> {
    await db.exec(`UPDATE pg_temp.spy_counters SET cuenta = 0 WHERE nombre = 'sesion_upd_volumen'`);
  }

  async function spyCount(): Promise<number> {
    const r = await db.query<{ cuenta: number }>(
      `SELECT cuenta FROM pg_temp.spy_counters WHERE nombre = 'sesion_upd_volumen'`,
    );
    return r.rows[0]!.cuenta;
  }

  it("batch de 26 series completadas sin dolor: 1 recálculo O(1), 0 alertas dolor e ignora volumen basura 9999", async () => {
    await db.exec(`SET track_functions = 'all'`);
    const callsDolorAntes = (
      await db.query<{ n: number }>(
        `SELECT COALESCE(pg_stat_get_function_calls('public.fn_crear_alerta_dolor()'::regprocedure), 0)::int AS n`,
      )
    ).rows[0]!.n;

    await resetSpy();

    // Sesión nueva con volumen basura 9999 -> fast-path INSERT lo deja en 0 y 0 updates
    await como(
      "authenticated",
      `INSERT INTO public.registro_sesiones (id, alumno_id, volumen_total_kg, effective_volume_kg)
       VALUES ($1, $2, 9999, 9999)`,
      [SES_26, ALUMNO],
      ALUMNO,
    );
    expect(await volumenDe(SES_26)).toMatchObject({ total: "0.00", efectivo: "0.00" });
    expect(await spyCount()).toBe(0);

    // Insertar batch de 26 series (2 WARMUP de 20x10=200 + 24 NORMAL de 100x5=500 -> total 12400, efectivo 12000)
    const values: string[] = [];
    for (let i = 1; i <= 26; i++) {
      const esWarmup = i <= 2;
      const peso = esWarmup ? 20 : 100;
      const reps = esWarmup ? 10 : 5;
      const tipo = esWarmup ? "WARMUP" : "NORMAL";
      values.push(`('${SES_26}', '${EJ1}', ${i}, ${peso}, ${reps}, true, '${tipo}', false)`);
    }
    await como(
      "authenticated",
      `INSERT INTO public.registro_series
         (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, set_type, pain_reported)
       VALUES ${values.join(", ")}`,
      [],
      ALUMNO,
    );

    expect(await spyCount()).toBe(1);
    expect(await volumenDe(SES_26)).toMatchObject({ total: "12400.00", efectivo: "12000.00" });

    const callsDolorDespues = (
      await db.query<{ n: number }>(
        `SELECT COALESCE(pg_stat_get_function_calls('public.fn_crear_alerta_dolor()'::regprocedure), 0)::int AS n`,
      )
    ).rows[0]!.n;
    expect(callsDolorDespues - callsDolorAntes).toBe(0);
  });

  it("re-upsert idempotente de las 26 series sin diff y upsert de registro_sesiones sin columnas de volumen -> 0 recálculos", async () => {
    const antes = await volumenDe(SES_26);
    // Congelar updated_at a un timestamp pasado para detectar si algo lo toca
    await db.exec(`
      SET session_replication_role = replica;
      UPDATE public.registro_sesiones SET updated_at = '2026-11-26 10:00:00+00' WHERE id = '${SES_26}';
      SET session_replication_role = origin;
    `);
    const tsCongelado = (await volumenDe(SES_26)).updated_at;

    await resetSpy();

    // Re-upsert idempotente de las 26 series idénticas
    const values: string[] = [];
    for (let i = 1; i <= 26; i++) {
      const esWarmup = i <= 2;
      const peso = esWarmup ? 20 : 100;
      const reps = esWarmup ? 10 : 5;
      const tipo = esWarmup ? "WARMUP" : "NORMAL";
      values.push(`('${SES_26}', '${EJ1}', ${i}, ${peso}, ${reps}, true, '${tipo}', false)`);
    }
    await como(
      "authenticated",
      `INSERT INTO public.registro_series
         (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, set_type, pain_reported)
       VALUES ${values.join(", ")}
       ON CONFLICT (sesion_id, ejercicio_id, numero_serie)
       DO UPDATE SET peso_kg = EXCLUDED.peso_kg,
                     reps_hechas = EXCLUDED.reps_hechas,
                     completada = EXCLUDED.completada,
                     set_type = EXCLUDED.set_type`,
      [],
      ALUMNO,
    );

    expect(await spyCount()).toBe(0);
    const despuesSeries = await volumenDe(SES_26);
    expect(despuesSeries.updated_at).toBe(tsCongelado);
    expect(despuesSeries.total).toBe(antes.total);

    // Upsert de columna no-volumen en registro_series (notas) tampoco recalcula
    await como(
      "authenticated",
      `UPDATE public.registro_series SET notas = 'buena técnica' WHERE sesion_id = $1 AND numero_serie = 3`,
      [SES_26],
      ALUMNO,
    );
    expect(await spyCount()).toBe(0);
    expect((await volumenDe(SES_26)).updated_at).toBe(tsCongelado);

    // Upsert de registro_sesiones sin columnas de volumen -> 0 recálculos y preserva volumen
    await como(
      "authenticated",
      `INSERT INTO public.registro_sesiones (id, alumno_id, duracion_minutos)
       VALUES ($1, $2, 55)
       ON CONFLICT (id) DO UPDATE SET duracion_minutos = EXCLUDED.duracion_minutos`,
      [SES_26, ALUMNO],
      ALUMNO,
    );
    expect(await spyCount()).toBe(0);
    expect(await volumenDe(SES_26)).toMatchObject({ total: "12400.00", efectivo: "12000.00" });

    // Intento de pisar volumen_total_kg = 0 sí dispara el recálculo y conserva el real (invariante GOZS-701)
    await como(
      "authenticated",
      `INSERT INTO public.registro_sesiones (id, alumno_id, volumen_total_kg, effective_volume_kg)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (id) DO UPDATE SET volumen_total_kg = EXCLUDED.volumen_total_kg,
                                      effective_volume_kg = EXCLUDED.effective_volume_kg`,
      [SES_26, ALUMNO],
      ALUMNO,
    );
    expect(await spyCount()).toBe(1);
    expect(await volumenDe(SES_26)).toMatchObject({ total: "12400.00", efectivo: "12000.00" });
  });

  it("batch mixto multi-sesión, DELETE masivo O(1) y cambio de sesion_id recalculando origen y destino", async () => {
    await db.exec(`
      INSERT INTO public.registro_sesiones (id, alumno_id) VALUES
        ('${SES_MIX_A}', '${ALUMNO}'),
        ('${SES_MIX_B}', '${ALUMNO}'),
        ('${SES_NOCOMP}', '${ALUMNO}');
    `);

    // Batch solo con series NO completadas -> 0 recálculos
    await resetSpy();
    await db.exec(`
      INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada)
      VALUES ('${SES_NOCOMP}', '${EJ1}', 1, 100, 10, false),
             ('${SES_NOCOMP}', '${EJ1}', 2, 120, 8, false);
    `);
    expect(await spyCount()).toBe(0);
    expect(await volumenDe(SES_NOCOMP)).toMatchObject({ total: "0.00", efectivo: "0.00" });

    // Batch mixto en 2 sesiones (2 series completadas en A, 1 completada + 1 incompleta en B) -> 2 recálculos (1 por sesión)
    await resetSpy();
    await db.exec(`
      INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada)
      VALUES ('${SES_MIX_A}', '${EJ1}', 1, 50, 10, true),
             ('${SES_MIX_A}', '${EJ1}', 2, 60, 10, true),
             ('${SES_MIX_B}', '${EJ2}', 1, 80, 5, true),
             ('${SES_MIX_B}', '${EJ2}', 2, 90, 5, false);
    `);
    expect(await spyCount()).toBe(2);
    expect(await volumenDe(SES_MIX_A)).toMatchObject({ total: "1100.00", efectivo: "1100.00" });
    expect(await volumenDe(SES_MIX_B)).toMatchObject({ total: "400.00", efectivo: "400.00" });

    // Mover serie 2 (60x10=600) de SES_MIX_A a SES_MIX_B -> recalcula ambas sesiones (2 updates en 1 statement)
    await resetSpy();
    await db.exec(`
      UPDATE public.registro_series
      SET sesion_id = '${SES_MIX_B}'
      WHERE sesion_id = '${SES_MIX_A}' AND ejercicio_id = '${EJ1}' AND numero_serie = 2;
    `);
    expect(await spyCount()).toBe(2);
    expect(await volumenDe(SES_MIX_A)).toMatchObject({ total: "500.00", efectivo: "500.00" });
    expect(await volumenDe(SES_MIX_B)).toMatchObject({ total: "1000.00", efectivo: "1000.00" });

    // DELETE de series no completadas -> 0 recálculos
    await resetSpy();
    await db.exec(`DELETE FROM public.registro_series WHERE sesion_id = '${SES_NOCOMP}'`);
    expect(await spyCount()).toBe(0);

    // DELETE masivo de todas las series completadas de SES_MIX_B -> 1 recálculo O(1)
    await resetSpy();
    await db.exec(`DELETE FROM public.registro_series WHERE sesion_id = '${SES_MIX_B}'`);
    expect(await spyCount()).toBe(1);
    expect(await volumenDe(SES_MIX_B)).toMatchObject({ total: "0.00", efectivo: "0.00" });
  });

  it("trg_crear_alerta_dolor sigue disparando cuando pain_reported = true y respeta app.skip_serie_pain_alert", async () => {
    // Con app.skip_serie_pain_alert = 'true' no genera alerta
    await db.transaction(async (tx: Transaction) => {
      await tx.query(`SELECT set_config('app.skip_serie_pain_alert', 'true', true)`);
      await tx.query(
        `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, pain_reported, pain_notes)
         VALUES ($1, $2, 10, 40, 8, true, true, 'Molestia hombro omitida')`,
        [SES_MIX_A, EJ2],
      );
    });
    const alertasOmitidas = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.alertas_entrenador WHERE alumno_id = $1 AND detalle LIKE '%omitida%'`,
      [ALUMNO],
    );
    expect(alertasOmitidas.rows[0]!.n).toBe(0);

    // Sin el flag, pain_reported = true sí crea alerta e historial de dolor
    await como(
      "authenticated",
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, pain_reported, pain_notes)
       VALUES ($1, $2, 11, 40, 8, true, true, 'Dolor rodilla derecha')`,
      [SES_MIX_A, EJ2],
      ALUMNO,
    );
    const alertas = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.alertas_entrenador WHERE alumno_id = $1 AND ejercicio_id = $2`,
      [ALUMNO, EJ2],
    );
    expect(alertas.rows[0]!.n).toBe(1);
  });
});

describe("GOZS-882: base Live Tracker (EN_CURSO -> COMPLETADA), v_prs, ultimo_entreno_at y push al entrenador", () => {
  const SES_LIVE = "20000000-0000-0000-0000-000000088210";
  const SES_DIRECTA = "20000000-0000-0000-0000-000000088211";
  const SES_SIN_COACH = "20000000-0000-0000-0000-000000088212";

  it("sesión EN_CURSO queda oculta en v_prs, no actualiza ultimo_entreno_at ni encola push; al pasar a COMPLETADA activa todo 1 sola vez", async () => {
    // Limpiar ultimo_entreno_at y push_cola previos para medir con precisión
    await db.exec(`
      UPDATE public.perfiles SET ultimo_entreno_at = NULL WHERE id = '${ALUMNO}';
      DELETE FROM public.push_cola WHERE destinatario_id = '${COACH}';
    `);

    // 1. Alumno crea sesión EN_CURSO y registra una marca muy alta (250 kg x 5)
    await como(
      "authenticated",
      `INSERT INTO public.registro_sesiones (id, alumno_id, estado) VALUES ($1, $2, 'EN_CURSO')`,
      [SES_LIVE, ALUMNO],
      ALUMNO,
    );
    await como(
      "authenticated",
      `INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, set_type)
       VALUES ($1, $2, 1, 250, 5, true, 'NORMAL')`,
      [SES_LIVE, EJ2],
      ALUMNO,
    );

    // Verificar: oculta en v_prs (tanto para alumno como para coach)
    const prAlumnoEnCurso = await como<{ peso_kg: string }>(
      "authenticated",
      `SELECT peso_kg::text FROM public.v_prs WHERE alumno_id = $1 AND ejercicio_id = $2`,
      [ALUMNO, EJ2],
      ALUMNO,
    );
    const prCoachEnCurso = await como<{ peso_kg: string }>(
      "authenticated",
      `SELECT peso_kg::text FROM public.v_prs WHERE alumno_id = $1 AND ejercicio_id = $2`,
      [ALUMNO, EJ2],
      COACH,
    );
    expect(prAlumnoEnCurso.every((r) => r.peso_kg !== "250.00")).toBe(true);
    expect(prCoachEnCurso.every((r) => r.peso_kg !== "250.00")).toBe(true);

    // Verificar: ultimo_entreno_at sigue NULL y push_cola sigue vacía
    const perfilEnCurso = await db.query<{ ultimo_entreno_at: string | null }>(
      `SELECT ultimo_entreno_at::text FROM public.perfiles WHERE id = $1`,
      [ALUMNO],
    );
    expect(perfilEnCurso.rows[0]!.ultimo_entreno_at).toBeNull();

    const colaEnCurso = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.push_cola WHERE sesion_id = $1`,
      [SES_LIVE],
    );
    expect(colaEnCurso.rows[0]!.n).toBe(0);

    // 2. Transición a COMPLETADA (con finalizada_at)
    await como(
      "authenticated",
      `UPDATE public.registro_sesiones SET estado = 'COMPLETADA', finalizada_at = now() WHERE id = $1`,
      [SES_LIVE],
      ALUMNO,
    );

    const prDespues = await como<{ peso_kg: string }>(
      "authenticated",
      `SELECT peso_kg::text FROM public.v_prs WHERE alumno_id = $1 AND ejercicio_id = $2`,
      [ALUMNO, EJ2],
      COACH,
    );
    expect(prDespues).toEqual([{ peso_kg: "250.00" }]);

    const perfilDespues = await db.query<{ ultimo_entreno_at: string | null }>(
      `SELECT ultimo_entreno_at::text FROM public.perfiles WHERE id = $1`,
      [ALUMNO],
    );
    expect(perfilDespues.rows[0]!.ultimo_entreno_at).not.toBeNull();

    const cola1 = await db.query<{ destinatario_id: string; tipo: string; sesion_id: string; mensaje_id: string | null }>(
      `SELECT destinatario_id::text, tipo, sesion_id::text, mensaje_id::text
       FROM public.push_cola WHERE sesion_id = $1`,
      [SES_LIVE],
    );
    expect(cola1.rows).toEqual([
      { destinatario_id: COACH, tipo: "SESION_COMPLETADA", sesion_id: SES_LIVE, mensaje_id: null },
    ]);

    // 3. Reintentos idempotentes (upsert repetido 2 veces en COMPLETADA) -> sigue habiendo exactamente 1 fila
    for (let i = 0; i < 2; i++) {
      await como(
        "authenticated",
        `INSERT INTO public.registro_sesiones (id, alumno_id, estado, duracion_minutos)
         VALUES ($1, $2, 'COMPLETADA', $3)
         ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado, duracion_minutos = EXCLUDED.duracion_minutos`,
        [SES_LIVE, ALUMNO, 45 + i],
        ALUMNO,
      );
    }
    const colaReintentos = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.push_cola WHERE sesion_id = $1`,
      [SES_LIVE],
    );
    expect(colaReintentos.rows[0]!.n).toBe(1);

    // 4. Reclamar con service_role y pasar por enviar-push procesarCola -> payload sin PII con url "/studio"
    const reclamados = await como<PushPendiente>(
      "service_role",
      `SELECT id::text, destinatario_id::text, tipo FROM public.reclamar_push_pendientes(100)`,
    );
    expect(reclamados).toHaveLength(1);
    expect(reclamados[0]).toMatchObject({ destinatario_id: COACH, tipo: "SESION_COMPLETADA" });

    const payloadsEnviados: PushPayload[] = [];
    const subCoach: SuscripcionPush = {
      id: "sub-coach-1",
      usuario_id: COACH,
      endpoint: "https://push.test/coach",
      p256dh: "k",
      auth: "a",
    };
    const res = await procesarCola({
      reclamarPendientes: async () => reclamados,
      suscripciones: async () => [subCoach],
      enviar: async (_s, payload) => {
        payloadsEnviados.push(payload);
        return 201;
      },
      eliminarSuscripcion: async () => {},
    });
    expect(res).toMatchObject({ procesados: 1, enviados: 1 });
    expect(payloadsEnviados).toEqual([
      {
        title: "GOZSter",
        body: "Un alumno finalizó su entrenamiento.",
        url: "/studio",
        tag: "gozs-workout-completed",
      },
    ]);
  });

  it("INSERT directo en COMPLETADA sin clase_id encola 1 push; alumno sin coach no falla ni encola", async () => {
    await como(
      "authenticated",
      `INSERT INTO public.registro_sesiones (id, alumno_id) VALUES ($1, $2)`,
      [SES_DIRECTA, ALUMNO],
      ALUMNO,
    );
    const colaDirecta = await db.query<{ tipo: string; destinatario_id: string }>(
      `SELECT tipo, destinatario_id::text FROM public.push_cola WHERE sesion_id = $1`,
      [SES_DIRECTA],
    );
    expect(colaDirecta.rows).toEqual([{ tipo: "SESION_COMPLETADA", destinatario_id: COACH }]);

    await como(
      "authenticated",
      `INSERT INTO public.registro_sesiones (id, alumno_id) VALUES ($1, $2)`,
      [SES_SIN_COACH, ALUMNO_SIN_COACH],
      ALUMNO_SIN_COACH,
    );
    const colaSinCoach = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.push_cola WHERE sesion_id = $1`,
      [SES_SIN_COACH],
    );
    expect(colaSinCoach.rows[0]!.n).toBe(0);
  });

  it("registrar_marca_funcional() (con y sin clase_id) calcula volumen en O(1) y NO genera push espurio al coach", async () => {
    await db.exec(`DELETE FROM public.push_cola WHERE destinatario_id = '${COACH}'`);

    // Con clase_id
    const resConClase = await como<{ id: string }>(
      "authenticated",
      `SELECT public.registrar_marca_funcional($1, $2, 120, 5, DATE '2026-11-24', $3) AS id`,
      [ALUMNO, EJ1, CLASE_FUNC],
      COACH,
    );
    expect(await volumenDe(resConClase[0]!.id)).toMatchObject({ total: "600.00", efectivo: "600.00" });

    // Sin clase_id (carga directa del coach)
    const resSinClase = await como<{ id: string }>(
      "authenticated",
      `SELECT public.registrar_marca_funcional($1, $2, 130, 3, DATE '2026-11-25', NULL) AS id`,
      [ALUMNO, EJ1],
      COACH,
    );
    expect(await volumenDe(resSinClase[0]!.id)).toMatchObject({ total: "390.00", efectivo: "390.00" });

    const colaFuncional = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.push_cola WHERE destinatario_id = $1`,
      [COACH],
    );
    expect(colaFuncional.rows[0]!.n).toBe(0);
  });

  it("RLS bloquea lectura/escritura directa en push_cola para alumno/coach y CHECK valida estado/referencias", async () => {
    // RLS en push_cola: sin políticas -> authenticated ve 0 filas y no puede insertar
    const filasAlumno = await como("authenticated", `SELECT id FROM public.push_cola`, [], ALUMNO);
    const filasCoach = await como("authenticated", `SELECT id FROM public.push_cola`, [], COACH);
    expect(filasAlumno).toHaveLength(0);
    expect(filasCoach).toHaveLength(0);

    await expect(
      como(
        "authenticated",
        `INSERT INTO public.push_cola (destinatario_id, tipo, sesion_id) VALUES ($1, 'SESION_COMPLETADA', $2)`,
        [COACH, SES_DIRECTA],
        ALUMNO,
      ),
    ).rejects.toThrow(/row-level security/i);

    // CHECK de estado inválido en registro_sesiones
    await expect(
      db.query(`INSERT INTO public.registro_sesiones (alumno_id, estado) VALUES ($1, 'PAUSADA')`, [ALUMNO]),
    ).rejects.toThrow(/check constraint/i);

    // CHECK de referencia válida en push_cola
    await expect(
      db.query(`INSERT INTO public.push_cola (destinatario_id, tipo) VALUES ($1, 'MENSAJE_CHAT')`, [COACH]),
    ).rejects.toThrow(/chk_push_cola_referencia_valida/);

    await expect(
      db.query(`INSERT INTO public.push_cola (destinatario_id, tipo) VALUES ($1, 'SESION_COMPLETADA')`, [COACH]),
    ).rejects.toThrow(/chk_push_cola_referencia_valida/);
  });

  it("el backfill de la migración completa finalizada_at solo en sesiones COMPLETADA sin fecha y no toca EN_CURSO", async () => {
    const sesCompSinFecha = "20000000-0000-0000-0000-000000088220";
    const sesEnCurso = "20000000-0000-0000-0000-000000088221";
    await db.exec(`
      INSERT INTO public.registro_sesiones (id, alumno_id, estado, finalizada_at) VALUES
        ('${sesCompSinFecha}', '${ALUMNO}', 'COMPLETADA', NULL),
        ('${sesEnCurso}', '${ALUMNO}', 'EN_CURSO', NULL);
    `);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), "utf-8");
    await aplicarMigracion(db, sql);

    const rows = (
      await db.query<{ id: string; finalizada_at: string | null }>(
        `SELECT id::text, finalizada_at::text FROM public.registro_sesiones WHERE id IN ($1, $2) ORDER BY id`,
        [sesCompSinFecha, sesEnCurso],
      )
    ).rows;
    expect(rows[0]!.finalizada_at).not.toBeNull();
    expect(rows[1]!.finalizada_at).toBeNull();
  });
});
