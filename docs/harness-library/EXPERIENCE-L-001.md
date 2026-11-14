# L-001 — Evaluación post-hardening del guard políglota y reducción de fricción

- **Estado:** `blocked`
- **Ventana previa (`window.before`):** `null` (anulada en auditoría técnica del 14-nov).
- **Ventana posterior (`window.after`):** `null` (pendiente de cumplimiento de la condición de inicio).
- **Condición de inicio (`start_condition`):** 7 días corridos de telemetría real en DESKTOP-S4P202B desde 2026-11-13T22:12:41Z (13-nov-2026).
- **Fuente:** `<git common dir>/harness/telemetry/events.jsonl`
- **Agregador:** `harness-kit/core/scripts/harness-telemetry.mjs`

## Hipótesis

El sync del guard, la cobertura de Antigravity y los arreglos de falsos positivos reducen los bloqueos repetidos por sesión y el TTFE, sin bajar los bloqueos legítimos.

## Línea Base Anulada (Auditoría del 14-nov)

La línea base inicial registrada en GOZS-519 (#478) fue formalmente **anulada** tras la auditoría técnica por no cumplir la condición acordada de 7 días de uso real:
- **Ventana sintética insuficiente:** `2026-11-13T22:13:30Z → 2026-11-13T22:23:55Z` (duración real de solo **10 minutos**).
- **Sesiones no representativas:** 101 eventos en una única sesión sintética por runtime en entorno de prueba controlado. Se incluyeron runtimes como `opencode` y `gemini-cli`, que no corresponden al stack productivo en este proyecto (Gemini opera a través del runtime Antigravity).
- **Trazabilidad histórica:** Las métricas sintéticas se trasladaron a `metrics.synthetic_before` en `LEDGER.json` para no perder la evidencia histórica, dejando `metrics.before` en `null`.

## Condición de Inicio (Etapa B)

Para desbloquear el experimento L-001 y ejecutar la Etapa B, deberán verificarse las siguientes condiciones en el entorno de desarrollo:
1. **7 días corridos de telemetría real** en `DESKTOP-S4P202B` transcurridos desde `2026-11-13T22:12:41Z` (momento en que `install.mjs --check` reportó `installed` para `claude-code` y `antigravity`).
2. Al menos 5 sesiones reales completas registradas en `metrics.before.byRuntime`.
3. Runtimes justificados exclusivamente en uso productivo real (`antigravity` y `claude-code`). Cualquier sesión de otro runtime debe contar con justificación explícita de origen o ser excluida con criterio documentado.

## Método

1. **Sincronización continua del guard:** Dispatcher de Claude Code sincroniza la copia instalada contra `origin/main` de forma atómica (GOZS-513).
2. **Cobertura exhaustiva en Antigravity:** Intercepción completa de herramientas nativas (`run_command`, `read_file`, `write_file`, `edit_file`) mediante hook políglota (GOZS-513).
3. **Erradicación de falsos positivos:** Inyección de `git.gh007-noreply` acotada a `git push` y lecturas del harness liberadas de bloqueos indebidos (GOZS-514).
4. **Aislamiento en pruebas de mutaciones:** Sondeos en ramas efímeras sin colisión con el stash compartido (GOZS-515).
5. **Telemetría limpia en common dir:** Persistencia durable en el git common dir con separación por runtime (`byRuntime`) y blindaje contra contaminación de tests (`HARNESS_TELEMETRY=0` en Vitest) (GOZS-516).
6. **Selección por contraste y evidencia:** Evaluación de mutaciones por matriz de contraste con candidatos explícitos (GOZS-517).
7. **Plantillas agnósticas de sub-issues y subagentes:** Estandarización de contratos operativos y reglas anti-token-waste (GOZS-518).

## Métricas Sintéticas Previas (`metrics.synthetic_before`)

Preservadas con fines de auditoría histórica:

### 1. Volumen y Distribución por Runtime
- **Total de eventos:** `101`
- **Desglose por runtime:**
  - `antigravity`: `89` eventos (1 sesión, 6 bloqueos legítimos/seguridad)
  - `claude-code`: `4` eventos (1 sesión, 0 bloqueos)
  - `opencode`: `5` eventos (1 sesión, 2 bloqueos)
  - `gemini-cli`: `3` eventos (1 sesión, 0 bloqueos)

### 2. Tool Calls por Categoría
- `shell`: `50`
- `read`: `34`
- `write`: `7`

### 3. Bloqueos e Inyecciones
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
- **Mediana / p90:** `406.715 ms` (línea base sintética bajo entorno de test controlado)
- **Sesiones con bloqueos repetidos:** `0`

## Próximos Pasos (Etapa B)

- Aguardar el cumplimiento de la condición de inicio (7 días de telemetría real acumulada desde el 13-nov-2026, cumpliéndose el 20-nov-2026).
- Ejecutar `node harness-kit/core/scripts/harness-telemetry.mjs --json` sobre la telemetría del git common dir en `DESKTOP-S4P202B`.
- Consolidar `metrics.before`, definir la ventana posterior de 7 a 14 días (`window.after`) y pasar el estado de L-001 a `in_progress`.
