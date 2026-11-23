# QA del Harness GOZSter — Veredicto final (RESUELTO)

15-nov-2026 · Issue GOZS-536 (QA-4) · Base: `main` @ `22941b2` · Plan: `docs/harness-library/QA-HARNESS.md` · **Cierre definitivo: 23-nov-2026 · GOZS-527 (L-001 etapa B + T4/T5)**

## 1. Veredicto

**RESUELTO (actualizado el 23-nov-2026 en GOZS-527; el 15-nov se emitió como `PROVISIONAL`).** Se cumplen todas las condiciones de la sección 3 del plan (`docs/harness-library/QA-HARNESS.md`): todos los **P0** pasan, todos los **P1** pasan o cuentan con aceptación escrita de Gabriel (única excepción aceptada: `R13`), y las limitaciones conocidas están documentadas:

1. **G3 (P0), E8 (P1), R13 (P1), R20 (P2) y QA-2:** cerrados por Gabriel el 16-nov con constancias escritas en `GOZS-528` / `GOZS-527` (ver Apéndice, secciones A.2 y A.3).
2. **H-01 y H-02 (P1), junto con H-03, H-04 y H-08 (P2):** resueltos en `GOZS-538` (PR `#497`, mergeado `2026-11-16T17:48:54Z`).
3. **T4 y T5 (P1):** verificados en verde el 23-nov sobre la ventana limpia de 7 días corridos (`2026-11-16T17:48:54Z` → `2026-11-23T17:48:54Z`; `24.376` eventos en `349` sesiones reales, `L-001` registrado en `completed` en `LEDGER.json`; ver Apéndice, sección A.4).

Lo demostrado en comportamiento real: el guard instalado bloquea los 10 canarios y permite los 6 controles en Antigravity y en Claude Code (simulados y en vivo); la telemetría persiste en el git common dir con sesiones por runtime, sin contaminación de canarios ni tokens reales filtrados.

| Capa | Verificaciones | Pasa | Falla aceptada | Pendiente / no verificado |
|---|---|---|---|---|
| 1 — Repo y CI (R1–R20) | 20 | 19 | 1 (R13, P1 — aceptada por escrito) | 0 |
| 2 — GitHub y gobernanza (G1–G6) | 6 | 6 | 0 | 0 |
| 3 — Ejecución real (E1–E8) | 8 | 8 | 0 | 0 |
| 3 — Telemetría (T1–T5) | 5 | 5 | 0 | 0 |

## 2. Insumos consolidados

| Informe | Issue | Ejecutor | Base | Origen |
|---|---|---|---|---|
| `qa-harness-repo-2026-11-14.md` (capas 1 y 2, ronda 2) | GOZS-532 (QA-2) | `PM-GOZster` en Antigravity | `33bed5a` | `task-555c9f3afc79/workdir/` |
| `qa-harness-desktop-antigravity-2026-11-15.md` + `canary-antigravity.json` | GOZS-534 (QA-3) | `@qa-eng` en Antigravity | `22941b2` | `gozs-534-cfe458287194/workdir/` |
| `qa-harness-desktop-claude-code-2026-11-15.md` + `canary-claude-code.json` | GOZS-535 (QA-3) | QA en Claude Code | `22941b2` | `gozs-535-d25ae92ba7f5/workdir/qa-out/` |
| Telemetría real (`events.jsonl`, 3.349 eventos) | GOZS-536 (QA-4) | Este informe, solo lectura | — | git common dir del repo central de Multica |

Notas sobre los insumos:

- **Origen del informe de QA-2: `task-555c9f3afc79/workdir/qa-harness-repo-2026-11-14.md`, ronda 2 (actualizada el 15-nov).** **Validado por Gabriel el 16-nov contra el adjunto de GOZS-532:** SHA-256 verificado e idéntico (`3676229d33c92b40b6af11953eeb8f9f3c0174e414e0541154a3b31f57a85682`). Las evidencias adjuntas de `R5` y `G5` tenían comandos fallidos (`exit 255`); Gabriel las reverificó en verde el 16-nov, removió la segunda cuenta `labrubru26` y migró la identidad de Git/`gh` en `DESKTOP-S4P202B` a `AgentsMultica` (con el token OAuth anterior de `Fresias` revocado).
- Las dos copias de `canary-antigravity.json` (`workdir/` y `workdir/qa-out/`) son idénticas byte a byte.
- Búsqueda de secretos en los cinco archivos de entrada (solo conteos): 0 tokens de GitHub, 0 claves `sk-`, 0 JWT, 0 URLs con credenciales.
- Los insumos no se commitean; quedan adjuntos a sus issues.

