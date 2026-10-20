# L-000 — Línea base del harness (guard telemetry)

- **Estado:** `measuring`
- **Ventana:** 7 días (`window.before`), arranca cuando GOZS-81 y GOZS-82 estén en `main`.
- **Fuente:** `.harness/telemetry/events.jsonl`
- **Agregador:** `harness-kit/core/scripts/harness-telemetry.mjs`

## Hipótesis

No podemos afirmar que una intervención del harness "mejora las cosas" sin una
línea base determinista. L-000 mide la fricción del guard tal como existe hoy:

1. **Bloqueos por regla** — qué reglas disparan con más frecuencia (dónde choca la gente).
2. **Time-to-first-edit (mediana y p90)** — cuánto tarda un agente desde el inicio de la
   sesión hasta su primer edit; proxy de la fricción de arranque.
3. **Sesiones con > 3 bloqueos repetidos** — sesiones que chocan una y otra vez contra la
   misma regla; señal de que la regla (o su mensaje) necesita rediseño.

## Método

1. Instrumentación en `guard-cli.mjs`: un evento `pre` por tool call, con redacción de
   secretos (`sk-…`, `eyJ…`) y `cmd` truncado a 120 caracteres.
2. Recolectar 7 días de uso real en los 4 runtimes.
3. Correr el agregador y volcar el resultado en `metrics.before` de `LEDGER.json`.

## Por qué la ventana no arranca aún

La métrica central (TTFE) depende de que los eventos de **escritura** lleguen al guard.
Hoy los matchers de hooks no envían escrituras en todos los runtimes (lo arregla
**GOZS-81**) y falta el plugin de **OpenCode** (**GOZS-82**). Si midiéramos antes, la base
reflejaría un guard con cobertura parcial y quedaría `confounded`. Por eso:

- El PR de H-12 entrega la **instrumentación + agregador + este Ledger** con `L-000` en
  `measuring` y `window.before` abierta.
- La ventana de 7 días empieza cuando GOZS-81 y GOZS-82 estén en `main`.
- El cierre del issue espera esos 7 días de datos para rellenar `metrics.before`.

## Resultados

_Pendiente: completar `metrics.before` tras la ventana de 7 días._
