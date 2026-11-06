# 08 · Fidelidad visual: que se vea como el canvas

> **Para:** `@PM-GOZster` → `@frontend-eng` (implementa) y `@qa-eng` (verifica).
> **Decisión del dueño del producto (6 nov):** la interfaz tiene que verse como el canvas "GOZSter — Review UX/UI". Este documento **reemplaza la decisión D1** de `00-PM.md`: se adopta la opción **B** (neutros zinc + primario negro) en lugar de la A (slate + azul de marca).
> **Referencias en este paquete:**
> - `objetivo/html/*.html` — cada pantalla del canvas como HTML estático con estilos inline. Se abre en el navegador y se inspecciona con DevTools para leer cualquier medida, color o tamaño exacto.
> - `objetivo/png/*.png` — las mismas pantallas a 2x.
> - `comparar/*.jpg` — objetivo (izquierda) e implementado en `main` (derecha), a la misma escala.
>
> **Qué manda en caso de diferencia:** el canvas manda en el **aspecto** (colores, tamaños, espaciado, jerarquía, qué elementos hay). `02-vistas.md` manda en **datos, reglas y textos** (por ejemplo, la definición de "Tasa de cobro"). Los valores numéricos del canvas son de ejemplo.

---

## 1. Por qué no se parece

| Causa | Qué pasó | Qué se hace ahora |
|---|---|---|
| **Paleta** | El handoff recomendaba conservar el azul de marca (D1 = A) y los agentes siguieron esa recomendación. El canvas usa zinc con primario negro. La diferencia salió del handoff, no de la implementación. | D1 = B. Tokens nuevos en §2. |
| **Estilo Material heredado** | Hay 174 clases `shadow-*` y 85 `uppercase` en `src/components/coach` y `src/components/ui`. Se conservaron sombras en cards, fondo gris de página con cards blancas, radios de 16 px, cuadraditos de color con íconos en los KPIs, etiquetas en MAYÚSCULAS y el ítem activo del menú en azul con borde. | Reglas del §3, que se aplican en todas las pantallas. |
| **Estructura no aplicada** | Cada pantalla conserva partes de la versión anterior (bandeja roja, filas con 3 botones, lista de rutinas en vez de cards, panel de clase debajo de la grilla). | Checklist por vista en el §4. |

**Dos cosas del canvas que NO se copian:**
1. En las pantallas secundarias el canvas muestra el menú lateral colapsado a 56 px solo para no repetirlo. **El menú correcto es el de Inicio** (240 px, agrupado), en todas las pantallas.
2. Los datos de ejemplo (Lucas, $767.000, "26 nov", la nota de Landmine…) son ilustrativos. Regla de `04-frontend.md §4`.

---

## 2. Tokens (reemplazan los de `globals.css`)

Paleta zinc de shadcn/ui. Los nombres de los tokens no cambian; cambian los valores.

