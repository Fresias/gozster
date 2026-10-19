import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import {
  TABLAS,
  exportarSnapshot,
  hashFilas,
  restaurarSnapshot,
  verificarRestauracion,
  verificarSnapshot,
  type DestinoRespaldo,
  type Fila,
  type FuenteRespaldo,
  type Snapshot,
} from "../../scripts/backup-restore-gozs.mjs";

// Issue #64 (ADR-005): respaldo recuperable verificado. Exporta un snapshot de
// una base GOZS real (PGlite + migraciones), lo restaura en una base vacía con
// la RPC restaurar_filas_respaldo y comprueba integridad e idempotencia.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

const COACH = "00000000-0000-0000-0000-00000000c0ac";
const ALUMNO = "00000000-0000-0000-0000-00000000000a";
const EJ = "20000000-0000-0000-0000-000000000001";
const PLAN = "20000000-0000-0000-0000-000000000002";
const DIA = "20000000-0000-0000-0000-000000000003";
const SESION = "20000000-0000-0000-0000-000000000004";
const CONV = "20000000-0000-0000-0000-000000000005";
const CONTRATO = "20000000-0000-0000-0000-000000000006";

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

const AUTH_USERS = `INSERT INTO auth.users (id, email) VALUES ('${COACH}','coach@t'),('${ALUMNO}','a@t');`;

// Datos que disparan triggers con efectos laterales: la sesión reescribe
// perfiles.ultimo_entreno_at y la serie con dolor crea alerta + historial.
const SEED = `
  INSERT INTO public.perfiles (id, email, nombre_completo, rol, profesor_asignado_id) VALUES
    ('${ALUMNO}','a@t','Alumno','ALUMNO','${COACH}'),
    ('${COACH}','coach@t','Coach','ENTRENADOR',NULL);
  INSERT INTO public.ejercicios (id, nombre, musculos_principales, creado_por)
    VALUES ('${EJ}','Sentadilla','{CUADRICEPS}','${COACH}');
  INSERT INTO public.entrenador_alumnos (entrenador_id, alumno_id, es_principal) VALUES ('${COACH}','${ALUMNO}',true);
  INSERT INTO public.planes_entrenamiento (id, profesor_id, alumno_id, nombre) VALUES ('${PLAN}','${COACH}','${ALUMNO}','Fuerza');
  INSERT INTO public.dias_rutina (id, plan_id, nombre, orden) VALUES ('${DIA}','${PLAN}','Día A',1);
  INSERT INTO public.ejercicios_en_rutina (dia_id, ejercicio_id, orden, series, repeticiones, rpe_objetivo)
    VALUES ('${DIA}','${EJ}',1,4,'8-10',8.5);
  INSERT INTO public.registro_sesiones (id, alumno_id, dia_id, fecha, volumen_total_kg)
    VALUES ('${SESION}','${ALUMNO}','${DIA}','2026-10-15 18:00:00+00',3200.50);
  INSERT INTO public.registro_series (sesion_id, ejercicio_id, numero_serie, peso_kg, reps_hechas, completada, pain_reported, pain_notes)
    VALUES ('${SESION}','${EJ}',1,100,8,true,false,NULL),
           ('${SESION}','${EJ}',2,100,6,true,true,'Molestia en rodilla');
  INSERT INTO public.conversaciones (id, alumno_id) VALUES ('${CONV}','${ALUMNO}');
  INSERT INTO public.mensajes (conversacion_id, remitente_id, contenido)
    VALUES ('${CONV}','${ALUMNO}','Hola equipo'),('${CONV}','${COACH}','Hola, ¿cómo va la rodilla?');
  INSERT INTO public.habitos_registros (alumno_id, fecha, agua_ml) VALUES ('${ALUMNO}','2026-10-15',2000);
  INSERT INTO public.nutricion_registros (alumno_id, fecha, proteinas_g) VALUES ('${ALUMNO}','2026-10-15',150);
  INSERT INTO public.contrataciones (id, alumno_id, dia_vencimiento, fecha_inicio, fecha_fin)
    VALUES ('${CONTRATO}','${ALUMNO}',10,'2026-09-10','2026-10-10');
`;

type Rol = "anon" | "authenticated" | "service_role";

