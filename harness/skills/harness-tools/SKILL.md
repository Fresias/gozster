---
name: harness-tools
description: Catálogo de scripts del arnés y guía operativa de herramientas (el listado de scripts se inyecta automáticamente al renderizar).
autotrigger: you need harness helper scripts or CLI tool guides
---

# harness-tools

Catálogo auto-generado de scripts del arnés (`harness-kit/core/scripts/` y `harness/scripts/`). Ejecutar vía `bash` o `node`.

## PRs y esperas
- **Estado de PR (una sola llamada, solo lectura):** `node harness-kit/core/scripts/harness-pr-status.mjs [<pr|rama>] [--json]` — resume sello, atraso respecto de `main`, checks (OK / fallidos / pendientes), etiqueta `harness-authorized`, revisión, `merge-check` y un único «Próximo paso» (≤ 25 líneas).
- **Esperar CI sin polling:** `node harness-kit/core/scripts/harness-pr-status.mjs [<pr|rama>] --wait-checks [--timeout 30m]` (una sola llamada bloqueante sobre `gh pr checks --watch --interval 30`, con corte interno por `--timeout`) o `multica issue wakeup create --until-pr checks`.
- **Esperas por hijos o estados en Multica:** usar `--until-children-done` o `--until-status` en lugar de bucles o reintentos.
- **Esperas activas (`shell.polling`):** el guard bloquea `Start-Sleep`, `sleep`, `timeout /t` y `ping -n <n> 127.0.0.1` en bucles, combinados con `gh`/`multica` o mayores a 5 s sin verificación local. Para esperar un servidor local en E2E (> 5 s), juntá la espera y la verificación (`Invoke-WebRequest`/`curl`/`Test-NetConnection`/`Get-NetTCPConnection` contra `localhost` o `127.0.0.1`) en un solo comando (permitido y registrado como `shell.wait`).

<!-- BEGIN GENERATED:HELPER_SCRIPTS -->
<!-- Auto-populated by harness-render.mjs into .claude/skills/harness-tools/SKILL.md and .agents/skills/harness-tools/SKILL.md -->
<!-- END GENERATED:HELPER_SCRIPTS -->
