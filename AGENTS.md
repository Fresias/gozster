# GOZSter — System Prompt & Guidelines

## Product Vision & Architecture
GOZSter: **Coach Studio** (Desktop/Web) y **Athlete App** (PWA/Offline-First) con Supabase, Zustand y Next.js 15.

## Verified Commands & Gate
- `npm ci`, `npm run dev`, `npm run build`, `npm run typecheck`, `npm test`, `npx vitest run`, `npm run seed:mynter`.
- Gate: `npm test && npm run typecheck && npm run lint && npm run build`.

## Governance & Roles
- Squad: @backend-eng, @frontend-eng, @qa-eng. Ramas `feature/<issue-#>-slug` o `fix/<issue-#>-slug`. Commits convencionales.
- Merge a main: solo @PM-GOZster tras CI en verde y APPROVED de @qa-eng.
- Review: @qa-eng aplica el protocolo de 6 niveles (`review-selection.md`) en cada PR.

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

# Multica Guardrails

## Invariants
- **Daemon protection:** Never kill `multica` by name. Check `multica daemon status --output json`; kill child PID only (`multica.daemon-protect`).
- **Foreground blocking:** Never exit turn "standing by"; run work synchronously in blocking calls.
- **Windows comment encoding:** Comments go to UTF-8 file in workdir, post via `--content-file`, delete on success.

# GOZSter Local Guardrails

## Database & UI Contracts
- supabase/migrations/: strictly append-only, never edit/delete (db.append-only). Explicit RLS.
- Zero references to "Mynter" (ADR-005).
- Canonical UI: docs/ux-ui-review/objetivo/html/*.html. Zero demo data (`assertNoDemoLiteralsInLiveMode`).

## QA & Review Rounds
- **QA CHANGES_REQUESTED r1/2:** set stage in_progress, comment blocker + round N/2 @mentioning assignee; QA issue `todo` until in_review.
- **Round 2/2:** set `blocked` and @mention Gabriel with summary of rejections.

## Harness² Flow (guard + merge check)
- PR: `harness-learn.sh --lesson "..."` + commit `harness/experience/<ISSUE>.jsonl`; `harness-gate.sh`; paste `harness-gate.sh --pr-block` in the PR body.
- Harness changes: only branch `chore/<#>-harness-<slug>` (PM), PPC (`harness-probe.mjs` → `harness-compose.mjs --task <ISSUE>`), label `harness-authorized`.
- Encoding: UTF-8, no BOM. PowerShell: no backtick strings, no `Set-Content`; use Write/Edit.

## Skills

- When the repository has no harness/project.json or the user asks to set up the harness, load the harness-bootstrap skill.
- When a task touches training domain terms (planes, días de rutina, ejercicios en rutina, superseries, sesiones, series, 1RM, RPE) or business rules, load the gozster-domain skill.

# LongTermMEMORY

- [verified 2026-11-08 | src: GOZS-428] Lessons per issue live in `harness/experience/<ISSUE>.jsonl`; search them first: `rg -n <term> harness/experience`.

- [verified 2026-11-09 | src: PPC] Rutas de memoria son escribibles y rechazan .. y %2e.

### Experience Library (Harness²)

- [lesson 2026-11-06 | task: GOZS-389] Stage 5 (#385): Suite WCAG 2.1 AA verificando contraste >= 4.5:1, navegacion por teclado, aria-label y estados con texto.
- [lesson 2026-11-06 | task: GOZS-399] Stage 4 (#390): Sheet lateral de clase (coach, barra cupos, Cupo lleno) y Dialog de cancelacion con forceMount SSR.

# Tool Guidance & Execution Rules

## File Exploration & Editing
- **Scan-before-read:** Locate target range with `rg -n` before reading.
- **Bounded reading:** Files >300 lines require `offset`+`limit` (≤200) or `StartLine`+`EndLine` (≤300).
- **Time-to-First-Edit (TTFE):** Read and edit within ≤5 tool calls.
- **Quiet inspection:** Prefer `git diff --stat` or `git status -s`.

## Test & Gate Workflow
- **Iterative development:** Run ONLY affected test file (`npx vitest run <path/to/spec.ts>`).
- **Zero stale claims:** Never skip tests, mark `.skip`/`.todo`, or relax assertions.

# Multica CLI Guidance (Anti-Token-Waste)

## Command Rules
- **Bounded queries:** `multica issue list` with JSON requires `--limit` (≤15).
- **Bounded search:** never run `multica issue search` without `--project <id>`.
- **Scan-Then-Expand:** scan roots (`--roots-only --summary --compact`), expand (`--thread <id> --tail 10 --compact`).
- **Payloads:** long text uses `--description-file`/`--content-file` in workdir, never `/tmp`.
- **Streams:** never merge `stderr` into `stdout` (`2>&1`) with JSON.
- **Multi-stage issues:** pass `--pr-auto-complete off` on `multica issue create` for multi-stage tasks to prevent premature auto-close before QA audit.

## Comment Discipline (No-Action, No-Reply)
- **No action, no comment:** if wakeup needs no action (acks, thanks, echoes), end run without commenting.
- **No ack mentions:** never @mention without needed action; no repeated mentions, sleeps, or polls.
- **One hand-off:** deliver state once to squad/leader; native queue enqueues without task loss.

## Terminal States (Stop the Loop)
- **Retries (max 2):** 2 tries max; on 2nd failure, set `blocked` with evidence; no retry loops or polls.
- **Hand-off, no start:** hand off once to squad/leader (native squad queue enqueues without task loss); record goal, changes, evidence, risks, name ONE next action, end run.
- **Waits by condition only:** condition wakeups (`--until-pr checks`/`--until-children-done`/`--until-status`); no sleep, poll, or wakeup polling.

- **RPCs (GOZS-331):** Defaults explícitos ('DEFAULT NULL') en SQL, opcionales en TS.
- **Modales (GOZS-321):** isSaving atómico + submit deshabilitado para evitar carreras.

# Helper scripts (run via bash)

- `harness-kit/core/scripts/harness-compose.mjs`: Evaluates probe traces, selects the winning harness and updates experience library.
- `harness-kit/core/scripts/harness-contrast.mjs`: Contrasts candidate harness probe reports and selects winning configuration (Harness²).
- `harness-kit/core/scripts/harness-gate.sh`: Full gate: append-only, drift + encoding, issue lesson, project gate commands, writes .harness/complete.json.
- `harness-kit/core/scripts/harness-init.sh`: Setup in one call: git identity, deps, harness status, optional scope.
- `harness-kit/core/scripts/harness-learn.sh`: Learner: persists the issue lesson to harness/experience/<ISSUE>.jsonl (runs on the PR branch; gate and merge require it).
- `harness-kit/core/scripts/harness-merge-check.mjs`: Merge gate: PR seal == PR head, issue lesson in the PR, PPC + label for harness changes.
- `harness-kit/core/scripts/harness-probe.mjs`: Runs candidate harness probes on isolated ephemeral git branches (Harness² PPC).
- `harness-kit/core/scripts/harness-propose.mjs`: Analyzes accumulated lessons, clusters friction and proposes PPC candidate mutations (Harness²).
- `harness-kit/core/scripts/harness-render.mjs`: Harness compiler & drift checker (H-03).
- `harness-kit/core/scripts/harness-telemetry.mjs`: Aggregates guard telemetry (.harness/telemetry/events.jsonl) into a summary:
