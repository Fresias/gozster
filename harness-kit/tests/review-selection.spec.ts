import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// H-11 Parte B — Protocolo Selection de 6 niveles (HARNESS-2.0-SPEC §7.4).
// Criterio de aceptación (Gherkin):
//   GIVEN un PR nuevo THEN la plantilla incluye la tabla de 6 niveles a completar.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const LEVELS = [
  "Delivery",
  "Conformance",
  "Fidelity",
  "Internal Consistency",
  "Operational Fitness",
  "Finish",
];

const read = (rel: string) => readFileSync(path.join(repoRoot, rel), "utf8");

describe("H-11 Parte B: Protocolo Selection de 6 niveles", () => {
  for (const file of [
    ".github/pull_request_template.md",
    "harness-kit/core/templates/review-selection.md",
  ]) {
    it(`GIVEN ${file} THEN incluye la tabla de 6 niveles a completar`, () => {
      const content = read(file);
      LEVELS.forEach((level, i) => {
        expect(content).toMatch(new RegExp(`^\\| ${i + 1} \\| ${level} \\|`, "m"));
      });
      expect(content).toContain("| ✅/❌ |");
    });
  }

  it("GIVEN el system prompt (kit y overlay) THEN referencia el protocolo", () => {
    expect(read("harness-kit/core/templates/systemprompt.md.tmpl")).toContain("review-selection.md");
    expect(read("harness/systemprompt.md")).toContain("review-selection.md");
  });
});
