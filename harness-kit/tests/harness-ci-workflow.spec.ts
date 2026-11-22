import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - mjs module
import { calculateDebt } from "../core/scripts/harness-propose.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..");
const repoRoot = path.resolve(kitDir, "..");
const auditScript = path.join(repoRoot, "scripts", "qa-harness-audit.mjs");
const renderScript = path.join(kitDir, "core", "scripts", "harness-render.mjs");
const ciWorkflowPath = path.join(repoRoot, ".github", "workflows", "ci.yml");
const mergeCheckWorkflowPath = path.join(repoRoot, ".github", "workflows", "harness-merge-check.yml");
const deployWorkflowPath = path.join(repoRoot, ".github", "workflows", "deploy-production.yml");

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
    it("GIVEN 14 lecciones sin procesar WHEN --debt-mode error THEN sale con 0; con 15 lecciones WHEN --debt-mode warn THEN sale con 0 e imprime ::warning y con --debt-mode error sale con 1 sin tocar harness/ real", () => {
      const tmpWorkdir = mkdtempSync(path.join(tmpdir(), "qa-harness-audit-"));
      createdTempDirs.push(tmpWorkdir);

      cpSync(path.join(repoRoot, "harness"), path.join(tmpWorkdir, "harness"), { recursive: true });
      execFileSync(process.execPath, [renderScript, path.join(tmpWorkdir, "harness")], {
        cwd: tmpWorkdir,
        stdio: "pipe",
      });

      // 1. Llevar deuda temporal exactamente a 14 sin procesar: no debe fallar (< 15)
      const initialDebt = calculateDebt(tmpWorkdir).unprocessed;
      const toReach14 = Math.max(0, 14 - initialDebt);
      for (let i = 1; i <= toReach14; i++) {
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
      expect(calculateDebt(tmpWorkdir).unprocessed).toBe(14);

      const stdoutAt14 = execFileSync(
        process.execPath,
        [auditScript, "--workdir", tmpWorkdir, "--debt-mode", "error"],
        {
          cwd: repoRoot,
          encoding: "utf8",
          stdio: "pipe",
        }
      );
      expect(stdoutAt14).toContain("OK: Deuda de arnés dentro del límite permitido");

      // 2. Agregar una lección más para llegar exactamente a 15: supera umbral rojo (>= 15)
      writeFileSync(
        path.join(tmpWorkdir, "harness", "experience", "GOZS-9999.jsonl"),
        JSON.stringify({
          id: "exp-temp-audit-15",
          task: "GOZS-9999",
          lesson: "Lección temporal de deuda para prueba de auditoría 15",
          verified: true,
        }) + "\n",
        "utf8"
      );
      expect(calculateDebt(tmpWorkdir).unprocessed).toBe(15);

      // 3. En modo warn: sale con 0 e imprime ::warning title=Harness debt::
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

      // 4. En modo error (o default): sale con código 1
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

    it("GIVEN ci.yml THEN el job principal ejecuta qa-harness-audit con --debt-mode warn y el job harness-debt usa fetch-depth: 2, notifica vía harness-debt-notify y audita con --debt-mode error", () => {
      const content = readFileSync(ciWorkflowPath, "utf8");
      expect(content).toMatch(/node scripts\/qa-harness-audit\.mjs --debt-mode warn/);
      expect(content).toMatch(/name:\s*Harness² lesson debt/);
      expect(content).toMatch(/node scripts\/qa-harness-audit\.mjs --debt-mode error/);

      const debtBlock = content.slice(content.indexOf("harness-debt:"));
      expect(debtBlock).toMatch(/fetch-depth:\s*2/);
      expect(debtBlock).toContain("MULTICA_LESSON_DEBT_WEBHOOK_URL: ${{ secrets.MULTICA_LESSON_DEBT_WEBHOOK_URL }}");
      expect(debtBlock).toContain("node harness-kit/core/scripts/harness-debt-notify.mjs");
      expect(debtBlock).not.toMatch(/set\s+-x|curl\s+-v|echo\s+.*MULTICA_LESSON_DEBT_WEBHOOK_URL/);
    });

    it("GIVEN workflows de GitHub THEN ningún uses apunta a @v4 de checkout o setup-node", () => {
      const ciContent = readFileSync(ciWorkflowPath, "utf8");
      const mergeContent = readFileSync(mergeCheckWorkflowPath, "utf8");

      expect(ciContent).not.toMatch(/uses:\s*actions\/checkout@v4/);
      expect(ciContent).not.toMatch(/uses:\s*actions\/setup-node@v4/);

      expect(mergeContent).not.toMatch(/uses:\s*actions\/checkout@v4/);
      expect(mergeContent).not.toMatch(/uses:\s*actions\/setup-node@v4/);
    });

    it("GIVEN ci.yml paralelizado (GOZS-651) THEN ejecuta typecheck, build, test-db y test-rest en paralelo, agrega en verify con if: always() y consolida post-merge en un solo job", () => {
      const content = readFileSync(ciWorkflowPath, "utf8");

      const jobsSection = content.slice(content.indexOf("jobs:"), content.indexOf("verify:"));
      expect(jobsSection).toMatch(/^\s{2}typecheck:/m);
      expect(jobsSection).toMatch(/^\s{2}build:/m);
      expect(jobsSection).toMatch(/^\s{2}test-db:/m);
      expect(jobsSection).toMatch(/^\s{2}test-rest:/m);
      expect(jobsSection).toContain("npx vitest run --project db");
      expect(jobsSection).toContain("npx vitest run --project unit --project harness");

      const verifyBlock = content.slice(content.indexOf("verify:"), content.indexOf("post-merge:"));
      expect(verifyBlock).toMatch(/needs:\s*\[typecheck,\s*build,\s*test-db,\s*test-rest\]/);
      expect(verifyBlock).toMatch(/if:\s*always\(\)/);
      expect(verifyBlock).toContain("needs.typecheck.result");
      expect(verifyBlock).toContain("needs.build.result");
      expect(verifyBlock).toContain("needs.test-db.result");
      expect(verifyBlock).toContain("needs.test-rest.result");

      const postMergeBlock = content.slice(content.indexOf("post-merge:"), content.indexOf("harness-debt:"));
      expect(postMergeBlock).toContain("github.event_name == 'push' && github.ref == 'refs/heads/main'");
      expect(postMergeBlock).toContain("node harness-kit/core/scripts/harness-propose.mjs --post-merge");
      expect(postMergeBlock).toContain("uses: actions/upload-artifact@v7");
    });

    it("GIVEN deploy-production.yml (GOZS-731 / GOZS-688) THEN exige check-migrations antes de deploy, usa CLI v3 y falla cerrado sin credenciales", () => {
      expect(existsSync(deployWorkflowPath)).toBe(true);
      const content = readFileSync(deployWorkflowPath, "utf8");

      expect(content).toContain("uses: actions/checkout@v7");
      expect(content).toContain("uses: actions/setup-node@v7");
      expect(content).toContain("uses: supabase/setup-cli@v3");
      expect(content).not.toMatch(/uses:\s*actions\/(checkout|setup-node)@v4/);
      expect(content).toContain("vars.PRODUCTION_DEPLOY_ENABLED == 'true'");
      expect(content).toContain("node scripts/check-supabase-migrations.mjs --remote");
      expect(content).toContain("supabase db push --remote=");

      const deployBlock = content.slice(content.indexOf("  deploy:"));
      expect(deployBlock).toMatch(/needs:\s*\[check-migrations\]/);
      expect(deployBlock).toMatch(/if:\s*success\(\)/);
      expect(deployBlock).toMatch(/permissions:\s*\r?\n\s*contents:\s*read/);
      expect(content).not.toMatch(/set\s+-x|echo\s+.*SUPABASE_(DB_URL|ACCESS_TOKEN|DB_PASSWORD)|echo\s+.*VERCEL_TOKEN/);
    });
  });
});
