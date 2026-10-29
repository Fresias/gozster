import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// GOZS-141: historial de precios de membresías. Probado sobre Postgres real (PGlite)
// con roles de Supabase simulados (mismo patrón que rpc-kpis-negocio.spec.ts).

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION = "20261023120000_planes_membresia_precios.sql";

const ADMIN = "00000000-0000-0000-0000-0000000000ad";
const COACH = "00000000-0000-0000-0000-00000000c0ac";
const ALUMNO = "00000000-0000-0000-0000-0000000000a1";
const PLAN = "20000000-0000-0000-0000-000000000001";
const PLAN_ANTIGUO = "20000000-0000-0000-0000-000000000002";

const HOY_AR = `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;

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

// PLAN: mensual a 20000 (fila inicial automática); los tests le suben el precio.
// PLAN_ANTIGUO: 20000 desde 2026-01-01 y 22000 desde 2026-10-24 (caso del issue).
// Alumno activo con una cuota vencida hace 13 días, sin pagar, y un pago confirmado de 20000.
const SEED = `
  INSERT INTO auth.users (id, email) VALUES
    ('${ADMIN}','admin@t'),('${COACH}','coach@t'),('${ALUMNO}','al@t');
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, estado_membresia) VALUES
    ('${ADMIN}','admin@t','Admin','ADMIN','ACTIVA'),
    ('${COACH}','coach@t','Coach','ENTRENADOR','ACTIVA'),
    ('${ALUMNO}','al@t','Alumno','ALUMNO','ACTIVA');
  INSERT INTO public.planes_membresia (id, nombre, cantidad_actividades, duracion_meses, precio)
    VALUES ('${PLAN}','Mensual',1,1,20000),('${PLAN_ANTIGUO}','Mensual viejo',1,1,20000);
  INSERT INTO public.contrataciones (id, alumno_id, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad)
    VALUES ('10000000-0000-0000-0000-000000000001','${ALUMNO}',5,${HOY_AR} - 43,${HOY_AR} - 13,'VIGENTE','${PLAN}','FUNCIONAL');
  INSERT INTO public.pagos (contratacion_id, alumno_id, monto, medio_pago, estado, idempotency_key, confirmado_at)
    VALUES ('10000000-0000-0000-0000-000000000001','${ALUMNO}',20000,'EFECTIVO','CONFIRMADO','k1', now());
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

const precioEn = async (plan: string, fecha: string) =>
  (
    await como<{ p: string | null }>(
      "authenticated",
      ALUMNO,
      `SELECT public.precio_vigente('${plan}', '${fecha}') AS p`
    )
  ).rows[0]!.p;

const pendiente = async () =>
  Number(
    (
      await como<{ c: string }>(
        "authenticated",
        ADMIN,
        `SELECT cobranza_pendiente_monto AS c FROM public.obtener_kpis_negocio(date_trunc('month', ${HOY_AR})::date, ${HOY_AR})`
      )
    ).rows[0]!.c
  );

