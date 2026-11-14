import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error - mjs module
import { evaluateProbes, runCompose } from "../core/scripts/harness-compose.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..");
const composerDoc = path.join(kitDir, "core", "subagents", "harness-composer.md");
const composeScript = path.join(kitDir, "core", "scripts", "harness-compose.mjs");

describe("Harness² Subagente: harness-composer", () => {
  it("declara frontmatter válido con name y description", () => {
    expect(existsSync(composerDoc)).toBe(true);
    const content = readFileSync(composerDoc, "utf8");
    expect(content).toMatch(/^---\r?\nname:\s*harness-composer\r?\ndescription:/m);
  });

  it("documenta los criterios contrastivos y el esquema de salida", () => {
    const content = readFileSync(composerDoc, "utf8");
    expect(content).toContain("winner_id");
    expect(content).toContain("promote");
    expect(content).toContain("rationale");
    expect(content).toContain("lesson");
    expect(content).toContain("Ground-Truth Free");
  });
});

describe("Harness² Sintetizador: evaluateProbes", () => {
  it("rechaza promoción si ningún candidato pasó el probe", () => {
    const probes = [
      { candidate_id: "cand-1", passed: false, duration_ms: 200 },
      { candidate_id: "cand-2", passed: false, duration_ms: 300 },
    ];
    const res = evaluateProbes(probes);
    expect(res.winner_id).toBeNull();
    expect(res.promote).toBe(false);
  });

  it("selecciona el candidato con menor duración entre los que pasaron cuando la diferencia supera el margen", () => {
    const probes = [
      { candidate_id: "cand-slow", passed: true, duration_ms: 2200 },
      { candidate_id: "cand-fast", passed: true, duration_ms: 350 },
      { candidate_id: "cand-failed", passed: false, duration_ms: 100 },
    ];
    const res = evaluateProbes(probes);
    expect(res.winner_id).toBe("cand-fast");
    expect(res.promote).toBe(true);
    expect(res.duration_ms).toBe(350);
  });

  it("prioriza menor costo operacional (telemetría: tool_calls y bloques) sobre duración bruta", () => {
    const probes = [
      {
        candidate_id: "cand-friction",
        passed: true,
        duration_ms: 400,
        telemetry: { tool_calls: 10, blocks: 3 },
      },
      {
        candidate_id: "cand-clean",
        passed: true,
        duration_ms: 600,
        telemetry: { tool_calls: 3, blocks: 0 },
      },
    ];
    const res = evaluateProbes(probes);
    expect(res.winner_id).toBe("cand-clean");
    expect(res.promote).toBe(true);
  });

  it("GIVEN un candidato que agrega un test que falla en origin/main y pasa con su cambio WHEN corre compose THEN la lección dice '1 tests fail→pass, 0 regresiones'", () => {
    const probes = [
      {
        candidate_id: "baseline",
        passed: true,
        duration_ms: 3100,
        tests: {
          "tests/sample.spec.ts::nuevo": "failed",
        },
      },
      {
        candidate_id: "c1",
        passed: true,
        duration_ms: 3050,
        tests: {
          "tests/sample.spec.ts::nuevo": "passed",
        },
      },
    ];
    const res = evaluateProbes(probes);
    expect(res.winner_id).toBe("c1");
    expect(res.lesson).toContain("1 tests fail→pass, 0 regresiones");
    expect(res.lesson).not.toContain("resolved task in");
  });

  it("GIVEN dos sondas con los mismos resultados de tests y duraciones de 3042 ms y 3154 ms WHEN corre compose THEN lección dice 'sin diferencia de comportamiento medible' y no menciona milisegundos", () => {
    const probes = [
      {
        candidate_id: "baseline",
        passed: true,
        duration_ms: 3154,
        tests: { "tests/sample.spec.ts::ok": "passed" },
      },
      {
        candidate_id: "c1",
        passed: true,
        duration_ms: 3042,
        tests: { "tests/sample.spec.ts::ok": "passed" },
      },
    ];
    const res = evaluateProbes(probes);
    expect(res.winner_id).toBe("c1");
    expect(res.lesson).toContain("sin diferencia de comportamiento medible");
    expect(res.lesson).not.toMatch(/\d+\s*ms/);
    expect(res.lesson).not.toContain("resolved task in");
  });

  it("GIVEN los mismos resultados de tests y duraciones de 3000 ms y 9000 ms WHEN corre compose THEN lección indica duration_ms y supera el margen", () => {
    const probes = [
      {
        candidate_id: "baseline",
        passed: true,
        duration_ms: 9000,
        tests: { "tests/sample.spec.ts::ok": "passed" },
      },
      {
        candidate_id: "c1",
        passed: true,
        duration_ms: 3000,
        tests: { "tests/sample.spec.ts::ok": "passed" },
      },
    ];
    const res = evaluateProbes(probes);
    expect(res.winner_id).toBe("c1");
    expect(res.lesson).toMatch(/duration_ms\s*[-−]6000\s*\(supera el margen\)/);
    expect(res.lesson).not.toContain("resolved task in");
  });
});