```css
:root {
  --background: 0 0% 100%;            /* #FFFFFF  página y cards: mismo blanco */
  --foreground: 240 10% 3.9%;         /* #09090B */
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --primary: 240 5.9% 10%;            /* #18181B  botón primario, chip activo, día de hoy */
  --primary-foreground: 0 0% 98%;     /* #FAFAFA */
  --secondary: 240 4.8% 95.9%;        /* #F4F4F5 */
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;            /* #F4F4F5  fondo de Segmented, ítem activo del menú, avatar */
  --muted-foreground: 240 5.2% 33.9%; /* #52525B  texto secundario (pasa AA sobre #F4F4F5) */
  --subtle-foreground: 240 3.8% 46.1%;/* #71717A  NUEVO: metadatos 12 px, solo sobre blanco */
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --border: 240 5.9% 90%;             /* #E4E4E7 */
  --border-subtle: 240 4.8% 95.9%;    /* #F4F4F5  NUEVO: separadores entre filas */
  --input: 240 5.9% 90%;
  --ring: 240 5.9% 10%;
  --radius: 0.5rem;
  --sidebar: 0 0% 98%;                /* #FAFAFA */

  --success: 142 76% 36%;             /* #16A34A  puntos y barras */
  --warning: 32 95% 44%;              /* #D97706 */
  --destructive: 0 72% 51%;           /* #DC2626 */

  --success-soft: 138 76% 97%;        /* #F0FDF4 */
  --success-soft-foreground: 143 64% 24%; /* #166534 */
  --success-soft-border: 141 79% 85%; /* #BBF7D0 */
  --warning-soft: 48 100% 96%;        /* #FFFBEB */
  --warning-soft-foreground: 26 90% 37%;  /* #92400E */
  --warning-soft-border: 48 97% 77%;  /* #FDE68A */
  --danger-soft: 0 86% 97%;           /* #FEF2F2 */
  --danger-soft-foreground: 0 74% 42%;/* #B91C1C */
  --danger-soft-border: 0 96% 89%;    /* #FECACA */
  --neutral-soft: 240 4.8% 95.9%;     /* #F4F4F5 */
  --neutral-soft-foreground: 240 5.3% 26.1%; /* #3F3F46 */
  --neutral-soft-border: 240 5.9% 90%;/* #E4E4E7 */

  --act-funcional-bg: 240 4.8% 95.9%; /* #F4F4F5 */
  --act-funcional-border: 240 5.9% 90%;
  --act-boxeo-bg: 33 100% 96%;        /* #FFF7ED */
  --act-boxeo-border: 32 98% 83%;     /* #FED7AA */
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  --card: 240 10% 3.9%;
  --card-foreground: 0 0% 98%;
  --popover: 240 10% 3.9%;
  --popover-foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 240 5.9% 10%;
  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --subtle-foreground: 240 5% 64.9%;
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;
  --border: 240 3.7% 15.9%;
  --border-subtle: 240 3.7% 12%;
  --input: 240 3.7% 15.9%;
  --ring: 240 4.9% 83.9%;
  --sidebar: 240 5.9% 7%;
  /* *-soft: conservar los valores dark actuales de main (ya pasan contraste) */
}
```

Consecuencias que el PR tiene que resolver:
- `src/__tests__/bimodal-theme-toggle.spec.ts` fija los valores HSL actuales (`--primary: 221 83% 53%`, `--background: 210 20% 98%`, etc.). Se actualiza a los valores nuevos, sin relajar la aserción.
- `docs/MARCA.md`: agregar que la interfaz de Coach Studio usa neutros zinc; el Azul Atlántico queda para la landing y la Athlete App.
- Colores escritos a mano en componentes (`text-emerald-400`, `bg-rose-500/20`, `text-sky-…`, `bg-blue-…`): pasan a tokens.

---

## 3. Reglas visuales globales

Cada fila: valor objetivo → lo que hay hoy en `main`. Valores medidos sobre `objetivo/html/`.

| Elemento | Objetivo | Hoy |
|---|---|---|
| Fondo de página | `bg-background` (blanco), igual que las cards | gris `#F8FAFC` con cards blancas |
| Card, isla, tabla | `rounded-xl border bg-card`, **sin sombra** | sombra + radio 16 |
| Sombra | Solo en lo que flota: Segmented activo `0 1px 2px rgb(0 0 0/.08)`; Popover/Menu `0 8px 24px rgb(0 0 0/.08)`; Sheet `-8px 0 24px rgb(0 0 0/.08)` | en cards, KPIs y tablas |
| Etiquetas | Oración normal, 12/500 o 13/400. **Nunca MAYÚSCULAS** | "ALUMNOS", "OPERACIÓN", "EJERCICIO", "SERIES × REPS" |
| Encabezado de tabla | 12 px, 500, `text-muted-foreground`, `px-4 py-2.5`, `border-b` | mayúsculas, gris claro |
| Fila de tabla | `px-4 py-2.5`, separador `border-border-subtle` | separadores marcados, filas altas |
| H1 de página | 24/32, 600, `tracking-[-0.02em]` | 26–28, 700–800 |
| Subtítulo de página | 14, `text-muted-foreground` | igual (ok) |
| Título de card | 15/20, 600, sin ícono delante | íconos decorativos delante |
| Cifra de KPI | 28/32, 600, `tracking-[-0.02em]`, `tabular-nums` | 32+, 800 |
| Mono | Solo cifras (kg, $, horas, series × reps) | también fechas, "Hoy, 10:45", subtítulos |
| Botón primario | `h-9 px-3.5 rounded-lg bg-primary text-primary-foreground font-medium` (negro) | azul |
| Botón secundario | `h-9 px-3 rounded-lg border bg-background` | varios estilos |
| Botón de ícono | `size-9 rounded-lg border` o `ghost`, ícono 16 | variado |
| Una acción primaria por vista | Sí | 2–3 primarios azules visibles a la vez |
| Badge | `rounded-full border px-2 py-0.5 text-xs font-medium` + tono `*-soft` | con punto delante y sin borde, o en mayúsculas ("ACTIVO") |
| Segmented | contenedor `bg-muted p-[3px] rounded-lg`; ítem `h-[30px] px-3 rounded-md text-[13px]`; activo `bg-background font-medium shadow-sm` | ok en Inicio; en Agenda y Rutinas mezclado con botones |
| Chips de filtro | `h-8 px-2.5 rounded-lg text-[13px]`; activo `bg-muted border font-medium`; contador en `text-subtle-foreground` | chips azules |
| Pills de selección (días de rutina) | `h-8 px-3 rounded-full`; activo `bg-primary text-primary-foreground` | ok |
| Avatar | 32 px, `bg-muted`, iniciales 12/600 | ok |
| Íconos | SVG 16 px, stroke 2, `currentColor`; ninguno decorativo en títulos ni KPIs | cuadrados de color con íconos en KPIs; emojis |

