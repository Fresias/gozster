#!/usr/bin/env node
// Bootstrap del overlay (H-10): escribe `harness/` en un repo con package.json
// a partir de las plantillas del core. La conversación vive en SKILL.md; este
// script solo materializa las respuestas.
//
// node bootstrap.mjs [repoDir] [--name X] [--gate "cmd"]
//                    [--domain X --domain-description "..." --autotrigger "..."]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kitDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const templates = path.join(kitDir, "core", "templates");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const opts = {};
const positional = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) opts[argv[i].slice(2)] = argv[++i] ?? "";
  else positional.push(argv[i]);
}

const repoDir = path.resolve(positional[0] ?? process.cwd());
const overlayDir = path.join(repoDir, "harness");

let pkg;
try {
  pkg = JSON.parse(readFileSync(path.join(repoDir, "package.json"), "utf8"));
} catch {
  fail("missing or invalid package.json");
}
if (existsSync(path.join(overlayDir, "project.json"))) fail("overlay already exists: harness/project.json");

// Gate por defecto: los scripts estándar que el package.json declare.
const scripts = pkg.scripts ?? {};
const gate =
  opts.gate ||
  ["test", "typecheck", "lint", "build"]
    .filter((s) => scripts[s])
    .map((s) => (s === "test" ? "npm test" : `npm run ${s}`))
    .join(" && ") ||
  "npm test";

/** Rellena `{clave}` con valores escapados para JSON/YAML de una línea. */
function render(template, values) {
  return readFileSync(path.join(templates, template), "utf8").replace(/{(\w+)}/g, (m, key) =>
    key in values ? JSON.stringify(String(values[key])).slice(1, -1) : m,
  );
}

const version = readFileSync(path.join(kitDir, "VERSION"), "utf8").trim();
const written = [];
function write(rel, content) {
  const full = path.join(overlayDir, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
  written.push(`harness/${rel}`);
}

write("harness.json", JSON.stringify({ kit: "harness-kit", version, out: ".harness" }, null, 2) + "\n");
write("project.json", render("project.json.tmpl", { project_name: opts.name || pkg.name || path.basename(repoDir), gate_command: gate }));

if (opts.domain) {
  write(
    `skills/${opts.domain}/SKILL.md`,
    render("domain-skill.SKILL.md.tmpl", {
      domain_name: opts.domain,
      domain_description: opts["domain-description"] ?? "",
      domain_autotrigger: opts.autotrigger ?? "",
      domain_rules: "- (pendiente: rutas a las fuentes de verdad del dominio)",
    }),
  );
}

process.stdout.write(`${written.join("\n")}\nnext: node harness-kit/core/scripts/harness-render.mjs\n`);
