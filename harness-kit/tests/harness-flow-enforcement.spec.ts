import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error - mjs module
import { evaluateRules } from "../core/guard/guard-core.mjs";
// @ts-expect-error - mjs module
import { normalize } from "../core/guard/normalize.mjs";
// @ts-expect-error - mjs module
import { evaluateAuthorization, evaluateMerge, fetchPrFiles, isHarnessPath, issueFromBranch, parseSealBlock } from "../core/scripts/harness-merge-check.mjs";
// @ts-expect-error - mjs module
import { evaluateCandidates, hashReport, CONTRAST_VERSION } from "../core/scripts/harness-contrast.mjs";
// @ts-expect-error - mjs module
import { evaluateProbes } from "../core/scripts/harness-compose.mjs";

// GOZS-428 — Harness² flow enforcement. Gherkin:
//   GIVEN a PR branch <type>/<n>-slug WHEN the gate runs without harness/experience/<ISSUE>.jsonl THEN it fails.
//   GIVEN gh pr merge WHEN seal != PR head, lesson missing, or harness files without label + PPC THEN blocked.
//   GIVEN a write to harness sources (Write/Edit/Bash/PowerShell) on a non-harness branch THEN blocked.
//   GIVEN an overlay with BOM, control chars or non-UTF-8 THEN render fails with file + line.

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.resolve(here, "..", "core", "scripts");
const gateScript = path.join(scripts, "harness-gate.sh").replace(/\\/g, "/");
const learnScript = path.join(scripts, "harness-learn.sh").replace(/\\/g, "/");
const renderScript = path.join(scripts, "harness-render.mjs");
const gitBashWin = "C:\\Program Files\\Git\\bin\\bash.exe";
const bashBin = process.platform === "win32" && existsSync(gitBashWin) ? gitBashWin : "bash";

const temps: string[] = [];
// Avoid real network round-trips from `gh pr view` inside mergeCheck() on synthetic acme/app repos,
// and yield a macrotask tick between synchronous child_process tests so Vitest's worker MessagePort
// processes onTaskUpdate acks without hitting birpc's 60s timeout under full-suite load (H-08).
process.env.HTTPS_PROXY = "http://127.0.0.1:1";
beforeEach(() => new Promise((r) => setTimeout(r, 0)));
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
function temp(prefix: string): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

function run(cmd: string, args: string[], cwd: string): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

let baseTemplate = "";
/** Temp repo with issue_prefix, on branch `branch`. */
function repo(branch: string): string {
  if (!baseTemplate) {
    baseTemplate = temp("harness-flow-tpl-");
    const git = (...a: string[]) => execFileSync("git", a, { cwd: baseTemplate, stdio: "pipe" });
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Tester");
    git("config", "user.email", "tester@users.noreply.github.com");
    writeFileSync(path.join(baseTemplate, ".gitignore"), ".harness/\n");
    mkdirSync(path.join(baseTemplate, "harness"));
    writeFileSync(
      path.join(baseTemplate, "harness", "project.json"),
      JSON.stringify({ name: "t", runtimes: [], issue_prefix: "PROJ", gate: ":" }),
    );
    git("add", ".");
    git("commit", "-q", "-m", "init");
    git("update-ref", "refs/remotes/origin/main", "HEAD");
  }
  const dir = temp("harness-flow-");
  cpSync(baseTemplate, dir, { recursive: true });
  execFileSync("git", ["checkout", "-q", "-b", branch], { cwd: dir, stdio: "pipe" });
  return dir;
}

describe("Learner obligatorio: el gate no sella sin la lección del issue", () => {
  it("GIVEN feature/77-x sin lección THEN el gate falla y pide harness-learn.sh", () => {
    const dir = repo("feature/77-x");
    const res = run(bashBin, [gateScript], dir);
    expect(res.code).toBe(1);
    expect(res.out).toContain("missing lesson for PROJ-77");
    expect(existsSync(path.join(dir, ".harness", "complete.json"))).toBe(false);
  });

  it("GIVEN la lección registrada (issue derivado de la rama) THEN el gate sella con issue y --pr-block imprime el bloque", () => {
    const dir = repo("feature/77-x");
    const learn = run(bashBin, [learnScript, "--lesson", "Usar el bloque del sello en el PR"], dir);
    expect(learn.code).toBe(0);
    const file = path.join(dir, "harness", "experience", "PROJ-77.jsonl");
    const entry = JSON.parse(readFileSync(file, "utf8").trim());
    expect(entry).toMatchObject({ task: "PROJ-77", proposal: "pre-merge", lesson: "Usar el bloque del sello en el PR" });

    execFileSync("git", ["add", "."], { cwd: dir });
    execFileSync("git", ["commit", "-m", "learn"], { cwd: dir });
    expect(run(bashBin, [gateScript], dir).code).toBe(0);
    const seal = JSON.parse(readFileSync(path.join(dir, ".harness", "complete.json"), "utf8"));
    expect(seal.issue).toBe("PROJ-77");
    expect(seal.worktree_clean).toBe(true);

    const block = run(bashBin, [gateScript, "--pr-block"], dir);
    expect(block.code).toBe(0);
    expect(parseSealBlock(block.out)).toMatchObject({ head: seal.head, fingerprint: seal.fingerprint });
  });

  it("GIVEN la misma lección dos veces THEN se registra una sola vez (idempotente)", () => {
    const dir = repo("fix/5-y");
    run(bashBin, [learnScript, "--lesson", "L1"], dir);
    const second = run(bashBin, [learnScript, "--lesson", "L1"], dir);
    expect(second.out).toContain("idempotent");
    const rows = readFileSync(path.join(dir, "harness", "experience", "PROJ-5.jsonl"), "utf8").trim().split("\n");
    expect(rows).toHaveLength(1);
  });

  it("GIVEN harness-learn.sh sin --lesson THEN falla (el subject del commit no es una lección)", () => {
    const dir = repo("fix/5-y");
    expect(run(bashBin, [learnScript], dir).code).toBe(1);
  });

  it("GIVEN un sello sobre worktree sucio THEN --pr-block se niega", () => {
    const dir = repo("main-work");
    expect(run(bashBin, [gateScript], dir).code).toBe(0);
    writeFileSync(path.join(dir, "x.txt"), "dirty\n");
    expect(run(bashBin, [gateScript], dir).code).toBe(0);
    expect(run(bashBin, [gateScript, "--pr-block"], dir).code).toBe(1);
  });
});

