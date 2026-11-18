# 01 · Sistema visual v7

> Fuente: `referencia/athlete-v7.html`, bloque `<style>` y pestañas Tipografía, Color y Decisiones. Ante cualquier duda de un valor, manda el CSS de la referencia: este documento lo transcribe.

---

## 1. Cómo se aplica sin tocar el resto del repo

1. El layout del alumno (`src/app/(athlete)/athlete/layout.tsx`) envuelve todo en `<div className="theme-athlete" data-v7>` y aplica las variables de las tres fuentes (§4).
2. Todo el CSS nuevo vive en **`src/app/(athlete)/athlete/athlete-v7.css`**, importado solo desde ese layout.
3. Selectores:
   - `.tk` de la referencia → `.theme-athlete[data-v7]`
   - `.tk.is-dark` de la referencia → `.dark .theme-athlete[data-v7]`
   - Clases de componentes de la referencia → mismo nombre con prefijo `a-` y scope: `.card` → `.theme-athlete[data-v7] .a-card`. El prefijo evita choques con Tailwind (`.card`, `.chip`, `.row`) y con Coach Studio.
4. Los componentes compartidos (`ui/button`, `ui/card`, `ui/badge`) leen las variables HSL de shadcn. Por eso el mismo archivo también redefine esas variables dentro del scope (§3): así lo que todavía no se migró ya toma la paleta nueva.

`globals.css` **no se modifica**. Los overrides azul y cian que tiene en `.theme-athlete` (líneas 164-165) quedan pisados por `.theme-athlete[data-v7]`, que tiene más especificidad.

---

## 2. Tokens de la referencia (hex)

Nombres tal cual la referencia, con el prefijo `--a-` en el código (`--bg` → `--a-bg`).

### 2.1 Neutros y acción

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | `#FAFAFA` | `#09090B` | Lienzo de la app |
| `--surface` | `#FFFFFF` | `#18181B` | Tarjetas (nivel 1) |
| `--surface-l2` | `#FFFFFF` | `#1F1F23` | Tarjeta de serie (nivel 2) |
| `--surface-l3` | `#FFFFFF` | `#232327` | Hojas, panel de descanso (nivel 3) |
| `--surface-2` | `#F4F4F5` | `#27272A` | Chips, segmentados, filas internas, pista de progreso |
| `--fg` | `#09090B` | `#FAFAFA` | Texto, íconos |
| `--fg-2` | `#52525B` | `#A1A1AA` | Texto secundario (AAA en los dos temas) |
| `--fg-3` | `#71717A` | `#A1A1AA` | Solo metadatos sobre blanco |
| `--line` | `#E4E4E7` | `#27272A` | Borde decorativo de tarjetas. Nunca único límite de un campo |
| `--line-strong` | `#71717A` | `#71717A` | Borde de controles: inputs, steppers, chips de opción (4,83:1) |
| `--primary` / `--sel` | `#09090B` | `#FAFAFA` | Botón primario, selección, ítem activo, día de hoy |
| `--on-primary` / `--on-sel` | `#FAFAFA` | `#09090B` | Texto sobre primario |
| `--sel-soft` | `#F4F4F5` | `#27272A` | Fondo del ejercicio "próximo" y de la opción elegida |
| `--sel-line` | `#09090B` | `#FAFAFA` | Borde de 2 px del ejercicio "próximo" |
| `--silver` | `#D4D4D8` | `#52525B` | Solo decoración (áreas de gráficos, día reservado). Nunca detrás de texto |
| `--silver-2` | `#A1A1AA` | `#71717A` | Inicio del degradé del área de gráficos |
| `--link` | `#09090B` | `#FAFAFA` | Enlaces subrayados |
| `--tip` / `--tip-fg` | `#18181B` / `#F4F4F5` | `#27272A` / `#F4F4F5` | Ayudas en línea (RPE, descanso) |
| `--chev` | `#09090B` | `#FAFAFA` | Franja diagonal de 8 px arriba de la app |
| `--hatch` | `rgba(9,9,11,.06)` | `rgba(255,255,255,.06)` | Trama del drop set |

### 2.2 Estados: verde, oro y tinta (`p1`)

