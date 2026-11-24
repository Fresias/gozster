# L-002 — Menos llamadas y menos fricción en el arnés (GOZS-765)

- **Estado:** `blocked` (reapertura preparada en `GOZS-795`, PR `#657`; medición y cierre a cargo del issue 15)
- **Épica:** `GOZS-765` — Fase 0 (`GOZS-766`, `GOZS-767`, `GOZS-768`, `GOZS-769`) + Fase 1 (`GOZS-772`, `GOZS-773`, `GOZS-774`, `GOZS-780`, `GOZS-781`, `GOZS-782`, `GOZS-783`, `GOZS-791`, `GOZS-795`)
- **Hipótesis:** Reducir las llamadas por sesión en **≥ 15 %** y las llamadas antes de la primera edición en **≥ 20 %**, sin bajar los bloqueos legítimos.
- **Condición de inicio (`start_condition`):** `7 días` corridos de telemetría real en `DESKTOP-S4P202B` desde el timestamp ISO exacto de `merged_at` del **PR `#657` (`GOZS-795`)** (cierre definitivo de la Fase 1; reemplaza el inicio previo de `GOZS-791` / `#653` y `#655`), tras ejecutar en `DESKTOP-S4P202B` desde `main` los dos instaladores idempotentes y verificar ambos con `--check` (código 0):
  - `node harness-kit/core/plugins/claude-code/install.mjs`
  - `node harness-kit/core/plugins/antigravity/install.mjs`
  - `node harness-kit/core/plugins/claude-code/install.mjs --check`
  - `node harness-kit/core/plugins/antigravity/install.mjs --check`
- **Congelamiento durante la ventana:** durante los 7 días corridos desde el `merged_at` del PR `#657` no se mergean cambios del arnés, salvo un hotfix explícitamente registrado en `LEDGER.json`.
- **Fuente:** `<git common dir>/harness/telemetry/events.jsonl` (`resolveTelemetryDir()`, sin `HARNESS_TELEMETRY_DIR`). Respaldar el archivo fuera del clon de Multica antes de abrir la ventana.

## Evidencia v2 previa en DESKTOP-S4P202B (desde `#641`, `2026-11-24T01:27:00Z`)

Medición sobre el `events.jsonl` real de `DESKTOP-S4P202B` con eventos posteriores a `#641` (`--since 2026-11-24T01:27:00Z`, excluyendo canarios):
- `2.410` eventos (`2.111` acciones, `42` sesiones, `1.238` comandos de shell).
- **Comandos de shell recortados a `300` caracteres (esquema v2):** **`434` de `1.238` (`35,1 %`)**, muy por encima de la meta `< 5 %` de la épica. Esto motivó subir `CMD_MAX` a `1.000`, compactar heredocs de datos (`‹heredoc: N líneas›`) y agregar `cmdLen` exacto en el esquema `v: 3` (`GOZS-795` B1/B2).
- **Cobertura de duración medida por runtime antes de reinstalar:** `claude-code` `93,9 %` (`292 / 311`) vs. `antigravity` `0,0 %` (`0 / 1.762`), confirmando que en Multica Antigravity requiere ejecutar `antigravity/install.mjs` desde `main` tras el merge.

## Comandos de medición

Al cerrar la ventana (`<inicio>` = `merged_at` del PR `#657`, `<fin>` = `<inicio> + 7 días`):

```bash
# 0. Generar el JSON de línea base L-001 (sin --min-schema) con la misma versión del agregador
node harness-kit/core/scripts/harness-telemetry.mjs --deep \
  --since 2026-11-16T17:48:54Z --until 2026-11-23T17:48:54Z --idle-min 15 \
  --out ./l001-baseline

# 1. Resumen general de L-002 (solo sesiones con esquema v >= 3)
node harness-kit/core/scripts/harness-telemetry.mjs \
  --since <inicio> --until <fin> --idle-min 15 --min-schema 3 --json

# 2. Análisis profundo de L-002 + comparación automática contra L-001 y metas (sin filtro)
node harness-kit/core/scripts/harness-telemetry.mjs --deep \
  --since <inicio> --until <fin> --idle-min 15 --min-schema 3 \
  --compare ./l001-baseline/deep-dive.json \
  --targets docs/harness-library/L-002-targets.json

# 3. Comparación comparable de Claude Code contra L-001 (sin búsquedas nativas Grep/Glob)
node harness-kit/core/scripts/harness-telemetry.mjs --deep \
  --since <inicio> --until <fin> --idle-min 15 --min-schema 3 \
  --exclude-kind search \
  --compare ./l001-baseline/deep-dive.json \
  --targets docs/harness-library/L-002-targets.json
```

