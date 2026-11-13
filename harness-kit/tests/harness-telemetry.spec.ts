import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error - mjs module
import { buildEvent, recordEvent, redactCmd, resolveTelemetryDir } from "../core/guard/telemetry.mjs";
// @ts-expect-error - mjs module
import { evaluatePpcTrigger, formatSummary, parseJsonl, percentile, summarize } from "../core/scripts/harness-telemetry.mjs";

// H-12 — Telemetría determinista del guard + agregador harness-telemetry.mjs.
// Criterios de aceptación (Gherkin):
// 1. GIVEN 100 eventos sintéticos THEN el resumen (<= 40 líneas) muestra
//    [ACTION] tool calls por kind, [OBSERVATION] bloqueos e inyecciones por regla
//    y mediana/p90 de time-to-first-edit, y [ERROR] sesiones con > 3 bloqueos repetidos.
// 2. GIVEN un comando con `sk-…` o `eyJ…` THEN queda redactado en events.jsonl.

let tempDirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
  tempDirs = [];
});

/** Build 100 deterministic synthetic events across 10 sessions. */
function synthEvents() {
  const base = Date.parse("2026-10-20T00:00:00.000Z");
  const spread = 100_000; // keep sessions far apart in time
  const spinRules = ["shell.destructive", "read.oversize", "fs.env-leak", "fs.bloatware"];
  const events: Record<string, unknown>[] = [];

  for (let i = 0; i < 10; i++) {
    const session = `s${i}`;
    const start = base + i * spread;

    // Session start: a read (allowed).
    events.push({
      ts: new Date(start).toISOString(),
      session,
      runtime: "claude-code",
      phase: "pre",
      kind: "read",
      tool: "Read",
      decision: "allow",
      rule: null,
      cmd: "src/file.ts",
    });

    // First edit at start + (i+1)*1000ms -> TTFE = (i+1)*1000.
    events.push({
      ts: new Date(start + (i + 1) * 1000).toISOString(),
      session,
      runtime: "claude-code",
      phase: "pre",
      kind: "write",
      tool: "Edit",
      decision: "allow",
      rule: null,
      cmd: "src/file.ts",
    });

    // 8 events per session after the edit (TTFE unaffected): blocks, except that
    // in s1..s4 the last one is a post-phase GH007 injection.
    for (let b = 0; b < 8; b++) {
      if (b === 7 && i >= 1 && i <= 4) {
        events.push({
          ts: new Date(start + 500_000 + b).toISOString(),
          session,
          runtime: "claude-code",
          phase: "post",
          kind: "shell",
          tool: "Bash",
          decision: "allow",
          rule: "git.gh007-noreply",
          inject: true,
          cmd: "git push",
        });
        continue;
      }
      const rule = i === 0 ? "db.append-only" : spinRules[b % spinRules.length];
      events.push({
        ts: new Date(start + 500_000 + b).toISOString(),
        session,
        runtime: "claude-code",
        phase: "pre",
        kind: "shell",
        tool: "Bash",
        decision: "block",
        rule,
        cmd: "blocked command",
      });
    }
  }
  return events;
}

