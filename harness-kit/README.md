# harness-kit

Project-agnostic agent harness: guardrails, guard hooks and runtime configs for Claude Code, Gemini CLI, OpenCode and Antigravity, rendered from a single source of truth. Version: see `VERSION`.

- `core/` — agnostic contracts: guardrails, tool guidance, guard (`guard/`), runtime contracts (`runtimes/`), scripts, skills, subagents, templates.
- `adapters/<name>/` — optional layers (e.g. `supabase`, `multica`).
- `tests/` — Vitest specs for the kit.

The consuming repo keeps its own overlay in `harness/` (`project.json`, `harness.json`, `systemprompt.md`, `guardrails.local.md`, `LongTermMEMORY.md`, `rules.local.json`, `skills/`).

## Add to a new repo

```bash
git subtree add --prefix=harness-kit https://github.com/Fresias/harness.git v2.0.0 --squash
node harness-kit/core/skills/harness-bootstrap/bootstrap.mjs . --name <project> --gate "npm test && npm run typecheck"
node harness-kit/core/scripts/harness-render.mjs
bash harness-kit/core/scripts/harness-init.sh
```

`bootstrap.mjs` writes the `harness/` overlay from `core/templates/` (the `harness-bootstrap` skill drives it conversationally). The render generates `AGENTS.md`, `CLAUDE.md` and the runtime configs; never edit those by hand.

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
