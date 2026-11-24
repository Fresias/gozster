import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error - mjs module
import { main, resolveIssueKey, titleKeywords } from "../core/scripts/harness-context.mjs";

const PROJECT = { issue_prefix: "GOZS" };
const NOW = Date.parse("2026-11-24T12:00:00Z");

function makeRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), "harness-context-"));
  mkdirSync(path.join(root, "harness", "experience"), { recursive: true });
  mkdirSync(path.join(root, "supabase", "migrations"), { recursive: true });
  writeFileSync(path.join(root, "supabase", "migrations", "20261101000000_a.sql"), "-- a\n");
  writeFileSync(path.join(root, "supabase", "migrations", "20261120000000_b.sql"), "-- b\n");
  writeFileSync(
    path.join(root, "harness", "experience", "GOZS-701.jsonl"),
    JSON.stringify({ task: "GOZS-701", timestamp: "2026-11-20T00:00:00Z", lesson: "Lección propia del 701", tags: [] }) + "\n",
  );
  writeFileSync(
    path.join(root, "harness", "experience", "GOZS-500.jsonl"),
    [
      { task: "GOZS-500", timestamp: "2026-11-10T00:00:00Z", lesson: "Las alertas-dolor usan vínculo único", tags: [] },
      { task: "GOZS-500", timestamp: "2026-11-11T00:00:00Z", lesson: "Nada relacionado", tags: [] },
    ]
      .map((r) => JSON.stringify(r))
      .join("\n") + "\n",
  );
  return root;
}

function fakeGit(branch: string, calls: string[][] = []) {
  return (args: string[]) => {
    calls.push(args);
    const cmd = args.join(" ");
    if (cmd === "rev-parse --abbrev-ref HEAD") return branch;
    if (cmd === "status -sb") return `## ${branch}...origin/${branch}\n M src/x.ts`;
    if (cmd === "rev-parse --git-common-dir") return ".git";
    if (cmd.startsWith("fetch")) return "";
    if (cmd === "rev-list --left-right --count origin/main...HEAD") return "1\t2";
    if (cmd === "merge-base origin/main HEAD") return "abc123";
    if (cmd === "diff --stat abc123") return " src/x.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)";
    throw new Error(`unexpected git ${cmd}`);
  };
}

function issueCtx(identifier: string, title: string) {
  return {
    issue: {
      id: "uuid-1",
      identifier,
      title,
      status: "in_progress",
      assignee: "@backend-eng",
      priority: "high",
      parent_issue_id: null,
      description_lines_total: 2,
      description: "Línea 1\nLínea 2",
    },
    roots: { total: 1, showing: 1, items: [] },
    thread: { id: "c1", total: 1, showing: 1, items: [{ id: "c1", author: "@pm", content: "Arrancá", parent_id: null }] },
    children: { total: 0, items: [] },
    pull_requests: [],
  };
}

function run(argv: string[], deps: Record<string, unknown>) {
  let out = "";
  let err = "";
  return main(argv, {
    project: PROJECT,
    now: () => NOW,
    statMtimeMs: () => NOW - 60_000,
    writeStdout: (s: string) => (out += s),
    writeStderr: (s: string) => (err += s),
    ...deps,
  }).then((res: { exitCode: number; sections: Record<string, any> }) => ({ ...res, out, err }));
}

