# Tool Guidance & Execution Rules

## File Exploration & Editing
- **Scan-before-read:** Locate the exact target range first using `rg -n` or grep before reading file contents.
- **Bounded reading:** For files > 300 lines, always supply `offset` + `limit` (max 200 lines) or `StartLine` + `EndLine` (max 300 lines).
- **Time-to-First-Edit (TTFE):** Aim to read and make the first edit within ≤ 5 tool calls. Avoid wandering through unrelated directories.
- **Quiet inspection:** Prefer quiet flags like `git diff --stat` or `git status -s` before requesting full diffs.

## Test & Gate Workflow
- **Iterative development:** While working, execute ONLY the single test file affected by the change (e.g. `npx vitest run <path/to/spec.ts>`).
- **Final gate:** As the final step before handing off work, creating a PR, or requesting review, execute the full project gate synchronously.
- **Zero stale claims:** Never skip tests, mark tests `.skip` or `.todo`, or relax assertions to mask failures.