| Rol | Token | Claro | Oscuro | Dónde |
|---|---|---|---|---|
| Éxito | `--ok-bg` | `#E3F4EE` | `#062E25` | Sugerencia "Repetí / Probá", toast de guardado, "Online", delta de Progreso |
| | `--ok-fg` | `#00664A` | `#5FD3B0` | Texto |
| | `--ok-ic` | `#009E73` | `#009E73` | Cuadrado del ícono de la sugerencia |
| | `--ok-on` | `#FFFFFF` | `#FFFFFF` | Ícono sobre `--ok-ic` |
| | `--ok-line` | `#009E73` | `#009E73` | Borde del delta y del toast |
| Logro (récord) | `--rec-bg` | `#FFF6DA` | `#2A2208` | **Único dorado** (§8) |
| | `--rec-fg` | `#5C4300` | `#F5D77A` | Texto (8,6:1 y 11,2:1) |
| | `--rec-ic` | `#A87B0B` | `#D4A72C` | Copa y borde (3,5:1 y 7,0:1) |
| Advertencia | `--warn-bg` | `#FFFFFF` | `#18181B` | Suscripción vencida, molestia moderada, molestia heredada, sin señal |
| | `--warn-fg` | `#09090B` | `#FAFAFA` | Texto |
| | `--warn-line` | `#09090B` | `#FAFAFA` | Borde de 1,5 a 2 px (sin señal: punteado) |
| | `--warn-ic` / `--warn-on` | `#09090B` / `#FFFFFF` | `#FAFAFA` / `#09090B` | Círculo del "!" |
| Peligro | `--bad` | `#DC2626` | `#DC2626` | Molestia alta (relleno), intensidad 7 a 10 elegida, "Avisar a mi coach" |
| | `--on-bad` | `#FFFFFF` | `#FFFFFF` | |
| | `--bad-fg` | `#B91C1C` | `#F87171` | Texto rojo chico ("Tengo una molestia") |
| | `--bad-soft` | `#FEF2F2` | `#2A1215` | Chip "Molestia" en la rutina |
| Alarma | (fijo) | `#7F1D1D` + `#FFFFFF` | igual | "Frená por hoy" |

### 2.3 Tarjeta destacada (héroe)

| Token | Claro (día) | Oscuro (noche, **invertido**) |
|---|---|---|
| `--hero` | `#09090B` | `#FAFAFA` |
| `--on-hero` | `#FAFAFA` | `#09090B` |
| `--hero-2` | `#A1A1AA` | `#52525B` |
| `--hero-btn` / `--on-hero-btn` | `#FAFAFA` / `#09090B` | `#09090B` / `#FAFAFA` |
| `--hero-line` | `#3F3F46` | `#71717A` |
| `--wedge-a` / `--wedge-b` (cuña ancha) | `#F3F3F5` → `#A3A5AB` | `#3F3F46` → `#18181B` |
| `--wedge-c` / `--wedge-d` (cuña fina) | `#5A5C62` → `#2B2C30` | `#A1A1AA` → `#D4D4D8` |

Aplica a: "Te toca hoy" (Inicio), cabecera de Historial y cabecera "Sesiones este mes" de Progreso (D-47). Los chips dentro del héroe usan `color-mix(in srgb, var(--on-hero) 12%, transparent)`.

### 2.4 Chips de tipo de serie

| Chip | Claro | Oscuro |
|---|---|---|
| Biserie / drop set (`.chip.ss`) | fondo `#09090B`, texto `#FAFAFA` | fondo `#FAFAFA`, texto `#09090B` |
| Aproximación (`.chip.ap`) | fondo `#F4F4F5`, texto `#09090B`, borde punteado `#09090B` | fondo `#27272A`, texto `#FAFAFA`, borde punteado `#FAFAFA` |
| Por lado, Tiempo (`.chip.line`) | transparente, borde `--line-strong` | igual |

---

## 3. Mapeo a las variables HSL del repo (dentro de `.theme-athlete[data-v7]`)

Así, `bg-primary`, `text-muted-foreground`, `border-input` y las demás clases de Tailwind ya existentes toman la paleta nueva.

