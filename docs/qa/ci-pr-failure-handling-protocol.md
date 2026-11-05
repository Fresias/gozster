# Protocolo de Manejo Autónomo de Fallos de CI y PR Checks (GOZSter)

Este documento define el estándar operativo de **GOZSter** (`Fresias/gozster`) para el monitoreo y resolución de fallos de integración continua utilizando el **Wakeup nativo de Multica (`--until-pr checks`)**.

---

## 1. Visión y Objetivo

El objetivo principal es lograr **autonomía resolutiva de nivel senior**:
1. Ningún miembro del equipo humano (Gabriel) necesita esperar, monitorear GitHub Actions ni avisar al agente cuando un CI falla.
2. Cero consumo innecesario de tokens: los agentes no ejecutan loops activos de espera (`sleep` o polls continuos). El agente finaliza su turno y el webhook de GitHub despierta automáticamente el siguiente run.
3. Blindaje contra bucles infinitos: circuito disyuntor de 3 intentos máximo.
4. Integridad total de tests: prohibido relajar aserciones para forzar builds verdes (*claim-check*).

---

## 2. Los 5 Arquetipos de Fallos en GOZSter

A partir del historial del repositorio (`Fresias/gozster`), los fallos de CI corresponden estrictamente a 5 causas deterministas:

| Arquetipo | Causa Raíz Detectada | Comando de Diagnóstico | Solución Quirúrgica (Karpathy) |
| :--- | :--- | :--- | :--- |
| **A. Integridad DB & Orden Topológico** | Claves foráneas no reflejadas en `TABLAS`, o dependencias padre/hijo desordenadas en `scripts/backup-restore-gozs.mjs`. | `node -e "import('./scripts/backup-restore-gozs.mjs')..."` | Asegurar que toda tabla referida preceda a la que la referencia en el array `TABLAS`. |
| **B. Tipado TS & Sintaxis JSX** | Sintaxis JSX rota (ej. comentarios `{/* */}` dentro de props de componentes), métodos no declarados en Zustand stores (`resetDemoDataset`). | `npx tsc --noEmit` | Corregir sintaxis JSX y tipar explícitamente en la interfaz de la tienda sin usar `any`. |
| **C. Desincronización SSR vs Cliente** | Aserciones que esperan render de cliente y fallan por comentarios SSR de React (`<!-- -->`), o estados viejos en `localStorage` con Zustand persist. | `npx vitest run <spec>` | Usar regex multientorno para normalizar strings HTML y definir `version` / `migrate` en stores persistidos. |
| **D. Drift en Harness de Configuración** | Modificaciones directas en archivos generados o exceso de presupuesto de `AGENTS.md` (> 8.000 chars / > 150 líneas). | `node harness-kit/core/scripts/harness-render.mjs --check` | Editar únicamente en `harness/` y re-compilar con `harness-render.mjs`. |
| **E. Violaciones de Regla Ponytail & Lint** | Uso de dependencias externas no autorizadas (ej. `lucide-react`) o variables muertas. | `npm run lint` | Reemplazar con SVGs inline puros y podar dependencias no autorizadas. |

---

## 3. Disyuntor (Circuit Breaker) & Casos Borde

### A. Límite de 3 Intentos (Anti-Token-Drain)
- Máximo **3 intentos de auto-reparación** por PR.
- Cada intento se identifica con commits convencionales tipo `fix(ci): <descripción>`.
- Si tras el 3er intento el CI continúa en rojo:
  1. Desarmar el wakeup de Multica (`multica issue wakeup disable <issue-id> <wakeup-id>`).
  2. Mover el Issue a estado `blocked`.
  3. Emitir un informe de autopsia ejecutivo mencionando al owner humano (`@Gabriel`).

### B. Fallas de Infraestructura o Red Externa
- Si el fallo reportado en `gh run view --log-failed` es `ETIMEDOUT`, `ENOTFOUND` o cancelación por runner de Azure sin errores en `tsc` ni `vitest`:
- **Acción:** No alterar código. Disparar `gh run rerun <run_id> --failed-only` y re-armar el wakeup.

### C. Conflicto de Merge Concurrente
- Si otro PR ingresó a `main` antes de que este finalice:
- **Acción:** `git fetch origin main && git merge origin/main --no-edit`, resolver conflictos de imports, correr el test localmente y pushear.

---

## 4. Comando de Registro Estándar

Al crear un PR, el agente o PM debe ejecutar inmediatamente:

```bash
multica issue wakeup create <issue-id> \
  --until-pr checks \
  --expires-in 2h \
  --on-timeout wake \
  --instruction "1. Verificar resultado con 'gh pr view --json statusCheckRollup'.
2. Si está en verde (SUCCESS): Validar diff con Karpathy/Ponytail, hacer merge squash a main, ejecutar 'harness-kit/core/scripts/harness-learn.sh --issue <issue-id> --lesson "<título>"', comitear/pushear la lección a main, cerrar el issue y emitir reporte ejecutivo.
3. Si falló (FAILURE):
   a. Extraer error con 'gh run view --log-failed'.
   b. Si intentos de fix >= 3: marcar issue 'blocked', desarmar wakeup y reportar autopsia al usuario.
   c. Si es error de infraestructura/red: ejecutar 'gh run rerun --failed-only'.
   d. Si es código/DB: aplicar fix quirúrgico, validar localmente, pushear y re-armar wakeup."
```
