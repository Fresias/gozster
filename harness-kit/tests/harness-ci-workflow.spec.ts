import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..");
const repoRoot = path.resolve(kitDir, "..");
const auditScript = path.join(repoRoot, "scripts", "qa-harness-audit.mjs");
const renderScript = path.join(kitDir, "core", "scripts", "harness-render.mjs");
const ciWorkflowPath = path.join(repoRoot, ".github", "workflows", "ci.yml");
const mergeCheckWorkflowPath = path.join(repoRoot, ".github", "workflows", "harness-merge-check.yml");

describe("Harness² CI Workflows & Audit Debt Mode", () => {
  const createdTempDirs: string[] = [];

  afterEach(() => {
    for (const d of createdTempDirs) {
      if (existsSync(d)) {
        try {
          rmSync(d, { recursive: true, force: true });
        } catch {}
      }
    }
    createdTempDirs.length = 0;
  });

  describe("qa-harness-audit --debt-mode warn|error", () => {
    it("GIVEN deuda de lecciones excedida en workdir aislado WHEN --debt-mode warn THEN sale con 0 e imprime ::warning; con --debt-mode error sale con 1 sin tocar harness/ real", () => {
      const tmpWorkdir = mkdtempSync(path.join(tmpdir(), "qa-harness-audit-"));
      createdTempDirs.push(tmpWorkdir);

      cpSync(path.join(repoRoot, "harness"), path.join(tmpWorkdir, "harness"), { recursive: true });
      execFileSync(process.execPath, [renderScript, path.join(tmpWorkdir, "harness")], {
        cwd: tmpWorkdir,
        stdio: "pipe",
      });

      // Crear 6 lecciones temporales válidas en el workdir temporal para superar el umbral de 5
      for (let i = 1; i <= 6; i++) {
        const file = path.join(tmpWorkdir, "harness", "experience", `GOZS-99${i}.jsonl`);
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
      }

      // 1. En modo warn: sale con 0 e imprime ::warning title=Harness debt::
      const stdoutWarn = execFileSync(
        process.execPath,
        [auditScript, "--workdir", tmpWorkdir, "--debt-mode", "warn"],
        {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: "pipe",
        }
      );
      expect(stdoutWarn).toContain("::warning title=Harness debt::");
      expect(stdoutWarn).toContain("sin procesar");

      // 2. En modo error (o default): sale con código 1
      let errorStatus: number | null = null;
      let errorOut = "";
      try {
        execFileSync(process.execPath, [auditScript, "--workdir", tmpWorkdir, "--debt-mode", "error"], {
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
    it("GIVEN harness-merge-check.yml THEN usa pull_request_target, no hace checkout del head ni npm ci, pasa --event-action y declara issues: write", () => {
      expect(existsSync(mergeCheckWorkflowPath)).toBe(true);
      const content = readFileSync(mergeCheckWorkflowPath, "utf8");

      expect(content).toMatch(/pull_request_target/);
      expect(content).toMatch(/edited/);
      expect(content).toMatch(/labeled/);
      expect(content).not.toMatch(/npm\s+ci/);
      expect(content).not.toContain("github.event.pull_request.head.sha");
      expect(content).not.toMatch(/ref:\s*.*head\.ref/);
      expect(content).toContain("--event-action");
      expect(content).toMatch(/issues:\s*write/);
    });

    it("GIVEN ci.yml THEN no menciona harness-merge-check.mjs, incluye include-hidden-files: true, verify solo tiene contents: read y conserva job name Typecheck, Lint & Test", () => {
      expect(existsSync(ciWorkflowPath)).toBe(true);
      const content = readFileSync(ciWorkflowPath, "utf8");

      expect(content).not.toContain("harness-merge-check.mjs");
      expect(content).not.toMatch(/types:.*edited/);
      expect(content).toContain("name: Typecheck, Lint & Test");
      expect(content).toContain("include-hidden-files: true");
      const verifyBlock = content.slice(content.indexOf("verify:"), content.indexOf("harness-debt:"));
      expect(verifyBlock).toMatch(/permissions:\s*\r?\n\s*contents:\s*read\r?\n\s*\r?\n\s*steps:/);
    });

    it("GIVEN ci.yml THEN contiene npm run build", () => {
      const content = readFileSync(ciWorkflowPath, "utf8");
      expect(content).toMatch(/run:\s*npm\s+run\s+build/);
    });

    it("GIVEN ci.yml THEN el job principal ejecuta qa-harness-audit con --debt-mode warn y existe un job separado de deuda para push a main", () => {
      const content = readFileSync(ciWorkflowPath, "utf8");
      expect(content).toMatch(/node scripts\/qa-harness-audit\.mjs --debt-mode warn/);
      expect(content).toMatch(/name:\s*Harness² lesson debt/);
      expect(content).toMatch(/node scripts\/qa-harness-audit\.mjs --debt-mode error/);
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
