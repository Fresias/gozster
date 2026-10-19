# Core Guardrails (Invariants)

Universal invariants enforced across all supported runtimes. Every negative rule maps to a deterministic guard check.

## Always
- Read a file before editing it; understand the surrounding context first.
- Keep every change surgical, minimal and strictly scoped to the task (Karpathy).
- Re-run the project gate before declaring a task completed or opening a PR (zero stale claims).

## Ask First
- Adding any external dependency to the project manifest (Ponytail).
- Modifying public APIs, interfaces or schemas outside the issue's stated scope.

## Never (Enforced by Guard)
- Destructive git and shell commands: `git push --force`, `git push origin +branch`, `git reset --hard`, `git clean -fd`, `rm -rf`, `sudo` (rule: `shell.destructive`).
- Reading or exposing secrets: never read or commit `.env*` files, except `.env.example`, `.env.sample`, `.env.template` (rule: `fs.env-leak`).
- Reading entire lockfiles or massive build outputs: never read `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `.next/`, `node_modules/`, `dist/`, `build/` (rule: `fs.bloatware`).
- Unbounded file reading: never read files exceeding 300 lines without specifying line limits/offsets (rule: `read.oversize`).
- Altering the harness integrity: never modify or bypass guard hooks, runtime settings or git hooks without explicit authorization (rule: `fs.protected`).
