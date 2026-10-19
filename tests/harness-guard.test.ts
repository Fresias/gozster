import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const guardPath = path.join(repoRoot, ".claude", "hooks", "guard.sh").replace(/\\/g, "/");

/** Invoke guard.sh with a PreToolUse payload on stdin; return its exit code. */
function runGuard(payload: unknown): { code: number; stderr: string } {
  try {
    execFileSync("bash", [guardPath], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { code: 0, stderr: "" };
  } catch (err) {
    const e = err as { status?: number | null; stderr?: Buffer | string };
    const stderr = e.stderr ? e.stderr.toString() : "";
    return { code: typeof e.status === "number" ? e.status : 1, stderr };
  }
}

const bashPayload = (command: string) => ({ tool_name: "Bash", tool_input: { command } });
const readPayload = (file_path: string, limit?: number) => ({
  tool_name: "Read",
  tool_input: limit === undefined ? { file_path } : { file_path, limit },
});

describe("AGENTS.md", () => {
  const agents = readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");

  it("exists and is under 150 lines", () => {
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.split("\n").length).toBeLessThan(150);
  });

  it("documents the real package.json scripts", () => {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts).toHaveProperty("typecheck");
    expect(pkg.scripts).toHaveProperty("test");
    expect(pkg.scripts).toHaveProperty("seed:mynter");

    for (const cmd of [
      "npm ci",
      "npm run dev",
      "npm run build",
      "npm run typecheck",
      "npm test",
      "npx vitest run",
      "npm run seed:mynter",
    ]) {
      expect(agents, `AGENTS.md should document "${cmd}"`).toContain(cmd);
    }
  });
});

describe("guard.sh — destructive command blocking", () => {
  it.each([
    ["git push --force", "git push --force origin main"],
    ["git push origin +main", "git push origin +main"],
    ["git reset --hard", "git reset --hard HEAD~3"],
    ["rm -rf", "rm -rf build"],
    ["cat .env", "cat .env"],
  ])("blocks (exit 2): %s", (_label, command) => {
    expect(runGuard(bashPayload(command)).code).toBe(2);
  });
});

describe("guard.sh — multica anti-waste rules", () => {
  it("blocks comment list without --compact/--roots-only", () => {
    expect(runGuard(bashPayload("multica issue comment list 123 --output json")).code).toBe(2);
  });

  it("allows a bounded comment list", () => {
    expect(
      runGuard(
        bashPayload("multica issue comment list 123 --roots-only --summary --compact --output json"),
      ).code,
    ).toBe(0);
  });

  it("blocks issue list without --limit", () => {
    expect(runGuard(bashPayload("multica issue list --output json")).code).toBe(2);
  });

  it("allows an issue list with --limit", () => {
    expect(runGuard(bashPayload("multica issue list --limit 10 --output json")).code).toBe(0);
  });
});

describe("guard.sh — Read token-waste rules", () => {
  let tmp: string;
  let bigFile: string;
  let smallFile: string;

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "gozs-guard-"));
    bigFile = path.join(tmp, "big.txt");
    smallFile = path.join(tmp, "small.txt");
    writeFileSync(bigFile, Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join("\n") + "\n");
    writeFileSync(smallFile, Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join("\n") + "\n");
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  const posix = (p: string) => p.replace(/\\/g, "/");

  it("blocks Read without limit on a >300-line file", () => {
    expect(runGuard(readPayload(posix(bigFile))).code).toBe(2);
  });

  it("allows Read with limit=150 on that same file", () => {
    expect(runGuard(readPayload(posix(bigFile), 150)).code).toBe(0);
  });

  it("allows Read without limit on a <=300-line file", () => {
    expect(runGuard(readPayload(posix(smallFile))).code).toBe(0);
  });
});