| Variable | Claro (hex) | Claro (HSL) | Oscuro (hex) | Oscuro (HSL) |
|---|---|---|---|---|
| `--background` | `#FAFAFA` | `0 0% 98%` | `#09090B` | `240 10% 3.9%` |
| `--foreground` | `#09090B` | `240 10% 3.9%` | `#FAFAFA` | `0 0% 98%` |
| `--card` | `#FFFFFF` | `0 0% 100%` | `#18181B` | `240 5.9% 10%` |
| `--card-foreground` | `#09090B` | `240 10% 3.9%` | `#FAFAFA` | `0 0% 98%` |
| `--popover` | `#FFFFFF` | `0 0% 100%` | `#232327` | `240 5.4% 14.5%` |
| `--popover-foreground` | `#09090B` | `240 10% 3.9%` | `#FAFAFA` | `0 0% 98%` |
| `--primary` | `#09090B` | `240 10% 3.9%` | `#FAFAFA` | `0 0% 98%` |
| `--primary-foreground` | `#FAFAFA` | `0 0% 98%` | `#09090B` | `240 10% 3.9%` |
| `--secondary` | `#F4F4F5` | `240 4.8% 95.9%` | `#27272A` | `240 3.7% 15.9%` |
| `--secondary-foreground` | `#09090B` | `240 10% 3.9%` | `#FAFAFA` | `0 0% 98%` |
| `--muted` | `#F4F4F5` | `240 4.8% 95.9%` | `#27272A` | `240 3.7% 15.9%` |
| `--muted-foreground` | `#52525B` | `240 5.2% 33.9%` | `#A1A1AA` | `240 5% 64.9%` |
| `--subtle-foreground` | `#71717A` | `240 3.8% 46.1%` | `#A1A1AA` | `240 5% 64.9%` |
| `--accent` | `#F4F4F5` | `240 4.8% 95.9%` | `#27272A` | `240 3.7% 15.9%` |
| `--accent-foreground` | `#09090B` | `240 10% 3.9%` | `#FAFAFA` | `0 0% 98%` |
| `--border` | `#E4E4E7` | `240 5.9% 90%` | `#27272A` | `240 3.7% 15.9%` |
| `--input` | `#71717A` | `240 3.8% 46.1%` | `#71717A` | `240 3.8% 46.1%` |
| `--ring` | `#09090B` | `240 10% 3.9%` | `#FAFAFA` | `0 0% 98%` |
| `--destructive` | `#DC2626` | `0 72.2% 50.6%` | `#DC2626` | `0 72.2% 50.6%` |
| `--destructive-foreground` | `#FFFFFF` | `0 0% 100%` | `#FFFFFF` | `0 0% 100%` |
| `--success` | `#009E73` | `164 100% 31%` | `#009E73` | `164 100% 31%` |
| `--success-foreground` | `#FFFFFF` | `0 0% 100%` | `#FFFFFF` | `0 0% 100%` |
| `--success-soft` | `#E3F4EE` | `159 43.6% 92.4%` | `#062E25` | `166 76.9% 10.2%` |
| `--success-soft-foreground` | `#00664A` | `164 100% 20%` | `#5FD3B0` | `162 56.9% 60%` |
| `--success-soft-border` | `#009E73` | `164 100% 31%` | `#009E73` | `164 100% 31%` |
| `--warning` | `#09090B` | `240 10% 3.9%` | `#FAFAFA` | `0 0% 98%` |
| `--warning-foreground` | `#FFFFFF` | `0 0% 100%` | `#09090B` | `240 10% 3.9%` |
| `--warning-soft` | `#FFFFFF` | `0 0% 100%` | `#18181B` | `240 5.9% 10%` |
| `--warning-soft-foreground` | `#09090B` | `240 10% 3.9%` | `#FAFAFA` | `0 0% 98%` |
| `--warning-soft-border` | `#09090B` | `240 10% 3.9%` | `#FAFAFA` | `0 0% 98%` |
| `--danger-soft` | `#FEF2F2` | `0 85.7% 97.3%` | `#2A1215` | `352 40% 11.8%` |
| `--danger-soft-foreground` | `#B91C1C` | `0 73.7% 41.8%` | `#F87171` | `0 90.6% 70.8%` |
| `--danger-soft-border` | `#DC2626` | `0 72.2% 50.6%` | `#DC2626` | `0 72.2% 50.6%` |

El tema oscuro lo activa la clase `dark` en `<html>` (el script de `src/app/layout.tsx` y la clave `gozster-theme` de `localStorage`). La app no cambia ese mecanismo: usa `useTheme()` de `@/components/ui/theme-toggle` para su propio botón (FE-02).

---

## 4. Fuentes

| Familia | Rol | Pesos | Ejes | Variable CSS |
|---|---|---|---|---|
| Archivo | Display y números grandes | 800, 900 | `wdth` 62-125 | `--a-f-display` |
| Geist | Interfaz y lectura | 400, 500, 600, 700 | — | `--a-f-sans` |
| Geist Mono | Etiquetas (eyebrows, chips, objetivos) | 600, 700 | — | `--a-f-mono` |

En `src/app/(athlete)/athlete/layout.tsx`:

```tsx
import { Archivo, Geist, Geist_Mono } from "next/font/google";

const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--a-f-display", display: "swap" });
const geist = Geist({ subsets: ["latin"], variable: "--a-f-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["600", "700"], variable: "--a-f-mono", display: "swap" });

// <div className={`theme-athlete ${archivo.variable} ${geist.variable} ${geistMono.variable}`} data-v7>
```

En `athlete-v7.css`: `.theme-athlete[data-v7]{ font-family: var(--a-f-sans), system-ui, sans-serif; }` y `.theme-athlete[data-v7] .font-mono{ font-family: var(--a-f-mono), ui-monospace, monospace; }`. Si el build no tiene red, se usa `next/font/local` con los `.woff2` (licencia OFL) en `src/app/(athlete)/athlete/fonts/`, con los mismos nombres de variable.

---

## 5. Escala tipográfica (11 tokens)

Tamaños en `rem` (respetan el tamaño de letra del teléfono). Inputs a 16 px o más (en iPhone, menos hace zoom). 12 px solo para etiquetas.

| Clase en la app | Token | Familia | CSS exacto | Uso | No usar para |
|---|---|---|---|---|---|
| `.a-t-dxl` | display-xl | Archivo, `font-stretch:125%` | `900 2.5rem/1.1`, `letter-spacing:-.02em`, `text-wrap:balance` | Bienvenida del onboarding. En el cierre baja a **2.125rem** con `overflow-wrap:anywhere` | Login, formularios, registro |
| `.a-t-d` | display | Archivo, `font-stretch:112%` | `800 2rem/1.125`, `-.02em` | Títulos cortos: DÍA 1, PLAN GENERAL, Historial, Mi progreso, Clases, título del héroe | Nombres de ejercicio |
| `.a-t-h` | headline | Archivo, `font-stretch:100%` | `800 1.625rem/1.15`, `-.01em` | Nombre del ejercicio, títulos de hojas, preguntas del onboarding (a 2rem) | Más de 3 líneas |
| `.a-t-ml` | metric-l | Archivo, `font-stretch:125%`, `tabular-nums` | `800 3.5rem/1`, `-.02em` | Timer de descanso (2.75rem) y de plancha, sesiones del mes, carga del drop set | Números dentro de un campo |
| `.a-t-mi` | metric-input | Archivo, `font-stretch:100%`, `tabular-nums` | `800 2.5rem/1.1`, `-.01em`; **2rem desde 5 caracteres** (`.long`). En el campo: `font-size:min(2.5rem, calc(100cqi / (var(--n) * .64 + .25)))` con `container-type:inline-size` en `.a-val` y `--n` = largo del valor | Peso y reps en los campos, corrección en el historial | Timers |
| `.a-t-mm` | metric-m | Archivo, `font-stretch:112%`, `tabular-nums` | `800 2.25rem/1.1`, `-.01em` | Estadísticas, hora de la clase, valor de Progreso, carga por lado | |
| `.a-t-title` | title | Geist | `700 1.25rem/1.3`, `-.01em` | Título de tarjeta o estado vacío, opciones del onboarding | |
| `.a-t-bs` | body-strong | Geist | `600 1rem/1.375` | Filas de lista, botones, labels | |
| `.a-t-body` | body | Geist | `400 1rem/1.5` | Texto corrido, indicaciones, chat, **todos los inputs** | |
| `.a-t-sec` | secondary | Geist, `tabular-nums` | `500 .875rem/1.43` | Metadatos, "Última vez: 45 kg × 9" | Lo que se lee entre series sin acercarse |
| `.a-t-label` | label | Geist Mono | `600 .75rem/1.33`, `letter-spacing:.12em`, `text-transform:uppercase` | Eyebrows (RUTINA, PESO), chips, "OBJ. 8-10", "SERIE 1 DE 3" | Oraciones, más de 4 palabras |

Pesos: Geist 400 · 500 · 600 · 700; Archivo 800 · 900. Nada más.

---

## 6. Medidas

