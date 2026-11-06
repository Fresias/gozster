# 01 · Sistema visual (tokens, componentes, copy)

> **Para:** `@frontend-eng` (implementa) y `@qa-eng` (verifica). Sugerido como skill de Multica "gozster-ui".
> **Supuesto:** decisión D1 = A (paleta de marca + reglas estructurales shadcn). Si el PM elige B, cambian solo los valores de §1.1; todo lo demás se mantiene.

---

## 1. Tokens

### 1.1 Cambios en `src/app/globals.css`

Se mantienen todos los tokens actuales. Se **cambian** dos y se **agregan** los tonos suaves de estado (fondo, texto y borde para badges y alertas) que hoy se escriben a mano con clases como `bg-emerald-500/20 text-emerald-400`.

```css
:root {
  /* CAMBIA */
  --radius: 0.5rem;                       /* era 0.875rem. rounded-lg = 8px, rounded-xl = 12px */

  /* AGREGA — estados suaves (texto ≥ 4,5:1 sobre su fondo) */
  --success-soft: 138 76% 97%;            /* #F0FDF4 */
  --success-soft-foreground: 143 64% 24%; /* #166534 */
  --success-soft-border: 141 79% 85%;     /* #BBF7D0 */
  --warning-soft: 48 100% 96%;            /* #FFFBEB */
  --warning-soft-foreground: 26 90% 37%;  /* #92400E */
  --warning-soft-border: 48 97% 77%;      /* #FDE68A */
  --danger-soft: 0 86% 97%;               /* #FEF2F2 */
  --danger-soft-foreground: 0 74% 42%;    /* #B91C1C */
  --danger-soft-border: 0 96% 89%;        /* #FECACA */
  --neutral-soft: 210 20% 96%;            /* #F1F5F9 */
  --neutral-soft-foreground: 215 25% 27%; /* #334155 */
  --neutral-soft-border: 214 32% 91%;     /* #E2E8F0 */
  --sidebar: 210 20% 98%;                 /* #F8FAFC */
  --overlay: 222 47% 11% / 0.4;           /* scrim de Sheet y Dialog */
}

.dark {
  --radius: 0.5rem;
  --success-soft: 145 80% 10%;            /* #052E16 */
  --success-soft-foreground: 142 69% 58%; /* #4ADE80 */
  --success-soft-border: 143 64% 24%;
  --warning-soft: 21 92% 14%;             /* #451A03 */
  --warning-soft-foreground: 43 96% 56%;  /* #FBBF24 */
  --warning-soft-border: 26 90% 37%;
  --danger-soft: 0 75% 15%;               /* #450A0A */
  --danger-soft-foreground: 0 91% 71%;    /* #F87171 */
  --danger-soft-border: 0 74% 42%;
  --neutral-soft: 217 33% 20%;
  --neutral-soft-foreground: 215 20% 80%;
  --neutral-soft-border: 217 33% 28%;
  --sidebar: 222 47% 9%;
  --overlay: 0 0% 0% / 0.6;
}
```

En `tailwind.config.ts` agregar los colores `success-soft`, `warning-soft`, `danger-soft`, `neutral-soft` (cada uno con `DEFAULT`, `foreground`, `border`) y `sidebar`, con el mismo patrón que `success`.

### 1.2 Reglas de uso del color

| Uso | Token | Nunca |
|---|---|---|
| Acción primaria (1 por pantalla) | `bg-primary text-primary-foreground` | Dos botones primarios visibles a la vez |
| Texto de estado | `*-soft-foreground` sobre `*-soft` | `text-success` / `text-warning` como texto: `#10B981` y `#F59E0B` sobre blanco dan 2,5:1 y 2,1:1 |
| Punto o barra de estado | `bg-success`, `bg-warning`, `bg-destructive` | Punto sin palabra al lado |
| Actividad (Funcional, Boxeo) | `act-*` existentes | Usarlos para estados |
| Metadatos | `text-muted-foreground` | Grises más claros que `muted-foreground` para texto |
| Género en Ranking | `neutral-soft` | Rosa/celeste |

