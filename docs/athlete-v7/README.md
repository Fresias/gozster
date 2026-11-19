# Athlete App v7: nueva imagen de la app del alumno

> **Para:** `@PM-GOZster` (dueño del paquete), que reparte a `@backend-eng`, `@frontend-eng` y `@qa-eng`.
> **Firma de PRs:** `@Fresias`.
> **Alcance:** solo la estética y el comportamiento de la app del alumno (`/athlete`). Login, Coach Studio, landing y el resto del repo no se tocan (`00-PM.md §2`).

## Fuente de verdad

La única fuente de diseño es el artifact **"GOZSter Definición Visual" (v6)** con las correcciones v7 del producto, materializado acá:

- `referencia/athlete-v7.html`: prototipo completo, se abre con doble clic. Pestañas Prototipo, Tipografía, Color y Decisiones (D-01 a D-54).
- `referencia/png/`: **164 capturas = 82 pantallas × claro/oscuro**, a 390 × 844, fondo con semilla 3.
- `referencia/capturar.mjs`: regenera las capturas con Playwright.

**No usar como referencia de diseño** los documentos de UX/UI que ya hay en el repo (`docs/ux-ui-review/`, `docs/MARCA.md`, `docs/DESIGN_SYSTEM.md`, `docs/ATHLETE_APP_UX_SPEC.md`…). Del repo solo se toma lo técnico: código, esquema de Supabase y tests.

### Abrir una pantalla puntual

```
referencia/athlete-v7.html?screen=<clave>&theme=light|dark&view=SIMPLE|TECNICA&seed=3&embed=1
```

`embed=1` muestra solo la app a 390 × 844, sin marco ni barra de estado (modo de comparación de QA). `seed` fija la semilla del fondo (sin ese parámetro, cambia en cada apertura, como en la app).

### Pantallas (82)

| Grupo | Claves |
|---|---|
| Acceso (4) | `onb1`, `onbname`, `onb2`, `onb3` (login fuera de alcance) |
| Entrenar (13) | `inicio`, `inicio-semana`, `inicio-dia`, `inicio-sinplan`, `inicio-cargando`, `inicio-error`, `inicio-offline`, `inicio-pendientes`, `inicio-instalar`, `inicio-instalar-android`, `inicio-vencida`, `inicio-suscripcion`, `chat` |
| Sesión (12) | `rutina`, `rutina-curso`, `rutina-terminar`, `rutina-molestia`, `registro`, `registro-datos`, `config`, `cuest`, `cuest-hecho`, `cierre`, `cierre-off`, `toast-sesion` |
| Ejercicio (25) | `ex-aprox`, `ex-ss`, `ex-tec`, `ex-tec-rpe`, `ex-tiempo`, `ex-tiempo-run`, `ex-drop`, `ex-drop-2`, `ex-uni`, `ex-uni-izq`, `ex-rest`, `ex-rest-pausa`, `ex-descanso-info`, `ex-record`, `toast-record`, `ex-x10`, `ex-rej`, `ex-offline`, `toast-sinsenal`, `ex-completo`, `ex-videos`, `ex-video-estados`, `setvideo`, `notes`, `video` |
| Molestias (11) | `mol-modal`, `mol-modal-alta`, `mol-modal-alarma`, `mol-leve`, `mol-mod`, `mol-alta`, `mol-alarma`, `mol-hereda`, `mol-lumbar`, `mol-no-hereda`, `mol-otro` |
| Historial y progreso (11) | `hist`, `hist-open`, `hist-open-tec`, `hist-fix`, `hist-dash`, `hist-vacio`, `hist-off`, `prog`, `prog-tec`, `prog-vacio`, `prog-off` |
| Clases (6) | `cls`, `cls-mes`, `cls-reservada`, `cls-cupo`, `cls-dia-vacio`, `cls-off` |

## Índice

| Archivo | Contenido | Lo lee primero |
|---|---|---|
| `00-PM.md` | Objetivo, alcance, decisiones, olas, mapa de issues, riesgos, terminado | PM |
| `01-sistema-visual.md` | Tokens exactos, mapeo HSL, fuentes, escala, elevación, dorado, malla asimétrica, íconos | Frontend, QA |
| `02-pantallas.md` | Cada pantalla: clave, estructura, copy exacto, estados, componente actual y brecha | Frontend, QA |
| `03-backend.md` | BE-00 (id de sesión), BE-01 (nombre), BE-04 (indicaciones) y reglas | Backend |
| `03a-molestias.md` | BE-02: guardar la molestia, asociarla a sesión/ejercicio/serie, aviso y herencia | Backend (frontend: §2 y §6) |
| `03b-video-serie.md` | BE-03: bucket privado, subida con y sin señal, enlace, envío | Backend (frontend: §2 y §4) |
| `04-frontend.md` | Plan archivo por archivo, cómo portar el CSS, tests a actualizar | Frontend |
| `05-qa.md` | Contraste visual en tres capas, F-00 a F-21, accesibilidad, alcance | QA |
| `06-issues.md` | 20 issues con **checkpoints**, listos para Multica | PM |
| `07-checkpoints.md` | Protocolo para retomar un issue cortado (archivo de progreso, commits, push) | Todos |

## Cómo se usa en Multica

1. El PM lee `00-PM.md`, cierra D3 y crea `progreso/EPICA.md`.
2. Crea los issues desde `06-issues.md` en el orden de olas (BE-00 primero: es P0).
3. Cada agente recibe su documento de rol, más `01` y `02` (frontend y QA), y **siempre `07-checkpoints.md`**.
4. Si una sesión se corta, cualquier agente retoma con `07-checkpoints.md §3`.
