import * as fs from "node:fs";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

const COACH = "00000000-0000-0000-0000-000000000672";
const ALUMNO_1 = "00000000-0000-0000-0000-000000000673";
const ALUMNO_2 = "00000000-0000-0000-0000-000000000674";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${COACH}', 'rt-coach@t'),
    ('${ALUMNO_1}', 'rt-al1@t'),
    ('${ALUMNO_2}', 'rt-al2@t');

  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${COACH}', 'rt-coach@t', 'Coach RT', 'ENTRENADOR', NULL, 'ACTIVA'),
    ('${ALUMNO_1}', 'rt-al1@t', 'Alumno 1 RT', 'ALUMNO', '${COACH}', 'ACTIVA'),
    ('${ALUMNO_2}', 'rt-al2@t', 'Alumno 2 RT', 'ALUMNO', '${COACH}', 'ACTIVA')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol, profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;
`;

let db: PGlite;

function como<T>(rol: "anon" | "authenticated", sub: string | null, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

describe("GOZS-672: public.feedback_clase en supabase_realtime (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await db.exec(SEED);
  }, 60_000);

  it("public.feedback_clase está en la publicación supabase_realtime con REPLICA IDENTITY FULL", async () => {
    const pub = await db.query<{
      tablename: string;
      pubinsert: boolean;
      pubupdate: boolean;
      pubdelete: boolean;
    }>(
      `SELECT pt.tablename, p.pubinsert, p.pubupdate, p.pubdelete
       FROM pg_publication_tables pt
       JOIN pg_publication p ON p.pubname = pt.pubname
       WHERE pt.pubname = 'supabase_realtime'
         AND pt.schemaname = 'public'
         AND pt.tablename = 'feedback_clase'`,
    );
    expect(pub.rows).toEqual([
      { tablename: "feedback_clase", pubinsert: true, pubupdate: true, pubdelete: true },
    ]);

    const repl = await db.query<{ relreplident: string }>(
      `SELECT relreplident::text
       FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relname = 'feedback_clase'`,
    );
    expect(repl.rows[0]?.relreplident).toBe("f");
  });

  it("aplicar la migración dos veces es idempotente y no falla", async () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, "20261121200000_realtime_feedback_clase.sql"),
      "utf-8",
    );
    await expect(aplicarMigracion(db, sql)).resolves.toBeUndefined();

    const pub = await db.query<{ tablename: string }>(
      `SELECT tablename
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'feedback_clase'`,
    );
    expect(pub.rows).toHaveLength(1);
  });

  it("RLS intacta: el coach lee el feedback del alumno y otro alumno no lo ve", async () => {
    const inicio = new Date(Date.now() - 2 * 3600_000).toISOString();
    const claseRes = await db.query<{ id: string }>(
      `INSERT INTO public.clases (actividad, inicio, duracion_minutos, capacidad, estado)
       VALUES ('FUNCIONAL', $1::timestamptz, 60, 12, 'PROGRAMADA')
       RETURNING id`,
      [inicio],
    );
    const reservaRes = await db.query<{ id: string }>(
      `INSERT INTO public.reservas (clase_id, alumno_id, estado)
       VALUES ($1, $2, 'ANOTADO')
       RETURNING id`,
      [claseRes.rows[0]!.id, ALUMNO_1],
    );
    const reservaId = reservaRes.rows[0]!.id;

    await como(
      "authenticated",
      ALUMNO_1,
      `INSERT INTO public.feedback_clase (reserva_id, sensacion) VALUES ($1, 3)`,
      [reservaId],
    );

    const vistaCoach = await como<{ sensacion: number }>(
      "authenticated",
      COACH,
      `SELECT sensacion FROM public.feedback_clase WHERE reserva_id = $1`,
      [reservaId],
    );
    expect(vistaCoach.rows).toEqual([{ sensacion: 3 }]);

    const vistaOtroAlumno = await como<{ sensacion: number }>(
      "authenticated",
      ALUMNO_2,
      `SELECT sensacion FROM public.feedback_clase WHERE reserva_id = $1`,
      [reservaId],
    );
    expect(vistaOtroAlumno.rows).toHaveLength(0);
  });
});