describe("GOZS-141: planes_membresia_precios (PGlite)", () => {
  beforeAll(async () => {
    db = await montarDb();
    // Aumento futuro de PLAN y escenario del issue para PLAN_ANTIGUO
    await db.exec(`
      INSERT INTO public.planes_membresia_precios (plan_membresia_id, precio, vigente_desde, creado_por)
        VALUES ('${PLAN_ANTIGUO}', 20000, '2026-01-01', '${ADMIN}'),
               ('${PLAN_ANTIGUO}', 22000, '2026-10-24', '${ADMIN}');
    `);
  }, 60_000);

  it("la migración existe", () => {
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(archivos).toContain(NEW_MIGRATION);
  });

  it("todo plan tiene su fila inicial (alta automática y backfill)", async () => {
    const r = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.planes_membresia pm
       WHERE NOT EXISTS (SELECT 1 FROM public.planes_membresia_precios x WHERE x.plan_membresia_id = pm.id)`
    );
    expect(r.rows[0]!.n).toBe("0");
  });

  it("precio_vigente devuelve el precio vigente en la fecha pedida", async () => {
    expect(Number(await precioEn(PLAN_ANTIGUO, "2026-10-10"))).toBe(20000);
    expect(Number(await precioEn(PLAN_ANTIGUO, "2026-10-24"))).toBe(22000);
    expect(Number(await precioEn(PLAN_ANTIGUO, "2026-11-10"))).toBe(22000);
  });

  it("precio_vigente devuelve NULL si el plan no tiene precio o no existe", async () => {
    expect(await precioEn("99999999-0000-0000-0000-000000000000", "2026-10-10")).toBeNull();
  });

  it("un aumento cargado hoy no cambia la cobranza pendiente de cuotas vencidas antes", async () => {
    expect(await pendiente()).toBe(20000);
    // Carga retroactiva solo posible con rol privilegiado (la API la rechaza, ver GOZS-223).
    await db.exec(
      `INSERT INTO public.planes_membresia_precios (plan_membresia_id, precio, vigente_desde)
       VALUES ('${PLAN}', 22000, ${HOY_AR} - 1)`
    );
    expect(await pendiente()).toBe(20000);
  });

  it("un precio vigente hoy actualiza el precio de lista; uno futuro no", async () => {
    const lista = async (id: string) =>
      Number((await db.query<{ p: string }>(`SELECT precio::text AS p FROM public.planes_membresia WHERE id = '${id}'`)).rows[0]!.p);
    expect(await lista(PLAN)).toBe(22000);
    await como(
      "authenticated",
      ADMIN,
      `INSERT INTO public.planes_membresia_precios (plan_membresia_id, precio, vigente_desde)
       VALUES ('${PLAN}', 25000, ${HOY_AR} + 30)`
    );
    expect(await lista(PLAN)).toBe(22000);
  });

  it("registra quién cargó el precio (creado_por = auth.uid())", async () => {
    const r = await db.query<{ creado_por: string }>(
      `SELECT creado_por FROM public.planes_membresia_precios WHERE plan_membresia_id = '${PLAN}' AND precio = 25000`
    );
    expect(r.rows[0]!.creado_por).toBe(ADMIN);
  });

  it("ENTRENADOR y ALUMNO no pueden insertar un precio", async () => {
    const ins = `INSERT INTO public.planes_membresia_precios (plan_membresia_id, precio, vigente_desde)
                 VALUES ('${PLAN}', 1, '2030-01-01')`;
    await expect(como("authenticated", COACH, ins)).rejects.toThrow(/row-level security/);
    await expect(como("authenticated", ALUMNO, ins)).rejects.toThrow(/row-level security/);
    await expect(como("anon", null, ins)).rejects.toThrow(/permission denied|row-level security/);
  });

  it("nadie puede UPDATE ni DELETE (ni siquiera service_role)", async () => {
    for (const rol of ["authenticated", "service_role"] as const) {
      const sub = rol === "authenticated" ? ADMIN : null;
      await expect(
        como(rol, sub, `UPDATE public.planes_membresia_precios SET precio = 1`)
      ).rejects.toThrow(/permission denied|inmutable/);
      await expect(como(rol, sub, `DELETE FROM public.planes_membresia_precios`)).rejects.toThrow(
        /permission denied|inmutable/
      );
    }
  });

  it("no permite dos precios para el mismo plan y fecha", async () => {
    await db.exec(
      `INSERT INTO public.planes_membresia_precios (plan_membresia_id, precio, vigente_desde)
       VALUES ('${PLAN_ANTIGUO}', 23000, '2027-01-01')`
    );
    await expect(
      como(
        "authenticated",
        ADMIN,
        `INSERT INTO public.planes_membresia_precios (plan_membresia_id, precio, vigente_desde)
         VALUES ('${PLAN_ANTIGUO}', 1, '2027-01-01')`
      )
    ).rejects.toThrow(/duplicate key|unique/);
  });

  it("pagos.monto confirmados no cambian con el aumento", async () => {
    const r = await db.query<{ monto: string }>(`SELECT monto::text FROM public.pagos`);
    expect(r.rows.map((x) => Number(x.monto))).toEqual([20000]);
  });

  it("cualquier usuario autenticado puede leer el historial; anon no", async () => {
    const r = await como<{ n: string }>("authenticated", ALUMNO, `SELECT count(*)::text AS n FROM public.planes_membresia_precios`);
    expect(Number(r.rows[0]!.n)).toBeGreaterThan(0);
    expect((await como("anon", null, `SELECT * FROM public.planes_membresia_precios`)).rows).toHaveLength(0);
  });

  it("restaurar_filas_respaldo acepta la tabla nueva", async () => {
    const r = await como<{ n: number }>(
      "service_role",
      null,
      `SELECT public.restaurar_filas_respaldo('planes_membresia_precios', '[]'::jsonb) AS n`
    );
    expect(r.rows[0]!.n).toBe(0);
  });

  it("GOZS-223: la API rechaza un precio con vigencia hoy o pasada y acepta una futura", async () => {
    const ins = (d: string) =>
      como(
        "authenticated",
        ADMIN,
        `INSERT INTO public.planes_membresia_precios (plan_membresia_id, precio, vigente_desde)
         VALUES ('${PLAN_ANTIGUO}', 30000, ${d})`
      );
    await expect(ins(HOY_AR)).rejects.toThrow(/posterior a hoy/);
    await expect(ins(`${HOY_AR} - 1`)).rejects.toThrow(/posterior a hoy/);
    await expect(ins(`${HOY_AR} + 1`)).resolves.toBeDefined();
  });

  it("GOZS-223: un pago multi-mes cuenta completo en el mes del cobro", async () => {
    await db.exec(`
      INSERT INTO public.planes_membresia (id, nombre, cantidad_actividades, duracion_meses, precio)
        VALUES ('20000000-0000-0000-0000-000000000003','Trimestral',1,3,60000);
      INSERT INTO public.contrataciones (id, alumno_id, dia_vencimiento, fecha_inicio, fecha_fin, estado, plan_membresia_id, actividad)
        VALUES ('10000000-0000-0000-0000-000000000003','${ALUMNO}',5,${HOY_AR},${HOY_AR} + 90,'VIGENTE','20000000-0000-0000-0000-000000000003','FUNCIONAL');
      INSERT INTO public.pagos (contratacion_id, alumno_id, monto, medio_pago, estado, idempotency_key, confirmado_at)
        VALUES ('10000000-0000-0000-0000-000000000003','${ALUMNO}',60000,'EFECTIVO','CONFIRMADO','k3', now());
    `);
    const r = await como<{ i: string }>(
      "authenticated",
      ADMIN,
      `SELECT ingresos::text AS i FROM public.obtener_kpis_negocio(date_trunc('month', ${HOY_AR})::date, ${HOY_AR})`
    );
    expect(Number(r.rows[0]!.i)).toBe(80000);
  });
});
