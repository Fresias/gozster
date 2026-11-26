import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { type PGlite } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada } from "./helpers/pglite-migrada";
import type { Ejercicio, TablesInsert } from "@/types/database.types";

// GOZS-872: columna `usa_barra` en public.ejercicios + backfill 100% verificado.

const SUPABASE_DIR = path.resolve(__dirname, "../../supabase");
const MIG_FILENAME = "20261126120000_ejercicios_usa_barra.sql";
const MIG_PATH = path.join(SUPABASE_DIR, "migrations", MIG_FILENAME);

const BARRA_PRODUCCION_ESPERADOS = [
  "Estocadas Frontales con Barra",
  "Press militar parado con barra",
  "Press Plano con Barra",
  'Press Plano con Barra + Pausa (1",2",3")',
  "Remo con barra desde rack",
  "Remo Inclinado Agarre Prono con Barra",
  "Sentadilla bulgara 90° con barra",
  "Sentadilla con Barra",
  "Sentadilla Frontal agarre cruzado",
  "Sentadilla Paralela Barra Baja al Cajon",
  "Sentadilla sumo c/ barra",
].sort((a, b) => a.localeCompare(b, "es"));

const BARRA_SEED_LOCAL_ESPERADOS = [
  "Peso Muerto",
  "Press de Banca",
  "Press Militar",
  "Sentadilla",
].sort((a, b) => a.localeCompare(b, "es"));

const FALSOS_POSITIVOS_PROHIBIDOS = [
  "Jalón al pecho agarre neutro",
  "Extension de triceps barra V",
  "Press militar en guia",
  "Prensa 45°",
  "Hip thrust en maquina",
  "Camilla de Isquios",
  "Sillon de Cuadriceps",
  "Curl Concentrado",
  "Apertura de hombros c/ banda",
  "Curl de muñeca inverso",
  "Dominada al Pecho Supina",
  "Dominada isométrica",
  "Remo gorila",
  "Curl 45°",
  "Step Up Contralateral",
  "Skater con peso",
  "Press Frances con Barra EZ en Banco Plano",
  "Curl de muñeca con barra",
];

