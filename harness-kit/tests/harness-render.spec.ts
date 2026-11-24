import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

  describe("GOZS-525: Experience Library (Opción A: solo lecciones fijadas)", () => {
    it("GIVEN lecciones sin fijar (con o sin evidencia) WHEN corre el render THEN no existe la sección Experience Library y se liberan caracteres (Opción A)", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      const lessons = [
        { id: "l1", task: "T-1", lesson: "Lesson 1 with evidence", evidence: true, timestamp: "2026-11-01T10:00:00Z" },
        { id: "l2", task: "T-2", lesson: "Lesson 2 with metrics", metrics: { before: 10, after: 5 }, timestamp: "2026-11-02T10:00:00Z" },
        { id: "l3", task: "T-3", lesson: "Lesson 3 with delta", delta: -2, timestamp: "2026-11-03T10:00:00Z" },
        { id: "l4", task: "T-4", lesson: "Candidate c1-review on tool resolved task in 85290ms", timestamp: "2026-11-04T10:00:00Z" },
        { id: "l5", task: "T-5", lesson: "Lesson 5 citing c1 vs baseline: score +18", timestamp: "2026-11-05T10:00:00Z" },
      ];
      writeFileSync(path.join(dir, "experience_library.jsonl"), lessons.map((l) => JSON.stringify(l)).join("\n"));

      const { code } = runRender(dir);
      expect(code).toBe(0);

      const agentsMd = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(agentsMd).not.toContain("### Experience Library (Harness²)");
      expect(agentsMd).not.toContain("resolved task in");
      expect(agentsMd).not.toContain("Lesson 1 with evidence");
    });

    it("GIVEN una lección con pinned: true WHEN corre el render THEN aparece en AGENTS.md y las no fijadas no aparecen", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      const lessons = [
        { id: "l1", task: "T-1", lesson: "Pinned Critical Lesson 1", pinned: true, timestamp: "2026-11-01T10:00:00Z" },
        { id: "l2", task: "T-2", lesson: "Recent Lesson 2", evidence: true, timestamp: "2026-11-02T10:00:00Z" },
        { id: "l3", task: "T-3", lesson: "Recent Lesson 3", evidence: true, timestamp: "2026-11-03T10:00:00Z" },
      ];
      writeFileSync(path.join(dir, "experience_library.jsonl"), lessons.map((l) => JSON.stringify(l)).join("\n"));

      const { code } = runRender(dir);
      expect(code).toBe(0);

      const agentsMd = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(agentsMd).toContain("### Experience Library (Harness²)");
      expect(agentsMd).toContain("Pinned Critical Lesson 1");
      expect(agentsMd).not.toContain("Recent Lesson 2");
      expect(agentsMd).not.toContain("Recent Lesson 3");
    });

    it("GIVEN una entrada automática como 'Candidate c1 on x (c1 vs baseline: duration_ms -112)' WHEN corre el render THEN no aparece en AGENTS.md", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      const lessons = [
        { id: "l1", task: "T-1", lesson: "Candidate c1 on x (c1 vs baseline: duration_ms -112)", ppc: { winner_id: "c1", probe_passed: true } },
        { id: "l2", task: "T-2", lesson: "Candidate c2 on tool_guidance resolved task in 500ms", ppc: { winner_id: "c2" } },
      ];
      writeFileSync(path.join(dir, "experience_library.jsonl"), lessons.map((l) => JSON.stringify(l)).join("\n"));

      const { code } = runRender(dir);
      expect(code).toBe(0);

      const agentsMd = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(agentsMd).not.toContain("Candidate c1 on x");
      expect(agentsMd).not.toContain("resolved task in");
      expect(agentsMd).not.toContain("### Experience Library (Harness²)");
    });

    it("GIVEN un .harness/scope.json activo WHEN corre el render THEN tampoco aparecen lecciones automáticas", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      writeFileSync(path.join(dir, "scope.json"), JSON.stringify({ scope: ["database", "ui"] }));
      const lessons = [
        { id: "l1", task: "T-1", lesson: "Candidate c1 on database resolved task in 300ms", tags: ["database"], ppc: { winner_id: "c1" } },
        { id: "l2", task: "T-2", lesson: "Candidate c2 on ui (c2 vs baseline: duration_ms -100)", tags: ["ui"] },
      ];
      writeFileSync(path.join(dir, "experience_library.jsonl"), lessons.map((l) => JSON.stringify(l)).join("\n"));

      const { code } = runRender(dir);
      expect(code).toBe(0);

      const agentsMd = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(agentsMd).not.toContain("resolved task in");
      expect(agentsMd).not.toContain("Candidate c1");
      expect(agentsMd).not.toContain("Candidate c2");
      expect(agentsMd).not.toContain("### Experience Library (Harness²)");
    });

    it("GIVEN lecciones con pinned: true y un .harness/scope.json activo WHEN corre el render THEN aparecen siempre y el scope no las oculta", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      writeFileSync(path.join(dir, "scope.json"), JSON.stringify({ scope: ["database"] }));
      const lessons = [
        { id: "l1", task: "T-1", lesson: "Lección fijada global sobre QA", pinned: true, tags: ["qa"], timestamp: "2026-11-01T10:00:00Z" },
        { id: "l2", task: "T-2", lesson: "Lección fijada sin tags coincidentes", pinned: true, timestamp: "2026-11-02T10:00:00Z" },
      ];
      writeFileSync(path.join(dir, "experience_library.jsonl"), lessons.map((l) => JSON.stringify(l)).join("\n"));

      const { code } = runRender(dir);
      expect(code).toBe(0);

      const agentsMd = readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      expect(agentsMd).toContain("### Experience Library (Harness²)");
      expect(agentsMd).toContain("Lección fijada global sobre QA");
      expect(agentsMd).toContain("Lección fijada sin tags coincidentes");
    });

    it("GIVEN la biblioteca real del repo WHEN corre harness-render.mjs THEN AGENTS.md no contiene ninguna línea con resolved task in", () => {
      const repoAgentsMd = readFileSync(path.resolve(here, "..", "..", "AGENTS.md"), "utf8");
      expect(repoAgentsMd).not.toContain("resolved task in");
    });
  });

  describe("GOZS-767: Invariantes de docs/harness-library/LEDGER.json", () => {
    const ledgerLibraryDir = path.resolve(here, "..", "..", "docs", "harness-library");
    const ledgerPath = path.join(ledgerLibraryDir, "LEDGER.json");
    const LEDGER_ID_RE = /^L-(\d{3})$/;
    const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
    const ALLOWED_STATUSES = new Set(["blocked", "completed"]);
    const MS_PER_DAY = 86_400_000;

    function isPlainObject(value: unknown): value is Record<string, unknown> {
      return typeof value === "object" && value !== null && !Array.isArray(value);
    }

    function isNonEmptyString(value: unknown): value is string {
      return typeof value === "string" && value.trim().length > 0;
    }

    function parseStrictIsoMs(value: unknown): number | null {
      if (typeof value !== "string" || !ISO_TS_RE.test(value)) return null;
      const y = Number(value.slice(0, 4));
      const m = Number(value.slice(5, 7));
      const d = Number(value.slice(8, 10));
      const check = new Date(Date.UTC(y, m - 1, d));
      if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
        return null;
      }
      const hh = Number(value.slice(11, 13));
      const mm = Number(value.slice(14, 16));
      const ss = Number(value.slice(17, 19));
      if (hh > 23 || mm > 59 || ss > 59) return null;
      const ms = Date.parse(value);
      return Number.isFinite(ms) ? ms : null;
    }

    function validateLedger(ledger: unknown, libraryDir: string): string[] {
      const errors: string[] = [];
      if (!isPlainObject(ledger) || !Array.isArray(ledger.entries) || ledger.entries.length === 0) {
        return ["LEDGER.json debe ser un objeto con un array 'entries' no vacío"];
      }

      const seenIds = new Set<string>();
      let prevIdNum = -1;
      const resolvedLibraryDir = path.resolve(libraryDir);

      for (let idx = 0; idx < ledger.entries.length; idx++) {
        const entry = ledger.entries[idx];
        if (!isPlainObject(entry)) {
          errors.push(`entries[${idx}]: cada entrada debe ser un objeto`);
          continue;
        }

        const label = isNonEmptyString(entry.id) ? entry.id : `entries[${idx}]`;

        // 1. Campos obligatorios en cada entrada + 6. id único y en orden creciente
        const entryId = typeof entry.id === "string" ? entry.id : null;
        const idMatch = entryId !== null ? LEDGER_ID_RE.exec(entryId) : null;
        if (!idMatch || entryId === null) {
          errors.push(`${label}: 'id' debe cumplir el patrón L-\\d{3}`);
        } else {
          if (seenIds.has(entryId)) {
            errors.push(`${label}: 'id' duplicado`);
          } else {
            seenIds.add(entryId);
          }
          const idNum = Number(idMatch[1]);
          if (prevIdNum >= 0 && idNum <= prevIdNum) {
            errors.push(`${label}: 'id' fuera de orden creciente (previo L-${String(prevIdNum).padStart(3, "0")})`);
          }
          prevIdNum = idNum;
        }

        if (!isNonEmptyString(entry.title)) {
          errors.push(`${label}: falta 'title' o está vacío`);
        }
        if (!isNonEmptyString(entry.status)) {
          errors.push(`${label}: falta 'status' o está vacío`);
        }
        if (!isNonEmptyString(entry.hypothesis)) {
          errors.push(`${label}: falta 'hypothesis' o está vacío`);
        }
        if (!isNonEmptyString(entry.experience)) {
          errors.push(`${label}: falta 'experience' o está vacío`);
        } else {
          const expPath = path.resolve(resolvedLibraryDir, entry.experience);
          const rel = path.relative(resolvedLibraryDir, expPath);
          const isValidFile =
            !rel.startsWith("..") && !path.isAbsolute(rel) && existsSync(expPath) && statSync(expPath).isFile();
          if (!isValidFile) {
            errors.push(`${label}: archivo de 'experience' inexistente en docs/harness-library/: ${entry.experience}`);
          }
        }

        // 2. status ∈ {blocked, completed}
        if (isNonEmptyString(entry.status) && !ALLOWED_STATUSES.has(entry.status)) {
          errors.push(`${label}: 'status' inválido '${entry.status}' (permitidos: blocked, completed)`);
        }

        // 3. Si el estado es completed
        if (entry.status === "completed") {
          const win = entry.window;
          if (!isPlainObject(win) || !isPlainObject(win.before)) {
            errors.push(`${label}: entrada 'completed' requiere 'window.before'`);
          } else {
            const startMs = parseStrictIsoMs(win.before.start);
            const endMs = parseStrictIsoMs(win.before.end);
            if (startMs === null) {
              errors.push(`${label}: 'window.before.start' no es un timestamp ISO válido`);
            }
            if (endMs === null) {
              errors.push(`${label}: 'window.before.end' no es un timestamp ISO válido`);
            }
            if (startMs !== null && endMs !== null) {
              if (endMs <= startMs) {
                errors.push(`${label}: 'window.before.end' debe ser posterior a 'window.before.start'`);
              }
              const expectedDays = Math.round((endMs - startMs) / MS_PER_DAY);
              if (typeof win.durationDays !== "number" || win.durationDays !== expectedDays) {
                errors.push(`${label}: 'window.durationDays' (${String(win.durationDays)}) debe ser ${expectedDays}`);
              }
            }
          }

          const metrics = entry.metrics;
          if (!isPlainObject(metrics) || !isPlainObject(metrics.before)) {
            errors.push(`${label}: entrada 'completed' requiere 'metrics.before'`);
          } else {
            const before = metrics.before;
            if (
              typeof before.totalSessions !== "number" ||
              !Number.isFinite(before.totalSessions) ||
              before.totalSessions < 5
            ) {
              errors.push(`${label}: 'metrics.before.totalSessions' debe ser >= 5 (recibido: ${String(before.totalSessions)})`);
            }
            // L-000 es la línea base histórica anterior al desglose por runtime (GOZS-515/516);
            // desde L-001 en adelante (o si L-000 declara byRuntime) debe incluir al menos un runtime.
            const requireByRuntime = entry.id !== "L-000" || before.byRuntime !== undefined;
            if (requireByRuntime) {
              if (!isPlainObject(before.byRuntime) || Object.keys(before.byRuntime).length === 0) {
                errors.push(`${label}: 'metrics.before.byRuntime' debe ser un objeto con al menos un runtime`);
              }
            }
          }
        }

        // 4. Si el estado es blocked
        if (entry.status === "blocked") {
          if (!isNonEmptyString(entry.start_condition)) {
            errors.push(`${label}: entrada 'blocked' requiere 'start_condition' no vacío`);
          }
        }

        // 5. Si existen original_hypothesis, caveat o synthetic_before
        if (entry.original_hypothesis !== undefined && !isNonEmptyString(entry.original_hypothesis)) {
          errors.push(`${label}: 'original_hypothesis' presente pero vacío`);
        }
        if (entry.caveat !== undefined && !isNonEmptyString(entry.caveat)) {
          errors.push(`${label}: 'caveat' presente pero vacío`);
        }
        if (isPlainObject(entry.metrics) && entry.metrics.synthetic_before !== undefined) {
          if (
            !isPlainObject(entry.metrics.synthetic_before) ||
            !isPlainObject(entry.metrics.synthetic_before.byRuntime)
          ) {
            errors.push(`${label}: 'metrics.synthetic_before.byRuntime' debe ser un objeto`);
          }
        }
        if (entry.synthetic_before !== undefined) {
          if (!isPlainObject(entry.synthetic_before) || !isPlainObject(entry.synthetic_before.byRuntime)) {
            errors.push(`${label}: 'synthetic_before.byRuntime' debe ser un objeto`);
          }
        }
      }

      return errors;
    }

    function assertValidLedger(ledger: unknown, libraryDir: string): void {
      const errors = validateLedger(ledger, libraryDir);
      if (errors.length > 0) {
        throw new Error(`LEDGER.json inválido:\n- ${errors.join("\n- ")}`);
      }
    }

    function loadRealLedger(): { entries: Record<string, unknown>[] } {
      return JSON.parse(readFileSync(ledgerPath, "utf8")) as { entries: Record<string, unknown>[] };
    }

    function withTempLibrary(files: string[], run: (dir: string) => void): void {
      const tmpDir = mkdtempSync(path.join(tmpdir(), "harness-ledger-"));
      try {
        for (const f of files) {
          writeFileSync(path.join(tmpDir, f), `# ${f}\n`, "utf8");
        }
        run(tmpDir);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }

    function nextLedgerId(ledger: { entries: Array<Record<string, unknown>> }): string {
      let maxNum = -1;
      for (const e of ledger.entries) {
        const m = LEDGER_ID_RE.exec(String(e.id || ""));
        if (m?.[1]) maxNum = Math.max(maxNum, Number.parseInt(m[1], 10));
      }
      return `L-${String(maxNum + 1).padStart(3, "0")}`;
    }

    it("GIVEN el LEDGER.json actual WHEN corre el test THEN pasa", () => {
      const ledger = loadRealLedger();
      expect(ledger.entries.length).toBeGreaterThanOrEqual(2);
      expect(() => assertValidLedger(ledger, ledgerLibraryDir)).not.toThrow();
    });

    it("GIVEN se agrega la siguiente entrada L-### en blocked con start_condition WHEN corre el test THEN pasa sin tocar harness-kit/", () => {
      const ledger = loadRealLedger();
      const nextId = nextLedgerId(ledger);
      const nextExp = `EXPERIENCE-${nextId}.md`;
      const existingFiles = ledger.entries.map((e) => String(e.experience));
      withTempLibrary([...existingFiles, nextExp], (tmpDir) => {
        const extended = {
          ...ledger,
          entries: [
            ...ledger.entries,
            {
              id: nextId,
              title: "Menos llamadas y menos fricción en el arnés",
              status: "blocked",
              hypothesis: "Reducir llamadas por sesión en >= 15% sin bajar bloqueos legítimos.",
              start_condition: "Merge del último PR de Fase 1 en origin/main.",
              experience: nextExp,
            },
          ],
        };
        expect(() => assertValidLedger(extended, tmpDir)).not.toThrow();
      });
    });

    it("GIVEN una entrada L-### queda completed sin window.before WHEN corre el test THEN falla con un mensaje que nombra su id", () => {
      const ledger = loadRealLedger();
      const nextId = nextLedgerId(ledger);
      const nextExp = `EXPERIENCE-${nextId}.md`;
      const existingFiles = ledger.entries.map((e) => String(e.experience));
      withTempLibrary([...existingFiles, nextExp], (tmpDir) => {
        const invalid = {
          ...ledger,
          entries: [
            ...ledger.entries,
            {
              id: nextId,
              title: "Experimento incompleto",
              status: "completed",
              hypothesis: "Hipótesis de prueba",
              experience: nextExp,
              window: { durationDays: 7 },
              metrics: {
                before: {
                  totalSessions: 12,
                  byRuntime: { antigravity: { sessions: 12 } },
                },
              },
            },
          ],
        };
        expect(() => assertValidLedger(invalid, tmpDir)).toThrow(new RegExp(`${nextId}.*window\\.before`));
      });
    });

    it("GIVEN una entrada con experience que apunta a un archivo inexistente WHEN corre el test THEN falla", () => {
      const ledger = loadRealLedger();
      const nextId = nextLedgerId(ledger);
      const invalid = {
        ...ledger,
        entries: [
          ...ledger.entries,
          {
            id: nextId,
            title: "Archivo faltante",
            status: "blocked",
            hypothesis: "Hipótesis de prueba",
            start_condition: "Condición de inicio",
            experience: "EXPERIENCE-L-999-inexistente.md",
          },
        ],
      };
      expect(() => assertValidLedger(invalid, ledgerLibraryDir)).toThrow(
        new RegExp(`${nextId}.*EXPERIENCE-L-999-inexistente\\.md`),
      );
    });

    it("GIVEN invariantes de estado, ventana, métricas, opcionales y orden de id WHEN se violan THEN falla nombrando la entrada", () => {
      withTempLibrary(["EXPERIENCE-L-000.md", "EXPERIENCE-L-001.md", "EXPERIENCE-L-002.md"], (tmpDir) => {
        const baseCompleted = {
          id: "L-001",
          title: "Base válida",
          status: "completed",
          hypothesis: "Hipótesis",
          experience: "EXPERIENCE-L-001.md",
          window: {
            durationDays: 7,
            before: { start: "2026-11-16T00:00:00Z", end: "2026-11-23T00:00:00Z" },
          },
          metrics: {
            before: {
              totalSessions: 10,
              byRuntime: { antigravity: { sessions: 10 } },
            },
          },
        };

        // id inválido y campo obligatorio faltante
        expect(() => assertValidLedger({ entries: [{ ...baseCompleted, id: "L-1" }] }, tmpDir)).toThrow(
          /L-1.*L-\\d\{3\}/,
        );
        expect(() => assertValidLedger({ entries: [{ ...baseCompleted, hypothesis: "" }] }, tmpDir)).toThrow(
          /L-001.*hypothesis/,
        );

        // status fuera de {blocked, completed}
        expect(() => assertValidLedger({ entries: [{ ...baseCompleted, status: "running" }] }, tmpDir)).toThrow(
          /L-001.*status.*running/,
        );

        // completed: end <= start y durationDays incorrecto
        expect(() =>
          assertValidLedger(
            {
              entries: [
                {
                  ...baseCompleted,
                  window: {
                    durationDays: 7,
                    before: { start: "2026-11-23T00:00:00Z", end: "2026-11-16T00:00:00Z" },
                  },
                },
              ],
            },
            tmpDir,
          ),
        ).toThrow(/L-001.*window\.before\.end/);

        expect(() =>
          assertValidLedger(
            {
              entries: [
                {
                  ...baseCompleted,
                  window: {
                    durationDays: 5,
                    before: { start: "2026-11-16T00:00:00Z", end: "2026-11-23T00:00:00Z" },
                  },
                },
              ],
            },
            tmpDir,
          ),
        ).toThrow(/L-001.*durationDays.*7/);

        // completed: totalSessions < 5 y byRuntime vacío
        expect(() =>
          assertValidLedger(
            {
              entries: [
                {
                  ...baseCompleted,
                  metrics: { before: { totalSessions: 4, byRuntime: { antigravity: { sessions: 4 } } } },
                },
              ],
            },
            tmpDir,
          ),
        ).toThrow(/L-001.*totalSessions/);

        expect(() =>
          assertValidLedger(
            {
              entries: [
                {
                  ...baseCompleted,
                  metrics: { before: { totalSessions: 10, byRuntime: {} } },
                },
              ],
            },
            tmpDir,
          ),
        ).toThrow(/L-001.*byRuntime/);

        // blocked sin start_condition
        expect(() =>
          assertValidLedger(
            {
              entries: [
                {
                  id: "L-002",
                  title: "Bloqueado sin condición",
                  status: "blocked",
                  hypothesis: "Hipótesis",
                  experience: "EXPERIENCE-L-002.md",
                  start_condition: "   ",
                },
              ],
            },
            tmpDir,
          ),
        ).toThrow(/L-002.*start_condition/);

        // opcionales inválidos: original_hypothesis, caveat, synthetic_before.byRuntime
        expect(() =>
          assertValidLedger({ entries: [{ ...baseCompleted, original_hypothesis: "" }] }, tmpDir),
        ).toThrow(/L-001.*original_hypothesis/);

        expect(() =>
          assertValidLedger({ entries: [{ ...baseCompleted, caveat: "  " }] }, tmpDir),
        ).toThrow(/L-001.*caveat/);

        expect(() =>
          assertValidLedger(
            {
              entries: [
                {
                  ...baseCompleted,
                  metrics: {
                    ...baseCompleted.metrics,
                    synthetic_before: { byRuntime: null },
                  },
                },
              ],
            },
            tmpDir,
          ),
        ).toThrow(/L-001.*synthetic_before\.byRuntime/);

        // ids duplicados y fuera de orden creciente
        expect(() =>
          assertValidLedger(
            {
              entries: [
                baseCompleted,
                { ...baseCompleted, id: "L-001" },
              ],
            },
            tmpDir,
          ),
        ).toThrow(/L-001.*duplicado/);

        expect(() =>
          assertValidLedger(
            {
              entries: [
                { ...baseCompleted, id: "L-002", experience: "EXPERIENCE-L-002.md" },
                baseCompleted,
              ],
            },
            tmpDir,
          ),
        ).toThrow(/L-001.*orden creciente/);
      });
    });
  });

  describe("Criterio: Reglas específicas de runtime (antigravity.rules.md)", () => {
    it("GIVEN antigravity en runtimes WHEN corre harness-render.mjs THEN existe .agents/rules/harness-antigravity.md con el contenido de core/runtimes/antigravity.rules.md y figura en harness.lock", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["antigravity"], gate: "npm test" });
      const { code } = runRender(dir);
      expect(code).toBe(0);

      const generatedRulePath = path.join(dir, ".agents", "rules", "harness-antigravity.md");
      expect(existsSync(generatedRulePath)).toBe(true);

      const expectedContent = readFileSync(path.resolve(here, "..", "core", "runtimes", "antigravity.rules.md"), "utf8");
      expect(readFileSync(generatedRulePath, "utf8")).toBe(expectedContent);

      const lockPath = path.join(dir, "harness.lock");
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      expect(lock.artifacts[".agents/rules/harness-antigravity.md"]).toBeDefined();
    });

    it("GIVEN antigravity fuera de runtimes WHEN corre harness-render.mjs THEN ese archivo no se genera", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      const { code } = runRender(dir);
      expect(code).toBe(0);

      const generatedRulePath = path.join(dir, ".agents", "rules", "harness-antigravity.md");
      expect(existsSync(generatedRulePath)).toBe(false);

      const lockPath = path.join(dir, "harness.lock");
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      expect(lock.artifacts[".agents/rules/harness-antigravity.md"]).toBeUndefined();
    });

    it("GIVEN un cambio manual en .agents/rules/harness-antigravity.md WHEN corre harness-render.mjs --check THEN reporta drift", () => {
      const dir = makeOverlay({ name: "demo", runtimes: ["antigravity"], gate: "npm test" });
      const { code: renderCode } = runRender(dir);
      expect(renderCode).toBe(0);

      const generatedRulePath = path.join(dir, ".agents", "rules", "harness-antigravity.md");
      writeFileSync(generatedRulePath, "cambio manual no autorizado\n");

      try {
        execFileSync(process.execPath, [renderPath, "--check", dir], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        expect.fail("debió fallar por drift");
      } catch (err) {
        const e = err as { status?: number; stderr?: string };
        expect(e.status).toBe(1);
        expect(e.stderr).toContain("drift detected");
        expect(e.stderr).toContain(".agents/rules/harness-antigravity.md");
      }
    });

    it("GIVEN el render WHEN se mide AGENTS.md THEN su contenido y tamaño no cambian con la adición de reglas de runtime", () => {
      const dirWithout = makeOverlay({ name: "demo", runtimes: ["claude-code"], gate: "npm test" });
      runRender(dirWithout);
      const agentsWithout = readFileSync(path.join(dirWithout, "AGENTS.md"), "utf8");

      const dirWith = makeOverlay({ name: "demo", runtimes: ["claude-code", "antigravity"], gate: "npm test" });
      runRender(dirWith);
      const agentsWith = readFileSync(path.join(dirWith, "AGENTS.md"), "utf8");

      expect(agentsWith).toBe(agentsWithout);
      expect(Buffer.byteLength(agentsWith, "utf8")).toBeLessThanOrEqual(8000);
    });
  });
});
