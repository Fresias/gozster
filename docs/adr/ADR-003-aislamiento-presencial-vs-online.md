# ADR-003: Aislamiento entre Asesoría Online y Módulo Presencial + Gamificación Mínima (Sprint 2)

- **Estado:** Aprobado (Diferido a Alcance Mínimo en Próximo Sprint por decisión de negocio)
- **Fecha:** 2026-10-19
- **Prioridad:** P2 / P3 · Próximo Sprint (Fases 5 y 6)

## Contexto y Decisión de Alcance

Durante la Ronda 2 del Grill con Gabriel se definió que:
1. **El Sprint Actual (Fases 1 a 4 — P0 y P1)** se concentra al 100% en:
   - Separación de Cuenta, Contratación, Pago e Historial inmutable (`ADR-001`).
   - Limpieza total de referencias visuales a "Mynter" y sistema real de Backup/Restauración (`ADR-005`).
   - Onboarding inmediato con solapa opcional de Cuestionario Inicial y Vista Minimalista (`SIMPLE`) vs. Técnica (`TECNICA`) (`ADR-004`).
   - Chat compartido 100% bajo identidad de equipo **"GOZS"** (sin firmas individuales al alumno, con transferencia de responsable y RLS automático) (`ADR-004`).
   - Reporte de molestias con alerta `CRITICA` ante síntomas de alarma y sustitución de ejercicios exclusiva por el entrenador para toda la rutina vigente (`ADR-002`).
2. **El Próximo Sprint (Fases 5 y 6 — P2 y P3)** abordará con **alcance mínimo (MVP Ponytail/Karpathy)**:
   - **Módulo Presencial (Funcional y Boxeo):** Cuenta única del alumno con contratación presencial independiente (`ASESORIA_ONLINE` ya preparada en `public.contrataciones` desde Fase 1 para no rehacer tablas), agenda básica de clases con capacidad máxima, reserva transaccional sin sobreventa (`SELECT ... FOR UPDATE`), lista de espera FIFO y check de asistencia móvil para el entrenador.
   - **Gamificación Mínima:** Racha individual por cumplimiento del plan semanal (sin romper por días de descanso programados) y registro de PRs por ejercicio con historial auditable (sin ranking global competitivo).

## Enmienda 2026-11-25 — Ranking Funcional relativo con privacidad estricta (GOZS-829)

Decisión de negocio de Gabriel: el ranking global competitivo sigue excluido, pero Funcional tiene un ranking **relativo** (marca / peso corporal) **por categoría `M`/`F`**, sin romper el aislamiento presencial vs. online (ADR-001: solo alumnos con actividad `FUNCIONAL` o con marcas propias lo consultan; el staff siempre).

- **Persistencia:** `public.marcas_funcional` (RLS: el alumno lee lo suyo; solo staff escribe).
- **Contrato `obtener_ranking_funcional(p_ejercicio_id, p_clase_id)`** (`SECURITY DEFINER`): devuelve únicamente `posicion`, `nombre_corto` (`Lucas G.`), `categoria`, `peso_kg`, `reps`, `ratio`, `fecha`, `es_usuario_actual`.
- **Prohibido exponer** de otros alumnos: `peso_corporal_kg`, `email`, `telefono`, `nombre_completo`, `alumno_id`. Alumnos sin peso corporal o sin sexo quedan fuera del ranking.
- `anon` y alumnos sin Funcional ni marcas reciben `42501`.
