# L-001 — Evaluación post-hardening del guard políglota y reducción de fricción

- **Estado:** `in_progress`
- **Ventana previa (`window.before`):** `2026-11-13T22:13:30Z` → `2026-11-13T22:23:55Z` (101 eventos limpios en git common dir).
- **Ventana posterior (`window.after`):** `2026-11-14T00:00:00Z` → `2026-11-28T00:00:00Z` (14 días).
- **Fuente:** `<git common dir>/harness/telemetry/events.jsonl`
- **Agregador:** `harness-kit/core/scripts/harness-telemetry.mjs`

## Hipótesis

El sync del guard, la cobertura de Antigravity y los arreglos de falsos positivos reducen los bloqueos repetidos por sesión y el TTFE, sin bajar los bloqueos legítimos.

## Método

1. **Sincronización continua del guard:** Dispatcher de Claude Code sincroniza la copia instalada contra `origin/main` de forma atómica (GOZS-513).
2. **Cobertura exhaustiva en Antigravity:** Intercepción completa de herramientas nativas (`run_command`, `read_file`, `write_file`, `edit_file`) mediante hook políglota (GOZS-513).
3. **Erradicación de falsos positivos:** Inyección de `git.gh007-noreply` acotada a `git push` y lecturas del harness liberadas de bloqueos indebidos (GOZS-514).
4. **Aislamiento en pruebas de mutaciones:** Sondeos en ramas efímeras sin colisión con el stash compartido (GOZS-515).
5. **Telemetría limpia en common dir:** Persistencia durable en el git common dir con separación por runtime (`byRuntime`) y blindaje contra contaminación de tests (`HARNESS_TELEMETRY=0` en Vitest) (GOZS-516).
6. **Selección por contraste y evidencia:** Evaluación de mutaciones por matriz de contraste con candidatos explícitos (GOZS-517).
7. **Plantillas agnósticas de sub-issues y subagentes:** Estandarización de contratos operativos y reglas anti-token-waste (GOZS-518).

## Resultados de Línea Base Limpia (`metrics.before`)

### 1. Volumen y Distribución por Runtime (`[RUNTIME]`)
- **Total de eventos:** `101`
- **Desglose por runtime:**
  - `antigravity`: `89` eventos (1 sesión, 6 bloqueos legítimos/seguridad)
  - `claude-code`: `4` eventos (1 sesión, 0 bloqueos)
  - `opencode`: `5` eventos (1 sesión, 2 bloqueos)
  - `gemini-cli`: `3` eventos (1 sesión, 0 bloqueos)

### 2. Tool Calls por Categoría (`[ACTION]`)
- `shell`: `50`
- `read`: `34`
- `write`: `7`

### 3. Bloqueos e Inyecciones (`[OBSERVATION]`)
- **Bloqueos (`decision="block"`):**
  - `harness.agents-render`: `2`
  - `db.append-only`: `1`
  - `git.force-push`: `1`
  - `fs.bloatware`: `1`
  - `shell.cat-lockfile`: `1`
  - `fs.env-leak`: `1`
  - `git.reset-hard`: `1`
- **Inyecciones preventivas (`inject=true`):**
  - `git.gh007-noreply`: `4`
  - `db.migration-test-reminder`: `3`
  - `remediate.cwd-lost`: `2`
  - `remediate.oversize-output`: `1`

### 4. Time-To-First-Edit (`TTFE`)
- **Mediana / p90:** `406.715 ms` (línea base inicial bajo entorno de test controlado)
- **Sesiones con bloqueos repetidos:** `0`

## Próximos Pasos

- Monitoreo continuo a través de `node harness-kit/core/scripts/harness-telemetry.mjs`.
- Cierre y consolidación de `metrics.after` al cumplirse la ventana `window.after` (`2026-11-28`).