## Tabla de métricas de la épica (L-001 recalculado vs. meta L-002)

Recálculo ejecutado con el agregador parcheado (`GOZS-795`, v2.1.0) sobre el `events.jsonl` real de `DESKTOP-S4P202B` en la ventana exacta de L-001 (`2026-11-16T17:48:54Z` → `2026-11-23T17:48:54Z`, `--idle-min 15`, sin filtro de esquema): `24.376` eventos, `24.315` acciones, `61` post, `349` sesiones (`238` Antigravity, `111` Claude Code), cruce con `summarize` en **coincide** (incluido TTFE unificado).

| Métrica | L-001 (épica) | Línea base explícita L-001 (agregador `GOZS-795`) | Objetivo L-002 | Comando o sección de `--deep` que la mide |
|---|---|---|---|---|
| Tamaño de `AGENTS.md` (LF) | `7.985 / 8.000 chars` | `5.008 / 8.000 chars` (`84` líneas LF; antes de D1: `4.981`) | `< 6.500 chars` al cierre de Fase 0 *(cumplido)* | `harness-kit/tests/render.spec.ts` / `harness-render.mjs --check` |
| Llamadas por sesión (p50) | `51` (AGY `69`, CC `25`) | **Por runtime:** CC `25`, AGY `69` *(control)* · total combinado `51` *(solo informativo)* | `−15 %` por runtime (CC con `--exclude-kind search`) | `--deep` Sección 1 (`sessions.<rt>.calls.p50`) y `--compare` |
| Llamadas antes de la primera edición (p50) | `32` (AGY `39`, CC `16`) | **Por runtime:** CC `16`, AGY `39` *(control)* · total `32` (`n = 279`, 1ª escritura permitida) | `−20 %` por runtime (CC con `--exclude-kind search`) | `harness-telemetry --json` (`callsBeforeFirstEdit.p50`) y `--deep` Sección 1 |
| TTFE (p50) | `4,3 min` | **Por runtime (unificado con `summarize`):** CC `3,3 min` (`200.292 ms`), AGY `4,4 min` (`265.414 ms`, control) · total `4,3 min` (`256.557 ms`, `n = 279`) | `−20 %` por runtime (CC con `--exclude-kind search`) | `harness-telemetry --json` (`timeToFirstEdit.medianMs`) y `--deep` Sección 1 (`sessions.<rt>.ttfeMs.p50`) |
| Comandos de shell recortados en la telemetría | `64 %` (`8.787` de `13.739`) | L-001: `64,0 %` (`8.787 / 13.739` a 120 car.) · v2 desde `#641`: `35,1 %` (`434 / 1.238` a 300 car.) | `< 5 %` (exacto vía `cmdLen > cmd.length` en v3) | `--deep` Sección 0 (`coverage.truncatedShell / coverage.shell`) |
| Rutas de lectura recortadas | `96,4 %` (`7.100` de `7.362`) | `96,4 %` (`7.100` de `7.362`) | `< 1 %` | `--deep` Sección 3 (`reads.truncatedPaths / reads.total`) |
| Llamadas con duración medida | `0 %` | **Por runtime:** CC `1,7 %` (`61 / 3.544`), AGY `0,0 %` (`0 / 20.237`) · total `0,3 %` (`61 / 23.781`) | `≥ 95 %` por runtime | `--deep` Sección 0 (`coverage.durationCoverageByRuntime`) |
| Comandos con ruta absoluta del workdir | No medible en L-001 | `0` (no medible en v1; `<repo>` y `<workdir>` existen desde v2) | Meta absoluta `< 5 %` | `--deep` Sección 2 (`shell.workdirRefs / coverage.shell`) |
| Avisos `remediate.cwd-lost` | `35` | `35` inyecciones en Claude Code (`cwdLostApprox = 0` en v1) | `< 10` | `harness-telemetry --json` (`injectionsByRule["remediate.cwd-lost"]`), `--deep` Sección 10 y Sección 2 (`shell.cwdLostApprox`) |
| Llamadas a Multica por sesión | `5,3` (`1.866` en total) | `5,35` (`1.866` en `349` sesiones) | `−30 %` | `--deep` Sección 12 (`multicaGh.multicaPerSession`; incluye `multica-ctx`/`multica-post`) |
| `multica agent list` | `77` en `57` sesiones | `77` en `57` sesiones | `< 15` (incluye `multica-ctx --agents` y `--refresh`) | `--deep` Sección 12 (`multicaGh.multicaAgentList`) |
| Consultas sobre PRs por sesión (`gh pr view`/`api`/`list`/`checks`/`diff`) | `2,7` (`957` en total) | `2,74` (`957` en total) | `−40 %` | `--deep` Sección 12 (`multicaGh.prQueries`; incluye `harness-pr-status.mjs`) |
| `gh pr checks` + `gh run view` repetidos en `< 10 min` | `77` | `77` (sobre `222` consultas de checks) | `< 15` | `--deep` Sección 12 (`multicaGh.checksQueries.repeatedWithin10m`; incluye `harness-pr-status.mjs --wait-checks`) |
| `Start-Sleep` en esperas activas (`> 5 s` sin check local) | `102` (`13` sesiones) | **Ejecutadas: `108`** (AGY `102`, CC `6`) · **Intentos totales: `109`** en `19` ses. (AGY `102` en `14` ses., CC `7` en `5` ses.; `1` bloqueado) | **`0` ejecutadas** (intentos observados contra `109`) | `--deep` Sección 2 (`shell.activeWaits.executed` y `shell.activeWaits.total`, por runtime) |
| Bloqueos `read.oversize` | `172` (`166` AGY; `64` repetidos de inmediato) | `172` (`166` AGY, `6` CC; `64` repetidos de inmediato) | `−70 %` | `harness-telemetry --json` (`blocksByRule["read.oversize"]`) y `--deep` Secciones 9 y 9b |
| Pasos `rg` → lectura y lectura → `rg` | `1.326` | **`1.502` pasos shell** búsqueda ↔ lectura (`766 →`, `736 ←`; AGY `1.486` control, CC `16`) · nativa (`Grep`/`Glob` ↔ `Read`): `0` | `−30 %` en shell (nativa aparte; AGY control) | `--deep` Sección 7 (`sequences.searchReadTransitions.shell` y `.native`, por runtime) |
| Bloqueos `fs.protected` sobre la carpeta de borradores de Antigravity | `33` | `33` totales (`31` identificables en `cmd` tras truncado v1 a 120 car.; `33` AGY, `0` CC) | `0` | `harness-telemetry --json` (`blocksByRule["fs.protected"]`) y `--deep` Sección 9 (`comparableBlocks.excluded.fsProtectedFp`) |
| Bloqueos `pr.requires-seal` | `206` (`98` sesiones) | **`124` invocaciones reales según A1** (`90` AGY, `34` CC) · `82` menciones literales (`23` AGY, `59` CC) sobre `206` totales (`98` ses.) | `−70 %` contra `124` invocaciones reales | `--deep` Sección 9c (`prSeal.commandPosition`, con `detectGhPrCommands` de A1) |
| Corridas del gate por sesión que crea PR (p50) | `2` (`303` en `112` sesiones) | **`p50 = 2`** (`220` corridas en `101` sesiones con `gh pr create` permitido; `p90 = 4`, `máx = 9`) | `1` (`harness-ship` cuenta como gate solo si duró `≥ 60 s`) | `--deep` Sección 11 (`gate._prCreatingSessions`, `--gate-min-sec 60`) |
| Lecturas de Claude Code por Bash (`grep`/`sed -n`/`cat`) | `857` (contra `83` `Read`) | **Solo Claude Code: `854` principales** (`grep` `317`, `sed -n` `317`, `cat` `220`; con pipe: `327`, sin pipe: `527`) + `77` secundarias (`head` `11`, `tail` `7`, `rg` `59`; con pipe: `41`, sin pipe: `36`) = `931` total contra `83` `Read` | `−50 %` contra `854` (con y sin pipe) | `--deep` Sección 2 (`shell.bashReads`) y Sección 14 (`adoption.claudeCodeNativeVsBash`) |
| Bloqueos por sesión (comparables C4) | `1,53` | **`1,21` comparables** (`421 / 349`; AGY `1,35` = `321`, CC `0,90` = `100`) sobre `534` totales (`1,53`/ses.; excluye `82` literales `pr.requires-seal` y `31` FPs `fs.protected`) | `−25 %` contra `1,21` | `--deep` Sección 9 (`comparableBlocks.perSession` y `comparableBlocks.byRuntime`) |
| *(Secundaria)* Bloqueos `read.guard-installed` | `33` (`16` AGY, `17` CC) | `33` (`16` AGY, `17` CC) | Observada (sin intervención directa) | `harness-telemetry --json` (`blocksByRule["read.guard-installed"]`) y `--deep` Sección 9 |