### 1.3 Sombras

| Elemento | Antes | Después |
|---|---|---|
| Card, isla, KPI, tabla | `shadow-m3-1/2` + borde | Solo `border` (1 px `--border`), sin sombra |
| Popover, DropdownMenu, Tooltip | variado | `shadow-md` (0 8px 24px rgb(0 0 0 / .08)) |
| Sheet, Dialog | variado | `shadow-xl` + scrim `--overlay` |

`shadow-m3-*` queda deprecado: no usar en código nuevo y removerlo cuando no tenga consumidores.

### 1.4 Radios

| Elemento | Clase | px |
|---|---|---|
| Card, isla, tabla contenedora, Sheet | `rounded-xl` | 12 |
| Button, Input, Select, Tabs, Menu item | `rounded-lg` | 8 |
| Item interno de Segmented | `rounded-md` | 6 |
| Badge, Avatar, chip de día | `rounded-full` | — |

### 1.5 Tipografía

- Familia: **Geist** y **Geist Mono** con `next/font/google` en `src/app/layout.tsx` (incluido en Next, no agrega dependencia). Exponer como `--font-sans` y `--font-mono` y mapear en `tailwind.config.ts → fontFamily`.
- Mono **solo** para cifras (kg, $, reps, horarios, series × reps). Nunca para títulos, fechas en texto ni párrafos.
- Toda cifra en tabla o KPI lleva `tabular-nums`.

| Rol | Tamaño / interlineado | Peso | Tracking |
|---|---|---|---|
| H1 de página | 24 / 32 | 600 | -0.02em |
| Valor de KPI | 28 / 32 | 600 | -0.02em |
| Título de card / isla | 15 / 20 | 600 | 0 |
| Cuerpo | 14 / 20 | 400 | 0 |
| Secundario / tabla meta | 13 / 18 | 400 | 0 |
| Etiqueta, badge, encabezado de tabla | 12 / 16 | 500 | 0 (sin MAYÚSCULAS) |

Prohibido: `font-black`, MAYÚSCULAS sostenidas en títulos, tamaños de 10 y 11 px para texto que se lee (solo se permite 11 px en la barra inferior móvil).

### 1.6 Espaciado y layout

- Grilla de 4 px. Padding de página 24 (16 en móvil). Padding de card 16. Gaps: 8 entre controles, 12 entre cards, 16–24 entre secciones.
- Sidebar 240 px (colapsado 56 px). Topbar 56 px. Contenido `max-w-[1180px]`.
- Alto de controles: 36 px por defecto, 32 px en toolbars de tabla. En móvil, área táctil mínima 44 × 44.

---

## 2. Componentes

Ubicación: `src/components/ui/`. Con D2 = A (recomendada): API de shadcn implementada en casa, sin dependencias — DropdownMenu y Tooltip sobre `popover.tsx`, Sheet y Dialog sobre `<dialog>` nativo (`showModal()`), íconos SVG inline. Con D2 = B: misma API envolviendo Radix. **Los consumidores no cambian** entre A y B.

### 2.1 Button (existe: `button.tsx` — ajustar variantes)

| Prop | Valores | Default |
|---|---|---|
| `variant` | `default` (primary), `outline`, `secondary`, `ghost`, `destructive`, `link` | `default` |
| `size` | `sm` (32), `default` (36), `lg` (40), `icon` (36 × 36), `icon-sm` (32 × 32) | `default` |
| `asChild` | boolean | false |

Estados: hover (−4 % luminosidad), `focus-visible` con `ring-2 ring-ring ring-offset-2`, `disabled` con opacidad .5 y `cursor-not-allowed`, `aria-busy` con spinner a la izquierda. `size="icon"` **exige** `aria-label`.

### 2.2 StatusBadge (nuevo; reemplaza semáforos y badges ad hoc)

