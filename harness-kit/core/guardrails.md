# Core Guardrails (Invariants)

Universal invariants across all runtimes; each negative rule maps to a guard check.

## Always
- Read a file before editing it; understand the surrounding context first.
- Keep every change surgical, minimal and strictly scoped to the task (Karpathy).
- Re-run the project gate before declaring a task completed or opening a PR (zero stale claims).

## Ask First
- Adding any external dependency to the project manifest (Ponytail).
- Modifying public APIs, interfaces or schemas outside the issue's stated scope.

## Never (Enforced by Guard)
- Destructive: `git push --force`/`+branch`, `git reset --hard`, `git clean -fd`, `rm -rf`, `sudo` (rules: `git.force-push`, `git.reset-hard`, `git.clean-force`, `shell.rm-rf`, `shell.sudo`).
- Secrets: never read or commit `.env*` (only `.env.example|.sample|.template`) (rule: `fs.env-leak`), nor `*.pem`/`*.key` (rule: `read.sensitive`).
- Bloat: never read `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `.next/`, `node_modules/`, `dist/`, `build/` (rule: `fs.bloatware`).
- Unbounded: never read or `cat` >300-line files without limits (rules: `read.oversize`, `shell.oversize-cat`).
- Harness: never modify guard/git hooks or runtime settings unauthorized (rule: `fs.protected`), nor hand-edit generated files (rule: `write.generated`).
- No `gh pr create` without a valid `harness-gate.sh` seal (rule: `pr.requires-seal`).