describe("H-12: redacción de secretos (criterio 2)", () => {
  // vitest.config.ts desactiva la telemetría; estos tests escriben en un dir temporal explícito.
  beforeEach(() => vi.stubEnv("HARNESS_TELEMETRY", "1"));

  it("redacta claves sk-… y conserva el resto", () => {
    const out = redactCmd("export KEY=sk-ABCDEFGHIJKLMNOP1234 && run");
    expect(out).toContain("sk-[REDACTED]");
    expect(out).not.toContain("ABCDEFGHIJKLMNOP1234");
  });

  it("redacta JWTs/claves eyJ…", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.abcSIG";
    const out = redactCmd(`curl -H "apikey: ${jwt}"`);
    expect(out).toContain("eyJ[REDACTED]");
    expect(out).not.toContain("IUzI1NiIsInR5cCI6IkpXVCJ9");
  });

  it("colapsa espacios y trunca a 120 caracteres", () => {
    expect(redactCmd("a\n   b")).toBe("a b");
    const long = "x".repeat(200);
    expect(redactCmd(long).length).toBe(120);
  });

  it("recordEvent escribe la línea redactada en events.jsonl", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "harness-telemetry-"));
    tempDirs.push(dir);
    const secret = "sk-SUPERSECRETKEY1234567890";
    const normalized = {
      runtime: "claude-code",
      kind: "shell",
      tool: "Bash",
      phase: "pre",
      command: `deploy --token ${secret}`,
      raw: { session_id: "sess-1" },
    };
    recordEvent(normalized, { allowed: true }, { dir });

    const raw = readFileSync(path.join(dir, "events.jsonl"), "utf8");
    const line = parseJsonl(raw)[0] as Record<string, string>;
    expect(raw).not.toContain(secret);
    expect(line.cmd).toContain("sk-[REDACTED]");
    expect(line.session).toBe("sess-1");
  });

  it("registra eventos post solo cuando inyectan contexto", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "harness-telemetry-"));
    tempDirs.push(dir);
    recordEvent(
      { runtime: "claude-code", kind: "shell", tool: "Bash", phase: "post", command: "git push", raw: {} },
      { allowed: true, inject: true, ruleId: "git.gh007-noreply" },
      { dir },
    );
    const line = parseJsonl(readFileSync(path.join(dir, "events.jsonl"), "utf8"))[0] as Record<string, unknown>;
    expect(line.inject).toBe(true);
    expect(line.rule).toBe("git.gh007-noreply");
  });

  it("no registra eventos de fase post sin inyección", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "harness-telemetry-"));
    tempDirs.push(dir);
    recordEvent(
      { runtime: "claude-code", kind: "write", phase: "post", raw: {} },
      { allowed: true },
      { dir },
    );
    expect(() => readFileSync(path.join(dir, "events.jsonl"), "utf8")).toThrow();
  });
});

describe("H-12: buildEvent", () => {
  it("marca decision=block y conserva el ruleId", () => {
    const ev = buildEvent(
      { runtime: "claude-code", kind: "write", tool: "Edit", phase: "pre", targetPath: "a.sql", raw: {} },
      { allowed: false, ruleId: "db.append-only" },
      new Date("2026-10-20T10:00:00.000Z"),
    );
    expect(ev.decision).toBe("block");
    expect(ev.rule).toBe("db.append-only");
    expect(ev.ts).toBe("2026-10-20T10:00:00.000Z");
    expect(ev.inject).toBe(false);
  });
});

describe("H-12: percentile (interpolación lineal)", () => {
  it("calcula mediana y p90 de 1000..10000", () => {
    const vals = Array.from({ length: 10 }, (_, i) => (i + 1) * 1000);
    expect(percentile(vals, 50)).toBe(5500);
    expect(percentile(vals, 90)).toBe(9100);
  });
});

