import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error - mjs module
import { normalize } from "../core/guard/normalize.mjs";
// @ts-expect-error - mjs module
import { buildEvent, CMD_MAX, recordEvent, redactCmd, redactSecrets, relativizeForTelemetry, resolveSession, resolveTelemetryDir, sanitizePreview, stripAnsi } from "../core/guard/telemetry.mjs";
// @ts-expect-error - mjs module
import { evaluatePpcTrigger, filterEvents, formatSummary, isExcludedEvent, parseJsonl, percentile, summarize } from "../core/scripts/harness-telemetry.mjs";

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

  it("colapsa espacios y trunca a 300 caracteres (CMD_MAX)", () => {
    expect(CMD_MAX).toBe(300);
    expect(redactCmd("a\n   b")).toBe("a b");
    const ok250 = "x".repeat(250);
    expect(redactCmd(ok250)).toBe(ok250);
    expect(redactCmd(ok250).length).toBe(250);
    const long = "x".repeat(400);
    expect(redactCmd(long).length).toBe(300);
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

    it("GIVEN un token ubicado en la posición 280 o más allá de 300 WHEN se redacta y trunca THEN el token sale redactado y nunca recortado a la mitad", () => {
      const prefix280 = "echo " + "z".repeat(274) + " ";
      const token = "ghp_VERYLONGSECRETTOKEN12345678901234";
      const out280 = redactCmd(prefix280 + token);
      expect(out280).toContain("gh*_[REDACTED]");
      expect(out280).not.toContain("VERYLONG");
      expect(out280).not.toContain("ghp_");
      expect(out280.length).toBeLessThanOrEqual(300);

      const prefix305 = "echo " + "z".repeat(300) + " ";
      const out305 = redactCmd(prefix305 + token);
      expect(out305).not.toContain("VERYLONG");
      expect(out305).not.toContain("ghp_");
      expect(out305.length).toBeLessThanOrEqual(300);
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
    expect(summary.actionsByKind).toEqual({ shell: 1 });
  });
});
