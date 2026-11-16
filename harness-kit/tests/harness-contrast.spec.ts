import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error - mjs module
import { evaluateCandidates } from "../core/scripts/harness-contrast.mjs";
// @ts-expect-error - mjs module
import { deriveTags } from "../core/scripts/harness-compose.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const contrastScript = path.resolve(here, "..", "core", "scripts", "harness-contrast.mjs");

describe("Harness²: harness-contrast (Validación Semántica Cruzada y Selección)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "harness-contrast-test-"));
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it("selecciona al candidato con menor duración cuando ambos son válidos y dentro de scope", () => {
    const reports = [
      {
        candidate_id: "cand-slow",
        passed: true,
        duration_ms: 3500,
        files_touched: ["harness/tool_guidance.local.md"],
        in_scope_files: ["harness/tool_guidance.local.md"],
        out_of_scope_files: [],
      },
      {
        candidate_id: "cand-fast",
        passed: true,
        duration_ms: 1200,
        files_touched: ["harness/tool_guidance.local.md"],
        in_scope_files: ["harness/tool_guidance.local.md"],
        out_of_scope_files: [],
      },
    ];

    const result = evaluateCandidates(reports, { strictScope: false });
    expect(result.winner_id).toBe("cand-fast");
    expect(result.contrast_matrix[0]!.candidate_id).toBe("cand-fast");
    expect(result.contrast_matrix[0]!.score).toBeGreaterThan(result.contrast_matrix[1]!.score);
  });

  it("aplica penalización severa por archivos fuera de scope en modo flexible", () => {
    const reports = [
      {
        candidate_id: "cand-scoped",
        passed: true,
        duration_ms: 2000,
        files_touched: ["src/lib/types.ts"],
        in_scope_files: ["src/lib/types.ts"],
        out_of_scope_files: [],
      },
      {
        candidate_id: "cand-polluted",
        passed: true,
        duration_ms: 1800,
        files_touched: ["src/lib/types.ts", "package.json", "src/unrelated.ts"],
        in_scope_files: ["src/lib/types.ts"],
        out_of_scope_files: ["package.json", "src/unrelated.ts"],
      },
    ];

    const result = evaluateCandidates(reports, { strictScope: false });
    expect(result.winner_id).toBe("cand-scoped");
    const polluted = result.contrast_matrix.find((c: any) => c.candidate_id === "cand-polluted")!;
    expect(polluted.out_of_scope_count).toBe(2);
    // 2 files out of scope = -400 pts penalty
    expect(polluted.score).toBeLessThan(700);
  });

  it("descalifica con hard reject cuando --strict-scope está activo y hay archivos fuera de scope", () => {
    const reports = [
      {
        candidate_id: "cand-clean",
        passed: true,
        duration_ms: 2200,
        files_touched: ["src/lib/types.ts"],
        in_scope_files: ["src/lib/types.ts"],
        out_of_scope_files: [],
      },
      {
        candidate_id: "cand-divergent",
        passed: true,
        duration_ms: 1000,
        files_touched: ["src/lib/types.ts", "supabase/migrations/999_fake.sql"],
        in_scope_files: ["src/lib/types.ts"],
        out_of_scope_files: ["supabase/migrations/999_fake.sql"],
      },
    ];

    const result = evaluateCandidates(reports, { strictScope: true });
    expect(result.winner_id).toBe("cand-clean");
    const divergent = result.contrast_matrix.find((c: any) => c.candidate_id === "cand-divergent")!;
    expect(divergent.disqualified).toBe(true);
    expect(divergent.reason).toContain("strict scope violation");
  });

  it("descalifica a cualquier candidato cuyo gate haya fallado (passed: false)", () => {
    const reports = [
      {
        candidate_id: "cand-broken",
        passed: false,
        duration_ms: 500,
        stderr_preview: "TypeScript type error in routine.tsx",
        files_touched: ["harness/tool_guidance.local.md"],
      },
      {
        candidate_id: "cand-ok",
        passed: true,
        duration_ms: 1500,
        files_touched: ["harness/tool_guidance.local.md"],
      },
    ];

    const result = evaluateCandidates(reports);
    expect(result.winner_id).toBe("cand-ok");
    const broken = result.contrast_matrix.find((c: any) => c.candidate_id === "cand-broken")!;
    expect(broken.disqualified).toBe(true);
  });

  it("ejecuta el script vía CLI con --reports y flag --json", () => {
    const reportsFile = path.join(tmpDir, "reports.json");
    writeFileSync(
      reportsFile,
      JSON.stringify([
        { candidate_id: "A", passed: true, duration_ms: 1000, out_of_scope_files: [] },
        { candidate_id: "B", passed: true, duration_ms: 2000, out_of_scope_files: ["other.ts"] },
      ]),
    );

    const out = execFileSync(process.execPath, [contrastScript, "--reports", reportsFile, "--json"], {
      encoding: "utf8",
    });

    const parsed = JSON.parse(out);
    expect(parsed.winner_id).toBe("A");
    expect(parsed.total_candidates).toBe(2);
  });

  // Criterios de Aceptación (Gherkin) Harness² v2
  it("GIVEN dos sondas con los mismos resultados de tests y duraciones de 3042 ms y 3154 ms WHEN corre el contraste THEN verdict: 'tie' y la lección no menciona milisegundos", () => {
    const reports = [
      {
        candidate_id: "baseline",
        passed: true,
        duration_ms: 3154,
        tests: { "tests/sample.spec.ts::debe pasar": "passed" },
      },
      {
        candidate_id: "c1",
        passed: true,
        duration_ms: 3042,
        tests: { "tests/sample.spec.ts::debe pasar": "passed" },
      },
    ];

    const result = evaluateCandidates(reports);
    expect(result.contrast_version).toBe("2.0.0");
    expect(result.verdict).toBe("tie");
    expect(result.winner_id).toBe("c1");
  });

  it("GIVEN los mismos resultados de tests y duraciones de 3000 ms y 9000 ms WHEN corre el contraste THEN verdict: 'duration'", () => {
    const reports = [
      {
        candidate_id: "baseline",
        passed: true,
        duration_ms: 9000,
        tests: { "tests/sample.spec.ts::debe pasar": "passed" },
      },
      {
        candidate_id: "c1",
        passed: true,
        duration_ms: 3000,
        tests: { "tests/sample.spec.ts::debe pasar": "passed" },
      },
    ];

    const result = evaluateCandidates(reports);
    expect(result.contrast_version).toBe("2.0.0");
    expect(result.verdict).toBe("duration");
    expect(result.winner_id).toBe("c1");
  });

  it("GIVEN un candidato que hace fallar un test que pasaba en la baseline WHEN corre el contraste THEN queda descalificado con motivo regressed", () => {
    const reports = [
      {
        candidate_id: "baseline",
        passed: true,
        duration_ms: 3000,
        tests: {
          "tests/sample.spec.ts::test 1": "passed",
          "tests/sample.spec.ts::test 2": "passed",
        },
      },
      {
        candidate_id: "c1-broken",
        passed: true,
        duration_ms: 2500,
        tests: {
          "tests/sample.spec.ts::test 1": "passed",
          "tests/sample.spec.ts::test 2": "failed",
        },
      },
    ];

    const result = evaluateCandidates(reports);
    expect(result.contrast_version).toBe("2.0.0");
    const candidateEntry = result.contrast_matrix.find((c: any) => c.candidate_id === "c1-broken")!;
    expect(candidateEntry.disqualified).toBe(true);
    expect(candidateEntry.reason).toContain("regressed");
  });

  it("GIVEN un candidato que agrega un test que falla en origin/main y pasa con su cambio WHEN corre el contraste THEN veredicto es behavioral con fixed: 1", () => {
    const reports = [
      {
        candidate_id: "baseline",
        passed: true,
        duration_ms: 3100,
        tests: {
          "tests/sample.spec.ts::test 1": "passed",
          "tests/sample.spec.ts::nuevo test": "failed",
        },
      },
      {
        candidate_id: "c1-fixed",
        passed: true,
        duration_ms: 3050,
        tests: {
          "tests/sample.spec.ts::test 1": "passed",
          "tests/sample.spec.ts::nuevo test": "passed",
        },
      },
    ];

    const result = evaluateCandidates(reports);
    expect(result.contrast_version).toBe("2.0.0");
    expect(result.verdict).toBe("behavioral");
    expect(result.winner_id).toBe("c1-fixed");
    const c1 = result.contrast_matrix.find((c: any) => c.candidate_id === "c1-fixed")!;
    expect(c1.fixed).toBe(1);
    expect(c1.regressed).toBe(0);
  });

  it("GIVEN un baseline con 14 tests (2 en falla) y un candidato c1 con 12 tests (0 en falla) y files_touched: [] WHEN evaluateCandidates evalúa la matriz THEN c1 es descalificado y no hay ganador behavioral (reproducción GOZS-540)", () => {
    const baseTests: Record<string, string> = {};
    const candTests: Record<string, string> = {};
    for (let i = 1; i <= 12; i++) {
      baseTests[`harness-kit/tests/guard-cli.contract.spec.ts::test ${i}`] = "passed";
      candTests[`harness-kit/tests/guard-cli.contract.spec.ts::test ${i}`] = "passed";
    }
    baseTests["harness-kit/tests/guard-cli.contract.spec.ts::H-07 test 13"] = "failed";
    baseTests["harness-kit/tests/guard-cli.contract.spec.ts::H-07 test 14"] = "failed";

    const reports = [
      {
        candidate_id: "baseline",
        passed: false,
        duration_ms: 3741,
        files_touched: [],
        tests: baseTests,
      },
      {
        candidate_id: "c1-harness-p2-backlog",
        passed: true,
        duration_ms: 3585,
        files_touched: [],
        tests: candTests,
      },
    ];

    const result = evaluateCandidates(reports);
    const c1 = result.contrast_matrix.find((c: any) => c.candidate_id === "c1-harness-p2-backlog")!;
    expect(c1.disqualified).toBe(true);
    expect(c1.fixed).toBe(0);
    expect(result.winner_id).toBeNull();
    expect(result.verdict).not.toBe("behavioral");
  });

  it("GIVEN un candidato que toca archivos pero ejecuta menos tests u omite un test de baseline WHEN evaluateCandidates evalúa THEN queda descalificado", () => {
    const reports = [
      {
        candidate_id: "baseline",
        passed: true,
        duration_ms: 3000,
        files_touched: [],
        tests: {
          "tests/a.spec.ts::t1": "passed",
          "tests/a.spec.ts::t2": "passed",
        },
      },
      {
        candidate_id: "c1-partial",
        passed: true,
        duration_ms: 2800,
        files_touched: ["harness/guardrails.local.md"],
        tests: {
          "tests/a.spec.ts::t1": "passed",
        },
      },
    ];

    const result = evaluateCandidates(reports);
    const c1 = result.contrast_matrix.find((c: any) => c.candidate_id === "c1-partial")!;
    expect(c1.disqualified).toBe(true);
    expect(c1.reason).toContain("baseline tests");
  });

  it("GIVEN un baseline con passed: false y un candidato con fixed: 0 WHEN evaluateCandidates calcula el veredicto THEN nunca emite verdict: 'behavioral'", () => {
    const reports = [
      {
        candidate_id: "baseline",
        passed: false,
        duration_ms: 3200,
        files_touched: [],
        tests: {
          "tests/sample.spec.ts::test 1": "passed",
        },
      },
      {
        candidate_id: "c1-no-fixes",
        passed: true,
        duration_ms: 3100,
        files_touched: ["harness/guardrails.local.md"],
        tests: {
          "tests/sample.spec.ts::test 1": "passed",
        },
      },
    ];

    const result = evaluateCandidates(reports);
    expect(result.winner_id).toBe("c1-no-fixes");
    expect(result.verdict).not.toBe("behavioral");
    expect(result.verdict).toBe("tie");
  });

  it("GIVEN un cambio puramente documental donde baseline y el candidato corren los mismos tests (100% pass en ambos) y el candidato tiene files_touched.length > 0 WHEN evaluateCandidates evalúa THEN permite verdict: 'tie'", () => {
    const reports = [
      {
        candidate_id: "baseline",
        passed: true,
        duration_ms: 3100,
        files_touched: [],
        tests: {
          "tests/sample.spec.ts::test 1": "passed",
          "tests/sample.spec.ts::test 2": "passed",
        },
      },
      {
        candidate_id: "c1-docs",
        passed: true,
        duration_ms: 3050,
        files_touched: ["harness/tool_guidance.local.md"],
        tests: {
          "tests/sample.spec.ts::test 1": "passed",
          "tests/sample.spec.ts::test 2": "passed",
        },
      },
    ];

    const result = evaluateCandidates(reports);
    const c1 = result.contrast_matrix.find((c: any) => c.candidate_id === "c1-docs")!;
    expect(c1.disqualified).toBe(false);
    expect(result.winner_id).toBe("c1-docs");
    expect(result.verdict).toBe("tie");
  });

  it("deriveTags no asigna 'auth' por coincidencia de subcadena con harness-authorized o author", () => {
    const tags = deriveTags(
      {
        candidate_id: "c1-harness-authorized",
        target_component: "harness/guardrails.local.md",
        rationale: "authored by PM on harness-authorized branch with anti-token-waste rules",
      },
      "GOZS-541",
    );
    expect(tags).not.toContain("auth");
    expect(deriveTags({ candidate_id: "c1-login-rbac", rationale: "fix auth login" }, "GOZS-541")).toContain("auth");
  });
});
