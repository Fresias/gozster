import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Harness² Architecture Spec: 8 editable components around the frozen model.
// Verifies discovery, validation, and rendering of all 8 components in core + overlay.

const here = path.dirname(fileURLToPath(import.meta.url));
const kitDir = path.resolve(here, "..");
const renderScript = path.join(kitDir, "core", "scripts", "harness-render.mjs");

let workspace: string | undefined;

afterEach(() => {
  if (workspace && existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
  workspace = undefined;
});

function createFullHarness2Workspace(): { workspace: string; overlay: string } {
  workspace = mkdtempSync(path.join(tmpdir(), "harness2-test-"));
  const overlay = path.join(workspace, "harness");
  mkdirSync(overlay, { recursive: true });

  writeFileSync(
    path.join(overlay, "harness.json"),
    JSON.stringify({ kit: "harness-kit", version: "2.0.0", out: ".harness" }, null, 2),
  );

  writeFileSync(
    path.join(overlay, "project.json"),
    JSON.stringify({
      name: "harness2-project",
      runtimes: ["antigravity", "claude-code", "gemini-cli", "opencode"],
      gate: "npm test",
    }, null, 2),
  );

  // 1. system_prompt
  writeFileSync(path.join(overlay, "systemprompt.md"), "# System Prompt\n\nBase instructions.\n");

  // 2. guardrails (soft)
  writeFileSync(path.join(overlay, "guardrails.local.md"), "# Local Guardrails\n\n- Soft operational rule.\n");

  // 3. memory (LongTermMEMORY + experience_library.jsonl)
  writeFileSync(path.join(overlay, "LongTermMEMORY.md"), "# LongTermMEMORY\n\n- [verified 2026-11-02 | src: test] Fact.\n");
  writeFileSync(
    path.join(overlay, "experience_library.jsonl"),
    JSON.stringify({
      id: "exp-001",
      timestamp: "2026-11-02T10:00:00Z",
      task: "offline-sync",
      proposal: "increase retry backoff",
      probe_result: "success",
      lesson: "exponential backoff avoids sqlite locking under contention",
      verified: true,
    }) + "\n",
  );

  // 4. tool_guidance (local)
  writeFileSync(path.join(overlay, "tool_guidance.local.md"), "# Local Tool Guidance\n\n- Bounded reads on large db tables.\n");

  // 5. subagents (overlay)
  const subagentDir = path.join(overlay, "subagents");
  mkdirSync(subagentDir, { recursive: true });
  writeFileSync(
    path.join(subagentDir, "domain-auditor.md"),
    "---\nname: domain-auditor\ndescription: Domain auditor subagent\n---\n\nAuditor instructions.\n",
  );

  // 6. skills (overlay)
  const skillDir = path.join(overlay, "skills", "domain-skill");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    path.join(skillDir, "SKILL.md"),
    "---\nname: domain-skill\ndescription: Domain skill\nautotrigger: domain operation required\n---\n\n# Domain Skill\n",
  );

  // 7. scripts (overlay)
  const scriptsDir = path.join(overlay, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  writeFileSync(
    path.join(scriptsDir, "local-check.sh"),
    "#!/usr/bin/env bash\n# Runs custom repository integrity check\necho ok\n",
  );

  return { workspace, overlay };
}

describe("Harness²: 8-Component Architecture", () => {
  it("renderiza todos los 8 componentes sin error y con salida válida", () => {
    const { workspace: ws, overlay } = createFullHarness2Workspace();

    const stdout = execFileSync(process.execPath, [renderScript, overlay], { encoding: "utf8" });
    expect(stdout).toContain("harness render OK");

    const agents = readFileSync(path.join(ws, "AGENTS.md"), "utf8");

    // Componente 1: System prompt
    expect(agents).toContain("System Prompt");

    // Componente 2: Guardrails (Core Invariants + Soft Local)
    expect(agents).toContain("Core Guardrails (Invariants)");
    expect(agents).toContain("Local Guardrails");

    // Componente 3: Memory & Experience Library
    expect(agents).toContain("LongTermMEMORY");
    expect(agents).toContain("Experience Library (Harness²)");
    expect(agents).toContain("exponential backoff avoids sqlite locking under contention");

    // Componente 4: Tool guidance local
    expect(agents).toContain("Local Tool Guidance");
    expect(agents).toContain("Bounded reads on large db tables");

    // Componente 6: Skills
    expect(agents).toContain("- When domain operation required, load the domain-skill skill.");

    // Componente 7: Scripts locales en el índice
    expect(agents).toContain("Runs custom repository integrity check");

    // Componente 5: Subagentes materializados en los runtimes
    expect(existsSync(path.join(ws, ".claude", "agents", "domain-auditor.md"))).toBe(true);
    expect(existsSync(path.join(ws, ".gemini", "agents", "domain-auditor.md"))).toBe(true);
    expect(existsSync(path.join(ws, ".opencode", "agents", "domain-auditor.md"))).toBe(true);
    expect(existsSync(path.join(ws, ".agents", "agents", "domain-auditor.md"))).toBe(true);
  });

  it("rechaza entradas malformadas en experience_library.jsonl", () => {
    const { overlay } = createFullHarness2Workspace();
    writeFileSync(path.join(overlay, "experience_library.jsonl"), "not a json line\n");

    expect(() => {
      execFileSync(process.execPath, [renderScript, overlay], { stdio: ["ignore", "pipe", "pipe"] });
    }).toThrow();
  });

  it("filtra experience_library.jsonl según .harness/scope.json", () => {
    const { workspace: ws, overlay } = createFullHarness2Workspace();
    const dotHarness = path.join(ws, ".harness");
    mkdirSync(dotHarness, { recursive: true });
    writeFileSync(path.join(dotHarness, "scope.json"), JSON.stringify({ scope: ["database"] }));

    writeFileSync(
      path.join(overlay, "experience_library.jsonl"),
      JSON.stringify({
        id: "exp-ui",
        task: "modal ui fix",
        lesson: "modal state requires single lock",
        tags: ["ui"],
        verified: true,
      }) + "\n" +
      JSON.stringify({
        id: "exp-db",
        task: "database rpc fix",
        lesson: "rpc requires default null in postgres",
        tags: ["database"],
        verified: true,
      }) + "\n",
    );

    const stdout = execFileSync(process.execPath, [renderScript, overlay], { encoding: "utf8" });
    expect(stdout).toContain("harness render OK");

    const agents = readFileSync(path.join(ws, "AGENTS.md"), "utf8");
    expect(agents).toContain("rpc requires default null in postgres");
    expect(agents).not.toContain("modal state requires single lock");
  });
});
