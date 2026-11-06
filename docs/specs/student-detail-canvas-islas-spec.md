# Especificación de Arquitectura: Canvas Modular de Islas Arrastrables y Colapsables
## Vista Detallada del Alumno (Coach Studio) - Issue #355

> **Destinatario Técnico:** `@frontend-eng`, `@qa-eng`  
> **Aprobado por:** Gabriel (Tech Lead & Product Manager), `@UI/UX & Art Director`, `@PM-GOZster`  
> **Filosofías Rectoras:** Metodología Karpathy (quirúrgica, desacoplada) y Regla Ponytail (cero bloatware)  
> **Rama de Trabajo:** `feature/student-detail-canvas-islas`  

---

## 1. Justificación y Propósito
Reestructuración completa de `src/components/coach/student-detail.tsx` para eliminar la saturación por scroll vertical continuo (11 tarjetas apiladas). La nueva vista transforma la experiencia en un **Canvas Modular de Islas Autónomas y Colapsables** con soporte para reordenamiento (*drag & drop*) y persistencia local.

---

## 2. Anatomía de las Islas Biomecánicas
Cada componente principal se desacopla en una "Isla" autónoma (`src/components/coach/student-detail/islas/`):

1. **`IslaTimelineRibbon` (Upper Horizontal Ribbon):**
   - Franja horizontal de 80px que conecta las sesiones registradas del alumno.
   - Nodos cronológicos con fecha, volumen en kg, duración y badge de PR.
   - Botón de colapso a línea única (`[^]`).

2. **`IslaActivityFeed` (Bitácora Omnicanal estilo Verve CRM):**
   - Feed vertical clasificado por fechas (`HOY`, `AYER`, etc.).
   - Iconos circulares por tipo de evento (cobros, sesiones, molestias articulares, sustituciones ADR-002, comentarios).
   - Acordeones colapsables por fecha y botón de repliegue a riel lateral de 56px (`[◀ Colapsar Feed]`).

3. **`IslaRoutineWorkbench` (Matriz de Entrenamiento Activa):**
   - Matriz del día actual con micro-tablas de series x reps x cargas x descansos.
   - Acordeones independientes por día y por ejercicio.
   - Conector visual de superseries y botón de sustitución rápida (*Quick Swap*).

4. **`IslaMetricas1RM` (Telemetría de Fuerza & Sobrecarga):**
   - Récords de 1RM Brzycki/Epley y sparkline de tonelaje mensual.
   - Evolución de peso corporal.

5. **`IslaSaludAnamnesis` (Clínica y Red Flags):**
   - Alertas de dolor articular activas con escala EVA (1-10) y acceso directo a sustitución quirúrgica.
   - Resumen colapsable de anamnesis inicial.

---

## 3. Modo Canvas: Personalización y Drag & Drop
- **Controles por Isla:** Cada cabezal cuenta con un Drag Handle punteado (`⠿`), botón de colapso `[-]` y menú `•••`.
- **Modo Edición:** Al pulsar `[⠿ Modo Canvas]`, el usuario puede arrastrar y reubicar las islas en la grilla visual.
- **Persistencia:** La posición y estado (expandido/colapsado) se guarda en `localStorage` bajo la clave `gozster_canvas_layout_${coachId}`.

---

## 4. Despliegue y Validación Online
- Cada cambio en esta rama genera un Preview Deployment aislado en Vercel.
- Prohibido hacer merge a `main` hasta contar con la aprobación interactiva de Gabriel y el `APPROVED` de `@qa-eng`.