| Elemento | Medida |
|---|---|
| Ancho de diseño | 390 px (verificar también 360). Márgenes laterales 16 px |
| Separación vertical entre bloques (`.view`) | 12 px |
| Radios | Tarjeta 18 px · héroe 24 px · tarjeta de serie 24 px · hoja 28 px arriba · chip 7 px · botón y segmentado: pastilla (999 px) · stepper e input de número 16 px · icon-btn 12 px |
| Botón primario | alto 52 px; **acciones de gimnasio 56 px** (`.gym`: Empezar, Registrar serie, Seguir) |
| Steppers de peso y reps | botones de 56 px de alto, campo central de 76 px (68 px en reps) |
| Íconos de herramienta (indicaciones, video, descanso) | 48 × 48, radio 14 |
| Icon-btn del encabezado | 44 × 44, radio 12 |
| Navegación inferior | 4 ítems, 58 px de alto, pastilla de 54 × 30 detrás del ícono activo, padding inferior 24 px |
| Botón de chat flotante | 56 px, a 16 px del borde derecho y 98 px del fondo; insignia roja de 20 px |
| Franja superior (`.chev`) | 8 px, `repeating-linear-gradient(-55deg, var(--chev) 0 7px, transparent 7px 14px)` |
| Área táctil mínima | 44 px |

---

## 7. Elevación (Material, niveles 0 a 3) · D-48

| Nivel | Qué | Claro | Oscuro (sombra + tono) |
|---|---|---|---|
| 0 | Lienzo, filas dentro de una tarjeta, filas de biserie | sin sombra | sin sombra |
| 1 | `.a-card` (tarjetas comunes) | `0 1px 2px rgba(9,9,11,.06), 0 1px 3px 1px rgba(9,9,11,.04)` | `0 1px 2px rgba(0,0,0,.5), 0 1px 3px 1px rgba(0,0,0,.3)` sobre `#18181B` |
| 2 | Héroe, cabeceras de Historial y Progreso, tarjeta de serie, aviso de récord, ejercicio "próximo", mensaje del coach, grupo de biserie | `0 1px 2px rgba(9,9,11,.08), 0 3px 8px 2px rgba(9,9,11,.08)` | `0 1px 3px rgba(0,0,0,.55), 0 4px 10px 3px rgba(0,0,0,.35)`; tarjeta de serie sobre `#1F1F23` |
| 3 | Hojas, panel de descanso, toast, botón de chat | `0 6px 14px 4px rgba(9,9,11,.10), 0 2px 4px rgba(9,9,11,.12)` | `0 8px 18px 6px rgba(0,0,0,.45), 0 3px 6px rgba(0,0,0,.5)`; hoja y panel sobre `#232327` |

La navegación inferior usa `0 -1px 0 var(--line)` + nivel 2.

---

## 8. Récord: un solo dorado · D-45

Mismo diseño en los cuatro lugares: **fondo `--rec-bg`, texto `--rec-fg`, copa y borde `--rec-ic`**. Sin degradé, sin brillo y **sin círculo alrededor de la copa**.

| Lugar | Especificación |
|---|---|
| Aviso "¡Nuevo récord!" (ejercicio) | Tarjeta: radio 18, padding 14, borde 1,5 px `--rec-ic`, nivel 2. Copa de 22 px en `--rec-ic`, sin fondo. Título `a-t-bs` "¡Nuevo récord!", detalle `a-t-sec` ("47,5 kg × 8 · tu mejor marca en Press banca plano"; en Técnica suma " · 1RM estimado 60 kg (+2 kg)"). Botón cerrar 32 px. |
| Chip "PR" (Registradas, Historial) | `a-t-label`, fondo `--rec-bg`, texto `--rec-fg`, borde 1 px `--rec-ic`, copa de 11-12 px en `--rec-ic`. Historial: "1 PR". |
| Toast "Nuevo récord en …" | Fondo `--rec-bg`, texto `--rec-fg`, borde 1,5 px `--rec-ic`, copa de 16 px sin fondo. |
| Tarjeta "Nuevo PR · …" (cierre) | El cierre es siempre oscuro: usa los valores **oscuros** (`#2A2208`, `#F5D77A`, `#D4A72C`) en los dos temas. Borde 1,5 px, radio 16. |

---

## 9. Estados sin color (D-03)

| Estado | Cómo se marca |
|---|---|
| Seleccionado / actual | Relleno de tinta + texto invertido |
| Hecho, guardada | Check + chip `--ok-*` |
| Sugerencia "Repetí / Probá" | Caja `--ok-bg` con cuadrado `--ok-ic` y flecha arriba (Probá) o repetir (Repetí) |
| Advertencia (suscripción, molestia moderada o heredada) | Borde de tinta de 1,5-2 px + ícono |
| Sin señal | Chip con borde punteado "Sin señal · se guarda igual" (o "Sin señal · 3 en el teléfono") |
| Aproximación | Chip con borde punteado |
| Biserie | Contorno de tinta de 1,5 px alrededor del grupo |
| Drop set | Tarjeta de serie con borde punteado y trama diagonal `--hatch` |
| Molestia alta | Relleno rojo `--bad`. Alarma: `#7F1D1D` |
| Foco de teclado | Anillo de tinta de 2 px con 2 px de separación |