describe("H-12: summarize con 100 eventos sintéticos (criterio 1)", () => {
  const summary = summarize(parseJsonl(synthEvents().map((e) => JSON.stringify(e)).join("\n")));

  it("cuenta 100 eventos en 10 sesiones", () => {
    expect(summary.totalEvents).toBe(100);
    expect(summary.totalSessions).toBe(10);
  });

  it("agrega bloqueos por regla", () => {
    expect(summary.blocksByRule["db.append-only"]).toBe(8);
    expect(summary.blocksByRule["shell.destructive"]).toBe(18);
    expect(summary.blocksByRule["read.oversize"]).toBe(18);
    expect(summary.blocksByRule["fs.env-leak"]).toBe(18);
    expect(summary.blocksByRule["fs.bloatware"]).toBe(14);
  });

  it("[ACTION] cuenta tool calls por kind sin contar las inyecciones post", () => {
    expect(summary.actionsByKind).toEqual({ shell: 76, read: 10, write: 10 });
  });

  it("[OBSERVATION] cuenta inyecciones por regla", () => {
    expect(summary.injectionsByRule).toEqual({ "git.gh007-noreply": 4 });
  });

  it("el texto usa [ACTION], [OBSERVATION] y [ERROR] en ese orden", () => {
    const text = formatSummary(summary);
    const iA = text.indexOf("[ACTION]");
    const iO = text.indexOf("[OBSERVATION]");
    const iE = text.indexOf("[ERROR]");
    expect(iA).toBeGreaterThan(-1);
    expect(iO).toBeGreaterThan(iA);
    expect(iE).toBeGreaterThan(iO);
    expect(text).toContain("4  git.gh007-noreply");
    expect(text).toContain("median 5500  p90 9100");
    expect(text).toContain("8  s0  db.append-only");
    expect(text.split("\n").length).toBeLessThanOrEqual(40);
  });

  it("el texto sigue en <= 40 líneas con muchas reglas y sesiones", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      ts: new Date(Date.parse("2026-10-20T00:00:00.000Z") + i).toISOString(),
      session: `m${i % 12}`,
      phase: i % 2 ? "pre" : "post",
      kind: ["shell", "read", "write", "read_many", "other", "x"][i % 6],
      decision: i % 2 ? "block" : "allow",
      inject: i % 2 === 0,
      rule: `rule.${i % 20}`,
    }));
    const text = formatSummary(summarize(many));
    expect(text.split("\n").length).toBeLessThanOrEqual(40);
    expect(text).toContain("more");
  });

  it("reporta mediana y p90 de time-to-first-edit", () => {
    expect(summary.timeToFirstEdit.count).toBe(10);
    expect(summary.timeToFirstEdit.medianMs).toBe(5500);
    expect(summary.timeToFirstEdit.p90Ms).toBe(9100);
  });

  it("detecta sesiones con > 3 bloqueos repetidos de la misma regla", () => {
    expect(summary.repeatedBlockSessions).toEqual([
      { session: "s0", rule: "db.append-only", count: 8 },
    ]);
  });

  it("evaluatePpcTrigger activa should_trigger al superar umbral de 2 bloqueos en una sesión", () => {
    const trigger = evaluatePpcTrigger([
      { session: "sess-1", decision: "block", rule: "shell.destructive" },
      { session: "sess-1", decision: "block", rule: "shell.destructive" },
      { session: "sess-2", decision: "block", rule: "read.oversize" },
    ], 2);

    expect(trigger.should_trigger).toBe(true);
    expect(trigger.triggers).toHaveLength(1);
    expect(trigger.triggers[0]!.rule).toBe("shell.destructive");
    expect(trigger.triggers[0]!.block_count).toBe(2);
    expect(trigger.triggers[0]!.recommendation).toContain("Trigger harness-proposer");
  });
});

// GOZS-516 — Telemetría persistente entre worktrees, sin eventos de tests y por runtime.
function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function tempDir(): string {
  const d = realpathSync(mkdtempSync(path.join(tmpdir(), "harness-telemetry-")));
  tempDirs.push(d);
  return d;
}

const preEvent = (runtime: string) => ({ runtime, kind: "shell", tool: "Bash", phase: "pre", command: "ls", raw: {} });

describe("GOZS-516: ruta de telemetría", () => {
  beforeEach(() => {
    vi.stubEnv("HARNESS_TELEMETRY", "1");
    vi.stubEnv("HARNESS_TELEMETRY_DIR", "");
  });

  it("dos worktrees del mismo clon escriben en el mismo events.jsonl bajo el git common dir, que sobrevive al borrado del worktree", () => {
    const root = tempDir();
    const main = path.join(root, "main");
    const wt = path.join(root, "wt");
    execFileSync("git", ["init", "-q", main]);
    git(main, "commit", "-q", "--allow-empty", "-m", "init");
    git(main, "worktree", "add", "-q", wt);

    recordEvent(preEvent("claude-code"), { allowed: true }, { repoRoot: main });
    recordEvent(preEvent("antigravity"), { allowed: true }, { repoRoot: wt });

    const shared = path.join(main, ".git", "harness", "telemetry");
    expect(resolveTelemetryDir(wt)).toBe(shared);
    git(main, "worktree", "remove", "--force", wt);
    expect(existsSync(wt)).toBe(false);

    const events = parseJsonl(readFileSync(path.join(shared, "events.jsonl"), "utf8")) as { runtime: string }[];
    expect(events.map((e) => e.runtime)).toEqual(["claude-code", "antigravity"]);
  });

  it("HARNESS_TELEMETRY_DIR tiene prioridad sobre el git common dir", () => {
    const dir = tempDir();
    vi.stubEnv("HARNESS_TELEMETRY_DIR", dir);
    recordEvent(preEvent("claude-code"), { allowed: true }, { repoRoot: process.cwd() });
    expect(parseJsonl(readFileSync(path.join(dir, "events.jsonl"), "utf8"))).toHaveLength(1);
  });

  it("sin git escribe en <repoRoot>/.harness/telemetry y no falla", () => {
    const repoRoot = tempDir();
    recordEvent(preEvent("claude-code"), { allowed: true }, { repoRoot });
    const file = path.join(repoRoot, ".harness", "telemetry", "events.jsonl");
    expect(parseJsonl(readFileSync(file, "utf8"))).toHaveLength(1);
  });

  it("un error al resolver el common dir falla en silencio", () => {
    const notADir = path.join(tempDir(), "file");
    writeFileSync(notADir, "");
    expect(() => recordEvent(preEvent("claude-code"), { allowed: true }, { repoRoot: notADir })).not.toThrow();
  });
});

