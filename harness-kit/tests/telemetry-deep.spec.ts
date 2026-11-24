import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error - mjs module
import { analyzeDeep, commandSignature, compareDeepReports, family, isComparableBlock, LEGACY_CMD_MAX, looksLiteral, mainOf, runDeepDive } from "../core/lib/telemetry-deep.mjs";
// @ts-expect-error - mjs module
import { summarize } from "../core/scripts/harness-telemetry.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const telemetryCli = path.join(repoRoot, "harness-kit", "core", "scripts", "harness-telemetry.mjs");
const targetsFile = path.join(repoRoot, "docs", "harness-library", "L-002-targets.json");

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "telemetry-deep-")));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  tempDirs = [];
});

describe("GOZS-769: parser de firmas y clasificación en telemetry-deep.mjs", () => {
  it("normaliza firmas de shell encadenadas, PowerShell, Multica, vitest y pipes", () => {
    expect(mainOf('Set-Location "<repo>"; rg -n foo src | head -n 20')).toMatchObject({
      main: "rg",
      cdPrefix: true,
      limited: true,
    });
    expect(mainOf('& "$env:MULTICA_CLI_PATH" issue comment list abc --roots-only')).toMatchObject({
      main: "multica issue comment",
    });
    expect(mainOf("npx vitest run harness-kit/tests/harness-telemetry.spec.ts")).toMatchObject({
      main: "npx vitest <archivo>",
    });
    expect(mainOf("npx vitest run")).toMatchObject({
      main: "npx vitest (suite completa)",
    });
    expect(mainOf("git -C gozster push --force origin main")).toMatchObject({
      main: "git push (forzado)",
    });
    expect(family("rg")).toBe("búsqueda");
    expect(family("multica issue comment")).toBe("multica");
    expect(family("bash harness-gate.sh")).toBe("arnés (harness-*)");
    expect(family("npx vitest <archivo>")).toBe("tests");
  });

  it("identifica comandos truncados cuando solo se ve cd/entorno", () => {
    const truncatedCd = `Set-Location "${"a".repeat(310)}"`;
    expect(commandSignature(truncatedCd, { kind: "shell", cmdMax: 300 })).toBe("(cortado a 300 car.)");
    expect(family("(cortado a 300 car.)")).toBe("comando cortado (solo cd/entorno visible)");
    expect(commandSignature("src/app.ts", { kind: "read" })).toBe("read");
  });

  it("distingue posibles falsos positivos literales de bloqueos sobre acciones reales", () => {
    expect(looksLiteral({ _kind: "shell", _fam: "búsqueda", _sig: "rg" }, "shell.rm-rf")).toBe(true);
    expect(looksLiteral({ _kind: "shell", _fam: "búsqueda", _sig: "rg" }, "read.oversize")).toBe(false);
    expect(looksLiteral({ _kind: "read", _fam: "read", _sig: "read" }, "read.oversize")).toBe(false);
  });
});

