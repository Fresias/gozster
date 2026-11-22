import { describe, it, expect, beforeAll } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

const NUEVAS_MIGRACIONES = [
  "20261121223000_logros_racha.sql",
  "20261121223500_registrar_logro_racha_fix_conflict.sql",
];

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH_1 = "00000000-0000-0000-0000-00000000c0a1";
const COACH_2 = "00000000-0000-0000-0000-00000000c0a2";
const ALUMNO_A = "00000000-0000-0000-0000-00000000000a";
const ALUMNO_B = "00000000-0000-0000-0000-00000000000b";
const ALUMNO_C = "00000000-0000-0000-0000-00000000000c";

type Rol = "anon" | "authenticated" | "service_role";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}', 'admin@test.local'),
    ('${COACH_1}', 'coach1@test.local'),
    ('${COACH_2}', 'coach2@test.local'),
    ('${ALUMNO_A}', 'alumno-a@test.local'),
    ('${ALUMNO_B}', 'alumno-b@test.local'),
    ('${ALUMNO_C}', 'alumno-c@test.local');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${ADMIN}', 'admin@test.local', 'Admin General', 'ADMIN', NULL, 'ACTIVA'),
    ('${COACH_1}', 'coach1@test.local', 'Coach Uno', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${COACH_2}', 'coach2@test.local', 'Coach Dos', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${ALUMNO_A}', 'alumno-a@test.local', 'Alumno A', 'ALUMNO', '${COACH_1}', 'ACTIVA'),
    ('${ALUMNO_B}', 'alumno-b@test.local', 'Alumno B', 'ALUMNO', '${COACH_2}', 'ACTIVA'),
    ('${ALUMNO_C}', 'alumno-c@test.local', 'Alumno C', 'ALUMNO', NULL, 'ACTIVA');

  -- Alumno C pertenece a Coach 1 por tabla puente multi-coach
  INSERT INTO public.entrenador_alumnos (entrenador_id, alumno_id, es_principal)
  VALUES ('${COACH_1}', '${ALUMNO_C}', true);