```ts
type Tone = "success" | "warning" | "danger" | "neutral" | "info";
interface StatusBadgeProps { tone: Tone; children: string; dot?: boolean; title?: string }
```
- `children` es obligatorio: siempre hay palabra.
- Estilo: `rounded-full border px-2 py-0.5 text-xs font-medium` + `bg-{tone}-soft text-{tone}-soft-foreground border-{tone}-soft-border`.
- Mapeos canónicos:

| Dominio | Valor | Tone | Texto |
|---|---|---|---|
| Cuota | al día | success | "Al día" |
| Cuota | vence en ≤ 5 días | warning | "Vence en {n} d" |
| Cuota | vencida | danger | "Vencida" |
| Rutina | vigente | success | "Vigente · {n} días" |
| Rutina | vence en ≤ 5 días | warning | "Vence en {n} d" |
| Rutina | sin rutina | neutral | "Sin rutina" |
| Dolor | EVA 1–3 | neutral | "Dolor leve" |
| Dolor | EVA 4–6 | warning | "Dolor moderado" |
| Dolor | EVA 7–10 o síntoma de alarma | danger | "Dolor alto" |
| Pago | pagado / pendiente / vencido | success / warning / danger | "Pagado" / "Pendiente" / "Vencido" |
| Progresión | sube / baja | success / danger | "↑ {pct}%" / "↓ {pct}%" |

### 2.3 Card (existe: `card.tsx` — quitar sombra)
Slots: `CardHeader` (`title`, `description?`, `actions?`), `CardContent`, `CardFooter`. Sin sombra; `rounded-xl border bg-card`.

### 2.4 Isla (refactor de `isla-card-shell.tsx`)

```ts
interface IslaProps {
  id: IslaId; title: string; meta?: ReactNode; badge?: ReactNode;
  collapsed: boolean; onToggleCollapse(): void;
  editing: boolean;                       // modo Personalizar
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>;
  children: ReactNode;
}
```
- Cabecera de 48 px: [asa ⠿ solo si `editing`] título · meta · badge · [botón chevron 32 × 32 a la derecha].
- Chevron: `aria-expanded`, `aria-controls`, `aria-label="Mostrar u ocultar {title}"`. Rota 180° al colapsar.
- `editing = true`: borde `border-dashed border-muted-foreground/50`, aparece el asa (`aria-roledescription="asa para mover"`), y las flechas de mover pasan al menú de la isla para teclado. Fuera de edición no hay flechas ni asa.
- Se eliminan los botones de texto `[-]`, `[+]` y "Colapsar Feed".

### 2.5 Tabs y Segmented (existe `tabs.tsx`)
- **Tabs**: navegan entre vistas del mismo objeto (Rutina actual / Historial / Registros). `role="tablist"`, flechas izquierda/derecha mueven foco.
- **Segmented**: elige un valor (Semana / Mes / Trimestre; estado de alerta). Contenedor `bg-muted p-[3px] rounded-lg`; ítem activo `bg-background shadow-sm font-medium`. `role="group"` + `aria-pressed` por ítem.

### 2.6 DataTable (nuevo)

```ts
interface DataTableProps<T> {
  columns: Array<{ id: string; header: string; cell(row: T): ReactNode; sortable?: boolean; align?: "left" | "right"; hideBelow?: "md" | "lg" }>;
  rows: T[]; getRowId(row: T): string;
  rowHref?(row: T): string;               // fila navegable (primera celda es <a>)
  rowActions?(row: T): Array<{ label: string; onSelect(): void; destructive?: boolean }>;
  primaryAction?(row: T): { label: string; onClick(): void; variant: "default" | "outline" } | null;
  toolbar?: ReactNode;                    // búsqueda + filtros en UNA fila
  pageSize?: number;                      // default 15
  emptyState: ReactNode; loading?: boolean; error?: string;
  defaultSort?: { id: string; dir: "asc" | "desc" };
}
```
- Contenedor `rounded-xl border overflow-hidden`; tabla dentro de `overflow-x-auto` con `min-width`.
- Encabezado 12 px, `text-muted-foreground`, borde inferior; filas con borde `border-b` muy suave, hover `bg-muted/50`.
- Columna final: `primaryAction` (si hay) + botón `…` (`aria-label="Acciones para {nombre}"`) que abre DropdownMenu con `rowActions`.
- Pie: "Mostrando {n} de {total}" + Anterior / Siguiente (deshabilitados en los extremos).
- Carga: 5 filas skeleton. Error: Alert `danger` dentro del contenedor con "Reintentar".