### Sidebar (todas las pantallas)
- `w-60 bg-sidebar border-r`, `px-3 py-4`.
- Marca: cuadrado 32 px `rounded-lg bg-primary` con "G" 14/700 + "GOZSter" 14/600 + "Coach Studio" 12 `text-muted-foreground`. **Sin "Studio" en azul.**
- Grupos: título 12/400 `text-subtle-foreground` en oración ("Alumnos", "Operación", "Negocio"), `px-2 pb-1`; 16 px entre grupos.
- Ítem: `h-9 px-2 rounded-lg gap-2.5 text-sm text-neutral-soft-foreground`, ícono 16; **activo** `bg-muted text-foreground font-medium` (sin borde ni azul); contador a la derecha 12 px `text-subtle-foreground` (Cobros en `text-danger-soft-foreground` 500).
- Etiquetas: Inicio, Alumnos, Rutinas · Agenda, Ranking · Cobros, Métricas.
- Pie: separador `border-t pt-3`; "Vista del alumno"; botón de cuenta (avatar 28 + nombre 500 + "Sincronizado" 12). **Se quita la tarjeta "Sincronización / Cloud".**

### Topbar
- `h-14 border-b px-6`, nombre de página 14/500 a la izquierda; búsqueda 280 px `h-9 rounded-lg border` con `⌘K` en `kbd` 11 px; botón de tema `size-9 border`; acción primaria contextual (negra).

---

## 4. Checklist por vista

Cada ítem es binario: QA lo marca mirando `comparar/<vista>.jpg` y el HTML objetivo.

### 4.1 Inicio (`objetivo/html/Inicio.html`, `comparar/inicio.jpg`)
- [ ] Encabezado "Hola, {nombre}" + "{fecha} · {n} clases hoy, {m} alertas para revisar." y el Segmented de período a la derecha, en la misma fila.
- [ ] **4 KPIs en una fila** (`grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3`), card `p-4`, sin ícono, sin barra de progreso: etiqueta 13 + período 12 arriba a la derecha, cifra 28/600, subtítulo 13.
- [ ] Debajo, en una fila: "Para revisar hoy" (`flex-[2_1_460px]`) y "Clases de hoy" (`flex-[1_1_280px]`).
- [ ] "Para revisar hoy": header 15/600 + "Ordenado por prioridad" 12; filas `min-h-14 px-4 py-3` sin card propia, separadas por `border-b border-border-subtle`; badge + nombre 500 + detalle 13 + tiempo 12 + chevron. **Sin "Ver ficha →" en azul, sin EVA en mono suelto.** Máximo 5.
- [ ] No se renderiza la "Bandeja de alertas críticas" roja.
- [ ] "Clases de hoy": filas de 40 px con hora en mono 13, clase en curso con `bg-muted` + badge "Ahora", pie con avatares apilados + "7 sin entrenar hace +7 días" + "Escribirles".
- [ ] Directorio: card con toolbar de una línea (h2 + chips de filtro + "+ Actividad" punteado) y tabla con las columnas del objetivo. Sin el acordeón "Alumnos 15 ▲".
- [ ] Sin el botón flotante de chat.

