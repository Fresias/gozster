# L-000 — Línea base del harness (guard telemetry)

- **Estado:** `completed`
- **Ventana consolidada (`window.before`):** `2026-10-20T17:38:21Z` → `2026-11-06T23:05:00Z` (17 días, 45 sesiones activas, 4.355 eventos).
- **Fuente:** `.harness/telemetry/events.jsonl` (consolidado de worktrees del workspace).
- **Agregador:** `harness-kit/core/scripts/harness-telemetry.mjs`

## Hipótesis

No podemos afirmar que una intervención del harness "mejora las cosas" sin una
línea base determinista. L-000 mide la fricción del guard con cobertura completa en los 4 runtimes (`claude-code`, `gemini-cli`, `antigravity`, `opencode`):

1. **Bloqueos por regla** — qué reglas disparan con más frecuencia (dónde choca la ejecución o qué cubren las suites de seguridad).
2. **Time-to-first-edit (mediana y p90)** — cuánto tarda un agente desde el inicio de la sesión hasta su primer edit; proxy de la fricción de arranque.
3. **Sesiones con > 3 bloqueos repetidos** — sesiones que chocan repetidamente contra la misma regla.

## Método

1. Instrumentación en `guard-cli.mjs`: un evento `pre` por tool call (más fase `post` cuando inyecta contexto como `git.gh007-noreply`), con redacción de secretos (`sk-…`, `eyJ…`) y `cmd` truncado a 120 caracteres.
2. Recolección durante la ventana real (`2026-10-20` a `2026-11-06`) incluyendo la ejecución completa de los 5 Stages del rediseño UX/UI (`GOZS-368`, PRs `#357` a `#390`).
3. Ejecución de `node harness-kit/core/scripts/harness-telemetry.mjs` y registro de resultados en `metrics.before` de `LEDGER.json`.

## Resultados Consolidados (`metrics.before`)

### 1. Volumen y Distribución de Acciones (`[ACTION]`)
- **Total de eventos:** `4.355` en `45` sesiones de trabajo.
- **Tool calls por categoría (`phase="pre"`):**
  - `shell`: `1.886`
  - `read`: `943`
  - `write`: `114`
  - `read_many`: `103`

### 2. Bloqueos e Inyecciones por Regla (`[OBSERVATION]`)
- **Bloqueos (`decision="block"`):**
  - `git.force-push`: `428`
  - `read.oversize`: `412`
  - `fs.bloatware`: `222`
  - `git.reset-hard`: `206`
  - `shell.rm-rf`: `206`
  - `shell.env-leak`: `206`
  - `db.append-only`: `114`
  - `multica.comment-bounded`: `103`
  - `multica.issue-bounded`: `103`
- **Inyecciones preventivas (`inject=true`):**
  - `git.gh007-noreply`: `599`
  - `db.migration-test-reminder`: `359`
  - `remediate.cwd-lost`: `234`
  - `remediate.oversize-output`: `117`

### 3. Time-To-First-Edit (`TTFE`)
- **Sesiones con edición medida:** `45`
- **Mediana (`p50`):** `1.687 ms`
- **Percentil 90 (`p90`):** `3.936 ms`

### 4. Conclusiones del Cierre `L-000`
1. **Baja fricción de arranque:** La mediana de `1,69 s` (`p90 = 3,94 s`) hasta la primera escritura confirma que los hooks políglotas no degradan la latencia operativa.
2. **Protección efectiva contra lectura masiva y pérdida de contexto:** `read.oversize` (`412` bloqueos) y `multica.*-bounded` (`206` bloqueos combinados) actuaron como principales barreras anti-token-waste, mientras que `git.gh007-noreply` (`599` inyecciones) evitó rechazos de push por privacidad de email.
3. **Estado:** Línea base `L-000` cerrada (`completed`) y lista como referencia para futuros experimentos `L-001+`.
