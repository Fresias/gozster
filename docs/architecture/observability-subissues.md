# Protocolo de Observabilidad y Auditoría de Consumo Acumulado en Sub-Issues

> **Squad GOZSter — Arquitectura y Operaciones**  
> **Alineación:** Multica 0.8.2, Filosofía Karpathy, Regla Ponytail, Contrato Anti-Token-Waste.

Este documento establece el estándar operativo y la guía de observabilidad para medir, auditar y reportar de manera consolidada el consumo de tokens, costo y tiempo de ejecución en árboles jerárquicos de Issues y Sub-Issues en la plataforma Multica.

---

## 1. Contexto y Filosofía Operativa

En flujos de trabajo multi-agente estructurados por etapas (Stages), las épicas y features complejos se desglosan en Sub-Issues independientes (por ejemplo, Stage 1: Desarrollo Frontend/Backend, Stage 2: Auditoría y Verificación QA).

Históricamente, evaluar el costo total de un feature requería inspeccionar manualmente cada tarea individualmente, generando fricción, dispersión y riesgo de fugas presupuestarias. Con la introducción de **Multica 0.8.2**, la plataforma provee agregación nativa del árbol de ejecución a través del panel de Runs y del parámetro `scope=subtree`.

### Principios Rectores:
1. **Regla Ponytail ("El mejor código es el que no se escribe"):** No se implementan scripts de NPM ni paquetes adicionales para parsear métricas; se aprovecha la infraestructura y APIs nativas de Multica.
2. **Filosofía Karpathy:** Cambios y reportes quirúrgicos, concisos y sin ruido visual redundante.
3. **Anti-Token-Waste:** Monitoreo estricto de ejecuciones (`runs`), evitando reintentos infinitos, polling descontrolado y lecturas masivas no acotadas.

---

## 2. Guía de Extracción de Métricas Consolidadas

### 2.1. Activación en el Panel de Runs y Sidebar (UI Web/Desktop)

Multica 0.8.2 introduce la casilla interactiva **"Include sub-issues"**:

1. **Ubicación en Sidebar del Issue:**
   - En la vista principal del Issue padre (ej. `GOZS-456`), navegar a la barra lateral derecha (*Sidebar*), sección de ejecuciones y costos.
   - Marcar la opción **"Include sub-issues"**.
   - El sidebar actualiza de inmediato los totales acumulados: contador consolidado de Runs, costo total acumulado en USD, indicador de estado global y gráfico de gasto de tokens.
2. **Ubicación en el Diálogo Detallado de Runs:**
   - Abrir el panel completo de ejecuciones (*Runs dialog* / *Execution log*).
   - El diálogo hereda automáticamente el estado seleccionado en el sidebar.
   - Junto al título del Issue se encuentra la casilla interactiva **"Include sub-issues"**, permitiendo alternar entre la vista atómica del Issue actual y la vista consolidada de todo el sub-árbol (*descendants at every depth*).
3. **Información disponible en la vista consolidada:**
   - **Total Runs:** Conteo total de corridas ejecutadas a lo largo de todos los sub-issues.
   - **Consolidated Timeline:** Secuencia cronológica integrada de inicio y finalización de cada agente en cada sub-issue.
   - **Cost & Token Breakdown:** Consumo total de tokens (input, output, razonamiento) y gasto total monetario.
   - **Owning Issue Badges:** Cada corrida está etiquetada explícitamente con su Sub-Issue correspondiente (`GOZS-457`, `GOZS-458`, etc.), su agente asignado (`@frontend-eng`, `@qa-eng`, `@pm-gozster`) y su estado final.

### 2.2. Extracción mediante Multica CLI y Endpoints

Para auditorías automatizadas o verificación directa en consola sin salir del entorno:

| Comando | Propósito | Salida / Flags clave |
|---|---|---|
| `& "$env:MULTICA_CLI_PATH" issue runs <id> --output json` | Historial de corridas del issue | Lista de ejecuciones directas con estado, duración y autoría. |
| `& "$env:MULTICA_CLI_PATH" issue runs <id> --active` | Corridas actualmente en vuelo | Filtra a tareas `queued`, `dispatched`, `running`. |
| `& "$env:MULTICA_CLI_PATH" issue runs <id> --siblings` | Inspección de familia y colisiones | Amplía la lectura al padre y hermanos para prevenir conflictos concurrentes en git o PRs. |
| `& "$env:MULTICA_CLI_PATH" issue children <parent-id> --output json` | Estado del árbol por Stages | Conteo de sub-issues completados vs pendientes en Stage 1, 2, etc. |

> **Nota de Arquitectura:** El sidebar y diálogo web consumen internamente `GET /api/issues/{id}/task-runs?scope=subtree`. A diferencia del endpoint por defecto (que solo devuelve el issue directo), `scope=subtree` agrega de forma recursiva todos los descendientes en cualquier profundidad jerárquica sin incluir ancestros ni ramas externas.

