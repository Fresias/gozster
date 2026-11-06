# Harness Experience Library

Fase 4 del harness GOZSter. Esta carpeta es el **Experience Ledger**: un registro
determinista de qué tanto ayuda (o estorba) el harness, medido con telemetría real
del guard en lugar de impresiones.

## Flujo

1. **Emisión** — `guard-cli.mjs` escribe un evento por tool call (fase `pre`, más la fase `post` cuando inyecta contexto) en
   `.harness/telemetry/events.jsonl` vía `harness-kit/core/guard/telemetry.mjs`.
   Sin PII ni secretos: `sk-…` y `eyJ…` se redactan y `cmd` se trunca a 120 caracteres.
   La carpeta `.harness/` está en `.gitignore` (es runtime local, no se commitea).
2. **Agregación** — `harness-kit/core/scripts/harness-telemetry.mjs` lee el `events.jsonl`
   y produce el resumen.
3. **Ledger** — `LEDGER.json` registra cada experimento (`L-###`) con su hipótesis,
   ventana de medición y métricas antes/después.

## Esquema del evento (`events.jsonl`)

Un objeto JSON por línea:

| Campo | Descripción |
|---|---|
| `ts` | Timestamp ISO-8601. |
| `session` | Id de sesión del runtime (p. ej. `session_id` de Claude Code). |
| `runtime` | `claude-code` \| `gemini-cli` \| `opencode` \| `antigravity`. |
| `phase` | `pre` (un evento por tool call) o `post` (solo inyecciones). |
| `kind` | `shell` \| `read` \| `write` \| `read_many` \| `other`. |
| `tool` | Nombre de la herramienta del runtime. |
| `decision` | `allow` \| `block`. |
| `rule` | `ruleId` que bloqueó/aplicó, o `null`. |
| `inject` | `true` si el guard inyectó contexto (p. ej. GH007). |
| `cmd` | Comando o ruta, redactado y truncado a 120 caracteres. |

## Métricas del resumen

El resumen de texto ocupa ≤ 40 líneas (listas recortadas a 5 entradas) y usa tres secciones:

- **`[ACTION]` Tool calls por kind** — eventos `pre` agrupados por `kind`.
- **`[OBSERVATION]` Bloqueos por regla** — conteo de `decision="block"` agrupado por `rule`.
- **`[OBSERVATION]` Inyecciones por regla** — conteo de `inject=true` agrupado por `rule`.
- **`[OBSERVATION]` Time-to-first-edit (TTFE)** — por sesión, ms entre el primer evento y el primer
  `kind="write"`; se reporta **mediana** y **p90** (interpolación lineal).
- **`[ERROR]` Sesiones con > 3 bloqueos repetidos** — sesiones donde una misma `rule` bloqueó
  más de 3 veces (señal de fricción recurrente).

## Uso

```bash
# Resumen legible (lee .harness/telemetry/events.jsonl por defecto)
node harness-kit/core/scripts/harness-telemetry.mjs

# Un archivo específico, salida JSON
node harness-kit/core/scripts/harness-telemetry.mjs ruta/al/events.jsonl --json
```

## Entradas

- [`LEDGER.json`](./LEDGER.json) — el ledger versionado.
- [`EXPERIENCE-L-000.md`](./EXPERIENCE-L-000.md) — línea base del harness (`completed`).
