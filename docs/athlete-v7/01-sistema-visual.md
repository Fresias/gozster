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

## 10. Fondo: malla asimétrica (D-54)

Un mesh gradient de zinc: cinco manchas elípticas, rotadas y muy desenfocadas, en posiciones **asimétricas**. Es **estático** (no se anima) y cambia un poco en cada apertura de la app. **Nunca** va detrás de la pantalla del ejercicio, del onboarding de nombre ni del cuestionario: ahí el lienzo es liso. Fuente exacta: `meshSvg`, `bgMesh`, `bgNoise` y `bgValue` en `referencia/athlete-v7.html` (expuestas como `window.gzFondo` para comparar). Portar a `src/lib/athlete/fondo.ts`.

### 10.1 Semilla

- Se elige **al azar en cada apertura de la app**, entero en `1..9999`, y se guarda en `sessionStorage` (`gozster-fondo-semilla`): no cambia al navegar ni al recargar dentro de la misma visita.
- La semilla **no** decide la composición: solo desvía cada mancha dentro de un rango acotado alrededor de su ancla. Por eso todas las variantes se parecen y aun así se nota el cambio.
- Generador: `rng(semilla * 977)` con mulberry32 (`rng` en la referencia). Con la semilla fija en 3 se reproducen exactamente las capturas.

### 10.2 Anclas (en orden; x, y en % de la pantalla; radios en % del ancho y del alto)

| # | x | y | radio x | radio y | rotación | tono claro (rgb) | tono oscuro (rgb) |
|---|---|---|---|---|---|---|---|
| 1 | 86 | 4 | 70 | 18 | −16° | 205,206,211 | 58,58,64 |
| 2 | 6 | 24 | 52 | 16 | 24° | 226,226,230 | 30,30,34 |
| 3 | 62 | 47 | 60 | 12 | −30° | 255,255,255 | 76,76,84 |
| 4 | 14 | 74 | 64 | 15 | 12° | 190,191,197 | 20,20,23 |
| 5 | 96 | 90 | 46 | 14 | 26° | 236,236,239 | 44,44,49 |

### 10.3 Desvío por semilla (rango acotado)

Para cada ancla, en orden, con `j(a) = (r()*2 − 1) * a`: x `± 10` puntos, y `± 7` puntos, radios `× (1 ± 0,18)` (cada uno con su propio `r()`), rotación `± 15°`. El orden de las llamadas a `r()` es: x, y, radio x, radio y, rotación.

### 10.4 Composición (de arriba hacia abajo)

1. Desvanecido: `linear-gradient(180deg, <bg>00 0%, <bg>00 55%, <bg>99 100%)` (oscuro: `80`).
2. Grano fino que disimula los escalones del degradé: SVG `feTurbulence type="fractalNoise" baseFrequency="0.90" numOctaves="2" seed=<semilla>` + `feColorMatrix` que lleva el canal rojo a alfa con factor **0,05 (claro) o 0,10 (oscuro)**, en negro (claro) o blanco (oscuro), mosaico de 180 × 180.
3. La malla: SVG `viewBox="0 0 390 844" preserveAspectRatio="none"` con las 5 elipses (`transform="rotate(r cx cy)"`) dentro de un `<g>` con `filter: feGaussianBlur stdDeviation=46` (región del filtro `−50% / 200%`) y `opacity = min(1, 0,4 + intensidad)`. Intensidad Sutil = 0,42 → opacidad 0,82. Se dibuja a `center / 100% 100% no-repeat`.
4. Color de `--a-bg`.

El SVG va como `data:image/svg+xml,` codificando `%` → `%25` **primero**, después `#` → `%23`, `<` → `%3C`, `>` → `%3E`. (Si `%` no se codifica, el navegador descarta la imagen sin dar error.)

### 10.5 Implementación

- `fondo-generativo.tsx`: un `<div aria-hidden>` `position: fixed; inset: 0; z-index: 0; pointer-events: none` detrás del contenido, con `background` = la cadena del §10.4. Se calcula una vez por (tema, semilla) con `useMemo`.
- Costo: un SVG estático pintado una vez. Sin JavaScript por cuadro, sin animación, funciona sin red.
- De noche puede verse algo de escalonado en pantallas de 8 bits. Si en un teléfono real se nota, subir el grano oscuro hasta 0,14 (anotarlo en el PR).

## 11. Íconos

SVG en línea, trazo 2, `stroke-linecap/linejoin: round`, `viewBox 0 0 24 24`. La app ya tiene `src/components/athlete/icons.tsx`: se reusa y se agregan los que falten copiando los `path` del objeto `P` de la referencia (`dumbbell, history, trend, calendar, video, timer, alert, trophy, flame, hourglass, image, link, sun, moon, left, right, chev, down, up2, check, repeat, up, play, pause, info, x, plus, stop, phone, download, eye, eyeoff, copy, bulb, gear, logout, msg, note, pencil, swap, cloudoff, link2, clip`). Sin emojis en la interfaz (hoy hay 🎬 y 🏆).

---

## 12. Voz y copy

- Voseo en todo ("Registrá", "Probá", "Tenés"). Sin emojis. Botones con verbo.
- Números en `es-AR`: coma decimal ("62,5"), miles con punto ("16.938 kg"), signo menos real "−" (U+2212).
- El copy exacto de cada pantalla está en `02-pantallas.md`. Si una pantalla de la app tiene un texto que la referencia no tiene, se conserva en el mismo tono.
