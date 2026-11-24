---
name: harness-tools
description: Catálogo de scripts del arnés y guía operativa de herramientas (el listado de scripts se inyecta automáticamente al renderizar).
autotrigger: you need harness helper scripts or CLI tool guides
---

# harness-tools

Catálogo auto-generado de scripts del arnés (`harness-kit/core/scripts/` y `harness/scripts/`) y protocolo operativo de herramientas CLI. Ejecutar vía `bash` o `node`.

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

<!-- BEGIN GENERATED:HELPER_SCRIPTS -->
<!-- Auto-populated by harness-render.mjs into .claude/skills/harness-tools/SKILL.md and .agents/skills/harness-tools/SKILL.md -->
<!-- END GENERATED:HELPER_SCRIPTS -->
