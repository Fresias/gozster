import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// H-06 / H-08 — Documentación y verificación de superficie de runtimes
// Criterio de aceptación:
// GIVEN un runtime unsupported THEN no se genera post-hook y surface.spec.ts lo documenta.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const runtimesDir = path.resolve(here, "..", "core", "runtimes");

describe("H-06: Superficie de hooks y soporte de flecha result (post-hook)", () => {
  it("documenta en antigravity.json que post es 'unsupported' sin inventar workarounds", () => {
    const agPath = path.join(runtimesDir, "antigravity.json");
    const ag = JSON.parse(readFileSync(agPath, "utf8"));

    expect(ag.hooks.post).toBe("unsupported");
    expect(ag.hooks.post_detail).toContain("PostToolUse existe y recibe toolCall (+ error), pero su stdout debe ser {}");
  });

  it("verifica que .agents/hooks.json generado para Antigravity NO incluye post-hook", () => {
    const agHooksPath = path.join(repoRoot, ".agents", "hooks.json");
    const agHooks = JSON.parse(readFileSync(agHooksPath, "utf8"));

    const hookEntry = agHooks["gozster-guard"];
    expect(hookEntry).toBeDefined();
    expect(hookEntry.PreToolUse).toBeDefined();
    expect(hookEntry.PostToolUse).toBeUndefined();
    expect(hookEntry.AfterTool).toBeUndefined();
  });

  it("documenta que claude-code soporta post con PostToolUse y additionalContext", () => {
    const claudePath = path.join(runtimesDir, "claude-code.json");
    const claude = JSON.parse(readFileSync(claudePath, "utf8"));

    expect(claude.hooks.post.event).toBe("PostToolUse");
    expect(claude.hooks.post.inject.stdout.hookSpecificOutput.additionalContext).toBeDefined();

    const settingsPath = path.join(repoRoot, ".claude", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe("bash .claude/hooks/guard.sh");
  });

  it("documenta que gemini-cli soporta post con AfterTool y additionalContext", () => {
    const geminiPath = path.join(runtimesDir, "gemini-cli.json");
    const gemini = JSON.parse(readFileSync(geminiPath, "utf8"));

    expect(gemini.hooks.post.event).toBe("AfterTool");
    expect(gemini.hooks.post.inject.stdout.hookSpecificOutput.additionalContext).toBeDefined();

    const settingsPath = path.join(repoRoot, ".gemini", "settings.json");
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(settings.hooks.AfterTool).toBeDefined();
    expect(settings.hooks.AfterTool[0].hooks[0].command).toBe("bash .claude/hooks/guard.sh --runtime gemini-cli");
  });
});
