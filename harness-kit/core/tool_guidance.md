# Tool Guidance & Execution Rules

## File Exploration & Editing
- **Scan-before-read:** Locate the exact target range with `rg -n` before reading.
- **Bounded reading:** For files > 300 lines, supply `offset` + `limit` (≤ 200) or `StartLine` + `EndLine` (≤ 300).
- **Time-to-First-Edit (TTFE):** Aim to read and make the first edit within ≤ 5 tool calls.
- **Quiet inspection:** Prefer quiet flags like `git diff --stat` or `git status -s` before requesting full diffs.

## Test & Gate Workflow
- **Iterative development:** Run ONLY the affected test file (`npx vitest run <path/to/spec.ts>`).
- **Zero stale claims:** Never skip tests, mark tests `.skip` or `.todo`, or relax assertions to mask failures.
