import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as pluginModule from "../core/plugins/opencode/opencode-plugin";
import { HarnessPlugin } from "../core/plugins/opencode/opencode-plugin";

// H-07: Plugin de OpenCode (opencode-plugin.ts) sobre guard-core
// Criterios de Aceptación (Gherkin):
// 1. GIVEN los fixtures de OpenCode THEN before hace throw en block; after agrega los inject a output.output.
// 2. GIVEN la misma entrada canónica THEN el veredicto es idéntico al de guard-cli (un test lo compara).

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const fixturesDir = path.join(here, "fixtures", "opencode");
const guardCliPath = path.resolve(here, "..", "core", "guard", "guard-cli.mjs");

function loadFixture(name: string) {
  const filePath = path.join(fixturesDir, name);
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function runGuardCli(
  payload: unknown,
  args: string[] = [],
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(
      process.execPath,
      [guardCliPath, "--runtime", "opencode", ...args],
      {
        input: JSON.stringify(payload),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return { code: 0, stdout: stdout.trim(), stderr: "" };
  } catch (err) {
    const e = err as {
      status?: number | null;
      stdout?: Buffer | string;
      stderr?: Buffer | string;
    };
    return {
      code: typeof e.status === "number" ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString().trim() : "",
      stderr: e.stderr ? e.stderr.toString() : "",
    };
  }
}

describe("H-07: OpenCode plugin in-process sobre guard-core", () => {
  describe("Criterio 1: GIVEN los fixtures de OpenCode", () => {
    it("THEN pre-shell.json con comando seguro se permite sin lanzar excepción", async () => {
      const fixture = loadFixture("pre-shell.json");
      const plugin = await HarnessPlugin({ directory: repoRoot });

      await expect(
        plugin["tool.execute.before"](fixture.input, fixture.output),
      ).resolves.not.toThrow();
    });

    it("THEN pre-shell con comando destructivo (git push --force) lanza Error en block", async () => {
      const fixture = loadFixture("pre-shell.json");
      const blockedPayload = {
        input: { ...fixture.input },
        output: { args: { command: "git push --force origin main" } },
      };
      const plugin = await HarnessPlugin({ directory: repoRoot });

      await expect(
        plugin["tool.execute.before"](blockedPayload.input, blockedPayload.output),
      ).rejects.toThrow(/Force\/destructive push is forbidden/i);
    });

    it("THEN pre-read con archivo sensible (.env) lanza Error en block", async () => {
      const fixture = loadFixture("pre-read.json");
      const blockedPayload = {
        input: { ...fixture.input },
        output: { args: { filePath: ".env" } },
      };
      const plugin = await HarnessPlugin({ directory: repoRoot });

      await expect(
        plugin["tool.execute.before"](blockedPayload.input, blockedPayload.output),
      ).rejects.toThrow(/Reading env files is forbidden/i);
    });

    it("THEN pre-write sobre archivo prohibido (.claude/settings.json) lanza Error en block", async () => {
      const fixture = loadFixture("pre-write.json");
      const blockedPayload = {
        input: { ...fixture.input },
        output: {
          args: {
            filePath: ".claude/settings.json",
            content: "{}",
          },
        },
      };
      const plugin = await HarnessPlugin({ directory: repoRoot });

      await expect(
        plugin["tool.execute.before"](blockedPayload.input, blockedPayload.output),
      ).rejects.toThrow(/Writing to \.git\/hooks or \.claude\/ is forbidden/i);
    });

    it("THEN post-shell.json sin violaciones no muta output.output", async () => {
      const fixture = loadFixture("post-shell.json");
      const outputCopy = JSON.parse(JSON.stringify(fixture.output));
      const plugin = await HarnessPlugin({ directory: repoRoot });

      await plugin["tool.execute.after"](fixture.input, outputCopy);
      expect(outputCopy.output).toBe(fixture.output.output);
    });

    it("THEN post-shell con error GH007 agrega las instrucciones inject a output.output", async () => {
      const gh007Error =
        "remote: error: GH007: Your push would publish a private email address.\n" +
        "remote: To push, you must use 6156087+Fresias@users.noreply.github.com\n" +
        "To github.com:Fresias/gozster.git\n ! [remote rejected] main -> main (push declined due to email privacy restrictions)";

      const input = {
        tool: "bash",
        sessionID: "ses_123",
        callID: "call_123",
        args: { command: "git push origin main" },
      };
      const output = {
        title: "git push origin main",
        output: gh007Error,
      };

      const plugin = await HarnessPlugin({ directory: repoRoot });
      await plugin["tool.execute.after"](input, output);

      expect(output.output).toContain(
        "git config --worktree user.email 6156087+Fresias@users.noreply.github.com",
      );
    });

    it("THEN post-write sobre supabase/migrations/ agrega el recordatorio de test a output.output", async () => {
      const input = {
        tool: "write",
        sessionID: "ses_123",
        callID: "call_456",
        args: {
          filePath: "supabase/migrations/20261020120000_new_table.sql",
          content: "-- SQL migration",
        },
      };
      const output = {
        title: "supabase/migrations/20261020120000_new_table.sql",
        output: "Wrote file successfully.",
      };

      const plugin = await HarnessPlugin({ directory: repoRoot });
      await plugin["tool.execute.after"](input, output);

      expect(output.output).toContain("npx vitest run tests/db/");
    });
  });

  describe("Criterio 2: GIVEN la misma entrada canónica THEN el veredicto es idéntico al de guard-cli", () => {
    it("paridad en pre: comando permitido (echo hello)", async () => {
      const payload = {
        input: { tool: "bash" },
        output: { args: { command: "echo hello" } },
      };

      // guard-cli
      const cliRes = runGuardCli(payload);
      expect(cliRes.code).toBe(0);

      // plugin
      const plugin = await HarnessPlugin({ directory: repoRoot });
      await expect(
        plugin["tool.execute.before"](payload.input, payload.output),
      ).resolves.not.toThrow();
    });

    it("paridad en pre: comando bloqueado (git push --force)", async () => {
      const payload = {
        input: { tool: "bash" },
        output: { args: { command: "git push --force" } },
      };

      // guard-cli
      const cliRes = runGuardCli(payload);
      expect(cliRes.code).toBe(2);
      expect(cliRes.stderr).toContain("Force/destructive push is forbidden");

      // plugin
      const plugin = await HarnessPlugin({ directory: repoRoot });
      let pluginError: Error | null = null;
      try {
        await plugin["tool.execute.before"](payload.input, payload.output);
      } catch (err) {
        pluginError = err as Error;
      }

      expect(pluginError).not.toBeNull();
      // Ambos veredictos deben coincidir en el motivo del bloqueo
      expect(cliRes.stderr).toContain(pluginError!.message);
    });

    it("paridad en pre: lectura bloqueada (package-lock.json)", async () => {
      const payload = {
        input: { tool: "read" },
        output: { args: { filePath: "package-lock.json" } },
      };

      const cliRes = runGuardCli(payload);
      expect(cliRes.code).toBe(2);
      expect(cliRes.stderr).toContain("package-lock.json is forbidden");

      const plugin = await HarnessPlugin({ directory: repoRoot });
      let pluginError: Error | null = null;
      try {
        await plugin["tool.execute.before"](payload.input, payload.output);
      } catch (err) {
        pluginError = err as Error;
      }

      expect(pluginError).not.toBeNull();
      expect(cliRes.stderr).toContain(pluginError!.message);
    });

    it("paridad en post: sin inyección (comando ordinario)", async () => {
      const payload = {
        input: { tool: "bash", args: { command: "ls -la" } },
        output: { output: "file1\nfile2\n" },
      };

      const cliRes = runGuardCli(payload, ["--phase", "post"]);
      expect(cliRes.code).toBe(0);
      expect(JSON.parse(cliRes.stdout)).toEqual({});

      const outputCopy = JSON.parse(JSON.stringify(payload.output));
      const plugin = await HarnessPlugin({ directory: repoRoot });
      await plugin["tool.execute.after"](payload.input, outputCopy);

      expect(outputCopy.output).toBe(payload.output.output);
    });

    it("paridad en post: inyección de GH007", async () => {
      const gh007 = "remote: error: GH007: Your push would publish a private email address.";
      const payload = {
        input: { tool: "bash", args: { command: "git push origin main" } },
        output: { output: gh007 },
      };

      // guard-cli
      const cliRes = runGuardCli(payload, ["--phase", "post"]);
      expect(cliRes.code).toBe(0);
      const cliOutput = JSON.parse(cliRes.stdout);
      expect(cliOutput.output.output).toContain("git config --worktree user.email");

      // plugin
      const outputCopy = JSON.parse(JSON.stringify(payload.output));
      const plugin = await HarnessPlugin({ directory: repoRoot });
      await plugin["tool.execute.after"](payload.input, outputCopy);

      // Verificamos que el texto inyectado por el plugin contiene exactamente el mensaje de contexto del CLI
      expect(outputCopy.output).toContain(cliOutput.output.output);
    });

    it("paridad en post: inyección de recordatorio de tests al escribir migración SQL", async () => {
      const payload = {
        input: {
          tool: "write",
          args: { filePath: "supabase/migrations/20261020999999_test.sql" },
        },
        output: { output: "OK" },
      };

      const cliRes = runGuardCli(payload, ["--phase", "post"]);
      expect(cliRes.code).toBe(0);
      const cliOutput = JSON.parse(cliRes.stdout);
      expect(cliOutput.output.output).toContain("npx vitest run tests/db/");

      const outputCopy = JSON.parse(JSON.stringify(payload.output));
      const plugin = await HarnessPlugin({ directory: repoRoot });
      await plugin["tool.execute.after"](payload.input, outputCopy);

      expect(outputCopy.output).toContain(cliOutput.output.output);
    });
  });

  describe("API exportada y compatibilidad de contexto", () => {
    it("el módulo exporta exactamente 1 función (HarnessPlugin)", async () => {
      const exported = Object.values(pluginModule);
      expect(exported).toHaveLength(1);
      expect(typeof exported[0]).toBe("function");
      expect(Object.keys(pluginModule)).toEqual(["HarnessPlugin"]);

      const plugin = await HarnessPlugin({ directory: repoRoot });
      expect(typeof plugin["tool.execute.before"]).toBe("function");
      expect(typeof plugin["tool.execute.after"]).toBe("function");
    });

    it("los hooks devuelven el veredicto de guard-core", async () => {
      const plugin = await HarnessPlugin({ directory: repoRoot });
      const allowed = await plugin["tool.execute.before"](
        { tool: "bash" },
        { args: { command: "echo direct" } },
      );
      expect(allowed.allowed).toBe(true);

      const postOut = { output: "prev" };
      const afterRes = await plugin["tool.execute.after"](
        {
          tool: "write",
          args: { filePath: "supabase/migrations/20261020111111_direct.sql" },
        },
        postOut,
      );
      expect(afterRes.inject).toBe(true);
      expect(postOut.output).toContain("npx vitest run tests/db/");
    });
  });
});