describe("harness-merge-check: sello == HEAD del PR, lección y PPC", () => {
  const project = { issue_prefix: "PROJ", gate: "npm test", authorizers: { owner: "Fresias", delegates: [] } };
  const ownerAuthEvents = [
    { event: "labeled", label: "harness-authorized", actor: "Fresias", created_at: "2026-11-16T00:00:00Z" },
  ];
  const head = "a".repeat(40);
  const seal = `<!-- harness-seal: ${JSON.stringify({ head, fingerprint: "0123456789abcdef", gate: "npm test", worktree_clean: true })} -->`;
  const lesson = JSON.stringify({ task: "PROJ-12", lesson: "x" }) + "\n";
  const base = {
    headRefName: "feature/12-foo",
    headRefOid: head,
    body: `Resumen\n\n${seal}`,
    files: [{ path: "src/a.ts" }, { path: "harness/experience/PROJ-12.jsonl" }],
    labels: [],
  };

  it("GIVEN sello, lección y sin archivos del harness THEN mergeable", () => {
    expect(evaluateMerge({ pr: base, project, lessonText: lesson })).toMatchObject({ mergeable: true, issue: "PROJ-12" });
  });

  it("GIVEN un PR sin bloque de sello THEN bloqueado", () => {
    const r = evaluateMerge({ pr: { ...base, body: "sin sello" }, project, lessonText: lesson });
    expect(r.mergeable).toBe(false);
    expect(r.errors.join()).toContain("seal:");
  });

  it("GIVEN el sello de otro commit THEN bloqueado (sello != HEAD del PR)", () => {
    const r = evaluateMerge({ pr: { ...base, headRefOid: "b".repeat(40) }, project, lessonText: lesson });
    expect(r.errors.join()).toContain("!= PR head");
  });

  it("GIVEN un PR sin la lección del issue THEN bloqueado (learner obligatorio)", () => {
    const r = evaluateMerge({ pr: { ...base, files: [{ path: "src/a.ts" }] }, project, lessonText: null });
    expect(r.errors.join()).toContain("learn:");
  });

  it("GIVEN un PR de feature que toca harness/ THEN bloqueado por rama, label y PPC", () => {
    const pr = { ...base, files: [...base.files, { path: "harness/systemprompt.md" }, { path: ".gemini/settings.json" }] };
    const r = evaluateMerge({ pr, project, lessonText: lesson });
    expect(r.mergeable).toBe(false);
    expect(r.harness_files).toEqual(["harness/systemprompt.md", ".gemini/settings.json"]);
    const all = r.errors.join("\n");
    expect(all).toContain("non-harness branch");
    expect(all).toContain("harness-authorized");
    expect(all).toContain("ppc:");
  });

  it("GIVEN un PR de harness con el registro de GOZS-517 tal como está hoy (scores 25/5, sin reportes) WHEN corre harness-merge-check THEN falla indicando que faltan los reportes", () => {
    const gozs517Raw = JSON.stringify({
      task: "GOZS-517",
      lesson: "Candidate c1-contrast-selection on harness (c1-contrast-selection vs baseline: score +20)",
      ppc: {
        winner_id: "c1-contrast-selection",
        probe_passed: true,
        candidates: 2,
        contrast: [
          { candidate_id: "c1-contrast-selection", score: 25, passed: true },
          { candidate_id: "baseline", score: 5, passed: true },
        ],
        contrast_matrix: [
          { candidate_id: "c1-contrast-selection", score: 25, passed: true },
          { candidate_id: "baseline", score: 5, passed: true },
        ],
        duration_ms: 2450,
      },
    }) + "\n";
    const pr = {
      ...base,
      headRefName: "chore/517-harness-fix",
      files: [{ path: "harness/experience/GOZS-517.jsonl" }, { path: "harness-kit/core/guard/guard-core.mjs" }],
      labels: [{ name: "harness-authorized" }],
    };
    const res = evaluateMerge({ pr, project: { ...project, issue_prefix: "GOZS" }, lessonText: gozs517Raw, probeReports: [], events: ownerAuthEvents });
    expect(res.mergeable).toBe(false);
    expect(res.errors.join(" ")).toMatch(/missing probe reports|reports_sha256/);
  });

  it("GIVEN reportes versionados y un registro con score editado a mano WHEN corre harness-merge-check THEN falla indicando el campo y el valor esperado", () => {
    const probeC1 = { candidate_id: "c1", passed: true, duration_ms: 1000, files_touched: [] };
    const probeBaseline = { candidate_id: "baseline", passed: true, duration_ms: 1500, files_touched: [] };
    const probeReports = [probeC1, probeBaseline];
    const contrastResult = evaluateCandidates(probeReports, { version: "1.0.0" });
    const evaluation = evaluateProbes(probeReports, null, { version: "1.0.0" });
    const shaC1 = hashReport(probeC1);
    const shaBase = hashReport(probeBaseline);

    // Score editado a mano
    const tamperedMatrix = contrastResult.contrast_matrix.map((c: any) =>
      c.candidate_id === "c1" ? { ...c, score: 25 } : c,
    );
    const tamperedLesson = JSON.stringify({
      task: "PROJ-12",
      lesson: evaluation.lesson,
      ppc: {
        winner_id: "c1",
        candidates: 2,
        probe_passed: true,
        duration_ms: 1000,
        contrast: tamperedMatrix,
        contrast_matrix: tamperedMatrix,
        contrast_version: "1.0.0",
        reports_sha256: { c1: shaC1, baseline: shaBase },
      },
    }) + "\n";
    const pr = {
      ...base,
      headRefName: "chore/12-harness-fix",
      files: [
        ...base.files,
        { path: "harness/guardrails.md" },
        { path: "harness/experience/probes/PROJ-12/c1.json" },
        { path: "harness/experience/probes/PROJ-12/baseline.json" },
      ],
      labels: [{ name: "harness-authorized" }],
    };
    const res = evaluateMerge({ pr, project, lessonText: tamperedLesson, probeReports, events: ownerAuthEvents });
    expect(res.mergeable).toBe(false);
    expect(res.errors.join(" ")).toContain("contrast score mismatch for c1: expected 900, got 25");
  });

  it("GIVEN un reporte modificado después de compose WHEN corre harness-merge-check THEN falla por hash distinto", () => {
    const probeC1 = { candidate_id: "c1", passed: true, duration_ms: 1000, files_touched: ["harness/guardrails.md"] };
    const probeBaseline = { candidate_id: "baseline", passed: true, duration_ms: 1500, files_touched: [] };
    const shaC1 = hashReport(probeC1);
    const shaBase = hashReport(probeBaseline);
    const contrastResult = evaluateCandidates([probeC1, probeBaseline]);
    const evaluation = evaluateProbes([probeC1, probeBaseline]);

    const ppcLesson = JSON.stringify({
      id: "exp-proj-12",
      task: "PROJ-12",
      lesson: evaluation.lesson,
      ppc: {
        winner_id: "c1",
        candidates: 2,
        probe_passed: true,
        duration_ms: 1000,
        contrast: contrastResult.contrast_matrix,
        contrast_matrix: contrastResult.contrast_matrix,
        contrast_version: CONTRAST_VERSION,
        verdict: contrastResult.verdict,
        reports_sha256: { c1: shaC1, baseline: shaBase },
      },
    }) + "\n";

    // Reporte modificado después de compose
    const modifiedProbeC1 = { ...probeC1, duration_ms: 2000 };
    const pr = {
      ...base,
      headRefName: "chore/12-harness-fix",
      files: [
        ...base.files,
        { path: "harness/guardrails.md" },
        { path: "harness/experience/probes/PROJ-12/c1.json" },
        { path: "harness/experience/probes/PROJ-12/baseline.json" },
      ],
      labels: [{ name: "harness-authorized" }],
    };
    const res = evaluateMerge({ pr, project, lessonText: ppcLesson, probeReports: [modifiedProbeC1, probeBaseline], events: ownerAuthEvents });
    expect(res.mergeable).toBe(false);
    expect(res.errors.join(" ")).toContain("sha256 mismatch for report c1");
  });

  it("GIVEN reportes y un registro generados por compose sin modificaciones WHEN corre harness-merge-check THEN pasa", () => {
    const probeC1 = { candidate_id: "c1", passed: true, duration_ms: 1000, files_touched: ["harness/guardrails.md"] };
    const probeBaseline = { candidate_id: "baseline", passed: true, duration_ms: 1500, files_touched: [] };
    const shaC1 = hashReport(probeC1);
    const shaBase = hashReport(probeBaseline);
    const contrastResult = evaluateCandidates([probeC1, probeBaseline]);
    const evaluation = evaluateProbes([probeC1, probeBaseline]);

    const ppcLesson = JSON.stringify({
      id: "exp-proj-12",
      task: "PROJ-12",
      lesson: evaluation.lesson,
      ppc: {
        winner_id: "c1",
        candidates: 2,
        probe_passed: true,
        duration_ms: 1000,
        contrast: contrastResult.contrast_matrix,
        contrast_matrix: contrastResult.contrast_matrix,
        contrast_version: CONTRAST_VERSION,
        verdict: contrastResult.verdict,
        reports_sha256: { c1: shaC1, baseline: shaBase },
      },
    }) + "\n";
    const pr = {
      ...base,
      headRefName: "chore/12-harness-fix",
      files: [
        ...base.files,
        { path: "harness/guardrails.md" },
        { path: "harness/experience/probes/PROJ-12/c1.json" },
        { path: "harness/experience/probes/PROJ-12/baseline.json" },
      ],
      labels: [{ name: "harness-authorized" }],
    };
    const res = evaluateMerge({ pr, project, lessonText: ppcLesson, probeReports: [probeC1, probeBaseline], events: ownerAuthEvents });
    expect(res.mergeable).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("GIVEN un registro 2.0.0 con fixed editado a mano WHEN corre harness-merge-check THEN falla", () => {
    const probeC1 = {
      candidate_id: "c1",
      passed: true,
      duration_ms: 1000,
      files_touched: ["harness/guardrails.md"],
      tests: { "tests/sample.spec.ts::nuevo": "passed" },
    };
    const probeBaseline = {
      candidate_id: "baseline",
      passed: true,
      duration_ms: 1500,
      files_touched: [],
      tests: { "tests/sample.spec.ts::nuevo": "failed" },
    };
    const shaC1 = hashReport(probeC1);
    const shaBase = hashReport(probeBaseline);
    const contrastResult = evaluateCandidates([probeC1, probeBaseline]);
    const evaluation = evaluateProbes([probeC1, probeBaseline]);

    // fixed editado a mano (expected 1, put 99)
    const tamperedMatrix = contrastResult.contrast_matrix.map((c: any) =>
      c.candidate_id === "c1" ? { ...c, fixed: 99 } : c,
    );

    const tamperedLesson = JSON.stringify({
      task: "GOZS-526",
      lesson: evaluation.lesson,
      ppc: {
        winner_id: "c1",
        candidates: 2,
        probe_passed: true,
        duration_ms: 1000,
        contrast: tamperedMatrix,
        contrast_matrix: tamperedMatrix,
        contrast_version: "2.0.0",
        reports_sha256: { c1: shaC1, baseline: shaBase },
      },
    }) + "\n";

    const pr = {
      ...base,
      headRefName: "chore/526-harness-contrast-behavioral",
      files: [
        ...base.files,
        { path: "harness/guardrails.md" },
        { path: "harness/experience/GOZS-526.jsonl" },
      ],
      labels: [{ name: "harness-authorized" }],
    };

    const res = evaluateMerge({ pr, project: { ...project, issue_prefix: "GOZS" }, lessonText: tamperedLesson, probeReports: [probeC1, probeBaseline], events: ownerAuthEvents });
    expect(res.mergeable).toBe(false);
    expect(res.errors.join(" ")).toContain("contrast fixed mismatch for c1: expected 1, got 99");
  });

  it("GIVEN el registro 1.0.0 existente de GOZS-522 WHEN se verifica con el merge-check THEN sigue validando", () => {
    const baseDir = path.resolve(here, "..", "..");
    const expFile = path.join(baseDir, "harness", "experience", "GOZS-522.jsonl");
    const baselineReportFile = path.join(baseDir, "harness", "experience", "probes", "GOZS-522", "baseline.json");
    const c1ReportFile = path.join(baseDir, "harness", "experience", "probes", "GOZS-522", "c1-guard-bot-noreply.json");

    expect(existsSync(expFile)).toBe(true);
    expect(existsSync(baselineReportFile)).toBe(true);
    expect(existsSync(c1ReportFile)).toBe(true);

    const lessonText = readFileSync(expFile, "utf8");
    const probeReports = [
      JSON.parse(readFileSync(baselineReportFile, "utf8")),
      JSON.parse(readFileSync(c1ReportFile, "utf8")),
    ];
    const seal = {
      head: "fakehead1234567",
      worktree_clean: true,
      gate: project.gate,
    };
    const pr = {
      headRefName: "chore/522-harness-identity-governance-v2",
      headRefOid: "fakehead1234567",
      state: "MERGED",
      mergedAt: "2026-11-14T06:45:00Z",
      body: `<!-- harness-seal: ${JSON.stringify(seal)} -->`,
      files: [
        { path: "harness/project.json" },
        { path: "harness/experience/GOZS-522.jsonl" },
      ],
      labels: [{ name: "harness-authorized" }],
    };

    const res = evaluateMerge({
      pr,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText,
      probeReports,
      events: ownerAuthEvents,
    });

    expect(res.errors).toHaveLength(0);
    expect(res.mergeable).toBe(true);
  });

  it("GIVEN el registro legacy 1.0.0 de GOZS-529 (sin verdict) WHEN se valida con merge-check THEN mergeable es true", () => {
    const baseDir = path.resolve(here, "..", "..");
    const expFile529 = path.join(baseDir, "harness", "experience", "GOZS-529.jsonl");
    const baseline529 = path.join(baseDir, "harness", "experience", "probes", "GOZS-529", "baseline.json");
    const c1529 = path.join(baseDir, "harness", "experience", "probes", "GOZS-529", "c1-harness-ci-debt.json");

    expect(existsSync(expFile529)).toBe(true);
    expect(existsSync(baseline529)).toBe(true);
    expect(existsSync(c1529)).toBe(true);

    const lessonText = readFileSync(expFile529, "utf8");
    const probeReports = [
      JSON.parse(readFileSync(baseline529, "utf8")),
      JSON.parse(readFileSync(c1529, "utf8")),
    ];
    const pr529 = {
      headRefName: "chore/529-harness-ci-debt",
      headRefOid: "fakehead529",
      state: "MERGED",
      mergedAt: "2026-11-14T17:20:00Z",
      body: `<!-- harness-seal: ${JSON.stringify({ head: "fakehead529", worktree_clean: true, gate: project.gate })} -->`,
      files: [
        { path: ".github/workflows/ci.yml" },
        { path: "harness/experience/GOZS-529.jsonl" },
      ],
      labels: [{ name: "harness-authorized" }],
    };

    const res = evaluateMerge({
      pr: pr529,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText,
      probeReports,
      events: ownerAuthEvents,
    });

    expect(res.errors).toHaveLength(0);
    expect(res.mergeable).toBe(true);
  });

  it("GIVEN un registro nuevo con contraste 1.0.0 pero que incluye verdict WHEN se valida con merge-check THEN falla exigiendo versión 2.0.0", () => {
    const baseDir = path.resolve(here, "..", "..");
    const expFile529 = path.join(baseDir, "harness", "experience", "GOZS-529.jsonl");
    const baseline529 = path.join(baseDir, "harness", "experience", "probes", "GOZS-529", "baseline.json");
    const c1529 = path.join(baseDir, "harness", "experience", "probes", "GOZS-529", "c1-harness-ci-debt.json");

    const record = JSON.parse(readFileSync(expFile529, "utf8").trim().split("\n")[0]!);
    record.task = "GOZS-999";
    record.ppc.verdict = "behavioral";

    const lessonText = JSON.stringify(record) + "\n";
    const probeReports = [
      JSON.parse(readFileSync(baseline529, "utf8")),
      JSON.parse(readFileSync(c1529, "utf8")),
    ];
    const seal = { head: "fakehead999", worktree_clean: true, gate: project.gate };
    const pr = {
      headRefName: "chore/999-harness-new-feature",
      headRefOid: "fakehead999",
      body: `<!-- harness-seal: ${JSON.stringify(seal)} -->`,
      files: [
        { path: "harness/project.json" },
        { path: "harness/experience/GOZS-999.jsonl" },
      ],
      labels: [{ name: "harness-authorized" }],
    };

    const res = evaluateMerge({
      pr,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText,
      probeReports,
      events: ownerAuthEvents,
    });

    expect(res.mergeable).toBe(false);
    expect(res.errors.join(" ")).toContain("contrast_version 2.0.0 (encontrado 1.0.0)");
  });

  it("GIVEN un registro PPC nuevo sin verdict y con candidato ganador files_touched: [] WHEN corre evaluateMerge THEN es rechazado (mergeable: false) y no evade reglas v2 de GOZS-541", () => {
    const probeC1 = {
      candidate_id: "c1-empty",
      passed: true,
      duration_ms: 500,
      files_touched: [],
      tests: { "tests/a.spec.ts::t1": "passed" },
    };
    const probeBaseline = {
      candidate_id: "baseline",
      passed: true,
      duration_ms: 2000,
      files_touched: [],
      tests: { "tests/a.spec.ts::t1": "passed" },
    };
    const probeReports = [probeC1, probeBaseline];
    const shaC1 = hashReport(probeC1);
    const shaBase = hashReport(probeBaseline);

    // Intento 1: omitir verdict con contrast_version "1.0.0" para eludir descalificación de files_touched: []
    const v1Contrast = evaluateCandidates(probeReports, { version: "1.0.0" });
    const v1Eval = evaluateProbes(probeReports, null, { version: "1.0.0" });
    const bypassV1Lesson = JSON.stringify({
      id: "exp-gozs-991",
      timestamp: "2026-11-14T00:00:00.000Z",
      task: "GOZS-991",
      lesson: v1Eval.lesson,
      ppc: {
        winner_id: v1Contrast.winner_id,
        candidates: 2,
        probe_passed: true,
        duration_ms: 500,
        contrast: v1Contrast.contrast_matrix,
        contrast_matrix: v1Contrast.contrast_matrix,
        contrast_version: "1.0.0",
        reports_sha256: { "c1-empty": shaC1, baseline: shaBase },
      },
    }) + "\n";

    const pr = {
      headRefName: "chore/991-harness-bypass",
      headRefOid: head,
      body: `<!-- harness-seal: ${JSON.stringify({ head, fingerprint: "0123456789abcdef", gate: project.gate, worktree_clean: true })} -->`,
      files: [
        { path: "harness/guardrails.local.md" },
        { path: "harness/experience/GOZS-991.jsonl" },
      ],
      labels: [{ name: "harness-authorized" }],
    };

    const resV1Bypass = evaluateMerge({
      pr,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText: bypassV1Lesson,
      probeReports,
      events: ownerAuthEvents,
    });
    expect(resV1Bypass.mergeable).toBe(false);
    expect(resV1Bypass.errors.join(" ")).toContain("ppc:");
    expect(resV1Bypass.errors.join(" ")).toContain("contrast_version 2.0.0");
    expect(resV1Bypass.errors.join(" ")).toContain("verdict");
    expect(resV1Bypass.errors.join(" ")).toContain("bajo reglas v2");

    // Intento 2: omitir verdict y contrast_version con candidato files_touched: []
    const noVerdictLesson = JSON.stringify({
      id: "exp-gozs-991-b",
      task: "GOZS-991",
      lesson: v1Eval.lesson,
      ppc: {
        winner_id: v1Contrast.winner_id,
        candidates: 2,
        probe_passed: true,
        duration_ms: 500,
        contrast: v1Contrast.contrast_matrix,
        contrast_matrix: v1Contrast.contrast_matrix,
        reports_sha256: { "c1-empty": shaC1, baseline: shaBase },
      },
    }) + "\n";
    const resNoVersion = evaluateMerge({
      pr,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText: noVerdictLesson,
      probeReports,
      events: ownerAuthEvents,
    });
    expect(resNoVersion.mergeable).toBe(false);
    expect(resNoVersion.errors.join(" ")).toContain("contrast_version 2.0.0");
    expect(resNoVersion.errors.join(" ")).toContain("verdict");
    expect(resNoVersion.errors.join(" ")).toContain("winner_id mismatch");
  });

  it.each([
    { label: 'contrast_version "1.0.0" sin verdict', contrast_version: "1.0.0", verdict: undefined },
    { label: "sin contrast_version y sin verdict", contrast_version: undefined, verdict: undefined },
    { label: 'contrast_version "2.0.0" sin verdict', contrast_version: "2.0.0", verdict: undefined },
    { label: 'contrast_version "2.0.0" con verdict vacío', contrast_version: "2.0.0", verdict: "   " },
  ])("GIVEN un registro nuevo ($label) WHEN corre evaluateMerge THEN mergeable es false con error ppc: explícito", ({ contrast_version, verdict }) => {
    const probeC1 = {
      candidate_id: "c1",
      passed: true,
      duration_ms: 900,
      files_touched: ["harness/guardrails.local.md"],
      tests: { "t::a": "passed" },
    };
    const probeBaseline = {
      candidate_id: "baseline",
      passed: true,
      duration_ms: 1500,
      files_touched: [],
      tests: { "t::a": "failed" },
    };
    const probeReports = [probeC1, probeBaseline];
    const ver = contrast_version === "1.0.0" ? "1.0.0" : "2.0.0";
    const contrastResult = evaluateCandidates(probeReports, { version: ver });
    const evaluation = evaluateProbes(probeReports, null, { version: ver });

    const ppc: Record<string, unknown> = {
      winner_id: contrastResult.winner_id,
      candidates: 2,
      probe_passed: true,
      duration_ms: 900,
      contrast: contrastResult.contrast_matrix,
      contrast_matrix: contrastResult.contrast_matrix,
      reports_sha256: { c1: hashReport(probeC1), baseline: hashReport(probeBaseline) },
    };
    if (contrast_version !== undefined) ppc.contrast_version = contrast_version;
    if (verdict !== undefined) ppc.verdict = verdict;

    const lessonText = JSON.stringify({
      id: "exp-gozs-992",
      timestamp: "2026-11-14T00:00:00.000Z",
      task: "GOZS-992",
      lesson: evaluation.lesson,
      ppc,
    }) + "\n";

    const pr = {
      headRefName: "chore/992-harness-no-verdict",
      headRefOid: head,
      body: `<!-- harness-seal: ${JSON.stringify({ head, fingerprint: "0123456789abcdef", gate: project.gate, worktree_clean: true })} -->`,
      files: [
        { path: "harness/guardrails.local.md" },
        { path: "harness/experience/GOZS-992.jsonl" },
      ],
      labels: [{ name: "harness-authorized" }],
    };

    const res = evaluateMerge({
      pr,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText,
      probeReports,
      events: ownerAuthEvents,
    });

    expect(res.mergeable).toBe(false);
    expect(res.errors.join(" ")).toContain("ppc:");
    expect(res.errors.join(" ")).toContain("verdict");
  });

  it("GIVEN un intento de suplantar un issue R11 (GOZS-522) con reportes o id distintos sin verdict WHEN corre evaluateMerge THEN es rechazado", () => {
    const probeC1 = {
      candidate_id: "c1-guard-bot-noreply",
      passed: true,
      duration_ms: 500,
      files_touched: [],
      tests: { "t::a": "passed" },
    };
    const probeBaseline = {
      candidate_id: "baseline",
      passed: true,
      duration_ms: 900,
      files_touched: [],
      tests: { "t::a": "passed" },
    };
    const probeReports = [probeC1, probeBaseline];
    const contrastResult = evaluateCandidates(probeReports, { version: "1.0.0" });
    const evaluation = evaluateProbes(probeReports, null, { version: "1.0.0" });
    const spoofedLesson = JSON.stringify({
      id: "exp-mwg1b2o1",
      task: "GOZS-522",
      lesson: evaluation.lesson,
      ppc: {
        winner_id: "c1-guard-bot-noreply",
        candidates: 2,
        probe_passed: true,
        duration_ms: 500,
        contrast: contrastResult.contrast_matrix,
        contrast_matrix: contrastResult.contrast_matrix,
        contrast_version: "1.0.0",
        reports_sha256: {
          "c1-guard-bot-noreply": hashReport(probeC1),
          baseline: hashReport(probeBaseline),
        },
      },
    }) + "\n";

    const pr = {
      headRefName: "chore/522-harness-spoof",
      headRefOid: head,
      body: `<!-- harness-seal: ${JSON.stringify({ head, fingerprint: "0123456789abcdef", gate: project.gate, worktree_clean: true })} -->`,
      files: [
        { path: "harness/project.json" },
        { path: "harness/experience/GOZS-522.jsonl" },
      ],
      labels: [{ name: "harness-authorized" }],
    };

    const res = evaluateMerge({
      pr,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText: spoofedLesson,
      probeReports,
      events: ownerAuthEvents,
    });
    expect(res.mergeable).toBe(false);
    expect(res.errors.join(" ")).toContain("contrast_version 2.0.0");
    expect(res.errors.join(" ")).toContain("verdict");
  });

  it.each(["GOZS-521", "GOZS-522", "GOZS-524", "GOZS-525", "GOZS-529"])(
    "GIVEN el registro histórico R11 ya mergeado (%s) WHEN corre evaluateMerge THEN sigue validando con mergeable: true",
    (issueId) => {
      const baseDir = path.resolve(here, "..", "..");
      const num = issueId.split("-")[1];
      const expFile = path.join(baseDir, "harness", "experience", `${issueId}.jsonl`);
      const probesDir = path.join(baseDir, "harness", "experience", "probes", issueId);

      expect(existsSync(expFile)).toBe(true);
      expect(existsSync(probesDir)).toBe(true);

      const lessonText = readFileSync(expFile, "utf8");
      const probeReports = readdirSync(probesDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(readFileSync(path.join(probesDir, f), "utf8")));

      const sealObj = { head: `fakehead${num}`, worktree_clean: true, gate: project.gate };
      const pr = {
        headRefName: `chore/${num}-harness-legacy`,
        headRefOid: `fakehead${num}`,
        state: "MERGED",
        mergedAt: "2026-11-14T12:00:00Z",
        body: `<!-- harness-seal: ${JSON.stringify(sealObj)} -->`,
        files: [
          { path: "harness/project.json" },
          { path: `harness/experience/${issueId}.jsonl` },
        ],
        labels: [{ name: "harness-authorized" }],
      };

      const res = evaluateMerge({
        pr,
        project: { ...project, issue_prefix: "GOZS" },
        lessonText,
        probeReports,
        events: ownerAuthEvents,
      });

      expect(res.errors).toHaveLength(0);
      expect(res.mergeable).toBe(true);
    },
  );

  it.each(["GOZS-521", "GOZS-522", "GOZS-524", "GOZS-525", "GOZS-529"])(
    "GIVEN un PR abierto o sin estado de merge en rama de issue R11 (%s) con el registro histórico v1 WHEN corre evaluateMerge THEN mergeable es false exigiendo contrast_version 2.0.0 y verdict",
    (issueId) => {
      const baseDir = path.resolve(here, "..", "..");
      const num = issueId.split("-")[1];
      const expFile = path.join(baseDir, "harness", "experience", `${issueId}.jsonl`);
      const probesDir = path.join(baseDir, "harness", "experience", "probes", issueId);

      const lessonText = readFileSync(expFile, "utf8");
      const probeReports = readdirSync(probesDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(readFileSync(path.join(probesDir, f), "utf8")));

      const sealObj = { head: `fakehead${num}`, worktree_clean: true, gate: project.gate };
      const basePr = {
        headRefName: `chore/${num}-harness-reopen`,
        headRefOid: `fakehead${num}`,
        body: `<!-- harness-seal: ${JSON.stringify(sealObj)} -->`,
        files: [
          { path: "harness/project.json" },
          { path: `harness/experience/${issueId}.jsonl` },
        ],
        labels: [{ name: "harness-authorized" }],
      };

      for (const variant of [
        { ...basePr, state: "OPEN", mergedAt: null },
        basePr,
      ]) {
        const res = evaluateMerge({
          pr: variant,
          project: { ...project, issue_prefix: "GOZS" },
          lessonText,
          probeReports,
          events: ownerAuthEvents,
        });
        expect(res.mergeable).toBe(false);
        const joined = res.errors.join(" ");
        expect(joined).toContain("ppc:");
        expect(joined).toContain("contrast_version 2.0.0");
        expect(joined).toContain("verdict");
      }
    },
  );

  it.each([
    { label: "mergedAt null", mergedAt: null },
    { label: "mergedAt vacío", mergedAt: "" },
    { label: "mergedAt espacios", mergedAt: "   " },
  ])("GIVEN un registro R11 con state MERGED pero $label WHEN corre evaluateMerge THEN mergeable es false", ({ mergedAt }) => {
    const baseDir = path.resolve(here, "..", "..");
    const expFile = path.join(baseDir, "harness", "experience", "GOZS-522.jsonl");
    const probesDir = path.join(baseDir, "harness", "experience", "probes", "GOZS-522");

    const lessonText = readFileSync(expFile, "utf8");
    const probeReports = readdirSync(probesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(path.join(probesDir, f), "utf8")));

    const sealObj = { head: "fakehead522", worktree_clean: true, gate: project.gate };
    const pr = {
      headRefName: "chore/522-harness-invalid-merged-at",
      headRefOid: "fakehead522",
      state: "MERGED",
      mergedAt,
      body: `<!-- harness-seal: ${JSON.stringify(sealObj)} -->`,
      files: [
        { path: "harness/project.json" },
        { path: "harness/experience/GOZS-522.jsonl" },
      ],
      labels: [{ name: "harness-authorized" }],
    };

    const res = evaluateMerge({
      pr,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText,
      probeReports,
      events: ownerAuthEvents,
    });

    expect(res.mergeable).toBe(false);
    expect(res.errors.join(" ")).toContain("contrast_version 2.0.0");
    expect(res.errors.join(" ")).toContain("verdict");
  });

  it("GIVEN un JSONL con varios registros PPC v2 (el primero con hashes viejos y el último con hashes actuales) WHEN corre evaluateMerge THEN valida el último con 0 errores ppc:; con solo el viejo da sha256 mismatch", () => {
    const oldC1 = {
      candidate_id: "c1",
      passed: true,
      duration_ms: 1000,
      files_touched: ["harness/guardrails.local.md"],
      tests: { "t::a": "passed" },
    };
    const oldBase = {
      candidate_id: "baseline",
      passed: true,
      duration_ms: 1500,
      files_touched: [],
      tests: { "t::a": "failed" },
    };
    const oldReports = [oldC1, oldBase];
    const oldContrast = evaluateCandidates(oldReports);
    const oldEval = evaluateProbes(oldReports);
    const oldRecord = JSON.stringify({
      id: "exp-gozs-995-1",
      task: "GOZS-995",
      lesson: oldEval.lesson,
      ppc: {
        winner_id: oldContrast.winner_id,
        candidates: 2,
        probe_passed: true,
        duration_ms: 1000,
        contrast: oldContrast.contrast_matrix,
        contrast_matrix: oldContrast.contrast_matrix,
        contrast_version: CONTRAST_VERSION,
        verdict: oldContrast.verdict,
        reports_sha256: { c1: hashReport(oldC1), baseline: hashReport(oldBase) },
      },
    });

    const newC1 = {
      candidate_id: "c1",
      passed: true,
      duration_ms: 850,
      files_touched: ["harness/guardrails.local.md", "harness-kit/core/scripts/harness-merge-check.mjs"],
      tests: { "t::a": "passed", "t::b": "passed" },
    };
    const newBase = {
      candidate_id: "baseline",
      passed: false,
      duration_ms: 1450,
      files_touched: [],
      tests: { "t::a": "failed", "t::b": "failed" },
    };
    const newReports = [newC1, newBase];
    const newContrast = evaluateCandidates(newReports);
    const newEval = evaluateProbes(newReports);
    const newRecord = JSON.stringify({
      id: "exp-gozs-995-2",
      task: "GOZS-995",
      lesson: newEval.lesson,
      ppc: {
        winner_id: newContrast.winner_id,
        candidates: 2,
        probe_passed: true,
        duration_ms: 850,
        contrast: newContrast.contrast_matrix,
        contrast_matrix: newContrast.contrast_matrix,
        contrast_version: CONTRAST_VERSION,
        verdict: newContrast.verdict,
        reports_sha256: { c1: hashReport(newC1), baseline: hashReport(newBase) },
      },
    });

    const pr = {
      headRefName: "chore/995-harness-multi-ppc",
      headRefOid: head,
      body: `<!-- harness-seal: ${JSON.stringify({ head, fingerprint: "0123456789abcdef", gate: project.gate, worktree_clean: true })} -->`,
      files: [
        { path: "harness/guardrails.local.md" },
        { path: "harness/experience/GOZS-995.jsonl" },
        { path: "harness/experience/probes/GOZS-995/c1.json" },
        { path: "harness/experience/probes/GOZS-995/baseline.json" },
      ],
      labels: [{ name: "harness-authorized" }],
    };

    const resLatest = evaluateMerge({
      pr,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText: `${oldRecord}\n${newRecord}\n`,
      probeReports: newReports,
      events: ownerAuthEvents,
    });
    expect(resLatest.errors.filter((e: string) => e.startsWith("ppc:"))).toHaveLength(0);
    expect(resLatest.mergeable).toBe(true);

    const resOnlyOld = evaluateMerge({
      pr,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText: `${oldRecord}\n`,
      probeReports: newReports,
      events: ownerAuthEvents,
    });
    expect(resOnlyOld.mergeable).toBe(false);
    expect(resOnlyOld.errors.join(" ")).toContain("sha256 mismatch");
  });

  it("GIVEN los registros PPC excepcionales (517, 518, 519, 523) THEN contienen caveat tanto en harness/experience/ como en experience_library.jsonl", () => {
    const baseDir = path.resolve(here, "..", "..");
    const expIds = ["GOZS-517", "GOZS-518", "GOZS-519", "GOZS-523"];

    for (const id of expIds) {
      const p = path.join(baseDir, "harness", "experience", `${id}.jsonl`);
      expect(existsSync(p)).toBe(true);
      const raw = readFileSync(p, "utf8");
      expect(raw, `${id} debe contener caveat en harness/experience/`).toContain("caveat");
    }

    const libPath = path.join(baseDir, "harness", "experience_library.jsonl");
    expect(existsSync(libPath)).toBe(true);
    const libRaw = readFileSync(libPath, "utf8");
    const libEntries = libRaw.trim().split("\n").map(l => JSON.parse(l));

    for (const id of expIds) {
      const entry = libEntries.find(e => e.task === id && e.ppc);
      expect(entry, `${id} debe existir como registro PPC en experience_library.jsonl`).toBeDefined();
      expect(typeof entry.caveat, `${id} en experience_library.jsonl debe tener propiedad caveat`).toBe("string");
      expect(entry.caveat.length).toBeGreaterThan(0);
    }
  });

  it("GIVEN los registros PPC ya mergeados (GOZS-522 y GOZS-526) WHEN se evalúan con el merge-check THEN siguen pasando la validación sin errores", () => {
    const baseDir = path.resolve(here, "..", "..");

    // 1. Verificación GOZS-522 (contraste 1.0.0)
    const expFile522 = path.join(baseDir, "harness", "experience", "GOZS-522.jsonl");
    const baseline522 = path.join(baseDir, "harness", "experience", "probes", "GOZS-522", "baseline.json");
    const c1522 = path.join(baseDir, "harness", "experience", "probes", "GOZS-522", "c1-guard-bot-noreply.json");
    const lessonText522 = readFileSync(expFile522, "utf8");
    const probeReports522 = [
      JSON.parse(readFileSync(baseline522, "utf8")),
      JSON.parse(readFileSync(c1522, "utf8")),
    ];
    const pr522 = {
      headRefName: "chore/522-harness-identity-governance-v2",
      headRefOid: "fakehead1234567",
      state: "MERGED",
      mergedAt: "2026-11-14T06:45:00Z",
      body: `<!-- harness-seal: ${JSON.stringify({ head: "fakehead1234567", worktree_clean: true, gate: project.gate })} -->`,
      files: [
        { path: "harness/project.json" },
        { path: "harness/experience/GOZS-522.jsonl" },
      ],
      labels: [{ name: "harness-authorized" }],
    };
    const res522 = evaluateMerge({
      pr: pr522,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText: lessonText522,
      probeReports: probeReports522,
      events: ownerAuthEvents,
    });
    expect(res522.errors).toHaveLength(0);
    expect(res522.mergeable).toBe(true);

    // 2. Verificación GOZS-526 (contraste 2.0.0)
    const expFile526 = path.join(baseDir, "harness", "experience", "GOZS-526.jsonl");
    const baseline526 = path.join(baseDir, "harness", "experience", "probes", "GOZS-526", "baseline.json");
    const c1526 = path.join(baseDir, "harness", "experience", "probes", "GOZS-526", "c1-harness-contrast-v2.json");
    const lessonText526 = readFileSync(expFile526, "utf8");
    const probeReports526 = [
      JSON.parse(readFileSync(baseline526, "utf8")),
      JSON.parse(readFileSync(c1526, "utf8")),
    ];
    const pr526 = {
      headRefName: "chore/526-harness-contrast-behavioral",
      headRefOid: "fakehead7654321",
      state: "MERGED",
      mergedAt: "2026-11-15T00:00:00Z",
      body: `<!-- harness-seal: ${JSON.stringify({ head: "fakehead7654321", worktree_clean: true, gate: project.gate })} -->`,
      files: [
        { path: "harness/guardrails.md" },
        { path: "harness/experience/GOZS-526.jsonl" },
      ],
      labels: [{ name: "harness-authorized" }],
    };
    const res526 = evaluateMerge({
      pr: pr526,
      project: { ...project, issue_prefix: "GOZS" },
      lessonText: lessonText526,
      probeReports: probeReports526,
      events: ownerAuthEvents,
    });
    expect(res526.errors).toHaveLength(0);
    expect(res526.mergeable).toBe(true);
  });

  describe("GOZS-563: exigir registro PPC y reportes nuevos en PRs no mergeados", () => {
    const probeC1 = {
      candidate_id: "c1-fresh",
      passed: true,
      duration_ms: 800,
      files_touched: ["harness/guardrails.local.md"],
      tests: { "t::fresh": "passed" },
    };
    const probeBase = {
      candidate_id: "baseline",
      passed: false,
      duration_ms: 1200,
      files_touched: [],
      tests: { "t::fresh": "failed" },
    };
    const freshReports = [probeC1, probeBase];
    const freshContrast = evaluateCandidates(freshReports);
    const freshEval = evaluateProbes(freshReports);
    const makePpcRecord = (id: string, task = "GOZS-522") =>
      JSON.stringify({
        id,
        task,
        lesson: freshEval.lesson,
        ppc: {
          winner_id: freshContrast.winner_id,
          candidates: 2,
          probe_passed: true,
          duration_ms: 800,
          contrast: freshContrast.contrast_matrix,
          contrast_matrix: freshContrast.contrast_matrix,
          contrast_version: CONTRAST_VERSION,
          verdict: freshContrast.verdict,
          reports_sha256: {
            "c1-fresh": hashReport(probeC1),
            baseline: hashReport(probeBase),
          },
        },
      });

    it("GIVEN un PR abierto en una rama de issue antiguo con registro y reportes de la base WHEN corre evaluateMerge THEN da mergeable: false", () => {
      const oldRecord = makePpcRecord("exp-old-522", "GOZS-522");
      const pr = {
        headRefName: "chore/522-harness-reused",
        headRefOid: head,
        state: "OPEN",
        body: `<!-- harness-seal: ${JSON.stringify({ head, worktree_clean: true, gate: project.gate })} -->`,
        files: [
          { path: "harness/guardrails.local.md" },
          { path: "harness/experience/GOZS-522.jsonl" },
        ],
        labels: [{ name: "harness-authorized" }],
      };

      const res = evaluateMerge({
        pr,
        project: { ...project, issue_prefix: "GOZS" },
        lessonText: `${oldRecord}\n`,
        baseLessonText: `${oldRecord}\n`,
        probeReports: freshReports,
        events: ownerAuthEvents,
      });

      expect(res.mergeable).toBe(false);
      const joined = res.errors.join("\n");
      expect(joined).toContain("ppc: el registro exp-old-522 ya existe en la base");
      expect(joined).toContain("ppc: el reporte c1-fresh no se modificó en este PR");
      expect(joined).toContain("ppc: el reporte baseline no se modificó en este PR");
    });

    it("GIVEN registro con id nuevo pero reportes sin cambios en pr.files WHEN corre evaluateMerge THEN da mergeable: false", () => {
      const oldRecord = makePpcRecord("exp-old-522", "GOZS-522");
      const newRecord = makePpcRecord("exp-new-522", "GOZS-522");
      const pr = {
        headRefName: "chore/522-harness-no-probes",
        headRefOid: head,
        state: "OPEN",
        body: `<!-- harness-seal: ${JSON.stringify({ head, worktree_clean: true, gate: project.gate })} -->`,
        files: [
          { path: "harness/guardrails.local.md" },
          { path: "harness/experience/GOZS-522.jsonl" },
          { path: "harness/experience/probes/GOZS-522/c1-fresh.json" },
        ],
        labels: [{ name: "harness-authorized" }],
      };

      const res = evaluateMerge({
        pr,
        project: { ...project, issue_prefix: "GOZS" },
        lessonText: `${oldRecord}\n${newRecord}\n`,
        baseLessonText: `${oldRecord}\n`,
        probeReports: freshReports,
        events: ownerAuthEvents,
      });

      expect(res.mergeable).toBe(false);
      const joined = res.errors.join("\n");
      expect(joined).not.toContain("ya existe en la base");
      expect(joined).toContain("ppc: el reporte baseline no se modificó en este PR");
    });

    it("GIVEN un PR abierto con registro nuevo y reportes nuevos en pr.files WHEN corre evaluateMerge THEN pasa", () => {
      const oldRecord = makePpcRecord("exp-old-522", "GOZS-522");
      const newRecord = makePpcRecord("exp-new-522", "GOZS-522");
      const pr = {
        headRefName: "chore/522-harness-fresh",
        headRefOid: head,
        state: "OPEN",
        body: `<!-- harness-seal: ${JSON.stringify({ head, worktree_clean: true, gate: project.gate })} -->`,
        files: [
          { path: "harness/guardrails.local.md" },
          { path: "harness/experience/GOZS-522.jsonl" },
          { path: "harness/experience/probes/GOZS-522/c1-fresh.json" },
          { path: "harness/experience/probes/GOZS-522/baseline.json" },
        ],
        labels: [{ name: "harness-authorized" }],
      };

      const res = evaluateMerge({
        pr,
        project: { ...project, issue_prefix: "GOZS" },
        lessonText: `${oldRecord}\n${newRecord}\n`,
        baseLessonText: `${oldRecord}\n`,
        probeReports: freshReports,
        events: ownerAuthEvents,
      });

      expect(res.errors).toHaveLength(0);
      expect(res.mergeable).toBe(true);
    });

    it("GIVEN un PR ya mergeado (state MERGED) aunque el id exista en la base y probes no estén en pr.files WHEN corre evaluateMerge THEN pasa", () => {
      const oldRecord = makePpcRecord("exp-old-522", "GOZS-522");
      const pr = {
        headRefName: "chore/522-harness-merged",
        headRefOid: head,
        state: "MERGED",
        mergedAt: "2026-11-16T00:00:00Z",
        body: `<!-- harness-seal: ${JSON.stringify({ head, worktree_clean: true, gate: project.gate })} -->`,
        files: [
          { path: "harness/guardrails.local.md" },
          { path: "harness/experience/GOZS-522.jsonl" },
        ],
        labels: [{ name: "harness-authorized" }],
      };

      const res = evaluateMerge({
        pr,
        project: { ...project, issue_prefix: "GOZS" },
        lessonText: `${oldRecord}\n`,
        baseLessonText: `${oldRecord}\n`,
        probeReports: freshReports,
        events: ownerAuthEvents,
      });

      expect(res.errors).toHaveLength(0);
      expect(res.mergeable).toBe(true);
    });

    it("GIVEN un registro PPC sin id en PR abierto aunque la base esté vacía WHEN corre evaluateMerge THEN es rechazado", () => {
      const noIdRecord = JSON.stringify({
        task: "GOZS-522",
        lesson: freshEval.lesson,
        ppc: {
          winner_id: freshContrast.winner_id,
          candidates: 2,
          probe_passed: true,
          duration_ms: 800,
          contrast: freshContrast.contrast_matrix,
          contrast_matrix: freshContrast.contrast_matrix,
          contrast_version: CONTRAST_VERSION,
          verdict: freshContrast.verdict,
          reports_sha256: {
            "c1-fresh": hashReport(probeC1),
            baseline: hashReport(probeBase),
          },
        },
      });
      const pr = {
        headRefName: "chore/522-harness-no-id",
        headRefOid: head,
        state: "OPEN",
        body: `<!-- harness-seal: ${JSON.stringify({ head, worktree_clean: true, gate: project.gate })} -->`,
        files: [
          { path: "harness/guardrails.local.md" },
          { path: "harness/experience/GOZS-522.jsonl" },
          { path: "harness/experience/probes/GOZS-522/c1-fresh.json" },
          { path: "harness/experience/probes/GOZS-522/baseline.json" },
        ],
        labels: [{ name: "harness-authorized" }],
      };

      const res = evaluateMerge({
        pr,
        project: { ...project, issue_prefix: "GOZS" },
        lessonText: `${noIdRecord}\n`,
        baseLessonText: null,
        probeReports: freshReports,
        events: ownerAuthEvents,
      });

      expect(res.mergeable).toBe(false);
      expect(res.errors.join("\n")).toContain("ppc: el registro PPC evaluado no tiene id");
    });
  });

  it("GIVEN un PR que no toca el harness WHEN corre harness-merge-check THEN las reglas PPC no aplican", () => {
    const pr = {
      ...base,
      headRefName: "feat/12-user-avatar",
      files: [...base.files, { path: "src/components/UserAvatar.tsx" }],
      labels: [],
    };
    const simpleLesson = JSON.stringify({
      task: "PROJ-12",
      lesson: "UserAvatar renders user picture",
    }) + "\n";
    const res = evaluateMerge({ pr, project, lessonText: simpleLesson, probeReports: [] });
    expect(res.mergeable).toBe(true);
    expect(res.harness_files).toHaveLength(0);
  });

  describe("evaluateAuthorization (GOZS-511, sin delegación)", () => {
    const authorizers = { owner: "Fresias", delegates: [] };
    const labels = [{ name: "harness-authorized" }];

    it("1. Puesta por Fresias: autorizado, by=Fresias", () => {
      const events = [{ event: "labeled", label: "harness-authorized", actor: "Fresias", created_at: "2026-11-16T01:00:00Z" }];
      expect(evaluateAuthorization({ events, labels, authorizers })).toMatchObject({
        authorized: true,
        by: "Fresias",
        delegated_by: null,
        error: null,
      });
    });

    it("2. Puesta por fresias en minúsculas: autorizado", () => {
      const events = [{ event: "labeled", label: "harness-authorized", actor: "fresias", created_at: "2026-11-16T01:00:00Z" }];
      expect(evaluateAuthorization({ events, labels, authorizers }).authorized).toBe(true);
    });

    it.each(["github-actions[bot]", "AgentsMultica"])(
      "3. Puesta por %s: rechazado con el actor en el mensaje",
      (actor) => {
        const events = [{ event: "labeled", label: "harness-authorized", actor, created_at: "2026-11-16T01:00:00Z" }];
        const res = evaluateAuthorization({ events, labels, authorizers });
        expect(res.authorized).toBe(false);
        expect(res.error).toContain(`authz: harness-authorized added by @${actor}, not an authorizer`);
      }
    );

    it("4. Puesta por Fresias, quitada y vuelta a poner por AgentsMultica: rechazado", () => {
      const events = [
        { event: "labeled", label: "harness-authorized", actor: "Fresias", created_at: "2026-11-16T01:00:00Z" },
        { event: "unlabeled", label: "harness-authorized", actor: "github-actions[bot]", created_at: "2026-11-16T02:00:00Z" },
        { event: "labeled", label: "harness-authorized", actor: "AgentsMultica", created_at: "2026-11-16T03:00:00Z" },
      ];
      const res = evaluateAuthorization({ events, labels, authorizers });
      expect(res.authorized).toBe(false);
      expect(res.error).toContain("@AgentsMultica");
    });

    it("5. Puesta por AgentsMultica, quitada y vuelta a poner por Fresias: autorizado", () => {
      const events = [
        { event: "labeled", label: "harness-authorized", actor: "AgentsMultica", created_at: "2026-11-16T01:00:00Z" },
        { event: "unlabeled", label: "harness-authorized", actor: "Fresias", created_at: "2026-11-16T02:00:00Z" },
        { event: "labeled", label: "harness-authorized", actor: "Fresias", created_at: "2026-11-16T03:00:00Z" },
      ];
      const res = evaluateAuthorization({ events, labels, authorizers });
      expect(res.authorized).toBe(true);
      expect(res.by).toBe("Fresias");
    });

    it("6. Etiqueta presente sin eventos: rechazado (falla cerrado)", () => {
      const res = evaluateAuthorization({ events: [], labels, authorizers });
      expect(res.authorized).toBe(false);
      expect(res.error).toBe("authz: no labeled event found");
    });

    it("7. Sin authorizers.owner y con archivos de harness: rechazado", () => {
      const res = evaluateAuthorization({
        events: [{ event: "labeled", label: "harness-authorized", actor: "Fresias", created_at: "2026-11-16T01:00:00Z" }],
        labels,
        authorizers: {},
      });
      expect(res.authorized).toBe(false);
      expect(res.error).toBe("authz: project.json has no authorizers.owner");

      const pr = {
        ...base,
        headRefName: "chore/511-harness-x",
        files: [...base.files, { path: "harness/project.json" }],
        labels,
      };
      const mergeRes = evaluateMerge({ pr, project: { issue_prefix: "PROJ", gate: "npm test" }, lessonText: lesson, probeReports: [] });
      expect(mergeRes.mergeable).toBe(false);
      expect(mergeRes.errors).toContain("authz: project.json has no authorizers.owner");
    });

    it("8. Sin archivos de harness: no se exige etiqueta", () => {
      const res = evaluateMerge({ pr: base, project, lessonText: lesson });
      expect(res.mergeable).toBe(true);
    });
  });

  describe("harness-merge-check CLI integración authz + synchronize (GOZS-511)", () => {
    const mergeCheckScript = path.join(scripts, "harness-merge-check.mjs");

    function setupTempRepoWithPpc() {
      const ws = temp("merge-check-authz");
      mkdirSync(path.join(ws, "harness", "experience", "probes", "PROJ-511"), { recursive: true });
      writeFileSync(
        path.join(ws, "harness", "project.json"),
        JSON.stringify({ issue_prefix: "PROJ", gate: "npm test", authorizers: { owner: "Fresias", delegates: [] } })
      );

      const probeC1 = {
        candidate_id: "c1",
        passed: true,
        duration_ms: 900,
        files_touched: ["harness/guardrails.local.md"],
        tests: { "t::a": "passed" },
      };
      const probeBase = {
        candidate_id: "baseline",
        passed: true,
        duration_ms: 1400,
        files_touched: [],
        tests: { "t::a": "failed" },
      };
      const probeReports = [probeC1, probeBase];
      const contrastResult = evaluateCandidates(probeReports);
      const evaluation = evaluateProbes(probeReports);
      const ppcLesson =
        JSON.stringify({
          id: "exp-proj-511",
          task: "PROJ-511",
          lesson: evaluation.lesson,
          ppc: {
            winner_id: "c1",
            candidates: 2,
            probe_passed: true,
            duration_ms: 900,
            contrast: contrastResult.contrast_matrix,
            contrast_matrix: contrastResult.contrast_matrix,
            contrast_version: CONTRAST_VERSION,
            verdict: contrastResult.verdict,
            reports_sha256: { c1: hashReport(probeC1), baseline: hashReport(probeBase) },
          },
        }) + "\n";

      writeFileSync(path.join(ws, "harness", "experience", "probes", "PROJ-511", "c1.json"), JSON.stringify(probeC1));
      writeFileSync(path.join(ws, "harness", "experience", "probes", "PROJ-511", "baseline.json"), JSON.stringify(probeBase));
      const lessonFile = path.join(ws, "harness", "experience", "PROJ-511.jsonl");
      writeFileSync(lessonFile, ppcLesson);

      const prFile = path.join(ws, "pr.json");
      const prObj = {
        number: 511,
        headRefName: "chore/511-harness-authz",
        headRefOid: head,
        body: `PR test\n\n${seal}`,
        files: [
          { path: "harness/guardrails.local.md" },
          { path: "harness/experience/PROJ-511.jsonl" },
          { path: "harness/experience/probes/PROJ-511/c1.json" },
          { path: "harness/experience/probes/PROJ-511/baseline.json" },
        ],
        labels: [{ name: "harness-authorized" }],
      };
      writeFileSync(prFile, JSON.stringify(prObj));
      return { ws, prFile, lessonFile, prObj };
    }

    function setupFakeGh(
      ws: string,
      behavior: {
        prJson?: unknown;
        deleteFails?: boolean;
        eventsFails?: boolean;
        contentsLesson?: string;
        probeContents?: Record<string, string>;
        eventsJson?: unknown[];
        filesRaw?: string;
      }
    ) {
      const binDir = path.join(ws, "fake-bin");
      mkdirSync(binDir, { recursive: true });
      const logFile = path.join(ws, "gh-calls.jsonl");
      const jsFile = path.join(binDir, "fake-gh.mjs");
      const stubCode = `
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(logFile)}, JSON.stringify(args) + "\\n");
const joined = args.join(" ");
const probeMap = ${JSON.stringify(behavior.probeContents || {})};
const prJson = ${JSON.stringify(behavior.prJson || {})};
const prFiles = Array.isArray(prJson.files) ? prJson.files : [];
if (args[0] === "pr" && args[1] === "view") {
  process.stdout.write(JSON.stringify({ changedFiles: prFiles.length, ...prJson }));
  process.exit(0);
}
if (/\\/pulls\\/\\d+\\/files/.test(joined)) {
  const filesRaw = ${JSON.stringify(behavior.filesRaw ?? null)};
  process.stdout.write(filesRaw ?? JSON.stringify(prFiles.map((f) => ({ filename: f.path }))));
  process.exit(0);
}
if (joined.includes("/contents/harness/experience/probes/")) {
  const matchedKey = Object.keys(probeMap).find((k) => joined.includes(k));
  if (matchedKey) {
    process.stdout.write(probeMap[matchedKey]);
    process.exit(0);
  }
  process.stderr.write("404 probe not found");
  process.exit(1);
}
if (joined.includes("/contents/harness/experience/")) {
  process.stdout.write(${JSON.stringify(behavior.contentsLesson || "")});
  process.exit(0);
}
if (joined.includes("/labels/harness-authorized") && args.includes("DELETE")) {
  if (${JSON.stringify(Boolean(behavior.deleteFails))}) {
    process.stderr.write("DELETE failed");
    process.exit(1);
  }
  process.stdout.write("{}");
  process.exit(0);
}
if (joined.includes("/events")) {
  if (${JSON.stringify(Boolean(behavior.eventsFails))}) {
    process.stderr.write("events API failed");
    process.exit(1);
  }
  process.stdout.write(${JSON.stringify(JSON.stringify(behavior.eventsJson || []))});
  process.exit(0);
}
if (joined.includes("/statuses/")) {
  process.stdout.write("{}");
  process.exit(0);
}
process.stdout.write("");
`;
      writeFileSync(jsFile, stubCode);
      if (process.platform === "win32") {
        writeFileSync(path.join(binDir, "gh.cmd"), `@echo off\r\n"${process.execPath}" "%~dp0\\fake-gh.mjs" %*\r\n`);
      } else {
        const shPath = path.join(binDir, "gh");
        writeFileSync(shPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "${jsFile}" "$@"\n`);
        chmodSync(shPath, 0o755);
      }
      return {
        binDir,
        logFile,
        env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}` },
      };
    }

    it("GIVEN --pr-json y --events-file con etiqueta puesta por AgentsMultica WHEN corre CLI THEN sale con código 1 y error authz:", () => {
      const { ws, prFile, lessonFile } = setupTempRepoWithPpc();
      const eventsFile = path.join(ws, "events.ndjson");
      writeFileSync(
        eventsFile,
        JSON.stringify({ event: "labeled", label: "harness-authorized", actor: "AgentsMultica", created_at: "2026-11-16T01:00:00Z" }) + "\n"
      );

      let status = 0;
      let errOut = "";
      try {
        execFileSync(
          process.execPath,
          [mergeCheckScript, "--pr-json", prFile, "--lesson-file", lessonFile, "--events-file", eventsFile],
          { cwd: ws, encoding: "utf8", stdio: "pipe" }
        );
      } catch (e: any) {
        status = e.status;
        errOut = (e.stderr || "") + (e.stdout || "");
      }
      expect(status).toBe(1);
      expect(errOut).toContain("authz:");
      expect(errOut).toContain("AgentsMultica");
    });

    it("GIVEN --event-action synchronize con gh simulado WHEN borra etiqueta THEN llama DELETE solo a harness-authorized y publica failure", () => {
      const { ws, prFile, lessonFile } = setupTempRepoWithPpc();
      const fake = setupFakeGh(ws, {});

      let status = 0;
      let stdout = "";
      try {
        execFileSync(
          process.execPath,
          [mergeCheckScript, "--pr-json", prFile, "--lesson-file", lessonFile, "--event-action", "synchronize", "--post-status"],
          { cwd: ws, env: fake.env, encoding: "utf8", stdio: "pipe" }
        );
      } catch (e: any) {
        status = e.status;
        stdout = e.stdout || "";
      }
      expect(status).toBe(1);
      expect(stdout).toContain("[harness-merge-check] harness-authorized revoked: new commits require re-authorization");

      const calls = readFileSync(fake.logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]);
      const deleteCalls = calls.filter((c) => c.includes("DELETE"));
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0]!.join(" ")).toContain("/labels/harness-authorized");
      expect(deleteCalls[0]!.join(" ")).not.toContain("harness-delegate");

      const statusCalls = calls.filter((c) => c.join(" ").includes("/statuses/"));
      expect(statusCalls).toHaveLength(1);
      expect(statusCalls[0]!.join(" ")).toContain("state=failure");
    });

    it("GIVEN --event-action synchronize cuando DELETE falla THEN también publica failure con authz: could not revoke stale authorization", () => {
      const { ws, prFile, lessonFile } = setupTempRepoWithPpc();
      const fake = setupFakeGh(ws, { deleteFails: true });

      let status = 0;
      let errOut = "";
      try {
        execFileSync(
          process.execPath,
          [mergeCheckScript, "--pr-json", prFile, "--lesson-file", lessonFile, "--event-action", "synchronize", "--post-status"],
          { cwd: ws, env: fake.env, encoding: "utf8", stdio: "pipe" }
        );
      } catch (e: any) {
        status = e.status;
        errOut = (e.stderr || "") + (e.stdout || "");
      }
      expect(status).toBe(1);
      expect(errOut).toContain("authz: could not revoke stale authorization");

      const calls = readFileSync(fake.logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]);
      const statusCalls = calls.filter((c) => c.join(" ").includes("/statuses/"));
      expect(statusCalls).toHaveLength(1);
      expect(statusCalls[0]!.join(" ")).toContain("state=failure");
    });

    it("GIVEN falla de gh al obtener los eventos THEN sale con código distinto de 0 y no llama a statuses", () => {
      const { ws, prObj } = setupTempRepoWithPpc();
      const fake = setupFakeGh(ws, { prJson: prObj, eventsFails: true });

      let status = 0;
      try {
        execFileSync(
          process.execPath,
          [mergeCheckScript, "511", "--post-status"],
          { cwd: ws, env: fake.env, encoding: "utf8", stdio: "pipe" }
        );
      } catch (e: any) {
        status = e.status;
      }
      expect(status).not.toBe(0);

      const calls = readFileSync(fake.logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]);
      expect(calls.some((c) => c.join(" ").includes("/events"))).toBe(true);
      expect(calls.some((c) => c.join(" ").includes("/statuses/"))).toBe(false);
    });

    describe("GOZS-594: archivos del PR por API paginada (gh pr view --json files corta en 100)", () => {
      const manyPaths = (n: number) => Array.from({ length: n }, (_, i) => `docs/png/img-${String(i).padStart(3, "0")}.png`);
      const twoPages = (paths: string[]) =>
        JSON.stringify(paths.slice(0, 100).map((p) => ({ filename: p }))) + JSON.stringify(paths.slice(100).map((p) => ({ filename: p })));
      const prFor = (paths: string[], branch: string) => ({
        number: 594,
        headRefName: branch,
        headRefOid: head,
        baseRefName: "main",
        state: "OPEN",
        body: `PR test\n\n${seal}`,
        changedFiles: paths.length,
        files: paths.slice(0, 100).map((p) => ({ path: p })),
        labels: [],
      });
      const run = (ws: string, env: NodeJS.ProcessEnv, extra: string[] = []) => {
        try {
          return { status: 0, out: execFileSync(process.execPath, [mergeCheckScript, "594", ...extra], { cwd: ws, env, encoding: "utf8", stdio: "pipe" }), err: "" };
        } catch (e: any) {
          return { status: e.status as number, out: String(e.stdout || ""), err: String(e.stderr || "") };
        }
      };

      it("GIVEN un PR de 150 archivos con la lección en la posición 140 WHEN corre el CLI THEN la lección se encuentra y pasa", () => {
        const { ws } = setupTempRepoWithPpc();
        const paths = manyPaths(150);
        paths[139] = "harness/experience/PROJ-573.jsonl";
        const fake = setupFakeGh(ws, {
          prJson: prFor(paths, "docs/573-athlete-v7-progreso"),
          filesRaw: twoPages(paths),
          contentsLesson: JSON.stringify({ task: "PROJ-573", lesson: "x" }) + "\n",
        });
        const r = run(ws, fake.env);
        expect(r.err).not.toContain("learn:");
        expect(r.status).toBe(0);
        expect(r.out).toContain("[harness-merge-check OK] PROJ-573");
      });

      it("GIVEN un PR de más de 100 archivos con un archivo de harness después del 100 WHEN corre el CLI THEN se detecta como cambio de harness", () => {
        const { ws } = setupTempRepoWithPpc();
        const paths = manyPaths(150);
        paths[10] = "harness/experience/PROJ-573.jsonl";
        paths[120] = "harness-kit/core/scripts/harness-merge-check.mjs";
        const fake = setupFakeGh(ws, {
          prJson: prFor(paths, "docs/573-athlete-v7-progreso"),
          filesRaw: twoPages(paths),
          contentsLesson: JSON.stringify({ task: "PROJ-573", lesson: "x" }) + "\n",
        });
        const r = run(ws, fake.env, ["--json"]);
        expect(r.status).toBe(1);
        const result = JSON.parse(r.out);
        expect(result.mergeable).toBe(false);
        expect(result.harness_files).toContain("harness-kit/core/scripts/harness-merge-check.mjs");
      });

      it("GIVEN la API paginada devuelve menos archivos que changedFiles WHEN corre el CLI THEN falla en modo cerrado sin evaluar ni publicar estado", () => {
        const { ws } = setupTempRepoWithPpc();
        const paths = manyPaths(150);
        paths[10] = "harness/experience/PROJ-573.jsonl";
        const fake = setupFakeGh(ws, {
          prJson: prFor(paths, "docs/573-athlete-v7-progreso"),
          filesRaw: JSON.stringify(paths.slice(0, 100).map((p) => ({ filename: p }))),
          contentsLesson: JSON.stringify({ task: "PROJ-573", lesson: "x" }) + "\n",
        });
        const r = run(ws, fake.env, ["--post-status"]);
        expect(r.status).toBe(1);
        expect(r.err).toContain("returned 100 file(s) but the PR reports changedFiles=150");
        const calls = readFileSync(fake.logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]);
        expect(calls.some((c) => c.join(" ").includes("/statuses/"))).toBe(false);
      });

      it("GIVEN gh api --paginate concatena páginas [...][...] WHEN fetchPrFiles THEN devuelve todos los archivos como { path }; sin changedFiles falla", () => {
        const paths = manyPaths(150);
        const runGh = (args: string[]) => {
          expect(args).toEqual(["api", "--paginate", "repos/{owner}/{repo}/pulls/594/files?per_page=100"]);
          return twoPages(paths);
        };
        const files = fetchPrFiles(runGh, 594, 150);
        expect(files).toHaveLength(150);
        expect(files[149]).toEqual({ path: paths[149] });
        expect(() => fetchPrFiles(runGh, 594, undefined)).toThrow(/changedFiles=undefined/);
        expect(() => fetchPrFiles(runGh, null, 150)).toThrow(/missing PR number/);
      });
    });

    it("GIVEN --pr-json OPEN y --base-lesson-file con el mismo id WHEN corre CLI THEN bloquea con ya existe en la base; con id nuevo pasa", () => {
      const { ws, prFile, lessonFile, prObj } = setupTempRepoWithPpc();
      const ppcContent = readFileSync(lessonFile, "utf8");
      const entry = JSON.parse(ppcContent.trim());
      entry.id = "exp-base-511";
      writeFileSync(lessonFile, JSON.stringify(entry) + "\n");

      const baseLessonFile = path.join(ws, "base-lesson.jsonl");
      writeFileSync(baseLessonFile, JSON.stringify(entry) + "\n");
      writeFileSync(prFile, JSON.stringify({ ...prObj, state: "OPEN" }));

      const eventsFile = path.join(ws, "events.ndjson");
      writeFileSync(
        eventsFile,
        JSON.stringify({ event: "labeled", label: "harness-authorized", actor: "Fresias", created_at: "2026-11-16T01:00:00Z" }) + "\n"
      );

      let status = 0;
      let errOut = "";
      try {
        execFileSync(
          process.execPath,
          [mergeCheckScript, "--pr-json", prFile, "--lesson-file", lessonFile, "--base-lesson-file", baseLessonFile, "--events-file", eventsFile],
          { cwd: ws, encoding: "utf8", stdio: "pipe" }
        );
      } catch (e: any) {
        status = e.status;
        errOut = (e.stderr || "") + (e.stdout || "");
      }
      expect(status).toBe(1);
      expect(errOut).toContain("ya existe en la base");

      const freshEntry = { ...entry, id: "exp-new-511" };
      writeFileSync(lessonFile, JSON.stringify(entry) + "\n" + JSON.stringify(freshEntry) + "\n");
      const okOut = execFileSync(
        process.execPath,
        [mergeCheckScript, "--pr-json", prFile, "--lesson-file", lessonFile, "--base-lesson-file", baseLessonFile, "--events-file", eventsFile, "--json"],
        { cwd: ws, encoding: "utf8", stdio: "pipe" }
      );
      expect(JSON.parse(okOut).mergeable).toBe(true);
    });

    it("GIVEN modo --local en rama derivada de main que reutiliza registro PPC y reportes de main WHEN corre --local THEN falla; tras renovar registro y reportes pasa", () => {
      const ws = temp("merge-check-local-fresh");
      execFileSync("git", ["init", "-b", "main", ws], { stdio: "ignore" });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: ws });
      execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: ws });

      mkdirSync(path.join(ws, "harness", "experience", "probes", "PROJ-70"), { recursive: true });
      writeFileSync(
        path.join(ws, "harness", "project.json"),
        JSON.stringify({ issue_prefix: "PROJ", gate: "npm test", authorizers: { owner: "Fresias", delegates: [] } })
      );
      writeFileSync(path.join(ws, "harness", "guardrails.local.md"), "# Initial\n");

      const oldC1 = {
        candidate_id: "c1",
        passed: true,
        duration_ms: 900,
        files_touched: ["harness/guardrails.local.md"],
        tests: { "t::a": "passed" },
      };
      const oldBase = {
        candidate_id: "baseline",
        passed: false,
        duration_ms: 1400,
        files_touched: [],
        tests: { "t::a": "failed" },
      };
      const oldContrast = evaluateCandidates([oldC1, oldBase]);
      const oldEval = evaluateProbes([oldC1, oldBase]);
      const oldEntry = {
        id: "exp-old-70",
        task: "PROJ-70",
        lesson: oldEval.lesson,
        ppc: {
          winner_id: "c1",
          candidates: 2,
          probe_passed: true,
          duration_ms: 900,
          contrast: oldContrast.contrast_matrix,
          contrast_matrix: oldContrast.contrast_matrix,
          contrast_version: CONTRAST_VERSION,
          verdict: oldContrast.verdict,
          reports_sha256: { c1: hashReport(oldC1), baseline: hashReport(oldBase) },
        },
      };
      writeFileSync(path.join(ws, "harness", "experience", "probes", "PROJ-70", "c1.json"), JSON.stringify(oldC1));
      writeFileSync(path.join(ws, "harness", "experience", "probes", "PROJ-70", "baseline.json"), JSON.stringify(oldBase));
      writeFileSync(path.join(ws, "harness", "experience", "PROJ-70.jsonl"), JSON.stringify(oldEntry) + "\n");
      execFileSync("git", ["add", "."], { cwd: ws });
      execFileSync("git", ["commit", "-m", "main with old PROJ-70 PPC"], { cwd: ws });

      execFileSync("git", ["checkout", "-b", "chore/70-harness-reuse"], { cwd: ws });
      writeFileSync(path.join(ws, "harness", "guardrails.local.md"), "# Modified\n");
      writeFileSync(
        path.join(ws, "harness", "experience", "PROJ-70.jsonl"),
        JSON.stringify(oldEntry) + "\n" + JSON.stringify({ task: "PROJ-70", lesson: "non-ppc note" }) + "\n"
      );
      execFileSync("git", ["add", "."], { cwd: ws });
      execFileSync("git", ["commit", "-m", "reuse old PPC without probe"], { cwd: ws });

      let localStatus = 0;
      let localErr = "";
      try {
        execFileSync(process.execPath, [mergeCheckScript, "--local"], { cwd: ws, encoding: "utf8", stdio: "pipe" });
      } catch (e: any) {
        localStatus = e.status;
        localErr = (e.stderr || "") + (e.stdout || "");
      }
      expect(localStatus).toBe(1);
      expect(localErr).toContain("ya existe en la base");
      expect(localErr).toContain("no se modificó en este PR");

      // Ahora renovar reportes y registro PPC
      const newC1 = { ...oldC1, duration_ms: 850 };
      const newBase = { ...oldBase, duration_ms: 1350 };
      const newContrast = evaluateCandidates([newC1, newBase]);
      const newEval = evaluateProbes([newC1, newBase]);
      const newEntry = {
        id: "exp-new-70",
        task: "PROJ-70",
        lesson: newEval.lesson,
        ppc: {
          winner_id: "c1",
          candidates: 2,
          probe_passed: true,
          duration_ms: 850,
          contrast: newContrast.contrast_matrix,
          contrast_matrix: newContrast.contrast_matrix,
          contrast_version: CONTRAST_VERSION,
          verdict: newContrast.verdict,
          reports_sha256: { c1: hashReport(newC1), baseline: hashReport(newBase) },
        },
      };
      writeFileSync(path.join(ws, "harness", "experience", "probes", "PROJ-70", "c1.json"), JSON.stringify(newC1));
      writeFileSync(path.join(ws, "harness", "experience", "probes", "PROJ-70", "baseline.json"), JSON.stringify(newBase));
      writeFileSync(
        path.join(ws, "harness", "experience", "PROJ-70.jsonl"),
        JSON.stringify(oldEntry) + "\n" + JSON.stringify(newEntry) + "\n"
      );

      const okLocal = execFileSync(process.execPath, [mergeCheckScript, "--local"], { cwd: ws, encoding: "utf8", stdio: "pipe" });
      expect(okLocal).toContain("Harness PPC verified for PROJ-70");
    });

    it("GIVEN modo CI (<pr>) con checkout base en disco que contiene el mismo id WHEN PR está OPEN THEN falla por registro existente en la base; con id nuevo pasa", () => {
      const { ws, lessonFile, prObj } = setupTempRepoWithPpc();
      const entry = JSON.parse(readFileSync(lessonFile, "utf8").trim());
      entry.id = "exp-ci-base-511";
      const baseText = JSON.stringify(entry) + "\n";
      writeFileSync(lessonFile, baseText);
      const baseProbeContents = {
        "harness/experience/probes/PROJ-511/c1.json": readFileSync(path.join(ws, "harness", "experience", "probes", "PROJ-511", "c1.json"), "utf8"),
        "harness/experience/probes/PROJ-511/baseline.json": readFileSync(path.join(ws, "harness", "experience", "probes", "PROJ-511", "baseline.json"), "utf8"),
      };

      const fakeFail = setupFakeGh(ws, {
        prJson: { ...prObj, state: "OPEN", baseRefName: "main" },
        contentsLesson: baseText,
        probeContents: baseProbeContents,
        eventsJson: [{ event: "labeled", label: "harness-authorized", actor: "Fresias", created_at: "2026-11-16T01:00:00Z" }],
      });
      let status = 0;
      let jsonOut = "";
      try {
        execFileSync(process.execPath, [mergeCheckScript, "511", "--json"], { cwd: ws, env: fakeFail.env, encoding: "utf8", stdio: "pipe" });
      } catch (e: any) {
        status = e.status;
        jsonOut = e.stdout || "";
      }
      expect(status).toBe(1);
      expect(JSON.parse(jsonOut).errors.join("\n")).toContain("ppc: el registro exp-ci-base-511 ya existe en la base");

      const prViewCalls = readFileSync(fakeFail.logFile, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as string[])
        .filter((c) => c[0] === "pr" && c[1] === "view");
      expect(prViewCalls[0]?.join(" ")).toContain("baseRefName");

      const freshEntry = { ...entry, id: "exp-ci-new-511" };
      const fakeOk = setupFakeGh(ws, {
        prJson: { ...prObj, state: "OPEN", baseRefName: "main" },
        contentsLesson: baseText + JSON.stringify(freshEntry) + "\n",
        probeContents: baseProbeContents,
        eventsJson: [{ event: "labeled", label: "harness-authorized", actor: "Fresias", created_at: "2026-11-16T01:00:00Z" }],
      });
      const okOut = execFileSync(process.execPath, [mergeCheckScript, "511", "--json"], { cwd: ws, env: fakeOk.env, encoding: "utf8", stdio: "pipe" });
      expect(JSON.parse(okOut).mergeable).toBe(true);
    });

    it("GIVEN PR de seguimiento en modo CI (<pr>) sobre issue con reportes previos en localProbesDir (base) WHEN trae registro nuevo y reportes regenerados en pr.files vía gh api THEN pasa; sin regenerar reportes en pr.files THEN falla", () => {
      const { ws, lessonFile, prObj } = setupTempRepoWithPpc();
      const baseEntry = JSON.parse(readFileSync(lessonFile, "utf8").trim());
      baseEntry.id = "exp-base-followup-511";
      const baseText = JSON.stringify(baseEntry) + "\n";
      writeFileSync(lessonFile, baseText);

      // Reportes NUEVOS regenerados en el head del PR (distintos de los viejos en localProbesDir de la base)
      const headC1 = {
        candidate_id: "c1",
        passed: true,
        duration_ms: 650,
        files_touched: ["harness/guardrails.local.md"],
        tests: { "t::a": "passed" },
      };
      const headBase = {
        candidate_id: "baseline",
        passed: true,
        duration_ms: 1150,
        files_touched: [],
        tests: { "t::a": "failed" },
      };
      const headReports = [headC1, headBase];
      const headContrast = evaluateCandidates(headReports);
      const headEval = evaluateProbes(headReports);
      const headEntry = {
        id: "exp-head-followup-511",
        task: "PROJ-511",
        lesson: headEval.lesson,
        ppc: {
          winner_id: "c1",
          candidates: 2,
          probe_passed: true,
          duration_ms: 650,
          contrast: headContrast.contrast_matrix,
          contrast_matrix: headContrast.contrast_matrix,
          contrast_version: CONTRAST_VERSION,
          verdict: headContrast.verdict,
          reports_sha256: { c1: hashReport(headC1), baseline: hashReport(headBase) },
        },
      };

      // 1. Con registro nuevo y reportes regenerados en pr.files (leídos vía gh api, saltando localProbesDir viejo): PASA
      const fakePass = setupFakeGh(ws, {
        prJson: { ...prObj, number: 512, state: "OPEN", baseRefName: "main" },
        contentsLesson: baseText + JSON.stringify(headEntry) + "\n",
        probeContents: {
          "harness/experience/probes/PROJ-511/c1.json": JSON.stringify(headC1),
          "harness/experience/probes/PROJ-511/baseline.json": JSON.stringify(headBase),
        },
        eventsJson: [{ event: "labeled", label: "harness-authorized", actor: "Fresias", created_at: "2026-11-16T01:00:00Z" }],
      });
      const passOut = execFileSync(process.execPath, [mergeCheckScript, "512", "--json"], {
        cwd: ws,
        env: { ...process.env, PATH: fakePass.env.PATH },
        encoding: "utf8",
        stdio: "pipe",
      });
      expect(JSON.parse(passOut).mergeable).toBe(true);

      // 2. Sin regenerar reportes en pr.files (aunque localProbesDir exista en base): FALLA y no carga los reportes viejos de base
      const prWithoutProbes = {
        ...prObj,
        number: 512,
        state: "OPEN",
        baseRefName: "main",
        files: [
          { path: "harness/guardrails.local.md" },
          { path: "harness/experience/PROJ-511.jsonl" },
        ],
      };
      const fakeFail = setupFakeGh(ws, {
        prJson: prWithoutProbes,
        contentsLesson: baseText + JSON.stringify(headEntry) + "\n",
        eventsJson: [{ event: "labeled", label: "harness-authorized", actor: "Fresias", created_at: "2026-11-16T01:00:00Z" }],
      });
      let failStatus = 0;
      let failJson = "";
      try {
        execFileSync(process.execPath, [mergeCheckScript, "512", "--json"], {
          cwd: ws,
          env: { ...process.env, PATH: fakeFail.env.PATH },
          encoding: "utf8",
          stdio: "pipe",
        });
      } catch (e: any) {
        failStatus = e.status;
        failJson = e.stdout || "";
      }
      expect(failStatus).toBe(1);
      const failErrors = (JSON.parse(failJson).errors as string[]).join("\n");
      expect(failErrors).toContain("ppc: el reporte c1 no se modificó en este PR");
      expect(failErrors).toContain("ppc: el reporte baseline no se modificó en este PR");
      expect(failErrors).toContain("ppc: missing probe reports");
    });
  });

  it("GIVEN una rama de harness con un registro editado a mano WHEN corre harness-gate.sh THEN no sella y explica por qué", () => {
    const ws = temp("gate-harness-tampered");
    execFileSync("git", ["init", "-b", "main", ws], { stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: ws });
    execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: ws });
    
    mkdirSync(path.join(ws, "harness"), { recursive: true });
    writeFileSync(path.join(ws, "harness", "project.json"), JSON.stringify({ issue_prefix: "PROJ", gate: "node -e \"process.exit(0)\"" }));
    writeFileSync(path.join(ws, "harness", "guardrails.md"), "# Initial");
    execFileSync("git", ["add", "."], { cwd: ws });
    execFileSync("git", ["commit", "-m", "init"], { cwd: ws });

    execFileSync("git", ["checkout", "-b", "chore/88-harness-tampered"], { cwd: ws });
    writeFileSync(path.join(ws, "harness", "guardrails.md"), "# Modified by hand");
    
    mkdirSync(path.join(ws, "harness", "experience"), { recursive: true });
    writeFileSync(path.join(ws, "harness", "experience", "PROJ-88.jsonl"), JSON.stringify({
      task: "PROJ-88",
      lesson: "tampered lesson",
      ppc: { winner_id: "c1", candidates: 2, probe_passed: true, contrast: [{ candidate_id: "c1", score: 25 }] }
    }) + "\n");
    execFileSync("git", ["add", "."], { cwd: ws });
    execFileSync("git", ["commit", "-m", "chore: tampered harness"], { cwd: ws });

    let gateFailed = false;
    let gateOutput = "";
    try {
      execFileSync(bashBin, [gateScript], { cwd: ws, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (err: any) {
      gateFailed = true;
      gateOutput = (err.stdout || "") + (err.stderr || "");
    }

    expect(gateFailed).toBe(true);
    expect(gateOutput).toMatch(/PPC|reports|probe/i);
    expect(existsSync(path.join(ws, ".harness", "complete.json"))).toBe(false);
  });

  it("GIVEN un PPC sin probe aprobado (solo decisión explícita) THEN bloqueado", () => {
    const ppcLesson = JSON.stringify({ task: "PROJ-12", lesson: "x", ppc: { winner_id: "c1", probe_passed: false } }) + "\n";
    const pr = { ...base, headRefName: "chore/12-harness-fix", files: [...base.files, { path: "harness/x.md" }], labels: [{ name: "harness-authorized" }] };
    expect(evaluateMerge({ pr, project, lessonText: ppcLesson }).errors.join()).toContain("ppc:");
  });

  it("clasifica rutas e issues", () => {
    expect(isHarnessPath("harness/experience/PROJ-1.jsonl")).toBe(false);
    expect(isHarnessPath("AGENTS.md")).toBe(true);
    expect(isHarnessPath("src/harness/x.ts")).toBe(false);
    expect(issueFromBranch("fix/412-cta", "GOZS")).toBe("GOZS-412");
    expect(issueFromBranch("main", "GOZS")).toBe("");
  });
});

