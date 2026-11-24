---
name: harness-tools
description: Catálogo de scripts del arnés y guía operativa de herramientas (el listado de scripts se inyecta automáticamente al renderizar).
autotrigger: you need harness helper scripts or CLI tool guides
---

# harness-tools

Catálogo auto-generado de scripts del arnés (`harness-kit/core/scripts/` y `harness/scripts/`) y protocolo operativo de herramientas CLI. Ejecutar vía `bash` o `node`.

## Al empezar una tarea
- **Una sola llamada antes de explorar:** `node harness-kit/core/scripts/harness-context.mjs [--issue <PREFIX-n>] [--max-lines 150] [--json]`
  Devuelve en ≤ 150 líneas: rama (`git status -sb`, adelante/atrás de `origin/main` sin repetir `fetch` si se hizo hace < 10 min, `git diff --stat` contra merge-base), issue (vía `multica-ctx`), PR (vía `harness-pr-status`, o «sin PR»), hasta 5 lecciones de `harness/experience/`, última migración y `.harness/scope.json`. El issue sale de `--issue` o del número de la rama.
- Reemplaza la ronda inicial de `git status/diff/log`, `gh pr view` y `multica issue get`/`comment list`. Si falta Multica, `gh` o la red, esa sección dice qué falta y el script termina con código 0.

## Multica

Usa los wrappers acotados en `harness-kit/adapters/multica/scripts/` en lugar de encadenar múltiples llamadas crudas al CLI (resuelven `MULTICA_CLI_PATH` o `multica` en `PATH` y nunca mezclan `stderr` con `stdout`):

### Leer contexto en una sola invocación (`multica-ctx.mjs`)
- **Contexto de un issue (≤ 120 líneas):**
  `node harness-kit/adapters/multica/scripts/multica-ctx.mjs <ISSUE> [--thread <id>] [--json] [--max-lines 120]`
  Devuelve título, estado, asignado, descripción (≤ 40 líneas), últimas 10 raíces resumidas, último hilo (o `--thread <id>`, últimas 10 entradas), sub-issues y PRs vinculados.
- **Listado cacheado de agentes (TTL 24 h):**
  `node harness-kit/adapters/multica/scripts/multica-ctx.mjs --agents [--refresh] [--json]`
  Reemplaza `multica agent list --output json` y `workspace members --output json` sin filtrar. Caché en `<git-common-dir>/harness/cache/multica-agents.json`.
- **Listado y búsqueda acotados:**
  `node harness-kit/adapters/multica/scripts/multica-ctx.mjs --list [--status <s>] [--project <id>] [--limit 15] [--json]`
  `node harness-kit/adapters/multica/scripts/multica-ctx.mjs --search <query> --project <id> [--limit 15] [--json]`

### Publicar comentario + estado + limpieza (`multica-post.mjs`)
- `node harness-kit/adapters/multica/scripts/multica-post.mjs <ISSUE> --file ./reply.md [--parent <id>] [--status <estado>] [--keep] [--json]`
  Valida UTF-8 sin BOM ni `U+FFFD` antes de invocar el CLI, publica vía `--content-file`, actualiza `--status` si se indicó, borra el archivo temporal si todo salió bien (salvo `--keep`) e imprime el id del comentario.

### Protocolo completo de Multica (reglas y disciplina)
- **Consultas acotadas:** `multica issue list --output json` exige `--limit` (≤ 15); `multica issue search` exige `--project <id>`.
- **Scan-Then-Expand (si invocas el CLI directo):** escanea raíces (`--roots-only --summary --compact --output json`) y expande solo el hilo necesario (`--thread <id> --tail 10 --compact --output json`).
- **Payloads y streams:** escribe descripciones/comentarios largos en un archivo UTF-8 sin BOM dentro del workdir (nunca `/tmp`) y pásalo con `--description-file`/`--content-file`. Jamás mezcles `2>&1` al parsear `--output json`.
- **Protección del daemon:** nunca mates `multica`/`multica.exe` por nombre (`multica.daemon-protect`); consulta `multica daemon status --output json` y termina solo tu child PID.
- **Multi-stage issues:** usa `harness-kit/core/templates/sub-issue.md.tmpl` y `--pr-auto-complete off` en `multica issue create` para evitar cierres prematuros antes de QA.
- **Disciplina de comentarios:** si un wakeup no requiere acción (acks, gracias, ecos), termina sin comentar ni @mencionar. Entrega el hand-off una sola vez (la cola nativa encola sin pérdida de tareas).
- **Estados terminales:** máximo 2 reintentos → pasar a `blocked` con evidencia. Esperas solo por wakeup condicional (`--until-pr checks`, `--until-children-done`, `--until-status`); prohibido `sleep`, polling o menciones repetidas.

