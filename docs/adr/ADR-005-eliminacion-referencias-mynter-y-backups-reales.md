# ADR-005: Purga Total de Referencias Visuales a "Mynter" y Respaldo Recuperable Verificado

- **Estado:** Aprobado (Definido en Grill Ronda 2 con Gabriel)
- **Fecha:** 2026-10-19
- **Prioridad:** P0 · Crítico (Bloqueante de lanzamiento)

## Contexto y Problema

En la auditoría del código fuente (`Fresias/gozster`) contra la `Guia_reunion_desarrollo_app_GOZS.docx` (Sección 7 y Sección 10) se detectó que:
1. Existen menciones visibles a **"Mynter"** en la interfaz de usuario:
   - `src/app/page.tsx:38` (`"Hevy & Mynter Protocol"`)
   - `src/components/athlete/live-workout.tsx:247` (`"{nombre} (Mynter)"`)
   - `src/components/coach/studio-shell.tsx:148` (`"Sincronización en vivo con Supabase & Mynter Backup activa."`)
   - `src/services/alumnos-service.ts:53,72` (mensajes de consola/aviso mencionando Mynter).
2. El texto `"Supabase & Mynter Backup activa"` en el footer de `studio-shell.tsx` era únicamente decorativo y no representaba un respaldo automatizado verificable.

## Decisiones Cerradas

1. **Cero Referencias a "Mynter" en Página y App:**
   - Eliminar toda mención a "Mynter" en textos de interfaz, etiquetas, selectores y logs de cliente (`src/app/page.tsx`, `src/components/athlete/live-workout.tsx`, `src/components/coach/studio-shell.tsx`, `src/services/alumnos-service.ts`), consolidando exclusivamente la marca institucional **GOZS**.
   - Reemplazar el indicador del footer en `src/components/coach/studio-shell.tsx` por el estado real de sincronización con **GOZS Cloud / Cola Offline**.
2. **Copia de Seguridad Automatizada y Prueba de Restauración Real:**
   - Implementar un script verificable de exportación y restauración idempotente de las entidades críticas de GOZS (`perfiles`, `contrataciones`, `pagos`, `planes_entrenamiento`, `dias_rutina`, `ejercicios_en_rutina`, `registro_sesiones`, `registro_series`, `conversaciones`, `mensajes`, `alumno_historial_dolor`, `sustituciones_ejercicios`) junto con su suite de test en Vitest que compruebe que un respaldo se genera e importa sin pérdida de integridad referencial.
