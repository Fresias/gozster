---
name: gozster-domain
description: Mapa de las fuentes de verdad del dominio GOZSter (entrenamiento, contratación, chat, molestias). Indica dónde leer; no duplica reglas.
autotrigger: a task touches training domain terms (planes, días de rutina, ejercicios en rutina, superseries, sesiones, series, 1RM, RPE) or business rules
---

# gozster-domain

Esta skill no copia reglas: apunta a dónde viven. Si una regla no está en estas fuentes, pregunta a @PM-GOZster antes de inventarla.

## Fuentes de verdad

| Tema | Dónde leer |
| :--- | :--- |
| Lenguaje ubicuo (términos, tablas, reglas cerradas) | `docs/GLOSSARY.md` |
| Cuenta vs. contratación vs. pago vs. rutina | `docs/adr/ADR-001-*.md` (GLOSSARY §1) |
| Historial inmutable y sustitución trazable por molestias | `docs/adr/ADR-002-*.md` (GLOSSARY §4) |
| Presencial vs. online, gamificación | `docs/adr/ADR-003-*.md` |
| Onboarding, vista `SIMPLE`/`TECNICA` (RPE, %1RM), chat GOZS | `docs/adr/ADR-004-*.md` (GLOSSARY §2–3) |
| Marca limpia y respaldo verificado | `docs/adr/ADR-005-*.md` (GLOSSARY §5) |
| Planes, días, ejercicios en rutina (superseries), sesiones y series | `supabase/migrations/` (esquema + RLS) y `types/database.types.ts` |

## Cómo usarla

1. Busca el término en `docs/GLOSSARY.md` con `rg -n` y lee solo esa fila.
2. Si la fila cita un ADR, lee solo su sección de **Decisiones** (`rg -n "^## " docs/adr/`).
3. Para columnas y políticas, `rg -n <tabla> supabase/migrations/` y lee el bloque acotado.
4. Ante conflicto entre fuentes manda el ADR; repórtalo a @PM-GOZster.