describe("Guard: PowerShell cubierto y fuentes del harness protegidas por rama", () => {
  const unauthorized = repo("feature/9-feat");
  const authorized = repo("chore/9-harness-fix");

  it("GIVEN el tool PowerShell de Claude Code THEN se normaliza como shell", () => {
    const n = normalize({ hook_event_name: "PreToolUse", tool_name: "PowerShell", tool_input: { command: "git status" } });
    expect(n.kind).toBe("shell");
    expect(n.command).toBe("git status");
  });

  it("GIVEN Remove-Item -Recurse -Force THEN shell.rm-rf", () => {
    const r = evaluateRules({ kind: "shell", command: "Remove-Item -Recurse -Force node_modules" }, { repoRoot: unauthorized });
    expect(r.ruleId).toBe("shell.rm-rf");
  });

  it("GIVEN Get-Content .env THEN shell.env-leak", () => {
    expect(evaluateRules({ kind: "shell", command: "Get-Content .env" }, { repoRoot: unauthorized }).ruleId).toBe("shell.env-leak");
  });

  it("GIVEN código que lee process.env / $env: THEN no es acceso a un archivo .env", () => {
    expect(evaluateRules({ kind: "shell", command: "type gh; node -e 'console.log(process.env.PATH)'" }, { repoRoot: unauthorized }).allowed).toBe(true);
    expect(evaluateRules({ kind: "shell", command: "Get-ChildItem $env:TEMP" }, { repoRoot: unauthorized }).allowed).toBe(true);
  });

  it("GIVEN Set-Content sobre .claude/ THEN fs.protected", () => {
    const r = evaluateRules({ kind: "shell", command: "Set-Content .claude/settings.json '{}'" }, { repoRoot: unauthorized });
    expect(r.ruleId).toBe("fs.protected");
  });

  const blocked: Array<Record<string, string>> = [
    { kind: "write", targetPath: "harness/systemprompt.md" },
    { kind: "write", targetPath: "harness-kit/core/guard/rules.json" },
    { kind: "write", targetPath: ".github/workflows/ci.yml" },
    { kind: "shell", command: "Set-Content -Path harness/guardrails.local.md -Value x" },
    { kind: "shell", command: "echo x >> harness/tool_guidance.local.md" },
    { kind: "shell", command: "sed -i 's/a/b/' harness-kit/core/scripts/harness-gate.sh" },
    { kind: "shell", command: "node harness-kit/core/scripts/harness-render.mjs" },
  ];
  for (const call of blocked) {
    it(`GIVEN rama de feature WHEN ${call.command ?? call.targetPath} THEN harness.authorized-only`, () => {
      expect(evaluateRules(call, { repoRoot: unauthorized }).ruleId).toBe("harness.authorized-only");
    });
    it(`GIVEN rama chore/<#>-harness-* WHEN ${call.command ?? call.targetPath} THEN permitido`, () => {
      expect(evaluateRules(call, { repoRoot: authorized }).allowed).toBe(true);
    });
  }

  it("GIVEN la ruta absoluta del repo WHEN se escribe en harness/ desde shell THEN harness.authorized-only", () => {
    const abs = path.join(unauthorized, "harness", "guardrails.local.md").replace(/\\/g, "/");
    expect(evaluateRules({ kind: "shell", command: `echo x >> "${abs}"` }, { repoRoot: unauthorized }).ruleId).toBe("harness.authorized-only");
  });

  it("GIVEN cp con destino en harness/ THEN harness.authorized-only", () => {
    expect(evaluateRules({ kind: "shell", command: "cp /tmp/x.md harness/guardrails.local.md" }, { repoRoot: unauthorized }).ruleId).toBe("harness.authorized-only");
  });

  it("GIVEN git push seguido de gh api -F THEN no es force push (flags por segmento)", () => {
    const cmd = 'git push -q origin chore/9-harness-fix; gh api -X PATCH repos/o/r/pulls/1 -F "body=@b.md"';
    expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: authorized }).allowed).toBe(true);
  });

  for (const cmd of ["git push -f origin x", "git push -uf origin x", "git push --force-with-lease", "git push origin +main", "echo ok && git push -f"]) {
    it(`GIVEN "${cmd}" THEN git.force-push`, () => {
      expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: authorized }).ruleId).toBe("git.force-push");
    });
  }

  it("GIVEN rm de un archivo con guiones en el nombre THEN no es rm -rf", () => {
    const cmd = "npx vitest run a/zz-upstream-check.spec.ts; rm a/harness-flow-enforcement.spec.ts";
    expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: authorized }).allowed).toBe(true);
  });

  for (const cmd of ["rm -rf dist", "rm -r -f dist", "rm -fr dist", "rm --recursive --force dist", "ls && rm -Rf dist"]) {
    it(`GIVEN "${cmd}" THEN shell.rm-rf`, () => {
      expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: authorized }).ruleId).toBe("shell.rm-rf");
    });
  }

  it("GIVEN gh pr create/merge --repo de OTRO repositorio THEN no aplica el sello de este repo", () => {
    const dir = repo("chore/7-harness-x");
    execFileSync("git", ["remote", "add", "origin", "https://github.com/acme/app.git"], { cwd: dir });
    const other = "gh pr create --repo acme/kit --base main --head b --title t --body-file none.md";
    expect(evaluateRules({ kind: "shell", command: other }, { repoRoot: dir }).allowed).toBe(true);
    expect(evaluateRules({ kind: "shell", command: "gh pr merge 3 --repo acme/kit --squash" }, { repoRoot: dir }).allowed).toBe(true);
    const same = "gh pr create --repo acme/app --base main --head b --title t --body-file none.md";
    expect(evaluateRules({ kind: "shell", command: same }, { repoRoot: dir }).ruleId).toBe("pr.requires-seal");
    const spoof = "gh pr merge 3 -R acme/kit --repo acme/app --squash";
    expect(evaluateRules({ kind: "shell", command: spoof }, { repoRoot: dir }).ruleId).toBe("pr.merge-check");
    for (const tail of ["; echo --repo acme/kit", " && gh pr view 1 --repo acme/kit", "; echo -R acme/kit"]) {
      expect(evaluateRules({ kind: "shell", command: `gh pr merge 3 --squash${tail}` }, { repoRoot: dir }).ruleId).toBe("pr.merge-check");
      expect(evaluateRules({ kind: "shell", command: `gh pr create --title t --body x${tail}` }, { repoRoot: dir }).ruleId).toBe("pr.requires-seal");
    }
    // QA GOZS-432 r2: un --repo ajeno ANTES del merge propio tampoco exime.
    expect(evaluateRules({ kind: "shell", command: "echo '--repo acme/kit'; gh pr merge 3" }, { repoRoot: dir }).ruleId).toBe("pr.merge-check");
  }, 90000);

  it("GIVEN gh api …/pulls/N/merge THEN el repo sale de la ruta, no de --repo (gh api lo ignora)", () => {
    const dir = repo("chore/8-harness-x");
    execFileSync("git", ["remote", "add", "origin", "https://github.com/acme/app.git"], { cwd: dir });
    const own = "gh api repos/acme/app/pulls/3/merge -X PUT --repo acme/kit";
    expect(evaluateRules({ kind: "shell", command: own }, { repoRoot: dir }).ruleId).toBe("pr.merge-check");
    const placeholder = "gh api repos/{owner}/{repo}/pulls/3/merge -X PUT --repo acme/kit";
    expect(evaluateRules({ kind: "shell", command: placeholder }, { repoRoot: dir }).ruleId).toBe("pr.merge-check");
    expect(evaluateRules({ kind: "shell", command: "gh api repos/acme/kit/pulls/3/merge -X PUT" }, { repoRoot: dir }).allowed).toBe(true);
  });

  it("GIVEN gh pr merge THEN el guard solo verifica: no publica el status (lo publica el CI, app GitHub Actions)", () => {
    const core = readFileSync(path.resolve(here, "..", "core", "guard", "guard-core.mjs"), "utf8");
    const fn = core.slice(core.indexOf("function mergeCheck("), core.indexOf("function mergeCheck(") + 400);
    expect(fn).not.toContain("--post-status");
    // En el consumidor, el CI es quien publica el status (en el repo del kit no hay ci.yml).
    const mergeCheckWorkflow = path.resolve(here, "..", "..", ".github", "workflows", "harness-merge-check.yml");
    const ciPath = path.resolve(here, "..", "..", ".github", "workflows", "ci.yml");
    const targetPath = existsSync(mergeCheckWorkflow) ? mergeCheckWorkflow : ciPath;
    if (existsSync(targetPath)) expect(readFileSync(targetPath, "utf8")).toContain("harness-merge-check.mjs ${{ github.event.pull_request.number }} --post-status");
  });

  it("GIVEN la memoria del agente (~/.claude/projects/<p>/memory/) THEN escribible; hooks y settings siguen protegidos", () => {
    const mem = "C:/Users/u/.claude/projects/C--work-task/memory/MEMORY.md";
    expect(evaluateRules({ kind: "write", targetPath: mem }, { repoRoot: unauthorized }).allowed).toBe(true);
    expect(evaluateRules({ kind: "shell", command: `cp notes.md "${mem}"` }, { repoRoot: unauthorized }).allowed).toBe(true);
    for (const p of [
      "C:/Users/u/.claude/settings.json",
      "C:/Users/u/.claude/hooks/harness-dispatch.mjs",
      "C:/Users/u/.claude/hooks/harness-kit/core/guard/rules.json",
      "C:/Users/u/.claude/projects/x/settings.json",
      "C:/Users/u/.claude/projects/p/memory/../../../settings.json",
      "C:/Users/u/.claude/projects/p/memory/../../../hooks/guard.sh",
      "C:\\Users\\u\\.claude\\projects\\p\\memory\\..\\..\\..\\settings.json",
      "C:/Users/u/.claude/projects/p/memory/%2e%2e/settings.json",
    ]) {
      expect(evaluateRules({ kind: "write", targetPath: p }, { repoRoot: unauthorized }).ruleId).toBe("fs.protected");
    }
    expect(evaluateRules({ kind: "shell", command: `cp a.md "${mem}" && cp b.json C:/Users/u/.claude/settings.json` }, { repoRoot: unauthorized }).ruleId).toBe("fs.protected");
    for (const cmd of [
      "echo x > ~/.claude/projects/p/memory/../../../settings.json",
      "echo x > \"~/.claude/projects/p/memory/../../../settings.json\"",
      "Set-Content C:\\Users\\u\\.claude\\projects\\p\\memory\\..\\..\\..\\settings.json x",
      "echo x > ~/.claude/projects/p/memory/%2e%2e/settings.json",
    ]) {
      expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: unauthorized }).ruleId).toBe("fs.protected");
    }
  });

  it("GIVEN cambios a la protección de rama o rulesets por gh api THEN repo.protection-locked; leerla se permite", () => {
    for (const cmd of [
      "gh api -X PUT repos/o/r/branches/main/protection --input p.json",
      "gh api -XPUT repos/o/r/branches/main/protection",
      "gh api --method DELETE repos/o/r/branches/main/protection/enforce_admins",
      "gh api -XDELETE repos/o/r/branches/main/protection/enforce_admins",
      "gh api -X POST repos/o/r/rulesets -f name=x",
      "gh api -X PATCH repos/o/r/branches/main/protection/required_status_checks -f strict=false",
      "gh api repos/o/r/branches/main/protection -f required=x",
      "gh api repos/o/r/branches/main/protection -F required=x",
      "gh api repos/o/r/branches/main/protection --input file.json",
      "gh api repos/o/r/rulesets -f name=x",
      "gh api repos/o/r/rulesets --input file.json",
    ]) {
      expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: unauthorized }).ruleId).toBe("repo.protection-locked");
    }
    for (const cmd of [
      "gh api repos/o/r/branches/main/protection",
      "gh api -X GET repos/o/r/branches/main/protection",
      "gh api -XGET repos/o/r/branches/main/protection",
      "gh api --method=GET repos/o/r/branches/main/protection",
      "gh api repos/o/r/rulesets",
      "gh api repos/o/r/rulesets/123",
    ]) {
      expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: unauthorized }).allowed).toBe(true);
    }
  });

  it("GIVEN gh api con ../ o %2e en la ruta THEN no se exime: corre el merge-check", () => {
    const dir = repo("chore/9-harness-y");
    execFileSync("git", ["remote", "add", "origin", "https://github.com/acme/app.git"], { cwd: dir });
    for (const cmd of ["gh api repos/acme/kit/../app/pulls/3/merge -X PUT", "gh api repos/acme/kit/%2e%2e/app/pulls/3/merge -X PUT"]) {
      expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: dir }).ruleId).toBe("pr.merge-check");
    }
  });

  it("GIVEN publicar a mano el status harness/merge-check THEN pr.merge-check", () => {
    const cmd = "gh api -X POST repos/o/r/statuses/abc -f state=success -f context=harness/merge-check";
    expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: unauthorized }).ruleId).toBe("pr.merge-check");
  });

  const open: Array<Record<string, string>> = [
    // QA GOZS-429: copiar DESDE harness/ es una lectura; rutas harness/ fuera del repo no son el harness.
    { kind: "shell", command: "cp harness/guardrails.local.md /tmp/copy.md" },
    { kind: "shell", command: "mkdir -p /tmp/qa/harness && printf x > /tmp/qa/harness/guardrails.local.md" },
    { kind: "shell", command: "node harness-kit/core/scripts/harness-render.mjs --check /tmp/qa/harness" },
    { kind: "write", targetPath: "harness/experience/PROJ-9.jsonl" },
    { kind: "shell", command: "bash harness-kit/core/scripts/harness-learn.sh --lesson x" },
    { kind: "shell", command: "node harness-kit/core/scripts/harness-render.mjs --check" },
    { kind: "shell", command: "npx vitest run harness-kit/tests" },
    { kind: "shell", command: "cat harness/guardrails.local.md > /tmp/copy.md" },
  ];
  for (const call of open) {
    it(`GIVEN rama de feature WHEN ${call.command ?? call.targetPath} THEN permitido (lecturas, --check y lecciones)`, () => {
      expect(evaluateRules(call, { repoRoot: unauthorized }).allowed).toBe(true);
    });
  }
});

