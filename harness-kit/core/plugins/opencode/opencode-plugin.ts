/**
 * opencode-plugin.ts
 * In-process OpenCode plugin consuming guard-core engine (D6).
 * Enforces identical verdicts to guard-cli for canonical inputs.
 */

// @ts-expect-error - mjs module
import { evaluateRules, findRepoRoot } from "../../guard/guard-core.mjs";
// @ts-expect-error - mjs module
import { normalize } from "../../guard/normalize.mjs";

export interface OpenCodeContext {
  directory?: string;
  worktree?: string;
  client?: unknown;
  project?: unknown;
  experimental_workspace?: unknown;
  serverUrl?: string;
  $?: unknown;
  [key: string]: unknown;
}

export interface OpenCodeBeforeInput {
  tool: string;
  sessionID?: string;
  callID?: string;
  [key: string]: unknown;
}

export interface OpenCodeBeforeOutput {
  args: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenCodeAfterInput {
  tool: string;
  sessionID?: string;
  callID?: string;
  args?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface OpenCodeAfterOutput {
  output?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GuardEvaluationResult {
  allowed: boolean;
  reason?: string;
  ruleId?: string;
  inject?: boolean;
  context?: string;
}

/**
 * Evaluates OpenCode tool.execute.before hook in-process.
 * Throws an Error if the action is blocked by rules.
 */
async function handleBefore(
  input: OpenCodeBeforeInput,
  output: OpenCodeBeforeOutput,
  ctx?: OpenCodeContext,
): Promise<GuardEvaluationResult> {
  const normalized = normalize(
    { input, output },
    { runtime: "opencode", phase: "pre" },
  );
  const repoRoot = ctx?.directory || ctx?.worktree || findRepoRoot();
  const result: GuardEvaluationResult = evaluateRules(normalized, {
    repoRoot,
    runtime: "opencode",
  });

  if (!result.allowed) {
    const reason = result.reason || "Action blocked by harness guard";
    const err = new Error(reason) as Error & {
      ruleId?: string;
      verdict?: GuardEvaluationResult;
    };
    err.ruleId = result.ruleId;
    err.verdict = result;
    throw err;
  }

  return result;
}

/**
 * Evaluates OpenCode tool.execute.after hook in-process.
 * Injects context instructions into output.output when required by rules.
 */
async function handleAfter(
  input: OpenCodeAfterInput,
  output: OpenCodeAfterOutput,
  ctx?: OpenCodeContext,
): Promise<GuardEvaluationResult> {
  const normalized = normalize(
    { input, output },
    { runtime: "opencode", phase: "post" },
  );
  const repoRoot = ctx?.directory || ctx?.worktree || findRepoRoot();
  const result: GuardEvaluationResult = evaluateRules(normalized, {
    repoRoot,
    runtime: "opencode",
  });

  if (result.inject && result.context) {
    if (typeof output.output === "string" && output.output.length > 0) {
      output.output = output.output.endsWith("\n")
        ? `${output.output}${result.context}\n`
        : `${output.output}\n${result.context}`;
    } else {
      output.output = result.context;
    }
  }

  return result;
}

/**
 * OpenCode plugin. Single export on purpose: OpenCode loads every exported
 * function of the module as a plugin, so extra exports would register hooks twice.
 */
export const HarnessPlugin = async (ctx?: OpenCodeContext) => ({
  "tool.execute.before": async (
    input: OpenCodeBeforeInput,
    output: OpenCodeBeforeOutput,
  ) => handleBefore(input, output, ctx),
  "tool.execute.after": async (
    input: OpenCodeAfterInput,
    output: OpenCodeAfterOutput,
  ) => handleAfter(input, output, ctx),
});