`;

let db: PGlite;

function como<T>(rol: Rol, sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe("GOZS-679 (#587): persistencia del logro Diamante permanente (logros_racha)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED);
  });

  it("la migración es un archivo nuevo con timestamp posterior a 20261121200000 y es idempotente", async () => {
    for (const archivo of NUEVAS_MIGRACIONES) {
      expect(archivo > "20261121200000_realtime_feedback_clase.sql").toBe(true);
      const ruta = path.join(MIGRATIONS_DIR, archivo);
      expect(fs.existsSync(ruta)).toBe(true);

      const sql = fs.readFileSync(ruta, "utf-8");
      await expect(aplicarMigracion(db, sql)).resolves.toBeUndefined();
    }
  });

  it("valida constraints de numero_ciclo >= 1 y tipo = 'diamante'", async () => {
    await expect(
      como("authenticated", ALUMNO_A, `SELECT * FROM public.registrar_logro_racha(0)`),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      como("authenticated", ALUMNO_A, `SELECT * FROM public.registrar_logro_racha(1, 'oro')`),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      db.query(
        `INSERT INTO public.logros_racha (alumno_id, numero_ciclo, tipo) VALUES ($1, -1, 'diamante')`,
        [ALUMNO_A],
      ),
    ).rejects.toMatchObject({ code: "23514" });

    await expect(
      db.query(
        `INSERT INTO public.logros_racha (alumno_id, numero_ciclo, tipo) VALUES ($1, 1, 'bronce')`,
        [ALUMNO_A],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("GIVEN un alumno autenticado WHEN registra el logro del ciclo 1 dos veces THEN existe una sola fila y conserva fecha_logro", async () => {
    const primera = await como<{
      id: string;
      alumno_id: string;
      numero_ciclo: number;
      tipo: string;
      fecha_logro: string;
    }>("authenticated", ALUMNO_A, `SELECT * FROM public.registrar_logro_racha(1)`);

    expect(primera.rows).toHaveLength(1);
    expect(primera.rows[0]!.alumno_id).toBe(ALUMNO_A);
    expect(primera.rows[0]!.numero_ciclo).toBe(1);
    expect(primera.rows[0]!.tipo).toBe("diamante");

    // Segundo llamado idempotente (p. ej. reintento desde cola offline)
    const segunda = await como<{
      id: string;
      alumno_id: string;
      numero_ciclo: number;
      tipo: string;
      fecha_logro: string;
    }>("authenticated", ALUMNO_A, `SELECT * FROM public.registrar_logro_racha(1)`);

    expect(segunda.rows).toHaveLength(1);
    expect(segunda.rows[0]!.id).toBe(primera.rows[0]!.id);
    expect(new Date(segunda.rows[0]!.fecha_logro).toISOString()).toBe(
      new Date(primera.rows[0]!.fecha_logro).toISOString(),
    );

    // También idempotente vía INSERT ... ON CONFLICT DO NOTHING
    await como(
      "authenticated",
      ALUMNO_A,
      `INSERT INTO public.logros_racha (alumno_id, numero_ciclo, tipo)
       VALUES ($1, 1, 'diamante')
       ON CONFLICT (alumno_id, numero_ciclo, tipo) DO NOTHING`,
      [ALUMNO_A],
    );

    const conteo = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.logros_racha WHERE alumno_id = $1 AND numero_ciclo = 1`,
      [ALUMNO_A],
    );
    expect(conteo.rows[0]!.n).toBe(1);

    // Ciclo 2 también se registra sin conflicto y suma count(*) = 2
    await como("authenticated", ALUMNO_A, `SELECT * FROM public.registrar_logro_racha(2)`);
    const totalA = await como<{ n: number }>(
      "authenticated",
      ALUMNO_A,
      `SELECT count(*)::int AS n FROM public.logros_racha WHERE alumno_id = $1`,
      [ALUMNO_A],
    );
    expect(totalA.rows[0]!.n).toBe(2);
  });

  it("GIVEN el alumno A WHEN consulta logros_racha THEN no ve filas del alumno B (ni puede insertar para B)", async () => {
    // Alumno B registra su propio logro del ciclo 1
    await como("authenticated", ALUMNO_B, `SELECT * FROM public.registrar_logro_racha(1)`);

    const lecturaA = await como<{ alumno_id: string }>(
      "authenticated",
      ALUMNO_A,
      `SELECT alumno_id FROM public.logros_racha`,
    );
    expect(lecturaA.rows.length).toBeGreaterThan(0);
    expect(lecturaA.rows.every((r) => r.alumno_id === ALUMNO_A)).toBe(true);

    const lecturaBDeA = await como(
      "authenticated",
      ALUMNO_A,
      `SELECT id FROM public.logros_racha WHERE alumno_id = $1`,
      [ALUMNO_B],
    );
    expect(lecturaBDeA.rows).toHaveLength(0);

    // Alumno A no puede insertar un logro atribuido a Alumno B
    await expect(
      como(
        "authenticated",
        ALUMNO_A,
        `INSERT INTO public.logros_racha (alumno_id, numero_ciclo, tipo) VALUES ($1, 3, 'diamante')`,
        [ALUMNO_B],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("GIVEN un coach WHEN consulta los logros THEN ve solo los de sus alumnos", async () => {
    // Alumno C (asignado a Coach 1 vía entrenador_alumnos) registra su logro
    await como("authenticated", ALUMNO_C, `SELECT * FROM public.registrar_logro_racha(1)`);

    const coach1Ve = await como<{ alumno_id: string }>(
      "authenticated",
      COACH_1,
      `SELECT alumno_id FROM public.logros_racha ORDER BY alumno_id, numero_ciclo`,
    );
    const alumnosVistosPorCoach1 = new Set(coach1Ve.rows.map((r) => r.alumno_id));
    expect(alumnosVistosPorCoach1.has(ALUMNO_A)).toBe(true);
    expect(alumnosVistosPorCoach1.has(ALUMNO_C)).toBe(true);
    expect(alumnosVistosPorCoach1.has(ALUMNO_B)).toBe(false);

    const coach2Ve = await como<{ alumno_id: string }>(
      "authenticated",
      COACH_2,
      `SELECT alumno_id FROM public.logros_racha`,
    );
    const alumnosVistosPorCoach2 = new Set(coach2Ve.rows.map((r) => r.alumno_id));
    expect(alumnosVistosPorCoach2.has(ALUMNO_B)).toBe(true);
    expect(alumnosVistosPorCoach2.has(ALUMNO_A)).toBe(false);
    expect(alumnosVistosPorCoach2.has(ALUMNO_C)).toBe(false);
  });

  it("bloquea UPDATE y DELETE para alumnos/coaches y bloquea todo acceso a anon", async () => {
    await expect(
      como(
        "authenticated",
        ALUMNO_A,
        `UPDATE public.logros_racha SET numero_ciclo = 99 WHERE alumno_id = $1`,
        [ALUMNO_A],
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      como(
        "authenticated",
        ALUMNO_A,
        `DELETE FROM public.logros_racha WHERE alumno_id = $1`,
        [ALUMNO_A],
      ),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      como("authenticated", COACH_1, `DELETE FROM public.logros_racha WHERE alumno_id = $1`, [
        ALUMNO_A,
      ]),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      como("anon", null, `SELECT * FROM public.logros_racha`),
    ).rejects.toMatchObject({ code: "42501" });

    await expect(
      como("anon", null, `SELECT * FROM public.registrar_logro_racha(1)`),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("restaurar_filas_respaldo acepta logros_racha solo para service_role", async () => {
    const res = await como<{ n: number }>(
      "service_role",
      null,
      `SELECT public.restaurar_filas_respaldo('logros_racha', '[]'::jsonb) AS n`,
    );
    expect(res.rows[0]!.n).toBe(0);
  });
});
