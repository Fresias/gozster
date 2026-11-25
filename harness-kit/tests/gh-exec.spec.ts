import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
// @ts-expect-error - mjs module
import { escapeCmdArg, ghShellCommand, resolveGhInvocation } from "../core/lib/gh-exec.mjs";

const TITLES = ['a "b" & c', 'x | y "', "100% ^ done", 'impar " & echo PWNED | find "x"', 'ok\\', "plain"];

// Solo se registra en Windows (no es un .skip: en otras plataformas el caso no existe).
const winOnly: typeof it = process.platform === "win32" ? it : (((): void => {}) as unknown as typeof it);

describe("GOZS-804 D: gh con argumentos literales en Windows", () => {
  it("GIVEN gh.exe real THEN lo lanza sin shell con los argumentos intactos", () => {
    const args = ["pr", "create", "--title", TITLES[0]];
    const inv = resolveGhInvocation(args, { platform: "win32", where: () => ["C:\\gh\\gh", "C:\\gh\\gh.exe"] });
    expect(inv).toEqual({ command: "C:\\gh\\gh.exe", args, shell: false });
  });

  it("GIVEN solo un shim .cmd THEN usa cmd.exe /d /s /c verbatim y nunca shell:true", () => {
    const inv = resolveGhInvocation(["pr", "view"], { platform: "win32", where: () => ["C:\\b\\gh.cmd"] });
    expect(inv.shell).toBe(false);
    expect(inv.verbatim).toBe(true);
    expect(inv.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(inv.args[3]).toMatch(/^".*gh\.cmd.*"$/);
  });

  it("GIVEN Linux/macOS THEN lanza gh directo", () => {
    expect(resolveGhInvocation(["a"], { platform: "linux" })).toEqual({ command: "gh", args: ["a"], shell: false });
  });

  it.each(TITLES)("escapeCmdArg neutraliza metacaracteres de cmd en %j", (t) => {
    const e = escapeCmdArg(t);
    // Ningún & | % ^ < > ni comilla queda sin caret delante.
    expect(e.replace(/\^./g, "")).not.toMatch(/[&|%<>"^]/);
  });

  it("ghShellCommand conserva el binario y escapa cada argumento", () => {
    expect(ghShellCommand(["a&b"])).toBe('gh ^^^"a^^^&b^^^"');
  });

  // Prueba de integración real solo en Windows: el título llega literal a un script .cmd.
  winOnly("GIVEN un shim .cmd real THEN los títulos con \" & | % ^ llegan literales", () => {
    const dir = mkdtempSync(`${tmpdir()}\\gh-exec-`);
    const shim = `${dir}\\gh.cmd`;
    const echoJs = `${dir}\\echo.js`;
    writeFileSync(echoJs, "process.stdout.write(JSON.stringify(process.argv.slice(2)))");
    writeFileSync(shim, `@echo off\r\n"${process.execPath}" "${echoJs}" %*\r\n`);
    for (const t of TITLES) {
      const inv = resolveGhInvocation(["pr", "create", "--title", t], { platform: "win32", where: () => [shim] });
      const res = spawnSync(inv.command, inv.args, { encoding: "utf8", windowsVerbatimArguments: true });
      expect(JSON.parse(res.stdout), t).toEqual(["pr", "create", "--title", t]);
    }
  });
});
