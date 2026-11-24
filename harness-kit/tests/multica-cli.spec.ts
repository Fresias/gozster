import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const ctxScript = path.resolve(here, "..", "adapters", "multica", "scripts", "multica-ctx.mjs");
const postScript = path.resolve(here, "..", "adapters", "multica", "scripts", "multica-post.mjs");

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

interface StubConfig {
  issue?: Record<string, unknown>;
  roots?: Array<Record<string, unknown>>;
  threads?: Record<string, Array<Record<string, unknown>>>;
  children?: Record<string, unknown> | Array<Record<string, unknown>>;
  pullRequests?: Record<string, unknown> | Array<Record<string, unknown>>;
  agents?: Array<Record<string, unknown>>;
  issuesList?: Array<Record<string, unknown>>;
  searchResults?: Array<Record<string, unknown>>;
  commentAddId?: string;
  failSubcommands?: Record<string, { times: number; code?: number; stderr?: string }>;
}

function createStubEnv(config: StubConfig): {
  dir: string;
  stubPath: string;
  logPath: string;
  readCalls: () => string[][];
} {
  const dir = makeTempDir("multica-cli-stub-");
  // Initialize a minimal git repo so `git rev-parse --git-common-dir` points to `<dir>/.git`.
  execFileSync("git", ["init"], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });

  const configPath = path.join(dir, "stub-config.json");
  const logPath = path.join(dir, "stub-calls.jsonl");
  const statePath = path.join(dir, "stub-state.json");
  const stubPath = path.join(dir, "multica-stub.mjs");

  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  writeFileSync(statePath, JSON.stringify({ counts: {} }), "utf8");

  const stubSource = `import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(${JSON.stringify(configPath)}, "utf8"));
const state = JSON.parse(readFileSync(${JSON.stringify(statePath)}, "utf8"));
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(args) + "\\n", "utf8");

const key3 = args.slice(0, 3).join(" ");
const key2 = args.slice(0, 2).join(" ");
const failRule = cfg.failSubcommands?.[key3] ?? cfg.failSubcommands?.[key2];
if (failRule) {
  const seen = (state.counts[key3] ?? 0) + 1;
  state.counts[key3] = seen;
  writeFileSync(${JSON.stringify(statePath)}, JSON.stringify(state), "utf8");
  if (seen <= failRule.times) {
    process.stderr.write((failRule.stderr ?? "simulated CLI failure") + "\\n");
    process.exit(failRule.code ?? 1);
  }
}

if (args[0] === "issue" && args[1] === "get") {
  process.stdout.write(JSON.stringify(cfg.issue ?? {}));
  process.exit(0);
}
if (args[0] === "issue" && args[1] === "comment" && args[2] === "list") {
  const threadIdx = args.indexOf("--thread");
  if (threadIdx !== -1) {
    const tid = args[threadIdx + 1];
    process.stdout.write(JSON.stringify(cfg.threads?.[tid] ?? []));
    process.exit(0);
  }
  process.stdout.write(JSON.stringify(cfg.roots ?? []));
  process.exit(0);
}
if (args[0] === "issue" && args[1] === "children") {
  process.stdout.write(JSON.stringify(cfg.children ?? { stages: [], total: 0, unstaged: [] }));
  process.exit(0);
}
if (args[0] === "issue" && args[1] === "pull-requests") {
  process.stdout.write(JSON.stringify(cfg.pullRequests ?? { pull_requests: [] }));
  process.exit(0);
}
if (args[0] === "agent" && args[1] === "list") {
  process.stdout.write(JSON.stringify(cfg.agents ?? []));
  process.exit(0);
}
if (args[0] === "issue" && args[1] === "list") {
  process.stdout.write(JSON.stringify(cfg.issuesList ?? []));
  process.exit(0);
}
if (args[0] === "issue" && args[1] === "search") {
  process.stdout.write(JSON.stringify(cfg.searchResults ?? []));
  process.exit(0);
}
if (args[0] === "issue" && args[1] === "comment" && args[2] === "add") {
  process.stderr.write("Comment posted (warning on stderr must not break JSON)\\n");
  process.stdout.write(JSON.stringify({ id: cfg.commentAddId ?? "c0000001-0000-4000-8000-000000000001" }));
  process.exit(0);
}
if (args[0] === "issue" && args[1] === "status") {
  process.stdout.write("Issue status changed.\\n");
  process.exit(0);
}
process.stderr.write("Unexpected stub args: " + args.join(" ") + "\\n");
process.exit(2);
`;

  writeFileSync(stubPath, stubSource, "utf8");

  return {
    dir,
    stubPath,
    logPath,
    readCalls: () => {
      if (!existsSync(logPath)) return [];
      return readFileSync(logPath, "utf8")
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as string[]);
    },
  };
}