describe("Harness² Sintetizador: runCompose (promoción y persistencia de experiencia)", () => {
  let tempWs: string | undefined;

  afterEach(() => {
    if (tempWs && existsSync(tempWs)) {
      rmSync(tempWs, { recursive: true, force: true });
      tempWs = undefined;
    }
  });

  function setupWorkspace(): string {
    tempWs = mkdtempSync(path.join(tmpdir(), "harness-compose-ws-"));
    const overlay = path.join(tempWs, "harness");
    mkdirSync(overlay, { recursive: true });

    writeFileSync(
      path.join(overlay, "harness.json"),
      JSON.stringify({ kit: "harness-kit", version: "2.0.0", out: ".harness" }),
    );
    writeFileSync(
      path.join(overlay, "project.json"),
      JSON.stringify({ name: "compose-test", runtimes: ["antigravity"], gate: "node -e 'process.exit(0)'" }),
    );
    writeFileSync(path.join(overlay, "tool_guidance.local.md"), "# Initial Guidance\n");

    return tempWs;
  }

  it("promueve la mutación ganadora y escribe la lección en experience_library.jsonl", () => {
    const ws = setupWorkspace();

    // Guardar reportes de probe
    const probesDir = path.join(ws, ".harness", "probes");
    mkdirSync(probesDir, { recursive: true });
    writeFileSync(
      path.join(probesDir, "probe-cand-slow.json"),
      JSON.stringify({ candidate_id: "cand-slow", passed: true, duration_ms: 1500 }),
    );
    writeFileSync(
      path.join(probesDir, "probe-cand-fast.json"),
      JSON.stringify({ candidate_id: "cand-fast", passed: true, duration_ms: 400 }),
    );

    // Guardar definición de candidatos
    const candidatesFile = path.join(ws, "candidates.json");
    writeFileSync(
      candidatesFile,
      JSON.stringify([
        {
          candidate_id: "cand-slow",
          target_component: "tool_guidance",
          file: "harness/tool_guidance.local.md",
          action: "append",
          content: "- slow rule.",
        },
        {
          candidate_id: "cand-fast",
          target_component: "tool_guidance",
          file: "harness/tool_guidance.local.md",
          action: "append",
          content: "- fast winning rule promoted.",
        },
      ]),
    );

    // Ejecutar compose
    const res = runCompose({
      workdir: ws,
      probes: probesDir,
      candidates: candidatesFile,
      task: "Optimize schema inspection",
      promote: true,
    });

    expect(res.winner_id).toBe("cand-fast");
    expect(res.promoted).toBe(true);

    // Verificar que la mutación se aplicó al arnés local
    const guidanceContent = readFileSync(path.join(ws, "harness", "tool_guidance.local.md"), "utf8");
    expect(guidanceContent).toContain("fast winning rule promoted");

    // Verificar que se registró la lección en experience_library.jsonl con bloque PPC y matriz de contraste
    const expLibContent = readFileSync(path.join(ws, "harness", "experience_library.jsonl"), "utf8");
    const parsedExp = JSON.parse(expLibContent);
    expect(parsedExp.lesson).toContain("cand-fast");
    expect(parsedExp.task).toBe("Optimize schema inspection");
    expect(parsedExp.verified).toBe(true);
    expect(parsedExp.tags).toContain("db");
    expect(parsedExp.ppc).toBeDefined();
    expect(parsedExp.ppc.winner_id).toBe("cand-fast");
    expect(parsedExp.ppc.candidates).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(parsedExp.ppc.contrast_matrix)).toBe(true);
    expect(parsedExp.ppc.contrast_matrix.length).toBeGreaterThanOrEqual(2);
  });

  it("bloquea promoción de mutaciones fuera de harness/ por seguridad", () => {
    const ws = setupWorkspace();
    const probesDir = path.join(ws, ".harness", "probes");
    mkdirSync(probesDir, { recursive: true });
    writeFileSync(
      path.join(probesDir, "probe-malicious.json"),
      JSON.stringify({ candidate_id: "malicious-1", passed: true, duration_ms: 100 }),
    );

    const candidatesFile = path.join(ws, "candidates.json");
    writeFileSync(
      candidatesFile,
      JSON.stringify([
        {
          candidate_id: "malicious-1",
          file: "core/guard/rules.json",
          action: "replace",
          content: "{}",
        },
      ]),
    );

    expect(() => {
      runCompose({
        workdir: ws,
        probes: probesDir,
        candidates: candidatesFile,
        promote: true,
      });
    }).toThrow(/security violation/);
  });

  it("GIVEN dos reportes de sonda WHEN corre harness-compose.mjs --task X THEN existen harness/experience/probes/X/*.json y el registro tiene reports_sha256 y contrast_version", () => {
    const ws = setupWorkspace();
    const probesDir = path.join(ws, ".harness", "probes");
    mkdirSync(probesDir, { recursive: true });

    writeFileSync(
      path.join(probesDir, "probe-c1.json"),
      JSON.stringify({
        candidate_id: "c1",
        passed: true,
        duration_ms: 1000,
        files_touched: ["harness/tool_guidance.local.md"],
      }),
    );
    writeFileSync(
      path.join(probesDir, "probe-baseline.json"),
      JSON.stringify({
        candidate_id: "baseline",
        passed: true,
        duration_ms: 1500,
        files_touched: ["harness/tool_guidance.local.md"],
      }),
    );

    const candidatesFile = path.join(ws, "candidates.json");
    writeFileSync(
      candidatesFile,
      JSON.stringify([
        {
          candidate_id: "c1",
          file: "harness/tool_guidance.local.md",
          action: "append",
          content: "# C1",
        },
      ]),
    );

    const res = runCompose({
      workdir: ws,
      probes: probesDir,
      candidates: candidatesFile,
      task: "GOZS-999",
      promote: true,
    });

    expect(res.winner_id).toBe("c1");

    // Verificar que los reportes se versionaron en harness/experience/probes/GOZS-999/
    const probesDestDir = path.join(ws, "harness", "experience", "probes", "GOZS-999");
    expect(existsSync(path.join(probesDestDir, "c1.json"))).toBe(true);
    expect(existsSync(path.join(probesDestDir, "baseline.json"))).toBe(true);

    // Verificar registro PPC
    const expFile = path.join(ws, "harness", "experience", "GOZS-999.jsonl");
    const exp = JSON.parse(readFileSync(expFile, "utf8"));
    expect(exp.ppc).toBeDefined();
    expect(exp.ppc.contrast_version).toBeDefined();
    expect(exp.ppc.reports_sha256).toBeDefined();
    expect(exp.ppc.reports_sha256["c1"]).toBeDefined();
    expect(exp.ppc.reports_sha256["baseline"]).toBeDefined();
  });
});
