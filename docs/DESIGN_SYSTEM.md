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

Este bloque reemplaza la paleta previa de `globals.css` por la nueva arquitectura de **Precision Mechanical Strength**:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root,
  .dark {
    /* ========================================================
       1. LAYER PRIMITIVO & SEMÁNTICO: SUPERFICIES (OBSIDIAN)
       ======================================================== */
    --background: 224 25% 4%;           /* #080A0D - Fondo base OLED */
    --foreground: 210 40% 98%;          /* #F8FAFC - Chalk White */

    --surface: 224 22% 7%;              /* #0E1117 - Superficie primaria */
    --surface-container-low: 224 20% 9%; /* #12151E - Contenedor bajo */
    --surface-container: 224 18% 12%;    /* #181C26 - Contenedor estándar */
    --surface-container-high: 224 16% 16%; /* #222736 - Contenedor elevado */
    --surface-container-highest: 224 15% 20%; /* #2B3245 - Dropdowns/Modales */

    --card: 224 20% 9%;
    --card-foreground: 210 40% 98%;

    /* ========================================================
       2. LAYER SEMÁNTICO: ACENTOS Y RETROALIMENTACIÓN
       ======================================================== */
    /* Forged Gold / Amber (Foco primario, timer activo, CTA) */
    --primary: 42 100% 50%;             /* #FFB800 */
    --primary-foreground: 224 30% 6%;   /* #0A0D14 - Máximo contraste */

    /* Secondary / Steel */
    --secondary: 224 18% 14%;           /* #1C212E */
    --secondary-foreground: 215 25% 85%; /* #CBD5E1 */

    /* Muted & Borders */
    --muted: 224 16% 14%;               /* #1D212C */
    --muted-foreground: 215 16% 62%;    /* #8B98AD */
    --border: 224 14% 18%;              /* #262B3A - Líneas sutiles */
    --input: 224 14% 18%;
    --ring: 42 100% 50%;

    /* Success / Hypertrophy Green (Series completadas, al día) */
    --success: 152 76% 46%;             /* #1BC47D */
    --success-foreground: 224 30% 6%;

    /* Destructive / Fatigue Red (Fallo, dolor articular, alertas) */
    --destructive: 354 85% 56%;         /* #F02D4E */
    --destructive-foreground: 0 0% 100%;

    /* Info / Tension Blue (Técnica, videos, notas) */
    --info: 210 90% 56%;                /* #2B87F7 */
    --info-foreground: 0 0% 100%;

    /* Radios estructurales técnicos */
    --radius: 0.75rem;                  /* 12px estándar */
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary;
    -webkit-tap-highlight-color: transparent;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11", "tnum";
  }

  /* Scrollbar técnico ultra-delgado para alta densidad */
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