describe("GOZS-782: harness-context.mjs", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeRepo();
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("GIVEN la rama feature/701-x sin PR WHEN corre THEN ≤ 150 líneas con rama, issue GOZS-701, lecciones, migración y «sin PR»", async () => {
    const fetched: string[] = [];
    const res = await run([], {
      repoRoot: repo,
      runGit: fakeGit("feature/701-x"),
      fetchIssue: async (key: string) => {
        fetched.push(key);
        return issueCtx(key, "Alertas-dolor con vínculo único");
      },
      runPrStatus: async () => ({
        exitCode: 1,
        data: null,
        text: "",
        stderr: '[harness-pr-status error] No se pudo consultar la PR: no pull requests found for branch "feature/701-x"\n',
      }),
    });

    expect(res.exitCode).toBe(0);
    expect(fetched).toEqual(["GOZS-701"]);
    const lines = res.out.trimEnd().split("\n");
    expect(lines.length).toBeLessThanOrEqual(150);
    expect(res.out).toContain("== Rama ==");
    expect(res.out).toContain("## feature/701-x");
    expect(res.out).toContain("vs origin/main: 2 adelante, 1 atrás");
    expect(res.out).toContain("== Issue (GOZS-701) ==");
    expect(res.out).toContain("GOZS-701 [in_progress] Alertas-dolor con vínculo único");
    expect(res.out).toContain("- GOZS-701: Lección propia del 701");
    expect(res.out).toContain("- GOZS-500: Las alertas-dolor usan vínculo único");
    expect(res.out).not.toContain("Nada relacionado");
    expect(res.out).toContain("supabase/migrations/20261120000000_b.sql");
    expect(res.out).toMatch(/== PR ==\nsin PR para esta rama/);
    // Lección propia primero.
    expect(res.out.indexOf("GOZS-701: Lección")).toBeLessThan(res.out.indexOf("GOZS-500:"));
  });

  it("GIVEN una rama con PR WHEN corre THEN incluye el resumen de pr-status con su «Próximo paso»", async () => {
    const prText = "PR #900 [OPEN] chore/782-harness-context\nSello: OK\nPróximo paso: pedir la etiqueta harness-authorized\n";
    const res = await run([], {
      repoRoot: repo,
      runGit: fakeGit("chore/782-harness-context"),
      fetchIssue: async (key: string) => issueCtx(key, "Orientación inicial"),
      runPrStatus: async () => ({ exitCode: 0, data: { next: "pedir la etiqueta harness-authorized" }, text: prText, stderr: "" }),
    });
    expect(res.exitCode).toBe(0);
    expect(res.out).toContain("== Issue (GOZS-782) ==");
    expect(res.out).toContain("PR #900 [OPEN]");
    expect(res.out).toContain("Próximo paso: pedir la etiqueta harness-authorized");
  });

  it("GIVEN que no está disponible el CLI de Multica WHEN corre THEN termina con código 0 y la sección del issue indica qué falta", async () => {
    const res = await run([], {
      repoRoot: repo,
      runGit: fakeGit("feature/701-x"),
      fetchIssue: async () => {
        throw new Error("spawn multica ENOENT");
      },
      runPrStatus: async () => ({ exitCode: 1, data: null, text: "", stderr: "[harness-pr-status error] gh: command not found" }),
    });
    expect(res.exitCode).toBe(0);
    expect(res.out).toMatch(/== Issue \(GOZS-701\) ==\nGOZS-701: CLI de Multica no disponible \(spawn multica ENOENT\)/);
    expect(res.out).toMatch(/== PR ==\ngh no disponible o sin red: gh: command not found/);
    expect(res.sections.issue.status).toBe("missing");
  });

  it("GIVEN que multica-ctx o harness-pr-status no existen WHEN corre THEN sigue sin esas secciones", async () => {
    const res = await run([], { repoRoot: repo, runGit: fakeGit("feature/701-x"), fetchIssue: null, runPrStatus: null });
    expect(res.exitCode).toBe(0);
    expect(res.out).toContain("GOZS-701: multica-ctx no está instalado");
    expect(res.out).toContain("harness-pr-status no está instalado");
  });

  it("GIVEN --json WHEN corre THEN devuelve un objeto con una clave por sección", async () => {
    const res = await run(["--json"], {
      repoRoot: repo,
      runGit: fakeGit("feature/701-x"),
      fetchIssue: async (key: string) => issueCtx(key, "Algo"),
      runPrStatus: async () => ({ exitCode: 1, data: null, text: "", stderr: "no pull requests found" }),
    });
    const obj = JSON.parse(res.out);
    expect(Object.keys(obj)).toEqual(["rama", "issue", "pr", "lecciones", "migraciones", "scope"]);
    expect(obj.issue.key).toBe("GOZS-701");
    expect(obj.pr.status).toBe("none");
    expect(obj.migraciones.latest).toBe("20261120000000_b.sql");
  });

  it("no repite git fetch si FETCH_HEAD tiene < 10 min y lo hace si es más viejo", async () => {
    const fresh: string[][] = [];
    await run([], { repoRoot: repo, runGit: fakeGit("feature/701-x", fresh), fetchIssue: null, runPrStatus: null });
    expect(fresh.some((a) => a[0] === "fetch")).toBe(false);

    const stale: string[][] = [];
    await run([], {
      repoRoot: repo,
      runGit: fakeGit("feature/701-x", stale),
      statMtimeMs: () => NOW - 11 * 60_000,
      fetchIssue: null,
      runPrStatus: null,
    });
    expect(stale.some((a) => a[0] === "fetch")).toBe(true);
  });

  it("sin git ni issue en la rama degrada a una línea por sección y respeta --max-lines", async () => {
    const res = await run(["--max-lines", "10"], {
      repoRoot: repo,
      runGit: () => {
        throw new Error("git: not found");
      },
      fetchIssue: null,
      runPrStatus: null,
    });
    expect(res.exitCode).toBe(0);
    expect(res.out).toContain("git no disponible: git: not found");
    expect(res.out).toContain("sin issue: la rama no tiene número; usá --issue <id>");
    expect(res.out.trimEnd().split("\n").length).toBeLessThanOrEqual(10);
  });

  it("muestra .harness/scope.json si existe", async () => {
    mkdirSync(path.join(repo, ".harness"), { recursive: true });
    writeFileSync(path.join(repo, ".harness", "scope.json"), JSON.stringify({ allow: ["harness-kit/**"] }));
    const res = await run(["--issue", "42"], { repoRoot: repo, runGit: fakeGit("main"), fetchIssue: null, runPrStatus: null });
    expect(res.out).toContain("== Issue (GOZS-42) ==");
    expect(res.out).toContain('"harness-kit/**"');
  });

  it("resolveIssueKey y titleKeywords", () => {
    expect(resolveIssueKey(null, "feature/701-x", "GOZS")).toBe("GOZS-701");
    expect(resolveIssueKey(null, "chore/782-harness-context", "GOZS")).toBe("GOZS-782");
    expect(resolveIssueKey(null, "fix/gozs-12-algo", "GOZS")).toBe("GOZS-12");
    expect(resolveIssueKey(null, "agent/backend-eng/86d623bea22a", "GOZS")).toBeNull();
    expect(resolveIssueKey("gozs-9", "main", "GOZS")).toBe("GOZS-9");
    expect(titleKeywords("[CHORE]: Orientación inicial — harness-context (L-002 / 12)")).toEqual([
      "orientación",
      "inicial",
      "harness-context",
    ]);
  });
});