### 4.2 Ficha del alumno (`objetivo/html/Ficha.html`, `comparar/ficha.jpg`)
- [ ] Breadcrumb "Alumnos / {nombre}" (13 px) en lugar de "← Volver".
- [ ] Cabecera: avatar 48, nombre 22/600, fila de badges (cuota, dolor activo, actividad) + email · "alumno desde". A la derecha, en este orden: ícono Personalizar, "Asignar rutina" (outline), "Enviar mensaje" (primario negro con ícono de mensaje), `⋯`. Nada más: sin "Salud: x/100", "Cargas Históricas", "Ver como Alumno", "Configurar Islas", "WhatsApp" ni emojis.
- [ ] "Últimas sesiones" a ancho completo: tarjetas de 150 px en scroll horizontal (fecha 12, "PR" verde, ejercicio 500, top set mono).
- [ ] **Dos columnas** debajo: izquierda (`flex-[2_1_560px]`) Rutina + Fuerza; derecha (`flex-[1_1_320px]`) Salud + Actividad + Membresía. Gap 16.
- [ ] Header de isla: título 15/600 en oración + meta 13 + badge + chevron a la derecha. **Sin ⠿ ni flechas** fuera de Personalizar; sin íconos delante del título.
- [ ] Rutina: Segmented "Rutina actual / Historial / Registros"; pills de día; tabla con encabezados en oración; botón ⇄ por fila; fila con dolor en `bg-warning-soft`.
- [ ] Fuerza: un solo 1RM (32/600) + "Fórmula Epley · ver detalle" + sparkline de peso; a la derecha lista con badges "↑ 41%" / "↓ 14%". **Sin la tarjeta Brzycki ni el heatmap de 52 semanas en esta vista.**
- [ ] Salud: Alert ámbar con título, detalle, Segmented Pendiente/Atendida/Resuelta y botón negro "Cambiar ejercicio"; nota con label y una sola ayuda; anamnesis en grilla 2 × 2 sin mayúsculas.
- [ ] Altura total a 1440 × 900 ≤ 2.300 px.

### 4.3 Cobros (`objetivo/html/Cobros.html`, `comparar/cobros.jpg`)
- [ ] H1 "Cobros" + "Noviembre 2026 · recibos internos, no fiscales."; a la derecha "Planes y precios" (outline) y "Registrar pago" (primario). Se quitan "Panel de Cobros & Pagos", el chip "Coach Lucía Ferraro" y "Nuevo Plan" azul.
- [ ] KPIs: cifra en `text-foreground` (no verde/naranja/rojo, salvo "Vencido" en `text-danger-soft-foreground`), sin íconos de color.
- [ ] Toolbar de una línea: búsqueda 260 px + chips "Todos 36 / Vencidos 7 / Por vencer 4 / Pagados 25" + "Columnas". El chip "Descuentos" pasa a filtro dentro de "Columnas" o se quita.
- [ ] Filas: una acción por estado ("Registrar pago" negro o "Ver recibo" outline) + `⋯`. Se quitan "Historial" y "Plan" sueltos (van al menú).
- [ ] Vencimiento: fecha + relativo ("hace 9 días") en lugar de "Día 11 anclado".
- [ ] Paginación "Vencidos primero · 15 de 36" + Anterior / Siguiente.

### 4.4 Agenda (`objetivo/html/Agenda.html`, `comparar/agenda.jpg`)
- [ ] Una sola fila de controles: título + "Semana 45…" a la izquierda; select "Todos los coaches", grupo ‹ Hoy ›, Segmented Día/Semana/Mes y "Nueva clase" (negro) a la derecha. Se quita el chip "Coach Lucía Ferraro".
- [ ] Grilla (`flex-[999_1_560px]`) y **panel de detalle a la derecha** (`flex-[1_1_320px]`), no debajo.
- [ ] Día de hoy: número en círculo negro, no columna azul.
- [ ] Bloque de clase: `rounded-lg p-1.5`, Funcional `bg-muted border`, Boxeo `bg-[#FFF7ED] border-[#FED7AA]`, seleccionada negra con texto blanco, cancelada borde punteado + tachado.
- [ ] Panel: título 18/600 "Funcional · 18:00" + badge; acciones "Anotar alumno" / "Cargar récords" / `⋯`; "Anotados (n)" con estado vacío punteado; "Ajustes de la clase" con 3 botones outline; "Cancelar clase" como link rojo.

