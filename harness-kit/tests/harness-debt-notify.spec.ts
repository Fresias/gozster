import { describe, expect, it, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
// @ts-expect-error - mjs module
import { evaluateAndNotifyDebt } from "../core/scripts/harness-debt-notify.mjs";

function createHarnessFixture(baseDir: string, unprocessedCount: number) {
  const expDir = path.join(baseDir, "harness", "experience");
  mkdirSync(expDir, { recursive: true });
  writeFileSync(
    path.join(baseDir, "harness", "experience_library.jsonl"),
    JSON.stringify({ id: "exp-base", task: "GOZS-100", lesson: "Base", verified: true, processed_by_proposer: true }) + "\n",
    "utf8"
  );

  for (let i = 1; i <= unprocessedCount; i++) {
    const task = `GOZS-${900 + i}`;
    writeFileSync(
      path.join(expDir, `${task}.jsonl`),
      JSON.stringify({ id: `exp-${i}`, task, lesson: `Lección sin procesar ${i}` }) + "\n",
      "utf8"
    );
  }
}

describe("Harness² Lesson Debt Threshold Notifier (harness-debt-notify)", () => {
  const createdDirs: string[] = [];

  function makeTempRepo(prefix = "harness-debt-notify-"): string {
    const dir = mkdtempSync(path.join(tmpdir(), prefix));
    createdDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const d of createdDirs) {
      if (existsSync(d)) {
        try {
          rmSync(d, { recursive: true, force: true });
        } catch {}
      }
    }
    createdDirs.length = 0;
  });

  it("GIVEN transición 7→8 WHEN evaluateAndNotifyDebt THEN hace POST al webhook una vez con Idempotency-Key y payload esperado sin imprimir la URL", async () => {
    const prevDir = makeTempRepo("debt-prev-7-");
    const currDir = makeTempRepo("debt-curr-8-");
    createHarnessFixture(prevDir, 7);
    createHarnessFixture(currDir, 8);

    const calls: Array<{ url: string; init: RequestInit }> = [];
    const logs: string[] = [];
    const warnings: string[] = [];
    const fakeSecretUrl = "https://example.invalid/webhooks/autopilot/secret-token-123";

    const res = await evaluateAndNotifyDebt({
      workdir: currDir,
      prevWorkdir: prevDir,
      webhookUrl: fakeSecretUrl,
      commitSha: "abc123def",
      runUrl: "https://github.com/Fresias/gozster/actions/runs/999",
      fetchImpl: async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ status: "accepted" }), { status: 200 });
      },
      log: (m: string) => logs.push(m),
      warn: (m: string) => warnings.push(m),
    });

    expect(res.notified).toBe(true);
    expect(res.crossed).toBe(true);
    expect(res.prevCount).toBe(7);
    expect(res.currentCount).toBe(8);
    expect(res.deliveryStatus).toBe("accepted");
    expect(calls).toHaveLength(1);
    const firstCall = calls[0]!;
    expect(firstCall.url).toBe(fakeSecretUrl);
    expect(firstCall.init.method).toBe("POST");

    const headers = firstCall.init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Idempotency-Key"]).toBe("lesson-debt-8-abc123def");

    const body = JSON.parse(firstCall.init.body as string);
    expect(body).toEqual({
      event: "harness.lesson_debt.threshold",
      threshold: 8,
      unprocessed: 8,
      tasks: ["GOZS-901", "GOZS-902", "GOZS-903", "GOZS-904", "GOZS-905", "GOZS-906", "GOZS-907", "GOZS-908"],
      commit: "abc123def",
      run_url: "https://github.com/Fresias/gozster/actions/runs/999",
    });

    expect(warnings).toHaveLength(0);
    expect(logs.join("")).not.toContain(fakeSecretUrl);
    expect(logs.join("")).not.toContain("secret-token-123");
  });

  it("GIVEN transición 8→9 WHEN evaluateAndNotifyDebt THEN no vuelve a avisar", async () => {
    const prevDir = makeTempRepo("debt-prev-8-");
    const currDir = makeTempRepo("debt-curr-9-");
    createHarnessFixture(prevDir, 8);
    createHarnessFixture(currDir, 9);

    let fetchCount = 0;
    const res = await evaluateAndNotifyDebt({
      workdir: currDir,
      prevWorkdir: prevDir,
      webhookUrl: "https://example.invalid/webhooks/autopilot/secret",
      commitSha: "sha8to9",
      fetchImpl: async () => {
        fetchCount++;
        return new Response(JSON.stringify({ status: "accepted" }), { status: 200 });
      },
      log: () => {},
      warn: () => {},
    });

    expect(res.notified).toBe(false);
    expect(res.crossed).toBe(false);
    expect(res.reason).toBe("threshold_not_crossed");
    expect(res.prevCount).toBe(8);
    expect(res.currentCount).toBe(9);
    expect(fetchCount).toBe(0);
  });

  it("GIVEN transición 9→7→8 tras consolidar WHEN evaluateAndNotifyDebt THEN 9→7 no avisa y 7→8 avisa otra vez", async () => {
    const dir9 = makeTempRepo("debt-9-");
    const dir7 = makeTempRepo("debt-7-");
    const dir8 = makeTempRepo("debt-8-");
    createHarnessFixture(dir9, 9);
    createHarnessFixture(dir7, 7);
    createHarnessFixture(dir8, 8);

    const calls: string[] = [];
    const fetchImpl = async (_url: string, init: RequestInit) => {
      calls.push(init.body as string);
      return new Response(JSON.stringify({ status: "accepted" }), { status: 200 });
    };

    const step1 = await evaluateAndNotifyDebt({
      workdir: dir7,
      prevWorkdir: dir9,
      webhookUrl: "https://example.invalid/webhooks/autopilot/secret",
      commitSha: "sha-9-to-7",
      fetchImpl,
      log: () => {},
      warn: () => {},
    });
    expect(step1.notified).toBe(false);
    expect(calls).toHaveLength(0);

    const step2 = await evaluateAndNotifyDebt({
      workdir: dir8,
      prevWorkdir: dir7,
      webhookUrl: "https://example.invalid/webhooks/autopilot/secret",
      commitSha: "sha-7-to-8",
      fetchImpl,
      log: () => {},
      warn: () => {},
    });
    expect(step2.notified).toBe(true);
    expect(step2.crossed).toBe(true);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]!).commit).toBe("sha-7-to-8");
  });

  it("GIVEN secreto ausente en cruce 7→8 WHEN evaluateAndNotifyDebt THEN emite ::warning y continúa sin fallo", async () => {
    const prevDir = makeTempRepo("debt-prev-miss-");
    const currDir = makeTempRepo("debt-curr-miss-");
    createHarnessFixture(prevDir, 7);
    createHarnessFixture(currDir, 8);

    const warnings: string[] = [];
    let fetchCount = 0;

    const res = await evaluateAndNotifyDebt({
      workdir: currDir,
      prevWorkdir: prevDir,
      webhookUrl: "",
      commitSha: "sha-missing",
      fetchImpl: async () => {
        fetchCount++;
        return new Response("", { status: 200 });
      },
      log: () => {},
      warn: (m: string) => warnings.push(m),
    });

    expect(res.notified).toBe(false);
    expect(res.crossed).toBe(true);
    expect(res.reason).toBe("missing_secret");
    expect(fetchCount).toBe(0);
    expect(warnings.join("")).toContain("::warning title=Harness debt::falta MULTICA_LESSON_DEBT_WEBHOOK_URL");
  });

  it("GIVEN error HTTP o de red en webhook WHEN evaluateAndNotifyDebt THEN emite ::warning redactando la URL y no falla", async () => {
    const prevDir = makeTempRepo("debt-prev-err-");
    const currDir = makeTempRepo("debt-curr-err-");
    createHarnessFixture(prevDir, 7);
    createHarnessFixture(currDir, 8);

    const secretUrl = "https://example.invalid/webhooks/autopilot/ultra-secret-xyz";
    const warningsHttp: string[] = [];
    const httpRes = await evaluateAndNotifyDebt({
      workdir: currDir,
      prevWorkdir: prevDir,
      webhookUrl: secretUrl,
      commitSha: "sha-500",
      fetchImpl: async () => new Response("internal error", { status: 500 }),
      log: () => {},
      warn: (m: string) => warningsHttp.push(m),
    });

    expect(httpRes.notified).toBe(false);
    expect(httpRes.reason).toBe("http_error");
    expect(httpRes.httpStatus).toBe(500);
    expect(warningsHttp.join("")).toContain("::warning title=Harness debt::");
    expect(warningsHttp.join("")).not.toContain(secretUrl);

    const warningsNet: string[] = [];
    const netRes = await evaluateAndNotifyDebt({
      workdir: currDir,
      prevWorkdir: prevDir,
      webhookUrl: secretUrl,
      commitSha: "sha-net",
      fetchImpl: async () => {
        throw new Error(`request to ${secretUrl} failed`);
      },
      log: () => {},
      warn: (m: string) => warningsNet.push(m),
    });

    expect(netRes.notified).toBe(false);
    expect(netRes.reason).toBe("network_error");
    expect(warningsNet.join("")).toContain("::warning title=Harness debt::");
    expect(warningsNet.join("")).not.toContain(secretUrl);
    expect(warningsNet.join("")).not.toContain("ultra-secret-xyz");
  });

  it("GIVEN respuestas 200 duplicate|ignored|skipped WHEN evaluateAndNotifyDebt THEN se consideran OK sin warning", async () => {
    const prevDir = makeTempRepo("debt-prev-statuses-");
    const currDir = makeTempRepo("debt-curr-statuses-");
    createHarnessFixture(prevDir, 7);
    createHarnessFixture(currDir, 8);

    for (const status of ["duplicate", "ignored", "skipped"]) {
      const warnings: string[] = [];
      const res = await evaluateAndNotifyDebt({
        workdir: currDir,
        prevWorkdir: prevDir,
        webhookUrl: "https://example.invalid/webhooks/autopilot/secret",
        commitSha: `sha-${status}`,
        fetchImpl: async () => new Response(JSON.stringify({ status }), { status: 200 }),
        log: () => {},
        warn: (m: string) => warnings.push(m),
      });

      expect(res.notified).toBe(true);
      expect(res.reason).toBe("ok");
      expect(res.deliveryStatus).toBe(status);
      expect(warnings).toHaveLength(0);
    }
  });

  it("GIVEN repo git con HEAD^ en 7 y HEAD en 8 WHEN extrae HEAD^ vía git archive THEN detecta el cruce sin git worktree", async () => {
    const gitRepo = makeTempRepo("debt-git-archive-");
    execFileSync("git", ["init"], { cwd: gitRepo, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "Test Bot"], { cwd: gitRepo, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: gitRepo, stdio: "pipe" });

    createHarnessFixture(gitRepo, 7);
    execFileSync("git", ["add", "."], { cwd: gitRepo, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "commit 7"], { cwd: gitRepo, stdio: "pipe" });

    writeFileSync(
      path.join(gitRepo, "harness", "experience", "GOZS-908.jsonl"),
      JSON.stringify({ id: "exp-8", task: "GOZS-908", lesson: "Lección 8" }) + "\n",
      "utf8"
    );
    execFileSync("git", ["add", "."], { cwd: gitRepo, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", "commit 8"], { cwd: gitRepo, stdio: "pipe" });

    let called = 0;
    const res = await evaluateAndNotifyDebt({
      workdir: gitRepo,
      webhookUrl: "https://example.invalid/webhooks/autopilot/secret",
      runUrl: "https://github.com/Fresias/gozster/actions/runs/123",
      fetchImpl: async () => {
        called++;
        return new Response(JSON.stringify({ status: "accepted" }), { status: 200 });
      },
      log: () => {},
      warn: () => {},
    });

    expect(res.prevCount).toBe(7);
    expect(res.currentCount).toBe(8);
    expect(res.notified).toBe(true);
    expect(called).toBe(1);
  });
});
