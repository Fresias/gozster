# harness-kit

Project-agnostic agent harness based on the **Harness² architecture** (Google Research): recursive agent harnessing in open-world environments. Provides dual-layer separation between inviolable safety invariants (Hard Core) and 8 runtime-editable components (Soft Harness) compiled into runtime configs for Claude Code, Gemini CLI, OpenCode and Antigravity. Version: see `VERSION`.

## Harness² 8-Component Architecture

The harness structures the agent wrapper into 8 modular components exposed around the frozen model:

1. **`system_prompt`** (`harness/systemprompt.md` / `core/templates/systemprompt.md.tmpl`): Persona, role boundaries, project goals and verified execution commands.
2. **`guardrails`**:
   - **Hard Core Invariants (`core/guard/`):** Inviolable rules enforced by hooks (shell sanitization, no `rm -rf`, no `git push --force`, no secrets leak, size limits).
   - **Soft Guardrails (`harness/guardrails.local.md`):** Mutable operational constraints adapted to specific task contexts.
3. **`memory`**:
   - **Verified Facts (`harness/LongTermMEMORY.md`):** Verified environment facts (`[verified <date> | src: <source>]`).
   - **Experience Library (`harness/experience_library.jsonl`):** Episodic knowledge accumulated across task executions (`task`, `proposal`, `probe_result`, `lesson`, `verified`).
4. **`tool_guidance`** (`core/tool_guidance.md` + `harness/tool_guidance.local.md`): Execution rules, bounded inspection, scan-before-read and tool conventions.
5. **`subagents`** (`core/subagents/` + `harness/subagents/`): Task-specialized subagents materialized with native frontmatter across all supported runtimes.
6. **`skills`** (`core/skills/` + `harness/skills/`): Domain procedures with declarative `autotrigger` declarations.
7. **`scripts`** (`core/scripts/` + `harness/scripts/`): Reusable and ad-hoc scripts for verification and automation, indexed into `AGENTS.md`.
8. **`plugins`** (`core/plugins/` + `harness/plugins/`): Runtime-level extensions and hooks.

## Propose-Probe-Compose (PPC) Reflexive Loop

Harness² optimizes the execution harness dynamically without requiring ground-truth labels:

1. **Propose (`core/subagents/harness-proposer.md`):** Generates surgical candidate mutations targeting the 8 components for unseen tasks.
2. **Probe (`core/scripts/harness-probe.mjs`):** Tests candidates in isolated ephemeral git branches (`probe/<id>-<timestamp>`). Measures duration, errors, and pass/fail status, then restores the original branch and cleans up.
   ```bash
   node harness-kit/core/scripts/harness-probe.mjs --candidate ./candidate.json --probe-cmd "npm test" --json
   ```
3. **Compose:** Evaluates probe behavioral traces and selects winning configurations, persisting verified lessons to `harness/experience_library.jsonl`.

## Repository Layout

- `core/` — Agnostic contracts: guardrails, tool guidance, guard (`guard/`), runtime contracts (`runtimes/`), scripts, skills, subagents, templates.
- `adapters/<name>/` — Optional layers (e.g. `supabase`, `multica`).
- `tests/` — Vitest specs for the kit.

The consuming repo keeps its own overlay in `harness/` (`project.json`, `harness.json`, `systemprompt.md`, `guardrails.local.md`, `LongTermMEMORY.md`, `experience_library.jsonl`, `tool_guidance.local.md`, `subagents/`, `skills/`, `scripts/`, `plugins/`).

## Add to a new repo

Requires a Node repo with a `package.json` (`bootstrap.mjs` derives the default gate from its `scripts`).

```bash
npm init -y   # only if the repo has no package.json yet
git subtree add --prefix=harness-kit https://github.com/Fresias/harness.git v2.0.0 --squash
node harness-kit/core/skills/harness-bootstrap/bootstrap.mjs . --name <project> --gate "npm test && npm run typecheck"
node harness-kit/core/scripts/harness-render.mjs
bash harness-kit/core/scripts/harness-init.sh
```

`bootstrap.mjs` writes the complete 8-component `harness/` overlay from `core/templates/`. The render generates `AGENTS.md`, `CLAUDE.md` and the runtime configs; never edit those by hand.

## Update the kit

```bash
git subtree pull --prefix=harness-kit https://github.com/Fresias/harness.git <tag> --squash
node harness-kit/core/scripts/harness-render.mjs
node harness-kit/core/scripts/harness-render.mjs --check
```

Keep `harness/harness.lock` `kitVersion` equal to `VERSION`. Changes to the kit made inside a consumer go back upstream with `git subtree push --prefix=harness-kit <remote> <branch>` and a PR.

## Gate

```bash
node harness-kit/core/scripts/harness-render.mjs --check   # drift
bash harness-kit/core/scripts/harness-gate.sh              # project gate + seal
```