function runScript(
  scriptPath: string,
  args: string[],
  cwd: string,
  stubPath: string,
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MULTICA_CLI_PATH: stubPath },
    });
    return { code: 0, stdout: stdout.replace(/\r\n/g, "\n").trimEnd(), stderr: "" };
  } catch (err) {
    const e = err as { status?: number | null; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      code: typeof e.status === "number" ? e.status : 1,
      stdout: (e.stdout ? e.stdout.toString() : "").replace(/\r\n/g, "\n").trimEnd(),
      stderr: (e.stderr ? e.stderr.toString() : "").replace(/\r\n/g, "\n").trimEnd(),
    };
  }
}

describe("multica-ctx.mjs", () => {
  it("GIVEN un issue con 30 comentarios WHEN corre multica-ctx THEN la salida tiene <= 120 líneas, incluye raíces y último hilo en una sola invocación", () => {
    const roots = Array.from({ length: 15 }, (_, idx) => {
      const n = idx + 1;
      const ts = `2026-11-23T10:${String(n).padStart(2, "0")}:00Z`;
      return {
        id: `root-${String(n).padStart(2, "0")}`,
        author_id: "agent-pm",
        author_type: "agent",
        content: `Root comment #${n} summary text`,
        created_at: ts,
        last_activity_at: ts,
        reply_count: n === 15 ? 15 : 1,
      };
    });

    const latestThreadEntries = Array.from({ length: 15 }, (_, idx) => {
      const n = idx + 1;
      return {
        id: `entry-${String(n).padStart(2, "0")}`,
        parent_id: n === 1 ? null : "root-15",
        author_id: "agent-qa",
        author_type: "agent",
        content: `Thread entry #${n} detail line`,
        created_at: `2026-11-23T11:${String(n).padStart(2, "0")}:00Z`,
      };
    });

    const longDesc = Array.from({ length: 60 }, (_, idx) => `Description line ${idx + 1}`).join("\n");

    const env = createStubEnv({
      issue: {
        id: "iss-772",
        identifier: "GOZS-772",
        title: "CLI de Multica",
        status: "in_progress",
        assignee_id: "agent-backend",
        assignee_type: "agent",
        priority: "high",
        description: longDesc,
      },
      roots,
      threads: {
        "root-15": latestThreadEntries,
        "root-07": [
          {
            id: "entry-custom",
            parent_id: null,
            author_id: "agent-pm",
            author_type: "agent",
            content: "Specific thread root-07 content",
            created_at: "2026-11-23T10:07:00Z",
          },
        ],
      },
      children: {
        stages: [
          {
            stage: 1,
            issues: [
              { id: "c1", identifier: "GOZS-780", title: "Subtask 1", status: "done" },
              { id: "c2", identifier: "GOZS-781", title: "Subtask 2", status: "in_progress" },
            ],
          },
        ],
        total: 2,
        unstaged: [],
      },
      pullRequests: {
        pull_requests: [
          { id: "pr-1", number: 641, state: "open", title: "chore(harness): multica cli", url: "https://github.com/Fresias/gozster/pull/641" },
        ],
      },
    });

    const res = runScript(ctxScript, ["GOZS-772"], env.dir, env.stubPath);
    expect(res.code).toBe(0);

    const lines = res.stdout.split("\n");
    expect(lines.length).toBeLessThanOrEqual(120);
    expect(res.stdout).toContain("ISSUE: GOZS-772 [in_progress] CLI de Multica");
    expect(res.stdout).toContain("DESCRIPTION (first 40 of 60 lines):");
    expect(res.stdout).toContain("Description line 40");
    expect(res.stdout).not.toContain("Description line 41");
    expect(res.stdout).toContain("ROOTS (10/15):");
    expect(res.stdout).toContain("root-15");
    expect(res.stdout).not.toContain("root-01");
    expect(res.stdout).toContain("THREAD root-15 (10/15):");
    expect(res.stdout).toContain("entry-15");
    expect(res.stdout).not.toContain("entry-01");
    expect(res.stdout).toContain("GOZS-780 [done stage:1]");
    expect(res.stdout).toContain("#641 [open]");

    // Verify bounded subcommands were called with expected flags.
    const calls = env.readCalls();
    expect(calls.some((c) => c.includes("--roots-only") && c.includes("--summary") && c.includes("--compact"))).toBe(true);
    expect(calls.some((c) => c.includes("--thread") && c.includes("root-15") && c.includes("--tail") && c.includes("10"))).toBe(true);

    // Explicit --thread selects that thread, and --json returns bounded JSON.
    const jsonRes = runScript(ctxScript, ["GOZS-772", "--thread", "root-07", "--json"], env.dir, env.stubPath);
    expect(jsonRes.code).toBe(0);
    const parsed = JSON.parse(jsonRes.stdout) as {
      issue: { description_truncated: boolean; description: string };
      roots: { total: number; showing: number };
      thread: { id: string; items: Array<{ content: string }> };
    };
    expect(parsed.issue.description_truncated).toBe(true);
    expect(parsed.issue.description.split("\n").length).toBe(40);
    expect(parsed.roots.total).toBe(15);
    expect(parsed.roots.showing).toBe(10);
    expect(parsed.thread.id).toBe("root-07");
    expect(parsed.thread.items[0]?.content).toContain("Specific thread root-07 content");
  });

  it("GIVEN una caché de agentes de menos de 24 h WHEN corre multica-ctx --agents THEN no se invoca el CLI", () => {
    const env = createStubEnv({
      agents: [
        { id: "a1", name: "PM-GOZster", description: "Product Manager de GOZSter. Detalle extra.", status: "idle" },
        { id: "a2", name: "backend-eng", description: "Backend & DB Engineer", status: "running" },
      ],
    });

    // First call populates cache under <git-common-dir>/harness/cache/multica-agents.json
    const first = runScript(ctxScript, ["--agents"], env.dir, env.stubPath);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("PM-GOZster");
    expect(first.stdout).toContain("backend-eng");
    expect(first.stdout).toContain("[refreshed");
    expect(env.readCalls()).toHaveLength(1);

    const cachePath = path.join(env.dir, ".git", "harness", "cache", "multica-agents.json");
    expect(existsSync(cachePath)).toBe(true);

    // Second call within 24h must NOT invoke the CLI.
    const second = runScript(ctxScript, ["--agents"], env.dir, env.stubPath);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain("[cached");
    expect(second.stdout).toContain("PM-GOZster");
    expect(env.readCalls()).toHaveLength(1);

    // --refresh forces a CLI call.
    const refreshed = runScript(ctxScript, ["--agents", "--refresh"], env.dir, env.stubPath);
    expect(refreshed.code).toBe(0);
    expect(refreshed.stdout).toContain("[refreshed");
    expect(env.readCalls()).toHaveLength(2);

    // Expired cache (> 24h) refreshes automatically.
    const oldCache = JSON.parse(readFileSync(cachePath, "utf8")) as { cached_at: string; agents: unknown[] };
    oldCache.cached_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    writeFileSync(cachePath, JSON.stringify(oldCache), "utf8");

    const afterExpiry = runScript(ctxScript, ["--agents"], env.dir, env.stubPath);
    expect(afterExpiry.code).toBe(0);
    expect(afterExpiry.stdout).toContain("[refreshed");
    expect(env.readCalls()).toHaveLength(3);
  });

  it("GIVEN un listado WHEN el script consulta el CLI THEN siempre pasa --limit <= 15 (y --search exige --project)", () => {
    const env = createStubEnv({
      issuesList: [
        { id: "i1", identifier: "GOZS-772", status: "in_progress", priority: "high", title: "CLI Multica" },
      ],
      searchResults: [
        { id: "i2", identifier: "GOZS-765", status: "in_progress", match_source: "title", title: "EPIC L-002" },
      ],
    });

    // Even when requesting --limit 50, the CLI receives --limit 15.
    const listRes = runScript(ctxScript, ["--list", "--limit", "50", "--status", "in_progress"], env.dir, env.stubPath);
    expect(listRes.code).toBe(0);
    expect(listRes.stdout).toContain("GOZS-772");

    // Default --list also passes --limit 15.
    const listDefault = runScript(ctxScript, ["--list"], env.dir, env.stubPath);
    expect(listDefault.code).toBe(0);

    // --search without --project fails before invoking CLI.
    const badSearch = runScript(ctxScript, ["--search", "L-002"], env.dir, env.stubPath);
    expect(badSearch.code).not.toBe(0);
    expect(badSearch.stderr).toContain("--project");

    // --search with --project and --limit 30 clamps to 15.
    const goodSearch = runScript(ctxScript, ["--search", "L-002", "--project", "proj-1", "--limit", "30"], env.dir, env.stubPath);
    expect(goodSearch.code).toBe(0);
    expect(goodSearch.stdout).toContain("GOZS-765");

    const calls = env.readCalls();
    expect(calls).toHaveLength(3);
    for (const args of calls) {
      const limitIdx = args.indexOf("--limit");
      expect(limitIdx).toBeGreaterThan(-1);
      expect(Number(args[limitIdx + 1])).toBeLessThanOrEqual(15);
      expect(Number(args[limitIdx + 1])).toBeGreaterThanOrEqual(1);
    }
  });

  it("GIVEN --help THEN sale con código 0 y documenta --max-lines; GIVEN fallo del CLI THEN reintenta máximo 2 veces y falla con código != 0", () => {
    const env = createStubEnv({
      failSubcommands: {
        "issue get": { times: 5, code: 1, stderr: "network timeout" },
      },
    });

    const helpRes = runScript(ctxScript, ["--help"], env.dir, env.stubPath);
    expect(helpRes.code).toBe(0);
    expect(helpRes.stdout).toContain("--max-lines");

    const failRes = runScript(ctxScript, ["GOZS-772"], env.dir, env.stubPath);
    expect(failRes.code).not.toBe(0);
    expect(failRes.stderr).toContain("network timeout");
    expect(env.readCalls()).toHaveLength(2);
  });
});

