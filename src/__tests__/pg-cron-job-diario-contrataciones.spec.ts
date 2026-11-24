import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite, type Transaction } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

// GOZS-706: job diario de contrataciones agendado con pg_cron.
// PGlite no trae pg_cron: se prueba la función del job (lo que corre el cron)
// y que la migración agenda el comando correcto cuando la extensión existe.

const MIGRATION_FILE = "20261123000000_pg_cron_job_diario_contrataciones.sql";
const SQL = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), "utf-8");

const COACH = "00000000-0000-0000-0000-0000000706c0";
const ALUMNO = "00000000-0000-0000-0000-0000000706a0";
const C_VENCIDA = "70600000-0000-0000-0000-000000000001";
const C_POR_VENCER = "70600000-0000-0000-0000-000000000002";
const C_VIGENTE = "70600000-0000-0000-0000-000000000003";

const SEED = `
  INSERT INTO auth.users (id, email) VALUES ('${COACH}','c706@t'),('${ALUMNO}','a706@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id, estado_membresia) VALUES
    ('${COACH}','c706@t','Coach 706','ENTRENADOR',NULL,'ACTIVA'),
    ('${ALUMNO}','a706@t','Alumno 706','ALUMNO','${COACH}','ACTIVA')
  ON CONFLICT (id) DO UPDATE SET nombre_completo = EXCLUDED.nombre_completo, rol = EXCLUDED.rol,
    profesor_asignado_id = EXCLUDED.profesor_asignado_id, estado_membresia = EXCLUDED.estado_membresia;
  INSERT INTO public.contrataciones (id, alumno_id, dia_vencimiento, fecha_inicio, fecha_fin, estado) VALUES
    ('${C_VENCIDA}','${ALUMNO}',5,CURRENT_DATE - 31,CURRENT_DATE - 1,'VIGENTE'),
    ('${C_POR_VENCER}','${ALUMNO}',5,CURRENT_DATE - 28,CURRENT_DATE + 2,'VIGENTE'),
    ('${C_VIGENTE}','${ALUMNO}',5,CURRENT_DATE,CURRENT_DATE + 30,'VIGENTE');
`;

let db: PGlite;

function como(rol: "anon" | "authenticated" | "service_role", sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: rol })]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query(sql);
  });
}

async function estado(id: string): Promise<string> {
  const r = await db.query<{ estado: string }>(`SELECT estado FROM public.contrataciones WHERE id = $1`, [id]);
  return r.rows[0]!.estado;
}

describe("GOZS-706: pg_cron con el job diario de vencimientos", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    // Idempotencia: re-aplicar no falla (sin pg_cron omite la agenda).
    await aplicarMigracion(db, SQL);
    await db.exec(SEED);
  }, 120_000);

  it("GIVEN el proyecto WHEN se aplica la migración THEN habilita pg_cron y agenda el job todos los días", () => {
    expect(SQL).toMatch(/CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog/);
    const agenda = SQL.match(/cron\.schedule\(\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\s*\)/);
    expect(agenda).not.toBeNull();
    const [, nombre, expresion, comando] = agenda!;
    expect(nombre).toBe("gozster_job_diario_contrataciones");
    // minuto hora * * * -> una vez por día
    expect(expresion).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
    expect(comando).toBe("SELECT public.job_diario_contrataciones()");
  });

  it("sin pg_cron disponible (PGlite) la migración no crea el schema cron", async () => {
    const r = await db.query(`SELECT 1 FROM pg_namespace WHERE nspname = 'cron'`);
    expect(r.rows).toHaveLength(0);
  });

  it("solo service_role o el job sin JWT pueden ejecutar la función del job", async () => {
    await expect(como("anon", `SELECT public.job_diario_contrataciones()`)).rejects.toThrow(/permission denied/);
    await expect(como("authenticated", `SELECT public.job_diario_contrataciones()`)).rejects.toThrow(
      /permission denied/
    );
  });

  it("GIVEN un vencimiento forzado WHEN corre el job THEN pasa a VENCIDA o POR_VENCER", async () => {
    // Igual que pg_cron: sesión de base sin request.jwt.claims.
    const r = await db.query<{ resultado: { por_vencer: number; vencidas: number } }>(
      `SELECT public.job_diario_contrataciones() AS resultado`
    );
    expect(r.rows[0]!.resultado.vencidas).toBeGreaterThanOrEqual(1);
    expect(r.rows[0]!.resultado.por_vencer).toBeGreaterThanOrEqual(1);

    expect(await estado(C_VENCIDA)).toBe("VENCIDA");
    expect(await estado(C_POR_VENCER)).toBe("POR_VENCER");
    expect(await estado(C_VIGENTE)).toBe("VIGENTE");
  });

  it("service_role también puede correrlo y es idempotente", async () => {
    const r = await como("service_role", `SELECT public.job_diario_contrataciones() AS resultado`);
    expect((r.rows[0] as { resultado: unknown }).resultado).toEqual({ por_vencer: 0, vencidas: 0 });
  });
});
