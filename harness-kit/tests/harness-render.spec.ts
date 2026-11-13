import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const tempWorkspaces: string[] = [];

/** Crea un workspace temporal completo con overlay en harness/ */
function makeHarnessWorkspace(lessons: unknown[]): { workspace: string; overlay: string } {
  const ws = mkdtempSync(path.join(tmpdir(), "harness-render-test-"));
  tempWorkspaces.push(ws);
  const ov = path.join(ws, "harness");
  mkdirSync(ov, { recursive: true });
  writeFileSync(path.join(ov, "harness.json"), JSON.stringify(VALID_HARNESS));
  writeFileSync(
    path.join(ov, "project.json"),
    JSON.stringify({ name: "demo", runtimes: ["claude-code"], gate: "npm test" }),
  );
  writeFileSync(path.join(ov, "systemprompt.md"), "# System Prompt\n");
  writeFileSync(path.join(ov, "guardrails.local.md"), "# Local Guardrails\n");
  writeFileSync(
    path.join(ov, "experience_library.jsonl"),
    lessons.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
  return { workspace: ws, overlay: ov };
}

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
  while (tempWorkspaces.length > 0) {
    const ws = tempWorkspaces.pop();
    if (ws) {
      try {
        rmSync(ws, { recursive: true, force: true });
      } catch {}
    }
  }
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
});

describe("harness-render: criterio de pin B (lecciones con contraste y pinned como excepción)", () => {
  it("GIVEN 5 lecciones con evidencia y 2 sin evidencia WHEN corre el render THEN la 'Experience Library' muestra las 3 más recientes con evidencia", () => {
    const lessons = [
      { id: "exp-1", timestamp: "2026-11-13T10:00:00.000Z", task: "GOZS-101", lesson: "Candidate c1-a vs baseline: score +1", verified: true },
      { id: "exp-2", timestamp: "2026-11-13T11:00:00.000Z", task: "GOZS-102", lesson: "Candidate c1-b vs baseline: score +2", verified: true },
      { id: "exp-3", timestamp: "2026-11-13T12:00:00.000Z", task: "GOZS-103", lesson: "Candidate c1-c vs baseline: score +3", verified: true },
      { id: "exp-4", timestamp: "2026-11-13T13:00:00.000Z", task: "GOZS-104", lesson: "Candidate c1-d vs baseline: score +4", verified: true },
      { id: "exp-5", timestamp: "2026-11-13T14:00:00.000Z", task: "GOZS-105", lesson: "Candidate c1-e vs baseline: score +5", verified: true },
      { id: "exp-6", timestamp: "2026-11-13T15:00:00.000Z", task: "GOZS-106", lesson: "Actualización sin métricas de componentes", verified: true },
      { id: "exp-7", timestamp: "2026-11-13T16:00:00.000Z", task: "GOZS-107", lesson: "Ajuste de estilos generales", verified: true },
    ];

    const { workspace, overlay: ov } = makeHarnessWorkspace(lessons);
    const { code, stderr } = runRender(ov);
    expect(code).toBe(0);
    expect(stderr).toBe("");

    const agents = readFileSync(path.join(workspace, "AGENTS.md"), "utf8");
    expect(agents).toContain("Candidate c1-c vs baseline: score +3");
    expect(agents).toContain("Candidate c1-d vs baseline: score +4");
    expect(agents).toContain("Candidate c1-e vs baseline: score +5");
    expect(agents).not.toContain("Candidate c1-a vs baseline: score +1");
    expect(agents).not.toContain("Candidate c1-b vs baseline: score +2");
    expect(agents).not.toContain("Actualización sin métricas de componentes");
    expect(agents).not.toContain("Ajuste de estilos generales");
  });

  it("GIVEN una lección con pinned: true WHEN corre el render THEN aparece aunque no esté entre las 3 más recientes", () => {
    const lessons = [
      { id: "exp-1", timestamp: "2026-11-13T10:00:00.000Z", task: "GOZS-101", lesson: "Candidate c1-a vs baseline: score +1", verified: true, pinned: true },
      { id: "exp-2", timestamp: "2026-11-13T11:00:00.000Z", task: "GOZS-102", lesson: "Candidate c1-b vs baseline: score +2", verified: true },
      { id: "exp-3", timestamp: "2026-11-13T12:00:00.000Z", task: "GOZS-103", lesson: "Candidate c1-c vs baseline: score +3", verified: true },
      { id: "exp-4", timestamp: "2026-11-13T13:00:00.000Z", task: "GOZS-104", lesson: "Candidate c1-d vs baseline: score +4", verified: true },
      { id: "exp-5", timestamp: "2026-11-13T14:00:00.000Z", task: "GOZS-105", lesson: "Candidate c1-e vs baseline: score +5", verified: true },
      { id: "exp-6", timestamp: "2026-11-13T15:00:00.000Z", task: "GOZS-106", lesson: "Actualización sin métricas de componentes", verified: true },
      { id: "exp-7", timestamp: "2026-11-13T16:00:00.000Z", task: "GOZS-107", lesson: "Ajuste de estilos generales", verified: true },
    ];

    const { workspace, overlay: ov } = makeHarnessWorkspace(lessons);
    const { code, stderr } = runRender(ov);
    expect(code).toBe(0);
    expect(stderr).toBe("");

    const agents = readFileSync(path.join(workspace, "AGENTS.md"), "utf8");
    // Pinned exp-1 aparece aunque sea la más antigua
    expect(agents).toContain("Candidate c1-a vs baseline: score +1");
    // Y además aparecen las 3 más recientes con evidencia
    expect(agents).toContain("Candidate c1-c vs baseline: score +3");
    expect(agents).toContain("Candidate c1-d vs baseline: score +4");
    expect(agents).toContain("Candidate c1-e vs baseline: score +5");
    // exp-2 no está entre las 3 más recientes ni está pinned
    expect(agents).not.toContain("Candidate c1-b vs baseline: score +2");
    expect(agents).not.toContain("Actualización sin métricas de componentes");
    expect(agents).not.toContain("Ajuste de estilos generales");
  });
});
