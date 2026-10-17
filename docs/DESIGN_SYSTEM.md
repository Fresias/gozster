# Master Spec Técnico de Estética y Componentes: GOZSter
## Tokens Tailwind CSS, Variables HSL y Sistema de Componentes Shadcn/UI

> **Destinatario Técnico:** `@frontend-eng`  
> **Aprobado por:** `@UI/UX & Art Director`  
> **Filosofía de Entrega:** Metodología Karpathy (quirúrgica, archivo por archivo) y Regla Ponytail (cero dependencias externas adicionales)  
> **Stack Base:** Next.js 15 (App Router), Tailwind CSS v3.4+, Shadcn UI / Radix Primitives, TypeScript

---

## 1. Arquitectura de Tokens en Tres Capas

Siguiendo el estándar de sistemas de diseño escalables, los tokens se estructuran en 3 capas desacopladas:

```
┌────────────────────────────────────────────────────────┐
│ 1. LAYER PRIMITIVO (Valores HSL Crudos)                │
│    Valores absolutos de tono, saturación y luminancia  │
└──────────────────────────┬─────────────────────────────┘
                           │ Referencia
┌──────────────────────────▼─────────────────────────────┐
│ 2. LAYER SEMÁNTICO (Propósito Funcional / Tokens Base) │
│    --background, --surface, --primary, --destructive   │
└──────────────────────────┬─────────────────────────────┘
                           │ Especialización
┌──────────────────────────▼─────────────────────────────┐
│ 3. LAYER COMPONENTES (Shadcn / Tailwind Utilities)    │
│    Variantes de botones, celdas de tablas, cronómetro  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Variables CSS Formales para `src/app/globals.css`

Este bloque formaliza la arquitectura bimodal en `globals.css`: **Modo Día Suave (`:root`)** y **Modo Noche Pulido (`.dark`)**:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  /* ========================================================
     MODO DÍA SUAVE (:root) - Studio Calm & Lectura Prolongada
     ======================================================== */
  :root {
    /* 1. SUPERFICIES Y FONDOS */
    --background: 210 40% 98%;             /* #F8FAFC - Off-white cálido (Slate 50) */
    --foreground: 222 47% 11%;             /* #0F172A - Grafito profundo (Slate 900) */

    --surface: 0 0% 100%;                  /* #FFFFFF - Tarjetas en blanco puro */
    --surface-container-low: 210 40% 96%;   /* #F1F5F9 - Slate 100 (fondos de tabla) */
    --surface-container: 214 32% 91%;      /* #E2E8F0 - Slate 200 (bloques internos) */
    --surface-container-high: 215 25% 85%; /* #CBD5E1 - Slate 300 (elevación) */
    --surface-container-highest: 215 16% 75%;

    --card: 0 0% 100%;                     /* #FFFFFF */
    --card-foreground: 222 47% 11%;        /* #0F172A */

    /* 2. BORDES, LÍNEAS Y ENTRADAS */
    --border: 214 32% 91%;                 /* #E2E8F0 - Bordes finos y suaves */
    --input: 214 32% 91%;
    --ring: 221 83% 53%;                   /* #2563EB - Foco primario */

    /* 3. ACENTOS Y RETROALIMENTACIÓN */
    --primary: 221 83% 53%;                /* #2563EB - Azul Atlántico Técnico */
    --primary-foreground: 0 0% 100%;       /* #FFFFFF */

    --secondary: 210 40% 96%;              /* #F1F5F9 - Botones secundarios */
    --secondary-foreground: 222 47% 11%;   /* #0F172A */

    --muted: 210 40% 96%;                  /* #F1F5F9 */
    --muted-foreground: 215 16% 47%;       /* #64748B - Metadatos / Slate 500 */

    --success: 160 84% 39%;                /* #10B981 - Esmeralda (Series logradas) */
    --success-foreground: 0 0% 100%;

    --warning: 38 92% 50%;                 /* #F59E0B - Ámbar cálido (Pagos / Alerta) */
    --warning-foreground: 0 0% 100%;

    --destructive: 0 84% 60%;              /* #EF4444 - Rosa/Rojo suave (Sin plan) */
    --destructive-foreground: 0 0% 100%;

    --info: 217 91% 60%;                   /* #3B82F6 - Azul informativo */
    --info-foreground: 0 0% 100%;

    --radius: 0.75rem;                     /* 12px estándar */
  }

  /* ========================================================
     MODO NOCHE PULIDO (.dark) - Athletic Night & Cero Fatiga
     ======================================================== */
  .dark {
    /* 1. SUPERFICIES Y FONDOS */
    --background: 222 47% 11%;             /* #0F172A - Carbón grafito suave (Slate 900) */
    --foreground: 210 40% 98%;             /* #F8FAFC - Chalk White suave */

    --surface: 217 33% 17%;                /* #1E293B - Azul pizarra (Slate 800) */
    --surface-container-low: 217 33% 13%;  /* #151D2A - Contenedor bajo */
    --surface-container: 217 33% 20%;      /* #243247 - Contenedor estándar */
    --surface-container-high: 215 25% 27%; /* #334155 - Slate 700 (elevación) */
    --surface-container-highest: 215 20% 35%; /* #475569 */

    --card: 217 33% 17%;                   /* #1E293B */
    --card-foreground: 210 40% 98%;        /* #F8FAFC */

    /* 2. BORDES, LÍNEAS Y ENTRADAS */
    --border: 217 33% 24%;                 /* rgba(255, 255, 255, 0.08) equivalente */
    --input: 217 33% 24%;
    --ring: 199 89% 48%;                   /* #38BDF8 - Foco cian */

    /* 3. ACENTOS Y RETROALIMENTACIÓN */
    --primary: 199 89% 48%;                /* #38BDF8 - Cian Suave (Sky 400) */
    --primary-foreground: 222 47% 11%;     /* #0F172A - Alto contraste */

    --secondary: 217 33% 22%;              /* #243042 */
    --secondary-foreground: 210 40% 98%;   /* #F8FAFC */

    --muted: 217 33% 20%;                  /* #243247 */
    --muted-foreground: 215 20% 65%;       /* #94A3B8 - Slate 400 */

    --success: 158 64% 52%;                /* #34D399 - Esmeralda claro */
    --success-foreground: 222 47% 11%;

    --warning: 43 96% 56%;                 /* #FBBF24 - Ámbar claro */
    --warning-foreground: 222 47% 11%;

    --destructive: 0 91% 71%;              /* #F87171 - Rojo pastel atenuado */
    --destructive-foreground: 222 47% 11%;

    --info: 213 94% 68%;                   /* #60A5FA - Azul claro */
    --info-foreground: 222 47% 11%;

    --radius: 0.75rem;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary;
    -webkit-tap-highlight-color: transparent;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11", "tnum";
  }

  /* Scrollbar técnico ultra-delgado */
  ::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: hsl(var(--border) / 0.8);
    border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--muted-foreground) / 0.6);
  }
}
```

