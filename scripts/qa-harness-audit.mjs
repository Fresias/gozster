#!/usr/bin/env node
/**
 * scripts/qa-harness-audit.mjs
 * Auditoría integral automatizada del sistema Harness² (GOZSter).
 * Valida los 8 componentes, la biblioteca de experiencia, el presupuesto y las migraciones.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "..");

let debtMode = "error";
let workdirArg = "";
let maxDebt = 14;
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--debt-mode" && process.argv[i + 1]) {
    debtMode = process.argv[++i];
  } else if (arg.startsWith("--debt-mode=")) {
    debtMode = arg.slice("--debt-mode=".length);
  } else if (arg === "--workdir" && process.argv[i + 1]) {
    workdirArg = process.argv[++i];
  } else if (arg.startsWith("--workdir=")) {
    workdirArg = arg.slice("--workdir=".length);
  } else if (arg === "--max-debt" && process.argv[i + 1]) {
    maxDebt = parseInt(process.argv[++i], 10);
  } else if (arg.startsWith("--max-debt=")) {
    maxDebt = parseInt(arg.slice("--max-debt=".length), 10);
  }
}

const repoRoot = path.resolve(workdirArg || process.cwd());
const overlayDir = path.join(repoRoot, "harness");
const kitDir = existsSync(path.join(repoRoot, "harness-kit"))
  ? path.join(repoRoot, "harness-kit")
  : path.join(defaultRepoRoot, "harness-kit");

console.log("=== [QA HARNESS AUDIT] Iniciando auditoría integral de Harness² ===");

let errors = [];

// 1. Verificar los 8 componentes modulares de Harness²
console.log("1. Verificando los 8 componentes de Harness²...");

const requiredFiles = [
  { name: "1. system_prompt", file: path.join(overlayDir, "systemprompt.md") },
  { name: "2. guardrails (invariants)", file: path.join(kitDir, "core", "guardrails.md") },
  { name: "2. guardrails (local)", file: path.join(overlayDir, "guardrails.local.md") },
  { name: "3. memory (LongTermMEMORY)", file: path.join(overlayDir, "LongTermMEMORY.md") },
  { name: "3. memory (experience_library)", file: path.join(overlayDir, "experience_library.jsonl") },
  { name: "4. tool_guidance (local)", file: path.join(overlayDir, "tool_guidance.local.md") },
  { name: "5. subagents (harness-proposer)", file: path.join(kitDir, "core", "subagents", "harness-proposer.md") },
  { name: "5. subagents (harness-composer)", file: path.join(kitDir, "core", "subagents", "harness-composer.md") },
  { name: "7. scripts (harness-learn)", file: path.join(kitDir, "core", "scripts", "harness-learn.sh") },
  { name: "7. scripts (harness-telemetry)", file: path.join(kitDir, "core", "scripts", "harness-telemetry.mjs") },
  { name: "7. scripts (harness-probe)", file: path.join(kitDir, "core", "scripts", "harness-probe.mjs") },
  { name: "7. scripts (harness-propose)", file: path.join(kitDir, "core", "scripts", "harness-propose.mjs") },
];

for (const { name, file } of requiredFiles) {
  if (!existsSync(file)) {
    errors.push(`Falta componente requerido: ${name} en ${path.relative(repoRoot, file)}`);
  }
}

// 2. Verificar integridad de experience_library.jsonl
console.log("2. Auditando integridad de experience_library.jsonl...");
const expLibPath = path.join(overlayDir, "experience_library.jsonl");
if (existsSync(expLibPath)) {
  const lines = readFileSync(expLibPath, "utf8").trim().split("\n").filter(Boolean);
  if (lines.length === 0) {
    errors.push("experience_library.jsonl está vacío.");
  }
  lines.forEach((l, idx) => {
    try {
      const parsed = JSON.parse(l);
      if (!parsed.task || !parsed.lesson) {
        errors.push(`Línea ${idx + 1} en experience_library.jsonl no tiene task o lesson.`);
      }
    } catch {
      errors.push(`Línea ${idx + 1} en experience_library.jsonl no es JSON válido.`);
    }
  });
  console.log(`   -> OK: ${lines.length} lecciones registradas y verificadas.`);
}

// 3. Verificar presupuesto duro de AGENTS.md
console.log("3. Auditando presupuesto duro de AGENTS.md...");
const agentsPath = path.join(repoRoot, "AGENTS.md");
if (existsSync(agentsPath)) {
  const content = readFileSync(agentsPath, "utf8").replace(/\r\n/g, "\n");
  const lineCount = content.split("\n").length;
  const charCount = content.length;

  if (lineCount >= 150) {
    errors.push(`AGENTS.md supera el límite de líneas: ${lineCount} >= 150.`);
  }
  if (charCount > 8000) {
    errors.push(`AGENTS.md supera el límite de caracteres: ${charCount} > 8000.`);
  }
  console.log(`   -> OK: ${lineCount} líneas (<150), ${charCount} caracteres (<=8000).`);
} else {
  errors.push("No existe AGENTS.md en la raíz del repositorio.");
}

// 4. Verificar drift de renderizado
console.log("4. Verificando drift con harness-render.mjs --check...");
try {
  execFileSync(
    process.execPath,
    [path.join(kitDir, "core", "scripts", "harness-render.mjs"), "--check", overlayDir],
    { cwd: repoRoot, stdio: "pipe" }
  );
  console.log("   -> OK: No drift detectado en runtime targets.");
} catch (e) {
  errors.push("harness-render.mjs --check reportó drift o fallo de compilación.");
}

// 5. Auditando deuda de lecciones del arnés (Candado 2)
console.log("5. Auditando deuda de lecciones del arnés...");
const failAt = maxDebt + 1;
try {
  execFileSync(
    process.execPath,
    [path.join(kitDir, "core", "scripts", "harness-propose.mjs"), "--workdir", repoRoot, "--check-debt", "--max-debt", String(maxDebt)],
    { cwd: repoRoot, stdio: "pipe" }
  );
  console.log(`   -> OK: Deuda de arnés dentro del límite permitido (<=${maxDebt}; rojo en >=${failAt}).`);
} catch (e) {
  let unprocessed = "?";
  let tasks = "";
  const errOutput = (e.stderr?.toString() || "") + (e.stdout?.toString() || "") + (e.message || "");
  const match = errOutput.match(/(\d+) lecciones sin procesar \(([^)]*)\)/);
  if (match) {
    unprocessed = match[1];
    tasks = match[2];
  }

  if (debtMode === "warn") {
    console.log(`::warning title=Harness debt::${unprocessed} lecciones sin procesar (${tasks})`);
  } else {
    errors.push(`Deuda de lecciones de arnés excedida (>=${failAt} sin procesar por harness-propose).`);
  }
}

// Resumen final
if (errors.length > 0) {
  console.error("\n❌ [QA HARNESS AUDIT FALLIDO] Se detectaron los siguientes errores:");
  errors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
} else {
  console.log("\n✅ [QA HARNESS AUDIT EXITOSO] Harness² operativo, íntegro y en presupuesto.");
  process.exit(0);
}
