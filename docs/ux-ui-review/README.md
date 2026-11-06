# Handoff UX/UI — Coach Studio GOZSter

> **Para:** `@PM-GOZster` (dueño del handoff) → reparte a `@backend-eng`, `@frontend-eng`, `@qa-eng`
> **Origen:** review UX/UI de la rama `feature/student-detail-canvas-islas` (5 nov 2026), con la app levantada contra `tests/e2e/supabase-stub.mjs` y el dataset demo.
> **Alcance:** Coach Studio completo (shell, Inicio, directorio, ficha de islas, cobros, agenda, rutinas, ranking) + Inicio móvil. La Athlete App queda fuera salvo un bug bloqueante.

## Cómo usar este paquete en Multica

1. El PM lee **`00-PM.md`** y toma las 5 decisiones de la sección 3 (D1–D5) antes de abrir issues.
2. El PM crea los issues desde **`06-issues.md`**: cada bloque ya tiene título, owner, rama, dependencias, alcance de archivos y criterios GIVEN/WHEN/THEN. Pegar con `--description-file`.
3. Cada agente recibe en su issue el link a su documento de rol más los documentos compartidos:

| Agente | Lee primero | Además |
|---|---|---|
| `@backend-eng` | `03-backend.md` | `02-vistas.md` (secciones que consume), `06-issues.md` (BE-*) |
| `@frontend-eng` | `04-frontend.md` | `01-sistema-visual.md`, `02-vistas.md`, `06-issues.md` (FE-*) |
| `@qa-eng` | `05-qa.md` | `02-vistas.md` (criterios por vista), `06-issues.md` (todos) |

4. Recomendado: guardar `01-sistema-visual.md` como **skill** de Multica ("gozster-ui") y adjuntarla a frontend y QA, para no repetirla en cada issue.

## Índice

| Archivo | Contenido |
|---|---|
| `00-PM.md` | Diagnóstico, decisiones pendientes, fases, mapa de issues, riesgos, definición de terminado |
| `01-sistema-visual.md` | Tokens (diff contra `globals.css`), tipografía, radios, sombras, componentes con props/variantes/estados, iconos, glosario de copy |
| `02-vistas.md` | Cada vista: layout, regiones, componentes, datos, estados (carga/vacío/error), interacciones, copy exacto, responsive, accesibilidad |
| `03-backend.md` | Fuente única de KPIs, modelo unificado de dolor/alertas, progresión, persistencia del layout, contratos de datos |
| `04-frontend.md` | Plan de implementación archivo por archivo, inventario actual → nuevo, orden, tests a actualizar |
| `05-qa.md` | Plan de pruebas: coherencia cruzada, e2e por vista, accesibilidad, regresión visual por viewport |
| `06-issues.md` | Issues listos para pegar en Multica |
| `09-pm-preguntas.md` | **Siguiente paso.** Tarea para el PM: consultar a los agentes y devolver las preguntas abiertas en `09-respuesta-pm.md` antes de implementar FIX-V* |
| `08-fidelidad-visual.md` | **Prioridad actual.** Por qué no se parece al canvas, tokens zinc (D1 = B), reglas visuales globales, checklist por vista, diagnóstico de "vista del alumno" y 10 issues (FIX-V1 a FIX-V10) |
| `objetivo/html/`, `objetivo/png/` | Cada pantalla del canvas como HTML estático inspeccionable y PNG 2x: es la referencia visual que los agentes sí pueden abrir |
| `comparar/` | Objetivo vs. implementado, lado a lado, por vista |
| `07-revision-implementacion.md` | Revisión de lo implementado en `main` (6 nov): estado por issue, hallazgos P0–P2 con archivo y línea, y 9 issues de corrección (FIX-01 a FIX-09) |
| `assets/antes/` | Capturas del estado actual (1440 px y 390 px) |

## Referencia visual

El canvas de Claude Design "GOZSter — Review UX/UI" tiene las 8 pantallas recreadas e interactivas. El PDF exportado de ese canvas es la referencia visual oficial de este handoff; **toda medida, color, copy e interacción que muestra está escrita en estos documentos**, así que un agente no necesita abrir el canvas.

Diferencia deliberada entre el PDF y este handoff: el PDF usa la paleta neutra de shadcn (zinc, primario casi negro). Este handoff recomienda conservar la paleta de marca de `docs/MARCA.md` (slate + Azul Atlántico) y aplicar las **reglas estructurales** de shadcn. Ver decisión D1 en `00-PM.md`.