async function crearBase(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  for (const archivo of fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8");
    const inicio = sql.search(/^BEGIN;/m);
    if (inicio > 0) {
      await db.exec(sql.slice(0, inicio));
      await db.exec(sql.slice(inicio));
    } else {
      await db.exec(sql);
    }
  }
  await db.exec(AUTH_USERS);
  return db;
}

function como<T>(db: PGlite, rol: Rol, sql: string, params: unknown[] = [], sub?: string) {
  return db.transaction(async (tx: Transaction) => {
    await tx.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub ? { sub, role: rol } : { role: rol }),
    ]);
    await tx.query(`SET LOCAL ROLE ${rol}`);
    return tx.query<T>(sql, params);
  });
}

/** Mismo contrato que el adaptador Supabase del script, sobre PGlite como service_role. */
function adaptador(db: PGlite): FuenteRespaldo & DestinoRespaldo {
  return {
    async leerTabla(nombre) {
      const existe = await db.query<{ t: string | null }>(`SELECT to_regclass($1)::text AS t`, [`public.${nombre}`]);
      if (!existe.rows[0]?.t) return null;
      const r = await como<{ fila: Fila }>(db, "service_role", `SELECT to_jsonb(t) AS fila FROM public.${nombre} t ORDER BY id`);
      return r.rows.map((x) => x.fila);
    },
    async restaurarFilas(nombre, filas) {
      const r = await como<{ n: number }>(
        db,
        "service_role",
        `SELECT public.restaurar_filas_respaldo($1, $2::jsonb) AS n`,
        [nombre, JSON.stringify(filas)]
      );
      return r.rows[0]!.n;
    },
  };
}

