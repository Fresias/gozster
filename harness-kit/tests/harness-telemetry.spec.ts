import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error - mjs module
import { normalize } from "../core/guard/normalize.mjs";
// @ts-expect-error - mjs module
import { buildEvent, CMD_MAX, recordEvent, redactCmd, redactSecrets, relativizeForTelemetry, resolveSession, resolveTelemetryDir, sanitizePreview, stripAnsi, TELEMETRY_SCHEMA } from "../core/guard/telemetry.mjs";
// @ts-expect-error - mjs module
import { evaluatePpcTrigger, filterEvents, formatSummary, isExcludedEvent, pairPrePostEvents, parseCliArgs, parseJsonl, percentile, summarize } from "../core/scripts/harness-telemetry.mjs";

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

  it("colapsa espacios y trunca a 1000 caracteres (CMD_MAX)", () => {
    expect(CMD_MAX).toBe(1000);
    expect(redactCmd("a\n   b")).toBe("a b");
    const ok250 = "x".repeat(250);
    expect(redactCmd(ok250)).toBe(ok250);
    expect(redactCmd(ok250).length).toBe(250);
    const long = "x".repeat(1500);
    expect(redactCmd(long).length).toBe(1000);
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

  it("registra eventos post con inyección conservando inject y rule", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "harness-telemetry-"));
    tempDirs.push(dir);
    recordEvent(
      { runtime: "claude-code", kind: "shell", tool: "Bash", phase: "post", command: "git push", toolUseId: "toolu_1", ok: true, raw: {} },
      { allowed: true, inject: true, ruleId: "git.gh007-noreply" },
      { dir },
    );
    const line = parseJsonl(readFileSync(path.join(dir, "events.jsonl"), "utf8"))[0] as Record<string, unknown>;
    expect(line.phase).toBe("post");
    expect(line.inject).toBe(true);
    expect(line.rule).toBe("git.gh007-noreply");
    expect(line.id).toBe("toolu_1");
    expect(line.ok).toBe(true);
  });

  it("registra siempre eventos de fase post sin inyección con id y ok (GOZS-768)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "harness-telemetry-"));
    tempDirs.push(dir);
    recordEvent(
      { runtime: "claude-code", kind: "write", tool: "Write", phase: "post", targetPath: "src/a.ts", toolUseId: "toolu_2", ok: false, raw: {} },
      { allowed: true },
      { dir },
    );
    const line = parseJsonl(readFileSync(path.join(dir, "events.jsonl"), "utf8"))[0] as Record<string, unknown>;
    expect(line.phase).toBe("post");
    expect(line.inject).toBe(false);
    expect(line.id).toBe("toolu_2");
    expect(line.ok).toBe(false);
  });

  describe("GOZS-530: redacción ampliada de secretos (tokens GitHub, URLs y Authorization)", () => {
    it("GIVEN git remote set-url origin https://x:ghp_ABCDEFGHIJKLMNOPQRSTUVWX1234@github.com/a/b WHEN se redacta THEN no contiene ghp_ABCD ni x:ghp", () => {
      const out = redactCmd("git remote set-url origin https://x:ghp_ABCDEFGHIJKLMNOPQRSTUVWX1234@github.com/a/b");
      expect(out).not.toContain("ghp_ABCD");
      expect(out).not.toContain("x:ghp");
      expect(out).toContain("https://[REDACTED]@github.com/a/b");
    });

    it("GIVEN curl -H 'Authorization: token github_pat_11ABCDEFG0123456789_abcdef' WHEN se redacta THEN no contiene el token", () => {
      const token = "github_pat_11ABCDEFG0123456789_abcdef";
      const out = redactCmd(`curl -H "Authorization: token ${token}"`);
      expect(out).not.toContain(token);
      expect(out).toContain("Authorization: token [REDACTED]");
    });

    it("GIVEN un token ubicado cerca o más allá de CMD_MAX (1000) WHEN se redacta y trunca THEN el token sale redactado y nunca recortado a la mitad", () => {
      const prefix980 = "echo " + "z".repeat(974) + " ";
      const token = "ghp_VERYLONGSECRETTOKEN12345678901234";
      const out980 = redactCmd(prefix980 + token);
      expect(out980).toContain("gh*_[REDACTED]");
      expect(out980).not.toContain("VERYLONG");
      expect(out980).not.toContain("ghp_");
      expect(out980.length).toBeLessThanOrEqual(CMD_MAX);

      const prefix1005 = "echo " + "z".repeat(1000) + " ";
      const out1005 = redactCmd(prefix1005 + token);
      expect(out1005).not.toContain("VERYLONG");
      expect(out1005).not.toContain("ghp_");
      expect(out1005.length).toBeLessThanOrEqual(CMD_MAX);
    });

    it("GIVEN un comando sin secretos WHEN se redacta THEN queda igual (salvo espacios normalizados)", () => {
      expect(redactCmd("git status --short")).toBe("git status --short");
      expect(redactCmd("npm   run   test")).toBe("npm run test");
    });

    it("redacta tokens falsos de cada tipo en memoria y en events.jsonl escrito en disco", () => {
      const dir = mkdtempSync(path.join(tmpdir(), "harness-telemetry-tokens-"));
      tempDirs.push(dir);

      const fakeTokens: Record<string, string> = {
        ghp: "ghp_FAKEPERSONALTOKEN12345678901234",
        gho: "gho_FAKEOAUTHTOKEN1234567890123456",
        ghu: "ghu_FAKEUSERTOSERVER123456789012",
        ghs: "ghs_FAKESERVER2SERVER12345678901",
        ghr: "ghr_FAKEREFRESHTOKEN12345678901234",
        github_pat: "github_pat_FAKEFINEGRAINED1122334455667788_abcdef",
        url_creds: "https://myuser:secretPassword123@github.com/myorg/myrepo",
        auth_bearer: "Authorization: Bearer fakeBearerSecretTokenValue12345",
        auth_basic: "Authorization: Basic ZmFrZXVzZXI6ZmFrZXBhc3M=",
        sk: "sk-FAKESECRETKEY123456789012345",
        jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.fakeSignatureHere",
      };

      for (const [kind, tokenVal] of Object.entries(fakeTokens)) {
        const cmd = `deploy --type ${kind} --value ${tokenVal}`;
        const redacted = redactCmd(cmd);

        // Verificación en memoria
        expect(redacted).not.toContain(tokenVal);

        // Escritura en events.jsonl
        recordEvent(
          {
            runtime: "antigravity",
            kind: "shell",
            tool: "Bash",
            phase: "pre",
            command: cmd,
            raw: { session_id: `sess-${kind}` },
          },
          { allowed: true },
          { dir },
        );
      }

      // Verificación directa en el archivo escrito en disco
      const eventsFile = path.join(dir, "events.jsonl");
      expect(existsSync(eventsFile)).toBe(true);
      const content = readFileSync(eventsFile, "utf8");

      for (const [kind, tokenVal] of Object.entries(fakeTokens)) {
        if (kind === "url_creds") {
          expect(content).not.toContain("secretPassword123");
        } else if (kind.startsWith("auth_")) {
          const secretPart = tokenVal.split(" ")[2];
          expect(content).not.toContain(secretPart);
        } else {
          expect(content).not.toContain(tokenVal);
        }
      }
    });

    it("sanitizePreview limpia códigos ANSI, redacta secretos y enmascara rutas locales", () => {
      const ansiRaw = "\u001b[31m[FAIL]\u001b[39m \u001b[1mError in test\u001b[22m";
      expect(sanitizePreview(ansiRaw)).toBe("[FAIL] Error in test");

      const repoPath = "C:/my/secret/repo/path";
      const previewWithPaths = `Error at ${repoPath}/src/index.ts:10`;
      const sanitized = sanitizePreview(previewWithPaths, repoPath);
      expect(sanitized).not.toContain(repoPath);
      expect(sanitized).toContain("[repo]/src/index.ts:10");
    });
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

describe("GOZS-538 H-01: resolveSession por runtime con fixtures existentes", () => {
  const fixturesDir = path.resolve(__dirname, "fixtures");
  const cases: Array<{ runtime: string; expected: string }> = [
    { runtime: "claude-code", expected: "25aca701-753d-47a0-abb6-afb4f08aabf5" },
    { runtime: "gemini-cli", expected: "d7476bff-f30a-47c6-8c3d-304c3c69be1a" },
    { runtime: "antigravity", expected: "eea1e483-2c3d-4983-9424-7f805610a7ee" },
    { runtime: "opencode", expected: "ses_ea9fdb6a8ffecfyC8M0NtjpGH5" },
  ];

  for (const { runtime, expected } of cases) {
    it(`GIVEN el fixture pre-shell de ${runtime} WHEN resolveSession() y buildEvent() lo evalúan THEN la sesión es distinta de "unknown"`, () => {
      vi.stubEnv("HARNESS_SESSION_ID", "");
      const raw = JSON.parse(readFileSync(path.join(fixturesDir, runtime, "pre-shell.json"), "utf8"));
      const session = resolveSession(raw);
      expect(session).not.toBe("unknown");
      expect(session).toBe(expected);

      const ev = buildEvent({ runtime, phase: "pre", kind: "shell", tool: "shell", command: "echo h00", raw }, { allowed: true });
      expect(ev.session).toBe(expected);
      expect(ev.session).not.toBe("unknown");
    });
  }
});

describe("GOZS-538 H-02: sin contaminación de canarios ni corridas sintéticas", () => {
  it("GIVEN HARNESS_TELEMETRY=1 WHEN corre scripts/qa-harness-canary.mjs THEN no escribe eventos en la telemetría real", () => {
    const dir = tempDir();
    const canaryScript = path.resolve(__dirname, "../../scripts/qa-harness-canary.mjs");
    for (const runtime of ["claude-code", "antigravity"]) {
      execFileSync(process.execPath, [canaryScript, "--target", "repo", "--runtime", runtime, "--json"], {
        encoding: "utf8",
        env: { ...process.env, HARNESS_TELEMETRY: "1", HARNESS_TELEMETRY_DIR: dir },
      });
    }
    expect(existsSync(path.join(dir, "events.jsonl"))).toBe(false);
  });

  it("GIVEN eventos con sesión marcada como canary/synthetic WHEN el agregador resume THEN quedan excluidos", () => {
    const mixed = [
      { ts: "2026-11-16T01:00:00.000Z", session: "real-sess-1", runtime: "antigravity", phase: "pre", kind: "read", decision: "allow", rule: null },
      { ts: "2026-11-16T01:00:01.000Z", session: "canary", runtime: "claude-code", phase: "pre", kind: "shell", decision: "block", rule: "git.force-push" },
      { ts: "2026-11-16T01:00:02.000Z", session: "synthetic-run", runtime: "opencode", phase: "pre", kind: "shell", decision: "block", rule: "fs.bloatware" },
      { ts: "2026-11-16T01:00:03.000Z", session: "qa-canary-1", runtime: "antigravity", phase: "pre", kind: "shell", decision: "block", rule: "git.repo-rewire" },
      { ts: "2026-11-16T01:00:04.000Z", session: "other", synthetic: true, runtime: "gemini-cli", phase: "pre", kind: "shell", decision: "block", rule: "shell.rm-rf" },
    ];
    expect(isExcludedEvent(mixed[0])).toBe(false);
    expect(isExcludedEvent(mixed[1])).toBe(true);
    expect(isExcludedEvent(mixed[2])).toBe(true);
    expect(isExcludedEvent(mixed[3])).toBe(true);
    expect(isExcludedEvent(mixed[4])).toBe(true);

    const s = summarize(mixed);
    expect(s.totalEvents).toBe(1);
    expect(s.totalSessions).toBe(1);
    expect(s.blocksByRule).toEqual({});
    expect(s.ppcTrigger.should_trigger).toBe(false);
  });
});

describe("GOZS-538 H-03: --since / --until y validación de argumentos en harness-telemetry.mjs", () => {
  const script = path.resolve(__dirname, "../core/scripts/harness-telemetry.mjs");
  const sampleEvents = [
    { ts: "2026-11-10T23:59:59.999Z", session: "s-before", runtime: "claude-code", phase: "pre", kind: "read", decision: "allow", rule: null },
    { ts: "2026-11-11T00:00:00.000Z", session: "s-in-1", runtime: "antigravity", phase: "pre", kind: "shell", decision: "block", rule: "git.force-push" },
    { ts: "2026-11-13T12:00:00.000Z", session: "s-in-2", runtime: "claude-code", phase: "pre", kind: "write", decision: "allow", rule: null },
    { ts: "2026-11-15T00:00:00.000Z", session: "s-until-boundary", runtime: "antigravity", phase: "pre", kind: "shell", decision: "block", rule: "shell.rm-rf" },
  ];

  it("GIVEN eventos en distintas fechas WHEN se ejecuta con --since y --until (texto y --json) THEN filtra estrictamente por [since, until)", () => {
    const file = path.join(tempDir(), "events.jsonl");
    writeFileSync(file, sampleEvents.map((e) => JSON.stringify(e)).join("\n"));

    const jsonOut = JSON.parse(
      execFileSync(
        process.execPath,
        [script, file, "--since", "2026-11-11T00:00:00.000Z", "--until", "2026-11-15T00:00:00.000Z", "--json"],
        { encoding: "utf8" },
      ),
    );
    expect(jsonOut.totalEvents).toBe(2);
    expect(jsonOut.totalSessions).toBe(2);
    expect(jsonOut.blocksByRule).toEqual({ "git.force-push": 1 });

    const textOut = execFileSync(
      process.execPath,
      [script, file, "--since=2026-11-11T00:00:00.000Z", "--until=2026-11-15T00:00:00.000Z"],
      { encoding: "utf8" },
    );
    expect(textOut).toContain("events:   2");
    expect(textOut).toContain("sessions: 2");
    expect(textOut).toContain("1  git.force-push");
    expect(textOut).not.toContain("shell.rm-rf");

    expect(
      filterEvents(sampleEvents, {
        since: "2026-11-11T00:00:00.000Z",
        until: "2026-11-15T00:00:00.000Z",
      }).map((e: { session: string }) => e.session),
    ).toEqual(["s-in-1", "s-in-2"]);
  });

  it("GIVEN un argumento desconocido o fecha inválida WHEN se ejecuta harness-telemetry.mjs THEN falla con código != 0", () => {
    const file = path.join(tempDir(), "events.jsonl");
    writeFileSync(file, "");

    for (const badArgs of [
      [file, "--unknown-flag"],
      [file, "--since"],
      [file, "--since", "not-a-date"],
      [file, "--until=not-a-date"],
      [file, "extra-positional.jsonl"],
    ]) {
      let exitCode = 0;
      try {
        execFileSync(process.execPath, [script, ...badArgs], { stdio: "pipe" });
      } catch (e) {
        exitCode = (e as { status?: number }).status ?? 1;
      }
      expect(exitCode).not.toBe(0);
    }
  });

  it("GIVEN un archivo explícito inexistente WHEN se ejecuta harness-telemetry.mjs THEN falla con código != 0", () => {
    const missingFile = path.join(tempDir(), "does-not-exist.jsonl");
    let exitCode = 0;
    try {
      execFileSync(process.execPath, [script, missingFile], { stdio: "pipe" });
    } catch (e) {
      exitCode = (e as { status?: number }).status ?? 1;
    }
    expect(exitCode).not.toBe(0);
  });
});

describe("GOZS-768: fidelidad de telemetría (CMD_MAX 300, rutas relativas, rango, cwd, post/ok y search)", () => {
  beforeEach(() => vi.stubEnv("HARNESS_TELEMETRY", "1"));

  const workdir = path.join(homedir(), "multica_workspaces_desktop-api.multica.ai", "gozster-ws", "gozs-768", "workdir");
  const repoRoot = path.join(workdir, "gozster");

  it("GIVEN un comando de shell de 250 caracteres sin secretos WHEN se registra THEN cmd conserva los 250 caracteres", () => {
    const cmd250 = "rg -n " + "a".repeat(244);
    expect(cmd250.length).toBe(250);
    const norm = normalize({ tool_name: "Bash", cwd: repoRoot, tool_input: { command: cmd250 }, tool_use_id: "toolu_250" });
    const ev = buildEvent(norm, { allowed: true }, { repoRoot });
    expect(ev.cmd).toBe(cmd250);
    expect(ev.cmd.length).toBe(250);
  });

  it("GIVEN un comando con un token en la posición 280 WHEN se registra THEN el token sale redactado y nunca recortado a la mitad", () => {
    const secret = "sk-SUPERSECRETTOKEN1234567890ABCDEF";
    const cmd = "echo " + "a".repeat(275) + secret;
    expect(cmd.indexOf(secret)).toBe(280);
    const norm = normalize({ tool_name: "Bash", cwd: repoRoot, tool_input: { command: cmd } });
    const ev = buildEvent(norm, { allowed: true }, { repoRoot });
    expect(ev.cmd).toContain("sk-[REDACTED]");
    expect(ev.cmd).not.toContain("SUPERSECRET");
    expect(ev.cmd.length).toBeLessThanOrEqual(300);
  });

  it("GIVEN una lectura de <repoRoot>\\src\\components\\coach\\coach-studio-view.tsx (Windows) WHEN se registra THEN cmd = src/components/coach/coach-studio-view.tsx", () => {
    const winRepo = "C:\\Users\\user\\multica_workspaces\\ws\\workdir\\gozster";
    const winFile = `${winRepo}\\src\\components\\coach\\coach-studio-view.tsx`;
    const norm = normalize({
      toolCall: { name: "read_file", args: { Path: winFile, StartLine: 10, EndLine: 50 } },
      workspacePaths: ["C:\\Users\\user\\multica_workspaces\\ws\\workdir"],
    });
    const ev = buildEvent(norm, { allowed: true }, { repoRoot: winRepo });
    expect(ev.cmd).toBe("src/components/coach/coach-studio-view.tsx");
    expect(ev.start).toBe(10);
    expect(ev.limit).toBe(41);
    expect(ev.bounded).toBe(true);
    expect(ev.cwd).toBe("<workdir>");
  });

  it("GIVEN Set-Location \"<workdir>\\gozster\"; rg -n foo src WHEN se registra THEN cmd = Set-Location \"<repo>\"; rg -n foo src", () => {
    const winWorkdir = "C:\\Users\\user\\multica_workspaces\\ws\\workdir";
    const winRepo = `${winWorkdir}\\gozster`;
    const rawCmd = `Set-Location "${winWorkdir}\\gozster"; rg -n foo src`;
    const norm = normalize({
      toolCall: { name: "run_command", args: { CommandLine: rawCmd } },
      workspacePaths: [winWorkdir],
    });
    const ev = buildEvent(norm, { allowed: true }, { repoRoot: winRepo });
    expect(ev.cmd).toBe('Set-Location "<repo>"; rg -n foo src');
    expect(ev.cwd).toBe("<workdir>");
  });

  it("GIVEN rutas estilo POSIX y Windows mezcladas WHEN relativizeForTelemetry/buildEvent corren en cualquier OS THEN resuelven <repo> y <workdir> de forma cross-platform", () => {
    const posixWorkdir = "/srv/multica/ws/workdir";
    const posixRepo = `${posixWorkdir}/gozster`;
    expect(relativizeForTelemetry(`cd "${posixRepo}" && cat "${posixWorkdir}/notes.txt"`, posixRepo)).toBe(
      'cd "<repo>" && cat "<workdir>/notes.txt"',
    );
    const posixNorm = normalize({
      toolCall: { name: "run_command", args: { CommandLine: `rg foo ${posixRepo}/src` } },
      workspacePaths: [posixWorkdir],
    });
    const posixEv = buildEvent(posixNorm, { allowed: true }, { repoRoot: posixRepo });
    expect(posixEv.cmd).toBe("rg foo <repo>/src");
    expect(posixEv.cwd).toBe("<workdir>");

    const winWorkdir = "C:\\Users\\user\\multica_workspaces\\ws\\workdir";
    const winRepo = `${winWorkdir}\\gozster`;
    expect(relativizeForTelemetry(winWorkdir, winRepo)).toBe("<workdir>");
    expect(relativizeForTelemetry(winWorkdir.replace(/\\/g, "/"), winRepo)).toBe("<workdir>");
    expect(relativizeForTelemetry(winWorkdir, winRepo.replace(/\\/g, "/"))).toBe("<workdir>");
  });

  it("GIVEN una ruta bajo el home fuera del repo WHEN se registra THEN empieza con ~/ y no expone el usuario", () => {
    const home = homedir();
    const userFolder = path.basename(home);
    const outsideFile = path.join(home, "Documents", "notes.md");
    const norm = normalize({
      tool_name: "Read",
      cwd: repoRoot,
      tool_input: { file_path: outsideFile },
    });
    const ev = buildEvent(norm, { allowed: true }, { repoRoot });
    expect(ev.cmd).toMatch(/^~\//);
    expect(ev.cmd).toBe("~/Documents/notes.md");
    expect(ev.cmd).not.toContain(userFolder);
    expect(relativizeForTelemetry(outsideFile, repoRoot)).toMatch(/^~\//);
  });

  it("GIVEN un Read de Claude Code con offset: 100 y limit: 200 WHEN se registra THEN el evento tiene start: 100, limit: 200 y bounded: true", () => {
    const norm = normalize({
      hook_event_name: "PreToolUse",
      cwd: repoRoot,
      tool_name: "Read",
      tool_input: { file_path: path.join(repoRoot, "src", "app.ts"), offset: 100, limit: 200 },
      tool_use_id: "toolu_read_1",
    });
    const ev = buildEvent(norm, { allowed: true }, { repoRoot });
    expect(ev.kind).toBe("read");
    expect(ev.cmd).toBe("src/app.ts");
    expect(ev.start).toBe(100);
    expect(ev.limit).toBe(200);
    expect(ev.bounded).toBe(true);
    expect(ev.cwd).toBe("<repo>");
    expect(ev.id).toBe("toolu_read_1");
  });

  it("GIVEN un run_command de Antigravity con workspacePaths[0] = <workdir> WHEN se registra THEN cwd = <workdir>", () => {
    const norm = normalize({
      conversationId: "conv-1",
      workspacePaths: [workdir],
      toolCall: { id: "call_123", name: "run_command", args: { CommandLine: "git status" } },
    });
    const ev = buildEvent(norm, { allowed: true }, { repoRoot });
    expect(ev.cwd).toBe("<workdir>");
    expect(ev.id).toBe("call_123");
    expect(ev.ok).toBeUndefined();
  });

  it("GIVEN Claude Code Grep con patrón con secreto y ruta dentro del repo WHEN se registra THEN kind='search', decision='allow', patrón redactado y ruta relativizada", () => {
    const secret = "ghp_ABCDEFGHIJKLMNOPQRSTUVWX1234";
    const norm = normalize({
      hook_event_name: "PreToolUse",
      cwd: repoRoot,
      tool_name: "Grep",
      tool_input: { pattern: secret, path: path.join(repoRoot, "src", "lib", "api.ts") },
      tool_use_id: "toolu_grep_1",
    });
    const ev = buildEvent(norm, { allowed: true }, { repoRoot });
    expect(ev.kind).toBe("search");
    expect(ev.decision).toBe("allow");
    expect(ev.cmd).toContain("gh*_[REDACTED]");
    expect(ev.cmd).toContain("src/lib/api.ts");
    expect(ev.cmd).not.toContain(secret);
    expect(ev.id).toBe("toolu_grep_1");
  });

  it("GIVEN eventos pre y post registrados en events.jsonl WHEN summarize() corre THEN actionsByKind excluye phase='post'", () => {
    const dir = tempDir();
    const pre = normalize({
      session_id: "s-post",
      hook_event_name: "PreToolUse",
      cwd: repoRoot,
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      tool_use_id: "toolu_pair_1",
    });
    const post = normalize({
      session_id: "s-post",
      hook_event_name: "PostToolUse",
      cwd: repoRoot,
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      tool_response: { stdout: "hi", stderr: "", interrupted: false },
      tool_use_id: "toolu_pair_1",
    });
    recordEvent(pre, { allowed: true }, { dir, repoRoot });
    recordEvent(post, { allowed: true }, { dir, repoRoot });

    const events = parseJsonl(readFileSync(path.join(dir, "events.jsonl"), "utf8")) as Record<string, unknown>[];
    expect(events).toHaveLength(2);
    expect(events[0]!.phase).toBe("pre");
    expect(events[0]!.id).toBe("toolu_pair_1");
    expect(events[1]!.phase).toBe("post");
    expect(events[1]!.id).toBe("toolu_pair_1");
    expect(events[1]!.ok).toBe(true);

    const summary = summarize(events);
    expect(summary.totalEvents).toBe(2);
    expect(summary.totalActions).toBe(1);
    expect(summary.postEvents).toBe(1);
    expect(summary.actionsByKind).toEqual({ shell: 1 });
  });
});

describe("GOZS-769: agregador — totalActions/postEvents, tiempo activo, callsBeforeFirstEdit, duraciones y --deep", () => {
  const script = path.resolve(__dirname, "../core/scripts/harness-telemetry.mjs");

  it("GIVEN un fixture con eventos pre y post WHEN corre summarize THEN totalActions = suma de actionsByKind y totalEvents = acciones + posts", () => {
    const fixture = [
      { ts: "2026-11-24T10:00:00.000Z", session: "s1", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "src/a.ts", id: "c1" },
      { ts: "2026-11-24T10:00:00.500Z", session: "s1", runtime: "claude-code", phase: "post", kind: "read", tool: "Read", decision: "allow", cmd: "src/a.ts", id: "c1", ok: true },
      { ts: "2026-11-24T10:00:02.000Z", session: "s1", runtime: "claude-code", phase: "pre", kind: "search", tool: "Grep", decision: "allow", cmd: "foo src", id: "c2" },
      { ts: "2026-11-24T10:00:02.400Z", session: "s1", runtime: "claude-code", phase: "post", kind: "search", tool: "Grep", decision: "allow", cmd: "foo src", id: "c2", ok: true },
      { ts: "2026-11-24T10:00:05.000Z", session: "s1", runtime: "claude-code", phase: "pre", kind: "write", tool: "Edit", decision: "allow", cmd: "src/a.ts", id: "c3" },
      { ts: "2026-11-24T10:00:05.200Z", session: "s1", runtime: "claude-code", phase: "post", kind: "write", tool: "Edit", decision: "allow", cmd: "src/a.ts", id: "c3", ok: false },
    ];
    const s = summarize(fixture);
    const actionsSum = Object.values(s.actionsByKind).reduce((acc: number, n: unknown) => acc + Number(n), 0);
    expect(s.totalActions).toBe(3);
    expect(s.postEvents).toBe(3);
    expect(s.totalActions).toBe(actionsSum);
    expect(s.totalEvents).toBe(s.totalActions + s.postEvents);
    expect(s.totalEvents).toBe(6);
  });

  it("GIVEN dos acciones de una sesión separadas por 20 min, con --idle-min 15, WHEN corre summarize THEN ese hueco no suma a activeTimeMs", () => {
    const base = Date.parse("2026-11-24T10:00:00.000Z");
    const fixture = [
      // Deliberadamente desordenados para validar ordenamiento por ts por sesión.
      { ts: new Date(base + 20 * 60_000).toISOString(), session: "s1", runtime: "antigravity", phase: "pre", kind: "read", tool: "read_file", decision: "allow", cmd: "src/b.ts" },
      { ts: new Date(base).toISOString(), session: "s1", runtime: "antigravity", phase: "pre", kind: "read", tool: "read_file", decision: "allow", cmd: "src/a.ts" },
      // Segunda sesión con 2 huecos: 3 min (<= 15) y 35 min (> 15 y > 30)
      { ts: new Date(base).toISOString(), session: "s2", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "allow", cmd: "git status" },
      { ts: new Date(base + 3 * 60_000).toISOString(), session: "s2", runtime: "antigravity", phase: "pre", kind: "shell", tool: "run_command", decision: "allow", cmd: "git diff" },
      { ts: new Date(base + 38 * 60_000).toISOString(), session: "s2", runtime: "antigravity", phase: "pre", kind: "write", tool: "edit_file", decision: "allow", cmd: "src/a.ts" },
    ];

    const s15 = summarize(fixture, { idleMin: 15 });
    expect(s15.activeTimeMs.idleThresholdMin).toBe(15);
    // Solo el hueco de 3 min en s2 suma; los de 20 min y 35 min se excluyen.
    expect(s15.activeTimeMs.totalMs).toBe(3 * 60_000);
    expect(s15.activeTimeMs.p50Ms).toBe(1.5 * 60_000);
    expect(s15.activeTimeMs.totalGaps).toBe(3);
    expect(s15.activeTimeMs.gapsOverMin).toEqual({
      2: 3, // 3m, 20m, 35m
      5: 2, // 20m, 35m
      10: 2,
      15: 2,
      30: 1, // 35m
      60: 0,
    });

    // Con umbral de 25 min, el hueco de 20 min sí suma (20 + 3 = 23 min).
    const s25 = summarize(fixture, { idleMin: 25 });
    expect(s25.activeTimeMs.totalMs).toBe(23 * 60_000);

    // Verificar vía CLI con --idle-min 15 --json
    const file = path.join(tempDir(), "events.jsonl");
    writeFileSync(file, fixture.map((e) => JSON.stringify(e)).join("\n"));
    const cliOut = JSON.parse(execFileSync(process.execPath, [script, file, "--idle-min", "15", "--json"], { encoding: "utf8" }));
    expect(cliOut.activeTimeMs.totalMs).toBe(3 * 60_000);
    expect(cliOut.activeTimeMs.gapsOverMin["15"]).toBe(2);
  });

  it("calcula callsBeforeFirstEdit (p50 y p90) contando acciones previas a la primera escritura permitida", () => {
    const base = Date.parse("2026-11-24T11:00:00.000Z");
    const fixture = [
      // s1: 1 read, 1 write BLOQUEADA, 1 post, 1 write PERMITIDA -> 2 acciones previas (read + blocked write)
      { ts: new Date(base).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "read", decision: "allow" },
      { ts: new Date(base + 1000).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "write", decision: "block", rule: "db.append-only" },
      { ts: new Date(base + 1500).toISOString(), session: "s1", runtime: "claude-code", phase: "post", kind: "read", decision: "allow" },
      { ts: new Date(base + 2000).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "write", decision: "allow" },
      // s2: 4 acciones previas antes de la primera escritura permitida
      { ts: new Date(base).toISOString(), session: "s2", runtime: "antigravity", phase: "pre", kind: "shell", decision: "allow" },
      { ts: new Date(base + 1000).toISOString(), session: "s2", runtime: "antigravity", phase: "pre", kind: "read", decision: "allow" },
      { ts: new Date(base + 2000).toISOString(), session: "s2", runtime: "antigravity", phase: "pre", kind: "read", decision: "allow" },
      { ts: new Date(base + 3000).toISOString(), session: "s2", runtime: "antigravity", phase: "pre", kind: "search", decision: "allow" },
      { ts: new Date(base + 4000).toISOString(), session: "s2", runtime: "antigravity", phase: "pre", kind: "write", decision: "allow" },
      // s3: sin escritura permitida (no cuenta)
      { ts: new Date(base).toISOString(), session: "s3", runtime: "antigravity", phase: "pre", kind: "read", decision: "allow" },
    ];

    const s = summarize(fixture);
    expect(s.callsBeforeFirstEdit.count).toBe(2);
    expect(s.callsBeforeFirstEdit.p50).toBe(3); // median([2, 4]) = 3
    expect(s.callsBeforeFirstEdit.p90).toBe(3.8); // percentile([2, 4], 90) = 3.8
  });

  it("GIVEN un pre y un post con el mismo id WHEN corre summarize THEN la duración es post.ts − pre.ts; y soporta fallback sin id y tasa de fallos", () => {
    const base = Date.parse("2026-11-24T12:00:00.000Z");
    const fixture = [
      // Par por id (3500 ms, ok: true)
      { ts: new Date(base).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "npm test", id: "toolu_1" },
      { ts: new Date(base + 3500).toISOString(), session: "s1", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "npm test", id: "toolu_1", ok: true },
      // Par por id (1500 ms, ok: false)
      { ts: new Date(base + 5000).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "git push", id: "toolu_2" },
      { ts: new Date(base + 6500).toISOString(), session: "s1", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "git push", id: "toolu_2", ok: false },
      // Par fallback por (session, tool, cmd) sin id (800 ms, ok: true)
      { ts: new Date(base + 10_000).toISOString(), session: "s1", runtime: "antigravity", phase: "pre", kind: "read", tool: "read_file", decision: "allow", cmd: "src/app.ts" },
      { ts: new Date(base + 10_800).toISOString(), session: "s1", runtime: "antigravity", phase: "post", kind: "read", tool: "read_file", decision: "allow", cmd: "src/app.ts", ok: true },
      // Dos eventos con ids distintos NO deben cruzarse por fallback
      { ts: new Date(base + 20_000).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", tool: "Bash", decision: "allow", cmd: "git status", id: "id_A" },
      { ts: new Date(base + 20_400).toISOString(), session: "s1", runtime: "claude-code", phase: "post", kind: "shell", tool: "Bash", decision: "allow", cmd: "git status", id: "id_B", ok: true },
    ];

    const pairs = pairPrePostEvents(fixture);
    expect(pairs).toHaveLength(3);
    expect(pairs[0]!.durationMs).toBe(3500);
    expect(pairs[0]!.matchedBy).toBe("id");
    expect(pairs[1]!.durationMs).toBe(1500);
    expect(pairs[1]!.matchedBy).toBe("id");
    expect(pairs[1]!.ok).toBe(false);
    expect(pairs[2]!.durationMs).toBe(800);
    expect(pairs[2]!.matchedBy).toBe("fallback");

    const s = summarize(fixture);
    expect(s.durations.pairedCount).toBe(3);
    expect(s.durations.pairedById).toBe(2);
    expect(s.durations.pairedByFallback).toBe(1);
    expect(s.durations.totalMs).toBe(5800);
    expect(s.durations.byKind.shell).toEqual({
      count: 2,
      p50Ms: 2500,
      p90Ms: 3300,
      totalMs: 5000,
    });
    expect(s.durations.byKind.read).toEqual({
      count: 1,
      p50Ms: 800,
      p90Ms: 800,
      totalMs: 800,
    });
    expect(s.durations.topSignaturesByTotalMs[0]).toMatchObject({
      signature: "npm test",
      count: 1,
      totalMs: 3500,
      failed: 0,
    });
    expect(s.durations.topSignaturesByTotalMs[1]).toMatchObject({
      signature: "git push",
      count: 1,
      totalMs: 1500,
      failed: 1,
    });
    expect(s.durations.outcomes).toEqual({
      evaluated: 4,
      failed: 1,
      failureRate: 0.25,
    });
  });

  it("GIVEN --idle-min abc o una fecha inválida WHEN corre la CLI THEN termina con código != 0 y un mensaje claro", () => {
    const file = path.join(tempDir(), "events.jsonl");
    writeFileSync(file, "");

    for (const [badArgs, expectedFragment] of [
      [[file, "--idle-min", "abc"], "--idle-min"],
      [[file, "--idle-min=0"], "--idle-min"],
      [[file, "--idle-min", "-5"], "--idle-min"],
      [[file, "--idle-min"], "--idle-min"],
      [[file, "--top", "abc"], "--top"],
      [[file, "--top=0"], "--top"],
      [[file, "--since", "fecha-invalida"], "--since"],
      [[file, "--until=otra-invalida"], "--until"],
    ] as Array<[string[], string]>) {
      let exitCode = 0;
      let stderr = "";
      try {
        execFileSync(process.execPath, [script, ...badArgs], { encoding: "utf8", stdio: "pipe" });
      } catch (e) {
        const err = e as { status?: number; stderr?: string };
        exitCode = err.status ?? 1;
        stderr = String(err.stderr ?? "");
      }
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain(expectedFragment);
    }

    // --help termina con código 0 y muestra las opciones
    const helpOut = execFileSync(process.execPath, [script, "--help"], { encoding: "utf8" });
    expect(helpOut).toContain("--idle-min");
    expect(helpOut).toContain("--deep");
    expect(parseCliArgs(["--idle-min=20", "--deep"]).idleMin).toBe(20);
  });

  it("GIVEN --deep WHEN corre la CLI THEN delega a telemetry-deep.mjs, escribe deep-dive.md/json y el cruce con summarize coincide", () => {
    const dir = tempDir();
    const outDir = path.join(dir, "out");
    const file = path.join(dir, "events.jsonl");
    const fixture = [
      { ts: "2026-11-24T14:00:00.000Z", session: "s1", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "src/app.ts", start: 1, limit: 100, bounded: true, cwd: "<repo>", id: "t1" },
      { ts: "2026-11-24T14:00:00.200Z", session: "s1", runtime: "claude-code", phase: "post", kind: "read", tool: "Read", decision: "allow", cmd: "src/app.ts", cwd: "<repo>", id: "t1", ok: true },
      { ts: "2026-11-24T14:00:05.000Z", session: "s1", runtime: "claude-code", phase: "pre", kind: "write", tool: "Edit", decision: "allow", cmd: "src/app.ts", cwd: "<repo>", id: "t2" },
      { ts: "2026-11-24T14:00:05.500Z", session: "s1", runtime: "claude-code", phase: "post", kind: "write", tool: "Edit", decision: "allow", cmd: "src/app.ts", cwd: "<repo>", id: "t2", ok: true },
    ];
    writeFileSync(file, fixture.map((e) => JSON.stringify(e)).join("\n"));

    const stdout = execFileSync(process.execPath, [script, file, "--deep", "--out", outDir], { encoding: "utf8" });
    expect(stdout).toContain("4 eventos");
    expect(stdout).toContain("2 acciones");
    expect(stdout).toContain("1 sesiones");
    expect(stdout).toContain("coincide con harness-telemetry");

    const mdPath = path.join(outDir, "deep-dive.md");
    const jsonPath = path.join(outDir, "deep-dive.json");
    expect(existsSync(mdPath)).toBe(true);
    expect(existsSync(jsonPath)).toBe(true);

    const reportJson = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(reportJson.coverage.events).toBe(4);
    expect(reportJson.coverage.actions).toBe(2);
    expect(reportJson.coverage.sessions).toBe(1);
    expect(reportJson.coverage.crossCheck.matches).toBe(true);
  });

  it("GIVEN harness-kit/core/scripts/ THEN no existe ningún script separado de deep-dive (vive en harness-kit/core/lib/telemetry-deep.mjs)", () => {
    const scriptsDir = path.resolve(__dirname, "../core/scripts");
    const libModule = path.resolve(__dirname, "../core/lib/telemetry-deep.mjs");
    expect(existsSync(libModule)).toBe(true);
    const scriptFiles = readdirSync(scriptsDir);
    expect(scriptFiles.filter((f) => /deep/i.test(f))).toEqual([]);
  });
});

describe("GOZS-791 B1 y B2: --exclude-kind, --exclude-rule y blocksPerSession", () => {
  const script = path.resolve(__dirname, "../core/scripts/harness-telemetry.mjs");

  it("B1: GIVEN una sesión cuyo primer evento es search WHEN corre con --exclude-kind search THEN TTFE, callsBeforeFirstEdit, tiempo activo y salida excluyen search", () => {
    const base = Date.parse("2026-11-24T12:00:00.000Z");
    const fixture = [
      { ts: new Date(base).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "search", tool: "Grep", decision: "allow", cmd: "foo src", id: "e1" },
      { ts: new Date(base + 500).toISOString(), session: "s1", runtime: "claude-code", phase: "post", kind: "search", tool: "Grep", decision: "allow", cmd: "foo src", id: "e1", ok: true },
      { ts: new Date(base + 10_000).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "read", tool: "Read", decision: "allow", cmd: "src/a.ts", id: "e2" },
      { ts: new Date(base + 10_300).toISOString(), session: "s1", runtime: "claude-code", phase: "post", kind: "read", tool: "Read", decision: "allow", cmd: "src/a.ts", id: "e2", ok: true },
      { ts: new Date(base + 25_000).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "write", tool: "Edit", decision: "allow", cmd: "src/a.ts", id: "e3" },
      { ts: new Date(base + 25_200).toISOString(), session: "s1", runtime: "claude-code", phase: "post", kind: "write", tool: "Edit", decision: "allow", cmd: "src/a.ts", id: "e3", ok: true },
    ];

    const full = summarize(fixture);
    expect(full.timeToFirstEdit.medianMs).toBe(25_000);
    expect(full.callsBeforeFirstEdit.p50).toBe(2);
    expect(full.totalActions).toBe(3);
    expect(full.postEvents).toBe(3);

    const excl = summarize(fixture, { excludeKinds: ["search"] });
    expect(excl.totalEvents).toBe(4);
    expect(excl.totalActions).toBe(2);
    expect(excl.postEvents).toBe(2);
    expect(excl.actionsByKind).toEqual({ read: 1, write: 1 });
    expect(excl.timeToFirstEdit.medianMs).toBe(15_000); // 25_000 - 10_000 (desde el primer evento no-search)
    expect(excl.callsBeforeFirstEdit.p50).toBe(1);
    expect(excl.activeTimeMs.totalMs).toBe(15_000);
    expect(excl.excludedKinds).toEqual(["search"]);

    const text = formatSummary(excl);
    expect(text).toContain("excluidos: search");
    expect(text.split("\n").length).toBeLessThanOrEqual(40);

    // Verificar vía CLI con --exclude-kind repetible
    const parsed = parseCliArgs(["--exclude-kind", "search", "--exclude-kind=read_many"]);
    expect(parsed.excludeKinds).toEqual(["search", "read_many"]);
    const file = path.join(tempDir(), "events.jsonl");
    writeFileSync(file, fixture.map((e) => JSON.stringify(e)).join("\n"));
    const cliText = execFileSync(process.execPath, [script, file, "--exclude-kind", "search"], { encoding: "utf8" });
    expect(cliText).toContain("excluidos: search");
    const cliJson = JSON.parse(
      execFileSync(process.execPath, [script, file, "--exclude-kind", "search", "--json"], { encoding: "utf8" }),
    );
    expect(cliJson.timeToFirstEdit.medianMs).toBe(15_000);
    expect(cliJson.callsBeforeFirstEdit.p50).toBe(1);
  });

  it("B2: GIVEN bloqueos de shell.polling WHEN corre con --exclude-rule shell.polling THEN no cuentan en blocksByRule, blocksPerSession ni repeatedBlockSessions pero siguen en totalActions", () => {
    const base = Date.parse("2026-11-24T13:00:00.000Z");
    const fixture = [
      // 4 bloqueos de shell.polling en s1 + 1 bloqueo de read.oversize en s1
      { ts: new Date(base).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", decision: "block", rule: "shell.polling", cmd: "Start-Sleep 30" },
      { ts: new Date(base + 1000).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", decision: "block", rule: "shell.polling", cmd: "Start-Sleep 30" },
      { ts: new Date(base + 2000).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", decision: "block", rule: "shell.polling", cmd: "Start-Sleep 30" },
      { ts: new Date(base + 3000).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "shell", decision: "block", rule: "shell.polling", cmd: "Start-Sleep 30" },
      { ts: new Date(base + 4000).toISOString(), session: "s1", runtime: "claude-code", phase: "pre", kind: "read", decision: "block", rule: "read.oversize", cmd: "src/big.ts" },
      // Sesión s2 con 2 bloqueos de read.oversize
      { ts: new Date(base + 5000).toISOString(), session: "s2", runtime: "antigravity", phase: "pre", kind: "read", decision: "block", rule: "read.oversize", cmd: "src/big.ts" },
      { ts: new Date(base + 6000).toISOString(), session: "s2", runtime: "antigravity", phase: "pre", kind: "read", decision: "block", rule: "read.oversize", cmd: "src/big.ts" },
    ];

    const full = summarize(fixture);
    expect(full.totalActions).toBe(7);
    expect(full.blocksPerSession).toBe(3.5); // 7 / 2
    expect(full.blocksByRule["shell.polling"]).toBe(4);
    expect(full.repeatedBlockSessions).toEqual([{ session: "s1", rule: "shell.polling", count: 4 }]);

    const excl = summarize(fixture, { excludeRules: ["shell.polling"] });
    expect(excl.totalActions).toBe(7); // siguen contando como acciones
    expect(excl.blocksByRule).toEqual({ "read.oversize": 3 });
    expect(excl.blocksByRule["shell.polling"]).toBeUndefined();
    expect(excl.blocksPerSession).toBe(1.5); // 3 / 2
    expect(excl.repeatedBlockSessions).toEqual([]);
    expect(excl.byRuntime["claude-code"].blocksByRule).toEqual({ "read.oversize": 1 });
    expect(excl.excludedRules).toEqual(["shell.polling"]);

    const parsed = parseCliArgs(["--exclude-rule", "shell.polling", "--exclude-rule=fs.protected"]);
    expect(parsed.excludeRules).toEqual(["shell.polling", "fs.protected"]);
    const file = path.join(tempDir(), "events.jsonl");
    writeFileSync(file, fixture.map((e) => JSON.stringify(e)).join("\n"));
    const cliJson = JSON.parse(
      execFileSync(process.execPath, [script, file, "--exclude-rule", "shell.polling", "--json"], { encoding: "utf8" }),
    );
    expect(cliJson.blocksPerSession).toBe(1.5);
    expect(cliJson.totalActions).toBe(7);
    expect(cliJson.blocksByRule).toEqual({ "read.oversize": 3 });
  });
});

describe("GOZS-795 B1/B2/C1/C6: esquema v3, cmdLen, compactación de heredocs de datos, primera edición unificada y --min-schema", () => {
  it("B1 y B2: todo evento nuevo lleva v: 3 y los shell llevan cmdLen exacto; 1500 chars -> cmd.length=1000 y cmdLen=1500", () => {
    expect(TELEMETRY_SCHEMA).toBe(3);
    expect(CMD_MAX).toBe(1000);

    const longCmd = "rg -n " + "a".repeat(1494);
    expect(longCmd.length).toBe(1500);
    const normShell = normalize({ tool_name: "Bash", tool_input: { command: longCmd }, session_id: "s-v3" });
    const evShell = buildEvent(normShell, { allowed: true });
    expect(evShell.v).toBe(3);
    expect(evShell.cmd.length).toBe(1000);
    expect(evShell.cmdLen).toBe(1500);

    const normRead = normalize({ tool_name: "Read", tool_input: { file_path: "AGENTS.md" }, session_id: "s-v3" });
    const evRead = buildEvent(normRead, { allowed: true });
    expect(evRead.v).toBe(3);
    expect(evRead.cmdLen).toBeUndefined();
  });

  it("B2: compacta heredocs de datos a ‹heredoc: N líneas› sin recortar, y conserva cuerpos de intérpretes por stdin", () => {
    const body200 = Array.from({ length: 200 }, (_, i) => `linea ${i + 1}`).join("\n");
    const dataHeredocCmd = `cat > ../pr.md <<'EOF'\n${body200}\nEOF`;
    const evData = buildEvent(
      normalize({ tool_name: "Bash", tool_input: { command: dataHeredocCmd }, session_id: "s-hd" }),
      { allowed: true },
    );
    expect(evData.v).toBe(3);
    expect(evData.cmd).toContain("‹heredoc: 200 líneas›");
    expect(evData.cmdLen).toBe(evData.cmd.length);
    expect(evData.cmd.length).toBeLessThan(CMD_MAX);

    const interpCmd = `python3 - <<'EOF'\nprint("hello-from-stdin")\nEOF`;
    const evInterp = buildEvent(
      normalize({ tool_name: "Bash", tool_input: { command: interpCmd }, session_id: "s-hd" }),
      { allowed: true },
    );
    expect(evInterp.cmd).toContain("hello-from-stdin");
    expect(evInterp.cmd).not.toContain("‹heredoc:");
  });

  it("C1: summarize usa la primera escritura permitida tanto para TTFE como para callsBeforeFirstEdit", () => {
    const t0 = Date.parse("2026-11-24T19:00:00.000Z");
    const ts = (sec: number) => new Date(t0 + sec * 1000).toISOString();
    const evs = [
      { v: 3, ts: ts(0), session: "s-c1", runtime: "claude-code", phase: "pre", kind: "read", decision: "allow", cmd: "a.ts" },
      { v: 3, ts: ts(10), session: "s-c1", runtime: "claude-code", phase: "pre", kind: "write", decision: "block", rule: "fs.protected", cmd: ".claude/settings.json" },
      { v: 3, ts: ts(50), session: "s-c1", runtime: "claude-code", phase: "pre", kind: "read", decision: "allow", cmd: "b.ts" },
      { v: 3, ts: ts(100), session: "s-c1", runtime: "claude-code", phase: "pre", kind: "write", decision: "allow", cmd: "src/ok.ts" },
    ];
    const sum = summarize(evs);
    expect(sum.timeToFirstEdit.count).toBe(1);
    expect(sum.timeToFirstEdit.medianMs).toBe(100_000);
    expect(sum.callsBeforeFirstEdit.p50).toBe(3);
  });

  it("C6: --min-schema 3 conserva solo sesiones cuyos eventos tienen v >= 3", () => {
    const t0 = Date.parse("2026-11-24T20:00:00.000Z");
    const ts = (sec: number) => new Date(t0 + sec * 1000).toISOString();
    const evs = [
      { v: 2, ts: ts(0), session: "s-v2", runtime: "claude-code", phase: "pre", kind: "read", decision: "allow", cmd: "a.ts" },
      { v: 2, ts: ts(1), session: "s-mix", runtime: "claude-code", phase: "pre", kind: "read", decision: "allow", cmd: "a.ts" },
      { v: 3, ts: ts(2), session: "s-mix", runtime: "claude-code", phase: "pre", kind: "read", decision: "allow", cmd: "b.ts" },
      { v: 3, ts: ts(3), session: "s-v3", runtime: "claude-code", phase: "pre", kind: "read", decision: "allow", cmd: "c.ts" },
    ];
    const sum = summarize(evs, { minSchema: 3 });
    expect(sum.totalSessions).toBe(1);
    expect(sum.totalActions).toBe(1);

    const parsed = parseCliArgs(["--min-schema", "3", "--gate-min-sec", "45"]);
    expect(parsed.minSchema).toBe(3);
    expect(parsed.gateMinSec).toBe(45);
  });
});
