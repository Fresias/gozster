import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error - mjs module
import { buildEvent, recordEvent, redactCmd } from "../core/guard/telemetry.mjs";
// @ts-expect-error - mjs module
import { formatSummary, parseJsonl, percentile, summarize } from "../core/scripts/harness-telemetry.mjs";

// H-12 — Telemetría determinista del guard + agregador harness-telemetry.mjs.
// Criterios de aceptación (Gherkin):
// 1. GIVEN 100 eventos sintéticos THEN el resumen (<= 40 líneas) muestra
//    [ACTION] tool calls por kind, [OBSERVATION] bloqueos e inyecciones por regla
//    y mediana/p90 de time-to-first-edit, y [ERROR] sesiones con > 3 bloqueos repetidos.
// 2. GIVEN un comando con `sk-…` o `eyJ…` THEN queda redactado en events.jsonl.

let tempDirs: string[] = [];
afterEach(() => {
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
});
