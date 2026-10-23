import { describe, it, expect, beforeAll, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-135: obtener_kpis_negocio solo ADMIN. Probada sobre Postgres real (PGlite)
// con roles de Supabase simulados.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261022120000_rpc_obtener_kpis_negocio.sql";

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH = "00000000-0000-0000-0000-00000000c0ac";
const A_8D = "00000000-0000-0000-0000-0000000000a8";
const A_6D = "00000000-0000-0000-0000-0000000000a6";
const A_NUNCA = "00000000-0000-0000-0000-0000000000a0";
const A_BAJA = "00000000-0000-0000-0000-0000000000ba";
const PLAN = "20000000-0000-0000-0000-000000000001";

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

// Cuota mensual del plan = 30000 / 3 = 10000.
// Alumnos activos: A_8D (entrenó hace 8d, contratación vencida hace 5d, 1ª contratación hace 60d),
// A_6D (entrenó hace 6d, contratación paga con 1ª contratación al inicio del mes),
// A_NUNCA (nunca entrenó, cuota vence hoy). A_BAJA: dada de baja hoy, contratación vencida (no cuenta).
// Pagos confirmados este mes: 15000 + 5000; mes anterior: 7000. Pendiente/rechazado no cuentan.
// Fechas de los fixtures en la misma fecha local que p_hasta (no CURRENT_DATE, que es UTC).
const HOY_AR = `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;

const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}','admin@t'),('${COACH}','coach@t'),('${A_8D}','a8@t'),
    ('${A_6D}','a6@t'),('${A_NUNCA}','a0@t'),('${A_BAJA}','ba@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia, fecha_baja, ultimo_entreno_at) VALUES
    ('${ADMIN}','admin@t','Admin','ADMIN','ACTIVA',NULL,NULL),
    ('${COACH}','coach@t','Coach','ENTRENADOR','ACTIVA',NULL,NULL),
    ('${A_8D}','a8@t','Ocho','ALUMNO','ACTIVA',NULL, now() - interval '8 days'),
    ('${A_6D}','a6@t','Seis','ALUMNO','ACTIVA',NULL, now() - interval '6 days'),
    ('${A_NUNCA}','a0@t','Nunca','ALUMNO','ACTIVA',NULL,NULL),
    ('${A_BAJA}','ba@t','Baja','ALUMNO','BAJA', now(), NULL);
  INSERT INTO public.planes_membresia (id, nombre, cantidad_actividades, duracion_meses, precio)
    VALUES ('${PLAN}','Trimestral',1,3,30000);
  INSERT INTO public.contrataciones (id, alumno_id, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad) VALUES
    ('10000000-0000-0000-0000-000000000001','${A_8D}',5,${HOY_AR} - 60,${HOY_AR} - 5,'VIGENTE','${PLAN}','FUNCIONAL'),
    ('10000000-0000-0000-0000-000000000002','${A_6D}',5,date_trunc('month', ${HOY_AR})::date,${HOY_AR} + 10,'VIGENTE','${PLAN}','FUNCIONAL'),
    ('10000000-0000-0000-0000-000000000003','${A_NUNCA}',5,${HOY_AR} - 90,${HOY_AR},'VIGENTE','${PLAN}','FUNCIONAL'),
    ('10000000-0000-0000-0000-000000000004','${A_BAJA}',5,${HOY_AR} - 90,${HOY_AR} - 20,'VENCIDA','${PLAN}','FUNCIONAL');
  INSERT INTO public.pagos (contratacion_id, alumno_id, monto, medio_pago, estado, idempotency_key, confirmado_at) VALUES
    ('10000000-0000-0000-0000-000000000002','${A_6D}',15000,'TRANSFERENCIA','CONFIRMADO','k1', now()),
    ('10000000-0000-0000-0000-000000000002','${A_6D}',5000,'EFECTIVO','CONFIRMADO','k2', now()),
    ('10000000-0000-0000-0000-000000000002','${A_6D}',99999,'EFECTIVO','PENDIENTE','k3', NULL),
    ('10000000-0000-0000-0000-000000000002','${A_6D}',88888,'EFECTIVO','RECHAZADO','k4', NULL),
    ('10000000-0000-0000-0000-000000000001','${A_8D}',7000,'EFECTIVO','CONFIRMADO','k5', now() - interval '1 month');
`;

const PERIODO = `
  date_trunc('month', ${HOY_AR})::date,
  ${HOY_AR}
`;

let db: PGlite;

function como<T>(rol: Rol, sub: string | null, sql: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql);
  });
}