### 2.7 DropdownMenu (nuevo)
Trigger con `aria-haspopup="menu"` y `aria-expanded`. Ítems 32 px de alto, separadores, ítem destructivo en `text-destructive` al final. Cierra con Escape y click afuera; flechas mueven el foco.

### 2.8 Sheet (nuevo; panel lateral)
`side="right"`, ancho 400 px (100 % en < 480 px). Scrim `--overlay`. Header: título 18/600 + descripción 13 + botón cerrar `aria-label="Cerrar"`. Footer fijo con Cancelar (`outline`) y acción primaria. Foco atrapado; Escape cierra; al cerrar el foco vuelve al disparador. `role="dialog" aria-modal="true" aria-labelledby`.

### 2.9 Alert (nuevo)
`tone: "warning" | "danger" | "info"`, `title`, `description?`, `actions?`. `role="alert"` solo si aparece por una acción del usuario; si está desde la carga, `role="status"`. Ícono a la izquierda (`alert-triangle`, `info`).

### 2.10 KpiCard (refactor de `business-kpi-strip.tsx`)

```ts
interface KpiCardProps { label: string; value: string; period: string; sub?: string; href?: string; source: string; testId: string }
```
- `period` siempre visible arriba a la derecha ("nov", "hoy", "+7 días").
- `source` se muestra en un Tooltip sobre el label ("Calculado con obtener_kpis_negocio, 1–30 nov").
- Sin ícono decorativo grande, sin barras de progreso decorativas.

### 2.11 EmptyState (nuevo)
`icon`, `title`, `description` (dice **por qué** está vacío), `primaryAction?`, `secondaryAction?`. Borde punteado, centrado, padding 48/24.

### 2.12 Tooltip, Avatar, Skeleton
- Tooltip: delay 300 ms, máx 280 px, nunca contiene la única forma de acceder a una acción.
- Avatar: iniciales 12/600 sobre `bg-muted`, 32 px en tablas, 48 px en cabecera de ficha.
- Skeleton: `bg-muted animate-pulse rounded-md`.

---

## 3. Íconos

- SVG inline en `src/components/ui/icons.tsx` (un componente por ícono, `aria-hidden` por defecto, prop `size`), con paths de Lucide y su aviso de licencia ISC al inicio del archivo. Stroke 2, `currentColor`, 16 px en controles y 18 px en navegación. No instalar `lucide-react`: hay tests que lo prohíben (salvo D2 = B). `src/components/athlete/icons.tsx` ya sigue este patrón; reutilizar lo que sirva.
- **Prohibido** emoji como ícono (⚡ 🏆 📋 ⏱️ 🔄 💳 🚨 👁️ ⚙️ 📱 💬 🎯 etc.) en Coach Studio.
- Mapa: Inicio `home`, Alumnos `users`, Rutinas `clipboard-check`, Agenda `calendar`, Ranking `trophy`, Cobros `credit-card`, Métricas `line-chart`, Vista del alumno `smartphone`, Mensaje `message-square`, Cambiar ejercicio `arrow-left-right`, Personalizar `layout-dashboard`, Más acciones `more-horizontal`, Alerta `alert-triangle`, Colapsar `chevron-down`, Asa `grip-vertical`, Buscar `search`, Noche `moon`, Día `sun`.

---

## 4. Glosario de copy (reemplazos obligatorios)

