---
name: harness-tools
description: Catálogo de scripts del arnés y guía operativa de herramientas (el listado de scripts se inyecta automáticamente al renderizar).
autotrigger: you need harness helper scripts or CLI tool guides
---

# harness-tools

Catálogo auto-generado de scripts del arnés (`harness-kit/core/scripts/` y `harness/scripts/`). Ejecutar vía `bash` o `node`.

<!-- BEGIN GENERATED:HELPER_SCRIPTS -->
## Helper scripts (run via bash)

- `harness-kit/core/scripts/harness-compose.mjs`: Evaluates probe traces, selects the winning harness and updates experience library.
- `harness-kit/core/scripts/harness-contrast.mjs`: Contrasts candidate harness probe reports and selects winning configuration (Harness²).
- `harness-kit/core/scripts/harness-debt-notify.mjs`: Notifies Multica webhook on lesson debt threshold (>=8).
- `harness-kit/core/scripts/harness-gate.sh`: Full gate: append-only, drift + encoding, issue lesson, project gate commands, writes .harness/complete.json.
- `harness-kit/core/scripts/harness-init.sh`: Setup in one call: git identity, deps, harness status, optional scope.
- `harness-kit/core/scripts/harness-learn.sh`: Learner: persists the issue lesson to harness/experience/<ISSUE>.jsonl (runs on the PR branch; gate and merge require it).
- `harness-kit/core/scripts/harness-merge-check.mjs`: Merge gate: PR seal == PR head, issue lesson in the PR, PPC + label for harness changes.
- `harness-kit/core/scripts/harness-probe.mjs`: Runs candidate harness probes on isolated ephemeral git branches (Harness² PPC).
- `harness-kit/core/scripts/harness-propose.mjs`: Analyzes accumulated lessons, clusters friction and proposes PPC candidate mutations (Harness²).
- `harness-kit/core/scripts/harness-render.mjs`: Harness compiler & drift checker (H-03).
- `harness-kit/core/scripts/harness-telemetry.mjs`: Aggregates guard telemetry (<git common dir>/harness/telemetry/events.jsonl) into a summary:
<!-- END GENERATED:HELPER_SCRIPTS -->
