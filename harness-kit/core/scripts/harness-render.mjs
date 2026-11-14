#!/usr/bin/env node
// Harness compiler & drift checker (H-03).
//
// Renderiza los artefactos de cada runtime a partir de los contratos (D7: los
// archivos de runtime son artefactos generados, nadie los edita a mano).
// El flag `--check` detecta drift en la CI comparando byte a byte.
// Decisión P5: JSON sin dependencias externas (Ponytail).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

/**
 * Encoding gate: UTF-8 estricto, sin BOM, sin controles (salvo \n \r \t) ni U+FFFD.
 * Detecta strings de PowerShell con backtick (`a = BEL, `b = BS) y archivos ANSI.
 */
function encodingDefect(buf) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return "invalid UTF-8 (save the file as UTF-8, not ANSI/ISO-8859)";
  }
  // TextDecoder drops a leading BOM silently: check the raw bytes.
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return "UTF-8 BOM at start of file";
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/);
    if (m) {
      const code = m[0].charCodeAt(0).toString(16).padStart(4, "0");
      return `line ${i + 1}: forbidden character U+${code} (PowerShell backtick escape or broken encoding)`;
    }
  }
  return null;
}

/** Lee un archivo y normaliza saltos de línea a LF. Retorna null si no existe. */
function readFileSafe(filePath) {
  if (!existsSync(filePath)) return null;
  const buf = readFileSync(filePath);
  const defect = encodingDefect(buf);
  if (defect) fail(`encoding: ${path.relative(repoRoot(), filePath).replace(/\\/g, "/")} — ${defect}`);
  return buf.toString("utf8").replace(/\r\n/g, "\n");
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

// C4: tool guidance (core -> adapters -> local)
const coreToolGuidance = readFileSafe(path.join(kitDir, "core", "tool_guidance.md"));
const adapterToolGuidance = adapters
  .map((a) => readFileSafe(path.join(kitDir, "adapters", a, "tool_guidance.md")))
  .filter(Boolean);
const localToolGuidance = readFileSafe(path.join(overlayDir, "tool_guidance.local.md"));

// C6: skills (core -> overlay). Cada `skills/<n>/SKILL.md` declara su
// `autotrigger` en el frontmatter; el render lo publica en AGENTS.md.
function loadSkills(skillsDir) {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((dir) => readFileSafe(path.join(skillsDir, dir, "SKILL.md")))
    .filter(Boolean)
    .map((content) => {
      const field = (key) => content.match(new RegExp(`^${key}:[ \\t]*(.+)$`, "m"))?.[1].trim();
      return { name: field("name"), autotrigger: field("autotrigger"), content };
    })
    .filter((s) => s.name);
}
const skills = [
  ...loadSkills(path.join(kitDir, "core", "skills")),
  ...loadSkills(path.join(overlayDir, "skills")),
];
const autotriggers = skills
  .filter((s) => s.autotrigger)
  .map((s) => `- When ${s.autotrigger}, load the ${s.name} skill.`);
const skillsSection = autotriggers.length ? `## Skills\n\n${autotriggers.join("\n")}` : null;

// C3: LongTermMEMORY. Todo bullet debe ser un hecho `[verified <fecha> | src: <fuente>]`.
const memory = readFileSafe(path.join(overlayDir, "LongTermMEMORY.md"));
for (const line of memory?.split("\n") ?? []) {
  if (line.startsWith("- ") && !/^- \[verified [^|\]]+\| src: [^\]]+\] \S/.test(line)) {
    fail(`invalid fact in LongTermMEMORY.md (expected "- [verified <date> | src: <source>] <fact>"): ${line}`);
  }
}

// Criterio B: valida si una lección cuenta con evidencia verificada (métricas, delta, PPC o contraste)
export function hasLessonEvidence(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.evidence === true) return true;
  if (entry.evidence && typeof entry.evidence === "object" && Object.keys(entry.evidence).length > 0) return true;
  if (entry.metrics && entry.metrics.before !== undefined && entry.metrics.before !== null &&
      entry.metrics.after !== undefined && entry.metrics.after !== null) {
    return true;
  }
  if (entry.delta !== undefined && entry.delta !== null && entry.delta !== "") {
    return true;
  }
  if (entry.delta_verified === true || entry.delta_verificado === true) {
    return true;
  }
  if (entry.probe_result === "success") {
    return true;
  }
  if (entry.ppc && (entry.ppc.winner_id || entry.ppc.probe_passed || entry.ppc.candidates > 1 || entry.ppc.delta !== undefined)) {
    return true;
  }
  if (typeof entry.lesson === "string" && /(duration(_ms)?|blocks|tool_calls|score|out_of_scope|friction)/i.test(entry.lesson) && /(vs\s+[a-z0-9_-]+|[-+]\d+|delta)/i.test(entry.lesson)) {
    return true;
  }
  return false;
}