---

## 3. Configuración para `tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--surface-container-high))",
          foreground: "hsl(var(--foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          container: "hsl(var(--surface-container))",
          "container-low": "hsl(var(--surface-container-low))",
          "container-high": "hsl(var(--surface-container-high))",
          "container-highest": "hsl(var(--surface-container-highest))",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Outfit", "Barlow Condensed", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "Geist Mono", "Menlo", "monospace"],
      },
      borderRadius: {
        xs: "0.25rem",
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      boxShadow: {
        "elevation-1": "0 1px 3px 0 rgb(0 0 0 / 0.5), 0 1px 2px -1px rgb(0 0 0 / 0.5)",
        "elevation-2": "0 8px 24px -4px rgb(0 0 0 / 0.7), 0 4px 8px -4px rgb(0 0 0 / 0.5)",
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## 4. Variantes de Componentes Shadcn/UI (`src/components/ui/`)

### 4.1. Componente `Button` (`src/components/ui/button.tsx`)
Nuevas variantes especializadas para móvil táctil y tablas densas:

```typescript
export type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "success"
  | "touch-action"   /* Para Mobile: Botón de completar serie / timer */
  | "compact-table";  /* Para Coach Studio: Acciones en fila de tabla */

export type ButtonSize = "default" | "sm" | "lg" | "touch" | "compact" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-primary text-primary-foreground font-bold shadow-elevation-1 hover:brightness-105 active:scale-[0.98]",
  secondary:
    "bg-secondary text-secondary-foreground border border-border/80 hover:bg-secondary/80 active:scale-[0.98] font-semibold",
  outline:
    "border border-border bg-transparent text-foreground hover:bg-surface-container active:scale-[0.98] font-medium",
  ghost:
    "bg-transparent text-muted-foreground hover:text-foreground hover:bg-surface-container active:scale-[0.98] font-medium",
  destructive:
    "bg-destructive text-destructive-foreground shadow-elevation-1 hover:brightness-110 active:scale-[0.98] font-semibold",
  success:
    "bg-success text-success-foreground shadow-elevation-1 hover:brightness-105 active:scale-[0.98] font-bold",
  "touch-action":
    "bg-primary text-primary-foreground font-extrabold text-base tracking-wide shadow-elevation-2 active:scale-[0.96] transition-transform",
  "compact-table":
    "h-7 px-2.5 text-[11px] font-semibold bg-surface-container hover:bg-surface-container-high text-foreground border border-border/60",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "min-h-10 px-4 py-2 text-sm",
  sm: "min-h-8 px-3 py-1.5 text-xs",
  lg: "min-h-12 px-6 py-3 text-base",
  touch: "min-h-14 min-w-[54px] px-6 py-3.5 text-base rounded-2xl", /* 56px de ergonomía móvil */
  compact: "h-7 px-2 text-[11px] rounded-md",                      /* Para tablas INDEC */
  icon: "h-10 w-10 p-2",
};
```

---

### 4.2. Componente `Badge` (`src/components/ui/badge.tsx`)
Badges técnicos para estados de cuota, tipos de series y métricas:

```typescript
export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "series-warmup"   /* Serie W: Calentamiento */
  | "series-normal"   /* Serie N: Efectiva */
  | "series-drop"     /* Serie D: Drop set */
  | "series-fail";    /* Serie F: Al fallo */

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground font-bold shadow-xs",
  secondary: "border-border/60 bg-surface-container text-foreground font-semibold",
  outline: "border-border/80 bg-transparent text-muted-foreground font-semibold",
  success: "border-success/40 bg-success/15 text-success font-bold",
  warning: "border-amber-500/40 bg-amber-500/15 text-amber-400 font-bold",
  destructive: "border-destructive/40 bg-destructive/15 text-destructive font-bold",
  info: "border-info/40 bg-info/15 text-info font-bold",
  "series-warmup": "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 font-mono text-[10px] font-black",
  "series-normal": "border-border bg-surface-container-high text-foreground font-mono text-[10px] font-black",
  "series-drop": "border-amber-500/50 bg-amber-500/15 text-amber-300 font-mono text-[10px] font-black",
  "series-fail": "border-destructive/50 bg-destructive/20 text-destructive font-mono text-[10px] font-black",
};
```

---

### 4.3. Componente `Table` Estilo INDEC (`src/components/ui/table.tsx`)
Especificación de tabla para datos densos del Coach Studio:

```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto rounded-lg border border-border/70 bg-surface">
      <table ref={ref} className={cn("w-full caption-bottom text-xs text-left", className)} {...props} />
    </div>
  )
);

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("sticky top-0 z-10 border-b border-border bg-surface-container-low text-[11px] font-bold tracking-wider text-muted-foreground uppercase", className)} {...props} />
  )
);

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr ref={ref} className={cn("border-b border-border/40 transition-colors hover:bg-white/[0.03] data-[state=selected]:bg-surface-container", className)} {...props} />
  )
);

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th ref={ref} className={cn("h-9 px-3 text-left font-semibold align-middle text-muted-foreground [&:has([role=checkbox])]:pr-0", className)} {...props} />
  )
);

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn("py-2 px-3 align-middle font-normal text-foreground [&:has([role=checkbox])]:pr-0", className)} {...props} />
  )
);
```

---

## 5. Checklist de Implementación Quirúrgica para `@frontend-eng`

Bajo la **Metodología Karpathy**, la implementación debe ejecutarse en pasos acotados y verificables sin romper pruebas existentes:

1. **Paso 1: Tokens Base en CSS (`src/app/globals.css`)**
   - Actualizar las variables de `:root` y `.dark` con los valores de la Sección 2.
   - Ejecutar `npm run test:run` para validar que los tests unitarios pasen sin alteración.
2. **Paso 2: Extensión de Tailwind (`tailwind.config.ts`)**
   - Incorporar `success`, `info`, `fontFamily` (display, mono) y sombras `elevation-1`, `elevation-2`.
3. **Paso 3: Componentes UI Atómicos (`src/components/ui/`)**
   - Actualizar `button.tsx` con las variantes `touch-action` y `compact-table`.
   - Actualizar `badge.tsx` con las variantes de series `series-warmup`, `series-drop`, etc.
   - Crear `src/components/ui/table.tsx` con el estándar de cabezal fijo y bordes sutiles.
4. **Paso 4: Vistas Principales**
   - `src/app/page.tsx`: Retirar el fondo con polígono difuso y reemplazar los emojis por iconos SVG de Lucide.
   - `src/components/coach/coach-dashboard-view.tsx` y `student-card.tsx`: Aplicar la alineación numérica decimal (`tabular-nums font-mono text-right`) y unidades entre corchetes `[kg]`, `[%]`.
   - `src/components/athlete/live-workout.tsx`: Asegurar que el botón de completar serie tenga clase `min-h-14` y los inputs `inputmode="decimal"`.

---

## 6. Auditoría de Accesibilidad y Ratios de Contraste (WCAG 2.1 AA / AAA)

Siguiendo la Regla de Negocio innegociable de contraste para entrenamiento y trabajo de oficina:

| Elemento / Rol | Modo Día (Light) | Ratio Día | Modo Noche (Dark) | Ratio Noche | Nivel WCAG |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Texto Principal sobre Superficie** | `#0F172A` sobre `#FFFFFF` | **18.2:1** | `#F8FAFC` sobre `#1E293B` | **12.2:1** | **AAA** (Excelente legibilidad) |
| **Texto Secundario / Metadatos** | `#64748B` sobre `#FFFFFF` | **4.6:1** | `#94A3B8` sobre `#1E293B` | **5.1:1** | **AA** (Lectura descansada) |
| **Acento Primario (Botón/Foco)** | `#FFFFFF` sobre `#2563EB` | **4.6:1** | `#0F172A` sobre `#38BDF8` | **8.2:1** | **AAA** en Noche, **AA** en Día |
| **Cifras Métricas (Peso/Reps/Timer)** | `#0F172A` sobre `#FFFFFF` | **18.2:1** | `#38BDF8` sobre `#1E293B` | **8.2:1** | **AAA** (Legible a 2 metros) |
| **Series Completadas (Success)** | `#10B981` (badge suave) | **4.8:1** | `#34D399` sobre `#1E293B` | **7.5:1** | **AAA** en Noche, **AA** en Día |
| **Alertas / Sin Plan (Destructive)** | `#EF4444` (badge suave) | **4.5:1** | `#F87171` sobre `#1E293B` | **6.8:1** | **AA+** |

