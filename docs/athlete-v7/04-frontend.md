# 04 · Frontend

> **Agente:** `@frontend-eng`. Lee además `01-sistema-visual.md` y `02-pantallas.md` completos.
> **Regla de alcance:** `00-PM.md §2`. Ante una duda visual, abrí `referencia/athlete-v7.html?screen=<clave>&embed=1` e inspeccioná el elemento: el CSS de la referencia es el contrato.
> **Principio:** reusar la lógica actual (store, cola offline, cálculos de `lib/`) y cambiar la presentación y la estructura. No reescribir el registro de series.

---

## 1. Orden de trabajo

FE-01 → FE-02 → (FE-03, FE-04, FE-09, FE-10 en paralelo) → FE-05 → (FE-06, FE-07, FE-08) → FE-11, FE-12. Un PR por issue. Cada PR adjunta el contraste visual de las pantallas que toca (`05-qa.md §2`). **Cada issue avanza por checkpoints con commit y push (`07-checkpoints.md`)**: si la sesión se corta, se retoma desde `docs/athlete-v7/progreso/<ID>.md`.

---

## 2. FE-01 · Base

| Archivo | Cambio |
|---|---|
| `src/app/(athlete)/athlete/layout.tsx` | Cargar Archivo, Geist y Geist Mono con `next/font/google` (`01 §4`). Raíz `<div className={\`theme-athlete ${archivo.variable} ${geist.variable} ${geistMono.variable}\`} data-v7>`. Importar `./athlete-v7.css`. |
| `src/app/(athlete)/athlete/athlete-v7.css` (nuevo) | (1) Variables HSL de shadcn en `.theme-athlete[data-v7]` y `.dark .theme-athlete[data-v7]` (`01 §3`). (2) Tokens `--a-*` (`01 §2`), incluidos `--a-elev-1..3` y `--a-surface-l2/l3`. (3) Las 11 clases tipográficas `.a-t-*` (`01 §5`). (4) Clases de componentes `.a-*` portadas de la referencia (§3 de este documento). (5) `font-family` base y `.font-mono`. (6) `@media (prefers-reduced-motion: reduce)`: sin transiciones ni animaciones. |
| — | Sin cambios en `globals.css` ni en `tailwind.config.ts`. |

**Criterio:** con solo FE-01 mergeado, `/athlete` ya se ve en tinta (sin azul) y con las tres fuentes, aunque la estructura siga siendo la vieja.

---

## 3. Cómo portar el CSS de la referencia

1. Abrí `referencia/athlete-v7.html`. El `<style>` principal está entre la línea 1 y la que cierra antes de `<header class="topbar">`. Ignorá todo lo del panel y de la documentación: `.topbar`, `.panel`, `.pv`, `.stage`, `.device`, `.cb`, `.sw`, `.doc`, `.card-d`, `.trow`, `.swc`, `table.t`, `.compare`, `.minip`, `body.embed`, `.sbar`, `.island`, `.homei`, `.topmask`, `.pal-actual`, `.font-*`.
2. Copiá las reglas de la app: desde `/* shell */` hasta `/* overlays oscuros */`, las de `/* sheets */` y el bloque `/* ===== v7 ===== */`. Reemplazá:
   - `.tk ` → `.theme-athlete[data-v7] ` y `.tk.is-dark` → `.dark .theme-athlete[data-v7]`
   - cada clase de componente `X` → `a-X` (`.card` → `.a-card`, `.row.next` → `.a-row.a-next`, `.btn.gym` → `.a-btn.a-gym`). Los estados ARIA (`[aria-pressed="true"]`, `[aria-current]`) quedan igual.
   - `var(--bg)` → `var(--a-bg)` y lo mismo con cada token.
3. Clases utilitarias de la referencia: `.muted` → `.a-muted`, `.eb` (eyebrow) → `.a-eb`, `.mono` → `.a-mono`, `.sr` → `sr-only` de Tailwind.
4. Componentes nuevos: usar las clases `a-*`. Componentes existentes: se puede reemplazar su `className` de Tailwind por las clases `a-*` o dejar Tailwind con tokens (`bg-card`, `text-muted-foreground`) si el resultado computado es idéntico. **Lo que decide es el estilo computado**: QA lo compara (`05-qa.md §3`).
5. **Bugs de la v6 ya corregidos en la referencia** (no los reintroduzcas): el botón del héroe usa `.a-hbtn`, no `.a-hero` (heredaba padding y cuñas); en pantallas oscuras `.dk .a-row` lleva texto `#FAFAFA`; el título del cierre baja a 2,125rem.

---

## 4. Componentes: inventario actual → v7