## Bloqueos comparables («legítimos», C4)

En lugar de excluir `pr.requires-seal` y `fs.protected` enteros (que bajaba L-001 a `0,85`/sesión y escondía mejoras reales de los ítems `07+08` a `11`), la función `isComparableBlock()` en `telemetry-deep.mjs` se aplica de forma idéntica a ambas ventanas y descuenta del total únicamente:
1. Reglas que no existían en L-001 (`shell.polling`).
2. Bloqueos sobre `kind: "search"` (no registrados en L-001).
3. Clases de falso positivo eliminadas por definición:
   - `pr.requires-seal` sin invocación real según `detectGhPrCommands` (A1): `82` en L-001;
   - `fs.protected` sobre la carpeta de borradores de Antigravity o sobre lecturas de `~/.claude/projects/*/tool-results/`: `31` identificables en L-001.

En L-001 esto deja **`421` bloqueos comparables en `349` sesiones (`1,21` por sesión)** (`321` en Antigravity = `1,35`/ses.; `100` en Claude Code = `0,90`/ses.). `--exclude-rule` sigue disponible como herramienta ad hoc.

## Adopción de intervenciones (C7)

La Sección 14 de `--deep` (`adoption`) mide la adopción real para distinguir «no se adoptó» de «se adoptó y no alcanzó»:
- `%` de sesiones que empiezan con `harness-context` (L-001: `0 %`).
- `%` de sesiones que crean PR con `harness-ship` contra `gh pr create` (L-001: `0 %`, `101` con `gh pr create`).
- Parte de las llamadas a Multica vía `multica-ctx`/`multica-post` (L-001: `0 %` de `1.866`).
- Parte de las consultas de PR vía `harness-pr-status` (L-001: `0 %` de `957`).
- En Claude Code: `Read`/`Grep`/`Glob` contra lecturas por Bash (L-001: `8,9 %` = `83` nativas vs. `854` Bash principales).