describe("GOZS-769: analyzeDeep con campos v2 (GOZS-768) y cruce obligatorio con summarize", () => {
  function buildV2Fixture() {
    const t0 = Date.parse("2026-11-24T15:00:00.000Z");
    const ts = (offsetMs: number) => new Date(t0 + offsetMs).toISOString();

    return [
      // Evento canario que debe quedar excluido por filterEvents
      { ts: ts(0), session: "canary-1", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "block", rule: "shell.rm-rf", cmd: "rm -rf /" },
      // Evento fuera de ventana (antes de since)
      { ts: ts(-60_000), session: "s-old", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "AGENTS.md" },

      // Sesión 1 (claude-code): search nativa, lecturas acotadas por rangos distintos + 1 relectura exacta, bloqueo read.oversize, escritura, gate + pr.requires-seal -> gh pr create
      { ts: ts(1_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "search", tool: "Grep", decision: "allow", cmd: "summarize harness-kit/core", cwd: "<repo>", id: "u1" },
      { ts: ts(1_400), session: "s1", runtime: "claude-code", phase: "post", kind: "search", tool: "Grep", decision: "allow", cmd: "summarize harness-kit/core", cwd: "<repo>", id: "u1", ok: true },

      { ts: ts(5_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "block", rule: "read.oversize", cmd: "harness-kit/core/scripts/harness-telemetry.mjs", bounded: false, cwd: "<repo>", id: "u2" },

      // Lectura acotada rango 1..150
      { ts: ts(10_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "harness-kit/core/scripts/harness-telemetry.mjs", start: 1, limit: 150, bounded: true, cwd: "<repo>", id: "u3" },
      { ts: ts(10_300), session: "s1", runtime: "claude-code", phase: "post", kind: "read", tool: "Read", decision: "allow", cmd: "harness-kit/core/scripts/harness-telemetry.mjs", cwd: "<repo>", id: "u3", ok: true },

      // Lectura acotada rango 151..300 (paginación -> rango distinto)
      { ts: ts(15_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "harness-kit/core/scripts/harness-telemetry.mjs", start: 151, limit: 150, bounded: true, cwd: "<repo>", id: "u4" },
      { ts: ts(15_250), session: "s1", runtime: "claude-code", phase: "post", kind: "read", tool: "Read", decision: "allow", cmd: "harness-kit/core/scripts/harness-telemetry.mjs", cwd: "<repo>", id: "u4", ok: true },

      // Relectura exacta del rango 1..150
      { ts: ts(20_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "harness-kit/core/scripts/harness-telemetry.mjs", start: 1, limit: 150, bounded: true, cwd: "<repo>", id: "u5" },
      { ts: ts(20_200), session: "s1", runtime: "claude-code", phase: "post", kind: "read", tool: "Read", decision: "allow", cmd: "harness-kit/core/scripts/harness-telemetry.mjs", cwd: "<repo>", id: "u5", ok: true },

      // Escritura permitida
      { ts: ts(30_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "write", tool: "Edit", decision: "allow", cmd: "harness-kit/core/scripts/harness-telemetry.mjs", cwd: "<repo>", id: "u6" },
      { ts: ts(30_600), session: "s1", runtime: "claude-code", phase: "post", kind: "write", tool: "Edit", decision: "allow", cmd: "harness-kit/core/scripts/harness-telemetry.mjs", cwd: "<repo>", id: "u6", ok: true },

      // Shell con falla (ok: false) y referencia a <workdir>
      { ts: ts(40_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "Set-Location <workdir>/gozster; npx vitest run harness-kit/tests/harness-telemetry.spec.ts", cwd: "<workdir>", id: "u7" },
      { ts: ts(44_000), session: "s1", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "Set-Location <workdir>/gozster; npx vitest run harness-kit/tests/harness-telemetry.spec.ts", cwd: "<workdir>", id: "u7", ok: false },

      // pr.requires-seal -> harness-gate.sh -> gh pr create exitoso + inyección
      { ts: ts(50_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "block", rule: "pr.requires-seal", cmd: "gh pr create --title test", cwd: "<repo>", id: "u8" },
      { ts: ts(60_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "bash harness-kit/core/scripts/harness-gate.sh", cwd: "<repo>", id: "u9" },
      { ts: ts(75_000), session: "s1", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "bash harness-kit/core/scripts/harness-gate.sh", cwd: "<repo>", id: "u9", ok: true },
      { ts: ts(80_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "gh pr create --title test", cwd: "<repo>", id: "u10" },
      { ts: ts(82_000), session: "s1", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "gh pr create --title test", cwd: "<repo>", id: "u10", ok: true, inject: true, rule: "remediate.cwd-lost" },

      // Sesión 2 (antigravity): lectura externa relativizada (~/) y comando repetido de multica
      { ts: ts(100_000), session: "s2", runtime: "antigravity", phase: "pre", kind: "read", tool: "read_file", decision: "allow", cmd: "~/Documents/notes.md", bounded: false, cwd: "<workdir>", id: "a1" },
      { ts: ts(100_100), session: "s2", runtime: "antigravity", phase: "post", kind: "read", tool: "read_file", decision: "allow", cmd: "~/Documents/notes.md", cwd: "<workdir>", id: "a1", ok: true },
      { ts: ts(105_000), session: "s2", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "allow", cmd: '& "$env:MULTICA_CLI_PATH" issue get 123 --output json', cwd: "<workdir>", id: "a2" },
      { ts: ts(106_000), session: "s2", runtime: "antigravity", phase: "post", kind: "shell", tool: "run_command", decision: "allow", cmd: '& "$env:MULTICA_CLI_PATH" issue get 123 --output json', cwd: "<workdir>", id: "a2", ok: true },
      { ts: ts(120_000), session: "s2", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "allow", cmd: '& "$env:MULTICA_CLI_PATH" issue get 123 --output json', cwd: "<workdir>", id: "a3" },
      { ts: ts(121_000), session: "s2", runtime: "antigravity", phase: "post", kind: "shell", tool: "run_command", decision: "allow", cmd: '& "$env:MULTICA_CLI_PATH" issue get 123 --output json', cwd: "<workdir>", id: "a3", ok: true },
    ];
  }

  it("reutiliza filterEvents/summarize, aprovecha rutas completas, bounded/start/limit, cwd, search, ok y duraciones", () => {
    const fixture = buildV2Fixture();
    const since = "2026-11-24T15:00:00.000Z";
    const until = "2026-11-24T16:00:00.000Z";

    const report = analyzeDeep(fixture, { since, until, idleMin: 15, ledgerPath: null });
    const official = summarize(fixture, { since, until, idleMin: 15 });

    // Sin errores en ninguna sección
    expect(report.json.errors).toBeUndefined();

    // Cruce obligatorio con summarize coincide exactamente
    expect(report.crossCheck.matches).toBe(true);
    expect(report.json.coverage.crossCheck.matches).toBe(true);
    expect(report.json.coverage.events).toBe(official.totalEvents);
    expect(report.json.coverage.actions).toBe(official.totalActions);
    expect(report.json.coverage.post).toBe(official.postEvents);
    expect(report.json.coverage.sessions).toBe(official.totalSessions);
    expect(report.json.coverage.excluded).toBe(1);
    expect(report.json.coverage.outOfWindow).toBe(1);

    // Campos de fidelidad v2
    expect(report.json.hasV2Fields).toBe(true);
    expect(report.json.cmdMax).toBe(300);
    expect(report.json.coverage.byCwd).toEqual({ "<repo>": 9, "<workdir>": 4 });
    expect(report.json.coverage.pairedDurations).toBe(11);
    expect(report.json.coverage.outcomes.evaluated).toBe(11);
    expect(report.json.coverage.outcomes.failed).toBe(1);
    expect(report.json.coverage.outcomes.failureRate).toBeCloseTo(1 / 11, 5);

    // Rutas completas sin heurística "(ruta cortada)"
    expect(report.json.reads.truncatedPaths).toBe(0);
    expect(report.markdown).not.toContain("(ruta cortada)");
    expect(report.json.reads.files.some((f: { file: string }) => f.file === "harness-kit/core/scripts/harness-telemetry.mjs")).toBe(true);
    expect(report.json.reads.files.some((f: { file: string }) => f.file === "~/Documents/notes.md")).toBe(true);
    expect(report.json.reads.external).toBe(1);

    // start / limit / bounded: 3 bounded, 2 unbounded (blocked + external), 1 exact reread, 1 distinct-range chunk
    expect(report.json.reads.bounded).toBe(3);
    expect(report.json.reads.unbounded).toBe(2);
    expect(report.json.reads.rereads).toBe(2);
    expect(report.json.reads.exactRangeRereads).toBe(1);
    expect(report.json.reads.distinctRangeChunks).toBe(1);

    // Búsqueda nativa kind: "search"
    expect(report.json.search.nativeTotal).toBe(1);
    expect(report.json.search.nativeByTool["claude-code\u0000Grep"]).toBe(1);
    expect(report.markdown).toContain("búsqueda nativa (search)");

    // Referencias a <workdir> en shell, repeticiones de Multica, pr.requires-seal y read.oversize
    expect(report.json.shell.workdirRefs).toBe(1);
    expect(report.json.repeats.allowedWithin10m).toBeGreaterThanOrEqual(1);
    expect(report.json.readOversize.blocked).toBe(1);
    expect(report.json.prSeal.sessions).toBe(1);
    expect(report.json.prSeal.never).toBe(0);
    expect(report.json.injections["remediate.cwd-lost"].count).toBe(1);
    expect(report.json.timing.measuredDurations.pairedCount).toBe(11);
  });

  it("mantiene compatibilidad con eventos legacy L-001 (truncado a 120 car. y rutas absolutas)", () => {
    const t0 = Date.parse("2026-11-18T10:00:00.000Z");
    const longLegacyPath =
      "C:\\Users\\user\\multica_workspaces_desktop-api.multica.ai\\gozster-384912dcdd71\\gozs-527\\workdir\\gozster\\src\\components\\coach\\coach-studio-view.tsx".slice(
        0,
        120,
      );
    expect(longLegacyPath.length).toBe(120);
    const legacy = [
      { ts: new Date(t0).toISOString(), session: "leg-1", runtime: "antigravity", phase: "pre", kind: "read", tool: "read_file", decision: "allow", cmd: longLegacyPath },
      { ts: new Date(t0 + 5_000).toISOString(), session: "leg-1", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "allow", cmd: "git status" },
    ];

    const report = analyzeDeep(legacy, { ledgerPath: null });
    expect(report.json.hasV2Fields).toBe(false);
    expect(report.json.cmdMax).toBe(LEGACY_CMD_MAX);
    expect(report.json.reads.truncatedPaths).toBe(1);
    expect(report.crossCheck.matches).toBe(true);
  });
});

describe("GOZS-769: runDeepDive escritura en disco, ruta por defecto y --no-examples", () => {
  it("escribe deep-dive.md y deep-dive.json en <HARNESS_TELEMETRY_DIR>/deep-dive por defecto (UTF-8 sin BOM) y respeta examples=false", () => {
    const telemetryDir = makeTempDir();
    vi.stubEnv("HARNESS_TELEMETRY_DIR", telemetryDir);

    const eventsFile = path.join(telemetryDir, "events.jsonl");
    const events = [
      { ts: "2026-11-24T16:00:00.000Z", session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "block", rule: "git.force-push", cmd: "git push --force origin secret-branch", cwd: "<repo>", id: "x1" },
      { ts: "2026-11-24T16:00:05.000Z", session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "git status", cwd: "<repo>", id: "x2" },
    ];
    writeFileSync(eventsFile, `${events.map((e) => JSON.stringify(e)).join("\n")}\nnot-json-line\n`, "utf8");

    const res = runDeepDive({ examples: false });
    expect(res.outDir).toBe(path.join(telemetryDir, "deep-dive"));
    expect(existsSync(res.mdPath)).toBe(true);
    expect(existsSync(res.jsonPath)).toBe(true);

    const mdBuf = readFileSync(res.mdPath);
    // Sin BOM UTF-8 (EF BB BF)
    expect(mdBuf[0] === 0xef && mdBuf[1] === 0xbb && mdBuf[2] === 0xbf).toBe(false);
    const mdText = mdBuf.toString("utf8");
    expect(mdText).toContain("líneas JSON válidas: 2 · inválidas: 1");
    expect(mdText).not.toContain("secret-branch");
    expect(res.crossCheck.matches).toBe(true);
  });
});

describe("GOZS-791 B1–B8: filtros, wrappers, rutas absolutas, cwd perdido, esperas activas, pr.requires-seal y búsqueda↔lectura", () => {
  it("B3: clasifica multica-ctx/multica-post en multica, harness-pr-status en gh (+ --wait-checks como checks) y harness-ship como gate + crea PR", () => {
    expect(family(mainOf("node harness-kit/adapters/multica/scripts/multica-ctx.mjs --issue GOZS-791").main)).toBe("multica");
    expect(family(mainOf("node harness-kit/adapters/multica/scripts/multica-post.mjs --issue GOZS-791").main)).toBe("multica");
    expect(family(mainOf("node harness-kit/core/scripts/harness-pr-status.mjs --pr 648").main)).toBe("gh");
    const waitSig = mainOf("node harness-kit/core/scripts/harness-pr-status.mjs --wait-checks").main;
    expect(waitSig).toBe("node harness-pr-status.mjs --wait-checks");
    expect(family(waitSig)).toBe("gh");

    const t0 = Date.parse("2026-11-24T17:00:00.000Z");
    const ts = (ms: number) => new Date(t0 + ms).toISOString();
    const evs = [
      { ts: ts(0), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/adapters/multica/scripts/multica-ctx.mjs --issue GOZS-791", cwd: "<repo>", id: "1" },
      { ts: ts(1_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/adapters/multica/scripts/multica-post.mjs --issue GOZS-791", cwd: "<repo>", id: "2" },
      { ts: ts(2_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/core/scripts/harness-pr-status.mjs", cwd: "<repo>", id: "3" },
      { ts: ts(3_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/core/scripts/harness-pr-status.mjs --wait-checks", cwd: "<repo>", id: "4" },
      { ts: ts(4_000), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/core/scripts/harness-ship.mjs --lesson ok --title t --body-file b.md", cwd: "<repo>", id: "5" },
    ];
    const report = analyzeDeep(evs, { ledgerPath: null });
    expect(report.json.multicaGh.multicaTotal).toBe(2);
    expect(report.json.multicaGh.prQueries.total).toBe(2);
    expect(report.json.multicaGh.checksQueries.total).toBe(1);
    expect(report.json.gate["harness-ship.mjs"].calls).toBe(1);
    expect(report.json.gate["gate (harness-gate + harness-ship)"].calls).toBe(1);
    expect(report.json.gate["creación de PR (gh pr create + harness-ship)"].calls).toBe(1);
    expect(report.json.gate._prCreatingSessions.sessions).toBe(1);
    expect(report.json.gate._prCreatingSessions.gateRuns.p50).toBe(1);
  });

  it("B4, B5, B6, B7 y B8: rutas absolutas (<repo> y <workdir>), cwd perdido, esperas activas, pr.requires-seal dividido y búsqueda↔lectura", () => {
    const t0 = Date.parse("2026-11-24T18:00:00.000Z");
    const ts = (ms: number) => new Date(t0 + ms).toISOString();
    const evs = [
      // B4: <repo> y <workdir> ambos cuentan como ruta absoluta
      { ts: ts(0), session: "s-ag", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "allow", cmd: "Set-Location <repo>", cwd: "<workdir>", id: "ag1" },
      { ts: ts(200), session: "s-ag", runtime: "antigravity", phase: "post", kind: "shell", tool: "run_command", decision: "allow", cmd: "Set-Location <repo>", cwd: "<workdir>", id: "ag1", ok: false },
      { ts: ts(1_000), session: "s-ag", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "allow", cmd: "cd <workdir>/x; rg -n foo src", cwd: "<workdir>", id: "ag2" },
      { ts: ts(1_200), session: "s-ag", runtime: "antigravity", phase: "post", kind: "shell", tool: "run_command", decision: "allow", cmd: "cd <workdir>/x; rg -n foo src", cwd: "<workdir>", id: "ag2", ok: true },
      // B8: shell rg -> read
      { ts: ts(2_000), session: "s-ag", runtime: "antigravity", phase: "pre", kind: "read", tool: "read_file", decision: "allow", cmd: "src/a.ts", cwd: "<repo>", id: "ag3" },
      // B6: Start-Sleep -Seconds 30 sin check local (permitido como en L-001)
      { ts: ts(3_000), session: "s-ag", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "allow", cmd: "Start-Sleep -Seconds 30", cwd: "<repo>", id: "ag4" },
      // B7: pr.requires-seal literal vs posición de comando
      { ts: ts(4_000), session: "s-ag", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "block", rule: "pr.requires-seal", cmd: 'echo "no uses gh pr create a mano"', cwd: "<repo>", id: "ag5" },
      { ts: ts(5_000), session: "s-ag", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "block", rule: "pr.requires-seal", cmd: "gh pr create --title x", cwd: "<repo>", id: "ag6" },

      // Sesión Claude Code: B8 nativa Grep -> Read + B6 bloqueado (como en L-002)
      { ts: ts(10_000), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "search", tool: "Grep", decision: "allow", cmd: "foo src", cwd: "<repo>", id: "cc1" },
      { ts: ts(11_000), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "src/a.ts", cwd: "<repo>", id: "cc2" },
      { ts: ts(12_000), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "block", rule: "shell.polling", cmd: "Start-Sleep -Seconds 30", cwd: "<repo>", id: "cc3" },
    ];

    const report = analyzeDeep(evs, { ledgerPath: null });
    expect(report.json.errors).toBeUndefined();
    expect(report.crossCheck.matches).toBe(true);

    // B4
    expect(report.json.shell.workdirRefs).toBe(2);
    expect(report.json.shell.absPathRefs).toBe(2);

    // B5
    expect(report.json.shell.cwdLostApprox.total).toBe(1);
    expect(report.json.shell.cwdLostApprox.byRuntime.antigravity).toBe(1);

    // B6
    expect(report.json.shell.activeWaits.total).toBe(2);
    expect(report.json.shell.activeWaits.executed).toBe(1);
    expect(report.json.shell.activeWaits.blocked).toBe(1);
    expect(report.json.shell.activeWaits.byRuntime.antigravity.total).toBe(1);
    expect(report.json.shell.activeWaits.byRuntime["claude-code"].total).toBe(1);

    // B7
    expect(report.json.prSeal.totalBlocks).toBe(2);
    expect(report.json.prSeal.commandPosition).toBe(1);
    expect(report.json.prSeal.literalMentions).toBe(1);
    expect(looksLiteral({ _kind: "shell", _cmd: 'echo "no uses gh pr create a mano"' }, "pr.requires-seal")).toBe(true);
    expect(looksLiteral({ _kind: "shell", _cmd: "gh pr create --title x" }, "pr.requires-seal")).toBe(false);

    // B8
    const srt = report.json.sequences.searchReadTransitions;
    expect(srt.shell.forward).toBe(1);
    expect(srt.shell.total).toBe(1);
    expect(srt.shell.byRuntime.antigravity).toBe(1);
    expect(srt.native.forward).toBe(1);
    expect(srt.native.total).toBe(1);
    expect(srt.native.byRuntime["claude-code"]).toBe(1);
    expect(srt.total.total).toBe(2);
    expect(report.markdown).toContain("shell (rg/grep ↔ lectura)");
    expect(report.markdown).toContain("nativa (Grep/Glob ↔ Read)");
    expect(report.markdown).toContain("total búsqueda ↔ lectura");

    // B1 + B2 dentro de analyzeDeep
    const filtered = analyzeDeep(evs, { ledgerPath: null, excludeKinds: ["search"], excludeRules: ["shell.polling"] });
    expect(filtered.crossCheck.matches).toBe(true);
    expect(filtered.markdown).toContain("excluidos: search");
    expect(filtered.json.blocks["shell.polling"]).toBeUndefined();
    expect(filtered.json.sequences.searchReadTransitions.native.total).toBe(0);
    expect(filtered.json.sequences.searchReadTransitions.shell.total).toBe(1);
  });
});

describe("GOZS-795 C1–C8: medición sin sesgos, adopción, min-schema y --compare", () => {
  it("C1: summarize y --deep coinciden usando la primera escritura permitida (escritura bloqueada a los 10 s, permitida a los 100 s)", () => {
    const t0 = Date.parse("2026-11-24T20:00:00.000Z");
    const ts = (sec: number) => new Date(t0 + sec * 1000).toISOString();
    const evs = [
      { v: 3, ts: ts(0), session: "s1", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "a.ts", id: "1" },
      { v: 3, ts: ts(10), session: "s1", runtime: "claude-code", phase: "pre", kind: "write", tool: "Edit", decision: "block", rule: "fs.protected", cmd: ".claude/settings.json", id: "2" },
      { v: 3, ts: ts(50), session: "s1", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "b.ts", id: "3" },
      { v: 3, ts: ts(100), session: "s1", runtime: "claude-code", phase: "pre", kind: "write", tool: "Edit", decision: "allow", cmd: "src/a.ts", id: "4" },
    ];
    const sum = summarize(evs);
    const deep = analyzeDeep(evs, { ledgerPath: null });
    expect(deep.crossCheck.matches).toBe(true);
    expect(sum.timeToFirstEdit.medianMs).toBe(100_000);
    expect(deep.json.sessions["(todas)"].ttfeMs.p50).toBe(100_000);
    expect(sum.callsBeforeFirstEdit.p50).toBe(3);
    expect(deep.json.sessions["(todas)"].callsBeforeFirstEdit.p50).toBe(3);
  });

  it("C2: harness-ship cuenta como corrida del gate solo si duró >= 60 s y como crea PR solo con ok=true; en v1 sin duración es cota superior", () => {
    const t0 = Date.parse("2026-11-24T20:10:00.000Z");
    const ts = (sec: number) => new Date(t0 + sec * 1000).toISOString();
    const shipCmd = 'node harness-kit/core/scripts/harness-ship.mjs --lesson "x" --title "t" --body-file ../pr.md';
    const evs = [
      // Llamada 1: falla a los 8 s (ok=false) -> ni gate ni crea PR
      { v: 3, ts: ts(0), session: "s-ship", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: shipCmd, cmdLen: shipCmd.length, id: "sh1" },
      { v: 3, ts: ts(8), session: "s-ship", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: shipCmd, cmdLen: shipCmd.length, id: "sh1", ok: false },
      // Llamada 2: corre el gate 400 s (ok=true) -> 1 corrida del gate + crea PR
      { v: 3, ts: ts(20), session: "s-ship", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: shipCmd, cmdLen: shipCmd.length, id: "sh2" },
      { v: 3, ts: ts(420), session: "s-ship", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: shipCmd, cmdLen: shipCmd.length, id: "sh2", ok: true },
      // Llamada 3: saltea el gate 12 s (ok=true) -> NO cuenta como gate
      { v: 3, ts: ts(430), session: "s-ship", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: shipCmd, cmdLen: shipCmd.length, id: "sh3" },
      { v: 3, ts: ts(442), session: "s-ship", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: shipCmd, cmdLen: shipCmd.length, id: "sh3", ok: true },
    ];
    const deep = analyzeDeep(evs, { ledgerPath: null });
    expect(deep.json.gate["harness-ship.mjs"].calls).toBe(3);
    expect(deep.json.gate["gate (harness-gate + harness-ship)"].calls).toBe(1);
    expect(deep.json.gate._prCreatingSessions.sessions).toBe(1);
    expect(deep.json.gate._prCreatingSessions.gateRuns.sum).toBe(1);
    expect(deep.json.gate._prCreatingSessions.gateRuns.p50).toBe(1);
    expect(deep.json.gate._prCreatingSessions.upperBound).toBe(false);

    // Eventos v1 sin duración -> cota superior
    const v1Ship = [
      { ts: ts(0), session: "s-v1", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "allow", cmd: shipCmd },
    ];
    const deepV1 = analyzeDeep(v1Ship, { ledgerPath: null });
    expect(deepV1.json.gate._prCreatingSessions.upperBound).toBe(true);
    expect(deepV1.json.gate._prCreatingSessions.gateRuns.sum).toBe(1);
  });

  it("C3, C4, C5, C6 y C7: multica-ctx --agents, bloqueos comparables, cobertura por runtime, bashReads, --min-schema y adopción", () => {
    const t0 = Date.parse("2026-11-24T21:00:00.000Z");
    const ts = (sec: number) => new Date(t0 + sec * 1000).toISOString();
    const evs = [
      // Sesión v2 (debe excluirse con --min-schema 3)
      { v: 2, ts: ts(0), session: "s-old-v2", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "git status" },

      // Sesión v3 Claude Code: empieza con harness-context, usa multica-ctx --agents (×3) + multica agent list (×1),
      // harness-pr-status, lecturas Bash con y sin pipe, Read/Grep, bloques comparables y no comparables, y harness-ship
      { v: 3, ts: ts(10), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/core/scripts/harness-context.mjs", cmdLen: 49, id: "c1" },
      { v: 3, ts: ts(11), session: "s-cc", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/core/scripts/harness-context.mjs", cmdLen: 49, id: "c1", ok: true },
      { v: 3, ts: ts(12), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/adapters/multica/scripts/multica-ctx.mjs --agents", cmdLen: 66, id: "c2" },
      { v: 3, ts: ts(13), session: "s-cc", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/adapters/multica/scripts/multica-ctx.mjs --agents", cmdLen: 66, id: "c2", ok: true },
      { v: 3, ts: ts(14), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/adapters/multica/scripts/multica-ctx.mjs --agents --refresh", cmdLen: 76, id: "c3" },
      { v: 3, ts: ts(15), session: "s-cc", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/adapters/multica/scripts/multica-ctx.mjs --agents --refresh", cmdLen: 76, id: "c3", ok: true },
      { v: 3, ts: ts(16), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/adapters/multica/scripts/multica-ctx.mjs --agents", cmdLen: 66, id: "c4" },
      { v: 3, ts: ts(17), session: "s-cc", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/adapters/multica/scripts/multica-ctx.mjs --agents", cmdLen: 66, id: "c4", ok: true },
      { v: 3, ts: ts(18), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "multica agent list --output json", cmdLen: 32, id: "c5" },
      { v: 3, ts: ts(19), session: "s-cc", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "multica agent list --output json", cmdLen: 32, id: "c5", ok: true },
      // C5 bashReads: grep con pipe, sed -n sin pipe, cat sin pipe, rg con pipe
      { v: 3, ts: ts(20), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "grep -rn foo src | head -20", cmdLen: 27, id: "c6" },
      { v: 3, ts: ts(21), session: "s-cc", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "grep -rn foo src | head -20", cmdLen: 27, id: "c6", ok: true },
      { v: 3, ts: ts(22), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "sed -n 1,50p src/a.ts", cmdLen: 21, id: "c7" },
      { v: 3, ts: ts(23), session: "s-cc", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "sed -n 1,50p src/a.ts", cmdLen: 21, id: "c7", ok: true },
      { v: 3, ts: ts(24), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "cat src/a.ts", cmdLen: 12, id: "c8" },
      { v: 3, ts: ts(25), session: "s-cc", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "cat src/a.ts", cmdLen: 12, id: "c8", ok: true },
      { v: 3, ts: ts(26), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "rg -n bar src | head -10", cmdLen: 24, id: "c9" },
      { v: 3, ts: ts(27), session: "s-cc", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "rg -n bar src | head -10", cmdLen: 24, id: "c9", ok: true },
      // Nativas Read + Grep + harness-pr-status
      { v: 3, ts: ts(28), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "src/a.ts", id: "c10" },
      { v: 3, ts: ts(29), session: "s-cc", runtime: "claude-code", phase: "post", kind: "read", tool: "Read", decision: "allow", cmd: "src/a.ts", id: "c10", ok: true },
      { v: 3, ts: ts(30), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "search", tool: "Grep", decision: "allow", cmd: "foo src", id: "c11" },
      { v: 3, ts: ts(31), session: "s-cc", runtime: "claude-code", phase: "post", kind: "search", tool: "Grep", decision: "allow", cmd: "foo src", id: "c11", ok: true },
      { v: 3, ts: ts(32), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/core/scripts/harness-pr-status.mjs 12", cmdLen: 54, id: "c12" },
      { v: 3, ts: ts(33), session: "s-cc", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "node harness-kit/core/scripts/harness-pr-status.mjs 12", cmdLen: 54, id: "c12", ok: true },
      // C4: bloqueos comparables (read.oversize + real timeout gh pr create) vs excluidos (shell.polling, search block, literal pr.requires-seal, brain fs.protected)
      { v: 3, ts: ts(34), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "block", rule: "read.oversize", cmd: "src/big.ts", id: "b1" },
      { v: 3, ts: ts(35), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "block", rule: "pr.requires-seal", cmd: "timeout 60 gh pr create --fill", cmdLen: 30, id: "b2" },
      { v: 3, ts: ts(36), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "block", rule: "pr.requires-seal", cmd: 'echo "no uses gh pr create"', cmdLen: 27, id: "b3" },
      { v: 3, ts: ts(37), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "block", rule: "shell.polling", cmd: "sleep 30", cmdLen: 8, id: "b4" },
      { v: 3, ts: ts(38), session: "s-cc", runtime: "claude-code", phase: "pre", kind: "search", tool: "Grep", decision: "block", rule: "fs.env-leak", cmd: "KEY .env.local", id: "b5" },
      // Sesión Antigravity v3 sin post (0% duración) y con cat (no debe entrar en bashReads de Claude Code) + fs.protected brain FP
      { v: 3, ts: ts(40), session: "s-ag", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "allow", cmd: "cat src/a.ts", cmdLen: 12, id: "a1" },
      { v: 3, ts: ts(41), session: "s-ag", runtime: "antigravity", phase: "pre", kind: "write", tool: "write_to_file", decision: "block", rule: "fs.protected", cmd: "~/.gemini/antigravity-cli/brain/conv/scratch/a.mjs", id: "a2" },
    ];

    const deep = analyzeDeep(evs, { ledgerPath: null, minSchema: 3 });
    expect(deep.crossCheck.matches).toBe(true);
    // C6
    expect(deep.json.coverage.sessions).toBe(2);
    expect(deep.json.coverage.excludedSessionsBySchema).toBe(1);
    expect(deep.json.cmdMax).toBe(1000);
    // C3
    expect(deep.json.multicaGh.multicaAgentList.calls).toBe(4);
    // C4
    expect(deep.json.comparableBlocks.rawTotal).toBe(6);
    expect(deep.json.comparableBlocks.total).toBe(2); // read.oversize + real timeout gh pr create
    expect(deep.json.comparableBlocks.excluded).toEqual({
      newRules: 1,
      searchKind: 1,
      prSealLiterals: 1,
      fsProtectedFp: 1,
    });
    expect(isComparableBlock({ decision: "block", rule: "pr.requires-seal", kind: "shell", cmd: "timeout 60 gh pr create --fill" })).toBe(true);
    expect(isComparableBlock({ decision: "block", rule: "pr.requires-seal", kind: "shell", cmd: 'echo "gh pr create"' })).toBe(false);
    // C5
    expect(deep.json.coverage.durationCoverageByRuntime["claude-code"].pct).toBe(100);
    expect(deep.json.coverage.durationCoverageByRuntime.antigravity.pct).toBe(0);
    expect(deep.json.shell.bashReads.primary.total).toBe(3); // grep + sed -n + cat (NOT antigravity cat!)
    expect(deep.json.shell.bashReads.primary.withPipe).toBe(1);
    expect(deep.json.shell.bashReads.primary.withoutPipe).toBe(2);
    expect(deep.json.shell.bashReads.secondary.total).toBe(1); // rg
    expect(deep.json.shell.bashReads.secondary.withPipe).toBe(1);
    // C7
    expect(deep.json.adoption.harnessContext.startsCount).toBe(1);
    expect(deep.json.adoption.multicaHelpers.helperCalls).toBe(3);
    expect(deep.json.adoption.multicaHelpers.rawCliCalls).toBe(1);
    expect(deep.json.adoption.prStatusHelper.helperCalls).toBe(1);
    expect(deep.json.adoption.claudeCodeNativeVsBash.nativeRead).toBe(2);
    expect(deep.json.adoption.claudeCodeNativeVsBash.nativeSearch).toBe(2);
    expect(deep.json.adoption.claudeCodeNativeVsBash.bashReadsPrimary).toBe(3);
  });

  it("C8: --deep --compare <l001.json> --targets docs/harness-library/L-002-targets.json imprime cada métrica con L-001, L-002, delta y estado", () => {
    const dir = makeTempDir();
    const t0 = Date.parse("2026-11-24T22:00:00.000Z");
    const ts = (sec: number) => new Date(t0 + sec * 1000).toISOString();

    const baseEvs = [
      { ts: ts(0), session: "b1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "grep -rn a src" },
      { ts: ts(10), session: "b1", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "block", rule: "read.oversize", cmd: "src/big.ts" },
      { ts: ts(20), session: "b1", runtime: "claude-code", phase: "pre", kind: "write", tool: "Edit", decision: "allow", cmd: "src/a.ts" },
    ];
    const candEvs = [
      { v: 3, ts: ts(100), session: "c1", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "src/a.ts", id: "1" },
      { v: 3, ts: ts(101), session: "c1", runtime: "claude-code", phase: "post", kind: "read", tool: "Read", decision: "allow", cmd: "src/a.ts", id: "1", ok: true },
      { v: 3, ts: ts(105), session: "c1", runtime: "claude-code", phase: "pre", kind: "write", tool: "Edit", decision: "allow", cmd: "src/a.ts", id: "2" },
      { v: 3, ts: ts(106), session: "c1", runtime: "claude-code", phase: "post", kind: "write", tool: "Edit", decision: "allow", cmd: "src/a.ts", id: "2", ok: true },
    ];

    const baseReport = analyzeDeep(baseEvs, { ledgerPath: null });
    const baseJsonPath = path.join(dir, "l001.json");
    writeFileSync(baseJsonPath, JSON.stringify(baseReport.json, null, 2), "utf8");

    const candEventsPath = path.join(dir, "l002-events.jsonl");
    writeFileSync(candEventsPath, `${candEvs.map((e) => JSON.stringify(e)).join("\n")}\n`, "utf8");

    const outDir = path.join(dir, "out");
    const stdout = execFileSync(
      process.execPath,
      [telemetryCli, candEventsPath, "--deep", "--min-schema", "3", "--compare", baseJsonPath, "--targets", targetsFile, "--out", outDir],
      { encoding: "utf8" },
    );

    expect(stdout).toContain("Comparación L-001 vs. L-002");
    expect(stdout).toContain("| métrica | runtime | L-001 | L-002 | delta % | meta | estado |");
    expect(stdout).toContain("Bloqueos comparables por sesión (C4)");
    expect(stdout).toContain("Lecturas Claude Code por Bash");
    expect(stdout).toContain("cumplida");

    const targetsCfg = JSON.parse(readFileSync(targetsFile, "utf8"));
    const candReport = JSON.parse(readFileSync(path.join(outDir, "deep-dive.json"), "utf8"));
    expect(candReport.comparison.rows.length).toBe(targetsCfg.metrics.length);

    // También probar compareDeepReports directo
    const direct = compareDeepReports(baseReport.json, candReport, targetsCfg);
    expect(direct.rows.find((r: { id: string }) => r.id === "claude_bash_reads_primary")?.status).toBe("cumplida");
  });
});
