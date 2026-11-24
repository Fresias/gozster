# Core Guardrails (Invariants)

## Always
- Read file before editing; understand context first.
- Surgical, minimal changes strictly scoped to task (Karpathy).
- Run project gate before declaring task done or opening PR (zero stale claims).

## Ask First
- Adding external dependency to manifest (Ponytail).
- Modifying public APIs or schemas outside stated scope.

## Never (Enforced by Guard)
- Guard blocks destructive commands, secrets, bloatware, unbounded reads, harness tampering, and unsealed PRs — returning `ruleId` and recommended action (rules: `git.force-push`, `fs.env-leak`, `fs.bloatware`, `read.oversize`, `fs.protected`, `pr.requires-seal`).
