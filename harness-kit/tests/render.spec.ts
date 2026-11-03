import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// H-03 — Compilador harness-render.mjs completo, idempotencia y drift check (--check).
// Decisiones D7 (archivos de runtime generados por contrato) y P5 (JSON sin dependencias).

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const renderScript = path.resolve(here, "..", "core", "scripts", "harness-render.mjs");

function runRender(args: string[] = []): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [renderScript, ...args], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { code: 0, stdout: stdout.trim(), stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? 1,
      stdout: (e.stdout ?? "").trim(),
      stderr: (e.stderr ?? "").trim(),
    };
  }
}

let tempWorkspace: string | undefined;

function createTempWorkspace(): { workspace: string; overlay: string } {
  tempWorkspace = mkdtempSync(path.join(tmpdir(), "harness-test-workspace-"));
  const overlay = path.join(tempWorkspace, "harness");
  mkdirSync(overlay, { recursive: true });

  writeFileSync(
    path.join(overlay, "harness.json"),
    JSON.stringify({ kit: "harness-kit", version: "2.0.0", out: ".harness" }, null, 2),
  );

  writeFileSync(
    path.join(overlay, "project.json"),
    JSON.stringify(
      {
        name: "testproject",
        runtimes: ["antigravity", "claude-code", "gemini-cli", "opencode"],
        gate: "npm test && npm run typecheck",
      },
      null,
      2,
    ),
  );

  writeFileSync(
    path.join(overlay, "systemprompt.md"),
    "# TestProject — System Prompt\n\nTest description.\n\n## Verified Commands\n| Task | Command |\n|---|---|\n| Install | `npm ci` |\n| Test | `npm test` |\n",
  );

  writeFileSync(
    path.join(overlay, "guardrails.local.md"),
    "# TestProject Local Guardrails\n\n- Local rule 1.\n",
  );

  return { workspace: tempWorkspace, overlay };
}

afterEach(() => {
  if (tempWorkspace && existsSync(tempWorkspace)) {
    rmSync(tempWorkspace, { recursive: true, force: true });
    tempWorkspace = undefined;
  }
});

