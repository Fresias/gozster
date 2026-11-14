import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const scriptPath = path.resolve(repoRoot, "scripts", "qa-harness-canary.mjs");

function runCanary(args: string[], cwd: string = repoRoot): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { code: 0, stdout: stdout.trim(), stderr: "" };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      code: typeof e.status === "number" ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString().trim() : "",
      stderr: e.stderr ? e.stderr.toString() : "",
    };
  }
}

describe("QA-1: Script de canarios del guard (scripts/qa-harness-canary.mjs)", () => {
  it("GIVEN main con GOZS-524 mergeado WHEN corre --target repo --runtime claude-code THEN todas las filas pasan y el exit es 0", () => {
    const res = runCanary(["--target", "repo", "--runtime", "claude-code", "--json"]);
    expect(res.code).toBe(0);

    const rows = JSON.parse(res.stdout);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(17); // D1-D10 (10), P1-P6 (6), S1 (1)

    for (const row of rows) {
      expect(row.pass).toBe(true);
      expect(row.actual).not.toBe("not_installed");
    }

    const s1 = rows.find((r: { id: string }) => r.id === "S1");
    expect(s1).toBeDefined();
    expect(s1.actual).toBe("inject");
    expect(s1.rule_actual).toBe("git.gh007-noreply");
  });

  it("GIVEN main con GOZS-524 mergeado WHEN corre --target repo --runtime antigravity THEN todas las filas pasan (S1 n/a) y el exit es 0", () => {
    const res = runCanary(["--target", "repo", "--runtime", "antigravity", "--json"]);
    expect(res.code).toBe(0);

    const rows = JSON.parse(res.stdout);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(17);

    for (const row of rows) {
      expect(row.pass).toBe(true);
      expect(row.actual).not.toBe("not_installed");
    }

    const s1 = rows.find((r: { id: string }) => r.id === "S1");
    expect(s1).toBeDefined();
    expect(s1.actual).toBe("n/a");
    expect(s1.pass).toBe(true);
  });

  it("GIVEN --target installed en una máquina/directorio sin dispatchers instalados WHEN corre el script THEN las filas salen not_installed y el exit es 1", () => {
    const emptyHome = mkdtempSync(path.join(tmpdir(), "canary-empty-home-"));
    try {
      const res = runCanary(["--target", "installed", "--runtime", "claude-code", "--home", emptyHome, "--json"]);
      expect(res.code).toBe(1);

      const rows = JSON.parse(res.stdout);
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.actual).toBe("not_installed");
        expect(row.pass).toBe(false);
      }
    } finally {
      rmSync(emptyHome, { recursive: true, force: true });
    }
  });

  it("GIVEN una regla esperada distinta de la real WHEN se simula discordancia THEN esa fila sale pass: false y el exit es 1", () => {
    const res = runCanary(["--target", "repo", "--runtime", "claude-code", "--mock-mismatch", "--json"]);
    expect(res.code).toBe(1);

    const rows = JSON.parse(res.stdout);
    const failed = rows.filter((r: { pass: boolean }) => !r.pass);
    expect(failed.length).toBeGreaterThan(0);
  });

  it("GIVEN salida en modo tabla (sin --json) THEN imprime tabla formateada y el exit es 0", () => {
    const res = runCanary(["--target", "repo", "--runtime", "claude-code"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("D1");
    expect(res.stdout).toContain("P1");
    expect(res.stdout).toContain("S1");
  });

  it("GIVEN archivos temporales vitest-*.json en .harness/probes/ THEN el canario no los cuenta como evidencia de sonda (P1 de GOZS-528)", async () => {
    // @ts-expect-error script .mjs lacks type declarations
    const { filterProbeReports } = await import("../scripts/qa-harness-canary.mjs");
    const testFiles = [
      "baseline.json",
      "c1-candidate.json",
      "vitest-176315264871.json",
      "vitest-temp-output.json",
      "unknown.json",
    ];

    const filtered = filterProbeReports(testFiles);
    expect(filtered).toContain("baseline.json");
    expect(filtered).toContain("c1-candidate.json");
    expect(filtered).not.toContain("vitest-176315264871.json");
    expect(filtered).not.toContain("vitest-temp-output.json");
  });
});
