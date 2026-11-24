# L-002 — Menos llamadas y menos fricción en el arnés (GOZS-765)

- **Estado:** `blocked` (apertura preparada en `GOZS-791`; medición y cierre a cargo del issue 15)
- **Épica:** `GOZS-765` — Fase 0 (`GOZS-766`, `GOZS-767`, `GOZS-768`, `GOZS-769`) + Fase 1 (`GOZS-772`, `GOZS-773`, `GOZS-774`, `GOZS-780`, `GOZS-781`, `GOZS-782`, `GOZS-783`, `GOZS-791`)
- **Hipótesis:** Reducir las llamadas por sesión en **≥ 15 %** y las llamadas antes de la primera edición en **≥ 20 %**, sin bajar los bloqueos legítimos.
- **Condición de inicio (`start_condition`):** `7 días` corridos de telemetría real en `DESKTOP-S4P202B` desde el timestamp ISO exacto de `merged_at` del PR de `GOZS-791` (último PR de la Fase 1), tras ejecutar en `DESKTOP-S4P202B` desde `main` los dos instaladores idempotentes:
  - `node harness-kit/core/plugins/claude-code/install.mjs`
  - `node harness-kit/core/plugins/antigravity/install.mjs`
- **Congelamiento durante la ventana:** durante los 7 días corridos no se mergean cambios del arnés, salvo un hotfix explícitamente registrado en `LEDGER.json`.
- **Fuente:** `<git common dir>/harness/telemetry/events.jsonl` (`resolveTelemetryDir()`, sin `HARNESS_TELEMETRY_DIR`)

## Comandos de medición

Al cerrar la ventana (`<inicio>` = `merged_at` del PR de `GOZS-791`, `<fin>` = `<inicio> + 7 días`):

```bash
# 1. Resumen general sin filtros (acciones totales, TTFE, duraciones, outcomes)
node harness-kit/core/scripts/harness-telemetry.mjs --since <inicio> --until <fin> --idle-min 15 --json

# 2. Comparación comparable de Claude Code contra L-001 (sin búsquedas nativas Grep/Glob)
node harness-kit/core/scripts/harness-telemetry.mjs --since <inicio> --until <fin> --idle-min 15 --exclude-kind search --json

# 3. Bloqueos por sesión comparables (excluyendo reglas corregidas y nuevas)
node harness-kit/core/scripts/harness-telemetry.mjs --since <inicio> --until <fin> --idle-min 15 \
  --exclude-rule fs.protected --exclude-rule remediate.cwd-lost --exclude-rule pr.requires-seal \
  --exclude-rule shell.polling --exclude-rule shell.wait --exclude-rule remediate.native-read --json

# 4. Análisis profundo (sin filtro y con --exclude-kind search)
node harness-kit/core/scripts/harness-telemetry.mjs --deep --since <inicio> --until <fin> --idle-min 15
node harness-kit/core/scripts/harness-telemetry.mjs --deep --since <inicio> --until <fin> --idle-min 15 --exclude-kind search
```

## Tabla de métricas de la épica (L-001 recalculado vs. meta L-002)

Recálculo ejecutado con el agregador parcheado (`GOZS-791`) sobre el `events.jsonl` real de `DESKTOP-S4P202B` en la ventana exacta de L-001 (`2026-11-16T17:48:54Z` → `2026-11-23T17:48:54Z`, `--idle-min 15`): `24.376` eventos, `24.315` acciones, `61` post, `349` sesiones (`238` Antigravity, `111` Claude Code), cruce con `summarize` en **coincide**.

