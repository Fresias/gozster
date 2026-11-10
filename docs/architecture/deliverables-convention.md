# Protocolo de Entregables Versionados y Enlaces Persistentes a Última Versión

- **Estado:** Vigente (GOZS-462 / GOZS-463)
- **Squad:** GOZSter (`Fresias/gozster`)
- **Plataforma:** Multica 0.8.2+
- **Filosofías Rectoras:** Karpathy (enfoque quirúrgico y determinista) & Ponytail (cero bloatware, soluciones nativas)

---

## 1. Visión y Justificación Técnica

A partir de la versión **0.8.2 de Multica**, la plataforma incorpora soporte para enlaces dinámicos persistentes a la última versión de un entregable:
> *"Copy a link to the latest version of a deliverable... When a file with the same name is uploaded again, the link opens the newest upload on web and desktop."*

### El Problema Previo (Fragmentación de Enlaces y Duplicados Huérfanos)
Históricamente, los agentes y colaboradores nombraban entregables incorporando fechas o versiones en el nombre de archivo (ej. `qa-audit-2026-10-29.md`, `specs-ui-v2.md`, `report-final-v3.md`). Esto provocaba:
1. **Ruptura de referencias en hilos e issues:** Enlaces en comentarios y descripciones apuntaban a versiones congeladas y desactualizadas.
2. **Duplicación huérfana de artefactos:** Pérdida de una única fuente de verdad para el estado de una funcionalidad o auditoría.
3. **Fricción cognitiva para el PM y Gabriel:** Dificultad para saber si el enlace compartido era el borrador inicial o el resultado auditado post-correcciones.

### La Solución
Adoptar una **convención de nombres estáticos canónicos** por rol y tipo de entregable. Al mantener el nombre invariante en cada re-subida, Multica resuelve automáticamente el enlace persistente a la versión más reciente en las interfaces web y de escritorio, preservando simultáneamente el histórico inmutable en la plataforma.

---

## 2. Matriz Estándar de Nomenclatura de Entregables por Rol

Todos los integrantes del Squad GOZSter deben utilizar estrictamente los siguientes nombres de archivo canónicos sin añadir timestamps, hashes, ramas ni sufijos numéricos:

| Rol Asignado | Nombre Canónico del Archivo | Propósito y Contenido Principal |
| :--- | :--- | :--- |
| **QA Engineer**<br>`@qa-eng` | `qa-audit-report.md` | Reporte integral de auditoría de calidad: resultados de vitest, playwright, invariantes de harness, análisis de regresión y veredicto formal (`APPROVED` / `CHANGES_REQUESTED`). |
| **QA Engineer**<br>`@qa-eng` | `qa-test-matrix.md` | Matriz de cobertura de pruebas por componente, flujo funcional y casos borde (edge cases). |
| **Frontend & Mobile UI**<br>`@frontend-eng` | `specs-ui-ux.md` | Especificación técnica de interfaz: diseño Mobile-First (PWA), vista bimodal (Coach Studio Desktop vs Athlete App), ergonomía táctil (botones ≥ 48px), tokens de Tailwind y Shadcn UI. |
| **Frontend & Mobile UI**<br>`@frontend-eng` | `ui-component-catalog.md` | Inventario estructurado de componentes UI, estados visuales (carga, vacío, offline, error) y accesibilidad WCAG. |
| **Backend Engineer**<br>`@backend-eng` | `api-contracts.md` | Definición de interfaces TypeScript, contratos de RPCs en Supabase, payloads de entrada/salida y manejo de errores. |
| **Backend Engineer**<br>`@backend-eng` | `database-diagram.md` | Diagrama relacional de base de datos (Mermaid ER), dependencias foráneas, orden topológico de tablas y políticas RLS activas. |
| **PM & Tech Lead**<br>`@pm-gozster` | `squad-roadmap.md` | Plan de etapas, dependencias multi-etapa (Stage 1..N), asignaciones de agentes y barreras de entrega. |
| **PM & Tech Lead**<br>`@pm-gozster` | `architecture-spec.md` | Especificación arquitectónica transversal, decisiones de diseño de alto nivel y vínculos a ADRs vigentes. |

---

## 3. Workflow Operativo de Subida y Actualización (`multica attachment upload` y `--attachment`)

El flujo de trabajo para emitir o actualizar entregables se ejecuta a través de los mecanismos oficiales de Multica:

