#!/usr/bin/env node
// H-01 — carga y validación de los contratos de configuración del harness.
//
// Alcance de este issue: SOLO cargar `harness.json` + `project.json` del overlay
// y validar claves requeridas y tipos. El render completo (plantillas del core
// → `.harness/`) llega en H-03. Decisión P5 (cerrada): JSON sin dependencias —
// validador escrito a mano, sin YAML ni ajv/zod (Ponytail).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// El overlay por defecto es ../harness (hermano de harness-kit/). Un primer
// argumento opcional apunta a otro overlay (tests, otros proyectos).
const overlayDir = path.resolve(process.argv[2] ?? path.join(here, "..", "harness"));

// Contrato mínimo: clave requerida → tipo esperado ("string" | "array").
const SCHEMA = {
  "harness.json": { kit: "string", version: "string", out: "string" },
  "project.json": { name: "string", runtimes: "array", gate: "string" },
};

/** Falla con exit 1 y un mensaje estable en stderr. */
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

/** Tipo normalizado: distingue arrays de objetos. */
function typeOf(value) {
  return Array.isArray(value) ? "array" : typeof value;
}

/** Carga y parsea un JSON del overlay; exit 1 si falta o está corrupto. */
function load(file) {
  const full = path.join(overlayDir, file);
  let raw;
  try {
    raw = readFileSync(full, "utf8");
  } catch {
    return fail(`missing file: ${file}`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fail(`invalid json: ${file}`);
  }
}

/** Valida claves requeridas y sus tipos contra el contrato. */
function validate(file, config) {
  for (const [key, expected] of Object.entries(SCHEMA[file])) {
    if (!(key in config)) fail(`missing key: ${key}`);
    const actual = typeOf(config[key]);
    if (actual !== expected) {
      fail(`invalid type: ${key} (expected ${expected}, got ${actual})`);
    }
  }
}

for (const file of Object.keys(SCHEMA)) {
  validate(file, load(file));
}

process.stdout.write("harness config OK\n");
