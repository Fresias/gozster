import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
});
