# Auditoría de Regresión E2E y Evidencia Visual Multi-Viewport (GOZS-388)

**Fecha:** 2026-11-06  
**Referencia:** `05-qa.md §3`  
**Responsable:** @qa-eng  
**Suite:** `tests/e2e/regresion-visual-viewports.e2e.ts`  
**Proyectos Playwright:** `desktop` (1440x900), `desktop-1366` (1366x768), `tablet` (768x1024), `mobile` (390x844)  

---

## 1. Resumen Ejecutivo de Regresión

Se ejecutó la suite de regresión visual y funcional en los 4 viewports de Coach Studio cubriendo las 8 vistas críticas del rediseño integral UX/UI:
1. **Shell (UX-S):** Navegación general, Topbar con título y acciones, Sidebar colapsable en desktop y Barra Inferior ergonómica de 5 accesos táctiles en mobile/tablet.
2. **Inicio (UX-I):** Dashboard con 4 KPIs de negocio, bloques centrales "Para revisar hoy" (EVA/Dolor) y "Clases de hoy", con selector de período.
3. **Directorio (UX-D):** Directorio de alumnos abierto por defecto con DataTable de 15 filas y paginación.
4. **Ficha (UX-F):** Ficha de alumno con cabecera limpia, menú `⋯` de acciones e islas modulares de Salud (EVA 0–10), Rutina y 1RM (Epley/Brzycki).
5. **Cobros (UX-C):** Panel de cobros con KPIs monetarios superiores y DataTable en formato es-AR (`$xxx.xxx`).
6. **Agenda (UX-A):** Grilla horaria dinámica según clases activas y tarjetas de bloques de clases con cupos.
7. **Rutinas (UX-R):** Biblioteca de rutinas con apertura por defecto en la pestaña "De Alumnos" y tabs accesibles.
8. **Ranking (UX-K):** Ranking funcional con fila unificada de guardado, selector de ejercicio y chips neutros.

### Criterios de Calidad Auditados:
- **Ausencia de Scroll Horizontal:** `scrollWidth - innerWidth === 0` verificado programáticamente en cada renderizado.
- **Ausencia de Excepciones de Consola:** 0 errores de JavaScript en consola en todo el ciclo de navegación.
- **Ausencia de Texto de Desarrollo:** Sin `NaN`, `Infinity`, `undefined` ni `[object Object]` en pantalla.
- **Tasa de Éxito:** 100% (32 de 32 escenarios PASS).

---

## 2. Matriz de Resultados por Viewport y Escenario

| ID | Escenario | Proyecto | Viewport | Estado | Desborde (px) | Errores Consola | Evidencia |
| :--- | :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| **UX-S** | Shell Navegación | desktop | 1440x900 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop/UX-S.png` |
| **UX-I** | Inicio Dashboard | desktop | 1440x900 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop/UX-I.png` |
| **UX-D** | Directorio Alumnos | desktop | 1440x900 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop/UX-D.png` |
| **UX-F** | Ficha de Alumno | desktop | 1440x900 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop/UX-F.png` |
| **UX-C** | Vista de Cobros | desktop | 1440x900 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop/UX-C.png` |
| **UX-A** | Vista de Agenda | desktop | 1440x900 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop/UX-A.png` |
| **UX-R** | Biblioteca Rutinas | desktop | 1440x900 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop/UX-R.png` |
| **UX-K** | Ranking Funcional | desktop | 1440x900 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop/UX-K.png` |
| **UX-S** | Shell Navegación | desktop-1366 | 1366x768 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop-1366/UX-S.png` |
| **UX-I** | Inicio Dashboard | desktop-1366 | 1366x768 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop-1366/UX-I.png` |
| **UX-D** | Directorio Alumnos | desktop-1366 | 1366x768 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop-1366/UX-D.png` |
| **UX-F** | Ficha de Alumno | desktop-1366 | 1366x768 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop-1366/UX-F.png` |
| **UX-C** | Vista de Cobros | desktop-1366 | 1366x768 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop-1366/UX-C.png` |
| **UX-A** | Vista de Agenda | desktop-1366 | 1366x768 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop-1366/UX-A.png` |
| **UX-R** | Biblioteca Rutinas | desktop-1366 | 1366x768 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop-1366/UX-R.png` |
| **UX-K** | Ranking Funcional | desktop-1366 | 1366x768 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/desktop-1366/UX-K.png` |
| **UX-S** | Shell Navegación | tablet | 768x1024 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/tablet/UX-S.png` |
| **UX-I** | Inicio Dashboard | tablet | 768x1024 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/tablet/UX-I.png` |
| **UX-D** | Directorio Alumnos | tablet | 768x1024 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/tablet/UX-D.png` |
| **UX-F** | Ficha de Alumno | tablet | 768x1024 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/tablet/UX-F.png` |
| **UX-C** | Vista de Cobros | tablet | 768x1024 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/tablet/UX-C.png` |
| **UX-A** | Vista de Agenda | tablet | 768x1024 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/tablet/UX-A.png` |
| **UX-R** | Biblioteca Rutinas | tablet | 768x1024 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/tablet/UX-R.png` |
| **UX-K** | Ranking Funcional | tablet | 768x1024 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/tablet/UX-K.png` |
| **UX-S** | Shell Navegación | mobile | 390x844 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/mobile/UX-S.png` |
| **UX-I** | Inicio Dashboard | mobile | 390x844 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/mobile/UX-I.png` |
| **UX-D** | Directorio Alumnos | mobile | 390x844 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/mobile/UX-D.png` |
| **UX-F** | Ficha de Alumno | mobile | 390x844 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/mobile/UX-F.png` |
| **UX-C** | Vista de Cobros | mobile | 390x844 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/mobile/UX-C.png` |
| **UX-A** | Vista de Agenda | mobile | 390x844 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/mobile/UX-A.png` |
| **UX-R** | Biblioteca Rutinas | mobile | 390x844 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/mobile/UX-R.png` |
| **UX-K** | Ranking Funcional | mobile | 390x844 | **PASS** | 0 | 0 | `docs/qa/demo-evidencia/mobile/UX-K.png` |

---

## 3. Veredicto Final de Auditoría

- **Estado de la Suite:** `100% PASS` (32/32 tests en verde).
- **Consola:** 0 errores críticos / excepciones en los 4 proyectos.
- **Desborde:** 0px de desborde horizontal en todas las resoluciones.
- **Evidencia Visual:** Todas las capturas generadas y verificadas en disco en `docs/qa/demo-evidencia/<proyecto>/UX-*.png`.
