# Tool Guidance & Execution Rules

## File Exploration & Editing
- **Scan-before-read:** `rg -n` before reading.
- **Bounded reading:** Files >300 lines require `offset`+`limit` (≤200) or `StartLine`+`EndLine` (≤300).
- **Al empezar:** `node harness-kit/core/scripts/harness-context.mjs`; TTFE ≤5 calls.
- **Quiet git:** `git diff --stat`, `git status -s`.

## Test & Gate Workflow
- **Iterative development:** Run ONLY affected test file (`npx vitest run <path/to/spec.ts>`).
- **Zero stale claims:** Never skip tests, mark `.skip`/`.todo`, or relax assertions.
