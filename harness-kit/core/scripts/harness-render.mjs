#!/usr/bin/env node
// Harness compiler & drift checker (H-03).
//
// Renderiza los artefactos de cada runtime a partir de los contratos (D7: los
// archivos de runtime son artefactos generados, nadie los edita a mano).
// El flag `--check` detecta drift en la CI comparando byte a byte.
// Decisión P5: JSON sin dependencias externas (Ponytail).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..", "..");

/** Raíz del repo consumidor (misma convención que H-05: git rev-parse). */
function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: here, encoding: "utf8" }).trim();
  } catch {
    return path.resolve(kitDir, "..");
  }
}

// Argumentos CLI:
// `node harness-render.mjs [--check] [overlayDir]`
const args = process.argv.slice(2);
const checkMode = args.includes("--check");
const positionalArgs = args.filter((a) => !a.startsWith("--"));
const customOverlay = positionalArgs[0];
const defaultOverlay = path.join(repoRoot(), "harness");
const overlayDir = path.resolve(customOverlay ?? defaultOverlay);

// Si overlayDir es personalizado (ej. tests en directorio temporal),
// los artefactos se generan en la raíz correspondiente.
const isCustomOverlay = Boolean(customOverlay && path.resolve(customOverlay) !== defaultOverlay);
const targetRoot = isCustomOverlay
  ? (path.basename(overlayDir) === "harness" ? path.dirname(overlayDir) : overlayDir)
  : repoRoot();

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
  if (typeOf(config) !== "object" || config === null) {
    fail(`invalid json: ${file} (expected object)`);
  }
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

const harnessConfig = load("harness.json");
const projectConfig = load("project.json");

/** Lee un archivo y normaliza saltos de línea a LF. Retorna null si no existe. */
function readFileSafe(filePath) {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

/** Genera el hash sha256 canónico para el lockfile. */
function sha256(content) {
  return "sha256:" + createHash("sha256").update(content, "utf8").digest("hex");
}

// 1. Resolver adapters configurados o existentes
const adapters = Array.isArray(projectConfig.adapters)
  ? projectConfig.adapters
  : (existsSync(path.join(kitDir, "adapters", "multica")) ? ["multica"] : []);

// 2. Componer AGENTS.md en orden canónico: C1 -> C2 -> C4
// C1: systemprompt
let systemPrompt = readFileSafe(path.join(overlayDir, "systemprompt.md"));
if (!systemPrompt) {
  const tmpl = readFileSafe(path.join(kitDir, "core", "templates", "systemprompt.md.tmpl"));
  if (tmpl) {
    systemPrompt = tmpl
      .replace(/{project_name}/g, projectConfig.name)
      .replace(/{project_description}/g, projectConfig.description ?? "")
      .replace(/{framework}/g, projectConfig.framework ?? "Next.js 15")
      .replace(/{language}/g, projectConfig.language ?? "TypeScript")
      .replace(/{database}/g, projectConfig.database ?? "PostgreSQL")
      .replace(/{install_command}/g, "npm ci")
      .replace(/{dev_command}/g, "npm run dev")
      .replace(/{build_command}/g, "npm run build")
      .replace(/{test_command}/g, "npm test")
      .replace(/{test_single_command}/g, "npx vitest run <path/to/file.test.ts>")
      .replace(/{gate_command}/g, projectConfig.gate)
      .replace(/{repository_layout}/g, "")
      .replace(/{merge_owner}/g, "@PM");
  }
}

// C2: guardrails (core -> adapters -> local)
const coreGuardrails = readFileSafe(path.join(kitDir, "core", "guardrails.md"));
const adapterGuardrails = adapters
  .map((a) => readFileSafe(path.join(kitDir, "adapters", a, "guardrails.md")))
  .filter(Boolean);
const localGuardrails = readFileSafe(path.join(overlayDir, "guardrails.local.md"));

// C4: tool guidance (core -> adapters)
const coreToolGuidance = readFileSafe(path.join(kitDir, "core", "tool_guidance.md"));
const adapterToolGuidance = adapters
  .map((a) => readFileSafe(path.join(kitDir, "adapters", a, "tool_guidance.md")))
  .filter(Boolean);

const agentSections = [
  systemPrompt?.trimEnd(),
  coreGuardrails?.trimEnd(),
  ...adapterGuardrails.map((s) => s.trimEnd()),
  localGuardrails?.trimEnd(),
  coreToolGuidance?.trimEnd(),
  ...adapterToolGuidance.map((s) => s.trimEnd()),
].filter(Boolean);

const agentsMdContent = agentSections.join("\n\n") + "\n";

// Extraer displayName para settings respetando casing de systemprompt
let displayName = projectConfig.name;
if (systemPrompt) {
  const m = systemPrompt.match(/^#\s*([^\s—]+)/m);
  if (m && m[1]) displayName = m[1];
}

// 3. Preparar mapa de artefactos generados (relPath -> content)
const generatedArtifacts = new Map();
generatedArtifacts.set("AGENTS.md", agentsMdContent);

const runtimes = new Set(projectConfig.runtimes);

if (runtimes.has("claude-code")) {
  generatedArtifacts.set("CLAUDE.md", "@AGENTS.md\n");

  const claudeSettings = {
    permissions: {
      allow: [
        "Bash(git status *)",
        "Bash(git diff *)",
        "Bash(git log *)",
        "Bash(git show *)",
        "Bash(npx vitest run *)",
        "Bash(npm test *)",
        "Bash(npm run typecheck *)",
      ],
      ask: [
        "Bash(git push *)",
        "Bash(git commit *)",
        "Bash(npm install *)",
        "Bash(npm i *)",
      ],
      deny: [
        "Read(.env)",
        "Read(.env.local)",
        "Read(.env.production*)",
        "Read(package-lock.json)",
        "Read(**/*.pem)",
        "Read(**/*.key)",
        "Edit(.env*)",
        "Edit(.git/hooks/**)",
        "Edit(.claude/settings.json)",
        "Edit(.claude/hooks/**)",
        "Bash(git push --force *)",
        "Bash(git push -f *)",
        "Bash(git reset --hard *)",
        "Bash(git clean *)",
        "Bash(rm -rf *)",
        "Bash(sudo *)",
      ],
      disableBypassPermissionsMode: "disable",
    },
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash|Read",
          hooks: [
            {
              type: "command",
              command: "bash .claude/hooks/guard.sh",
            },
          ],
        },
      ],
    },
  };
  generatedArtifacts.set(".claude/settings.json", JSON.stringify(claudeSettings, null, 2) + "\n");
}

