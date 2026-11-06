import { describe, it, expect, beforeAll, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import {
  mapearRpcAKpis,
  obtenerKpisNegocio,
  puedeVerMontos,
  rangoPeriodo,
  calcularPeriodoMesEnCurso,
  type KpisNegocio,
} from "@/lib/kpis-negocio";
import {
  derivarKpisNegocio,
  type DemoGimnasio,
} from "@/services/coach-demo-generator";

// GOZS-135 / GOZS-369: RPC kpis_negocio_v2. Probada sobre Postgres real (PGlite)
// con roles de Supabase simulados.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const NEW_MIGRATION_V1 = "20261022120001_rpc_obtener_kpis_negocio.sql";
const NEW_MIGRATION_V2 = "20261106100000_rpc_kpis_negocio_v2.sql";

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
  CREATE TABLE auth.users (id uuid PRIMARY KEY, instance_id uuid, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
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
  ingresos: string | null;
  ingresos_6m: string[] | null;
  ingresos_periodo_anterior: string | null;
  cobranza_esperada: string | null;
  cobranza_pendiente_monto: string | null;
  cobranza_vencidas_cant: number;
  sin_entrenar_7d_ids: string[];
  activos_fin: number;
  altas: number;
  bajas: number;
  ingresos_presencial: string | null;
  ingresos_online: string | null;
  cobranza_vencida_monto: string | null;
  cobranza_por_vencer_monto: string | null;
  alumnos_al_dia: number;
  alumnos_morosos: number;
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

describe("GOZS-135 / GOZS-369: obtener_kpis_negocio (PGlite)", () => {
  beforeAll(async () => {
    db = await montarDb();
  }, 60_000);

  it("la migración v2 existe y nada anterior se reescribió (append-only)", () => {
    const archivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(archivos).toContain(NEW_MIGRATION_V1);
    expect(archivos).toContain(NEW_MIGRATION_V2);
    expect(archivos[archivos.length - 1]! >= NEW_MIGRATION_V2).toBe(true);
  });

  it("ADMIN obtiene los números esperados del dataset (v1 + v2)", async () => {
    const r = await como<Kpis>("authenticated", ADMIN, KPIS);
    expect(r.rows).toHaveLength(1);
    const k = r.rows[0]!;
    expect(Number(k.ingresos)).toBe(20000);
    expect(k.ingresos_6m!.map(Number)).toEqual([0, 0, 0, 0, 7000, 20000]);
    expect(Number(k.ingresos_periodo_anterior)).toBe(7000);
    expect(Number(k.cobranza_pendiente_monto)).toBe(20000);
    expect(Number(k.cobranza_esperada)).toBe(40000);
    expect(Number(k.cobranza_vencidas_cant)).toBe(1);
    expect(Number(k.activos_fin)).toBe(3);
    expect(Number(k.altas)).toBe(1);
    expect(Number(k.bajas)).toBe(1);

    // Extensiones v2
    expect(Number(k.ingresos_presencial)).toBe(20000);
    expect(Number(k.ingresos_online)).toBe(0);
    expect(Number(k.cobranza_vencida_monto)).toBe(10000);
    expect(Number(k.cobranza_por_vencer_monto)).toBe(10000);
    expect(Number(k.alumnos_al_dia)).toBe(2);
    expect(Number(k.alumnos_morosos)).toBe(1);
  });

  it("sin_entrenar_7d_ids incluye 8 días y nunca, excluye 6 días y bajas", async () => {
    const r = await como<Kpis>("authenticated", ADMIN, KPIS);
    const ids = r.rows[0]!.sin_entrenar_7d_ids;
    expect([...ids].sort()).toEqual([A_8D, A_NUNCA].sort());
    expect(ids).not.toContain(A_6D);
    expect(ids).not.toContain(A_BAJA);
  });

  it("ENTRENADOR puede ejecutar pero recibe montos NULL; ALUMNO recibe error de permisos", async () => {
    const rCoach = await como<Kpis>("authenticated", COACH, KPIS);
    expect(rCoach.rows).toHaveLength(1);
    const k = rCoach.rows[0]!;
    expect(k.ingresos).toBeNull();
    expect(k.ingresos_6m).toBeNull();
    expect(k.ingresos_periodo_anterior).toBeNull();
    expect(k.cobranza_esperada).toBeNull();
    expect(k.cobranza_pendiente_monto).toBeNull();
    expect(k.ingresos_presencial).toBeNull();
    expect(k.ingresos_online).toBeNull();
    expect(k.cobranza_vencida_monto).toBeNull();
    expect(k.cobranza_por_vencer_monto).toBeNull();

    // Métricas operativas no monetarias visibles para coach
    expect(Number(k.activos_fin)).toBe(3);
    expect(Number(k.alumnos_al_dia)).toBe(2);
    expect(Number(k.alumnos_morosos)).toBe(1);

    // Alumno rechazado con 42501
    await expect(como("authenticated", A_6D, KPIS)).rejects.toThrow(/Solo un administrador o entrenador/);
  });

  it("anon no puede ejecutarla", async () => {
    await expect(como("anon", null, KPIS)).rejects.toThrow(/permission denied/);
  });

  it("valida el período", async () => {
    await expect(
      como("authenticated", ADMIN, `SELECT * FROM public.obtener_kpis_negocio('2026-10-10', '2026-10-01')`),
    ).rejects.toThrow(/Período inválido/);
    await expect(
      como("authenticated", ADMIN, `SELECT * FROM public.obtener_kpis_negocio(NULL, '2026-10-01')`),
    ).rejects.toThrow(/Período inválido/);
  });

  it("GIVEN el seed de prueba WHEN se llama la RPC y derivarKpisNegocio sobre el mismo seed THEN todos los campos coinciden", async () => {
    const ahora = new Date();
    const hoyIso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(ahora);

    const formatOffset = (dias: number) => {
      const d = new Date(ahora.getTime() + dias * 86_400_000);
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    };

    const primerDiaMes = `${hoyIso.slice(0, 7)}-01`;
    const mesPrevio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 15).toISOString();

    const seedGimnasio: DemoGimnasio = {
      alumnos: [
        { id: ADMIN, email: "admin@t", nombre_completo: "Admin", rol: "ADMIN", estado_membresia: "ACTIVA", fecha_baja: null, ultimo_entreno_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" } as any,
        { id: COACH, email: "coach@t", nombre_completo: "Coach", rol: "ENTRENADOR", estado_membresia: "ACTIVA", fecha_baja: null, ultimo_entreno_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" } as any,
        { id: A_NUNCA, email: "a0@t", nombre_completo: "Nunca", rol: "ALUMNO", estado_membresia: "ACTIVA", fecha_baja: null, ultimo_entreno_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" } as any,
        { id: A_8D, email: "a8@t", nombre_completo: "Ocho", rol: "ALUMNO", estado_membresia: "ACTIVA", fecha_baja: null, ultimo_entreno_at: new Date(Date.now() - 8 * 86_400_000).toISOString(), created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" } as any,
        { id: A_6D, email: "a6@t", nombre_completo: "Seis", rol: "ALUMNO", estado_membresia: "ACTIVA", fecha_baja: null, ultimo_entreno_at: new Date(Date.now() - 6 * 86_400_000).toISOString(), created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" } as any,
        { id: A_BAJA, email: "ba@t", nombre_completo: "Baja", rol: "ALUMNO", estado_membresia: "BAJA", fecha_baja: hoyIso, ultimo_entreno_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" } as any,
      ],
      planes: [],
      contrataciones: [
        { id: "10000000-0000-0000-0000-000000000001", alumno_id: A_8D, dia_vencimiento: 5, fecha_inicio: formatOffset(-60), fecha_fin: formatOffset(-5), estado: "VIGENTE", plan_membresia_id: PLAN, actividad: "FUNCIONAL", tipo_servicio: "PRESENCIAL" } as any,
        { id: "10000000-0000-0000-0000-000000000002", alumno_id: A_6D, dia_vencimiento: 5, fecha_inicio: primerDiaMes, fecha_fin: formatOffset(10), estado: "VIGENTE", plan_membresia_id: PLAN, actividad: "FUNCIONAL", tipo_servicio: "PRESENCIAL" } as any,
        { id: "10000000-0000-0000-0000-000000000003", alumno_id: A_NUNCA, dia_vencimiento: 5, fecha_inicio: formatOffset(-90), fecha_fin: hoyIso, estado: "VIGENTE", plan_membresia_id: PLAN, actividad: "FUNCIONAL", tipo_servicio: "PRESENCIAL" } as any,
        { id: "10000000-0000-0000-0000-000000000004", alumno_id: A_BAJA, dia_vencimiento: 5, fecha_inicio: formatOffset(-90), fecha_fin: formatOffset(-20), estado: "VENCIDA", plan_membresia_id: PLAN, actividad: "FUNCIONAL", tipo_servicio: "PRESENCIAL" } as any,
      ],
      pagos: [
        { contratacion_id: "10000000-0000-0000-0000-000000000002", alumno_id: A_6D, monto: 15000, medio_pago: "TRANSFERENCIA", estado: "CONFIRMADO", confirmado_at: new Date().toISOString() } as any,
        { contratacion_id: "10000000-0000-0000-0000-000000000002", alumno_id: A_6D, monto: 5000, medio_pago: "EFECTIVO", estado: "CONFIRMADO", confirmado_at: new Date().toISOString() } as any,
        { contratacion_id: "10000000-0000-0000-0000-000000000002", alumno_id: A_6D, monto: 99999, medio_pago: "EFECTIVO", estado: "PENDIENTE", confirmado_at: null } as any,
        { contratacion_id: "10000000-0000-0000-0000-000000000002", alumno_id: A_6D, monto: 88888, medio_pago: "EFECTIVO", estado: "RECHAZADO", confirmado_at: null } as any,
        { contratacion_id: "10000000-0000-0000-0000-000000000001", alumno_id: A_8D, monto: 7000, medio_pago: "EFECTIVO", estado: "CONFIRMADO", confirmado_at: mesPrevio } as any,
      ],
      dias: [],
      ejerciciosEnRutina: [],
      ejercicios: [],
      historial: {},
    };
    const seedPlanes = [{ id: PLAN, nombre: "Trimestral", cantidad_actividades: 1, duracion_meses: 3, precio: 30000 } as any];

    const r = await como<Kpis>("authenticated", ADMIN, KPIS);
    const periodo = calcularPeriodoMesEnCurso(ahora);
    const kpisRpc = mapearRpcAKpis(r.rows[0]!, periodo.mesAnteriorLabel, "ADMIN");
    const kpisDemo = derivarKpisNegocio(seedGimnasio, seedPlanes, ahora);

    expect(kpisRpc).toEqual(kpisDemo);
  });

  it("GIVEN 3 pagos confirmados, 1 cuota por vencer y 2 vencidas THEN cobrado, porCobrar, vencido, facturado y tasaCobroPct dan los valores matemáticos esperados", () => {
    const dataset: DemoGimnasio = {
      alumnos: [
        { id: "al-1", rol: "ALUMNO", estado_membresia: "ACTIVA" },
        { id: "al-2", rol: "ALUMNO", estado_membresia: "ACTIVA" },
        { id: "al-3", rol: "ALUMNO", estado_membresia: "ACTIVA" },
      ] as any,
      planes: [],
      contrataciones: [
        // 1 cuota por vencer ($15.000)
        { id: "c-1", alumno_id: "al-1", plan_membresia_id: "p-1", fecha_fin: "2026-10-25", estado: "VIGENTE" } as any,
        // 2 cuotas vencidas ($10.000 y $15.000 -> $25.000)
        { id: "c-2", alumno_id: "al-2", plan_membresia_id: "p-2", fecha_fin: "2026-10-10", estado: "VENCIDA" } as any,
        { id: "c-3", alumno_id: "al-3", plan_membresia_id: "p-1", fecha_fin: "2026-10-05", estado: "VENCIDA" } as any,
      ],
      pagos: [
        // 3 pagos confirmados ($10.000, $20.000, $30.000 -> $60.000)
        { contratacion_id: "c-1", monto: 10000, estado: "CONFIRMADO", confirmado_at: "2026-10-15T12:00:00Z" } as any,
        { contratacion_id: "c-1", monto: 20000, estado: "CONFIRMADO", confirmado_at: "2026-10-16T12:00:00Z" } as any,
        { contratacion_id: "c-1", monto: 30000, estado: "CONFIRMADO", confirmado_at: "2026-10-17T12:00:00Z" } as any,
      ],
      dias: [],
      ejerciciosEnRutina: [],
      ejercicios: [],
      historial: {},
    };
    const planes = [
      { id: "p-1", duracion_meses: 1, precio: 15000 },
      { id: "p-2", duracion_meses: 1, precio: 10000 },
    ] as any;

    const fechaCorte = new Date("2026-10-25T12:00:00Z");
    const kpis = derivarKpisNegocio(dataset, planes, fechaCorte);

    expect(kpis.cobrado).toBe(60000);
    expect(kpis.porCobrar).toBe(15000);
    expect(kpis.vencido).toBe(25000);
    expect(kpis.facturado).toBe(100000);
    expect(kpis.tasaCobroPct).toBe(60);
  });

  it("GIVEN rol ENTRENADOR WHEN se llama obtenerKpisNegocio THEN los montos vienen null y puedeVerMontos devuelve false", async () => {
    expect(puedeVerMontos("ENTRENADOR")).toBe(false);
    expect(puedeVerMontos("coach")).toBe(false);
    expect(puedeVerMontos("ADMIN")).toBe(true);

    const rCoach = await como<Kpis>("authenticated", COACH, KPIS);
    const kpis = mapearRpcAKpis(rCoach.rows[0]!, "sept.", "ENTRENADOR");

    expect(kpis.cobrado).toBeNull();
    expect(kpis.porCobrar).toBeNull();
    expect(kpis.vencido).toBeNull();
    expect(kpis.facturado).toBeNull();
    expect(kpis.tasaCobroPct).toBeNull();
    expect(kpis.ingresos_mes).toBeNull();
    expect(kpis.ingresos_presencial).toBeNull();
    expect(kpis.ingresos_online).toBeNull();
    expect(kpis.ingresos_variacion_pct).toBeNull();
    expect(kpis.a_cobrar).toBeNull();
    expect(kpis.cobranza_pct).toBeNull();
    expect(kpis.cobranza_faltante).toBeNull();

    // Las métricas operativas se preservan
    expect(kpis.alumnos_activos).toBe(3);
    expect(kpis.alumnosAlDia).toBe(2);
    expect(kpis.alumnosMorosos).toBe(1);

    // Vía helper obtenerKpisNegocio directamente con rol
    const kpisDirecto = await obtenerKpisNegocio({
      row: rCoach.rows[0]!,
      rol: "ENTRENADOR",
      mesAnteriorLabel: "sept.",
    });
    expect(kpisDirecto.cobrado).toBeNull();
    expect(kpisDirecto.facturado).toBeNull();
    expect(kpisDirecto.alumnos_activos).toBe(3);
  });

  it("GIVEN rangoPeriodo('mes', fecha) THEN desde = primer dia del mes, hasta = ultimo dia del mes (hora AR)", () => {
    const fecha = new Date("2026-10-15T15:00:00Z");
    const rango = rangoPeriodo("mes", fecha);
    expect(rango.desde).toBe("2026-10-01");
    expect(rango.hasta).toBe("2026-10-31");

    // Fecha en hora peligrosa UTC que en Argentina es el día anterior
    const fechaPeligrosa = new Date("2026-11-01T01:30:00Z"); // 22:30 del 31/10 en AR
    const rangoPeligroso = rangoPeriodo("mes", fechaPeligrosa);
    expect(rangoPeligroso.desde).toBe("2026-10-01");
    expect(rangoPeligroso.hasta).toBe("2026-10-31");

    // Mes de febrero (bisiesto vs común)
    const feb2024 = new Date("2024-02-10T12:00:00Z");
    expect(rangoPeriodo("mes", feb2024)).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" });
    const feb2026 = new Date("2026-02-10T12:00:00Z");
    expect(rangoPeriodo("mes", feb2026)).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });

  // 02:30 UTC del 23/10 = 23:30 del 22/10 en Argentina: CURRENT_DATE (UTC) y la fecha
  // local difieren. Los fixtures y p_hasta salen de la fecha local, así que el resultado no cambia.
  it("da los mismos números con el reloj en una hora peligrosa (02:30 UTC)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-23T02:30:00Z"));
    try {
      const peligrosa = await montarDb();
      const hora = await peligrosa.query<{ utc: string; ar: string }>(
        `SELECT (now() AT TIME ZONE 'UTC')::date::text AS utc, (${HOY_AR})::text AS ar`,
      );
      expect(hora.rows[0]).toEqual({ utc: "2026-10-23", ar: "2026-10-22" });
      const dbPrevia = db;
      db = peligrosa;
      try {
        const k = (await como<Kpis>("authenticated", ADMIN, KPIS)).rows[0]!;
        expect(Number(k.ingresos)).toBe(20000);
        expect(Number(k.cobranza_pendiente_monto)).toBe(20000);
        expect(Number(k.cobranza_esperada)).toBe(40000);
        expect(Number(k.cobranza_vencidas_cant)).toBe(1);
        expect([...k.sin_entrenar_7d_ids].sort()).toEqual([A_8D, A_NUNCA].sort());
      } finally {
        db = dbPrevia;
      }
    } finally {
      vi.useRealTimers();
    }
  }, 60_000);
});
