#!/usr/bin/env node
/**
 * scripts/check-supabase-migrations.mjs
 * Verifica que todas las migraciones versionadas en supabase/migrations/
 * estén aplicadas en la base de datos destino antes de desplegar a producción.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MIGRATIONS_DIR = path.resolve(here, "..", "supabase", "migrations");
export const X1_MIGRATION_VERSION = "20261016100000";

/** Lista las migraciones locales `.sql` ordenadas por versión. */
export function listarVersionesLocales(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  if (!existsSync(migrationsDir)) {
    throw new Error(`No existe el directorio de migraciones: ${migrationsDir}`);
  }
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      version: file.split("_")[0] ?? file,
      file,
    }));
}

function normalizarFilaJson(entry) {
  if (!entry || typeof entry !== "object") return null;
  const local = String(entry.local ?? entry.Local ?? "").trim();
  const remote = String(entry.remote ?? entry.Remote ?? "").trim();
  if (!local && !remote) return null;
  return { local, remote };
}

/**
 * Parsea la salida de `supabase migration list` en formato JSON (array o NDJSON)
 * o tabla de texto (`Local | Remote | Time (UTC)`). Falla cerrado si está vacía.
 */
export function parsearSalidaMigrationList(rawOutput) {
  const texto = String(rawOutput ?? "").trim();
  if (!texto) {
    throw new Error("La salida de `supabase migration list` está vacía.");
  }

  // 1. Intentar formato JSON (array o NDJSON)
  if (texto.startsWith("[") || texto.startsWith("{")) {
    try {
      const parsed = JSON.parse(texto);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const filas = items.map(normalizarFilaJson).filter(Boolean);
      if (filas.length > 0) return filas;
    } catch {
      const ndjson = [];
      let allLinesValid = true;
      for (const line of texto.split(/\r?\n/)) {
        const clean = line.trim();
        if (!clean) continue;
        try {
          const obj = JSON.parse(clean);
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const row = normalizarFilaJson(item);
              if (row) ndjson.push(row);
            }
          } else {
            const row = normalizarFilaJson(obj);
            if (row) ndjson.push(row);
          }
        } catch {
          allLinesValid = false;
          break;
        }
      }
      if (allLinesValid && ndjson.length > 0) return ndjson;
    }
  }

  // 2. Fallback: salida tabular de `supabase migration list`
  const filas = [];
  const versionRe = /^\d{8,}$/;
  for (const line of texto.split(/\r?\n/)) {
    if (!line.includes("|")) continue;
    const cols = line.split("|").map((c) => c.trim());
    if (cols.length < 2) continue;
    const local = cols[0] ?? "";
    const remote = cols[1] ?? "";
    if (!versionRe.test(local) && !versionRe.test(remote)) continue;
    filas.push({ local, remote });
  }

  if (filas.length === 0) {
    throw new Error("No se pudieron interpretar filas de `supabase migration list`.");
  }
  return filas;
}

/** Compara migraciones locales contra las aplicadas en el destino. */
export function evaluarParidadMigraciones({ locales, registrosRemotos }) {
  const remotasAplicadas = new Set(
    registrosRemotos.map((r) => String(r.remote ?? "").trim()).filter(Boolean)
  );
  const versionesLocales = new Set(locales.map((m) => m.version));

  const pendientes = locales.filter((m) => !remotasAplicadas.has(m.version));
  const soloRemotas = [...remotasAplicadas].filter((v) => !versionesLocales.has(v)).sort();

  return {
    ok: pendientes.length === 0,
    pendientes,
    soloRemotas,
    aplicadas: locales.length - pendientes.length,
    totalLocales: locales.length,
  };
}

/** Formatea el detalle de error cuando existen migraciones sin aplicar en destino. */
export function formatearReporteError(resultado) {
  const lines = [
    `DEPLOY BLOQUEADO: hay ${resultado.pendientes.length} migración(es) del repo sin aplicar en la base de datos destino (${resultado.aplicadas}/${resultado.totalLocales} aplicadas).`,
    "Migraciones pendientes:",
    ...resultado.pendientes.map((m) => `  - ${m.file} (versión ${m.version})`),
    "Aplicá las migraciones con `supabase db push` antes de desplegar.",
  ];

  if (resultado.pendientes.some((m) => m.version === X1_MIGRATION_VERSION)) {
    lines.push(
      `Nota X1 (${X1_MIGRATION_VERSION}): si \`supabase db push\` falla por \`ALTER TYPE ... ADD VALUE\` en una única transacción, ejecutá previamente los \`ALTER TYPE public.estado_membresia ADD VALUE IF NOT EXISTS ...\` según docs/architecture/migraciones-supabase.md y reintentá \`supabase db push\`.`
    );
  }

  return lines.join("\n");
}

function parseArgs(argv) {
  const opts = {
    inputFile: "",
    remote: "",
    password: "",
    migrationsDir: DEFAULT_MIGRATIONS_DIR,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input-file" && argv[i + 1]) {
      opts.inputFile = argv[++i];
    } else if (arg.startsWith("--input-file=")) {
      opts.inputFile = arg.slice("--input-file=".length);
    } else if (arg === "--remote" && argv[i + 1]) {
      opts.remote = argv[++i];
    } else if (arg.startsWith("--remote=")) {
      opts.remote = arg.slice("--remote=".length);
    } else if (arg === "--password" && argv[i + 1]) {
      opts.password = argv[++i];
    } else if (arg.startsWith("--password=")) {
      opts.password = arg.slice("--password=".length);
    } else if (arg === "--migrations-dir" && argv[i + 1]) {
      opts.migrationsDir = path.resolve(argv[++i]);
    } else if (arg.startsWith("--migrations-dir=")) {
      opts.migrationsDir = path.resolve(arg.slice("--migrations-dir=".length));
    }
  }

  return opts;
}

function obtenerSalidaSupabaseCli(opts) {
  const args = ["migration", "list", "--output-format", "json"];
  if (opts.remote) {
    args.push(`--remote=${opts.remote}`);
  } else {
    args.push("--remote");
  }
  if (opts.password) {
    args.push("--password", opts.password);
  }

  return execFileSync("supabase", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function ejecutarCheckMigraciones(argv = process.argv.slice(2), deps = {}) {
  const opts = parseArgs(argv);
  const locales = listarVersionesLocales(opts.migrationsDir);

  if (locales.length === 0) {
    throw new Error(`No se encontraron migraciones .sql en ${opts.migrationsDir}`);
  }

  const rawOutput = opts.inputFile
    ? readFileSync(opts.inputFile, "utf8")
    : (deps.obtenerSalida ?? obtenerSalidaSupabaseCli)(opts);

  const registrosRemotos = parsearSalidaMigrationList(rawOutput);
  const resultado = evaluarParidadMigraciones({ locales, registrosRemotos });
  return { resultado, locales };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    const { resultado } = ejecutarCheckMigraciones();
    if (!resultado.ok) {
      console.error(formatearReporteError(resultado));
      process.exit(1);
    }
    console.log(
      `OK: ${resultado.aplicadas}/${resultado.totalLocales} migraciones del repo aplicadas en destino.`
    );
    if (resultado.soloRemotas.length > 0) {
      console.warn(
        `Aviso: hay ${resultado.soloRemotas.length} migración(es) solo en remoto: ${resultado.soloRemotas.join(", ")}`
      );
    }
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`DEPLOY BLOQUEADO: error verificando migraciones: ${message}`);
    process.exit(1);
  }
}
