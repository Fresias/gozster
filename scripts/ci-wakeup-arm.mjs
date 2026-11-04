#!/usr/bin/env node
/**
 * GOZSter - Helper de Automatización de Wakeup y Diagnóstico de CI (Ponytail)
 * 
 * Uso:
 *   node scripts/ci-wakeup-arm.mjs arm <issue-id>
 *   node scripts/ci-wakeup-arm.mjs status [pr-number]
 *   node scripts/ci-wakeup-arm.mjs diagnose [run-id]
 */

import { execSync } from "node:child_process";

const [,, cmd, arg1] = process.argv;

function run(command) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch (err) {
    if (err.stdout) return err.stdout.toString().trim();
    throw err;
  }
}

const INSTRUCTION = [
  "1. Verificar resultado con 'gh pr view --json statusCheckRollup'.",
  "2. Si esta en verde (SUCCESS): Validar diff con Karpathy/Ponytail, hacer merge squash a main, cerrar el issue y emitir reporte ejecutivo.",
  "3. Si fallo (FAILURE):",
  "   a. Extraer error con 'gh run view --log-failed'.",
  "   b. Si intentos de fix >= 3: marcar issue 'blocked', desarmar wakeup y reportar autopsia a Gabriel.",
  "   c. Si es error de infraestructura/red: ejecutar 'gh run rerun --failed-only'.",
  "   d. Si es codigo/DB: aplicar fix quirurgico, validar localmente, pushear y re-armar wakeup."
].join("\n");

switch (cmd) {
  case "arm": {
    const issueId = arg1;
    if (!issueId) {
      console.error("Uso: node scripts/ci-wakeup-arm.mjs arm <issue-id>");
      process.exit(1);
    }
    console.log(`[WAKEUP] Registrando wakeup --until-pr checks para el issue ${issueId}...`);
    const escapedInstruction = INSTRUCTION.replace(/"/g, '\\"');
    const result = run(`multica issue wakeup create ${issueId} --until-pr checks --expires-in 2h --on-timeout wake --instruction "${escapedInstruction}"`);
    console.log("[WAKEUP] Registrado con exito:", result);
    break;
  }

  case "status": {
    const pr = arg1 ? `${arg1}` : "";
    console.log(`[CI] Consultando estado de checks para PR ${pr || "(actual)"}...`);
    const status = run(`gh pr checks ${pr}`);
    console.log(status);
    break;
  }

  case "diagnose": {
    const runId = arg1 ? `${arg1}` : "";
    console.log(`[CI] Diagnosticando log de fallo ${runId ? `(run ${runId})` : "del ultimo run"}...`);
    const log = run(`gh run view ${runId} --log-failed`);
    
    // Clasificación determinista (prioridad a errores de compilación y fallos explícitos)
    if (log.includes("error TS1005") || log.includes("error TS2339") || (log.includes("##[error]") && log.includes(".tsx"))) {
      console.log("\n[DIAGNOSTICO]: ARQUETIPO B - Error de Sintaxis JSX o TypeScript.");
    } else if (log.includes("backup-restore-gozs") || (log.includes("expected") && log.includes("to be less than"))) {
      console.log("\n[DIAGNOSTICO]: ARQUETIPO A - Integridad DB / Orden Topologico de FKs.");
    } else if (log.includes("harness check FAILED") || log.includes("harness drift detected")) {
      console.log("\n[DIAGNOSTICO]: ARQUETIPO D - Harness / Config Drift.");
    } else if (log.includes("AssertionError") || log.includes("FAIL ") || log.includes("vitest")) {
      console.log("\n[DIAGNOSTICO]: ARQUETIPO C - Desincronizacion de Asercion de Tests (SSR / LocalStorage).");
    } else if (log.includes("ETIMEDOUT") || log.includes("network") || log.includes("lost communication")) {
      console.log("\n[DIAGNOSTICO]: CASO BORDE 3 - Falla de Infraestructura / Red.");
    } else {
      console.log("\n[DIAGNOSTICO]: Falla no categorizada. Revisar el extracto a continuacion.");
    }
    
    console.log("\n--- EXTRACTO DE ERROR ---");
    console.log(log.split("\n").slice(-25).join("\n"));
    break;
  }

  default: {
    console.log("GOZSter CI Wakeup & Diagnosis Helper");
    console.log("Comandos disponibles:");
    console.log("  arm <issue-id>     Arma el wakeup nativo en Multica para el PR del issue");
    console.log("  status [pr]        Consulta el estado de checks de GitHub Actions");
    console.log("  diagnose [run-id]  Extrae y clasifica el log de fallo");
    break;
  }
}
