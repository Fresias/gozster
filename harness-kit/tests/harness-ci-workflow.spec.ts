import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..");
const repoRoot = path.resolve(kitDir, "..");
const auditScript = path.join(repoRoot, "scripts", "qa-harness-audit.mjs");
const ciWorkflowPath = path.join(repoRoot, ".github", "workflows", "ci.yml");
const mergeCheckWorkflowPath = path.join(repoRoot, ".github", "workflows", "harness-merge-check.yml");

describe("Harness² CI Workflows & Audit Debt Mode", () => {
  const createdTempFiles: string[] = [];

  afterEach(() => {
    for (const f of createdTempFiles) {
      if (existsSync(f)) {
        try {
          unlinkSync(f);
        } catch {}
      }
    }
    createdTempFiles.length = 0;
  });

  describe("qa-harness-audit --debt-mode warn|error", () => {
    it("GIVEN deuda de lecciones excedida WHEN --debt-mode warn THEN sale con 0 e imprime ::warning; con --debt-mode error sale con 1", () => {
      // Crear 6 lecciones temporales válidas para superar el umbral de 5
      for (let i = 1; i <= 6; i++) {
        const file = path.join(repoRoot, "harness", "experience", `GOZS-99${i}.jsonl`);
        writeFileSync(
          file,
          JSON.stringify({
            id: `exp-temp-audit-${i}`,
            task: `GOZS-99${i}`,
            lesson: `Lección temporal de deuda para prueba de auditoría ${i}`,
            verified: true,
          }) + "\n",
          "utf8"
        );
        createdTempFiles.push(file);
      }

      // 1. En modo warn: sale con 0 e imprime ::warning title=Harness debt::
      const stdoutWarn = execFileSync(process.execPath, [auditScript, "--debt-mode", "warn"], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: "pipe",
      });
      expect(stdoutWarn).toContain("::warning title=Harness debt::");
      expect(stdoutWarn).toContain("sin procesar");

      // 2. En modo error (o default): sale con código 1
      let errorStatus: number | null = null;
      let errorOut = "";
      try {
        execFileSync(process.execPath, [auditScript, "--debt-mode", "error"], {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (err: any) {
        errorStatus = err.status;
        errorOut = (err.stderr || "") + (err.stdout || "");
      }

      expect(errorStatus).toBe(1);
      expect(errorOut).toContain("Deuda de lecciones de arnés excedida");
    });
  });

  describe("Static workflow verification (.github/workflows)", () => {
    it("GIVEN harness-merge-check.yml THEN incluye edited y labeled y no ejecuta npm ci", () => {
      expect(existsSync(mergeCheckWorkflowPath)).toBe(true);
      const content = readFileSync(mergeCheckWorkflowPath, "utf8");

      expect(content).toMatch(/edited/);
      expect(content).toMatch(/labeled/);
      expect(content).not.toMatch(/npm\s+ci/);
    });

    it("GIVEN ci.yml THEN no menciona harness-merge-check.mjs, no incluye edited, y conserva job name Typecheck, Lint & Test", () => {
      expect(existsSync(ciWorkflowPath)).toBe(true);
      const content = readFileSync(ciWorkflowPath, "utf8");

      expect(content).not.toContain("harness-merge-check.mjs");
      expect(content).not.toMatch(/types:.*edited/);
      expect(content).toContain("name: Typecheck, Lint & Test");
    });

    it("GIVEN ci.yml THEN contiene npm run build", () => {
      const content = readFileSync(ciWorkflowPath, "utf8");
      expect(content).toMatch(/run:\s*npm\s+run\s+build/);
    });

    it("GIVEN workflows de GitHub THEN ningún uses apunta a @v4 de checkout o setup-node", () => {
      const ciContent = readFileSync(ciWorkflowPath, "utf8");
      const mergeContent = readFileSync(mergeCheckWorkflowPath, "utf8");

      expect(ciContent).not.toMatch(/uses:\s*actions\/checkout@v4/);
      expect(ciContent).not.toMatch(/uses:\s*actions\/setup-node@v4/);

      expect(mergeContent).not.toMatch(/uses:\s*actions\/checkout@v4/);
      expect(mergeContent).not.toMatch(/uses:\s*actions\/setup-node@v4/);
    });
  });
});
