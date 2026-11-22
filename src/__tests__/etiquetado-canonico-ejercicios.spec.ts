import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { type PGlite } from "@electric-sql/pglite";
import { aplicarMigracion, crearDbMigrada } from "./helpers/pglite-migrada";

// GOZS-425: migración de etiquetas canónicas + coach renombrado, sobre PGlite.
const SUPABASE_DIR = path.resolve(__dirname, "../../supabase");
const COACH = "20685bca-6304-4e55-abba-37a1cf8f6113";
const CANON = ["Pecho", "Espalda", "Piernas", "Hombros", "Brazos", "Core"];
const MIG = "20261108170000_etiquetado_canonico_ejercicios.sql";

let db: PGlite;
const exec = (sql: string) => aplicarMigracion(db, sql);

describe("GOZS-425: etiquetado canónico", () => {
  beforeAll(async () => {
    db = await crearDbMigrada();
    await exec(fs.readFileSync(path.join(SUPABASE_DIR, "seed_gozs.sql"), "utf-8"));
    // Simula entorno legado: sin etiquetas, un valor legado y coach con nombre anterior.
    await db.exec(`UPDATE public.ejercicios SET musculos_principales = '{}';
      UPDATE public.ejercicios SET musculos_principales = '{Biceps}' WHERE nombre = 'Curl 45°';
      INSERT INTO public.ejercicios (nombre, musculos_principales) VALUES ('Extra legado', '{Cuadriceps,Isquio}');
      UPDATE public.perfiles SET nombre_completo='Profesor Titular X', email='x@gozster.local' WHERE id='${COACH}';
      UPDATE auth.users SET email='x@gozster.local' WHERE id='${COACH}'`);
  }, 120_000);

  it("etiqueta todo el catálogo con valores canónicos, es idempotente y renombra al coach", async () => {
    const mig = fs.readFileSync(path.join(SUPABASE_DIR, "migrations", MIG), "utf-8");
    await exec(mig);
    await exec(mig);
    const vacios = await db.query<{ n: number }>(`SELECT count(*)::int n FROM public.ejercicios WHERE musculos_principales = '{}'`);
    expect(vacios.rows[0]!.n).toBe(0);
    const vals = await db.query<{ v: string }>(`SELECT DISTINCT unnest(musculos_principales) v FROM public.ejercicios`);
    expect(vals.rows.map((r) => r.v).every((v) => CANON.includes(v))).toBe(true);
    const legado = await db.query<{ m: string[] }>(`SELECT musculos_principales m FROM public.ejercicios WHERE nombre='Extra legado'`);
    expect(legado.rows[0]!.m).toEqual(["Piernas"]);
    const p = await db.query<{ nombre_completo: string; email: string }>(`SELECT nombre_completo, email FROM public.perfiles WHERE id='${COACH}'`);
    expect(p.rows[0]!).toEqual({ nombre_completo: "Profesor Titular GOZS", email: "coach.gozs@gozster.local" });
    const u = await db.query<{ email: string }>(`SELECT email FROM auth.users WHERE id='${COACH}'`);
    expect(u.rows[0]!.email).toBe("coach.gozs@gozster.local");
  });

  it("no queda 'Mynter' en seeds", () => {
    for (const f of ["seed_gozs.sql", "seed_tester.sql"]) {
      expect(fs.readFileSync(path.join(SUPABASE_DIR, f), "utf-8")).not.toMatch(/mynter/i);
    }
  });
});