| Métrica | L-001 (épica) | L-001 recalculado (agregador parcheado) | Objetivo L-002 | Comando o sección de `--deep` que la mide |
|---|---|---|---|---|
| Tamaño de `AGENTS.md` (LF) | `7.985 / 8.000 chars` | `4.981 / 8.000 chars` (`84` líneas LF; `85` contando newline final) | `< 6.500 chars` al cierre de Fase 0 *(cumplido)* | `harness-kit/tests/render.spec.ts` / conteo LF de `AGENTS.md` |
| Llamadas por sesión (p50) | `51` (AGY `69`, CC `25`) | `51` (AGY `69`, CC `25`; `24.315` acciones en `349` sesiones) | `−15 %` | `--deep` Sección 1 (`sessions.*.calls.p50`; CC también con `--exclude-kind search`) |
| Llamadas antes de la primera edición (p50) | `32` (AGY `39`, CC `16`) | `32` (AGY `39`, CC `16`; `n = 279`) | `−20 %` | `harness-telemetry --json` (`callsBeforeFirstEdit.p50`) y `--deep` Sección 1 (`sessions.*.callsBeforeFirstEdit.p50`) |
| TTFE (p50) | `4,3 min` | `4,3 min` (`256.035 ms` en `summarize`; `256.557 ms` en `--deep`: AGY `4,4 min`, CC `3,3 min`) | `−20 %` | `harness-telemetry --json` (`timeToFirstEdit.medianMs`) y `--deep` Sección 1 (`sessions.*.ttfeMs.p50`) |
| Comandos de shell recortados en la telemetría | `64 %` (`8.787` de `13.739`) | `64,0 %` (`8.787` de `13.739`) | `< 5 %` | `--deep` Sección 0 (`coverage.truncatedShell` / `coverage.shell`) |
| Rutas de lectura recortadas | `96,4 %` (`7.100` de `7.362`) | `96,4 %` (`7.100` de `7.362`) | `< 1 %` | `--deep` Sección 3 (`reads.truncatedPaths` / `reads.total`) |
| Llamadas con duración medida | `0 %` | `0,3 %` (`61` pares post de inyección sobre `23.781` permitidas; `0 %` de cobertura general pre/post en v1) | `≥ 95 %` | `harness-telemetry --json` (`durations.pairedCount`) y `--deep` Sección 0 (`coverage.pairedDurations`) |
| Comandos con ruta absoluta del workdir | No medible en L-001 (rutas recortadas) | `0` (no medible en v1; `<repo>` y `<workdir>` solo existen en telemetría v2) | Meta absoluta `< 5 %` | `--deep` Sección 2 (`shell.absPathRefs` / `shell.workdirRefs` sobre `coverage.shell`) |
| Avisos `remediate.cwd-lost` | `35` | `35` inyecciones en Claude Code (`cwdLostApprox = 0` en v1 por falta de `ok` en `post`) | `< 10` | `harness-telemetry --json` (`injectionsByRule["remediate.cwd-lost"]`), `--deep` Sección 10 y Sección 2 (`shell.cwdLostApprox`, por runtime) |
| Llamadas a Multica por sesión | `5,3` (`1.866` en total) | `5,35` (`1.866` en total) | `−30 %` | `--deep` Sección 12 (`multicaGh.multicaPerSession` y `multicaGh.multicaTotal`; incluye `multica-ctx`/`multica-post`) |
| `multica agent list` | `77` en `57` sesiones | `77` en `57` sesiones | `< 15` | `--deep` Sección 12 (`multicaGh.multicaAgentList`) |
| Consultas sobre PRs por sesión (`gh pr view`/`api`/`list`/`checks`/`diff`) | `2,7` (`957` en total) | `2,74` (`957` en total) | `−40 %` | `--deep` Sección 12 (`multicaGh.prQueries`; incluye `harness-pr-status.mjs`) |
| `gh pr checks` + `gh run view` repetidos en `< 10 min` | `77` | `77` (sobre `222` consultas de checks) | `< 15` | `--deep` Sección 12 (`multicaGh.checksQueries.repeatedWithin10m`; incluye `harness-pr-status.mjs --wait-checks`) |
| `Start-Sleep` en esperas activas (`> 5 s` sin check local) | `102` (`13` sesiones) | `109` en `19` sesiones con `evaluateShellPolling` (`102` en `14` ses. AGY, `7` en `5` ses. CC; `108` ejecutados, `1` bloqueado) | `0` | `--deep` Sección 2 (`shell.activeWaits`, mismo clasificador que `shell.polling`, bloqueados o no, por runtime) |
| Bloqueos `read.oversize` | `172` (`166` AGY; `64` repetidos de inmediato) | `172` (`166` AGY, `6` CC; `64` repetidos de inmediato) | `−70 %` | `harness-telemetry --json` (`blocksByRule["read.oversize"]`) y `--deep` Secciones 9 y 9b (`blocks["read.oversize"]`) |
| Pasos `rg` → lectura y lectura → `rg` | `1.326` | `1.502` pasos shell búsqueda ↔ lectura (`766 →`, `736 ←`; `1.486` AGY, `16` CC; `0` nativa; subconjunto exacto `rg ↔ read` = `677 + 649 = 1.326`) | `−30 %` | `--deep` Sección 7 (`sequences.searchReadTransitions`, separado shell/nativa y sumado, por runtime) |
| Bloqueos `fs.protected` sobre la carpeta de borradores de Antigravity | `33` | `33` (`33` AGY, `0` CC) | `0` | `harness-telemetry --json` (`blocksByRule["fs.protected"]`) y `--deep` Sección 9 |
| Bloqueos `pr.requires-seal` | `206` (`98` sesiones) | `206` (`98` sesiones): **`119` en posición de comando** (`86` AGY, `33` CC) y **`87` menciones literales** (`27` AGY, `60` CC) | `−70 %` | `--deep` Sección 9c (`prSeal.commandPosition` y `prSeal.literalMentions`, usando `detectGhPrCommands` de A3) |
| Corridas del gate por sesión que crea PR (p50) | `2` (`303` corridas en `112` sesiones) | `p50 = 2` (`232` corridas en `104` sesiones con `gh pr create`/`harness-ship`; `harness-gate.sh` total = `303` en `112` sesiones, `p50 = 2`) | `1` | `--deep` Sección 11 (`gate._prCreatingSessions` y `gate["gate (harness-gate + harness-ship)"]`) |
| Lecturas de Claude Code por Bash (`grep`/`sed`/`cat`) | `857` (contra `83` `Read`) | `854` en `claude-code` (`grep` `317`, `sed` `317`, `cat` `220`; `857` sumando `3` `cat` de AGY; `913` incluyendo `rg`/`head`/`tail`) contra `83` `Read` | `−50 %` | `--deep` Sección 0 (Tools `claude-code \| Read`) y Sección 2 (`shell.signatures` por runtime `claude-code`) |
| Bloqueos por sesión | `1,53` | `1,53` sin filtros (`534 / 349`); **`0,85` comparable** (`295 / 349` excluyendo reglas corregidas y nuevas) | `−25 %` | `harness-telemetry --json` (`blocksPerSession`, sin filtro y con `--exclude-rule`) |
| *(Secundaria)* Bloqueos `read.guard-installed` | `33` (`16` AGY, `17` CC) | `33` (`16` AGY, `17` CC) | Observada (sin intervención directa) | `harness-telemetry --json` (`blocksByRule["read.guard-installed"]` y `byRuntime`) |