describe("Render: gate de encoding del overlay", () => {
  function overlay(): string {
    const ws = temp("harness-enc-");
    const o = path.join(ws, "harness");
    mkdirSync(o);
    writeFileSync(path.join(o, "harness.json"), JSON.stringify({ kit: "harness-kit", version: "2.0.0", out: ".harness" }));
    writeFileSync(path.join(o, "project.json"), JSON.stringify({ name: "enc", runtimes: [], gate: "npm test" }));
    writeFileSync(path.join(o, "systemprompt.md"), "# Enc\n\nok\n");
    return o;
  }
  const render = (o: string) => run(process.execPath, [renderScript, o], path.dirname(o));

  it("GIVEN un overlay limpio THEN render OK", () => {
    expect(render(overlay()).code).toBe(0);
  });

  const defects: Array<[string, Buffer, string]> = [
    ["BOM", Buffer.from("\ufeff# Enc\n", "utf8"), "BOM"],
    ["BEL de PowerShell `a", Buffer.from("- Zero demo (\u0007ssertNoDemo)\n", "utf8"), "U+0007"],
    ["BS de PowerShell `b", Buffer.from("- set \u0008locked\n", "utf8"), "U+0008"],
    ["ISO-8859", Buffer.from("- expl\u00edcitos\n", "latin1"), "invalid UTF-8"],
    ["U+FFFD", Buffer.from("- expl\ufffdcitos\n", "utf8"), "U+fffd"],
  ];
  for (const [name, bytes, msg] of defects) {
    it(`GIVEN guardrails.local.md con ${name} THEN render falla indicando el defecto`, () => {
      const o = overlay();
      writeFileSync(path.join(o, "guardrails.local.md"), bytes);
      const r = render(o);
      expect(r.code).toBe(1);
      expect(r.out).toContain("guardrails.local.md");
      expect(r.out).toContain(msg);
    });
  }

  it("GIVEN systemprompt.md con BOM THEN el nombre del proyecto no se vuelve '#' (regresión PR #410)", () => {
    const o = overlay();
    writeFileSync(path.join(o, "project.json"), JSON.stringify({ name: "enc", runtimes: ["gemini-cli"], gate: "npm test" }));
    writeFileSync(path.join(o, "systemprompt.md"), "# EncName — Guidelines\n\n## Section\n");
    expect(render(o).code).toBe(0);
    const settings = readFileSync(path.join(path.dirname(o), ".gemini", "settings.json"), "utf8");
    expect(settings).toContain("EncName security");
    expect(settings).not.toContain('"# ');
  });

  it("GIVEN harness/experience/<ISSUE>.jsonl con task distinto al archivo THEN render falla", () => {
    const o = overlay();
    mkdirSync(path.join(o, "experience"));
    writeFileSync(path.join(o, "experience", "PROJ-1.jsonl"), JSON.stringify({ task: "PROJ-2", lesson: "x" }) + "\n");
    expect(render(o).code).toBe(1);
  });
});