### 4.5 Rutinas (`objetivo/html/Rutinas.html`, `comparar/rutinas.jpg`)
- [ ] Header con "Nueva rutina" en tamaño normal (`h-9`), no el botón grande azul.
- [ ] Se quitan las pestañas "Biblioteca & Plantillas / Constructor Visual".
- [ ] Una barra: Segmented de colección con contador + búsqueda + select de objetivo. Sin los chips azules "Todos / Fuerza / …".
- [ ] **Grilla de cards** (`repeat(auto-fill,minmax(260px,1fr)) gap-3`), no lista de filas: nombre 15/600, alumno 13, `⋯`, badges objetivo + vigencia, pie "n días · n ejercicios · hace t". Sin los botones "Abrir" / "Archivar" (van al `⋯`; la card entera abre).
- [ ] Nombres de rutina tal como los escribió el coach. (En los datos del stub vienen en mayúsculas, como "F Y H FER ROSALES"; eso es dato, no estilo, y no se toca).

### 4.6 Ranking (`objetivo/html/Ranking.html`, `comparar/ranking.jpg`)
- [ ] Título "Ranking funcional" sin 🏆 ni el badge "PR / PESO CORPORAL".
- [ ] Labels "Clase" y "Ejercicio" en oración, selects `h-9`; "Sumar alumno" como botón outline completo (hoy aparece cortado).
- [ ] Tabla de participantes con encabezados en oración, sin "ANOTADO" bajo cada nombre.
- [ ] "Guardado" en `success-soft` (verde suave), no outline gris.
- [ ] Rankings: dos cards neutras "Masculino" / "Femenino" con "n con récord"; filas posición mono · nombre · "20 kg × 3" · ratio 600. Sin 🥇, sin "(Hombres)/(Mujeres)", sin la columna "Peso corp." ni encabezados en mayúsculas.

### 4.7 Inicio móvil 390 (`objetivo/html/Movil.html`, `comparar/movil.jpg`)
- [ ] Topbar 56: logo 28 + nombre de página + Buscar + Notificaciones (44 × 44).
- [ ] "Hola, {nombre}" + fecha; KPIs en grilla 2 × 2 (cifra 20/600) **antes** de cualquier lista.
- [ ] "Para revisar hoy" y "Clases de hoy" como cards con filas de 44 px mínimo.
- [ ] Barra inferior de 5 ítems (ya existe ✅); activo en `foreground` 600, resto `subtle-foreground`.
- [ ] Nada se corta por el borde derecho.

---

## 5. "Vista del alumno": por qué no se puede entrar

Probé las tres entradas con el stub en vivo:

| Entrada | Qué pasa | Corrección |
|---|---|---|
| Menú lateral "Vista Atleta (PWA)" | Navega a `/athlete` con la sesión del coach. Aparece el onboarding de un alumno ("Hola, Fernando. Tu plan ya está listo.", paso 1 de 3) mientras detrás dice "Todavía no tenés un plan asignado". No hay forma de volver a Studio. | El link abre la **vista previa** que ya existe en la ficha ("Modo Entrenador: vista previa de…" con selector de alumno y "Volver a Studio"), con el primer alumno o el último visto. `/athlete` queda solo para cuentas de alumno. |
| Click en una alerta de "Para revisar hoy" | No pasa nada: las filas usan ids de alumnos demo que no existen en la base. | FIX-05 (datos en vivo + filas como `<button>`). |
| "Ver como Alumno" dentro de la ficha | ✅ Funciona: abre la vista previa del alumno. | Mover a `⋯` según el checklist de la ficha, sin romperlo. |

---

## 6. Issues visuales (listos para Multica)

> Heredan el gate y la revisión Selection. Cada PR adjunta su `comparar/<vista>.jpg` actualizado: captura de la rama a 1440 × 900 al lado del objetivo, con el stub en vivo.

