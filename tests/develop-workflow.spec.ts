import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error - mjs module
import { main as shipMain } from "../harness-kit/core/scripts/harness-ship.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

describe("GOZS-835: Flujo develop → main en CI, merge-check y harness-ship", () => {
  it("GIVEN .github/workflows/ci.yml THEN dispara push y pull_request en main y develop", () => {
    const ci = readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
    expect(ci).toMatch(/push:\s*\r?\n\s*branches:\s*\[main,\s*develop\]/);
    expect(ci).toMatch(/pull_request:\s*\r?\n\s*branches:\s*\[main,\s*develop\]/);
  });

  it("GIVEN .github/workflows/harness-merge-check.yml THEN dispara pull_request_target en main y develop", () => {
    const mc = readFileSync(path.join(repoRoot, ".github", "workflows", "harness-merge-check.yml"), "utf8");
    expect(mc).toMatch(/pull_request_target:\s*\r?\n\s*branches:\s*\[main,\s*develop\]/);
  });

  it("GIVEN .github/workflows/deploy-production.yml THEN push a producción sigue restringido solo a main", () => {
    const deploy = readFileSync(path.join(repoRoot, ".github", "workflows", "deploy-production.yml"), "utf8");
    expect(deploy).toMatch(/push:\s*\r?\n\s*branches:\s*\[main\]/);
    expect(deploy).not.toMatch(/branches:\s*\[.*develop.*\]/);
  });

  it("GIVEN harness/project.json THEN declara default_base_branch = develop", () => {
    const project = JSON.parse(readFileSync(path.join(repoRoot, "harness", "project.json"), "utf8"));
    expect(project.default_base_branch).toBe("develop");
  });

  it("GIVEN project.default_base_branch = develop WHEN harness-ship corre sin --base THEN apunta a develop; con --base main respeta main", async () => {
    const runShip = async (extraArgs: string[]) => {
      const calls: string[] = [];
      let head = "aaaaaaa1";
      let sealHead = "";
      const files = new Map<string, string>([["/work/body.md", "## Resumen\n\nOk."]]);
      const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
      const run = (cmd: string, args: string[]) => {
        const script = (args[0] || "").split("/").pop() || "";
        calls.push((cmd === "git" || cmd === "gh" ? `${cmd} ${args.join(" ")}` : `${cmd} ${script} ${args.slice(1).join(" ")}`).trim());
        if (cmd === "git") {
          const [sub] = args;
          if (sub === "rev-parse") return ok("feature/836-dev-badge\n");
          if (sub === "status") return ok("");
          if (sub === "fetch") return ok();
          if (sub === "rev-list") return ok("0\n");
          if (sub === "push") return ok();
        }
        if (script === "harness-gate.sh") {
          if (args.includes("--verify")) return sealHead === head ? ok() : { status: 1, stdout: "", stderr: "" };
          if (args.includes("--pr-block")) {
            return ok(`<!-- harness-seal: {"head":"${sealHead}","fingerprint":"1234567890abcdef"} -->\nHarness seal: \`1234567890abcdef\` on \`${sealHead.slice(0, 7)}\` (gate)\n`);
          }
          sealHead = head;
          files.set("/repo/.harness/complete.json", JSON.stringify({ head, fingerprint: "1234567890abcdef" }));
          return ok();
        }
        if (cmd === "gh") {
          if (args[1] === "list") return ok("[]");
          if (args[1] === "create") return ok("https://github.com/Fresias/gozster/pull/999\n");
        }
        throw new Error(`unhandled: ${cmd} ${args.join(" ")}`);
      };
      const res = await shipMain(
        ["--title", "feat: badge", "--body-file", "/work/body.md", ...extraArgs],
        {
          run,
          repoRoot: "/repo",
          project: { issue_prefix: "GOZS", default_base_branch: "develop" },
          bash: "BASH",
          scriptsDir: "/kit/scripts",
          readFile: (f: string) => files.get(f.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "")) || "",
          writeFile: (f: string, s: string) => files.set(f.replace(/\\/g, "/").replace(/^[A-Za-z]:/, ""), s),
          exists: (f: string) => files.has(f.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "")),
          log: () => {},
          err: () => {},
        },
      );
      return { res, calls };
    };

    const defaultRun = await runShip([]);
    expect(defaultRun.res.exitCode).toBe(0);
    expect(defaultRun.calls).toContain("git fetch --quiet origin develop");
    expect(defaultRun.calls).toContain("BASH harness-gate.sh --base origin/develop");
    expect(defaultRun.calls.some((c) => c.startsWith("gh pr create") && c.includes("--base develop"))).toBe(true);

    const explicitMain = await runShip(["--base", "main"]);
    expect(explicitMain.res.exitCode).toBe(0);
    expect(explicitMain.calls).toContain("git fetch --quiet origin main");
    expect(explicitMain.calls).toContain("BASH harness-gate.sh --base origin/main");
    expect(explicitMain.calls.some((c) => c.startsWith("gh pr create") && c.includes("--base main"))).toBe(true);
  });
});