## Clasificación de reglas para la comparación

Para evaluar el total de bloqueos por sesión sin sesgo entre L-001 y L-002, las reglas se clasifican en cuatro grupos:

1. **Sin cambios (comparables directamente):** `read.oversize`, `read.guard-installed`, `shell.rm-rf`, `git.repo-rewire`, `harness.authorized-only`, `git.force-push`, `shell.oversize-cat`, `db.append-only`, `git.branch-force-delete`, `shell.env-leak`, `git.reset-hard`, `pr.merge-check` *(nota: `pr.merge-check` incorpora el detector en posición de comando de A3; en L-001 solo tuvo `3` eventos)*, `fs.bloatware`, `fs.env-leak`, `read.sensitive`, `harness.agents-render`, `write.generated`, `repo.protection-locked`, `multica.comment-bounded`, `multica.issue-bounded`.
2. **Corregidas (se reportan aparte y se excluyen del total comparable):**
   - `fs.protected` (corregida en `09+10` para brain de Antigravity y en `GOZS-791` A2 para lecturas inline Python/Node).
   - `remediate.cwd-lost` (corregida en `05` para evaluar solo salida real y solo Claude Code).
   - `pr.requires-seal` (corregida en `11` y `GOZS-791` A3 para solo evaluar `gh pr create` en posición de comando; en L-001 `87` de `206` eran menciones literales).