// C3b: Experience Library (Harness² JSONL con filtrado por scope)
const expLibPath = path.join(overlayDir, "experience_library.jsonl");
let expLibSection = null;
if (existsSync(expLibPath)) {
  const rawLines = readFileSafe(expLibPath).split("\n").filter((l) => l.trim().length > 0);
  const validLessons = [];
  for (let i = 0; i < rawLines.length; i++) {
    try {
      const parsed = JSON.parse(rawLines[i]);
      if (!parsed.task || !parsed.lesson) {
        fail(`invalid entry in experience_library.jsonl (line ${i + 1}): missing task or lesson`);
      }
      if (parsed.verified !== false) {
        validLessons.push(parsed);
      }
    } catch {
      fail(`invalid json in experience_library.jsonl (line ${i + 1})`);
    }
  }
  if (validLessons.length > 0) {
    let activeScope = [];
    const targetRoot = path.resolve(overlayDir, "..");
    const scopePaths = [
      path.join(targetRoot, ".harness", "scope.json"),
      path.join(overlayDir, "scope.json"),
      path.join(repoRoot(), ".harness", "scope.json"),
    ];
    for (const sp of scopePaths) {
      if (existsSync(sp)) {
        try {
          const parsedScope = JSON.parse(readFileSafe(sp));
          if (Array.isArray(parsedScope.scope)) activeScope = parsedScope.scope.map((s) => s.toLowerCase());
          break;
        } catch {}
      }
    }

    const pinned = validLessons.filter((l) => l.pinned === true);
    let selectedRecent = [];
    if (activeScope.length > 0) {
      const scored = validLessons.map((l) => {
        const lTags = Array.isArray(l.tags) ? l.tags.map((t) => t.toLowerCase()) : [];
        const taskText = `${l.task || ""} ${l.lesson || ""}`.toLowerCase();
        let matches = 0;
        for (const s of activeScope) {
          if (lTags.includes(s) || taskText.includes(s)) matches++;
        }
        return { lesson: l, matches };
      });
      const matching = scored
        .filter((s) => s.matches > 0)
        .sort((a, b) => b.matches - a.matches)
        .map((s) => s.lesson);
      if (matching.length > 0) selectedRecent = matching.slice(-3);
    }

    if (selectedRecent.length === 0) {
      // Criterio B: N=3 lecciones más recientes con evidencia (metrics.before/after, delta, ppc o contrast)
      const withEvidence = validLessons.filter((l) => hasLessonEvidence(l));
      const sortedEvidence = withEvidence.slice().sort((a, b) => {
        if (a.timestamp && b.timestamp) {
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }
        return 0;
      });
      selectedRecent = sortedEvidence.slice(-3);
    }

    const combined = [];
    const seen = new Set();
    for (const p of pinned) {
      const key = p.id || `${p.task}:${p.lesson}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(p);
      }
    }
    for (const r of selectedRecent) {
      const key = r.id || `${r.task}:${r.lesson}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(r);
      }
    }
    const selected = combined;

    if (selected.length > 0) {
      const lines = selected.map((e) => `- [lesson ${e.timestamp ? e.timestamp.slice(0, 10) : "verified"} | task: ${e.task}] ${e.lesson}`);
      expLibSection = `### Experience Library (Harness²)\n\n${lines.join("\n")}`;
    }
  }
}

// C3c: lecciones por issue (harness/experience/<ISSUE>.jsonl): encoding + JSON + task == nombre de archivo.
const expDir = path.join(overlayDir, "experience");
if (existsSync(expDir)) {
  for (const f of readdirSync(expDir).filter((n) => n.endsWith(".jsonl")).sort()) {
    const issue = f.slice(0, -".jsonl".length);
    const rows = readFileSafe(path.join(expDir, f)).split("\n").filter((l) => l.trim());
    rows.forEach((l, i) => {
      let e = null;
      try {
        e = JSON.parse(l);
      } catch {
        fail(`invalid json in harness/experience/${f} (line ${i + 1})`);
      }
      if (e.task !== issue || !e.lesson) fail(`invalid entry in harness/experience/${f} (line ${i + 1}): task must be ${issue} and lesson non-empty`);
    });
  }
}