### FIX-V1 · Tokens zinc (D1 = B)
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-tokens-zinc` · **Tamaño:** S
**Alcance:** `src/app/globals.css`, `tailwind.config.ts`, `src/__tests__/bimodal-theme-toggle.spec.ts`, `docs/MARCA.md`.
- GIVEN `globals.css` THEN contiene exactamente los valores del §2 en `:root` y `.dark`.
- GIVEN `bimodal-theme-toggle.spec.ts` THEN verifica los valores nuevos (misma cantidad de aserciones).
- GIVEN cualquier pantalla de Studio THEN fondo de página y cards son el mismo blanco y el botón primario es negro.

### FIX-V2 · Componentes base con el look del canvas
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-ui-look-canvas` · **Depende de:** FIX-V1 · **Tamaño:** M
**Alcance:** `src/components/ui/*`, `studio-shell.tsx`, `business-kpi-strip.tsx`, `islas/isla-card-shell.tsx`.
- GIVEN Card, KPI, isla y tabla THEN no tienen `box-shadow` y su radio es 12 px.
- GIVEN la app THEN no hay `uppercase` en etiquetas, encabezados de tabla ni títulos de grupo.
- GIVEN el sidebar THEN cumple el §3 (agrupado, ítem activo `bg-muted`, sin tarjeta "Sincronización", sin "Studio" en azul).
- GIVEN un KPI THEN no tiene ícono, chip de color ni barra de progreso.
- GIVEN un badge THEN tiene borde, es pill, está en oración y usa tono `*-soft`.

### FIX-V3 · Inicio igual al objetivo
**Owner:** `@frontend-eng` · **Depende de:** FIX-V2, FIX-05 · **Tamaño:** M — checklist §4.1.

### FIX-V4 · Ficha igual al objetivo
**Owner:** `@frontend-eng` · **Depende de:** FIX-V2 · **Tamaño:** L — checklist §4.2 (absorbe la parte visual de FIX-07).

### FIX-V5 · Cobros igual al objetivo
**Owner:** `@frontend-eng` · **Depende de:** FIX-V2 · **Tamaño:** M — checklist §4.3.

### FIX-V6 · Agenda igual al objetivo
**Owner:** `@frontend-eng` · **Depende de:** FIX-V2 · **Tamaño:** M — checklist §4.4.

### FIX-V7 · Rutinas y Ranking iguales al objetivo
**Owner:** `@frontend-eng` · **Depende de:** FIX-V2 · **Tamaño:** M — checklist §4.5 y §4.6.

### FIX-V8 · Inicio móvil igual al objetivo
**Owner:** `@frontend-eng` · **Depende de:** FIX-V3 · **Tamaño:** S — checklist §4.7.

### FIX-V9 · Entrada a la vista del alumno desde el menú
**Owner:** `@frontend-eng` · **Rama:** `fix/<#>-vista-alumno-preview` · **Tamaño:** S
**Alcance:** `studio-shell.tsx`, `coach-studio-view.tsx`.
- GIVEN un coach WHEN hace click en "Vista del alumno" del menú THEN se abre la vista previa con selector de alumno y "Volver a Studio", sin salir de `/studio`.
- GIVEN la vista previa THEN no se muestra el onboarding del alumno.
- GIVEN "Volver a Studio" THEN regresa a la pantalla de la que vino.

### FIX-V10 · QA de fidelidad visual
**Owner:** `@qa-eng` · **Tamaño:** S
- GIVEN cada PR de FIX-V1 a FIX-V9 THEN QA adjunta el `comparar/<vista>.jpg` regenerado y marca el checklist del §4 ítem por ítem.
- GIVEN `tests/e2e/regresion-visual-viewports.e2e.ts` THEN agrega aserciones de estilo computado para lo medible: sin `box-shadow` en `[data-testid*=kpi]` e islas, `border-radius: 12px`, `text-transform: none` en encabezados de tabla, color de fondo del botón primario `rgb(24, 24, 27)`.

**Orden:** FIX-V1 → FIX-V2 → (FIX-V3 · FIX-V4 · FIX-V5 · FIX-V6 · FIX-V7 en paralelo) → FIX-V8. FIX-V9 en cualquier momento.

**Recomendación:** aunque la prioridad ahora es lo visual, conviene hacer **FIX-02** en paralelo (es chico). Hoy cada cambio de estado de un dolor guarda una nota de ejemplo en la ficha clínica real de un alumno.
