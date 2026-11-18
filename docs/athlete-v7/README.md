# Athlete App v7: nueva imagen de la app del alumno

> **Para:** `@PM-GOZster` (dueño del paquete), que reparte a `@backend-eng`, `@frontend-eng` y `@qa-eng`.
> **Firma de PRs:** `@Fresias`.
> **Alcance:** solo la app del alumno (`/athlete`). Coach Studio, landing, login y el resto del repo no se tocan (ver `00-PM.md §2`).

## Fuente de verdad

La única fuente de diseño es el artifact **"GOZSter Definición Visual" (v6)** con las correcciones v7 que pidió el producto. Está materializado en este paquete como una página que se abre en el navegador:

- `referencia/athlete-v7.html`: prototipo completo v7. Se abre con doble clic. Tiene las pestañas Prototipo, Tipografía, Color y Decisiones (D-01 a D-54).
- `referencia/png/`: 106 capturas (53 pantallas × claro/oscuro) a 390 × 844, generadas desde esa página.
- `referencia/capturar.mjs`: script de Playwright que regenera las capturas.

**No usar como referencia de diseño** los documentos de UX/UI que ya hay en el repo (`docs/ux-ui-review/`, `docs/MARCA.md`, `docs/DESIGN_SYSTEM.md`, `docs/ATHLETE_APP_UX_SPEC.md`, etc.). Si contradicen esta referencia, manda la referencia. Del repo solo se toma lo técnico: el código actual, el esquema de Supabase y los tests.

### Abrir una pantalla puntual

```
referencia/athlete-v7.html?screen=<clave>&theme=light|dark&view=SIMPLE|TECNICA&embed=1
```

`embed=1` muestra solo la app a 390 × 844, sin marco de teléfono ni barra de estado: es el modo que usa QA para comparar. Las claves de pantalla están en `02-pantallas.md` y en `PANTALLAS` dentro de `capturar.mjs`.

## Índice

| Archivo | Contenido | Lo lee primero |
|---|---|---|
| `00-PM.md` | Objetivo, regla de alcance de archivos, decisiones cerradas y abiertas, olas, mapa de issues, riesgos, definición de terminado | PM |
| `01-sistema-visual.md` | Tokens exactos (claro y oscuro), mapeo a las variables HSL del repo, fuentes, escala tipográfica, elevación, dorado único, fondos generativos, iconos | Frontend, QA |
| `02-pantallas.md` | Cada pantalla: clave de captura, estructura, copy exacto, estados, componente actual que la implementa y brecha | Frontend, QA |
| `03-backend.md` | Migración `nombre_preferido`, contrato de molestias (EVA, ejercicio real, herencia por articulación), video por serie, parser de indicaciones | Backend |
| `04-frontend.md` | Plan archivo por archivo, cómo portar el CSS de la referencia, tests que se rompen y cómo actualizarlos | Frontend |
| `05-qa.md` | Fidelidad visual (captura de referencia contra captura de la app, lado a lado, más aserciones de estilo computado), e2e funcional, accesibilidad, control de alcance | QA |
| `06-issues.md` | 19 issues listos para pegar en Multica (`--description-file`) | PM |

## Cómo se usa en Multica

1. El PM lee `00-PM.md` y cierra las 4 decisiones abiertas de la §4. Las recomendadas están marcadas.
2. El PM crea los issues desde `06-issues.md`, en el orden de olas.
3. Cada agente recibe su documento de rol, más `01` y `02` (frontend y QA) o `02` (backend).
4. Cada PR de frontend adjunta su contraste visual (lo genera QA-01 o el mismo frontend con el script de `05-qa.md §2`).
