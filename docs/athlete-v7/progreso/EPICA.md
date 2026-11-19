# Épica Athlete v7 · estado

> Lo mantiene `@PM-GOZster` (`07-checkpoints.md §4`). Cada issue tiene además su `progreso/<ID>.md` en su propia rama.
> **Para retomar la orquestación:** leer esta tabla y, para cada rama abierta, `git show origin/<rama>:docs/athlete-v7/progreso/<ID>.md`.

- **Última actualización:** 2026-11-18 por `@PM-GOZster`
- **Épica Multica:** GOZS-573
- **Decisiones:** D3 cerrada → A (`00-PM.md §4`). No quedan decisiones abiertas.
- **Conteo en producción (2026-11-18):** `registro_series` últimos 30 días = **0**. No es concluyente: solo hay 2 usuarios de prueba y nadie entrenó en ese período. BE-00 sigue como P0 por el análisis de código.
- **Issues:** creados los 20 (GOZS-574 a GOZS-593), en `backlog`, con stage = ola + 1.
- **Bloqueo actual:** los issues pasan a `todo` cuando el paquete llegue a `main` (PR #515).

| ID | Owner | Issue | Rama | Estado | Último CP | PR | Notas |
|---|---|---|---|---|---|---|---|
| BE-00 | backend | GOZS-574 | `fix/574-athlete-sesion-uuid` | backlog | CP1 (conteo = 0, no concluyente) | — | P0 |
| BE-01 | backend | GOZS-575 | `feature/575-athlete-v7-nombre-preferido` | backlog | — | — | |
| BE-02 | backend | GOZS-576 | `feature/576-athlete-v7-molestias` | backlog | — | — | Depende de BE-00 |
| BE-03 | backend | GOZS-577 | `feature/577-athlete-v7-video-serie` | backlog | — | — | Depende de BE-00 |
| BE-04 | backend | GOZS-578 | `feature/578-athlete-v7-indicaciones` | backlog | — | — | |
| FE-01 | frontend | GOZS-579 | `feature/579-athlete-v7-base` | backlog | — | — | |
| QA-01 | qa | GOZS-580 | `feature/580-athlete-v7-fidelidad` | backlog | — | — | |
| FE-02 | frontend | GOZS-581 | `feature/581-athlete-v7-shell` | backlog | — | — | |
| FE-03 | frontend | GOZS-582 | `feature/582-athlete-v7-inicio` | backlog | — | — | |
| FE-04 | frontend | GOZS-583 | `feature/583-athlete-v7-rutina` | backlog | — | — | |
| FE-05 | frontend | GOZS-584 | `feature/584-athlete-v7-ejercicio` | backlog | — | — | D3 = A |
| FE-06 | frontend | GOZS-585 | `feature/585-athlete-v7-record` | backlog | — | — | |
| FE-07 | frontend | GOZS-586 | `feature/586-athlete-v7-hojas` | backlog | — | — | |
| FE-08 | frontend | GOZS-587 | `feature/587-athlete-v7-molestias-ui` | backlog | — | — | |
| FE-09 | frontend | GOZS-588 | `feature/588-athlete-v7-historial-progreso` | backlog | — | — | |
| FE-10 | frontend | GOZS-589 | `feature/589-athlete-v7-clases-chat` | backlog | — | — | |
| FE-11 | frontend | GOZS-590 | `feature/590-athlete-v7-onboarding-cierre` | backlog | — | — | |
| FE-12 | frontend | GOZS-591 | `feature/591-athlete-v7-fondo` | backlog | — | — | |
| QA-02 | qa | GOZS-592 | `feature/592-athlete-v7-e2e` | backlog | — | — | |
| QA-03 | qa | GOZS-593 | `feature/593-athlete-v7-a11y-alcance` | backlog | — | — | |