// C7: índice de scripts, desde la primera línea de comentario de cada uno (D8).
const scriptsDir = path.join(kitDir, "core", "scripts");
const scriptLines = readdirSync(scriptsDir)
  .filter((f) => /\.(sh|mjs)$/.test(f))
  .sort()
  .map((f) => {
    const doc = readFileSafe(path.join(scriptsDir, f))
      .split("\n")
      .slice(1)
      .map((l) => l.replace(/^\s*(#|\/\/|\/\*\*|\*)\s?/, "").trim())
      .find(Boolean);
    return `- \`${path.relative(repoRoot(), path.join(scriptsDir, f)).replace(/\\/g, "/")}\`: ${doc}`;
  });

const overlayScriptsDir = path.join(overlayDir, "scripts");
if (existsSync(overlayScriptsDir)) {
  const overlayScriptLines = readdirSync(overlayScriptsDir)
    .filter((f) => /\.(sh|mjs)$/.test(f))
    .sort()
    .map((f) => {
      const doc = readFileSafe(path.join(overlayScriptsDir, f))
        .split("\n")
        .slice(1)
        .map((l) => l.replace(/^\s*(#|\/\/|\/\*\*|\*)\s?/, "").trim())
        .find(Boolean) || "project script";
      return `- \`${path.relative(repoRoot(), path.join(overlayScriptsDir, f)).replace(/\\/g, "/")}\`: ${doc}`;
    });
  scriptLines.push(...overlayScriptLines);
}
const scriptsSection = `# Helper scripts (run via bash)\n\n${scriptLines.join("\n")}`;

// Orden canónico (spec §5): systemprompt → guardrails → autotriggers → memory → tool_guidance → scripts_index
const agentSections = [
  systemPrompt?.trimEnd(),
  coreGuardrails?.trimEnd(),
  ...adapterGuardrails.map((s) => s.trimEnd()),
  localGuardrails?.trimEnd(),
  skillsSection,
  memory?.trimEnd(),
  expLibSection,
  coreToolGuidance?.trimEnd(),
  ...adapterToolGuidance.map((s) => s.trimEnd()),
  localToolGuidance?.trimEnd(),
  scriptsSection,
].filter(Boolean);

const agentsMdContent = agentSections.join("\n\n") + "\n";

// Extraer displayName para settings respetando casing de systemprompt
let displayName = projectConfig.name;
if (systemPrompt) {
  // Solo el H1 de la primera línea (un BOM o un "## ..." no deben volverse el nombre).
  const m = systemPrompt.replace(/^\uFEFF/, "").match(/^#\s+([^\s—#]+)/);
  if (m && m[1]) displayName = m[1];
}

// 3. Preparar mapa de artefactos generados (relPath -> content)
const generatedArtifacts = new Map();
generatedArtifacts.set("AGENTS.md", agentsMdContent);

const runtimes = new Set(projectConfig.runtimes);

/** Nombres de tool de core/runtimes/<rt>.json (fuente única de los matchers). */
function toolNames(runtime, kinds) {
  const { tools } = JSON.parse(readFileSync(path.join(kitDir, "core", "runtimes", `${runtime}.json`), "utf8"));
  return kinds.flatMap((kind) => tools[kind] ?? []).map((tool) => tool.name);
}
const PRE_KINDS = ["shell", "read", "read_many", "write"];
const POST_KINDS = ["shell", "write"];

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
          matcher: toolNames("claude-code", PRE_KINDS).join("|"),
          hooks: [
            {
              type: "command",
              command: "bash .claude/hooks/guard.sh",
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: toolNames("claude-code", POST_KINDS).join("|"),
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
          matcher: `^(${toolNames("gemini-cli", PRE_KINDS).join("|")})$`,
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
      AfterTool: [
        {
          matcher: `^(${toolNames("gemini-cli", POST_KINDS).join("|")})$`,
          hooks: [
            {
              type: "command",
              name: `${projectConfig.name}-guard-post`,
              command: "bash .claude/hooks/guard.sh --runtime gemini-cli",
              timeout: 10000,
              description: `${displayName} post-tool result guard`,
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
          matcher: toolNames("antigravity", PRE_KINDS).join("|"),
          hooks: [
            {
              type: "command",
              // cwd = .agents/ (runtimes/antigravity.json): ruta relativa a la raíz. node y no bash: con
              // `cmd /c` el primer bash del PATH puede ser WSL (GOZS-513). Vale igual con `sh -c`.
              command: "node ../harness-kit/core/guard/guard-cli.mjs --runtime antigravity",
              timeout: 10,
            },
          ],
        },
      ],
    },
  };
  generatedArtifacts.set(".agents/hooks.json", JSON.stringify(agHooks, null, 2) + "\n");
}

if (runtimes.has("opencode")) {
  // OpenCode carga plugins de .opencode/plugins/ (runtimes/opencode.json). Una sola
  // línea que reexporta el plugin del kit: sin duplicar lógica (D6) y con un único export.
  generatedArtifacts.set(
    ".opencode/plugins/harness-guard.ts",
    'export { HarnessPlugin } from "../../harness-kit/core/plugins/opencode/opencode-plugin";\n',
  );
}

// Skills: Claude Code solo lee `.claude/skills/`; el resto lee `.agents/skills/`.
const skillDirs = [
  runtimes.has("claude-code") && ".claude/skills",
  ["gemini-cli", "opencode", "antigravity"].some((rt) => runtimes.has(rt)) && ".agents/skills",
].filter(Boolean);
for (const skill of skills) {
  for (const dir of skillDirs) {
    generatedArtifacts.set(`${dir}/${skill.name}/SKILL.md`, skill.content);
  }
}

// 3b. Materializar subagentes por runtime (H-09).
// Fuente: core/subagents/*.md + adapters/<a>/subagents/*.md (adapters configurados).
// El frontmatter NO es portable (runtimes/README implicación #2): un archivo por
// runtime, con el frontmatter traducido al contrato de cada core/runtimes/<rt>.json.
const SUBAGENT_DIRS = {
  "claude-code": ".claude/agents",
  "gemini-cli": ".gemini/agents",
  "opencode": ".opencode/agents",
  "antigravity": ".agents/agents",
};

/** Frontmatter traducido al contrato de cada runtime. */
function subagentFrontmatter(runtime, sub) {
  // OpenCode toma el nombre del archivo y exige `mode: subagent`, sin clave `name`.
  if (runtime === "opencode") return { description: sub.description, mode: "subagent" };
  // claude-code / gemini-cli / antigravity: `name` + `description`. Gemini es strict
  // (zod .strict: clave desconocida = error) → el set mínimo name+description es portable.
  return { name: sub.name, description: sub.description };
}

/** Parsea un subagente fuente (frontmatter `name`/`description` + cuerpo). */
function parseSubagent(filePath) {
  const raw = readFileSafe(filePath);
  const m = raw && raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return fail(`invalid subagent (missing frontmatter): ${filePath}`);
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  if (!fm.name || !fm.description) return fail(`subagent missing name/description: ${filePath}`);
  return { name: fm.name, description: fm.description, body: m[2].trim() };
}

/** Recolecta subagentes de core, adapters y overlay. */
function collectSubagents() {
  const dirs = [path.join(kitDir, "core", "subagents")];
  for (const a of adapters) dirs.push(path.join(kitDir, "adapters", a, "subagents"));
  dirs.push(path.join(overlayDir, "subagents"));
  const subs = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir).sort()) {
      if (entry.endsWith(".md")) subs.push(parseSubagent(path.join(dir, entry)));
    }
  }
  return subs;
}

for (const sub of collectSubagents()) {
  for (const runtime of runtimes) {
    const dir = SUBAGENT_DIRS[runtime];
    if (!dir) continue;
    const fm = subagentFrontmatter(runtime, sub);
    const fmText = ["---", ...Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), "---"].join("\n");
    generatedArtifacts.set(`${dir}/${sub.name}.md`, `${fmText}\n\n${sub.body}\n`);
  }
}

// 3c. Reglas específicas por runtime si su contrato lo declara.
// Fuente: core/runtimes/<runtime>.rules.md -> <rulesDir>/harness-<runtime>.md
for (const runtime of runtimes) {
  const contractPath = path.join(kitDir, "core", "runtimes", `${runtime}.json`);
  if (!existsSync(contractPath)) continue;
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  const rulesDir =
    contract.rules?.dir ??
    (Array.isArray(contract.rules?.files)
      ? contract.rules.files.find((f) => f.includes("/*"))?.replace(/\/\*\..*$/, "")
      : undefined);
  if (!rulesDir) continue;

  const rulesSourcePath = path.join(kitDir, "core", "runtimes", `${runtime}.rules.md`);
  if (!existsSync(rulesSourcePath)) continue;

  const rulesContent = readFileSafe(rulesSourcePath);
  generatedArtifacts.set(`${rulesDir}/harness-${runtime}.md`, rulesContent);
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