if (runtimes.has("gemini-cli")) {
  const geminiSettings = {
    context: {
      fileName: "AGENTS.md",
    },
    security: {
      disableYoloMode: true,
    },
    hooks: {
      BeforeTool: [
        {
          matcher: "^(run_shell_command|read_file|read_many_files)$",
          hooks: [
            {
              type: "command",
              name: `${projectConfig.name}-guard`,
              command: "bash .claude/hooks/guard.sh --runtime gemini-cli",
              timeout: 10000,
              description: `${displayName} security and token anti-waste guard`,
            },
          ],
        },
      ],
    },
  };
  generatedArtifacts.set(".gemini/settings.json", JSON.stringify(geminiSettings, null, 2) + "\n");
}

if (runtimes.has("antigravity")) {
  const agHooks = {
    [`${projectConfig.name}-guard`]: {
      enabled: true,
      PreToolUse: [
        {
          matcher: "run_command|view_file",
          hooks: [
            {
              type: "command",
              command: "bash .claude/hooks/guard.sh --runtime antigravity",
              timeout: 10,
            },
          ],
        },
      ],
    },
  };
  generatedArtifacts.set(".agents/hooks.json", JSON.stringify(agHooks, null, 2) + "\n");
}

// 4. Generar harness.lock (idempotente: renderedAt es null)
const lockArtifacts = {};
const sortedKeys = Array.from(generatedArtifacts.keys()).sort();
for (const relPath of sortedKeys) {
  lockArtifacts[relPath] = sha256(generatedArtifacts.get(relPath));
}

const lockData = {
  kitVersion: harnessConfig.version,
  renderedAt: null,
  artifacts: lockArtifacts,
};
const lockContent = JSON.stringify(lockData, null, 2) + "\n";
const lockRelPath = path.relative(targetRoot, path.join(overlayDir, "harness.lock")).replace(/\\/g, "/");
generatedArtifacts.set(lockRelPath, lockContent);

// 5. Modo --check o modo Render
if (checkMode) {
  const drifted = [];
  for (const [relPath, expected] of generatedArtifacts.entries()) {
    const fullPath = path.join(targetRoot, relPath);
    if (!existsSync(fullPath)) {
      drifted.push(`${relPath} (missing)`);
      continue;
    }
    const actual = readFileSync(fullPath, "utf8").replace(/\r\n/g, "\n");
    if (actual !== expected) {
      drifted.push(relPath);
    }
  }

  if (drifted.length > 0) {
    process.stderr.write(`harness drift detected in ${drifted.length} file(s):\n`);
    for (const f of drifted) {
      process.stderr.write(`  ${f}\n`);
    }
    process.stderr.write(`\nRun "node harness-kit/core/scripts/harness-render.mjs" to synchronize generated runtime artifacts.\n`);
    process.exit(1);
  }

  process.stdout.write("harness check OK (no drift)\n");
  process.exit(0);
}

// Modo render: escribir todos los artefactos
for (const [relPath, content] of generatedArtifacts.entries()) {
  const fullPath = path.join(targetRoot, relPath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}

// Asegurar directorio out configurado
const outDir = path.join(targetRoot, harnessConfig.out);
mkdirSync(outDir, { recursive: true });

process.stdout.write("harness render OK\n");
