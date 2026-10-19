# ADR-002: Inmutabilidad del Historial de Entrenamiento y Sustitución Trazable por Molestias

- **Estado:** Aprobado (Definido en Grill Ronda 1 con Gabriel)
- **Fecha:** 2026-10-19
- **Prioridad:** P0 / P1 · Crítico / Alta

## Contexto y Problema

1. Actualmente `public.quick_swap_ejercicio` sobrescribe `ejercicios_en_rutina.ejercicio_id` perdiendo la referencia estructurada al ejercicio original.
2. En `public.alumno_historial_dolor` faltan el `momento_aparicion`, los indicadores de **Síntomas de Alarma (Red Flags)** y el ciclo de vida del caso (`PENDIENTE`, `ATENDIDO`, `CERRADO`).
3. No existe la biblioteca de alternativas clasificada ni la separación estricta de quién puede ejecutar el reemplazo.

## Decisiones Cerradas de Dominio

1. **El Alumno Reporta, el Entrenador Reemplaza:**
   - **El alumno NO puede elegir ni auto-asignarse un ejercicio alternativo.** El alumno únicamente presiona el botón visible **"Tengo una molestia"** (en la sesión o en el ejercicio) y reporta: zona corporal, intensidad percibida, momento de aparición, ejercicio asociado, checks de síntomas de alarma y comentario opcional.
   - El **entrenador** recibe la alerta, revisa la **Biblioteca de Alternativas** (clasificada por patrón, equipamiento, exigencia y restricciones, con su explicación técnica pero sin prometer seguridad clínica automática) y confirma con un toque el reemplazo para **toda la rutina vigente**.
2. **Registro Estructurado de Sustituciones (`public.sustituciones_ejercicios`):**
   - Cada reemplazo realizado por el entrenador guarda obligatoriamente: `ejercicio_en_rutina_id`, `ejercicio_original_id`, `ejercicio_sustituto_id`, `reporte_dolor_id`, `motivo`, `responsable_id` y `created_at`.
   - Las sesiones y series ya completadas (`registro_sesiones` y `registro_series`) permanecen 100% inmutables.
3. **Flujo de Seguridad ante Síntomas de Alarma (Red Flags):**
   - Si el alumno reporta dolor agudo/intenso o marca síntomas de alarma (dolor punzante súbito, irradiación/adormecimiento, mareo/falta de aire, inestabilidad articular), el sistema:
     - Dispara una **alerta `CRITICA`** inmediata al equipo entrenador.
     - Detiene cualquier recomendación automática.
     - Muestra al alumno la indicación clara de **frenar por hoy y avisar inmediatamente en el gimnasio o al entrenador cercano**.
