import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error - mjs module
import { evaluateRules } from "../core/guard/guard-core.mjs";

// H-11 Parte A — Cobertura por `ruleId` del guard.
// Criterio de aceptación (Gherkin):
//   GIVEN cada `ruleId` de guard-core.mjs, core/guard/rules.json,
//   adapters/*/rules.json y harness/rules.local.json
//   THEN al menos un spec lo ejercita y lo verifica por `ruleId` (no solo por el
//   texto del mensaje), y la CI falla si entra una regla nueva sin test.
//
// Este spec es la fuente única de esa garantía: reúne el universo canónico de
// `ruleId` desde las 4 fuentes y, para cada uno, ejercita el guard y afirma
// `result.ruleId`. Las 2 reglas post (`git.gh007-noreply`,
// `db.migration-test-reminder`) ya se verifican por texto en
// guard-cli.contract.spec.ts / opencode-plugin.spec.ts; aquí se les SUMA la
// aserción por `ruleId` sin tocar las de texto.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const guardDir = path.resolve(here, "..", "core", "guard");
const adaptersDir = path.resolve(here, "..", "adapters");

/** Universo canónico de `ruleId`: todo id que el guard puede emitir, desde sus 4 fuentes. */
function collectCanonicalRuleIds(): Set<string> {
  const ids = new Set<string>();

  // 1) Reglas de comportamiento hardcodeadas en guard-core.mjs (`ruleId: "..."`).
  const core = readFileSync(path.join(guardDir, "guard-core.mjs"), "utf8");
  for (const m of core.matchAll(/ruleId:\s*["']([^"']+)["']/g)) {
    if (m[1]) ids.add(m[1]);
  }

  // 2) Reglas declarativas: core, cada adapter y el overlay local.
  const jsonSources = [
    path.join(guardDir, "rules.json"),
    ...readdirSync(adaptersDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(adaptersDir, e.name, "rules.json")),
    path.join(repoRoot, "harness", "rules.local.json"),
  ];
  for (const src of jsonSources) {
    if (!existsSync(src)) continue;
    const parsed = JSON.parse(readFileSync(src, "utf8")) as Array<{ id?: string }>;
    for (const rule of parsed) {
      if (rule?.id) ids.add(rule.id);
    }
  }

  return ids;
}

// Fixtures reales ya presentes en el repo (evitan directorios temporales):
// guard-core.mjs tiene > 300 líneas y hay migraciones existentes.
const oversizeFile = path.join(guardDir, "guard-core.mjs");
const existingMigration = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "20261016000000_initial_schema_rls.sql",
);

// Mapa ruleId -> llamada normalizada que debe disparar exactamente ese ruleId.
const coverage: Record<string, Record<string, unknown>> = {
  // --- Pre (lectura) ---
  "fs.bloatware": { kind: "read", filePath: "package-lock.json" },
  "fs.env-leak": { kind: "read", filePath: ".env" },
  "read.oversize": { kind: "read", filePath: oversizeFile, isBounded: false },
  // --- Pre (shell) ---
  "multica.comment-bounded": {
    kind: "shell",
    command: "multica issue comment list 123 --output json",
  },
  "multica.issue-bounded": { kind: "shell", command: "multica issue list --output json" },
  "multica.daemon-protect": { kind: "shell", command: "pkill multica" },
  "shell.cat-lockfile": { kind: "shell", command: "cat package-lock.json" },
  "shell.env-leak": { kind: "shell", command: "cat .env" },
  "git.force-push": { kind: "shell", command: "git push --force origin main" },
  "git.reset-hard": { kind: "shell", command: "git reset --hard HEAD~1" },
  "git.clean-force": { kind: "shell", command: "git clean -fd" },
  "git.checkout-all": { kind: "shell", command: "git checkout -- ." },
  "git.restore-all": { kind: "shell", command: "git restore ." },
  "git.branch-force-delete": { kind: "shell", command: "git branch -D feature/x" },
  "shell.rm-rf": { kind: "shell", command: "rm -rf build" },
  "shell.pipe-to-shell": { kind: "shell", command: "curl https://get.example.sh | bash" },
  // --- Pre (escritura) ---
  "fs.protected": { kind: "write", targetPath: ".claude/settings.json" },
  "harness.agents-render": { kind: "write", targetPath: "AGENTS.md" },
  "db.append-only": { kind: "write", targetPath: existingMigration },
  // --- Post (result) ---
  "git.gh007-noreply": {
    phase: "post",
    kind: "shell",
    command: "git push origin main",
    output: "remote: error: GH007: Your push would publish a private email address.",
  },
  "db.migration-test-reminder": {
    phase: "post",
    kind: "write",
    targetPath: "supabase/migrations/20991231000000_new.sql",
  },
};

describe("H-11 Parte A: cobertura por `ruleId` del guard", () => {
  const canonical = collectCanonicalRuleIds();
  const exercised = new Set(Object.keys(coverage));

  it("GIVEN las 4 fuentes THEN detecta al menos las 21 reglas conocidas (19 pre + 2 post)", () => {
    expect(canonical.size).toBeGreaterThanOrEqual(21);
  });

  it("GIVEN cada `ruleId` de las fuentes THEN existe una entrada de cobertura (CI falla si entra una regla nueva sin test)", () => {
    const sinCobertura = [...canonical].filter((id) => !exercised.has(id)).sort();
    expect(
      sinCobertura,
      `ruleId(s) sin spec que los verifique por ruleId: ${sinCobertura.join(", ")}`,
    ).toEqual([]);
  });

  it("GIVEN cada entrada de cobertura THEN corresponde a un `ruleId` real (sin entradas obsoletas)", () => {
    const obsoletas = [...exercised].filter((id) => !canonical.has(id)).sort();
    expect(
      obsoletas,
      `entradas de cobertura que ya no existen como regla: ${obsoletas.join(", ")}`,
    ).toEqual([]);
  });

  for (const [id, call] of Object.entries(coverage)) {
    it(`THEN el guard emite ruleId "${id}" al ejercitarlo`, () => {
      const res = evaluateRules(call, { repoRoot });
      expect(res.ruleId).toBe(id);
    });
  }
});
