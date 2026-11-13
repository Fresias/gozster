import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// H-09 — Subagentes `schema-inspector` (adapter supabase) y `trace-auditor` (core).
// Verifica el contenido fuente y la materialización por runtime con frontmatter traducido.

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..");
const repoRoot = path.resolve(kitDir, "..");
const renderScript = path.join(kitDir, "core", "scripts", "harness-render.mjs");

const traceSource = path.join(kitDir, "core", "subagents", "trace-auditor.md");
const schemaSource = path.join(kitDir, "adapters", "supabase", "subagents", "schema-inspector.md");

/** Devuelve las claves del primer bloque de frontmatter de un `.md`. */
function frontmatterKeys(content: string): string[] {
  const m = content.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---/);
  if (!m) return [];
  return (m[1] ?? "")
    .split("\n")
    .map((l) => l.match(/^(\w+):/)?.[1])
    .filter((k): k is string => Boolean(k));
}

describe("H-09: subagentes fuente", () => {
  it("trace-auditor (core) declara name/description y es agnóstico del proyecto", () => {
    const body = readFileSync(traceSource, "utf8");
    expect(frontmatterKeys(body)).toEqual(expect.arrayContaining(["name", "description"]));
    const lower = body.toLowerCase();
    expect(lower).not.toContain("gozster");
    expect(lower).not.toContain("supabase");
  });

  it("trace-auditor define el bloque [ERROR] con archivo:línea", () => {
    const body = readFileSync(traceSource, "utf8");
    expect(body).toContain("[ERROR]");
    expect(body).toContain("archivo");
    expect(body).toContain("línea");
  });

  it("schema-inspector declara el formato §7.3, ≤30 líneas y la migración más reciente", () => {
    const body = readFileSync(schemaSource, "utf8");
    expect(frontmatterKeys(body)).toEqual(expect.arrayContaining(["name", "description"]));
    expect(body).toContain("§7.3");
    expect(body).toContain("30 líneas");
    expect(body.toLowerCase()).toContain("más reciente");
    expect(body).toContain("supabase/migrations/");
  });
});

describe("H-09: materialización por runtime (frontmatter traducido)", () => {
  let workspace: string | undefined;

  afterEach(() => {
    if (workspace && existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
    workspace = undefined;
  });

  function renderTemp(): string {
    workspace = mkdtempSync(path.join(tmpdir(), "harness-subagents-"));
    const overlay = path.join(workspace, "harness");
    mkdirSync(overlay, { recursive: true });
    writeFileSync(
      path.join(overlay, "harness.json"),
      JSON.stringify({ kit: "harness-kit", version: "2.0.0", out: ".harness" }),
    );
    writeFileSync(
      path.join(overlay, "project.json"),
      JSON.stringify({
        name: "demo",
        runtimes: ["antigravity", "claude-code", "gemini-cli", "opencode"],
        adapters: ["supabase"],
        gate: "npm test",
      }),
    );
    execFileSync(process.execPath, [renderScript, overlay], { stdio: ["ignore", "pipe", "pipe"] });
    return workspace;
  }

  const dirs: Record<string, string> = {
    "claude-code": ".claude/agents",
    "gemini-cli": ".gemini/agents",
    "opencode": ".opencode/agents",
    "antigravity": ".agents/agents",
  };

  it("materializa ambos subagentes en los 4 runtimes", () => {
    const ws = renderTemp();
    for (const dir of Object.values(dirs)) {
      expect(existsSync(path.join(ws, dir, "schema-inspector.md")), `${dir}/schema-inspector.md`).toBe(true);
      expect(existsSync(path.join(ws, dir, "trace-auditor.md")), `${dir}/trace-auditor.md`).toBe(true);
    }
  });

  it("claude-code, gemini-cli y antigravity traducen a name+description", () => {
    const ws = renderTemp();
    for (const rt of ["claude-code", "gemini-cli", "antigravity"] as const) {
      const content = readFileSync(path.join(ws, dirs[rt]!, "schema-inspector.md"), "utf8");
      expect(frontmatterKeys(content), rt).toEqual(["name", "description"]);
    }
  });

  it("gemini-cli (strict) no emite claves fuera de la lista cerrada", () => {
    const ws = renderTemp();
    const content = readFileSync(path.join(ws, dirs["gemini-cli"]!, "trace-auditor.md"), "utf8");
    // zod .strict: cualquier clave desconocida rompería el runtime. Solo name+description.
    expect(frontmatterKeys(content)).toEqual(["name", "description"]);
  });

  it("opencode omite name (deriva del archivo) y marca mode: subagent", () => {
    const ws = renderTemp();
    const content = readFileSync(path.join(ws, dirs["opencode"]!, "schema-inspector.md"), "utf8");
    const keys = frontmatterKeys(content);
    expect(keys).not.toContain("name");
    expect(keys).toEqual(expect.arrayContaining(["description", "mode"]));
    expect(content).toContain('mode: "subagent"');
  });
});

describe("H-09: wiring del repo (GOZSter)", () => {
  it("el repo materializó schema-inspector para opencode con mode: subagent", () => {
    const content = readFileSync(path.join(repoRoot, ".opencode", "agents", "schema-inspector.md"), "utf8");
    expect(content).toContain('mode: "subagent"');
    expect(frontmatterKeys(content)).not.toContain("name");
  });

  it("subagent.md.tmpl declara frontmatter name y description", () => {
    const tmplPath = path.join(kitDir, "core", "templates", "subagent.md.tmpl");
    expect(existsSync(tmplPath)).toBe(true);
    const content = readFileSync(tmplPath, "utf8");
    expect(content).toContain("name: {subagent_name}");
    expect(content).toContain("description: {subagent_description}");
  });
});