describe("harness-render: compilación de artefactos y presupuesto", () => {
  it("el repo pasa la verificación de drift sin modificaciones", () => {
    const res = runRender(["--check"]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("harness check OK (no drift)");
  });

  it("AGENTS.md respeta el presupuesto duro (<150 líneas, <=8000 caracteres)", () => {
    const agentsPath = path.join(repoRoot, "AGENTS.md");
    // Mide el contenido normalizado a LF (mismo criterio que `--check`), para
    // que el presupuesto no dependa del EOL del checkout (Windows CRLF).
    const content = readFileSync(agentsPath, "utf8").replace(/\r\n/g, "\n");
    const lines = content.split("\n");

    expect(lines.length).toBeLessThan(150);
    expect(content.length).toBeLessThanOrEqual(8000);
  });

  it("AGENTS.md respeta el orden canónico C1 -> C2 -> C4", () => {
    const agentsPath = path.join(repoRoot, "AGENTS.md");
    const content = readFileSync(agentsPath, "utf8");

    const idxC1 = content.indexOf("System Prompt");
    const idxC2Core = content.indexOf("Core Guardrails (Invariants)");
    const idxC2Multica = content.indexOf("Multica Guardrails");
    const idxC2Local = content.indexOf("Local Guardrails");
    const idxC4Core = content.indexOf("Tool Guidance & Execution Rules");
    const idxC4Multica = content.indexOf("Multica CLI Guidance");

    expect(idxC1).toBeGreaterThan(-1);
    expect(idxC2Core).toBeGreaterThan(idxC1);
    expect(idxC2Multica).toBeGreaterThan(idxC2Core);
    expect(idxC2Local).toBeGreaterThan(idxC2Multica);
    expect(idxC4Core).toBeGreaterThan(idxC2Local);
    expect(idxC4Multica).toBeGreaterThan(idxC4Core);
  });

  // GOZS-83 — spec §5: systemprompt → guardrails → autotriggers → memory → tool_guidance → scripts_index
  it("AGENTS.md compone C6 autotriggers -> C3 memory -> C4 -> C7 índice de scripts tras los guardrails", () => {
    const content = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
    const order = [
      "Local Guardrails",
      "## Skills",
      "# LongTermMEMORY",
      "Tool Guidance & Execution Rules",
      "# Helper scripts (run via bash)",
    ].map((h) => content.indexOf(h));

    expect(order[0]).toBeGreaterThan(-1);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]!);
  });

  it("AGENTS.md incluye cada hecho [verified … | src: …] de LongTermMEMORY.md", () => {
    const content = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
    const facts = readFileSync(path.join(repoRoot, "harness", "LongTermMEMORY.md"), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.startsWith("- [verified "));

    expect(facts).toHaveLength(5);
    for (const fact of facts) expect(content).toContain(fact);
  });

  it("AGENTS.md lista cada script de core/scripts con su docstring y la ruta existe", () => {
    const content = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8").replace(/\r\n/g, "\n");
    const index = content.slice(content.indexOf("# Helper scripts (run via bash)"));
    const listed = [...index.matchAll(/^- `([^`]+)`: \S.*$/gm)].map((m) => m[1]!);

    expect(listed).toEqual([
      "harness-kit/core/scripts/harness-compose.mjs",
      "harness-kit/core/scripts/harness-gate.sh",
      "harness-kit/core/scripts/harness-init.sh",
      "harness-kit/core/scripts/harness-probe.mjs",
      "harness-kit/core/scripts/harness-render.mjs",
      "harness-kit/core/scripts/harness-telemetry.mjs",
    ]);
    for (const rel of listed) expect(existsSync(path.join(repoRoot, rel)), rel).toBe(true);
  });

  it("AGENTS.md documenta los 7 comandos obligatorios de package.json", () => {
    const agentsPath = path.join(repoRoot, "AGENTS.md");
    const content = readFileSync(agentsPath, "utf8");

    const requiredCommands = [
      "npm ci",
      "npm run dev",
      "npm run build",
      "npm run typecheck",
      "npm test",
      "npx vitest run",
      "npm run seed:mynter",
    ];

    for (const cmd of requiredCommands) {
      expect(content, `AGENTS.md debe documentar "${cmd}"`).toContain(cmd);
    }
  });

  it("harness.lock tiene kitVersion 2.0.0, renderedAt null y mapa de artefactos", () => {
    const lockPath = path.join(repoRoot, "harness", "harness.lock");
    const lock = JSON.parse(readFileSync(lockPath, "utf8")) as {
      kitVersion: string;
      renderedAt: unknown;
      artifacts: Record<string, string>;
    };

    expect(lock.kitVersion).toBe("2.0.0");
    expect(lock.renderedAt).toBeNull();
    expect(lock.artifacts).toHaveProperty("AGENTS.md");
    expect(lock.artifacts).toHaveProperty("CLAUDE.md");
    expect(lock.artifacts).toHaveProperty(".claude/settings.json");
    expect(lock.artifacts).toHaveProperty(".gemini/settings.json");
    expect(lock.artifacts).toHaveProperty(".agents/hooks.json");

    for (const [file, hash] of Object.entries(lock.artifacts)) {
      expect(hash, `El hash de ${file} debe comenzar con sha256:`).toMatch(/^sha256:[a-f0-9]{64}$/);
    }
  });
});

describe("harness-render: idempotencia y detección de drift (--check)", () => {
  it("dos renders sucesivos son 100% idempotentes byte a byte", () => {
    const { workspace, overlay } = createTempWorkspace();

    // Primer render
    const r1 = runRender([overlay]);
    expect(r1.code).toBe(0);

    const snapshot1 = {
      agents: readFileSync(path.join(workspace, "AGENTS.md"), "utf8"),
      claude: readFileSync(path.join(workspace, "CLAUDE.md"), "utf8"),
      claudeSettings: readFileSync(path.join(workspace, ".claude", "settings.json"), "utf8"),
      geminiSettings: readFileSync(path.join(workspace, ".gemini", "settings.json"), "utf8"),
      agHooks: readFileSync(path.join(workspace, ".agents", "hooks.json"), "utf8"),
      lock: readFileSync(path.join(overlay, "harness.lock"), "utf8"),
    };

    // Segundo render
    const r2 = runRender([overlay]);
    expect(r2.code).toBe(0);

    const snapshot2 = {
      agents: readFileSync(path.join(workspace, "AGENTS.md"), "utf8"),
      claude: readFileSync(path.join(workspace, "CLAUDE.md"), "utf8"),
      claudeSettings: readFileSync(path.join(workspace, ".claude", "settings.json"), "utf8"),
      geminiSettings: readFileSync(path.join(workspace, ".gemini", "settings.json"), "utf8"),
      agHooks: readFileSync(path.join(workspace, ".agents", "hooks.json"), "utf8"),
      lock: readFileSync(path.join(overlay, "harness.lock"), "utf8"),
    };

    expect(snapshot2).toEqual(snapshot1);
  });

  it("--check detecta modificación manual en .claude/settings.json con exit 1", () => {
    const { workspace, overlay } = createTempWorkspace();
    runRender([overlay]);

    const settingsPath = path.join(workspace, ".claude", "settings.json");
    const original = readFileSync(settingsPath, "utf8");
    writeFileSync(settingsPath, original.replace("bash .claude/hooks/guard.sh", "echo tampered"));

    const checkRes = runRender(["--check", overlay]);
    expect(checkRes.code).toBe(1);
    expect(checkRes.stderr).toContain(".claude/settings.json");
    expect(checkRes.stderr).toContain("harness drift detected");
  });

  it("--check detecta modificación manual en AGENTS.md con exit 1", () => {
    const { workspace, overlay } = createTempWorkspace();
    runRender([overlay]);

    const agentsPath = path.join(workspace, "AGENTS.md");
    writeFileSync(agentsPath, readFileSync(agentsPath, "utf8") + "\n<!-- manual drift -->\n");

    const checkRes = runRender(["--check", overlay]);
    expect(checkRes.code).toBe(1);
    expect(checkRes.stderr).toContain("AGENTS.md");
  });

  it("--check detecta modificación manual en .opencode/plugins/harness-guard.ts con exit 1", () => {
    const { workspace, overlay } = createTempWorkspace();
    runRender([overlay]);

    const pluginPath = path.join(workspace, ".opencode", "plugins", "harness-guard.ts");
    writeFileSync(pluginPath, readFileSync(pluginPath, "utf8") + "export const Extra = async () => ({});\n");

    const checkRes = runRender(["--check", overlay]);
    expect(checkRes.code).toBe(1);
    expect(checkRes.stderr).toContain(".opencode/plugins/harness-guard.ts");
  });

  it("--check detecta un artefacto faltante con exit 1", () => {
    const { workspace, overlay } = createTempWorkspace();
    runRender([overlay]);

    rmSync(path.join(workspace, ".gemini", "settings.json"));

    const checkRes = runRender(["--check", overlay]);
    expect(checkRes.code).toBe(1);
    expect(checkRes.stderr).toContain(".gemini/settings.json (missing)");
  });

  it("--check detecta alteración manual en harness.lock con exit 1", () => {
    const { overlay } = createTempWorkspace();
    runRender([overlay]);

    const lockPath = path.join(overlay, "harness.lock");
    writeFileSync(lockPath, JSON.stringify({ kitVersion: "1.0.0", renderedAt: null, artifacts: {} }, null, 2) + "\n");

    const checkRes = runRender(["--check", overlay]);
    expect(checkRes.code).toBe(1);
    expect(checkRes.stderr).toContain("harness.lock");
  });

  it("un hecho de LongTermMEMORY.md sin [verified … | src: …] hace fallar el render con exit 1", () => {
    const { overlay } = createTempWorkspace();
    writeFileSync(path.join(overlay, "LongTermMEMORY.md"), "# LongTermMEMORY\n\n- Hecho sin fuente.\n");

    const res = runRender([overlay]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain("invalid fact in LongTermMEMORY.md");
  });
});