async function contar(db: PGlite, tabla: string): Promise<number> {
  const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${tabla}`);
  return r.rows[0]!.n;
}

function clonar(snapshot: Snapshot): Snapshot {
  return JSON.parse(JSON.stringify(snapshot)) as Snapshot;
}

describe("Issue #64: respaldo y restauración verificada (scripts/backup-restore-gozs.mjs)", () => {
  let origen: PGlite;
  let destino: PGlite;
  let snapshot: Snapshot;

  beforeAll(async () => {
    origen = await crearBase();
    await origen.exec(SEED);
    destino = await crearBase();
    snapshot = await exportarSnapshot(adaptador(origen));
  }, 120_000);

  it("el mapa de FKs del script coincide con pg_constraint y cubre todas las tablas de public", async () => {
    const r = await origen.query<{ tabla: string; columna: string; referida: string }>(`
      SELECT c.conrelid::regclass::text AS tabla, a.attname AS columna, c.confrelid::regclass::text AS referida
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
        AND c.confrelid::regclass::text NOT LIKE 'auth.%'`);
    const real: Record<string, Record<string, string>> = {};
    for (const { tabla, columna, referida } of r.rows) (real[tabla] ??= {})[columna] = referida;

    const existentes = await origen.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
    const nombres = new Set(TABLAS.map((t) => t.nombre));
    expect(existentes.rows.map((t) => t.tablename).filter((t) => !nombres.has(t))).toEqual([]);

    for (const { nombre, fks } of TABLAS) {
      if (!existentes.rows.some((t) => t.tablename === nombre)) continue;
      expect(fks, nombre).toEqual(real[nombre] ?? {});
    }

    // Orden de restauración: toda tabla referida aparece antes (salvo auto-referencias)
    const orden = TABLAS.map((t) => t.nombre);
    for (const { nombre, fks } of TABLAS) {
      for (const referida of Object.values(fks)) {
        if (referida !== nombre) expect(orden.indexOf(referida), `${nombre} -> ${referida}`).toBeLessThan(orden.indexOf(nombre));
      }
    }
  });

  it("exporta todas las tablas con conteo y sha256, y omite las opcionales inexistentes", () => {
    expect(snapshot.formato).toBe("gozs-backup");
    expect(snapshot.omitidas).toEqual([]);
    expect(snapshot.tablas.perfiles!.total).toBe(2);
    expect(snapshot.tablas.registro_series!.total).toBe(2);
    expect(snapshot.tablas.mensajes!.total).toBe(2);
    expect(snapshot.tablas.alertas_entrenador!.total).toBe(1);
    expect(snapshot.tablas.alumno_historial_dolor!.total).toBe(1);
    expect(snapshot.tablas.contrataciones!.total).toBe(1);
    expect(snapshot.tablas.perfiles!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(verificarSnapshot(snapshot)).toEqual({ ok: true, errores: [] });
  });

  it("detecta snapshots alterados: checksum, conteo e integridad referencial", () => {
    const alterado = clonar(snapshot);
    alterado.tablas.registro_series!.filas[0]!.peso_kg = 999;
    expect(verificarSnapshot(alterado).errores).toContain("registro_series: sha256 no coincide");

    const truncado = clonar(snapshot);
    truncado.tablas.mensajes!.filas.pop();
    expect(verificarSnapshot(truncado).errores).toContain("mensajes: 1 filas, se esperaban 2");

    // Snapshot consistente en checksums pero sin el día de rutina referido
    const huerfano = clonar(snapshot);
    huerfano.tablas.dias_rutina = { total: 0, sha256: hashFilas([]), filas: [] };
    const errores = verificarSnapshot(huerfano).errores;
    expect(errores.every((e) => e.includes("no existe en dias_rutina"))).toBe(true);
    expect(errores.some((e) => e.startsWith(`ejercicios_en_rutina.dia_id=${DIA} no existe en dias_rutina`))).toBe(true);
    expect(errores.some((e) => e.startsWith(`registro_sesiones.dia_id=${DIA} no existe en dias_rutina`))).toBe(true);
  });

  it("restaura en una base vacía, fila por fila idéntica y sin efectos laterales de triggers", async () => {
    const insertadas = await restaurarSnapshot(adaptador(destino), snapshot, { tamanoLote: 1 });
    for (const [nombre, tabla] of Object.entries(snapshot.tablas)) {
      expect(insertadas[nombre], nombre).toBe(tabla.total);
      expect(await contar(destino, nombre), nombre).toBe(tabla.total);
    }
    // La serie con dolor no generó una segunda alerta ni otro historial
    expect(await contar(destino, "alertas_entrenador")).toBe(1);
    expect(await contar(destino, "alumno_historial_dolor")).toBe(1);

    expect(await verificarRestauracion(adaptador(destino), snapshot)).toEqual({ ok: true, errores: [] });
  });

  it("es idempotente: restaurar dos veces no duplica ni modifica filas", async () => {
    const insertadas = await restaurarSnapshot(adaptador(destino), snapshot);
    expect(Object.values(insertadas).every((n) => n === 0)).toBe(true);
    expect(await verificarRestauracion(adaptador(destino), snapshot)).toEqual({ ok: true, errores: [] });

    const reexport = await exportarSnapshot(adaptador(destino));
    for (const [nombre, tabla] of Object.entries(snapshot.tablas)) {
      expect(reexport.tablas[nombre]!.sha256, nombre).toBe(tabla.sha256);
    }
  });

  it("los triggers de usuario quedan reactivados tras restaurar", async () => {
    const r = await destino.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM pg_trigger
      WHERE NOT tgisinternal AND tgenabled = 'D' AND tgrelid::regclass::text NOT LIKE 'auth.%'`);
    expect(r.rows[0]!.n).toBe(0);
  });

  it("verificarRestauracion detecta filas faltantes o distintas en el destino", async () => {
    await destino.exec(`UPDATE public.habitos_registros SET agua_ml = 1 WHERE alumno_id = '${ALUMNO}'`);
    const { ok, errores } = await verificarRestauracion(adaptador(destino), snapshot);
    expect(ok).toBe(false);
    expect(errores.some((e) => e.startsWith("habitos_registros: la fila"))).toBe(true);
  });

  it("restaurar_filas_respaldo es exclusiva de service_role y de las tablas de GOZS", async () => {
    const llamada = `SELECT public.restaurar_filas_respaldo('perfiles', '[]'::jsonb)`;
    await expect(como(destino, "authenticated", llamada, [], COACH)).rejects.toThrow(/permission denied/);
    await expect(como(destino, "anon", llamada)).rejects.toThrow(/permission denied/);
    await expect(
      como(destino, "service_role", `SELECT public.restaurar_filas_respaldo('pg_authid', '[]'::jsonb)`)
    ).rejects.toThrow(/no restaurable/);
  });

  it("rechaza restaurar un snapshot inválido sin escribir nada", async () => {
    const vacio = await crearBase();
    const alterado = clonar(snapshot);
    alterado.tablas.pagos!.total = 5;
    await expect(restaurarSnapshot(adaptador(vacio), alterado)).rejects.toThrow(/Snapshot inválido/);
    expect(await contar(vacio, "perfiles")).toBe(0);
  }, 60_000);
});