## PRs y esperas
- **Estado de PR (una sola llamada, solo lectura):** `node harness-kit/core/scripts/harness-pr-status.mjs [<pr|rama>] [--json]` — resume sello, atraso respecto de `main`, checks (OK / fallidos / pendientes), etiqueta `harness-authorized`, revisión, `merge-check` y un único «Próximo paso» (≤ 25 líneas).
- **Esperar CI sin polling:** `node harness-kit/core/scripts/harness-pr-status.mjs [<pr|rama>] --wait-checks [--timeout 30m]` (una sola llamada bloqueante sobre `gh pr checks --watch --interval 30`, con corte interno por `--timeout`) o `multica issue wakeup create --until-pr checks`.
- **Esperas por hijos o estados en Multica:** usar `--until-children-done` o `--until-status` en lugar de bucles o reintentos.
- **Esperas activas (`shell.polling`):** el guard bloquea `Start-Sleep`, `sleep`, `timeout /t` y `ping -n <n> 127.0.0.1` en bucles, combinados con `gh`/`multica` o mayores a 5 s sin verificación local. Para esperar un servidor local en E2E (> 5 s), juntá la espera y la verificación (`Invoke-WebRequest`/`curl`/`Test-NetConnection`/`Get-NetTCPConnection` contra `localhost` o `127.0.0.1`) en un solo comando (permitido y registrado como `shell.wait`).

## Carpeta de trabajo

El agente arranca en `<workdir>` y el repo vive en `<workdir>/gozster`. Nunca escribas la ruta absoluta del workdir.
- **Antigravity:** cada `run_command` abre una sesión nueva en `<workdir>` (el directorio no persiste). Anteponé `Set-Location gozster;` (ruta relativa) en cada comando que necesite el repo.
- **Claude Code:** el directorio persiste entre llamadas. Posicionate una vez en la raíz del repo (`git rev-parse --show-toplevel`) y usá rutas relativas; si un `cd`/`Set-Location` falla, el guard inyecta `remediate.cwd-lost`.
- **Temporales y entregables** (`reply.md`, `comment.md`, `pr.md`): van en `../` (el workdir), fuera del repo.

## Lectura y búsqueda

- **Rango obligatorio (> 300 líneas):** máximo duro **300 líneas** (rango inclusivo); valor recomendado **200**.
  - **Antigravity:** usá `read_file` con `StartLine` y `EndLine` (rango inclusivo, `EndLine - StartLine + 1 <= 300`; opcional `ByteOffset`).
  - **Claude Code:** usá `Read` con `offset` y `limit` (`<= 300`; recomendado `200`) o buscá primero con `Grep`.
- **Evitar idas y vueltas (`rg ↔ lectura`):** para ubicar y editar sin leer archivos grandes enteros, buscá directamente con contexto: `rg -n -C 20 <patrón> <ruta>`.

<!-- BEGIN GENERATED:HELPER_SCRIPTS -->
## Helper scripts (run via bash)

- `harness-kit/core/scripts/harness-compose.mjs`: Evaluates probe traces, selects the winning harness and updates experience library.
- `harness-kit/core/scripts/harness-context.mjs`: Task orientation in one read-only call: branch, issue, PR, related lessons, latest migration and scope.
- `harness-kit/core/scripts/harness-contrast.mjs`: Contrasts candidate harness probe reports and selects winning configuration (Harness²).
- `harness-kit/core/scripts/harness-debt-notify.mjs`: Notifies Multica webhook on lesson debt threshold (>=8).
- `harness-kit/core/scripts/harness-gate.sh`: Full gate: append-only, drift + encoding, issue lesson, project gate commands, writes .harness/complete.json.
- `harness-kit/core/scripts/harness-init.sh`: Setup in one call: git identity, deps, harness status, optional scope.
- `harness-kit/core/scripts/harness-learn.sh`: Learner: persists the issue lesson to harness/experience/<ISSUE>.jsonl (runs on the PR branch; gate and merge require it).
- `harness-kit/core/scripts/harness-merge-check.mjs`: Merge gate: PR seal == PR head, issue lesson in the PR, PPC + label for harness changes.
- `harness-kit/core/scripts/harness-pr-status.mjs`: Read-only PR status summary (seal, behind, checks, labels, review, merge-check, next step) and single-call --wait-checks.
- `harness-kit/core/scripts/harness-probe.mjs`: Runs candidate harness probes on isolated ephemeral git branches (Harness² PPC).
- `harness-kit/core/scripts/harness-propose.mjs`: Analyzes accumulated lessons, clusters friction and proposes PPC candidate mutations (Harness²).
- `harness-kit/core/scripts/harness-render.mjs`: Harness compiler & drift checker (H-03).
- `harness-kit/core/scripts/harness-telemetry.mjs`: Aggregates guard telemetry (<git common dir>/harness/telemetry/events.jsonl) into a summary:
<!-- END GENERATED:HELPER_SCRIPTS -->