3. **Nuevas (no existían en L-001; se reportan aparte y se excluyen del total comparable):**
   - `shell.polling` (`07+08`: bloqueo de esperas activas `> 5 s` sin check local).
   - `shell.wait` (`07+08`: registro permitido de esperas cortas o con check local).
   - `remediate.native-read` (`13`: inyección única por sesión en Claude Code ante lecturas/búsquedas por Bash).
4. **Reglas existentes aplicadas ahora también a `search` (`Grep`/`Glob`):**
   - `fs.env-leak`, `read.sensitive` (y cualquier bloqueo sobre `kind: "search"`). Se aíslan automáticamente al aplicar `--exclude-kind search`.

**Regla para el total de bloqueos comparables:** se excluyen las **corregidas** y las **nuevas** mediante `--exclude-rule`:
```bash
--exclude-rule fs.protected --exclude-rule remediate.cwd-lost --exclude-rule pr.requires-seal \
--exclude-rule shell.polling --exclude-rule shell.wait --exclude-rule remediate.native-read
```
En L-001 esto arroja `295` bloqueos comparables sobre `349` sesiones (`blocksPerSession = 0,85`), frente a `534` totales (`1,53` sin filtros).

## Filtros de comparación por runtime

- **Claude Code:** se compara contra L-001 con **`--exclude-kind search`** (porque en L-001 el matcher de hooks era `Bash|PowerShell|Read|Write|Edit|NotebookEdit` y no registraba `Grep`/`Glob`), y **también se informa sin filtro** para ver el volumen total real incluyendo búsquedas nativas.
- **Antigravity:** actúa como **control** (sus herramientas de búsqueda nativas siguen fuera de hooks y sus cambios principales son `09+10` `read.oversize`/`fs.protected`, `07+08` `shell.polling` y `11`/`12` scripts de flujo).

## Caveats y limitaciones documentadas

1. **Ramas previas al merge:** las sesiones que se ejecuten en ramas creadas antes del merge de `GOZS-791` usarán los hooks/reglas de la rama vieja. `--deep` distingue automáticamente los eventos en formato v1 (`120` car., sin `id`/`ok`/`cwd`/`bounded`) de los v2 (`300` car. con campos completos).
2. **Sesiones cloud efímeras:** la telemetría de sesiones cloud no persiste porque su clon temporal se descarta al finalizar la ejecución; la ventana de 7 días mide sesiones locales en `DESKTOP-S4P202B`.
3. **Definición de primera edición:** `timeToFirstEdit` (`TTFE`) y `callsBeforeFirstEdit` consideran la primera escritura (`kind: "write"`) en cualquier ruta, igual que en L-001. La métrica de «primera edición en el repo» queda como candidata para L-003.
4. **`harness-ship.mjs` como cota superior del gate:** `harness-ship.mjs` cuenta como corrida del gate en la sección 11 de `--deep`, lo cual es una cota superior porque el script omite volver a correr el gate si el sello ya es válido.

## Resultados de la ventana (`window.after`)

_Pendiente de cierre: completar en el issue 15 al cumplirse 7 días corridos desde el `merged_at` del PR de `GOZS-791`._