### Modalidad A: Tareas de Chat (Chat Tasks) — `multica attachment upload`
En ejecuciones de tareas de chat, los entregables se suben directamente al canal:

```bash
multica attachment upload ./specs-ui-ux.md
```

- **Inyección Automática de Contexto:** El comando lee automáticamente la variable de entorno `MULTICA_TASK_ID` provista por el daemon, vinculando el archivo a la tarea en curso.
- **Salida de Confirmación:** Multica confirma la subida y genera el snippet en formato Markdown (`!file[specs-ui-ux.md](url)` o `[specs-ui-ux.md](url)`).
- **Enlace Persistente (Multica 0.8.2):** Al re-subir con el mismo nombre canónico en iteraciones posteriores, el enlace se actualiza dinámicamente a la versión más reciente en web y desktop.

### Modalidad B: Tareas de Issue / Hilos de Discusión — `--attachment` en Comentarios
En ejecuciones asignadas a issues o PRs (donde la entrega se realiza mediante comentarios oficiales):

```bash
multica issue comment add <issue-id> \
  --parent <parent-comment-id> \
  --content-file ./reply.md \
  --attachment ./docs/architecture/deliverables-convention.md \
  --output table
```

- **Persistencia en el Repositorio:** El documento canónico reside bajo control de versiones (`docs/` en Git) y se adjunta formalmente al comentario del issue para revisión directa.
- **Preservación de Nombres:** Tanto en chat como en issues, el archivo conserva su nombre canónico sin sufijos numéricos ni fechas para asegurar trazabilidad uniforme.

### Paso a Paso para Iteraciones y Rondas de Revisión
Cuando se produce una ronda de cambios (ej. Ronda de QA o ajustes solicitados por `@pm-gozster`):
1. El especialista modifica el entregable manteniendo exactamente el nombre canónico (`specs-ui-ux.md`, `qa-audit-report.md`, etc.).
2. En tareas de chat: ejecuta nuevamente `multica attachment upload <archivo>`. En tareas de issue: comitea los cambios a la rama de feature y referencia/adjunta la versión actualizada en su respuesta al issue.
3. Multica garantiza la resolución dinámica del enlace permanente a la versión más reciente, preservando el histórico pero asegurando que cualquier clic en el enlace ("Copy link to latest version") abra de forma inmediata la versión fresca.
4. Los archivos de staging temporales en el directorio de trabajo se eliminan de forma segura una vez completada la subida.

---

## 4. Alineación con las Filosofías Ponytail & Karpathy

1. **Regla Ponytail (Cero Bloatware):**
   - Prohibido instalar paquetes NPM para procesar, compilar o alojar entregables (como generadores de sitios estáticos, utilidades de upload externas o dependencias de almacenamiento).
   - El protocolo utiliza formatos nativos de texto (`.md`) y el comando nativo `multica attachment upload`.
2. **Filosofía Karpathy (Cambios Quirúrgicos & Deterministas):**
   - Cada entregable canónico documenta exclusivamente su dominio sin divagaciones ni redundancias.
   - Nombres fijos y predecibles evitan cambios colaterales en la estructura de documentación y código.
3. **Preservación de Git & Harness:**
   - Los documentos arquitectónicos de referencia persistente se versionan en `docs/` dentro del repositorio Git.
   - Las cargas en Multica sirven como entregables adjuntos de revisión interactiva en la interfaz web/desktop sin ensuciar el árbol Git con binarios o artefactos volátiles.

---

## 5. Criterios de Aceptación (Gherkin)

```gherkin
Feature: Protocolo de Entregables Versionados y Enlaces Persistentes

  Scenario: Subida inicial de un entregable canónico
    Given que un agente genera un entregable formal para revisión
    When ejecuta "multica attachment upload <nombre-canonico>.md"
    Then el archivo queda adjunto a la tarea actual
    And la plataforma habilita un enlace persistente a la última versión

  Scenario: Actualización recurrente sin romper enlaces
    Given que un entregable canónico ya fue subido previamente
    When el agente sube una nueva versión conservando exactamente el mismo nombre de archivo
    Then el enlace persistente en Multica web y desktop resuelve dinámicamente a la subida más reciente
    And no se generan referencias huérfanas ni enlaces rotos en los comentarios previos

  Scenario: Verificación de calidad del repositorio
    Given los cambios documentales y de código en el repositorio
    When se ejecutan los scripts de verificación
    Then "npm run typecheck && npm run lint" finalizan con código de salida 0
```
