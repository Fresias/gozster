import { describe, expect, it } from "vitest";
// @ts-expect-error - mjs module
import {
  PR_VIEW_FIELDS,
  analyzePrStatus,
  formatPrStatus,
  main,
  parseDurationMs,
  spawnWithTimeout,
} from "../core/scripts/harness-pr-status.mjs";

const PROJECT = {
  issue_prefix: "GOZS",
  authorizers: { owner: "Fresias", delegates: [] },
  gate: "npm test && npm run typecheck && npm run lint && npm run build",
};

function makeSealBody(head: string, fingerprint = "1234567890abcdef") {
  const payload = JSON.stringify({
    kit_version: "2.0.0",
    head,
    worktree_clean: true,
    fingerprint,
    gate: PROJECT.gate,
    passed_at: "2026-11-24T00:00:00Z",
  });
  return `## Resumen\n\n<!-- harness-seal: ${payload} -->\n`;
}

function makePr(overrides: Record<string, unknown> = {}) {
  const head = (overrides.headRefOid as string) || "aaaaaaa111111111111111111111111111111111";
  return {
    number: 636,
    url: "https://github.com/Fresias/gozster/pull/636",
    state: "OPEN",
    isDraft: false,
    headRefName: "chore/773-harness-pr-status-polling",
    headRefOid: head,
    baseRefName: "main",
    mergeStateStatus: "CLEAN",
    reviewDecision: "",
    labels: [{ name: "harness-authorized" }],
    statusCheckRollup: [
      { __typename: "CheckRun", name: "CI / test", status: "COMPLETED", conclusion: "SUCCESS" },
      { __typename: "StatusContext", context: "harness/merge-check", state: "SUCCESS" },
    ],
    body: makeSealBody(head),
    ...overrides,
  };
}

