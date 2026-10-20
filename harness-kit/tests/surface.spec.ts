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

  it("documenta que opencode soporta post mutando output.output (plugin en proceso)", () => {
    const opencodePath = path.join(runtimesDir, "opencode.json");
    const opencode = JSON.parse(readFileSync(opencodePath, "utf8"));

    // OpenCode no tiene hooks de shell: inyecta en proceso mutando output.output.
    expect(opencode.hooks.post.event).toBe("tool.execute.after");
    expect(opencode.hooks.post.inject_verified).toBe(true);
    expect(opencode.hooks.post.inject).toContain("output.output");
  });
});

// H-08 — Verificación de superficie: matriz reglas (§4.4/§4.5) × runtimes.
// Criterio de aceptación:
// GIVEN la matriz de §4.4/§4.5 × runtimes THEN cada celda tiene un test o está
// marcada `unsupported` con evidencia.
//
// Cada fila declara, por runtime, dónde se verifica la flecha pre (§4.4) y la
// flecha result/post (§4.5). Las celdas `unsupported` apuntan a la evidencia
// documental en el propio runtime config. Las celdas soportadas apuntan al
// spec que las ejercita; el test exige que ese spec exista en disco.
describe("H-08: Matriz reglas (§4.4 pre / §4.5 post) × runtimes", () => {
  interface Cell {
    /** `true` si el runtime soporta la flecha; `false` => debe haber evidencia unsupported. */
    supported: boolean;
    /** Spec que ejercita la celda (soportada) — debe existir en disco. */
    evidenceSpec?: string;
    /** Clave en el runtime config que justifica `unsupported`. */
    unsupportedEvidence?: string;
  }

  const matrix: Record<string, { pre: Cell; post: Cell }> = {
    "antigravity": {
      pre: { supported: true, evidenceSpec: "guard-core.spec.ts" },
      post: { supported: false, unsupportedEvidence: "post_detail" },
    },
    "claude-code": {
      pre: { supported: true, evidenceSpec: "guard-cli.contract.spec.ts" },
      post: { supported: true, evidenceSpec: "guard-cli.contract.spec.ts" },
    },
    "gemini-cli": {
      pre: { supported: true, evidenceSpec: "guard-core.spec.ts" },
      post: { supported: true, evidenceSpec: "guard-cli.contract.spec.ts" },
    },
    "opencode": {
      pre: { supported: true, evidenceSpec: "opencode-plugin.spec.ts" },
      post: { supported: true, evidenceSpec: "opencode-plugin.spec.ts" },
    },
  };

  const runtimes = Object.keys(matrix);

  it("cubre exactamente los 4 runtimes con un config en core/runtimes", () => {
    for (const rt of runtimes) {
      const cfgPath = path.join(runtimesDir, `${rt}.json`);
      const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
      expect(cfg.runtime).toBe(rt);
    }
  });

  for (const [rt, row] of Object.entries(matrix)) {
    describe(`runtime: ${rt}`, () => {
      const cfg = JSON.parse(
        readFileSync(path.join(runtimesDir, `${rt}.json`), "utf8"),
      );

      it("celda §4.4 (pre): soportada con spec existente en disco", () => {
        const cell = row.pre;
        // La flecha pre es universal: todos los runtimes la soportan.
        expect(cell.supported).toBe(true);
        expect(cfg.hooks.pre).toBeDefined();
        const specPath = path.join(here, cell.evidenceSpec!);
        expect(readFileSync(specPath, "utf8").length).toBeGreaterThan(0);
      });

      it("celda §4.5 (post): test o `unsupported` con evidencia", () => {
        const cell = row.post;
        if (cell.supported) {
          expect(cfg.hooks.post).not.toBe("unsupported");
          const specPath = path.join(here, cell.evidenceSpec!);
          expect(readFileSync(specPath, "utf8").length).toBeGreaterThan(0);
        } else {
          // Celda unsupported: debe estar marcada Y tener evidencia documental.
          expect(cfg.hooks.post).toBe("unsupported");
          const evidence = cfg.hooks[cell.unsupportedEvidence!];
          expect(typeof evidence).toBe("string");
          expect(evidence.length).toBeGreaterThan(0);
        }
      });
    });
  }
});
