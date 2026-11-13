#!/usr/bin/env node
// Analyzes accumulated lessons, clusters friction and proposes PPC candidate mutations (Harness²).
//
// Usage:
//   node core/scripts/harness-propose.mjs [--consolidate] [--check-debt] [--generate] [--probe] [--json]

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..", "..");

function parseArgs(args) {
  const opts = {
    workdir: process.cwd(),
    consolidate: false,
    checkDebt: false,
    generate: false,
    probe: false,
    postMerge: false,
    markProcessed: false,
    maxDebt: 5,
    output: "",
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--workdir" || a === "-w") opts.workdir = path.resolve(args[++i]);
    else if (a === "--consolidate") opts.consolidate = true;
    else if (a === "--check-debt") opts.checkDebt = true;
    else if (a === "--generate" || a === "-g") opts.generate = true;
    else if (a === "--probe" || a === "-p") opts.probe = true;
    else if (a === "--post-merge") opts.postMerge = true;
    else if (a === "--mark-processed") opts.markProcessed = true;
    else if (a === "--max-debt") opts.maxDebt = parseInt(args[++i], 10);
    else if (a === "--output" || a === "-o") opts.output = args[++i];
    else if (a === "--json") opts.json = true;
    else if (a === "--help" || a === "-h") {
      process.stdout.write(`harness-propose — Automated PPC Proposer & Experience Analyzer (Harness²)

Options:
  --check-debt                 Audit lesson backlog debt against threshold (exit 1 if exceeded)
  --consolidate                Consolidate experience/*.jsonl into experience_library.jsonl
  --generate, -g               Analyze friction and generate candidates.json
  --probe, -p                  Pipe generated candidates to harness-probe.mjs
  --post-merge                 Post-merge CI hook: consolidate and trigger proposals if debt threshold reached
  --mark-processed             Mark analyzed lessons as processed_by_proposer in experience_library.jsonl
  --max-debt <n>               Maximum unprocessed lessons before debt is exceeded (default: 5)
  --output, -o <file>          File to save candidate mutations (default: .harness/candidates.json)
  --workdir, -w <dir>          Repository root directory (default: cwd)
  --json                       Output structured JSON to stdout
`);
      process.exit(0);
    }
  }

  return opts;
}