| Actual | Nuevo | Dónde |
|---|---|---|
| "GOZSter Studio · Executive Workspace • M3 Edition" | "GOZSter" + "Coach Studio" | `studio-shell.tsx` |
| "Panel Profesional de Alto Rendimiento" | (eliminar; la topbar muestra el nombre de la página) | `studio-shell.tsx` |
| "Sincronización GOZS · GOZS Cloud · Datos al día con GOZS Cloud." | "Sincronizado" bajo el nombre del coach; solo se destaca si falla: "Sin conexión · reintentando" | `studio-shell.tsx` |
| "Atletas & Rutinas" / "Rutinas & Constructor" | "Alumnos" / "Rutinas" | sidebar |
| "Métricas & Retención" / "Cobros & Pagos" / "Agenda de Clases" / "Vista Atleta (PWA)" | "Métricas" / "Cobros" / "Agenda" / "Vista del alumno" | sidebar |
| "Coach Studio" + "Gestión operativa táctil de atletas, semáforos de salud M3…" | "Hola, {nombre}" + "{fecha} · {n} clases hoy, {m} alertas para revisar." | Inicio |
| "Bandeja de alertas críticas" | "Para revisar hoy" | Inicio |
| "ATLETA (COLUMNA MATRIZ)" / "VIGENCIA RUTINA" | "Alumno" / "Rutina" | directorio |
| "Nota: Semáforos Material Design 3… Touch targets ≥ 48px…" | (eliminar) | `coach-studio-view.tsx` |
| "Timeline biomecánico ribbon" | "Últimas sesiones" | ficha |
| "Bitácora omnicanal (Feed)" / "Actividad en tiempo real" | "Actividad" | ficha |
| "Workbench de entrenamiento activo" / "Matriz diaria & micro-tablas" | "Rutina" | ficha |
| "Telemetría de fuerza & sobrecarga" / "Epley / Brzycki" | "Fuerza y progreso" | ficha |
| "Clínica, anamnesis & red flags" / "Sin red flags" | "Salud" / badge derivado de alertas activas | ficha |
| "Sustitución Quirúrgica" / "Quick Swap" | "Cambiar ejercicio" | ficha, bandeja |
| "Sustitución Biomecánica (ADR-002)" | "Ejercicio cambiado" | feed |
| "Gestión comercial, membresía & configuración · Administración" | "Membresía" | ficha |
| "Modo Canvas" / "Configurar Islas 6/6" | ícono "Personalizar" (`aria-label="Personalizar el orden de las secciones"`) | ficha |
| "↑ Sobrecarga Progresiva Verificada" | "{n} de {m} en progresión" (derivado) | ficha |
| "Salud: 86.5/100" | (eliminar de la cabecera; no tiene definición visible) | ficha |
| "Ver flujo Sankey →" | "Ver detalle" | Inicio |
| "Asignar Urgente →" | "Asignar rutina" | Métricas |
| "Panel de Cobros & Pagos" / "Coach Studio - Control de cuotas…" | "Cobros" / "{Mes año} · recibos internos, no fiscales." | Cobros |
| "Flujo de Facturación & Cobranza" / "Facturación Potencial" | "Ingresos" / "Facturado" | Ingresos |
| "+ 10 h / sin clases (clic para expandir)" | (eliminar; el rango horario se ajusta solo) | Agenda |
| "Controles de Clase (Cupo flexible & Horario)" | "Ajustes de la clase" | Agenda |
| "Ranking PRs" | "Cargar récords" | Agenda |
| "Biblioteca & Plantillas" / "Constructor Visual" / "Gestión unificada 2×1…" | (tabs de colección + botón "Nueva rutina") | Rutinas |
| "Ranking Masculino (Hombres)" / "Ranking Femenino (Mujeres)" | "Masculino" / "Femenino" | Ranking |
| "({remitente_id.slice(0,8)})" | (eliminar; solo nombre y rol) | chat |

Tono: segunda persona con voseo, frases cortas, sin mayúsculas sostenidas, sin signos de exclamación en la interfaz de trabajo.