## 3. Resultado por verificación

### 3.1 Capa 1 — Repo y CI (QA-2)

| ID | Sev | QA-2 (`33bed5a`) | Consolidado | Nota |
|---|---|---|---|---|
| R1–R10 | P0/P1 | Pasa | **Pasa** | |
| R11 | P0 | Falla aceptada (#482, #483, #489) | **Pasa** | Revalidado el 15-nov contra `main` @ `22941b28e18bd493559a3f8e4f6167bc483859fe`: `mergeable: true` en #484, #486, #487, #488, #489, #490, #491, #492 y #493. #482 y #483 están excluidos por el plan; #485 se cerró sin merge. |
| R12 | P1 | Pasa | **Pasa** | |
| R13 | P1 | Falla aceptada | **Falla aceptada** | GOZS-523 no tiene carpeta de sondas. Constancia escrita confirmada por Gabriel el 16-nov (`"Acepto la excepción R13: GOZS-523 no tiene carpeta de sondas en harness/experience/probes/"`, ver Apéndice A.3). |
| R14–R19 | P1/P2 | Pasa | **Pasa** | |
| R20 | P2 | Falla | **Pasa** | Confirmado por Gabriel el 16-nov: la línea 3 de `.github/CODEOWNERS` ("aprobación y merge en GitHub de @Fresias") coincide con la gobernanza vigente (ver Apéndice A.3). |

### 3.2 Capa 2 — GitHub y gobernanza (QA-2)

| ID | Sev | Consolidado | Nota |
|---|---|---|---|
| G1 | P0 | **Pasa** | Verificado por el revisor con la API el 15-nov (el bot no ve `bypass_actors`). Actualizado el 17-nov (`GOZS-550` / `#505`, confirmado por `@Fresias`): protección de `main` consolidada exclusivamente en el ruleset `Proteger` (ID `27250457`), branch protection rule clásica eliminada, lista de bypass vacía (desde el 16-nov) y checks obligatorios `harness/merge-check` y `Typecheck, Lint & Test` (GitHub Actions, `integration_id: 15368`, ramas al día). |
| G2 | P0 | **Pasa** | PRs #482 a #492. |
| G3 | P0 | **Pasa** | Verificado por historial por Gabriel el 16-nov (`0` commits directos a `main` desde el 01-nov; `0` PRs sin aprobación desde la separación de identidades `#482`–`#500`; bypass de `Proteger` vacío desde el 16-nov). Excepción justificada del 17-nov para PR `#501` (`d656b0a`) documentada en Apéndice A.3. |
| G4 | P1 | **Pasa** | |
| G5 | P1 | **Pasa** | Reverificado en verde el 16-nov por Gabriel. Único admin: `Fresias`; `AgentsMultica`: `write`; la segunda cuenta `labrubru26` fue removida el 16-nov. |
| G6 | P2 | **Pasa** | GOZS-523 cerrado como duplicado de GOZS-527; GOZS-527 ejecutado al cerrarse la ventana de 7 días (23-nov). |

### 3.3 Capa 3 — Ejecución real en DESKTOP-S4P202B (QA-3)

| ID | Sev | Antigravity (GOZS-534) | Claude Code (GOZS-535) | Consolidado |
|---|---|---|---|---|
| E1 | P0 | `installed` | `installed` | **Pasa** |
| E2 | P0 | `installed` | `installed` | **Pasa** |
| E3 | P0 | n/a | 17 filas, 0 fallas | **Pasa** |
| E4 | P0 | 17 filas, 0 fallas (S1 n/a) | n/a | **Pasa** |
| E5 | P1 | n/a | 3.234 → 3.234 eventos | **Pasa** |
| E6 | P0 | 10/10 bloqueadas, 6/6 permitidas | n/a | **Pasa** |
| E7 | P0 | n/a | 10/10 bloqueadas, 6/6 permitidas | **Pasa** |
| E8 | P1 | 0 llamadas `manage_task status` (verificado por Gabriel el 16-nov) | n/a | **Pasa** |

- **E7 tiene confirmación independiente en la telemetría:** la sesión real de Claude Code del 15-nov (06:59–07:02Z, 37 eventos) registra exactamente los 10 bloqueos de la tabla 6.4, más 3 `shell.rm-rf` de los intentos de limpieza que el informe describe.
- **E8:** verificado directamente por Gabriel el 16-nov en el transcript de Antigravity `07627682-509f-4c69-a044-963bfd8a5c18` (`GOZS-534`): `0` llamadas a `manage_task` con `Action: status` (única llamada real: `Action: list` a `2026-11-15T07:07:12Z`; coincide con el autoinforme).

### 3.4 Capa 3 — Telemetría (QA-4)

| ID | Sev | Resultado | Evidencia |
|---|---|---|---|
| T1 | P1 | **Pasa** | Los checkouts resuelven el mismo git common dir (`resolveTelemetryDir()`) y dan salida idéntica (sección 4.1 y Apéndice A.4). |
| T2 | P1 | **Pasa** | En la ventana limpia de 7 días (16-nov → 23-nov) solo aparecen `antigravity` (`20.612` ev / `238` s) y `claude-code` (`3.764` ev / `111` s); `0` eventos de `opencode`/`gemini-cli`. |
| T3 | P0 | **Pasa** | `0` tokens reales en todo el directorio de telemetría (revalidado el 23-nov; ver Apéndice A.4). |
| T4 | P1 | **Pasa** | Revalidado sobre la ventana limpia de 7 días (`24.376` eventos): `13` bloqueos `git.repo-rewire` (`0,053%`) y `33` `read.guard-installed` (`0,135%`), todos explicables y sin falsos positivos masivos (Apéndice A.4). |
| T5 | P1 | **Pasa** | `L-001` registrado como `completed` en `docs/harness-library/LEDGER.json` (`GOZS-527`, 23-nov): ventana exacta de 7 días (`2026-11-16T17:48:54Z` → `2026-11-23T17:48:54Z`), `349` sesiones (`348` UUID reales + `1` evento residual `unknown`), `byRuntime`, `start_condition`, `original_hypothesis`, `synthetic_before` y `caveat` (Apéndice A.4). |

## 4. Evidencia de telemetría

T1 y T3 (ventana 08-nov → 15-nov 00:00Z) los corrió Gabriel en Git Bash desde `gozs-534-cfe458287194` y `gozs-535-d25ae92ba7f5`. El resto es lectura directa de `events.jsonl` del repo central el 15-nov, sin mostrar contenido de eventos. Los comandos están en el anexo.

### 4.1 T1 — misma fuente, mismos totales

```
ventana 2026-11-08 → 2026-11-15: totalEvents 2479, totalSessions 1
antigravity 2395 ev / 1 sesión · claude-code 76 / 1 · opencode 5 / 1 · gemini-cli 3 / 1
```

El archivo empieza el 13-nov 22:13:30Z, así que la ventana de 7 días contiene en realidad unas 26 horas de datos. Al momento de este informe tiene 3.349 eventos (último: 15-nov 07:09:20Z).

### 4.2 Valores distintos del campo `session` (archivo completo)

```
runtime     | session     | eventos | primero → último (UTC)
antigravity | unknown     | 3109    | 13-nov 22:13:30 → 15-nov 07:09:20
claude-code | a2a1dbd5-…  |   37    | 15-nov 06:59:35 → 15-nov 07:02:08
claude-code | unknown     |  195    | 13-nov 22:20:17 → 15-nov 06:59:43
gemini-cli  | unknown     |    3    | 13-nov 22:20:17 → 13-nov 22:20:19
opencode    | unknown     |    5    | 13-nov 22:20:17 → 13-nov 22:20:18
pares duplicados (<2 s): antigravity 2
```

Solo hay dos valores: `unknown` (3.312 eventos) y una sesión real (37). Ver H-01.

### 4.3 T2 — origen de `opencode` y `gemini-cli`

Los 8 eventos caen en una ráfaga de 2 segundos el 13-nov a las 22:20:17Z, junto con los primeros 4 de `claude-code`. Coinciden en cantidad y bloqueos con la línea base sintética anulada que documenta `EXPERIENCE-L-001.md` (opencode 5, gemini-cli 3). No son canarios (el script solo tiene entradas de `claude-code` y `antigravity`), ni tests (Vitest corre con `HARNESS_TELEMETRY=0` y E5 lo confirma), ni uso real (el plugin de OpenCode no escribe telemetría). No se identificó qué script generó la ráfaga.

### 4.4 T4 — bloqueos de `git.repo-rewire` y `read.guard-installed`

Total en el archivo: 32 y 19. Se clasifica como canario el bloqueo cuyo comando o ruta coincide con las filas D3, D5 o D6 de la tabla 6.4.

| Franja (UTC) | Origen | `git.repo-rewire` | `read.guard-installed` |
|---|---|---|---|
| 14-nov 23:20–23:23 | Corridas del script antes del merge de #492 (GOZS-531); la de Antigravity sale de `task-555c9f3afc79` | 10 | 6 canario + 1 sin identificar |
| 15-nov 01:53–03:17 | 7 corridas del script; la de Antigravity sale de `task-d4666b3698a7` (rama de GOZS-528) | 14 | 7 |
| 15-nov 06:59–07:03 | QA-3: GOZS-535 (script y en vivo) y GOZS-534 (script y en vivo) | 8 | 4 canario + 1 sin identificar |

- **Solo 13 de los 51 bloqueos vienen de GOZS-534/535.** El resto son corridas anteriores del mismo script. En la ventana que termina el 15-nov 00:00Z (10 y 7) no hay ninguno de GOZS-534/535: son todos de la primera franja.
- **No hay bloqueos orgánicos identificados** de estas dos reglas, así que no hay señal de falsos positivos masivos. Tampoco hay evidencia de uso real que las ejercite.
- Los 2 bloqueos sin identificar son de Antigravity y ocurren 1 a 3 minutos antes de una corrida del script en la misma franja.

## 5. Hallazgos

| ID | Sev | Hallazgo | Evidencia |
|---|---|---|---|
| H-01 | **P1** | **La telemetría no registra la sesión de Antigravity ni de OpenCode.** `resolveSession()` busca `session_id`, `sessionId`, `session.id`, `input.session_id` y `HARNESS_SESSION_ID`; Antigravity envía `conversationId` y OpenCode `input.sessionID`. Todos sus eventos quedan en `unknown`. | `harness-kit/core/guard/telemetry.mjs:104`; `harness-kit/core/runtimes/antigravity.json:12`; sección 4.2. Sin cambios desde el 20-oct (`78b6475`). |
| H-02 | **P1** | **El script de canarios escribe eventos anónimos en la telemetría real**, y la línea base sintética anulada cae dentro de la ventana de L-001 (que empieza a las 22:12:41Z; la ráfaga sintética es de 22:13:30–22:23:55Z). | 195 de los 232 eventos de `claude-code` son `unknown`; sección 4.4. |
| H-03 | P2 | `QA-HARNESS.md` documenta `harness-telemetry.mjs --since`, que no existe: el script toma la fecha como ruta, avisa por stderr y sale con 0 sin datos. | `harness-kit/core/scripts/harness-telemetry.mjs:249-261`. |
| H-04 | P2 | Doble registro cuando la sesión se abre dentro del repo en una máquina con el kit instalado: corren el hook del proyecto y el dispatcher de usuario. No afecta a Multica (2 pares en 3.349 eventos). | En el clon de trabajo, 32 pares idénticos en 64 eventos; `harness-kit/core/plugins/claude-code/dispatch.mjs:49`. |
| H-05 | P2 | Las reglas de shell coinciden con texto dentro de cualquier comando. Durante este QA el guard bloqueó 4 comandos que solo contenían cadenas de canario o `.env` como datos. Además `cmd` se trunca a 120 caracteres, lo que limita atribuir bloqueos a posteriori. | Bloqueos de `read.guard-installed`, `git.repo-rewire`, `fs.protected` y `shell.env-leak` en la sesión de QA-4. No se esquivó el guard. |
| H-06 | P2 | El plugin de OpenCode evalúa reglas pero no llama a `recordEvent`. Coincide con la limitación conocida ("no se usan"), pero no está documentado. | `harness-kit/core/plugins/opencode/opencode-plugin.ts`. |
| H-07 | P2 | De QA-3 (GOZS-535): el mensaje de bloqueo no trae el ID de la regla, y los repos git descartables no se pueden limpiar en Windows con el guard activo. `qa-canary-repo/` sigue en la carpeta de trabajo de GOZS-535. | Informe de GOZS-535, secciones Limpieza y Hallazgos. |
| H-08 | P2 | Test inestable por tiempo en el gate: `harness-kit/tests/harness-flow-enforcement.spec.ts`, caso "GIVEN gh pr create/merge --repo de OTRO repositorio THEN no aplica el sello de este repo", superó su límite de 30 s (tardó 40,8 s) en la suite completa y tumbó el gate de este PR en el primer intento. | Primer gate: 1 falla en 3.690 tests más 2 errores `[vitest-worker]: Timeout calling "onTaskUpdate"`. El archivo aislado pasa 90/90 en 20 s y el segundo gate pasó completo. |

Consecuencias medibles de H-01 en el agregador, hoy:

- `totalSessions: 2` para 3.349 eventos de cuatro runtimes.
- TTFE calculado sobre 2 muestras (mediana 237 s): no representa nada.
- 10 de las 11 entradas de `repeatedBlockSessions` son de la sesión `unknown`, y `ppcTrigger.should_trigger` da `true`. Es una señal falsa de fricción, producida por los canarios.

## 6. Bloqueo de GOZS-527 / T5 e issue de arreglo propuesto

Con H-01, las sesiones de Antigravity (93 % de los eventos) nunca cuentan. El criterio de L-001 de "al menos 5 sesiones reales" solo se podría alcanzar con sesiones de Claude Code, y la línea base seguiría sin TTFE ni bloqueos repetidos válidos para el runtime principal. Los eventos ya escritos no guardan el id, así que no se pueden reatribuir. Con H-02, aunque las sesiones se registraran bien, la ventana seguiría mezclando uso real con canarios y con la ráfaga sintética.

**La ventana de 7 días de L-001 se reinicia recién cuando estén resueltos los dos P1:**

1. **H-01:** el id de sesión de Antigravity (y OpenCode) llega a la telemetría.
2. **H-02:** ni el script de canarios ni las corridas sintéticas escriben en la telemetría real.

La nueva `start_condition` es la fecha del merge del **último** de los dos arreglos; arreglar solo uno no reinicia nada. Si los arreglos van en issues separados, **GOZS-527 depende de ambos** y no se desbloquea con uno solo.

Borrador del issue (lo crea el PM; rama `chore/<#>-harness-telemetria-sesiones`, PPC y label `harness-authorized`; no forma parte de este PR). Está redactado como un solo issue; si se divide, los criterios 1 y 2 son los dos P1 y cada uno va a su issue:

> **[CHORE]: Telemetría del guard con id de sesión por runtime y sin eventos de canarios (desbloquea GOZS-527)**
>
> Criterios de aceptación:
> 1. `resolveSession()` lee `conversationId` (Antigravity) e `input.sessionID` (OpenCode). Un test por runtime, con los fixtures existentes, exige una sesión distinta de `unknown`.
> 2. `scripts/qa-harness-canary.mjs` y cualquier corrida sintética del guard no escriben en la telemetría real, o lo hacen con una sesión marcada que el agregador excluye.
> 3. Un único registro por llamada cuando coinciden el hook del proyecto y el dispatcher instalado.
> 4. `harness-telemetry.mjs` implementa `--since` y `--until`, y falla ante argumentos desconocidos o un archivo explícito inexistente.
> 5. L-001: nueva `start_condition` con la fecha en que quedan mergeados los criterios 1 y 2 (la del último, si van separados), y exclusión documentada de los eventos anteriores (sintéticos y canarios). GOZS-527 queda dependiendo de ambos.
> 6. Se agrega `original_hypothesis` a L-001 o se corrige T5 en el plan.

## 7. Seguimiento (fuera de este PR)

- **Worktrees acumulados (P2):** el repo central de Multica tiene 105 worktrees registrados y la carpeta de trabajo 226 carpetas de tarea, algunas de octubre. Multica no las limpia al terminar.
- **Doble despacho (P1 de proceso):** GOZS-537 tuvo dos carpetas de tarea (`task-555c9f3afc79` → #494, mergeado; `gozs-537-8f9e20a7ec2d` → #495, abierto y en conflicto con el mismo cambio). Es la causa del PR duplicado. También hay dos carpetas para GOZS-534 y GOZS-533, y cinco para GOZS-528.
- **Carpetas de tarea reutilizadas:** `task-555c9f3afc79` contiene el informe de GOZS-532, la rama de GOZS-537 y corridas del script de canarios previas al merge de GOZS-531, lo que dificulta ubicar los entregables de cada issue.
- **Telemetría vieja dispersa:** 29 archivos `task-*/workdir/gozster/.harness/telemetry/events.jsonl` anteriores a la centralización.
- **Timeout en el gate (P2, H-08):** `harness-flow-enforcement.spec.ts` supera su límite de 30 s cuando corre dentro de la suite completa en esta máquina. Mientras no se corrija, un gate puede fallar sin que el cambio tenga la culpa.
- **H-03 a H-08** al backlog.

## 8. Pendientes para el veredicto definitivo (todos cerrados al 23-nov-2026)

1. ~~Gabriel: G3 (bypass), E8 (conteo en el transcript), constancia escrita de la excepción de R13, y coherencia de R20.~~ → **Cerrado (16-nov-2026, constancias escritas en Apéndice A.3).**
2. ~~Gabriel, antes de mergear este PR: validar el informe de QA-2 usado aquí (`task-555c9f3afc79`, ronda 2) contra el adjunto de GOZS-532.~~ → **Validado (16-nov-2026):** SHA-256 verificado e idéntico (`3676229d33c92b40b6af11953eeb8f9f3c0174e414e0541154a3b31f57a85682`), `R5` y `G5` reverificados en verde, `labrubru26` removida e identidad en `DESKTOP-S4P202B` migrada a `AgentsMultica` (token OAuth anterior de `Fresias` revocado).
3. ~~Decisión sobre H-01 y H-02: issue de arreglo (sección 6) o aceptación por escrito.~~ → **Resuelto en `GOZS-538` (PR `#497`, mergeado `2026-11-16T17:48:54Z`), junto con `H-03`, `H-04` y `H-08`.**
4. ~~T4 y T5 sobre una ventana nueva de 7 días, que empieza cuando estén mergeados los dos arreglos P1. Se agregan como apéndice a este documento.~~ → **Completado (23-nov-2026, `GOZS-527`, Apéndice A.4).**

## Apéndice — Cierre definitivo (`T4`/`T5`, QA-2 y verificaciones manuales · 23-nov-2026 · GOZS-527)

Este apéndice asienta la evidencia recolectada entre el 16-nov y el 23-nov-2026 para elevar el veredicto del QA del harness de **`PROVISIONAL`** a **`RESUELTO`** y cerrar documentalmente **GOZS-528** junto con **GOZS-527** (L-001 etapa B).

### A.1 Resolución de hallazgos P1/P2 y gobernanza
- **`GOZS-538` (PR `#497`, mergeado `2026-11-16T17:48:54Z`):** resolvió `H-01` (resolución de `conversationId` en Antigravity y `sessionID` en OpenCode), `H-02` (aislamiento de canarios y exclusión de sesiones sintéticas en el agregador), `H-03` (`--since`/`--until` y validación estricta de argumentos en `harness-telemetry.mjs`), `H-04` (deduplicación del dispatcher cuando corre junto al hook del proyecto, documentando su limitación conocida con `origin/main` y `HARNESS_TELEMETRY=0`), `H-08` (estabilización del tiempo en `harness-flow-enforcement.spec.ts`), más `start_condition` y `original_hypothesis` en `LEDGER.json`.
- **`GOZS-550` (17-nov-2026):** consolidó la protección de `main` exclusivamente en el ruleset `Proteger` (`27250457`), eliminó la branch protection rule clásica y dejó la lista de bypass vacía (nota de `G1` conservada en sección 3.2).

### A.2 Validación de QA-2 (`GOZS-532`) e identidad en `DESKTOP-S4P202B`
Confirmado por escrito por Gabriel el **2026-11-16 (22:41 ART / `2026-11-17T01:41Z`)**:
- **Integridad del informe QA-2:** el SHA-256 del adjunto de `GOZS-532` es `3676229d33c92b40b6af11953eeb8f9f3c0174e414e0541154a3b31f57a85682` y coincide exactamente con el informe consolidado en QA-4.
- **Reverificación de `R5` y `G5`:** las evidencias adjuntas originales contenían comandos con `exit 255`; Gabriel las reverificó el 16-nov y ambas pasan.
- **Colaboradores (`G5`):** `labrubru26` (segunda cuenta de Gabriel) fue removida el 16-nov.
- **Identidad en `DESKTOP-S4P202B`:** las credenciales de Git y `gh` pasaron a `AgentsMultica`; el token OAuth anterior de `Fresias` quedó revocado.

### A.3 Verificaciones manuales confirmadas por Gabriel
1. **`R13` (P1) — Falla aceptada por escrito (`2026-11-16T22:21Z`):** *"Acepto la excepción R13: GOZS-523 no tiene carpeta de sondas en `harness/experience/probes/`."*
2. **`E8` (P1) — Pasa (`2026-11-16T22:31Z`):** verificado directamente en el transcript de Antigravity `07627682-509f-4c69-a044-963bfd8a5c18` (`GOZS-534`). Llamadas a `manage_task` con `Action: status`: **`0`** (única llamada real: `Action: list` a las `2026-11-15T07:07:12Z`, dentro de la ventana de `npm test`). Coincide con el autoinforme.
3. **`G3` (P0) — Pasa (`2026-11-17T01:41Z`, con excepción justificada del `2026-11-17T03:10Z`):**
   - *Rule Insights* no está disponible en la UI del plan actual; Gabriel verificó el historial completo el 16-nov: `0` commits directos a `main` desde el 01-nov (`2f54e8c` corresponde al PR `#463`), `0` PRs mergeados sin aprobación tras la separación de identidades (`#482`–`#500`, todos aprobados), y los PRs previos (`#363`–`#478`) se justifican por haberse abierto antes de separar el token de `Fresias`. Desde el 16-nov la lista de bypass de `Proteger` está vacía.
   - **Excepción justificada registrada (`2026-11-17T03:10:30Z`, PR `#501` / `GOZS-511`, merge commit `d656b0a`):** Gabriel quitó temporalmente `harness/merge-check` de los checks obligatorios para mergear el propio cambio de disparador a `pull_request_target` en `.github/workflows/harness-merge-check.yml`, manteniendo `APPROVED` de `Fresias` y `Typecheck, Lint & Test` obligatorios, y restauró ambos checks con fuente GitHub Actions y bypass vacío inmediatamente después.
4. **`R20` (P2) — Pasa (`2026-11-17T01:41Z`):** confirmado que la línea 3 de `.github/CODEOWNERS` (*"aprobación y merge en GitHub de @Fresias"*) coincide con la gobernanza vigente.

### A.4 Resultados de telemetría en la ventana limpia de 7 días (`T1`–`T5`)

- **Ventana limpia fijada (`T_merge` de PR `#497` + 7 días):** `2026-11-16T17:48:54Z` → `2026-11-23T17:48:54Z`.
- **Fuente verificada (`T1`):** `<git common dir>/harness/telemetry/events.jsonl` (`resolveTelemetryDir()`, `HARNESS_TELEMETRY_DIR` sin definir) en `DESKTOP-S4P202B`.
- **Comando exacto ejecutado:**
  ```bash
  node harness-kit/core/scripts/harness-telemetry.mjs --since 2026-11-16T17:48:54Z --until 2026-11-23T17:48:54Z --json
  ```
- **Resumen agregado (`T2`, `T5`):**
  - `totalEvents`: **`24.376`** (rango real observado: `2026-11-16T17:54:26.691Z` → `2026-11-23T17:48:47.034Z`).
  - `totalSessions`: **`349`** (`348` sesiones UUID reales + `1` evento residual `unknown` de `antigravity` a `2026-11-16T17:54:26.691Z`, 5 min post-merge; umbral `>= 5` cumplido ampliamente).
  - `byRuntime`: únicamente los 2 runtimes productivos — `antigravity` (`20.612` eventos, `238` sesiones) y `claude-code` (`3.764` eventos, `111` sesiones); `0` eventos de `opencode` o `gemini-cli`.
  - `actionsByKind`: `shell: 13.739`, `read: 7.362`, `write: 3.214`.
  - `timeToFirstEdit`: `279` muestras · mediana `256.035 ms` · p90 `726.729 ms`.
  - `repeatedBlockSessions`: `28` entradas (`16` por `read.oversize`, `12` por `pr.requires-seal`).
- **Re-verificación `T3` (P0 — sin secretos):** `0` coincidencias de tokens reales (`gh[pousr]_[A-Za-z0-9]{20,}` = `0`, `github_pat_[A-Za-z0-9_]{20,}` = `0`) en todo el directorio de telemetría (1 aparición de la cadena regex literal `github_pat_` sin secreto dentro de un comando `allow` el `2026-11-17T04:38Z`).
- **Resultado `T4` (P1 — reglas nuevas sin falsos positivos masivos):** sobre `24.376` eventos reales en 7 días:
  - **`git.repo-rewire`: `13` bloqueos (`0,053%` — `8` `claude-code`, `5` `antigravity`).** Desglose: `8` bloqueos legítimos de `git branch -m` (intentos de renombrar ramas en lugar de `git checkout -b`), `1` bloqueo legítimo de `New-Item -ItemType Junction` y `4` comandos encadenados con patrón coincidente (limitación documentada `H-05`). Nivel muy bajo y 100% explicable.
  - **`read.guard-installed`: `33` bloqueos (`0,135%` — `17` `claude-code`, `16` `antigravity`).** Desglose: `16` bloqueos legítimos de `grep`/`cat` sobre `.claude/hooks/` del repo, `7` bloqueos `read_file` sobre rutas de guard/hooks y `10` comandos shell con cadenas literales del guard en heredocs/scripts (limitación documentada `H-05`). Nivel bajo y 100% explicable; sin señal de falsos positivos masivos.
- **Resultado `T5` (P1 — L-001 registrado):** `docs/harness-library/LEDGER.json` actualizado en `GOZS-527` con `status: "completed"`, `start_condition` y `window.before.start` estampados en `2026-11-16T17:48:54Z`, `window.before.end = "2026-11-23T17:48:54Z"`, `window.after: null`, `metrics.after: null`, `metrics.before` completo con `byRuntime`, y preservación intacta de `original_hypothesis`, `synthetic_before` y `caveat` (incluida la limitación `H-04`). `docs/harness-library/EXPERIENCE-L-001.md` actualizado en concordancia.

### A.5 Veredicto definitivo
Cumplidos todos los criterios de la sección 3 de `docs/harness-library/QA-HARNESS.md` (`0` P0 pendientes o en falla, `0` P1 pendientes o sin aceptación escrita, y limitaciones documentadas), el QA del harness queda oficialmente en estado **`RESUELTO`**, cerrando documentalmente **GOZS-528** y **GOZS-527**.

## Anexo — Comandos de telemetría

`F` es `<git common dir>/harness/telemetry/events.jsonl`. Ninguno imprime contenido de eventos.

T1, T2 y bloqueos por regla (ventana fija; `--since` no existe, ver H-03):

```bash
node --input-type=module -e 'import fs from "node:fs";import {parseJsonl,summarize} from "./harness-kit/core/scripts/harness-telemetry.mjs";const [f,a,b]=process.argv.slice(1);const s=summarize(parseJsonl(fs.readFileSync(f,"utf8")).filter(e=>e.ts>=a&&e.ts<b));console.log(JSON.stringify({archivo:f,ventana:[a,b],totalEvents:s.totalEvents,totalSessions:s.totalSessions,byRuntime:s.byRuntime,blocksByRule:s.blocksByRule},null,2))' "$F" 2026-11-08T00:00:00.000Z 2026-11-15T00:00:00.000Z
```

T3 (solo el conteo):

```bash
grep -rhoE 'gh[pousr]_[A-Za-z0-9]{20,}|github_pat_' "$(dirname "$F")" | wc -l
```

Valores distintos de `session` y pares duplicados (sección 4.2):

```bash
node -e 'const fs=require("fs");const [f,a,b]=process.argv.slice(1);const NL=String.fromCharCode(10);const m=new Map(),d={};let p=null,tot=0,ok=0,win=0;for(const l of fs.readFileSync(f,"utf8").split(NL)){if(!l.trim())continue;tot++;let e;try{e=JSON.parse(l)}catch{continue}ok++;if(!(e.ts>=a&&e.ts<b))continue;win++;const rt=e.runtime||"(sin runtime)";const k=rt+" | "+(e.session===undefined?"(campo ausente)":e.session||"(vacio)");const r=m.get(k)||{n:0,first:e.ts,last:e.ts};r.n++;if(e.ts<r.first)r.first=e.ts;if(e.ts>r.last)r.last=e.ts;m.set(k,r);if(p&&p.runtime===e.runtime&&p.tool===e.tool&&p.cmd===e.cmd&&p.phase===e.phase&&Math.abs(Date.parse(e.ts)-Date.parse(p.ts))<2000){d[rt]=(d[rt]||0)+1;p=null}else p=e}console.log("lineas:",tot,"| JSON validas:",ok,"| en ventana:",win);console.log("runtime | session | eventos | primero -> ultimo");for(const [k,r] of [...m].sort())console.log(k,"|",r.n,"|",r.first,"->",r.last);console.log("pares duplicados (<2s) por runtime:",JSON.stringify(d))' "$F" 2026-11-08T00:00:00.000Z 2026-11-16T00:00:00.000Z
```

Bloqueos de las dos reglas por hora, origen y tipo de sesión (sección 4.4):

```bash
node -e 'const fs=require("fs");const [f,a,b]=process.argv.slice(1);const NL=String.fromCharCode(10);const R=["git.repo-rewire","read.guard-installed"];const blk={};let win=0;for(const l of fs.readFileSync(f,"utf8").split(NL)){let e;try{e=JSON.parse(l)}catch{continue}if(!(e.ts>=a&&e.ts<b))continue;win++;if(e.decision==="block"&&R.includes(e.rule)){const c=String(e.cmd||"").split(String.fromCharCode(92)).join("/").toLowerCase();const canario=c.includes("qa-canary")||c.includes("qa-wt")||c.endsWith("harness-kit/core/guard/rules.json");const s=e.session&&e.session!=="unknown"?"sesion real":"unknown";const k=[e.rule,e.runtime||"(sin runtime)",e.ts.slice(0,13)+"Z",canario?"canario":"otro",s].join(" | ");blk[k]=(blk[k]||0)+1}}console.log("eventos en ventana:",win);console.log("regla | runtime | dia-hora UTC | origen | sesion | bloqueos");for(const k of Object.keys(blk).sort())console.log(k,"|",blk[k])' "$F" 2026-11-08T00:00:00.000Z 2026-11-16T00:00:00.000Z
```
