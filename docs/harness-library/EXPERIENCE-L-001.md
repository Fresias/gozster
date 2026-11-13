# L-001 — Harness Hardening y telemetría limpia multi-runtime

- **Estado:** `in_progress`
- **Ventana previa (`window.before`):** `2026-11-06T23:05:00Z` → `2026-11-13T22:15:00Z`
- **Ventana posterior (`window.after`):** `2026-11-13T22:15:00Z` → `2026-11-20T22:15:00Z` (7 días contados tras el merge e instalación de los stages 1 y 3).
- **Fuente:** `$(git rev-parse --git-common-dir)/harness/telemetry/events.jsonl` (persistente en git common dir y compartida entre worktrees).
- **Agregador:** `harness-kit/core/scripts/harness-telemetry.mjs`

## Hipótesis

El sync del guard, la cobertura de Antigravity y los arreglos de falsos positivos reducen los bloqueos repetidos por sesión y el TTFE, sin bajar los bloqueos legítimos.

## Método

1. **Sincronización automática del guard (`GOZS-513`, PR #472):** La copia instalada se sincroniza atómicamente desde `origin/main` en cada sesión, evitando derivas entre ramas de desarrollo.
2. **Cobertura de Antigravity (`GOZS-513`, PR #472):** Hooks nativos políglotas cubriendo `run_command`, `read_file`, `write_file` y `edit_file` con invocación `node` libre de dependencias de bash en Windows.
3. **Eliminación de falsos positivos (`GOZS-514`, PR #473):** Identificación estricta de posición de comando para generadores del harness (`harness-render.mjs`, `harness-compose.mjs`, `bootstrap.mjs`), inyección de GH007 restringida únicamente a `git push`, y exclusión de variables de entorno en heredocs.
4. **Sondeo libre de colisiones de stash (`GOZS-515`, PR #474):** `harness-probe.mjs` utiliza commits temporales o `git stash create` + `apply <sha>`, aislando totalmente la cola compartida de stash entre agentes concurrentes.
5. **Telemetría limpia en common dir (`GOZS-516`, PR #475):** Eventos persistidos en el common dir del clon git, aislamiento de tests mediante `HARNESS_TELEMETRY=0` y agregación por runtime (`byRuntime`).
6. **Criterio de selección B en render (`GOZS-519`):** Exhibición de las 3 lecciones más recientes con evidencia de contraste (`candidato + métrica + delta`) preservando `pinned: true` como excepción manual.

## Resultados de Línea Base Inicial (`metrics.before`)

### 1. Distribución por Runtime y Acciones
- **Total de eventos:** `112` eventos en `1` sesión activa de telemetría limpia.
- **Eventos por Runtime (`byRuntime`):**
  - `antigravity`: 100 eventos, 1 sesión.
  - `opencode`: 5 eventos, 1 sesión.
  - `claude-code`: 4 eventos, 1 sesión.
  - `gemini-cli`: 3 eventos, 1 sesión.
- **Tool calls por categoría (`phase="pre"`):**
  - `shell`: 56
  - `read`: 37
  - `write`: 9

### 2. Bloqueos e Inyecciones
- **Bloqueos (`decision="block"`):**
  - `harness.agents-render`: 2
  - `db.append-only`: 1
  - `git.force-push`: 1
  - `fs.bloatware`: 1
  - `shell.cat-lockfile`: 1
  - `fs.env-leak`: 1
  - `git.reset-hard`: 1
- **Inyecciones preventivas (`inject=true`):**
  - `git.gh007-noreply`: 4
  - `db.migration-test-reminder`: 3
  - `remediate.cwd-lost`: 2
  - `remediate.oversize-output`: 1

### 3. Fricción y Time-To-First-Edit
- **Sesiones con edición registrada:** `1`
- **Time-to-first-edit (`TTFE`):** `406.715 ms` (sesión exploratoria inicial de hardening y compilación).
- **Sesiones con bloqueos repetidos (>3 sobre misma regla):** `0`

## Plan de Seguimiento y Cierre de Ventana

1. **Monitoreo continuo:** Registro de telemetría real en `DESKTOP-S4P202B` durante 7 días operativos completos (`2026-11-13` a `2026-11-20`).
2. **Cierre de ventana L-001:** Al cumplirse el plazo, se ejecutará `node harness-kit/core/scripts/harness-telemetry.mjs --json` para consolidar `metrics.after` y contrastar el delta respecto a la línea base inicial.