| Actual | v7 | Issue |
|---|---|---|
| `athlete-shell.tsx` | Encabezado nuevo + `athlete-bottom-nav.tsx` (nuevo) + `athlete-theme-button.tsx` (nuevo, usa `useTheme()`) + chip de red con 4 estados. La nav se oculta en rutina, ejercicio, cierre, onboarding y cuestionario: el shell la decide con el estado del store (`diaActivoId`, ejercicio abierto) y la ruta. | FE-02 |
| `app/(athlete)/athlete/page.tsx` | Decide entre `InicioMisDias`, `RutinaDelDia` y `EjercicioActivo` según el store (agregar `ejercicioAbiertoId: string \| null` al store). | FE-02, FE-04 |
| `inicio-mis-dias.tsx` | Héroe, días, estados (`02 §1`), tarjeta de instalar (nuevo `instalar-app-card.tsx` + hoja de pasos), saludo con `nombreParaSaludo()`. | FE-03 |
| `live-workout.tsx` (2.876 líneas) | Se divide en **`rutina-del-dia.tsx`** (cabecera, avance, lista, registro de la sesión, terminar) y **`ejercicio-activo.tsx`** (herramientas, tarjeta de serie, registradas). La lógica (handlers, cálculos, efectos) pasa a un hook **`use-live-workout.ts`** sin cambios de comportamiento. `live-workout.tsx` queda como contenedor fino o se elimina, y los tests se actualizan. | FE-04, FE-05 |
| `ultima-vez.tsx`, `sugerencia-carga.tsx` | Reestilo (`.a-last`, `.a-sug`). Agregar "Igual que la anterior" (nuevo, usa la última serie registrada de la sesión). | FE-05 |
| `atypical-confirmation-dialog` (en `live-workout.tsx`) | Pasa a ser el aviso en línea `.a-kgwarn` debajo del campo de peso. Conservar `data-testid` `atypical-corregir-btn` y `atypical-confirmar-btn`. | FE-05 |
| `warmup-modal.tsx` | Aproximación en línea (`.a-appr`) dentro del ejercicio. Reusar el cálculo existente, pero **desde el peso de trabajo** (D-20). | FE-05 |
| `plate-calculator-modal.tsx` | Su cálculo pasa a la sección Técnica (D-21). El modal deja de usarse. | FE-05 |
| `rest-timer.tsx` | Panel inferior `.a-restbar`: tiempo transcurrido sobre total, −30 / +30 / pausa / Omitir. | FE-05 |
| `aviso-record.tsx` | Dorado único, copa sin círculo (`01 §8`). | FE-06 |
| `exercise-notes-modal.tsx` | Hoja con formato usando `parseIndicaciones()` (BE-04). Crece con el contenido y se desliza adentro. | FE-07 |
| `exercise-video-modal.tsx` | Solo el video demostrativo. Sin `url_video`, no hay botón. Se quitan "Buscar en YouTube", el ID y el emoji 🎬. | FE-07 |
| `video-upload-modal.tsx` | Hoja "Video de la serie N", abierta desde cada fila de Registradas: grabar, galería y enlace. Llama `adjuntarVideoASerie` y muestra `videoEstado` en la fila (BE-03, `03b-video-serie.md §4`). | FE-07 |
| `pain-report-modal.tsx` | Reestilo de la hoja (`02 §3.3`). Llama `reportarMolestia` con el `ejercicioId` real (BE-02, `03a-molestias.md §4`). | FE-08 |
| `pain-banner.tsx` | Nuevo `aviso-molestia.tsx` con dos variantes: completa y heredada, usando `avisoMolestiaPara()` (BE-02). Se renderiza **dentro de `ejercicio-activo.tsx`**, no en la cabecera de la sesión. | FE-08 |
| `historial-sesiones.tsx` | Cabecera invertida, chip PR dorado, hoja de corrección. | FE-09 |
| `mi-progreso.tsx` | Cabecera invertida, delta `+10 kg`, gráfico SVG de la referencia. | FE-09 |
| `athlete-classes.tsx` | Semana como vista principal, cupo semanal, botones con motivo. | FE-10 |
| `athlete-chat.tsx` | Hoja de chat; el disparador es el botón flotante del shell. | FE-10 |
| `membership-paywall.tsx` | Banner en Inicio + hoja centrada con alias. | FE-10 |
| `cuestionario-inicial.tsx` | Reestilo de opciones y chips. | FE-10 |
| `onboarding-alumno.tsx` | 4 pasos, con el paso del nombre (`02 §10`). | FE-11 |
| `cierre-dia-modal.tsx` | Pantalla oscura de la referencia. Se quita el ranking de constancia (D-33) y el emoji 🏆. | FE-11 |
| — | `fondo-generativo.tsx` (nuevo) + `src/lib/athlete/fondo.ts`: malla asimétrica, semilla al azar por apertura (`01 §10`) | FE-12 |
| `habit-tracker.tsx`, `nutrition-tracker.tsx`, `mi-progreso` de hábitos | Sin cambios: no están montados en `/athlete` (D-34). | — |

---

## 5. Reglas de implementación

