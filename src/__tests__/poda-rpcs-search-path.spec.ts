import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { type PGlite } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada, MIGRATIONS_DIR } from "./helpers/pglite-migrada";

const MIGRATION_FILE = "20261122070000_poda_rpcs_y_search_path.sql";
const SRC_DIR = path.resolve(__dirname, "..");

const FUNCIONES_PODADAS = [
  "public.anotar_alumno(uuid, uuid)",
  "public.registrar_pago(uuid, numeric, text)",
  "public.registrar_pago_con_descuento(uuid, numeric, text, text)",
  "public.ingresos_mes(date)",
  "public.obtener_ranking_ejercicio(uuid)",
  "public.activar_rutina(uuid)",
  "public.actualizar_perfil_alumno(uuid, numeric, text)",
  "public.actualizar_peso_sexo_alumno(uuid, numeric, text)",
  "public.fecha_habilita_clases(date)",
  "public.obtener_ficha_alumno_actividades(uuid)",
];

const FUNCIONES_CONSERVADAS = [
  "public.clonar_plan_entrenamiento(uuid, text)",
  "public.extender_vigencia_plan(uuid, integer)",
  "public.transferir_conversacion_gozs(uuid, uuid, text)",
  "public.evaluar_vencimientos_contrataciones()",
  "public.registrar_y_confirmar_renovacion(uuid, numeric, text, text)",
  "public.extender_contratacion_excepcional(uuid, date, text)",
  "public.cancelar_clase(uuid, text)",
  "public.restaurar_filas_respaldo(text, jsonb)",
  "public.asignar_clase_fija(uuid, uuid)",
  "public.quitar_clase_fija(uuid)",
  "public.calcular_volumen_semanal(uuid, timestamp with time zone)",
  "public.detectar_sobrecarga_progresiva(uuid, uuid)",
  "public.obtener_records_historicos(uuid, uuid)",
  "public.obtener_metricas_retencion(uuid)",
  "public.contar_mensajes_no_leidos()",
  "public.registrar_pago(uuid, numeric, text, text)",
  "public.anotar_alumno_coach(uuid, uuid, boolean)",
  "public.obtener_kpis_negocio(date, date)",
];

function recolectarLlamadasRpcEnSrc(dir: string): string[] {
  const nombres = new Set<string>();
  function caminar(actual: string): void {
    for (const entry of fs.readdirSync(actual, { withFileTypes: true })) {
      const ruta = path.join(actual, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__") continue;
        caminar(ruta);
      } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        const src = fs.readFileSync(ruta, "utf8");
        const re = /\.rpc\s*(?:<[^>]*>)?\s*\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g;
        let match: RegExpExecArray | null;
        while ((match = re.exec(src)) !== null) {
          if (match[1]) nombres.add(match[1]);
        }
      }
    }
  }
  caminar(dir);
  return [...nombres].sort();
}

let db: PGlite;

describe("GOZS-691: poda de 10 RPCs sin uso y search_path fijo en triggers (PGlite)", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
  }, 120_000);

  it("la migración tiene versión posterior a 20261122020000 y es idempotente", async () => {
    expect(MIGRATION_FILE > "20261122020000_seguridad_perfiles_rol.sql").toBe(true);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_FILE), "utf-8");
    await expect(aplicarMigracion(db, sql)).resolves.toBeUndefined();
  });

  it("elimina exactamente las 10 RPCs podadas y conserva las funciones protegidas / analíticas", async () => {
    for (const sig of FUNCIONES_PODADAS) {
      const r = await db.query<{ oid: string | null }>(
        `SELECT to_regprocedure($1)::text AS oid`,
        [sig],
      );
      expect(r.rows[0]?.oid, sig).toBeNull();
    }

    for (const sig of FUNCIONES_CONSERVADAS) {
      const r = await db.query<{ oid: string | null }>(
        `SELECT to_regprocedure($1)::text AS oid`,
        [sig],
      );
      expect(r.rows[0]?.oid, sig).not.toBeNull();
    }
  });

  it("todas las llamadas .rpc( en src/ existen en la base", async () => {
    const rpcsApp = recolectarLlamadasRpcEnSrc(SRC_DIR);
    expect(rpcsApp.length).toBeGreaterThanOrEqual(24);

    const res = await db.query<{ proname: string }>(
      `SELECT DISTINCT p.proname
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = ANY($1::text[])`,
      [rpcsApp],
    );
    const enBase = new Set(res.rows.map((r) => r.proname));
    const faltantes = rpcsApp.filter((nombre) => !enBase.has(nombre));
    expect(faltantes).toEqual([]);
  });

  it("fija search_path = public en las 3 funciones trigger y no deja funciones propias mutables", async () => {
    const res = await db.query<{ proname: string; proconfig: string[] | null }>(
      `SELECT p.proname, p.proconfig
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND NOT EXISTS (
           SELECT 1 FROM pg_depend d
           WHERE d.objid = p.oid AND d.deptype = 'e'
         )
         AND (
           p.proconfig IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
           )
         )
       ORDER BY p.proname`,
    );
    expect(res.rows).toEqual([]);

    const triggers = await db.query<{ proname: string; proconfig: string[] | null }>(
      `SELECT p.proname, p.proconfig
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN (
           'handle_updated_at',
           'handle_conversacion_nuevo_mensaje',
           'rechazar_cambio_precio_historico'
         )
       ORDER BY p.proname`,
    );
    expect(triggers.rows).toHaveLength(3);
    for (const row of triggers.rows) {
      expect(row.proconfig).toContain("search_path=public");
    }
  });
});