## Filtros de comparación por runtime

- **Claude Code:** se compara contra L-001 con **`--exclude-kind search`** (porque en L-001 no se registraban `Grep`/`Glob`) y **`--min-schema 3`**, y también se informa sin `--exclude-kind search` para ver el volumen total real.
- **Antigravity:** actúa como **control** (sus herramientas de búsqueda nativas —`grep_search`, `find_by_name`, `list_dir`— no se registran en ninguna de las dos ventanas).
- **Total combinado:** es solo informativo en llamadas por sesión, llamadas antes de la 1ª edición y TTFE, porque la mezcla de runtimes entre ventanas puede cambiar.

## Caveats y limitaciones documentadas

1. **Prefijo `cd <cwd> &&` en Claude Code:** Claude Code quita el prefijo `cd <cwd> &&` antes de entregar el comando al hook, por lo que en ese runtime la métrica de «ruta absoluta del workdir» solo observa otras formas de referencia absoluta.
2. **Búsquedas nativas de Antigravity:** `grep_search`, `find_by_name` y `list_dir` no pasan por hooks ni en L-001 ni en L-002; por eso Antigravity funciona como control para las métricas por runtime.
3. **Sesiones en ramas viejas (`--min-schema 3`):** las sesiones abiertas en ramas previas al merge del PR `#657` emiten esquema v1/v2 y quedan excluidas automáticamente con `--min-schema 3` (`--deep` informa cuántas sesiones excluye).
4. **Sesiones cloud efímeras:** la telemetría de sesiones cloud no persiste porque su clon temporal se descarta al finalizar la ejecución; la ventana de 7 días mide sesiones locales en `DESKTOP-S4P202B`.
5. **Definición unificada de primera edición:** `summarize` y `--deep` usan ambos la **primera escritura permitida** (`kind: "write"`, `decision !== "block"`) tanto para TTFE como para `callsBeforeFirstEdit`. La métrica de «primera edición en el repo» queda como candidata para L-003.
6. **Reinicio de la ventana con `GOZS-795` (PR `#657`):** `GOZS-791` tuvo dos PRs mergeados (`#653` y `#655`) y una auditoría posterior sobre `main` (`8b94b2f`) encontró regresiones y sesgos de medición; se decidió no aplicar hotfixes durante la ventana y reabrir los 7 días corridos desde el `merged_at` del PR `#657`.

## Resultados de la ventana (`window.after`)

_Pendiente de cierre: completar en el issue 15 al cumplirse 7 días corridos desde el `merged_at` del PR `#657` (`GOZS-795`)._