---

## 10. Fondos generativos (D-54, decisión D1 del PM)

Inspirados en *The Book of Shaders*: se generan con variables (semilla, escala, intensidad) y son **estáticos**. **Nunca** van detrás de la pantalla del ejercicio, del onboarding de nombre, del cuestionario ni del login: ahí el lienzo es liso.

Intensidad: `Sutil = 0.42`, `Media = 0.70`, `Mockup = 1`. Todos llevan un desvanecido hacia abajo:
`linear-gradient(180deg, <bg>00 0%, <bg>00 35%, <bg>B3 100%)` (oscuro: `99` en vez de `B3`).

| Fondo | Técnica | Implementación en la app | Variables |
|---|---|---|---|
| **Malla suave** (recomendado) | Gradiente de malla: 5 `radial-gradient` | **Solo CSS**, en un `<div aria-hidden>` fijo detrás del contenido | semilla → posiciones; escala → radio |
| Malla con grano | Malla + ruido fino | CSS + SVG en línea (`feTurbulence`) como `background-image` | semilla, escala |
| Ruido fractal | fbm (capítulo 13) | SVG `feTurbulence type="fractalNoise"` | semilla, escala → `baseFrequency` |
| Celdas | Voronoi (capítulo 12) | Canvas una sola vez al montar → `toDataURL()` → `background-image`, memorizado por (tema, semilla, escala, tamaño) | semilla, escala → cantidad de celdas |

Fórmulas exactas (son las de la referencia: `bgMesh`, `bgNoise`, `bgCells`, `bgValue` en `athlete-v7.html`; portar a `src/lib/athlete/fondo.ts`):

- **Generador de números:** `rng(seed)` = mulberry32 (está en la referencia). La malla usa `rng(seed*977)`; las celdas, `rng(seed*131)`.
- **Tonos** (r,g,b) en orden. Claro: `228,228,231` · `212,212,216` · `244,244,245` · `255,255,255` · `212,212,216`. Oscuro: `39,39,42` · `63,63,70` · `24,24,27` · `31,31,35` · `63,63,70`.
- **Malla:** para cada tono: `x = round(r()*100)`, `y = round(r()*100)`, `rad = round((38 + r()*24) * escala)`, `alpha = (claro .95 | oscuro .90) * intensidad` → `radial-gradient(at x% y%, rgba(tono,alpha) 0, rgba(tono,0) rad%)`. Las 5 capas, en ese orden, sobre el color `--bg`.
- **Grano:** `feTurbulence fractalNoise baseFrequency=.9 numOctaves=2 seed=<semilla>` + `feColorMatrix` que lleva el canal rojo a alfa con factor `(claro .08 | oscuro .10) * intensidad` y color negro (claro) o blanco (oscuro). Mosaico de 180 × 180.
- **Ruido fractal:** igual, con `baseFrequency = .006 / escala`, `numOctaves=4`, factor `(claro .30 | oscuro .38) * intensidad`, a tamaño completo (`center/100% 100%`).

Con la opción recomendada (Malla suave, semilla 3, escala 1, Sutil) el costo es cero: no hay JavaScript ni repintado.

---

## 11. Íconos

SVG en línea, trazo 2, `stroke-linecap/linejoin: round`, `viewBox 0 0 24 24`. La app ya tiene `src/components/athlete/icons.tsx`: se reusa y se agregan los que falten copiando los `path` del objeto `P` de la referencia (`dumbbell, history, trend, calendar, video, timer, alert, trophy, flame, hourglass, image, link, sun, moon, left, right, chev, down, up2, check, repeat, up, play, pause, info, x, plus, stop, phone, download, eye, eyeoff, copy, bulb, gear, logout, msg, note, pencil, swap, cloudoff, link2, clip`). Sin emojis en la interfaz (hoy hay 🎬 y 🏆).

---

## 12. Voz y copy

- Voseo en todo ("Registrá", "Probá", "Tenés"). Sin emojis. Botones con verbo.
- Números en `es-AR`: coma decimal ("62,5"), miles con punto ("16.938 kg"), signo menos real "−" (U+2212).
- El copy exacto de cada pantalla está en `02-pantallas.md`. Si una pantalla de la app tiene un texto que la referencia no tiene, se conserva en el mismo tono.