/** Reads all JSON lines from a file */
export function readJsonLines(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Consolidates individual task lessons from harness/experience/*.jsonl into harness/experience_library.jsonl */
export function consolidateLessons(workdir, { write = true } = {}) {
  const expDir = path.join(workdir, "harness", "experience");
  const libFile = path.join(workdir, "harness", "experience_library.jsonl");

  const existingLib = readJsonLines(libFile);
  const seenIds = new Set(existingLib.map((e) => e.id || `${e.task}:${e.lesson}`));

  let modified = false;
  for (const item of existingLib) {
    if (item.processed_by_proposer === undefined) {
      if (item.id?.startsWith("fact-") || item.ppc || (item.verified && !item.task?.startsWith("GOZS-4"))) {
        item.processed_by_proposer = true;
        modified = true;
      }
    }
  }

  let added = 0;
  if (existsSync(expDir)) {
    const files = readdirSync(expDir).filter((f) => f.endsWith(".jsonl"));
    for (const file of files) {
      const items = readJsonLines(path.join(expDir, file));
      for (const item of items) {
        const key = item.id || `${item.task}:${item.lesson}`;
        if (!seenIds.has(key)) {
          seenIds.add(key);
          const entry = {
            ...item,
            processed_by_proposer: item.processed_by_proposer ?? (Boolean(item.ppc) || false),
          };
          existingLib.push(entry);
          added++;
        }
      }
    }
  }

  if (write && (added > 0 || modified)) {
    const content = existingLib.map((e) => JSON.stringify(e)).join("\n") + "\n";
    writeFileSync(libFile, content, "utf8");
  }

  return { total: existingLib.length, added, lessons: existingLib };
}

/** Calculates lesson debt: count of lessons not yet processed by the proposer */
export function calculateDebt(workdir, maxDebt = 5) {
  const { lessons } = consolidateLessons(workdir, { write: false });
  const unanalyzed = lessons.filter((l) => !l.processed_by_proposer && !l.ppc);

  return {
    total: lessons.length,
    unprocessed: unanalyzed.length,
    maxDebt,
    debtExceeded: unanalyzed.length > maxDebt,
    unanalyzedTasks: [...new Set(unanalyzed.map((l) => l.task))],
  };
}

/** Analyzes friction patterns across lessons and proposes candidates */
export function analyzeFrictionAndPropose(workdir, maxCandidates = 3, { write = false } = {}) {
  const { lessons } = consolidateLessons(workdir, { write });
  const unanalyzed = lessons.filter((l) => !l.processed_by_proposer && !l.ppc);
  const targetLessons = unanalyzed.length > 0 ? unanalyzed : lessons.slice(-10);

  const patterns = [
    {
      id: "friction-tool-guidance-cli",
      component: "tool_guidance",
      file: "harness/tool_guidance.local.md",
      regex: /(gh api|powershell|backtick|encoding|bom|utf-8|traversal|quoting)/i,
      rationale: "Fricción recurrente detectada en llamadas CLI, sintaxis de shell y manejo de encoding en lecciones recientes.",
      content: "\n- En comandos `gh api`, especificar método explícito (-X GET / -X POST) y evitar flags ambiguos que alteren el verbo HTTP.\n",
    },
    {
      id: "friction-guardrails-db-safety",
      component: "guardrails",
      file: "harness/guardrails.local.md",
      regex: /(append-only|migration|supabase|rls|db\.append-only)/i,
      rationale: "Refuerzo operacional de integridad en migraciones append-only y políticas RLS explicitadas en lecciones previas.",
      content: "\n- Migraciones SQL: verificar idempotencia y RLS antes de sella el gate.\n",
    },
    {
      id: "friction-memory-patterns",
      component: "memory",
      file: "harness/LongTermMEMORY.md",
      regex: /(memoria|memory|path traversal|fs\.protected)/i,
      rationale: "Registro de hechos verificados para evitar regresiones de path traversal y restricciones de sandbox.",
      content: `\n- [verified ${new Date().toISOString().slice(0, 10)} | src: harness-propose] Las rutas de memoria son escribibles pero rechazan estrictamente .. y %2e.\n`,
    },
  ];

  const matched = [];
  for (const p of patterns) {
    const hits = targetLessons.filter((l) => p.regex.test(l.lesson || "") || (l.tags || []).some((t) => p.regex.test(t)));
    if (hits.length > 0) {
      matched.push({
        candidate_id: `c${matched.length + 1}-${p.component}`,
        target_component: p.component,
        file: p.file,
        rationale: `${p.rationale} (Detectado en ${hits.length} lección/es: ${hits.slice(0, 3).map((h) => h.task).join(", ")})`,
        action: "append",
        content: p.content,
      });
      if (matched.length >= maxCandidates) break;
    }
  }

  // Fallback si no hay clusters específicos: propuesta de Tool Guidance
  if (matched.length === 0) {
    matched.push({
      candidate_id: "c1-tool-guidance-review",
      target_component: "tool_guidance",
      file: "harness/tool_guidance.local.md",
      rationale: "Optimización preventiva de inspección quirúrgica para reducir consumo de contexto.",
      action: "append",
      content: "\n- Limitar inspección previa a rangos acotados (StartLine/EndLine <= 300) y evitar comandos cat no acotados.\n",
    });
  }

  return {
    candidates: matched,
    unanalyzedCount: unanalyzed.length,
    analyzedTasks: [...new Set(targetLessons.map((l) => l.task))],
  };
}

/** Mark lessons as processed by proposer */
export function markLessonsProcessed(workdir, tasks = []) {
  const libFile = path.join(workdir, "harness", "experience_library.jsonl");
  const lessons = readJsonLines(libFile);
  const taskSet = new Set(tasks);

  let updated = 0;
  for (const l of lessons) {
    if (taskSet.size === 0 || taskSet.has(l.task)) {
      if (!l.processed_by_proposer) {
        l.processed_by_proposer = true;
        updated++;
      }
    }
  }

  if (updated > 0) {
    writeFileSync(libFile, lessons.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  }

  return { updated };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  // 1. Chequeo de Deuda (Candado de Gate)
  if (opts.checkDebt) {
    const debt = calculateDebt(opts.workdir, opts.maxDebt);
    if (opts.json) {
      process.stdout.write(JSON.stringify(debt, null, 2) + "\n");
    } else {
      process.stdout.write(`[harness-propose] Lecciones totales: ${debt.total}, sin procesar: ${debt.unprocessed} (límite: ${debt.maxDebt})\n`);
    }
    if (debt.debtExceeded) {
      process.stderr.write(`[harness-propose ERROR] Deuda de arnés excedida: ${debt.unprocessed} lecciones sin procesar (${debt.unanalyzedTasks.join(", ")}). Abrir un PR chore/<#>-harness-debt-consolidacion con etiqueta harness-authorized (PM).\n`);
      process.exit(1);
    }
    process.exit(0);
  }

  // 2. Consolidación explícita
  if (opts.consolidate) {
    const res = consolidateLessons(opts.workdir, { write: true });
    if (opts.json) process.stdout.write(JSON.stringify(res, null, 2) + "\n");
    else process.stdout.write(`[harness-propose] Consolidación completada: ${res.added} lecciones agregadas, ${res.total} en total.\n`);
    process.exit(0);
  }

  // 3. Post-merge hook
  if (opts.postMerge) {
    const debt = calculateDebt(opts.workdir, opts.maxDebt);
    process.stdout.write(`[harness-propose post-merge] Lecciones sin procesar: ${debt.unprocessed}/${debt.maxDebt}\n`);
    if (debt.unprocessed >= 3) {
      process.stdout.write(`[harness-propose post-merge] Umbral alcanzado. Generando candidatos...\n`);
      const { candidates } = analyzeFrictionAndPropose(opts.workdir, 3, { write: false });
      const outPath = path.join(opts.workdir, ".harness", "candidates.json");
      mkdirSync(path.dirname(outPath), { recursive: true });
      writeFileSync(outPath, JSON.stringify(candidates, null, 2), "utf8");
      process.stdout.write(`[harness-propose post-merge] ${candidates.length} candidato(s) guardados en ${outPath}.\n`);
    }
    process.exit(0);
  }

  // 4. Modo Generación (por defecto si no se especifican otros modos)
  const analysis = analyzeFrictionAndPropose(opts.workdir, 3, { write: false });
  const outPath = opts.output || path.join(opts.workdir, ".harness", "candidates.json");

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(analysis.candidates, null, 2), "utf8");

  if (opts.json) {
    process.stdout.write(JSON.stringify({ ...analysis, candidatesFile: outPath }, null, 2) + "\n");
  } else {
    process.stdout.write(`[harness-propose] Generados ${analysis.candidates.length} candidato(s) en ${outPath} a partir de ${analysis.analyzedTasks.length} tareas analizadas.\n`);
  }

  // Marcar lecciones analizadas como procesadas si se solicitó explícitamente
  if (opts.markProcessed) {
    const markRes = markLessonsProcessed(opts.workdir, analysis.analyzedTasks);
    if (!opts.json) {
      process.stdout.write(`[harness-propose] Marcadas ${markRes.updated} lección(es) como procesadas.\n`);
    }
  }

  // 5. Encadenamiento opcional con Probe
  if (opts.probe) {
    process.stdout.write(`[harness-propose] Encadenando con harness-probe.mjs...\n`);
    const probeScript = path.join(kitDir, "core", "scripts", "harness-probe.mjs");
    const probeRes = spawnSync(process.execPath, [probeScript, "--batch", outPath, "--json"], {
      cwd: opts.workdir,
      encoding: "utf8",
    });

    if (probeRes.status === 0) {
      process.stdout.write(`[harness-propose probe OK] Probe ejecutado exitosamente.\n`);
      process.stdout.write(probeRes.stdout);
      // Marcar lecciones analizadas como procesadas
      markLessonsProcessed(opts.workdir, analysis.analyzedTasks);
    } else {
      process.stderr.write(`[harness-propose probe FALLIDO] ${probeRes.stderr || probeRes.stdout}\n`);
      process.exit(probeRes.status || 1);
    }
  }

  process.exit(0);
}

// Direct execution
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
