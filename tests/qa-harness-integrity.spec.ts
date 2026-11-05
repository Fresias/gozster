import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

describe("QA Invariants: Auditoría Automática de Harness² y Experience Loop", () => {
  const repoRoot = path.resolve(__dirname, "..");
  const overlayDir = path.join(repoRoot, "harness");
  const kitDir = path.join(repoRoot, "harness-kit");

  it("GIVEN el repositorio THEN los 8 componentes de Harness² existen físicamente", () => {
    const requiredFiles = [
      path.join(overlayDir, "systemprompt.md"),
      path.join(kitDir, "core", "guardrails.md"),
      path.join(overlayDir, "guardrails.local.md"),
      path.join(overlayDir, "LongTermMEMORY.md"),
      path.join(overlayDir, "experience_library.jsonl"),
      path.join(overlayDir, "tool_guidance.local.md"),
      path.join(kitDir, "core", "subagents", "harness-proposer.md"),
      path.join(kitDir, "core", "subagents", "harness-composer.md"),
      path.join(kitDir, "core", "scripts", "harness-learn.sh"),
      path.join(kitDir, "core", "scripts", "harness-telemetry.mjs"),
      path.join(kitDir, "core", "scripts", "harness-probe.mjs"),
    ];

    for (const file of requiredFiles) {
      expect(existsSync(file), `Componente faltante: ${path.relative(repoRoot, file)}`).toBe(true);
    }
  });

  it("GIVEN experience_library.jsonl THEN contiene lecciones verificadas con task y lesson válidos", () => {
    const expLibPath = path.join(overlayDir, "experience_library.jsonl");
    expect(existsSync(expLibPath)).toBe(true);

    const lines = readFileSync(expLibPath, "utf8").trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    for (let i = 0; i < lines.length; i++) {
      const parsed = JSON.parse(lines[i]!);
      expect(parsed.task, `Línea ${i + 1} sin task`).toBeDefined();
      expect(parsed.lesson, `Línea ${i + 1} sin lesson`).toBeDefined();
      expect(parsed.verified, `Línea ${i + 1} no está verificada`).toBe(true);
    }
  });

  it("GIVEN AGENTS.md THEN respeta estrictamente el presupuesto (<150 líneas, <=8000 caracteres)", () => {
    const agentsPath = path.join(repoRoot, "AGENTS.md");
    expect(existsSync(agentsPath)).toBe(true);

    const content = readFileSync(agentsPath, "utf8").replace(/\r\n/g, "\n");
    const lines = content.split("\n");

    expect(lines.length).toBeLessThan(150);
    expect(content.length).toBeLessThanOrEqual(8000);
  });

  it("GIVEN harness-render.mjs THEN la salida está 100% libre de drift (--check exit 0)", () => {
    const renderScript = path.join(kitDir, "core", "scripts", "harness-render.mjs");
    expect(existsSync(renderScript)).toBe(true);

    let output = "";
    expect(() => {
      output = execSync(`node "${renderScript}" --check`, { cwd: repoRoot, encoding: "utf8" });
    }).not.toThrow();

    expect(output).toContain("harness check OK (no drift)");
  });
});
