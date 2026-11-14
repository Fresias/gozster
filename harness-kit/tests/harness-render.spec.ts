import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// H-01 — valida el contrato de carga/validación de `harness-render.mjs`.
// Criterio de aceptación: un `project` sin `gate` => exit 1 con "missing key: gate".

const here = path.dirname(fileURLToPath(import.meta.url));
const renderPath = path.resolve(here, "..", "core", "scripts", "harness-render.mjs");

const VALID_HARNESS = { kit: "harness-kit", version: "2.0.0", out: ".harness" };

let overlay: string | undefined;

/** Crea un overlay temporal con un harness.json válido y el project.json dado. */
function makeOverlay(project: unknown): string {
  overlay = mkdtempSync(path.join(tmpdir(), "harness-overlay-"));
  writeFileSync(path.join(overlay, "harness.json"), JSON.stringify(VALID_HARNESS));
  writeFileSync(path.join(overlay, "project.json"), JSON.stringify(project));
  return overlay;
}

/** Corre el render contra un overlay; devuelve exit code y stderr. */
function runRender(dir: string): { code: number; stderr: string } {
  try {
    execFileSync(process.execPath, [renderPath, dir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stderr?: string };
    return { code: e.status ?? 1, stderr: e.stderr ?? "" };
  }
}

afterEach(() => {
  if (overlay) rmSync(overlay, { recursive: true, force: true });
  overlay = undefined;
});

describe("harness-render: carga y validación de contratos", () => {
  it("falla con exit 1 y 'missing key: gate' si el project no tiene gate", () => {
    const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"] });
    const { code, stderr } = runRender(dir);
    expect(code).toBe(1);
    expect(stderr).toContain("missing key: gate");
  });

  it("falla si una clave tiene el tipo incorrecto", () => {
    const dir = makeOverlay({ name: "demo", runtimes: "claude-code", gate: "npm test" });
    const { code, stderr } = runRender(dir);
    expect(code).toBe(1);
    expect(stderr).toContain("invalid type: runtimes");
  });

  it.each([null, [], "demo", 42])(
    "falla con 'invalid json: project.json (expected object)' si el project es %j",
    (project) => {
      const dir = makeOverlay(project);
      const { code, stderr } = runRender(dir);
      expect(code).toBe(1);
      expect(stderr).toContain("invalid json: project.json (expected object)");
      expect(stderr).not.toContain("TypeError");
    },
  );

  it("pasa cuando harness.json y project.json están completos", () => {
    const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
    const { code } = runRender(dir);
    expect(code).toBe(0);
  });

  describe("GOZS-525: Experience Library (Opción A: solo lecciones fijadas)", () => {
    it("GIVEN lecciones sin fijar (con o sin evidencia) WHEN corre el render THEN no existe la sección Experience Library y se liberan caracteres (Opción A)", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      const lessons = [
        { id: "l1", task: "T-1", lesson: "Lesson 1 with evidence", evidence: true, timestamp: "2026-11-01T10:00:00Z" },
        { id: "l2", task: "T-2", lesson: "Lesson 2 with metrics", metrics: { before: 10, after: 5 }, timestamp: "2026-11-02T10:00:00Z" },
        { id: "l3", task: "T-3", lesson: "Lesson 3 with delta", delta: -2, timestamp: "2026-11-03T10:00:00Z" },
        { id: "l4", task: "T-4", lesson: "Candidate c1-review on tool resolved task in 85290ms", timestamp: "2026-11-04T10:00:00Z" },
        { id: "l5", task: "T-5", lesson: "Lesson 5 citing c1 vs baseline: score +18", timestamp: "2026-11-05T10:00:00Z" },
      ];
      writeFileSync(path.join(dir, "experience_library.jsonl"), lessons.map((l) => JSON.stringify(l)).join("\n"));

      const { code } = runRender(dir);
      expect(code).toBe(0);

      const agentsMd = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(agentsMd).not.toContain("### Experience Library (Harness²)");
      expect(agentsMd).not.toContain("resolved task in");
      expect(agentsMd).not.toContain("Lesson 1 with evidence");
    });

    it("GIVEN una lección con pinned: true WHEN corre el render THEN aparece en AGENTS.md y las no fijadas no aparecen", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      const lessons = [
        { id: "l1", task: "T-1", lesson: "Pinned Critical Lesson 1", pinned: true, timestamp: "2026-11-01T10:00:00Z" },
        { id: "l2", task: "T-2", lesson: "Recent Lesson 2", evidence: true, timestamp: "2026-11-02T10:00:00Z" },
        { id: "l3", task: "T-3", lesson: "Recent Lesson 3", evidence: true, timestamp: "2026-11-03T10:00:00Z" },
      ];
      writeFileSync(path.join(dir, "experience_library.jsonl"), lessons.map((l) => JSON.stringify(l)).join("\n"));

      const { code } = runRender(dir);
      expect(code).toBe(0);

      const agentsMd = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(agentsMd).toContain("### Experience Library (Harness²)");
      expect(agentsMd).toContain("Pinned Critical Lesson 1");
      expect(agentsMd).not.toContain("Recent Lesson 2");
      expect(agentsMd).not.toContain("Recent Lesson 3");
    });

    it("GIVEN una entrada automática como 'Candidate c1 on x (c1 vs baseline: duration_ms -112)' WHEN corre el render THEN no aparece en AGENTS.md", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      const lessons = [
        { id: "l1", task: "T-1", lesson: "Candidate c1 on x (c1 vs baseline: duration_ms -112)", ppc: { winner_id: "c1", probe_passed: true } },
        { id: "l2", task: "T-2", lesson: "Candidate c2 on tool_guidance resolved task in 500ms", ppc: { winner_id: "c2" } },
      ];
      writeFileSync(path.join(dir, "experience_library.jsonl"), lessons.map((l) => JSON.stringify(l)).join("\n"));

      const { code } = runRender(dir);
      expect(code).toBe(0);

      const agentsMd = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(agentsMd).not.toContain("Candidate c1 on x");
      expect(agentsMd).not.toContain("resolved task in");
      expect(agentsMd).not.toContain("### Experience Library (Harness²)");
    });

    it("GIVEN un .harness/scope.json activo WHEN corre el render THEN tampoco aparecen lecciones automáticas", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      writeFileSync(path.join(dir, "scope.json"), JSON.stringify({ scope: ["database", "ui"] }));
      const lessons = [
        { id: "l1", task: "T-1", lesson: "Candidate c1 on database resolved task in 300ms", tags: ["database"], ppc: { winner_id: "c1" } },
        { id: "l2", task: "T-2", lesson: "Candidate c2 on ui (c2 vs baseline: duration_ms -100)", tags: ["ui"] },
      ];
      writeFileSync(path.join(dir, "experience_library.jsonl"), lessons.map((l) => JSON.stringify(l)).join("\n"));

      const { code } = runRender(dir);
      expect(code).toBe(0);

      const agentsMd = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(agentsMd).not.toContain("resolved task in");
      expect(agentsMd).not.toContain("Candidate c1");
      expect(agentsMd).not.toContain("Candidate c2");
      expect(agentsMd).not.toContain("### Experience Library (Harness²)");
    });

    it("GIVEN la biblioteca real del repo WHEN corre harness-render.mjs THEN AGENTS.md no contiene ninguna línea con resolved task in", () => {
      const repoAgentsMd = readFileSync(path.resolve(here, "..", "..", "..", "AGENTS.md"), "utf8");
      expect(repoAgentsMd).not.toContain("resolved task in");
    });

    it("GIVEN LEDGER.json WHEN se lee L-000 THEN tiene caveat y métricas originales intactas", () => {
      const ledgerPath = path.resolve(here, "..", "..", "docs", "harness-library", "LEDGER.json");
      const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
      const l0 = ledger.entries.find((e: { id: string }) => e.id === "L-000");
      expect(l0).toBeDefined();
      expect(typeof l0.caveat).toBe("string");
      expect(l0.caveat.length).toBeGreaterThan(0);
      expect(l0.metrics.before.totalEvents).toBe(4355);
      expect(l0.metrics.before.totalSessions).toBe(45);
    });

    it("GIVEN LEDGER.json WHEN se lee L-001 en etapa A THEN status = 'blocked', metrics.before = null, existen synthetic_before, caveat y start_condition", () => {
      const ledgerPath = path.resolve(here, "..", "..", "docs", "harness-library", "LEDGER.json");
      const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
      const l1 = ledger.entries.find((e: { id: string }) => e.id === "L-001");
      expect(l1).toBeDefined();
      expect(l1.status).toBe("blocked");
      expect(l1.metrics.before).toBeNull();
      expect(l1.metrics.synthetic_before).toBeDefined();
      expect(l1.metrics.synthetic_before.byRuntime["claude-code"]).toBeDefined();
      expect(l1.metrics.synthetic_before.byRuntime["antigravity"]).toBeDefined();
      expect(l1.window.before).toBeNull();
      expect(l1.window.after).toBeNull();
      expect(typeof l1.caveat).toBe("string");
      expect(l1.caveat).toContain("línea base sintética");
      expect(typeof l1.start_condition).toBe("string");
      expect(l1.start_condition).toContain("7 días corridos de telemetría real");
    });
  });

  describe("Criterio: Reglas específicas de runtime (antigravity.rules.md)", () => {
    it("GIVEN antigravity en runtimes WHEN corre harness-render.mjs THEN existe .agents/rules/harness-antigravity.md con el contenido de core/runtimes/antigravity.rules.md y figura en harness.lock", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["antigravity"], gate: "npm test" });
      const { code } = runRender(dir);
      expect(code).toBe(0);

      const generatedRulePath = path.join(dir, ".agents", "rules", "harness-antigravity.md");
      expect(existsSync(generatedRulePath)).toBe(true);

      const expectedContent = readFileSync(path.resolve(here, "..", "core", "runtimes", "antigravity.rules.md"), "utf8");
      expect(readFileSync(generatedRulePath, "utf8")).toBe(expectedContent);

      const lockPath = path.join(dir, "harness.lock");
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      expect(lock.artifacts[".agents/rules/harness-antigravity.md"]).toBeDefined();
    });

    it("GIVEN antigravity fuera de runtimes WHEN corre harness-render.mjs THEN ese archivo no se genera", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      const { code } = runRender(dir);
      expect(code).toBe(0);

      const generatedRulePath = path.join(dir, ".agents", "rules", "harness-antigravity.md");
      expect(existsSync(generatedRulePath)).toBe(false);

      const lockPath = path.join(dir, "harness.lock");
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      expect(lock.artifacts[".agents/rules/harness-antigravity.md"]).toBeUndefined();
    });

    it("GIVEN un cambio manual en .agents/rules/harness-antigravity.md WHEN corre harness-render.mjs --check THEN reporta drift", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["antigravity"], gate: "npm test" });
      const { code: renderCode } = runRender(dir);
      expect(renderCode).toBe(0);

      const generatedRulePath = path.join(dir, ".agents", "rules", "harness-antigravity.md");
      writeFileSync(generatedRulePath, "cambio manual no autorizado\n");

      try {
        execFileSync(process.execPath, [renderPath, "--check", dir], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        expect.fail("debió fallar por drift");
      } catch (err) {
        const e = err as { status?: number; stderr?: string };
        expect(e.status).toBe(1);
        expect(e.stderr).toContain("drift detected");
        expect(e.stderr).toContain(".agents/rules/harness-antigravity.md");
      }
    });

    it("GIVEN el render WHEN se mide AGENTS.md THEN su contenido y tamaño no cambian con la adición de reglas de runtime", () => {
      const dirWithout = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      runRender(dirWithout);
      const agentsWithout = readFileSync(path.join(dirWithout, "AGENTS.md"), "utf8");

      const dirWith = makeOverlay({ name: "demo", runtimes: ["claude-code", "antigravity"], gate: "npm test" });
      runRender(dirWith);
      const agentsWith = readFileSync(path.join(dirWith, "AGENTS.md"), "utf8");

      expect(agentsWith).toBe(agentsWithout);
      expect(Buffer.byteLength(agentsWith, "utf8")).toBeLessThanOrEqual(8000);
    });
  });
});
