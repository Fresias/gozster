import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  describe("Criterio B: Experience Library y política de pin", () => {
    it("GIVEN 5 lecciones con evidencia y 2 sin evidencia WHEN corre el render THEN la Experience Library muestra las 3 más recientes con evidencia", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      const lessons = [
        { id: "l1", task: "T-1", lesson: "Lesson 1 with evidence", evidence: true, timestamp: "2026-11-01T10:00:00Z" },
        { id: "l2", task: "T-2", lesson: "Lesson 2 with metrics", metrics: { before: 10, after: 5 }, timestamp: "2026-11-02T10:00:00Z" },
        { id: "l3", task: "T-3", lesson: "Lesson 3 with delta", delta: -2, timestamp: "2026-11-03T10:00:00Z" },
        { id: "l4", task: "T-4", lesson: "Lesson 4 with ppc", ppc: { winner_id: "c1" }, timestamp: "2026-11-04T10:00:00Z" },
        { id: "l5", task: "T-5", lesson: "Lesson 5 citing c1 vs baseline: score +18", timestamp: "2026-11-05T10:00:00Z" },
        { id: "l6", task: "T-6", lesson: "Lesson 6 recent without evidence", timestamp: "2026-11-06T10:00:00Z" },
        { id: "l7", task: "T-7", lesson: "Lesson 7 recent no evidence", timestamp: "2026-11-07T10:00:00Z" },
      ];
      writeFileSync(path.join(dir, "experience_library.jsonl"), lessons.map((l) => JSON.stringify(l)).join("\n"));

      const { code } = runRender(dir);
      expect(code).toBe(0);

      const agentsMd = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(agentsMd).toContain("### Experience Library (Harness²)");
      expect(agentsMd).toContain("Lesson 3 with delta");
      expect(agentsMd).toContain("Lesson 4 with ppc");
      expect(agentsMd).toContain("Lesson 5 citing c1 vs baseline: score +18");
      expect(agentsMd).not.toContain("Lesson 1 with evidence");
      expect(agentsMd).not.toContain("Lesson 2 with metrics");
      expect(agentsMd).not.toContain("Lesson 6 recent without evidence");
      expect(agentsMd).not.toContain("Lesson 7 recent no evidence");
    });

    it("GIVEN una lección con pinned: true WHEN corre el render THEN aparece aunque no esté entre las 3 más recientes", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      const lessons = [
        { id: "l1", task: "T-1", lesson: "Pinned Critical Lesson 1", pinned: true, timestamp: "2026-11-01T10:00:00Z" },
        { id: "l2", task: "T-2", lesson: "Recent Lesson 2", evidence: true, timestamp: "2026-11-02T10:00:00Z" },
        { id: "l3", task: "T-3", lesson: "Recent Lesson 3", evidence: true, timestamp: "2026-11-03T10:00:00Z" },
        { id: "l4", task: "T-4", lesson: "Recent Lesson 4", evidence: true, timestamp: "2026-11-04T10:00:00Z" },
        { id: "l5", task: "T-5", lesson: "Recent Lesson 5", evidence: true, timestamp: "2026-11-05T10:00:00Z" },
      ];
      writeFileSync(path.join(dir, "experience_library.jsonl"), lessons.map((l) => JSON.stringify(l)).join("\n"));

      const { code } = runRender(dir);
      expect(code).toBe(0);

      const agentsMd = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(agentsMd).toContain("Pinned Critical Lesson 1");
      expect(agentsMd).toContain("Recent Lesson 3");
      expect(agentsMd).toContain("Recent Lesson 4");
      expect(agentsMd).toContain("Recent Lesson 5");
      expect(agentsMd).not.toContain("Recent Lesson 2");
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

    it("GIVEN LEDGER.json WHEN se lee L-001 THEN tiene metrics.before con byRuntime y window.after con fechas", () => {
      const ledgerPath = path.resolve(here, "..", "..", "docs", "harness-library", "LEDGER.json");
      const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
      const l1 = ledger.entries.find((e: { id: string }) => e.id === "L-001");
      expect(l1).toBeDefined();
      expect(l1.metrics.before.byRuntime).toBeDefined();
      expect(l1.metrics.before.byRuntime["claude-code"]).toBeDefined();
      expect(l1.metrics.before.byRuntime["antigravity"]).toBeDefined();
      expect(typeof l1.window.after.start).toBe("string");
      expect(typeof l1.window.after.end).toBe("string");
      expect(l1.window.after.start).not.toBeNull();
      expect(l1.window.after.end).not.toBeNull();
    });
  });
});
