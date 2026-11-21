import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

declare module "vitest" {
  export interface ProvidedContext {
    pgliteSnapshotPath: string;
  }
}

export const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

export const STUBS = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY,
    instance_id uuid,
    aud text,
    role text,
    email text,
    encrypted_password text,
    email_confirmed_at timestamptz,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  $$;
  GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

/** Aplica una migración SQL en PGlite separando sentencias previas a `BEGIN;` (p. ej. ALTER TYPE ... ADD VALUE). */
export async function aplicarMigracion(db: PGlite, sql: string): Promise<void> {
  const inicio = sql.search(/^BEGIN;/m);
  if (inicio > 0) {
    await db.exec(sql.slice(0, inicio));
    await db.exec(sql.slice(inicio));
  } else {
    await db.exec(sql);
  }
}

/** Lista ordenada de archivos `.sql` en `migrationsDir` (por defecto `supabase/migrations/`). */
export function listarMigraciones(migrationsDir = MIGRATIONS_DIR): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Lee la versión instalada de `@electric-sql/pglite` para invalidar el snapshot al actualizarla. */
function obtenerVersionPglite(): string {
  try {
    const pkgPath = path.resolve(__dirname, "../../../node_modules/@electric-sql/pglite/package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Hash determinista de la versión de PGlite + `STUBS` + migraciones para invalidar el snapshot. */
export function calcularHashSnapshot(migrationsDir = MIGRATIONS_DIR): string {
  const hash = createHash("sha256");
  hash.update(`pglite-${obtenerVersionPglite()}\n`);
  hash.update(STUBS);
  for (const archivo of listarMigraciones(migrationsDir)) {
    hash.update(`\n-- ${archivo}\n`);
    hash.update(fs.readFileSync(path.join(migrationsDir, archivo)));
  }
  return hash.digest("hex").slice(0, 16);
}

/** Ruta determinista en `os.tmpdir()` para el snapshot tar sin comprimir. */
export function rutaSnapshotParaHash(hash = calcularHashSnapshot()): string {
  return path.join(os.tmpdir(), `gozster-pglite-${hash}.tar`);
}

/** Construye desde cero una instancia PGlite con `STUBS` y todas las migraciones aplicadas en orden. */
export async function construirDbMigradaDesdeCero(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(STUBS);
  for (const archivo of listarMigraciones()) {
    await aplicarMigracion(db, fs.readFileSync(path.join(MIGRATIONS_DIR, archivo), "utf-8"));
  }
  return db;
}

let snapshotCache: { ruta: string; bytes: Uint8Array<ArrayBuffer> } | null = null;

/**
 * Crea una instancia PGlite lista con `STUBS` y todas las migraciones cargando el snapshot compartido
 * generado por `globalSetup` (o construyendo desde cero si no hay snapshot disponible).
 */
export async function crearDbMigrada(): Promise<PGlite> {
  let rutaSnapshot: string | undefined;
  let injectError: string | undefined;
  try {
    const { inject } = await import("vitest");
    rutaSnapshot = inject("pgliteSnapshotPath");
  } catch (err) {
    injectError = err instanceof Error ? err.message : String(err);
    rutaSnapshot = undefined;
  }

  if (rutaSnapshot && fs.existsSync(rutaSnapshot)) {
    if (!snapshotCache || snapshotCache.ruta !== rutaSnapshot) {
      snapshotCache = {
        ruta: rutaSnapshot,
        bytes: new Uint8Array(fs.readFileSync(rutaSnapshot)),
      };
    }
    return PGlite.create({
      extensions: { pgcrypto },
      loadDataDir: new Blob([snapshotCache.bytes]),
    });
  }

  console.warn(
    injectError
      ? `[pglite-migrada] inject("pgliteSnapshotPath") falló (${injectError}); reconstruyendo PGlite desde cero.`
      : `[pglite-migrada] Snapshot no disponible (${rutaSnapshot ?? "sin ruta"}); reconstruyendo PGlite desde cero.`,
  );
  return construirDbMigradaDesdeCero();
}
