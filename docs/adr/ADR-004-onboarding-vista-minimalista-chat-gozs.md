# ADR-004: Onboarding No Bloqueante, Vista Minimalista vs. Técnica e Identidad Institucional GOZS en Chat

- **Estado:** Aprobado (Definido en Grill Ronda 1 con Gabriel)
- **Fecha:** 2026-10-19
- **Prioridad:** P1 · Alta

## Contexto y Decisiones Cerradas

### 1. Alta Inmediata y Solapa de Cuestionario Inicial (Opcional / Única Vez)
- El alumno ingresa a la aplicación con **acceso inmediato** a su rutina tras crear/activar su cuenta, sin formularios de bloqueo previo.
- Existe una **solapa/sección de Cuestionario Inicial** (para completar por única vez, con preguntas genéricas de demo que el entrenador podrá pedir) que el alumno **puede o no completar** sin que le impida entrenar.

### 2. Nivel de Vista del Alumno: Minimalista (`SIMPLE`) vs. Avanzada (`TECNICA`)
- Se incorpora un flag configurable por el entrenador (`nivel_vista_alumno` en `public.perfiles` o `public.planes_entrenamiento`, con valor por defecto `SIMPLE`).
- **Vista Minimalista (`SIMPLE`):** Muestra únicamente lo esencial para entrenar sin fricción: **Series × Reps × Peso + Video demostrativo + Cronómetro de descanso**. Oculta RPE, %1RM, fórmulas de Epley/Brzycki y métricas de tonelaje.
- **Vista Técnica (`TECNICA`):** Expone las métricas avanzadas (RPE objetivo/real, estimación de 1RM, historial detallado de cargas) para atletas avanzados y para el Coach Studio.

### 3. Chat Compartido bajo Identidad 100% Equipo GOZS ("Somos un equipo")
- **Hacia el alumno:** Todos los mensajes enviados por cualquier profesor o administrador se muestran únicamente bajo la identidad institucional **"GOZS"** (sin firma individual del profesor en la vista del alumno).
- **Hacia adentro (Coach Studio y Base de Datos):**
  - Se guarda siempre el `remitente_id` real en `public.mensajes` y la autoría de cambios de rutina en auditoría (`quién hizo qué y cuándo`).
  - Las conversaciones permiten **asignar y transferir un profesor responsable** (`responsable_id` en `public.conversaciones`).
  - Al transferir una conversación a otro profesor, se asegura su vínculo en `public.entrenador_alumnos` para que las políticas RLS le den acceso completo al contexto del alumno (chat + rutina + historial).