describe("GOZS-773: harness-pr-status.mjs", () => {
  it("GIVEN una PR con sello de otro commit WHEN corre harness-pr-status THEN informa «sello viejo» y sugiere volver a sellar", async () => {
    const pr = makePr({
      headRefOid: "bbbbbbb222222222222222222222222222222222",
      body: makeSealBody("aaaaaaa111111111111111111111111111111111"),
    });
    const ghCalls: string[][] = [];
    let out = "";
    const res = await main(["636"], {
      project: PROJECT,
      runGh: (args: string[]) => {
        ghCalls.push(args);
        return JSON.stringify(pr);
      },
      runMergeCheck: () => ({
        mergeable: false,
        issue: "GOZS-773",
        harnessFiles: [],
        authorizedBy: "Fresias",
        errors: ["seal: head aaaaaaa != PR head bbbbbbb"],
      }),
      writeStdout: (s: string) => {
        out += s;
      },
      writeStderr: () => {},
    });

    expect(res.exitCode).toBe(0);
    expect(ghCalls).toEqual([["pr", "view", "636", "--json", PR_VIEW_FIELDS]]);
    expect(out).toContain("sello viejo");
    expect(out).toContain("volver a sellar");
    expect(out.trim().split("\n").length).toBeLessThanOrEqual(25);
    expect(out.trim().split("\n").at(-1)).toMatch(/^Próximo paso:/);
  });

  it("GIVEN una PR atrasada respecto de main WHEN corre harness-pr-status THEN lo indica y sugiere actualizar y volver a sellar", async () => {
    const pr = makePr({ mergeStateStatus: "BEHIND" });
    let out = "";
    const res = await main(["636"], {
      project: PROJECT,
      runGh: () => JSON.stringify(pr),
      runMergeCheck: () => ({ mergeable: true, issue: "GOZS-773", harnessFiles: [], authorizedBy: "Fresias", errors: [] }),
      writeStdout: (s: string) => {
        out += s;
      },
      writeStderr: () => {},
    });

    expect(res.exitCode).toBe(0);
    expect(res.data.behind).toBe(true);
    expect(out).toContain("atrasada");
    expect(out).toContain("actualizar la rama con main y volver a sellar");
  });

  it("GIVEN checks pendientes y --wait-checks WHEN terminan THEN ejecuta una sola llamada sin --timeout en gh e imprime el resumen final", async () => {
    const prFinal = makePr({
      statusCheckRollup: [
        { __typename: "CheckRun", name: "CI / test", status: "COMPLETED", conclusion: "SUCCESS" },
        { __typename: "CheckRun", name: "CI / build", status: "COMPLETED", conclusion: "SUCCESS" },
      ],
    });
    const watchCalls: Array<{ args: string[]; timeoutMs: number }> = [];
    const ghCalls: string[][] = [];
    let out = "";

    const res = await main(["636", "--wait-checks", "--timeout", "15m"], {
      project: PROJECT,
      waitChecks: async (args: string[], timeoutMs: number) => {
        watchCalls.push({ args, timeoutMs });
        return { code: 0, timedOut: false, stdout: "All checks passed", stderr: "" };
      },
      runGh: (args: string[]) => {
        ghCalls.push(args);
        return JSON.stringify(prFinal);
      },
      runMergeCheck: () => ({ mergeable: true, issue: "GOZS-773", harnessFiles: [], authorizedBy: "Fresias", errors: [] }),
      writeStdout: (s: string) => {
        out += s;
      },
      writeStderr: () => {},
    });

    expect(res.exitCode).toBe(0);
    expect(watchCalls).toHaveLength(1);
    expect(watchCalls[0]!.args).toEqual(["pr", "checks", "636", "--watch", "--interval", "30"]);
    expect(watchCalls[0]!.args).not.toContain("--timeout");
    expect(watchCalls[0]!.timeoutMs).toBe(15 * 60 * 1000);
    expect(ghCalls).toHaveLength(1);
    expect(out).toContain("Checks: 2 OK, 0 fallidos, 0 pendientes");
    expect(out).toContain("Próximo paso: listo para aprobar");
  });

  it("GIVEN merge-check bloqueado solo por la etiqueta harness-authorized WHEN corre harness-pr-status THEN muestra «falta harness-authorized (solo @Fresias)»", async () => {
    const pr = makePr({
      labels: [],
      statusCheckRollup: [
        { __typename: "CheckRun", name: "CI / test", status: "COMPLETED", conclusion: "SUCCESS" },
        { __typename: "StatusContext", context: "harness/merge-check", state: "FAILURE" },
      ],
    });
    let out = "";
    const res = await main(["636"], {
      project: PROJECT,
      runGh: () => JSON.stringify(pr),
      runMergeCheck: () => ({
        mergeable: false,
        issue: "GOZS-773",
        harnessFiles: ["harness-kit/core/guard/guard-core.mjs"],
        authorizedBy: null,
        errors: ["authz: missing label harness-authorized (only @Fresias can authorize)"],
      }),
      writeStdout: (s: string) => {
        out += s;
      },
      writeStderr: () => {},
    });

    expect(res.exitCode).toBe(0);
    expect(res.data.labels.harnessAuthorized).toBe(false);
    expect(res.data.next).toBe("falta harness-authorized (solo @Fresias)");
    expect(out).toContain("falta harness-authorized (solo @Fresias)");
  });

  it("GIVEN --json WHEN corre harness-pr-status THEN devuelve seal, behind, checks, labels, review, mergeCheck y next", async () => {
    const pr = makePr({
      reviewDecision: "APPROVED",
      statusCheckRollup: [
        { __typename: "CheckRun", name: "CI / test", status: "COMPLETED", conclusion: "SUCCESS" },
        { __typename: "CheckRun", name: "CI / e2e", status: "IN_PROGRESS", conclusion: "" },
      ],
    });
    let out = "";
    const res = await main(["--json"], {
      project: PROJECT,
      runGh: (args: string[]) => {
        // Sin argumento, toma la PR de la rama actual (sin selector posicional)
        expect(args).toEqual(["pr", "view", "--json", PR_VIEW_FIELDS]);
        return JSON.stringify(pr);
      },
      runMergeCheck: () => ({ mergeable: true, issue: "GOZS-773", harnessFiles: [], authorizedBy: "Fresias", errors: [] }),
      writeStdout: (s: string) => {
        out += s;
      },
      writeStderr: () => {},
    });

    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(out);
    for (const key of ["seal", "behind", "checks", "labels", "review", "mergeCheck", "next"]) {
      expect(parsed).toHaveProperty(key);
    }
    expect(parsed.seal.valid).toBe(true);
    expect(parsed.behind).toBe(false);
    expect(parsed.checks).toEqual({ total: 2, ok: 1, failed: [], pending: ["CI / e2e"] });
    expect(parsed.labels.harnessAuthorized).toBe(true);
    expect(parsed.review).toBe("APPROVED");
    expect(parsed.mergeCheck.mergeable).toBe(true);
    expect(parsed.next).toBe("esperar checks: `--wait-checks`");
  });

  it("GIVEN un check fallido WHEN corre harness-pr-status THEN lista el nombre del check fallido y sugiere corregirlo", () => {
    const pr = makePr({
      statusCheckRollup: [
        { __typename: "CheckRun", name: "CI / lint", status: "COMPLETED", conclusion: "SUCCESS" },
        { __typename: "CheckRun", name: "CI / unit", status: "COMPLETED", conclusion: "FAILURE" },
      ],
    });
    const data = analyzePrStatus({
      pr,
      mergeCheck: { mergeable: true, errors: [] },
      project: PROJECT,
    });
    const text = formatPrStatus(data);
    expect(data.checks.failed).toEqual(["CI / unit"]);
    expect(data.next).toBe("corregir el check CI / unit");
    expect(text).toContain("CI / unit");
    expect(text.trim().split("\n").length).toBeLessThanOrEqual(25);
  });

  it("GIVEN muchos errores de merge-check WHEN formatea salida THEN nunca supera 25 líneas y termina en Próximo paso", () => {
    const pr = makePr();
    const errors = Array.from({ length: 30 }, (_, i) => `err-${i + 1}: detalle de bloqueo`);
    const data = analyzePrStatus({ pr, mergeCheck: { mergeable: false, errors }, project: PROJECT });
    const lines = formatPrStatus(data).trim().split("\n");
    expect(lines.length).toBeLessThanOrEqual(25);
    expect(lines.at(-1)).toMatch(/^Próximo paso:/);
  });

  it("GIVEN merge-check en modo lectura real via main(argv, deps) sin --post-status WHEN corre harness-pr-status THEN reutiliza harness-merge-check sin escribir estados", async () => {
    const head = "ccccccc333333333333333333333333333333333";
    const pr = makePr({
      number: 773,
      headRefName: "feature/773-demo",
      headRefOid: head,
      changedFiles: 2,
      labels: [],
      body: makeSealBody(head),
    });
    const ghCalls: string[][] = [];
    const res = await main(["773", "--json"], {
      project: PROJECT,
      runGh: (args: string[]) => {
        ghCalls.push(args);
        if (args[0] === "pr" && args[1] === "view") return JSON.stringify(pr);
        if (args[0] === "api" && args.some((a) => a.includes("/files"))) {
          return JSON.stringify([
            { filename: "src/app/page.tsx" },
            { filename: "harness/experience/GOZS-773.jsonl" },
          ]);
        }
        if (args[0] === "api" && args.some((a) => a.includes("GOZS-773.jsonl"))) {
          return JSON.stringify({ task: "GOZS-773", lesson: "ok" }) + "\n";
        }
        throw new Error(`Unexpected gh call: ${args.join(" ")}`);
      },
      writeStdout: () => {},
      writeStderr: () => {},
    });

    expect(res.exitCode).toBe(0);
    expect(res.data.mergeCheck.mergeable).toBe(true);
    expect(ghCalls.some((c) => c.includes("POST") || c.includes("DELETE") || c.includes("--post-status"))).toBe(false);
  });

  it("GIVEN --help WHEN corre harness-pr-status THEN imprime ayuda y sale 0", async () => {
    let out = "";
    const res = await main(["--help"], {
      writeStdout: (s: string) => {
        out += s;
      },
      writeStderr: () => {},
    });
    expect(res.exitCode).toBe(0);
    expect(out).toContain("--wait-checks");
    expect(out).toContain("--timeout");
  });

  it("GIVEN spawnWithTimeout con un proceso colgado WHEN vence el temporizador THEN mata al hijo y reporta timedOut=true", async () => {
    expect(parseDurationMs("30m")).toBe(1_800_000);
    expect(parseDurationMs("90s")).toBe(90_000);
    expect(parseDurationMs("1h")).toBe(3_600_000);
    expect(parseDurationMs("bad")).toBeNull();

    const res = await spawnWithTimeout(process.execPath, ["-e", "setInterval(() => {}, 1000)"], 150);
    expect(res.timedOut).toBe(true);
  });
});
