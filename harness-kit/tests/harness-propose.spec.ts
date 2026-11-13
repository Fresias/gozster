import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - mjs module
import { consolidateLessons, calculateDebt, analyzeFrictionAndPropose, markLessonsProcessed, readJsonLines } from "../core/scripts/harness-propose.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..");
const repoRoot = path.resolve(kitDir, "..");
const proposeScript = path.join(kitDir, "core", "scripts", "harness-propose.mjs");

describe("Harness² Proposer & Debt Controller (harness-propose)", () => {
  let tmpRepo: string;

  beforeEach(() => {
    tmpRepo = mkdtempSync(path.join(tmpdir(), "harness-propose-test-"));
    mkdirSync(path.join(tmpRepo, "harness", "experience"), { recursive: true });

    // Seed baseline experience_library.jsonl
    const baseline = [
      { id: "exp-base-1", task: "GOZS-100", lesson: "Baseline verified fact", verified: true, processed_by_proposer: true },
    ];
    writeFileSync(
      path.join(tmpRepo, "harness", "experience_library.jsonl"),
      baseline.map((e) => JSON.stringify(e)).join("\n") + "\n",
      "utf8"
    );
  });

  afterEach(() => {
    if (existsSync(tmpRepo)) {
      rmSync(tmpRepo, { recursive: true, force: true });
    }
  });

  it("GIVEN lecciones en harness/experience/*.jsonl WHEN se consolida THEN se sincronizan en experience_library.jsonl", () => {
    const l1 = { id: "exp-201", task: "GOZS-201", lesson: "Error en shell quoting en comandos gh api", tags: ["gh", "cli"] };
    const l2 = { id: "exp-202", task: "GOZS-202", lesson: "Falla por RLS en tabla alumnos", tags: ["db", "rls"] };

    writeFileSync(path.join(tmpRepo, "harness", "experience", "GOZS-201.jsonl"), JSON.stringify(l1) + "\n", "utf8");
    writeFileSync(path.join(tmpRepo, "harness", "experience", "GOZS-202.jsonl"), JSON.stringify(l2) + "\n", "utf8");

    const res = consolidateLessons(tmpRepo);
    expect(res.added).toBe(2);
    expect(res.total).toBe(3);

    const lib = readJsonLines(path.join(tmpRepo, "harness", "experience_library.jsonl"));
    expect(lib.length).toBe(3);
    const addedItem = lib.find((e: any) => e.task === "GOZS-201");
    expect(addedItem?.processed_by_proposer).toBe(false);

    // Idempotencia: segunda llamada no duplica
    const res2 = consolidateLessons(tmpRepo);
    expect(res2.added).toBe(0);
    expect(res2.total).toBe(3);
  });

  it("GIVEN lecciones sin procesar WHEN calculateDebt THEN reporta la deuda y deudaExcedida según umbral", () => {
    for (let i = 1; i <= 6; i++) {
      const item = { id: `exp-debt-${i}`, task: `GOZS-30${i}`, lesson: `Lección ${i}` };
      writeFileSync(path.join(tmpRepo, "harness", "experience", `GOZS-30${i}.jsonl`), JSON.stringify(item) + "\n", "utf8");
    }

    const debtThreshold5 = calculateDebt(tmpRepo, 5);
    expect(debtThreshold5.unprocessed).toBe(6);
    expect(debtThreshold5.debtExceeded).toBe(true);

    const debtThreshold10 = calculateDebt(tmpRepo, 10);
    expect(debtThreshold10.debtExceeded).toBe(false);
  });

  it("GIVEN deuda excedida WHEN se ejecuta CLI --check-debt THEN sale con código 1; con deuda <= umbral sale con 0", () => {
    for (let i = 1; i <= 6; i++) {
      const item = { id: `exp-cli-${i}`, task: `GOZS-40${i}`, lesson: `Fricción ${i}` };
      writeFileSync(path.join(tmpRepo, "harness", "experience", `GOZS-40${i}.jsonl`), JSON.stringify(item) + "\n", "utf8");
    }

    // Falla con límite 5
    expect(() => {
      execFileSync(process.execPath, [proposeScript, "--workdir", tmpRepo, "--check-debt", "--max-debt", "5"], {
        stdio: "pipe",
      });
    }).toThrow();

    // Pasa con límite 10
    const out = execFileSync(process.execPath, [proposeScript, "--workdir", tmpRepo, "--check-debt", "--max-debt", "10"], {
      encoding: "utf8",
    });
    expect(out).toContain("sin procesar: 6 (límite: 10)");
  });

  it("GIVEN fixture con lecciones sin procesar WHEN --check-debt o --post-merge THEN pureza estricta sin escrituras en harness/", () => {
    const libPath = path.join(tmpRepo, "harness", "experience_library.jsonl");
    const shaBefore = createHash("sha256").update(readFileSync(libPath)).digest("hex");
    const harnessFilesBefore = readdirSync(path.join(tmpRepo, "harness")).sort();

    for (let i = 1; i <= 6; i++) {
      const item = { id: `exp-pure-${i}`, task: `GOZS-80${i}`, lesson: `Fricción pura ${i}` };
      writeFileSync(path.join(tmpRepo, "harness", "experience", `GOZS-80${i}.jsonl`), JSON.stringify(item) + "\n", "utf8");
    }

    // 1. Con >5 lecciones sin procesar, --check-debt sale con 1, sha256 idéntico, no crea archivos en harness/
    let checkErr: any = null;
    try {
      execFileSync(process.execPath, [proposeScript, "--workdir", tmpRepo, "--check-debt", "--max-debt", "5"], {
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (e: any) {
      checkErr = e;
    }

    expect(checkErr).not.toBeNull();
    expect(checkErr.status).toBe(1);
    const errOutput = (checkErr.stderr?.toString() || "") + (checkErr.stdout?.toString() || "");
    expect(errOutput).toContain("harness-debt-consolidacion");
    expect(errOutput).not.toContain("--generate");

    const shaAfterCheck = createHash("sha256").update(readFileSync(libPath)).digest("hex");
    expect(shaAfterCheck).toBe(shaBefore);
    expect(readdirSync(path.join(tmpRepo, "harness")).sort()).toEqual(harnessFilesBefore);

    // 2. Con 5 o menos (maxDebt 10), sale con 0 sin escrituras en harness/
    const okOut = execFileSync(process.execPath, [proposeScript, "--workdir", tmpRepo, "--check-debt", "--max-debt", "10"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    expect(okOut).toContain("sin procesar: 6 (límite: 10)");
    const shaAfterOk = createHash("sha256").update(readFileSync(libPath)).digest("hex");
    expect(shaAfterOk).toBe(shaBefore);
    expect(readdirSync(path.join(tmpRepo, "harness")).sort()).toEqual(harnessFilesBefore);

    // 3. --post-merge no modifica harness/experience_library.jsonl
    execFileSync(process.execPath, [proposeScript, "--workdir", tmpRepo, "--post-merge"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    const shaAfterPostMerge = createHash("sha256").update(readFileSync(libPath)).digest("hex");
    expect(shaAfterPostMerge).toBe(shaBefore);
    expect(readdirSync(path.join(tmpRepo, "harness")).sort()).toEqual(harnessFilesBefore);
  });

  it("GIVEN lecciones con patrones de fricción WHEN analyzeFrictionAndPropose THEN genera candidatos conformes al contrato", () => {
    const l1 = { id: "exp-gh", task: "GOZS-501", lesson: "Bypass en comando gh api por flags ambiguos", tags: ["cli"] };
    const l2 = { id: "exp-db", task: "GOZS-502", lesson: "Violación append-only en migrations de supabase", tags: ["db"] };
    const l3 = { id: "exp-mem", task: "GOZS-503", lesson: "Path traversal desde la ruta de memoria", tags: ["guard"] };

    writeFileSync(path.join(tmpRepo, "harness", "experience", "GOZS-501.jsonl"), JSON.stringify(l1) + "\n", "utf8");
    writeFileSync(path.join(tmpRepo, "harness", "experience", "GOZS-502.jsonl"), JSON.stringify(l2) + "\n", "utf8");
    writeFileSync(path.join(tmpRepo, "harness", "experience", "GOZS-503.jsonl"), JSON.stringify(l3) + "\n", "utf8");

    const { candidates, unanalyzedCount } = analyzeFrictionAndPropose(tmpRepo);
    expect(unanalyzedCount).toBe(3);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates.length).toBeLessThanOrEqual(3);

    for (const c of candidates) {
      expect(c.candidate_id).toMatch(/^c\d+-/);
      expect(["system_prompt", "guardrails", "memory", "tool_guidance", "subagents", "skills", "scripts", "plugins"]).toContain(
        c.target_component
      );
      expect(c.file.startsWith("harness/")).toBe(true);
      expect(["append", "replace"]).toContain(c.action);
      expect(c.rationale.length).toBeGreaterThan(10);
      expect(c.content.length).toBeGreaterThan(5);

      // Invariante inviolable: nunca tocar core/guard/ o archivos del hard core
      expect(c.file.includes("core/guard")).toBe(false);
      expect(c.file.includes("guard.sh")).toBe(false);
    }
  });

  it("GIVEN tareas procesadas WHEN markLessonsProcessed THEN actualiza processed_by_proposer: true", () => {
    const l1 = { id: "exp-mark-1", task: "GOZS-601", lesson: "Lección a marcar" };
    writeFileSync(path.join(tmpRepo, "harness", "experience", "GOZS-601.jsonl"), JSON.stringify(l1) + "\n", "utf8");

    consolidateLessons(tmpRepo);
    let debt = calculateDebt(tmpRepo, 5);
    expect(debt.unprocessed).toBe(1);

    markLessonsProcessed(tmpRepo, ["GOZS-601"]);
    debt = calculateDebt(tmpRepo, 5);
    expect(debt.unprocessed).toBe(0);
  });

  it("GIVEN CLI con --generate y --json WHEN se ejecuta THEN escribe .harness/candidates.json y emite JSON válido", () => {
    const l1 = { id: "exp-gen-1", task: "GOZS-701", lesson: "Error en shell quoting en comandos gh api" };
    writeFileSync(path.join(tmpRepo, "harness", "experience", "GOZS-701.jsonl"), JSON.stringify(l1) + "\n", "utf8");

    const stdout = execFileSync(process.execPath, [proposeScript, "--workdir", tmpRepo, "--generate", "--json"], {
      encoding: "utf8",
    });

    const parsed = JSON.parse(stdout);
    expect(parsed.candidates).toBeDefined();
    expect(parsed.candidates.length).toBeGreaterThan(0);
    expect(existsSync(parsed.candidatesFile)).toBe(true);
  });
});
