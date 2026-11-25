import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// @ts-expect-error - mjs module
import { checkGuard } from "../core/guard/guard-core.mjs";
// @ts-expect-error - mjs module
import { compactDataHeredocs, parseHeredocs } from "../core/guard/heredoc.mjs";

// GOZS-809: el opener `@'` / `@"` de un here-string de PowerShell no puede dejar una comilla
// abierta en `strippedAll` que oculte al guard el resto del comando.
// Vive en su propio archivo (mismo corpus que guard-corpus.spec.ts) para no alargar el worker
// de ese spec, que ya ronda los 40 s y dispara el timeout de RPC de vitest.

const here = path.dirname(fileURLToPath(import.meta.url));
const preShell = JSON.parse(readFileSync(path.join(here, "fixtures", "claude-code", "pre-shell.json"), "utf8"));

const payload = (cmd: string) => ({
  ...preShell,
  tool_name: "PowerShell",
  tool_input: { ...preShell.tool_input, command: cmd },
});

let repo = "";
beforeAll(() => {
  repo = realpathSync(mkdtempSync(path.join(tmpdir(), "guard-here-string-")));
  execFileSync("git", ["init", "-q", "-b", "feature/123-demo"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/Fresias/gozster.git"], { cwd: repo });
});
afterAll(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

interface Case {
  label: string;
  cmd: string;
  rule: string;
}

const QUOTES = [
  { open: "@'", close: "'@" },
  { open: '@"', close: '"@' },
];

const BLOCK: Case[] = QUOTES.flatMap(({ open, close }) => {
  const pre = `$body = ${open}\nhola\n${close}\n`;
  return [
    { label: "redirect a .claude", cmd: `${pre}'x' > .claude/settings.json`, rule: "fs.protected" },
    { label: "Out-File a .claude", cmd: `${pre}$body | Out-File .claude/settings.json`, rule: "fs.protected" },
    {
      label: "Set-Content a rules.json",
      cmd: `${pre}Set-Content harness-kit/core/guard/rules.json $body`,
      rule: "harness.authorized-only",
    },
    { label: "gh pr create", cmd: `${pre}gh pr create --fill`, rule: "pr.requires-seal" },
    {
      label: "continuación en la línea de cierre",
      cmd: `echo ${open}\nhola\n${close} ; echo x > .claude/settings.json`,
      rule: "fs.protected",
    },
    { label: "sin cerrar", cmd: `echo ${open}\n'\necho x > .claude/settings.json`, rule: "fs.protected" },
  ].map((c) => ({ ...c, label: `${open} ${c.label}` }));
});

describe("GOZS-809: here-strings de PowerShell no ocultan el resto del comando", () => {
  it.each(BLOCK)("$label -> bloquea", ({ cmd, rule }) => {
    const res = checkGuard(payload(cmd), { repoRoot: repo });
    expect(res.allowed, JSON.stringify(res)).toBe(false);
    expect(res.ruleId).toBe(rule);
  });

  it("un here-string de datos sigue permitido", () => {
    const res = checkGuard(payload("$body = @'\ngh pr create --fill\n'@\nWrite-Output $body"), { repoRoot: repo });
    expect(res.allowed, JSON.stringify(res)).toBe(true);
  });

  it("strippedAll no deja comillas abiertas y conserva el resto de la línea", () => {
    const { strippedAll } = parseHeredocs("$body = @'\nhola\n'@\ngh pr create --fill");
    expect(strippedAll).toBe("$body = ''\ngh pr create --fill");
  });

  it("sin cerrar: el cuerpo vuelve a strippedAll y la telemetría mantiene su compactación", () => {
    const cmd = "echo @'\nuno\ndos";
    expect(parseHeredocs(cmd).strippedAll).toContain("dos");
    expect(compactDataHeredocs(cmd)).toBe("echo @'\n‹heredoc: 2 líneas›");
  });
});