---

## 3. Checklist de Auditoría de Consumo para Agentes y PM

Antes de emitir el reporte de entrega o realizar la transición a `in_review`:

### Checklist del Agente (Desarrollador / Especialista):
- [ ] **Aislamiento de Scope:** El trabajo se limitó a los objetivos del Sub-Issue asignado sin refactorizaciones colaterales.
- [ ] **Anti-Token-Waste en Comentarios:** Se utilizó la secuencia *Scan-Then-Expand* (`--roots-only --summary --compact` seguido de `--thread <id> --tail 10`) sin lecturas bulk no acotadas.
- [ ] **Anti-Token-Waste en Archivos:** No se leyeron archivos protegidos (`package-lock.json`, `.env*`) ni archivos `> 300` líneas sin paginación quirúrgica (`StartLine`/`EndLine`).
- [ ] **Gate Local Completo:** Se ejecutó `npm test && npm run typecheck && npm run lint && npm run build` localmente y resultó exitoso.
- [ ] **Captura de Métricas:** Se verificaron las métricas de ejecución y consumo del Sub-Issue en el panel de Runs.

### Checklist del Auditor / PM (@PM-GOZster / @qa-eng):
- [ ] **Activación de "Include sub-issues":** Se visualizó el consolidado global en el panel de Runs de Multica.
- [ ] **Validación de Etapas (Stages):** Las dependencias entre Stage 1 y Stage 2 se respetaron sin saltos de barreras ni ejecuciones paralelas indebidas.
- [ ] **Eficiencia Presupuestaria:** La correlación entre costo de tokens y complejidad del cambio se mantiene dentro de los márgenes razonables.
- [ ] **Verificación de Cierre:** El Issue padre solo transiciona a `in_review` / `done` tras la aprobación formal de QA (`APPROVED`) y consolidación de métricas.

---

## 4. Plantilla Estándar de Reporte de Entrega

Todo agente al completar un ciclo de trabajo en un Sub-Issue o en el cierre del Issue padre debe incluir en su comentario final el siguiente bloque de reporte estructurado:

```markdown
### 📊 Reporte de Observabilidad y Consumo de Sub-Issues

| Métrica | Issue Actual (`<ISSUE-ID>`) | Consolidado Árbol (`scope=subtree`) |
|---|---|---|
| **Total Runs** | 1 corrida | X corridas |
| **Tiempo Total (Wall-clock)** | Xm Ys | Xm Ys |
| **Tokens Consumidos (In/Out)** | Xin / Xout | Total In / Total Out |
| **Costo Acumulado (USD)** | $X.XX | $X.XX |
| **Sub-Issues Involucrados** | `GOZS-XXX` | `GOZS-XXX` (Stage 1), `GOZS-YYY` (Stage 2) |

#### ⏱️ Timeline Resumido de Ejecución
1. **Stage 1 (`@agente-1`):** `GOZS-XXX` — [Completado / in_review] (X runs, $X.XX)
2. **Stage 2 (`@agente-2`):** `GOZS-YYY` — [Completado / in_review] (Y runs, $Y.XX)

#### 🛡️ Cumplimiento de Contratos
- **Harness & Ponytail:** Cero dependencias npm añadidas, cero scripts redundantes.
- **Gate Status:** Tests, linter, typecheck y build en verde.
```

---

## 5. Criterios de Aceptación (Gherkin)

```gherkin
Feature: Observabilidad de Runs y Consumo en Árboles de Sub-Issues
  Como PM o Ingeniero del Squad GOZSter
  Quiero auditar el consumo consolidado de tokens y ejecuciones mediante el panel de Runs de Multica
  Para garantizar la eficiencia presupuestaria y el cumplimiento estricto del Contrato Anti-Token-Waste

  Scenario: Auditoría consolidada de un feature con sub-issues en múltiples etapas
    Given un Issue padre con sub-issues distribuidos en Stage 1 y Stage 2
    When el PM o auditor activa la opción "Include sub-issues" en el panel de Runs o Sidebar
    Then la interfaz presenta el conteo agregado de runs de todos los sub-issues en cualquier profundidad
    And se visualiza el timeline cronológico consolidado con etiquetas por issue y agente
    And se calcula el costo acumulado y la curva de consumo de tokens del árbol completo

  Scenario: Validación de reporte final de entrega libre de bloatware
    Given la finalización de un ciclo de desarrollo en un Sub-Issue
    When el agente genera el comentario de entrega
    Then utiliza el formato estandarizado de métricas consolidadas
    And no se incorporan scripts externos ni dependencias pesadas en package.json (Regla Ponytail)
    And el gate de calidad ("npm test && npm run typecheck && npm run lint && npm run build") pasa limpiamente
```
