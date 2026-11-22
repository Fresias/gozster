#!/usr/bin/env node
/**
 * scripts/check-supabase-types.mjs
 * Verifica que types/database.types.ts coincida exactamente con la salida de
 * `supabase gen types typescript --local --schema public`.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TYPES_PATH = path.resolve(here, "..", "types", "database.types.ts");
export const DEFAULT_SCHEMA = "public";
const MAX_DIFF_LINES = 25;

/** Normaliza saltos de línea (LF) y elimina espacios finales por línea para evitar falsos positivos CRLF/LF. */
export function normalizarContenidoTipos(contenido) {
  const texto = String(contenido ?? "").replace(/\r\n/g, "\n").trim();
  return texto ? `${texto}\n` : "";
}

/** Compara el archivo versionado contra la salida generada por `supabase gen types`. */
export function compararTiposGenerados({ versionado, generado }) {
  const normGenerado = normalizarContenidoTipos(generado);
  if (!normGenerado) {
    throw new Error("La salida de `supabase gen types` está vacía.");
  }
  if (!normGenerado.includes("export type Database") && !normGenerado.includes("export interface Database")) {
    throw new Error("La salida de `supabase gen types` no contiene el tipo `Database`.");
  }

  const normVersionado = normalizarContenidoTipos(versionado);
  if (normVersionado === normGenerado) {
    return {
      ok: true,
      diferencias: [],
      totalLineasVersionado: normVersionado.split("\n").length,
      totalLineasGenerado: normGenerado.split("\n").length,
    };
  }

  const lineasVer = normVersionado.split("\n");
  const lineasGen = normGenerado.split("\n");
  const maxLen = Math.max(lineasVer.length, lineasGen.length);
  const diferencias = [];

  for (let i = 0; i < maxLen; i++) {
    const a = lineasVer[i];
    const b = lineasGen[i];
    if (a !== b) {
      diferencias.push({
        linea: i + 1,
        versionado: a ?? "<EOF>",
        generado: b ?? "<EOF>",
      });
    }
  }

  return {
    ok: false,
    diferencias,
    totalLineasVersionado: lineasVer.length,
    totalLineasGenerado: lineasGen.length,
  };
}

/** Formatea el reporte cuando `types/database.types.ts` está desactualizado respecto a las migraciones. */
export function formatearReporteErrorTipos(resultado, typesPath = DEFAULT_TYPES_PATH) {
  const muestra = resultado.diferencias.slice(0, MAX_DIFF_LINES);
  const lines = [
    `TYPES DESINCRONIZADOS: ${path.basename(typesPath)} (${resultado.totalLineasVersionado} líneas) difiere del esquema generado (${resultado.totalLineasGenerado} líneas; ${resultado.diferencias.length} línea(s) distintas).`,
    "Primeras diferencias detectadas:",
    ...muestra.flatMap((d) => [
      `  L${d.linea} - versionado: ${d.versionado}`,
      `  L${d.linea} + generado:   ${d.generado}`,
    ]),
  ];
  if (resultado.diferencias.length > MAX_DIFF_LINES) {
    lines.push(`  ... (${resultado.diferencias.length - MAX_DIFF_LINES} diferencia(s) adicionales)`);
  }
  lines.push(
    "Regenerá los tipos tras aplicar las migraciones con: npx supabase start && npx supabase gen types typescript --local --schema public > types/database.types.ts"
  );
  return lines.join("\n");
}

function parseArgs(argv) {
  const opts = {
    typesFile: DEFAULT_TYPES_PATH,
    inputFile: "",
    schema: DEFAULT_SCHEMA,
    remote: "",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--types-file" && argv[i + 1]) {
      opts.typesFile = path.resolve(argv[++i]);
    } else if (arg.startsWith("--types-file=")) {
      opts.typesFile = path.resolve(arg.slice("--types-file=".length));
    } else if (arg === "--input-file" && argv[i + 1]) {
      opts.inputFile = path.resolve(argv[++i]);
    } else if (arg.startsWith("--input-file=")) {
      opts.inputFile = path.resolve(arg.slice("--input-file=".length));
    } else if (arg === "--schema" && argv[i + 1]) {
      opts.schema = argv[++i];
    } else if (arg.startsWith("--schema=")) {
      opts.schema = arg.slice("--schema=".length);
    } else if (arg === "--remote" && argv[i + 1]) {
      opts.remote = argv[++i];
    } else if (arg.startsWith("--remote=")) {
      opts.remote = arg.slice("--remote=".length);
    }
  }

  return opts;
}

function obtenerSalidaSupabaseGenTypes(opts) {
  const args = ["gen", "types", "typescript", "--schema", opts.schema];
  if (opts.remote) {
    args.push(`--remote=${opts.remote}`);
  } else {
    args.push("--local");
  }

  try {
    return execFileSync("supabase", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if (err && typeof err === "object" && err.code === "ENOENT") {
      const npxBin = process.platform === "win32" ? "npx.cmd" : "npx";
      return execFileSync(npxBin, ["supabase", ...args], {
        encoding: "utf8",
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    }
    throw err;
  }
}

export function ejecutarCheckTipos(argv = process.argv.slice(2), deps = {}) {
  const opts = parseArgs(argv);
  if (!existsSync(opts.typesFile)) {
    throw new Error(`No existe el archivo de tipos versionado: ${opts.typesFile}`);
  }

  const versionado = readFileSync(opts.typesFile, "utf8");
  const generado = opts.inputFile
    ? readFileSync(opts.inputFile, "utf8")
    : (deps.obtenerSalida ?? obtenerSalidaSupabaseGenTypes)(opts);

  const resultado = compararTiposGenerados({ versionado, generado });
  return { resultado, opts };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  try {
    const { resultado, opts } = ejecutarCheckTipos();
    if (!resultado.ok) {
      console.error(formatearReporteErrorTipos(resultado, opts.typesFile));
      process.exit(1);
    }
    console.log(
      `OK: ${path.basename(opts.typesFile)} (${resultado.totalLineasGenerado} líneas) coincide sin diferencias con \`supabase gen types\`.`
    );
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`CHECK FALLIDO: error verificando tipos de Supabase: ${message}`);
    process.exit(1);
  }
}