type Kpis = {
  ingresos: string;
  ingresos_6m: string[];
  ingresos_periodo_anterior: string;
  cobranza_esperada: string;
  cobranza_pendiente_monto: string;
  cobranza_vencidas_cant: number;
  sin_entrenar_7d_ids: string[];
  activos_fin: number;
  altas: number;
  bajas: number;
};

const KPIS = `SELECT * FROM public.obtener_kpis_negocio(${PERIODO})`;

async function montarDb(): Promise<PGlite> {
  const nueva = new PGlite({ extensions: { pgcrypto } });
  await nueva.exec(SUPABASE_STUBS);
  const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const archivo of archivos) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8");
    const inicio = sql.search(/^BEGIN;/m);
    if (inicio > 0) {
      await nueva.exec(sql.slice(0, inicio));
      await nueva.exec(sql.slice(inicio));
    } else {
      await nueva.exec(sql);
    }
  }
  await nueva.exec(SEED);
  return nueva;
}

describe("GOZS-135: obtener_kpis_negocio (PGlite)", () => {
  beforeAll(async () => {
    db = await montarDb();
  }, 60_000);

  it("la migración existe y nada anterior se reescribió (append-only)", () => {
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(archivos).toContain(NEW_MIGRATION);
    expect(archivos[archivos.length - 1]! >= NEW_MIGRATION).toBe(true);
  });

  it("ADMIN obtiene los números esperados del dataset", async () => {
    const r = await como<Kpis>("authenticated", ADMIN, KPIS);
    expect(r.rows).toHaveLength(1);
    const k = r.rows[0]!;
    expect(Number(k.ingresos)).toBe(20000);
    expect(k.ingresos_6m.map(Number)).toEqual([0, 0, 0, 0, 7000, 20000]);
    expect(Number(k.ingresos_periodo_anterior)).toBe(7000);
    expect(Number(k.cobranza_pendiente_monto)).toBe(20000);
    expect(Number(k.cobranza_esperada)).toBe(40000);
    expect(k.cobranza_vencidas_cant).toBe(1);
    expect(k.activos_fin).toBe(3);
    expect(k.altas).toBe(1);
    expect(k.bajas).toBe(1);
  });

  it("sin_entrenar_7d_ids incluye 8 días y nunca, excluye 6 días y bajas", async () => {
    const r = await como<Kpis>("authenticated", ADMIN, KPIS);
    const ids = r.rows[0]!.sin_entrenar_7d_ids;
    expect([...ids].sort()).toEqual([A_8D, A_NUNCA].sort());
    expect(ids).not.toContain(A_6D);
    expect(ids).not.toContain(A_BAJA);
  });

  it("ENTRENADOR y ALUMNO reciben error de permisos", async () => {
    await expect(como("authenticated", COACH, KPIS)).rejects.toThrow(/Solo un administrador/);
    await expect(como("authenticated", A_6D, KPIS)).rejects.toThrow(/Solo un administrador/);
  });

  it("anon no puede ejecutarla", async () => {
    await expect(como("anon", null, KPIS)).rejects.toThrow(/permission denied/);
  });

  it("valida el período", async () => {
    await expect(
      como("authenticated", ADMIN, `SELECT * FROM public.obtener_kpis_negocio('2026-10-10', '2026-10-01')`)
    ).rejects.toThrow(/Período inválido/);
    await expect(
      como("authenticated", ADMIN, `SELECT * FROM public.obtener_kpis_negocio(NULL, '2026-10-01')`)
    ).rejects.toThrow(/Período inválido/);
  });

  // 02:30 UTC del 23/10 = 23:30 del 22/10 en Argentina: CURRENT_DATE (UTC) y la fecha
  // local difieren. Los fixtures y p_hasta salen de la fecha local, así que el resultado no cambia.
  it("da los mismos números con el reloj en una hora peligrosa (02:30 UTC)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T02:30:00Z"));
    try {
      const peligrosa = await montarDb();
      const hora = await peligrosa.query<{ utc: string; ar: string }>(
        `SELECT (now() AT TIME ZONE 'UTC')::date::text AS utc, (${HOY_AR})::text AS ar`
      );
      expect(hora.rows[0]).toEqual({ utc: "2026-10-23", ar: "2026-10-22" });
      const dbPrevia = db;
      db = peligrosa;
      try {
        const k = (await como<Kpis>("authenticated", ADMIN, KPIS)).rows[0]!;
        expect(Number(k.ingresos)).toBe(20000);
        expect(Number(k.cobranza_pendiente_monto)).toBe(20000);
        expect(Number(k.cobranza_esperada)).toBe(40000);
        expect(k.cobranza_vencidas_cant).toBe(1);
        expect([...k.sin_entrenar_7d_ids].sort()).toEqual([A_8D, A_NUNCA].sort());
      } finally {
        db = dbPrevia;
      }
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});
