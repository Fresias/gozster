# Core Guardrails (Invariants)

## Always
- Read file before editing; understand context first.
- Surgical, minimal changes strictly scoped to task (Karpathy).
- Run project gate before declaring task done or opening PR (zero stale claims).

## Ask First
- Adding external dependency to manifest (Ponytail).
- Modifying public APIs or schemas outside stated scope.

## Never (Enforced by Guard)
- Destructive: `git push --force`/`+branch`, `git reset --hard`, `git clean -fd`, `rm -rf`, `sudo` (rules: `git.force-push`, `git.reset-hard`, `shell.rm-rf`, `shell.sudo`).
- Secrets: never read or commit `.env*` (only `.env.example|.sample|.template`) (rule: `fs.env-leak`), nor `*.pem`/`*.key` (rule: `read.sensitive`).
- Bloat: never read `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `.next/`, `node_modules/`, `dist/`, `build/` (rule: `fs.bloatware`).
- Unbounded: never read or `cat` >300-line files without limits (rules: `read.oversize`, `shell.oversize-cat`).
- Harness: never modify guard/git hooks or settings unauthorized (rule: `fs.protected`), nor hand-edit generated files (rule: `write.generated`).
- No `gh pr create` without a valid `harness-gate.sh` seal (rule: `pr.requires-seal`).