describe("multica-post.mjs", () => {
  it("GIVEN un archivo con BOM WHEN corre multica-post THEN falla sin publicar y explica por qué", () => {
    const env = createStubEnv({});
    const bomFile = path.join(env.dir, "reply-bom.md");
    writeFileSync(bomFile, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Hola con BOM\n", "utf8")]));

    const res = runScript(postScript, ["GOZS-772", "--file", bomFile], env.dir, env.stubPath);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toMatch(/BOM/i);
    expect(env.readCalls()).toHaveLength(0);
    expect(existsSync(bomFile)).toBe(true);
  });

  it("GIVEN un archivo con U+FFFD WHEN corre multica-post THEN falla sin publicar y explica por qué", () => {
    const env = createStubEnv({});
    const corruptFile = path.join(env.dir, "reply-fffd.md");
    writeFileSync(corruptFile, "Texto corrupto \uFFFD aquí\n", "utf8");

    const res = runScript(postScript, ["GOZS-772", "--file", corruptFile], env.dir, env.stubPath);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("U+FFFD");
    expect(env.readCalls()).toHaveLength(0);
    expect(existsSync(corruptFile)).toBe(true);
  });

  it("GIVEN una publicación exitosa WHEN termina multica-post THEN el archivo se borró y se imprimió el id del comentario", () => {
    const commentId = "01a20b99-1111-7222-8333-444455556666";
    const env = createStubEnv({ commentAddId: commentId });
    const file = path.join(env.dir, "reply.md");
    writeFileSync(file, "Entrega limpia en español: áéíóú ñ.\n", "utf8");

    const res = runScript(postScript, ["GOZS-772", "--file", "reply.md"], env.dir, env.stubPath);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain(commentId);
    expect(existsSync(file)).toBe(false);

    const calls = env.readCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["issue", "comment", "add", "GOZS-772", "--content-file", "reply.md", "--output", "json"]);
  });

  it("GIVEN --status in_review y --parent WHEN corre multica-post THEN publica el comentario y cambia el estado en una sola invocación", () => {
    const commentId = "01a20b99-aaaa-7bbb-8ccc-ddddeeeeffff";
    const env = createStubEnv({ commentAddId: commentId });
    const file = path.join(env.dir, "handoff.md");
    writeFileSync(file, "PR abierto y listo para QA.\n", "utf8");

    const res = runScript(
      postScript,
      ["GOZS-772", "--file", "handoff.md", "--parent", "root-01", "--status", "in_review"],
      env.dir,
      env.stubPath,
    );
    expect(res.code).toBe(0);
    expect(res.stdout).toContain(commentId);
    expect(res.stdout).toContain("in_review");
    expect(existsSync(file)).toBe(false);

    const calls = env.readCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      "issue",
      "comment",
      "add",
      "GOZS-772",
      "--content-file",
      "handoff.md",
      "--output",
      "json",
      "--parent",
      "root-01",
    ]);
    expect(calls[1]).toEqual(["issue", "status", "GOZS-772", "in_review"]);
  });

  it("GIVEN --keep THEN conserva el archivo tras publicar; GIVEN fallo transitorio en intento 1 THEN reintenta una vez y completa", () => {
    const commentId = "01a20b99-9999-7888-8777-666655554444";
    const env = createStubEnv({
      commentAddId: commentId,
      failSubcommands: {
        "issue comment add": { times: 1, code: 1, stderr: "temporary 503" },
      },
    });
    const file = path.join(env.dir, "keep-me.md");
    writeFileSync(file, "Contenido preservado.\n", "utf8");

    const res = runScript(postScript, ["GOZS-772", "--file", "keep-me.md", "--keep", "--json"], env.dir, env.stubPath);
    expect(res.code).toBe(0);
    const parsed = JSON.parse(res.stdout) as { ok: boolean; comment_id: string; file_deleted: boolean };
    expect(parsed.ok).toBe(true);
    expect(parsed.comment_id).toBe(commentId);
    expect(parsed.file_deleted).toBe(false);
    expect(existsSync(file)).toBe(true);
    expect(env.readCalls()).toHaveLength(2);
  });

  it("GIVEN fallo persistente del CLI THEN reintenta máximo 2 veces, falla con código != 0 y conserva el archivo", () => {
    const env = createStubEnv({
      failSubcommands: {
        "issue comment add": { times: 5, code: 1, stderr: "server down" },
      },
    });
    const file = path.join(env.dir, "failed.md");
    writeFileSync(file, "No borrar si falla.\n", "utf8");

    const res = runScript(postScript, ["GOZS-772", "--file", "failed.md"], env.dir, env.stubPath);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("server down");
    expect(existsSync(file)).toBe(true);
    expect(env.readCalls()).toHaveLength(2);
  });
});

describe("Integración tool_guidance + harness-tools + AGENTS.md (GOZS-772)", () => {
  it("harness-tools renderizado incluye la sección Multica con multica-ctx y multica-post", () => {
    for (const rel of [
      ".claude/skills/harness-tools/SKILL.md",
      ".agents/skills/harness-tools/SKILL.md",
    ]) {
      const content = readFileSync(path.join(repoRoot, rel), "utf8");
      expect(content, rel).toContain("## Multica");
      expect(content, rel).toContain("multica-ctx.mjs");
      expect(content, rel).toContain("multica-post.mjs");
    }
  });

  it("AGENTS.md reduce su tamaño tras condensar tool_guidance.md manteniendo presupuesto <= 8000 y < 150 líneas", () => {
    const agents = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8").replace(/\r\n/g, "\n");
    expect(agents.length).toBeLessThanOrEqual(5200);
    expect(agents.split("\n").length).toBeLessThan(150);
    expect(agents).toContain("harness-tools");
    expect(agents).toContain("multica-ctx.mjs");
    expect(agents).toContain("multica-post.mjs");
  });
});