describe("Claude Code user dispatcher: el guard aplica aunque la sesión arranque fuera del repo (workdir Multica)", () => {
  const kitDir = path.resolve(here, "..");
  const dispatch = path.join(kitDir, "core", "plugins", "claude-code", "dispatch.mjs");
  // Layout Multica: <workdir>/<repo>/ con el kit en <repo>/harness-kit (junction: sin privilegios en Windows).
  // Independiente del layout: sirve igual en el repo del kit y en un consumidor.
  const workdir = temp("harness-workdir-");
  const consumer = path.join(workdir, "repo");
  mkdirSync(path.join(consumer, "harness"), { recursive: true });
  writeFileSync(path.join(consumer, "harness", "project.json"), JSON.stringify({ name: "c", runtimes: [], gate: "npm test" }));
  execFileSync("git", ["init", "-q"], { cwd: consumer });
  execFileSync(process.execPath, ["-e", `require("fs").symlinkSync(${JSON.stringify(kitDir)}, ${JSON.stringify(path.join(consumer, "harness-kit"))}, "junction")`]);

  function hook(cwd: string, tool_name: string, tool_input: Record<string, unknown>): { code: number; out: string } {
    try {
      const out = execFileSync(process.execPath, [dispatch], {
        input: JSON.stringify({ hook_event_name: "PreToolUse", cwd, tool_name, tool_input }),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
      });
      return { code: 0, out };
    } catch (err) {
      const e = err as { status?: number; stderr?: string };
      return { code: e.status ?? 1, out: e.stderr ?? "" };
    }
  }

  it("GIVEN cwd = workdir y Bash `git branch -D` THEN bloquea (exit 2)", () => {
    const r = hook(workdir, "Bash", { command: "cd repo && git branch -D foo" });
    expect(r.code).toBe(2);
    expect(r.out).toContain("git branch -D is forbidden");
  });

  it("GIVEN cwd = workdir y PowerShell Remove-Item -Recurse -Force THEN bloquea (exit 2)", () => {
    expect(hook(workdir, "PowerShell", { command: "Remove-Item -Recurse -Force repo\src" }).code).toBe(2);
  });

  it("GIVEN cwd = workdir y Read de un .env del repo THEN bloquea", () => {
    expect(hook(workdir, "Read", { file_path: path.join(workdir, "repo", ".env.local") }).code).toBe(2);
  });

  it("GIVEN un comando inocuo THEN permite (exit 0)", () => {
    expect(hook(workdir, "Bash", { command: "git status" }).code).toBe(0);
  });

  it("GIVEN una copia suelta del kit sin .git en el workdir THEN no se toma como repo (exit 0)", () => {
    const stray = temp("harness-stray-");
    execFileSync(process.execPath, ["-e", `require("fs").symlinkSync(${JSON.stringify(kitDir)}, ${JSON.stringify(path.join(stray, "harness-kit"))}, "junction")`]);
    expect(hook(stray, "Bash", { command: "git branch -D foo" }).code).toBe(0);
  });

  it("GIVEN una rama con el guard viejo o editado THEN el dispatcher instalado aplica el kit instalado (GOZS-430/#417)", () => {
    const home = temp("harness-home-");
    const install = path.join(kitDir, "core", "plugins", "claude-code", "install.mjs");
    execFileSync(process.execPath, [install, "--home", home], { stdio: "pipe" });
    expect(run(process.execPath, [install, "--home", home, "--check"], home).code).toBe(0);
    // Repo cuyo guard propio permite todo (rama desactualizada o guard manipulado).
    const wd = temp("harness-stale-wd-");
    const stale = path.join(wd, "repo");
    mkdirSync(path.join(stale, "harness-kit", "core", "guard"), { recursive: true });
    writeFileSync(path.join(stale, "harness-kit", "core", "guard", "guard-cli.mjs"), "process.exit(0)\n");
    mkdirSync(path.join(stale, "harness"));
    writeFileSync(path.join(stale, "harness", "project.json"), JSON.stringify({ name: "s", runtimes: [], gate: "npm test" }));
    execFileSync("git", ["init", "-q"], { cwd: stale });
    const installedDispatch = path.join(home, ".claude", "hooks", "harness-dispatch.mjs");
    let code = 0;
    try {
      execFileSync(process.execPath, [installedDispatch], {
        input: JSON.stringify({ hook_event_name: "PreToolUse", cwd: wd, tool_name: "Bash", tool_input: { command: "cd repo && git branch -D foo" } }),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      code = (err as { status?: number }).status ?? 1;
    }
    expect(code).toBe(2);
  });

  it("GIVEN un directorio sin harness THEN no interviene (exit 0)", () => {
    expect(hook(temp("no-harness-"), "Bash", { command: "git branch -D foo" }).code).toBe(0);
  });
});

describe("fs.protected en shell: redirección hacia la ruta, no menciones en texto", () => {
  const dir = repo("feature/3-z");
  it("GIVEN echo x > .claude/settings.json THEN fs.protected", () => {
    expect(evaluateRules({ kind: "shell", command: "echo x > .claude/settings.json" }, { repoRoot: dir }).ruleId).toBe("fs.protected");
  });
  it("GIVEN Set-Content sobre .gemini/ THEN fs.protected", () => {
    expect(evaluateRules({ kind: "shell", command: "Set-Content .gemini/settings.json x" }, { repoRoot: dir }).ruleId).toBe("fs.protected");
  });
  it("GIVEN un mensaje de commit que menciona .claude/ y contiene <slug> THEN permitido", () => {
    const cmd = 'git commit -m "docs: la config .claude/ se carga solo en <repo>"';
    expect(evaluateRules({ kind: "shell", command: cmd }, { repoRoot: dir }).allowed).toBe(true);
  });
});