describe("GOZS-872: columna usa_barra en public.ejercicios", () => {
  let migSql: string;

  beforeAll(() => {
    migSql = fs.readFileSync(MIG_PATH, "utf-8");
  });

  it("la migración existe, define usa_barra BOOLEAN NOT NULL DEFAULT false, es idempotente y documenta casos de borde", () => {
    expect(fs.existsSync(MIG_PATH)).toBe(true);
    expect(migSql).toMatch(/ALTER\s+TABLE\s+public\.ejercicios[\s\S]*ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+usa_barra\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false/i);
    expect(migSql).toMatch(/usa_barra\s+IS\s+DISTINCT\s+FROM\s+true/i);
    expect(migSql).toContain("Press Frances con Barra EZ en Banco Plano");
    expect(migSql).toContain("Curl de muñeca con barra");
    expect(migSql).not.toMatch(/SET[\s\S]*musculos_principales\s*=/i);
  });

  it("sobre el catálogo completo de producción (89 ejercicios): marca únicamente los 11 con barra libre, sin falsos positivos ni cambios en musculos_principales", async () => {
    const db: PGlite = await crearDbMigrada();
    await db.exec(fs.readFileSync(path.join(SUPABASE_DIR, "seed_produccion.sql"), "utf-8"));

    // Verificar definición de columna en catálogo PostgreSQL
    const colInfo = await db.query<{
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(`
      SELECT data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ejercicios'
        AND column_name = 'usa_barra'
    `);
    expect(colInfo.rows).toHaveLength(1);
    expect(colInfo.rows[0]!.data_type).toBe("boolean");
    expect(colInfo.rows[0]!.is_nullable).toBe("NO");
    expect(colInfo.rows[0]!.column_default).toBe("false");

    // Guardar snapshot de musculos_principales y resetear usa_barra para probar el backfill real desde cero
    const musculosAntes = await db.query<{ id: string; musculos_principales: string[] }>(
      `SELECT id, musculos_principales FROM public.ejercicios ORDER BY id`
    );
    await db.exec(`UPDATE public.ejercicios SET usa_barra = false`);

    // Primera ejecución del backfill
    await aplicarMigracion(db, migSql);

    const marcados = await db.query<{ nombre: string; updated_at: string }>(
      `SELECT nombre, updated_at::text FROM public.ejercicios WHERE usa_barra = true`
    );
    const nombresMarcados = marcados.rows.map((r) => r.nombre).sort((a, b) => a.localeCompare(b, "es"));
    expect(nombresMarcados).toEqual(BARRA_PRODUCCION_ESPERADOS);

    // Ningún falso positivo puede quedar en true
    const falsos = await db.query<{ nombre: string; usa_barra: boolean }>(
      `SELECT nombre, usa_barra FROM public.ejercicios WHERE nombre = ANY($1::text[])`,
      [FALSOS_POSITIVOS_PROHIBIDOS]
    );
    expect(falsos.rows).toHaveLength(FALSOS_POSITIVOS_PROHIBIDOS.length);
    for (const fila of falsos.rows) {
      expect(fila.usa_barra, `Falso positivo detectado: ${fila.nombre}`).toBe(false);
    }

    // musculos_principales intactos
    const musculosDespues = await db.query<{ id: string; musculos_principales: string[] }>(
      `SELECT id, musculos_principales FROM public.ejercicios ORDER BY id`
    );
    expect(musculosDespues.rows).toEqual(musculosAntes.rows);

    // Segunda ejecución: 100% idempotente (no vuelve a tocar updated_at ni cambia filas)
    const timestampsAntes = new Map(marcados.rows.map((r) => [r.nombre, r.updated_at]));
    await aplicarMigracion(db, migSql);
    const marcadosSegunda = await db.query<{ nombre: string; updated_at: string }>(
      `SELECT nombre, updated_at::text FROM public.ejercicios WHERE usa_barra = true`
    );
    expect(marcadosSegunda.rows).toHaveLength(BARRA_PRODUCCION_ESPERADOS.length);
    for (const fila of marcadosSegunda.rows) {
      expect(fila.updated_at).toBe(timestampsAntes.get(fila.nombre));
    }

    // Nuevo ejercicio sin especificar usa_barra toma DEFAULT false y rechaza NULL
    const nuevo = await db.query<{ usa_barra: boolean }>(
      `INSERT INTO public.ejercicios (nombre, musculos_principales) VALUES ('Ejercicio Nuevo Test 872', ARRAY['Core']) RETURNING usa_barra`
    );
    expect(nuevo.rows[0]!.usa_barra).toBe(false);
    await expect(
      db.query(
        `INSERT INTO public.ejercicios (nombre, musculos_principales, usa_barra) VALUES ('Ejercicio Null 872', ARRAY['Core'], NULL)`
      )
    ).rejects.toThrow();
  }, 120_000);

  it("sobre el seed local (supabase/seed.sql): marca los 4 básicos de barra y mantiene máquinas/poleas/peso corporal en false", async () => {
    const db: PGlite = await crearDbMigrada();
    await db.exec(fs.readFileSync(path.join(SUPABASE_DIR, "seed.sql"), "utf-8"));

    const conBarra = await db.query<{ nombre: string }>(
      `SELECT nombre FROM public.ejercicios WHERE usa_barra = true`
    );
    expect(conBarra.rows.map((r) => r.nombre).sort((a, b) => a.localeCompare(b, "es"))).toEqual(
      BARRA_SEED_LOCAL_ESPERADOS
    );

    const sinBarra = await db.query<{ nombre: string }>(
      `SELECT nombre FROM public.ejercicios WHERE usa_barra = false`
    );
    expect(sinBarra.rows.map((r) => r.nombre).sort((a, b) => a.localeCompare(b, "es"))).toEqual(
      [
        "Dominadas",
        "Jalón al Pecho",
        "Plancha",
        "Prensa de Piernas",
        "Press de Pecho en Máquina",
        "Remo en Máquina",
      ].sort((a, b) => a.localeCompare(b, "es"))
    );

    // También funciona el backfill idempotente si ya estaban cargados con usa_barra = false
    await db.exec(`UPDATE public.ejercicios SET usa_barra = false`);
    await aplicarMigracion(db, migSql);
    const trasBackfill = await db.query<{ nombre: string }>(
      `SELECT nombre FROM public.ejercicios WHERE usa_barra = true`
    );
    expect(trasBackfill.rows.map((r) => r.nombre).sort((a, b) => a.localeCompare(b, "es"))).toEqual(
      BARRA_SEED_LOCAL_ESPERADOS
    );
  }, 120_000);

  it("sobre supabase/seed_gozs.sql (paridad GOZS-877): etiqueta con usa_barra = true exactamente los mismos 11 ejercicios de producción sin falsos positivos", async () => {
    const seedGozsSql = fs.readFileSync(path.join(SUPABASE_DIR, "seed_gozs.sql"), "utf-8");

    // Verificar contrato SQL en todos los INSERT INTO public.ejercicios y sus ON CONFLICT (nombre)
    const inserts = [...seedGozsSql.matchAll(/INSERT\s+INTO\s+public\.ejercicios\s*\(([^)]+)\)/g)];
    expect(inserts.length).toBeGreaterThan(0);
    for (const match of inserts) {
      expect(match[1]).toContain("usa_barra");
    }
    const onConflicts = [...seedGozsSql.matchAll(/ON\s+CONFLICT\s*\(nombre\)\s*DO\s+UPDATE\s+SET\s*([^\n;]+);/g)];
    expect(onConflicts).toHaveLength(inserts.length);
    for (const match of onConflicts) {
      expect(match[1]).toMatch(/usa_barra\s*=\s*EXCLUDED\.usa_barra/);
    }

    // Aplicar supabase/seed_gozs.sql sobre una base limpia migrada
    const db: PGlite = await crearDbMigrada();
    await db.exec(seedGozsSql);

    const conBarra = await db.query<{ nombre: string }>(
      `SELECT nombre FROM public.ejercicios WHERE usa_barra = true`
    );
    expect(conBarra.rows.map((r) => r.nombre).sort((a, b) => a.localeCompare(b, "es"))).toEqual(
      BARRA_PRODUCCION_ESPERADOS
    );

    // Ningún falso positivo presente en seed_gozs.sql puede quedar en true
    const falsos = await db.query<{ nombre: string; usa_barra: boolean }>(
      `SELECT nombre, usa_barra FROM public.ejercicios WHERE nombre = ANY($1::text[])`,
      [FALSOS_POSITIVOS_PROHIBIDOS]
    );
    expect(falsos.rows.length).toBeGreaterThan(0);
    for (const fila of falsos.rows) {
      expect(fila.usa_barra, `Falso positivo detectado en seed_gozs.sql: ${fila.nombre}`).toBe(false);
    }

    // Re-aplicar seed_gozs.sql tras invertir usa_barra valida el ON CONFLICT (nombre) DO UPDATE SET usa_barra = EXCLUDED.usa_barra
    await db.exec(`UPDATE public.ejercicios SET usa_barra = NOT usa_barra`);
    await db.exec(seedGozsSql);
    const trasReaplicar = await db.query<{ nombre: string }>(
      `SELECT nombre FROM public.ejercicios WHERE usa_barra = true`
    );
    expect(trasReaplicar.rows.map((r) => r.nombre).sort((a, b) => a.localeCompare(b, "es"))).toEqual(
      BARRA_PRODUCCION_ESPERADOS
    );
  }, 120_000);

  it("los tipos TypeScript exponen usa_barra?: boolean sin romper fixtures legados", () => {
    const legadoSinUsaBarra: Ejercicio = {
      id: "ej-1",
      nombre: "Press Plano con Barra",
      comentario: null,
      url_video: null,
      musculos_principales: ["Pecho"],
      musculos_secundarios: [],
      creado_por: null,
      created_at: "2026-11-26T00:00:00Z",
      updated_at: "2026-11-26T00:00:00Z",
    };
    const conUsaBarra: Ejercicio = { ...legadoSinUsaBarra, usa_barra: true };
    const insertPayload: TablesInsert<"ejercicios"> = {
      nombre: "Sentadilla con Barra",
      usa_barra: true,
    };
    expect(legadoSinUsaBarra.usa_barra).toBeUndefined();
    expect(conUsaBarra.usa_barra).toBe(true);
    expect(insertPayload.usa_barra).toBe(true);
  });
});
