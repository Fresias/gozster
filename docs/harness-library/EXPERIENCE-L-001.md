# L-001 — Línea base real de 7 días del harness endurecido (post-GOZS-538)

- **Estado:** `completed`
- **Ventana medida (`window.before`):** `2026-11-16T17:48:54Z` → `2026-11-23T17:48:54Z` (`7 días` corridos desde `mergedAt` de PR #497 / `GOZS-538`)
- **Ventana posterior (`window.after`):** `null` (`metrics.after: null`; los experimentos posteriores se registran como `L-002` en adelante)
- **Condición de inicio (`start_condition`):** 7 días corridos de telemetría real en `DESKTOP-S4P202B` desde `2026-11-16T17:48:54Z` (merge de `GOZS-538` / PR #497), filtrando con `--since 2026-11-16T17:48:54Z --until 2026-11-23T17:48:54Z` para descartar eventos sintéticos y canarios previos con `session: "unknown"`.
- **Fuente:** `<git common dir>/harness/telemetry/events.jsonl` (`resolveTelemetryDir()`, sin `HARNESS_TELEMETRY_DIR`)
- **Agregador:** `node harness-kit/core/scripts/harness-telemetry.mjs --since 2026-11-16T17:48:54Z --until 2026-11-23T17:48:54Z --json`

## Reformulación como Línea Base Descriptiva

- **Hipótesis vigente (línea base):** registrar una foto determinista de 7 días reales del harness endurecido en producción (`DESKTOP-S4P202B`, runtimes `antigravity` y `claude-code`) —volumen por runtime, bloqueos por regla, inyecciones, TTFE y sesiones con bloqueos repetidos— como línea base contra la que se medirán los experimentos siguientes (`L-002` en adelante).
- **Hipótesis original (`original_hypothesis`, conservada):** *"El sync del guard, la cobertura de Antigravity y los arreglos de falsos positivos reducen los bloqueos repetidos por sesión y el TTFE, sin bajar los bloqueos legítimos."* Esta hipótesis comparativa no es contrastable porque toda la telemetría limpia del `git common dir` es posterior al hardening y `L-000` mezcla sesiones reales con corridas de tests.

## Resultados de la Ventana Real (`metrics.before`)

Medición ejecutada en `DESKTOP-S4P202B` el `2026-11-23` inmediatamente tras el cierre de la ventana (`2026-11-16T17:48:54Z` → `2026-11-23T17:48:54Z`), validando que `resolveTelemetryDir()` resolvió el `git common dir` central del repositorio gestionado por Multica (`28.451` líneas totales en el archivo, `24.376` eventos válidos dentro de la ventana).

### 1. Volumen y Distribución por Runtime (`byRuntime`)
- **Total de eventos:** `24.376` (primer evento `2026-11-16T17:54:26.691Z`, último `2026-11-23T17:48:47.034Z`)
- **Total de sesiones:** `349` (`348` sesiones UUID reales + `1` evento residual `unknown` de `antigravity` a las `2026-11-16T17:54:26.691Z`, 5 minutos después del merge de `#497`; umbral mínimo exigido: `≥ 5` sesiones reales → **cumplido ampliamente**).
- **Runtimes presentes (100% explicados por uso productivo real):**
  - `antigravity`: `20.612` eventos · `238` sesiones (`237` UUID reales + `1` evento residual `unknown`)
  - `claude-code`: `3.764` eventos · `111` sesiones (`111` UUID reales)
  - `opencode`: `0` · `gemini-cli`: `0`

### 2. Distribución Diaria (UTC)
| Fecha (UTC) | Sesiones | Eventos |
|---|---|---|
| `2026-11-16` (desde `17:48:54Z`) | 9 | 443 |
| `2026-11-17` | 36 | 2.053 |
| `2026-11-18` | 12 | 698 |
| `2026-11-19` | 68 | 6.952 |
| `2026-11-20` | 80 | 4.733 |
| `2026-11-21` | 41 | 3.115 |
| `2026-11-22` | 60 | 3.889 |
| `2026-11-23` (hasta `17:48:54Z`) | 55 | 2.493 |

### 3. Tool Calls por Categoría (`actionsByKind`)
- `shell`: `13.739`
- `read`: `7.362`
- `write`: `3.214`

### 4. Bloqueos e Inyecciones
- **Bloqueos (`decision="block"`, total `534` — `2,19%` de los eventos):**
  | Regla | Total | `antigravity` | `claude-code` |
  |---|---|---|---|
  | `pr.requires-seal` | 206 | 113 | 93 |
  | `read.oversize` | 172 | 166 | 6 |
  | `fs.protected` | 33 | 33 | 0 |
  | `read.guard-installed` | 33 | 16 | 17 |
  | `shell.rm-rf` | 24 | 17 | 7 |
  | `git.repo-rewire` | 13 | 5 | 8 |
  | `harness.authorized-only` | 12 | 8 | 4 |
  | `git.force-push` | 10 | 3 | 7 |
  | `shell.oversize-cat` | 9 | 0 | 9 |
  | `db.append-only` | 7 | 6 | 1 |
  | `git.branch-force-delete` | 6 | 3 | 3 |
  | `shell.env-leak` | 3 | 1 | 2 |
  | `git.reset-hard` | 3 | 3 | 0 |
  | `pr.merge-check` | 3 | 1 | 2 |
- **Inyecciones preventivas (`inject=true`, solo post-hooks en `claude-code`):**
  - `remediate.cwd-lost`: `35`
  - `remediate.oversize-output`: `17`
  - `db.migration-test-reminder`: `9`

### 5. Time-To-First-Edit (`TTFE`) y Fricción Repetida
- **Muestras (`count`):** `279` sesiones con al menos una edición (`write`)
- **Mediana:** `256.035 ms` (~4 min 16 s)
- **p90:** `726.729 ms` (~12 min 07 s; salida exacta CLI: `726729.0000000001`)
- **Sesiones con > 3 bloqueos repetidos (`repeatedBlockSessions`):** `28` entradas (`16` por `read.oversize`, hasta `8` repeticiones; `12` por `pr.requires-seal`, hasta `7` repeticiones). Principales candidatos de reducción de fricción para futuros experimentos (`L-002+`).

### 6. Limitaciones Conocidas Documentadas (`H-04` y truncado de `cmd`)
- **Deduplicación con `origin/main` (`H-04`):** Cuando en una sesión abierta dentro del repositorio coinciden el hook del proyecto y el dispatcher instalado, el dispatcher evalúa las reglas de `origin/main` con `HARNESS_TELEMETRY=0` para evitar doble registro. En consecuencia, si una regla presente únicamente en `origin/main` bloquea una acción que el guard de la rama local permitiría, ese bloqueo no queda registrado en `events.jsonl`.
- **Truncado de `cmd` (`H-05`):** `cmd` se trunca a 120 caracteres; con las rutas de workdir de Multica (~115 caracteres) quedan cortados el 64 % de los comandos de shell y el 96 % de las rutas de lectura. Las métricas agregadas (eventos, sesiones, bloqueos por regla, TTFE) no se ven afectadas; los análisis por archivo o por comando no son confiables en esta ventana.

## Método (Hardening Evaluado en esta Línea Base)

1. **Sincronización continua del guard:** Dispatcher de Claude Code sincroniza la copia instalada contra `origin/main` de forma atómica (`GOZS-513`).
2. **Cobertura exhaustiva en Antigravity:** Intercepción completa de herramientas nativas (`run_command`, `read_file`, `write_file`, `edit_file`) mediante hook políglota (`GOZS-513`).
3. **Erradicación de falsos positivos:** Inyección de `git.gh007-noreply` acotada a `git push` y lecturas del harness liberadas de bloqueos indebidos (`GOZS-514`).
4. **Aislamiento en pruebas de mutaciones:** Sondeos en ramas efímeras sin colisión con el stash compartido (`GOZS-515`).
5. **Telemetría limpia en common dir y sesión por runtime:** Persistencia durable en el `git common dir`, `byRuntime`, blindaje `HARNESS_TELEMETRY=0` en Vitest (`GOZS-516`), resolución de `conversationId`/`sessionID`, aislamiento de canarios, filtros `--since`/`--until` y deduplicación (`GOZS-538` / PR `#497`).
6. **Selección por contraste y evidencia:** Evaluación de mutaciones por matriz de contraste v2 con candidatos explícitos (`GOZS-517`).
7. **Plantillas agnósticas de sub-issues y subagentes:** Estandarización de contratos operativos y reglas anti-token-waste (`GOZS-518`).

## Línea Base Sintética Previa Anulada (`metrics.synthetic_before`)

La línea base inicial registrada en `GOZS-519` (`#478`) fue formalmente **anulada** en la auditoría técnica del 14-nov (`GOZS-523` / `#482`) por corresponder a una ventana sintética de 10 minutos (`2026-11-13T22:13:30Z → 2026-11-13T22:23:55Z`, 101 eventos, 1 sesión sintética por runtime incluyendo `opencode` y `gemini-cli`). Sus valores permanecen intactos en `metrics.synthetic_before` de `LEDGER.json` exclusivamente con fines de trazabilidad histórica.

## Siguientes Experimentos

Con `L-001` cerrado en `completed` (`window.after: null`, `metrics.after: null`), las futuras intervenciones de reducción de fricción —empezando por los principales focos observados (`pr.requires-seal` y `read.oversize`)— se registrarán como `L-002` en adelante contra esta línea base.