- **`data-testid`:** conservar todos los existentes (se pueden mover de elemento). Los nuevos: `kebab-case` en español (`molestia-heredada`, `serie-video-btn-<n>`, `nav-inferior`, `chip-red`, `heroe-te-toca-hoy`, `onboarding-paso-nombre`).
- **Íconos:** SVG en línea en `components/athlete/icons.tsx`. Sin `lucide-react` ni Radix (hay tests que lo verifican).
- **Accesibilidad:** cada hoja con `role="dialog"`, `aria-modal`, `aria-labelledby` al título, foco al abrir, Escape cierra, foco vuelve al disparador. Botones de ícono con `aria-label`. Segmentados con `aria-pressed`. Barra de avance con `role="progressbar"` y `aria-valuenow`. Panel de descanso `role="timer"`. Avisos de molestia: `role="alert"` (alta, alarma) o `role="status"` (leve, moderada, heredada).
- **Números:** `Intl.NumberFormat("es-AR")`. Campos con `inputmode="decimal"` (peso) o `"numeric"` (reps), `autocomplete="off"`, a 16 px o más.
- **Wake Lock:** pedir la pantalla activa al empezar la sesión y soltarla al cerrar. Mostrar el chip "Pantalla activa" solo si se concedió.
- **Sin datos de ejemplo** en modo real (`assertNoDemoLiteralsInLiveMode`).
- **Escritorio:** columna centrada de `max-width: 28rem`. Ninguna pantalla con scroll horizontal.

---

## 6. Tests que se van a romper (y cómo actualizarlos)

Estos specs leen el código fuente del alumno con `readFileSync` (entre corchetes, la cantidad de lecturas). Al dividir `live-workout.tsx` o cambiar copy, actualizalos **en el mismo PR**: cambiá la ruta del archivo o reemplazá el texto viejo por el nuevo o por un `data-testid`. Nunca `.skip`, `.todo` ni aserciones más débiles.

| Issue | Specs afectados |
|---|---|
| FE-01, FE-02 | `bimodal-theme-toggle` [8] (lee `globals.css`, que no cambia: debería seguir verde), `qa-visual-debt-epic-stage4-audit` [10], `qa-athlete-resto-visual-debt-tokens` [7], `qa-auth-rbac-verification` [12] (shell), `athlete-offline-silent-sync` [1] (hoy fija que no hay pendientes visibles: la v7 los muestra, D-25), `clases-reservas-ui` [1], `athlete-responsive-rest-timer` [3] |
| FE-03 | `athlete-inicio-mis-dias` [3], `athlete-motivo-cambio-dia` [3], `qa-rutinas-2x1-previsualizacion-peso` [2], `fernando-rosales-alumnos-testeo` [5], `qa-fase1-contrataciones-vencimientos-backup` [7] |
| FE-04, FE-05 | `athlete-exercise-selector-column` [1], `athlete-single-set-workout` [4], `athlete-autofinish-last-set` [1], `athlete-set-type-taxonomy-popover` [2], `qa-athlete-verificacion-integral-flujo-registro` [3], `qa-audit-gozs-351-edge-cases` [1], `qa-gozs-418-rpe-piramidal` [3], `qa-pulido-app-alta-cobro-rutinas-351` [1], `qa-rpe-objetivo-readonly` [3], `rpe-objetivo-readonly` [2], `vista-simple-tecnica-alumno-coach` [2], `aproximacion-pr` [2], `warmup-sets-w-registro` [2], `remove-plate-calculator` [2] (fijaba que la calculadora no estuviera montada: la v7 la pone en Técnica por D-21; actualizar citando D-21), `sugerencia-carga-componente` [2] |
| FE-06 | `qa-historial-progreso-verification` [7], `aviso-record-componente`, `record-store` |
| FE-07 | `athlete-exercise-notes-button` [1], `athlete-youtube-video` |
| FE-08 (y BE-02) | `pain-report-banners-by-range` [1], `molestias-red-flags-ui` [1], `qa-molestias-red-flags-sustituciones` [2], `pipeline-alertas-dolor-fernando` [3] |
| FE-09 | `athlete-historial-sesiones`, `mi-progreso-componente` (texto "desde {mes}" → "+10 kg"), `qa-gozs-359-athlete-studio-fixes` [1] |
| FE-10 | `chat-ui-gozs-transferencia` [5], `inapp-chat-athlete-notif-drawer-cobros` [1], `chat-ui-shared-messaging` |
| FE-11 | `onboarding-alumno-preferencias`, `onboarding-cuestionario-vista-minimalista` [6], `athlete-celebracion-cierre-dia` [2] (ranking de constancia: quitar citando D-33) |

Cuando un spec fija una decisión anterior que la referencia cambia, el PR lo dice en el cuerpo: "Actualiza `<spec>`: la v7 decide D-xx".

Para correr solo lo afectado: `npx vitest run src/__tests__/<spec>`.

---

## 7. Checklist por PR de frontend

- [ ] Solo archivos permitidos (`00-PM.md §2`).
- [ ] Contraste visual adjunto: referencia contra app, claro y oscuro, 390 px, de cada pantalla tocada (`05-qa.md §2`).
- [ ] Aserciones de estilo de esas pantallas en verde (`05-qa.md §3`).
- [ ] Sin scroll horizontal a 390 y 360 px con un peso de 5 cifras.
- [ ] Specs afectados actualizados (§6). Gate verde: `npm test && npm run typecheck && npm run lint && npm run build`.
