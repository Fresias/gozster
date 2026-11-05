# Tool Guidance & Execution Rules

## File Exploration & Editing
- **Scan-before-read:** Locate target range with `rg -n` before reading.
- **Bounded reading:** Files >300 lines require `offset`+`limit` (≤200) or `StartLine`+`EndLine` (≤300).
- **Time-to-First-Edit (TTFE):** Aim to read and edit within ≤5 tool calls.
- **Quiet inspection:** Prefer `git diff --stat` or `git status -s` before full diffs.

## Test & Gate Workflow
- **Iterative development:** Run ONLY affected test file (`npx vitest run <path/to/spec.ts>`).
- **Zero stale claims:** Never skip tests, mark `.skip`/`.todo`, or relax assertions.