describe("GOZS-516: los tests no escriben telemetría real", () => {
  it("vitest.config.ts fija HARNESS_TELEMETRY=0 para el proceso de tests", () => {
    expect(process.env.HARNESS_TELEMETRY).toBe("0");
  });

  it("todo spec que lanza un proceso hijo hereda process.env o pasa HARNESS_TELEMETRY=0", () => {
    const repo = path.resolve(__dirname, "../..");
    const specs = ["harness-kit/tests", "tests", "src"].flatMap((d) =>
      existsSync(path.join(repo, d))
        ? (readdirSync(path.join(repo, d), { recursive: true }) as string[])
            .filter((f) => /\.(spec|test)\.tsx?$/.test(f))
            .map((f) => path.join(d, f))
        : [],
    );
    const offenders: string[] = [];
    for (const rel of specs) {
      const src = readFileSync(path.join(repo, rel), "utf8");
      if (!src.includes("child_process")) continue;
      // Each `env:` option must spread process.env (directly or via a const) or disable telemetry.
      for (const m of src.matchAll(/^\s*env:\s*([^,\n]+)/gm)) {
        const value = m[1]!.trim();
        const ident = /^[A-Za-z_$][\w$]*$/.test(value) ? value : null;
        const def = ident ? (src.match(new RegExp(`const ${ident}\\s*=([\\s\\S]*?);`))?.[1] ?? "") : value;
        if (!/process\.env|HARNESS_TELEMETRY:\s*["']0["']/.test(def)) offenders.push(`${rel}: env: ${value}`);
      }
    }
    expect(specs.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});

describe("GOZS-516: byRuntime", () => {
  const events = [
    { ts: "2026-11-13T10:00:00.000Z", session: "a", runtime: "claude-code", phase: "pre", kind: "shell", decision: "block", rule: "shell.rm-rf" },
    { ts: "2026-11-13T10:00:01.000Z", session: "a", runtime: "claude-code", phase: "pre", kind: "read", decision: "allow", rule: null },
    { ts: "2026-11-13T10:00:02.000Z", session: "b", runtime: "claude-code", phase: "pre", kind: "read", decision: "allow", rule: null },
    { ts: "2026-11-13T10:00:03.000Z", session: "c", runtime: "antigravity", phase: "pre", kind: "shell", decision: "block", rule: "git.reset-hard" },
  ];

  it("separa eventos, sesiones y bloqueos por regla de cada runtime", () => {
    expect(summarize(events).byRuntime).toEqual({
      "claude-code": { events: 3, sessions: 2, blocksByRule: { "shell.rm-rf": 1 } },
      antigravity: { events: 1, sessions: 1, blocksByRule: { "git.reset-hard": 1 } },
    });
  });

  it("la CLI --json incluye byRuntime y el texto la sección [RUNTIME]", () => {
    const file = path.join(tempDir(), "events.jsonl");
    writeFileSync(file, events.map((e) => JSON.stringify(e)).join("\n"));
    const script = path.resolve(__dirname, "../core/scripts/harness-telemetry.mjs");
    const json = JSON.parse(execFileSync(process.execPath, [script, file, "--json"], { encoding: "utf8" }));
    expect(json.byRuntime.antigravity.blocksByRule).toEqual({ "git.reset-hard": 1 });
    const text = execFileSync(process.execPath, [script, file], { encoding: "utf8" });
    expect(text).toContain("[RUNTIME]");
    expect(text).toContain("3  claude-code  sessions 2  blocks shell.rm-rf=1");
  });
});
