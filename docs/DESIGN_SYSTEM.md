# GOZSter — Master Spec de Estética, Tokens y Componentes UI/UX

> **Versión:** 1.0.0 (Stage 4 — Final Master Spec)  
> **Autor:** UI/UX & Art Director (`@UI/UX & Art Director`)  
> **Destinatario Técnico:** `@frontend-eng`  
> **Gobernanza:** `@PM-GOZster` & Gabriel  
> **Skills Aplicadas:** `ui-styling` (principal), `no-ai-design-slop`, `design-system`, `ui-ux-pro-max`  
> **Principios Rectores:** Metodología Karpathy (quirúrgico, paso a paso) & Regla Ponytail (cero bloatware, cero dependencias NPM adicionales)

---

## 1. Filosofía de Diseño & Dirección de Arte

### 1.1 Concepto Rector: *Precision Athletic Engineering* (Ingeniería Atlética de Precisión)
GOZSter abandona definitivamente la estética genérica de "plantilla SaaS de IA" (gradientes morados predecibles, esquinas excesivamente redondeadas tipo juguete, efectos de desenfoque excesivos que arruinan la legibilidad y consumo innecesario de GPU).

La nueva identidad visual se inspira en:
1. **Instrumentación Deportiva de Élite:** Barras y discos calibrados de competición (Eleiko, Rogue), displays de telemetría de potencia y cronómetros de precisión industrial.
2. **Arquitectura de Datos Rigurosa (Normas INDEC 2024):** Disciplina editorial estadística para el entrenador, con alineación decimal perfecta, unidades explícitas entre corchetes (`[kg]`, `[reps]`, `[1RM]`, `[RPE]`) y cabezales fijos sin ruido visual.
3. **Ergonomía de Gimnasio Real:** Diseñado para dedos sudados con magnesio, fatiga neuromuscular extrema y visibilidad a 2 metros de distancia bajo tubos fluorescentes o sótanos sin señal.

---

### 1.2 La Doble Experiencia Tajante

```
┌───────────────────────────────────────────────┐  ┌───────────────────────────────────────────────────────────────┐
│        ATHLETE APP (Mobile-Only / PWA)        │  │              COACH STUDIO (Web / Desktop)                 │
├───────────────────────────────────────────────┤  ├───────────────────────────────────────────────────────────────┤
│ • Viewport de referencia: 390px (iPhone /     │  │ • Viewport de referencia: 1440px+ (Monitores 24"-27" /        │
│   Android moderno en una sola mano)           │  │   Tablets en orientación horizontal)                      │
│ • Uso: EXCLUSIVAMENTE EN EL CELULAR EN EL GYM │  │ • Uso: Planificación intensiva, análisis de sobrecarga,     │
│ • Tap Targets: ≥ 48px a 54px (Thumb Zone)     │  │   nómina de 50+ atletas y matrices de periodización        │
│ • Contraste: Extremo WCAG AAA en métricas     │  │ • Densidad de datos: Estilo INDEC (filas compactas 32-36px)│
│ • Carga de series: Cero fricción, teclado     │  │ • Navegación: Cabezal sticky, columna matriz anclada,      │
│   numérico decimal instantáneo                │  │   paneles laterales (Side Drawers) sin perder contexto     │
│ • Cronómetro: Legible a 2 metros con anillo   │  │ • Paleta sobria: Fondo grafito mate para evitar la fatiga  │
│   de contraste, audio y vibración háptica     │  │   ocular tras 4 horas continuas de armado de rutinas       │
└───────────────────────────────────────────────┘  └───────────────────────────────────────────────────────────────┘
```

---

## 2. Tokens de Diseño & Variables CSS (`src/app/globals.css`)

Los tokens siguen una arquitectura de tres capas: **Primitivos (valores base HSL) → Semánticos (intención y función) → Componentes (asociación a clases Shadcn/Tailwind)**.

### 2.1 Variables HSL en `src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root,
  .dark {
    /* ==========================================================================
       1. BACKGROUNDS & SURFACES (Deep Onyx & Titanium Containers)
       ========================================================================== */
    /* Fondo base negro profundo (OLED/Gym friendly) */
    --background: 222 47% 6%;                    /* #080C14 */
    --foreground: 210 40% 98%;                   /* #F8FAFC - Blanco Titanio */

    /* Escala de contenedores semánticos de elevación limpia */
    --surface-ground: 222 47% 6%;                /* Nivel 0: Fondo general */
    --surface-container-low: 222 42% 8.5%;       /* Nivel 1: Tablas cabezal / barras */
    --surface-container: 222 38% 11.5%;          /* Nivel 2: Tarjetas estándar / modales */
    --surface-container-high: 222 32% 15.5%;     /* Nivel 3: Drawers laterales / menús */
    --surface-container-highest: 222 28% 20%;    /* Nivel 4: Hover de filas / inputs */

    --card: 222 38% 11.5%;
    --card-foreground: 210 40% 98%;

    --popover: 222 38% 11.5%;
    --popover-foreground: 210 40% 98%;

    /* ==========================================================================
       2. ACENTOS DE MARCA & ALTO RENDIMIENTO (Kinetic Mint & Titanium)
       ========================================================================== */
    /* Primario: Kinetic Mint / Emerald atlético de alto contraste (7.8:1 sobre Deep Onyx) */
    --primary: 158 64% 48%;                      /* #2BB673 */
    --primary-foreground: 164 86% 8%;            /* #032616 */

    /* Secundario: Titanium Steel para acciones neutras y bordes técnicos */
    --secondary: 222 28% 16%;                    /* #1D2432 */
    --secondary-foreground: 210 40% 98%;

    --muted: 222 26% 15%;                        /* #1A212E */
    --muted-foreground: 215 20% 65%;             /* #94A3B8 */

    --accent: 222 28% 18%;                       /* #222C3D */
    --accent-foreground: 210 40% 98%;

    /* ==========================================================================
       3. ESTADOS SEMÁNTICOS, SOBRECARGA PROGRESIVA Y ALERTAS
       ========================================================================== */
    /* Destructive / Deuda / Baja / Fallo muscular (F) */
    --destructive: 350 89% 60%;                  /* #F43F5E */
    --destructive-foreground: 0 0% 100%;

    /* Warning / Sobrecarga Progresiva / Vencimiento Próximo / RPE 9.5-10 */
    --warning: 38 92% 50%;                       /* #F59E0B - Ámbar industrial */
    --warning-foreground: 222 47% 6%;

    /* Success / 1RM Record / Membresía Al Día / Serie Completada */
    --success: 158 64% 48%;                      /* #2BB673 */
    --success-foreground: 164 86% 8%;

    /* Info / Series de Calentamiento (W) / Datos de Técnica */
    --info: 199 89% 48%;                         /* #0EA5E9 */
    --info-foreground: 222 47% 6%;

    /* Overload Accent / Dropsets (D) / Superseries */
    --overload-purple: 262 83% 58%;              /* #8B5CF6 */
    --overload-purple-foreground: 210 40% 98%;

    /* ==========================================================================
       4. LÍNEAS DE GRILLA, BORDES & RADIOS (Hairline Borders)
       ========================================================================== */
    --border: 220 26% 16%;                       /* #1E2738 - Separador nítido 1px */
    --border-subtle: 220 24% 11%;                /* #131A26 - Grilla INDEC */
    --input: 220 26% 18%;                        /* #222C3D */
    --ring: 158 64% 48%;                         /* Indicador de foco accesible */

    /* Escala de radios de borde contenida y sobria */
    --radius: 0.5rem;                            /* 8px base (estilo técnico) */
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased selection:bg-primary/25 selection:text-primary;
    -webkit-tap-highlight-color: transparent;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11", "tnum";
  }

  /* Barras de desplazamiento sutiles para tablas densas y drawers */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    background: hsl(var(--muted-foreground) / 0.25);
    border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: hsl(var(--muted-foreground) / 0.45);
  }
}
```

---

### 2.2 Configuración de Tailwind CSS (`tailwind.config.ts`)

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
        border: {
          DEFAULT: "hsl(var(--border))",
          subtle: "hsl(var(--border-subtle))",
        },
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
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        overload: {
          purple: "hsl(var(--overload-purple))",
          "purple-foreground": "hsl(var(--overload-purple-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          ground: "hsl(var(--surface-ground))",
          DEFAULT: "hsl(var(--surface-container))",
          container: "hsl(var(--surface-container))",
          "container-low": "hsl(var(--surface-container-low))",
          "container-high": "hsl(var(--surface-container-high))",
          "container-highest": "hsl(var(--surface-container-highest))",
        },
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)", // 4px - celdas / microbadges
        md: "calc(var(--radius) - 2px)", // 6px - botones tabla / inputs
        lg: "var(--radius)",              // 8px - cards Coach / modales
        xl: "calc(var(--radius) + 4px)", // 12px - cards Athlete mobile
        "2xl": "calc(var(--radius) + 8px)", // 16px - drawers
        "3xl": "calc(var(--radius) + 16px)", // 24px - modal panels
      },
      boxShadow: {
        // Elevaciones nítidas sin halo sucio (Clean M3)
        "elevation-low": "0 1px 2px 0 rgb(0 0 0 / 0.4)",
        "elevation-card": "0 2px 6px -1px rgb(0 0 0 / 0.5), 0 1px 3px -1px rgb(0 0 0 / 0.4)",
        "elevation-modal": "0 10px 25px -4px rgb(0 0 0 / 0.7), 0 4px 8px -3px rgb(0 0 0 / 0.5)",
        "glow-primary": "0 0 16px -2px hsl(var(--primary) / 0.35)",
        "glow-warning": "0 0 16px -2px hsl(var(--warning) / 0.35)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
```

---

## 3. Especificación y Variantes de Componentes Shadcn/UI

A continuación se presentan las especificaciones exactas para los componentes en `src/components/ui/`, respetando la **Regla Ponytail** (cero dependencias externas pesadas, puramente React + Tailwind + clases utilitarias seguras).

---

### 3.1 `Button` (`src/components/ui/button.tsx`)

#### Variantes Requeridas
1. `default`: Primario verde esmeralda para acción de confirmación máxima.
2. `secondary`: Fondo grafito `--secondary` con borde hairline.
3. `outline`: Borde hairline sutil `--border`, transparente.
4. `ghost`: Sin borde ni fondo hasta el hover.
5. `destructive`: Rojo rose para eliminar, baja de alumno o descartar rutina.
6. `link`: Texto interactivo con subrayado al hover.
7. `compact-table`: Diseñado para Coach Studio e INDEC. Altura compacta (28px), texto 11px font-semibold, padding ajustado.
8. `touch-action`: Diseñado para Athlete App en gimnasio. Altura mínima de 52px a 56px, ancho completo o ergonómico, feedback `active:scale-[0.98]`.

#### Implementación Completa
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link"
  | "compact-table"
  | "touch-action";

export type ButtonSize = "default" | "sm" | "lg" | "touch" | "icon" | "compact";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "bg-primary text-primary-foreground font-bold shadow-elevation-low hover:brightness-105 active:scale-[0.98]",
  secondary:
    "bg-secondary text-secondary-foreground border border-border hover:bg-surface-container-highest active:scale-[0.98] font-semibold",
  outline:
    "border border-border/80 bg-transparent text-foreground hover:bg-surface-container hover:border-border active:scale-[0.98] font-medium",
  ghost:
    "bg-transparent text-foreground hover:bg-surface-container hover:text-foreground active:scale-[0.98] font-medium",
  destructive:
    "bg-destructive text-destructive-foreground font-bold shadow-elevation-low hover:brightness-110 active:scale-[0.98]",
  link:
    "text-primary underline-offset-4 hover:underline p-0 h-auto font-medium",
  "compact-table":
    "bg-surface-container hover:bg-surface-container-highest text-foreground border border-border/70 text-xs font-semibold py-1 px-2.5 min-h-[28px] rounded-md active:scale-[0.97]",
  "touch-action":
    "bg-primary text-primary-foreground font-black text-base tracking-wide min-h-[52px] sm:min-h-[56px] px-6 py-3.5 rounded-xl shadow-glow-primary hover:brightness-105 active:scale-[0.98] select-none",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "min-h-11 px-4 py-2 text-sm",
  compact: "min-h-7 px-2.5 py-1 text-xs",
  sm: "min-h-9 px-3 py-1.5 text-xs",
  lg: "min-h-12 px-6 py-3 text-base",
  touch: "min-h-14 px-6 py-3.5 text-base font-bold tracking-wide",
  icon: "h-11 w-11 p-2.5 shrink-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 cursor-pointer",
          variantClasses[variant],
          variant !== "compact-table" && variant !== "touch-action" ? sizeClasses[size] : "",
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
```

---

### 3.2 `Badge` (`src/components/ui/badge.tsx`)

#### Variantes Semánticas Requeridas
- **Membresías:** `ACTIVA` (verde esmeralda), `VENCIDA` (rojo rose), `PRÓXIMO_VENCIMIENTO` / `PENDIENTE` (ámbar de alerta).
- **Tipos de Serie (Athlete App):** `WARMUP` (cian `[W]`), `NORMAL` (grafito titanio `[N]`), `DROPSET` (púrpura `[D]`), `FAIL` (rojo `[F]`).
- **Métricas:** `1RM_RECORD`, `OVERLOAD_ALERT`.

#### Implementación Completa
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "overload"
  // Variantes de Dominio de Negocio:
  | "membership-active"
  | "membership-pending"
  | "membership-expired"
  | "set-warmup"
  | "set-normal"
  | "set-dropset"
  | "set-fail"
  | "metric-tag";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-transparent bg-primary text-primary-foreground font-bold shadow-sm",
  secondary: "border-border/60 bg-secondary text-secondary-foreground font-semibold",
  outline: "border-border/80 bg-transparent text-foreground font-semibold",
  success: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 font-bold",
  warning: "border-amber-500/40 bg-amber-500/15 text-amber-300 font-bold",
  destructive: "border-rose-500/40 bg-rose-500/15 text-rose-300 font-bold",
  info: "border-sky-500/40 bg-sky-500/15 text-sky-300 font-bold",
  overload: "border-purple-500/40 bg-purple-500/15 text-purple-300 font-bold",

  // Variantes de Negocio Especializadas:
  "membership-active":
    "border-emerald-500/40 bg-emerald-950/60 text-emerald-300 font-bold tracking-wide uppercase text-[10px]",
  "membership-pending":
    "border-amber-500/40 bg-amber-950/60 text-amber-300 font-bold tracking-wide uppercase text-[10px]",
  "membership-expired":
    "border-rose-500/40 bg-rose-950/60 text-rose-300 font-bold tracking-wide uppercase text-[10px]",

  "set-warmup":
    "border-sky-500/50 bg-sky-950/80 text-sky-300 font-black font-mono text-[11px] px-1.5 py-0.5",
  "set-normal":
    "border-border bg-surface-container text-foreground font-bold font-mono text-[11px] px-1.5 py-0.5",
  "set-dropset":
    "border-purple-500/50 bg-purple-950/80 text-purple-300 font-black font-mono text-[11px] px-1.5 py-0.5",
  "set-fail":
    "border-rose-500/50 bg-rose-950/80 text-rose-300 font-black font-mono text-[11px] px-1.5 py-0.5",

  "metric-tag":
    "border-border/70 bg-surface-container-high text-muted-foreground font-mono text-[11px] px-2 py-0.5",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium select-none transition-colors",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
```

---

### 3.3 `Card` (`src/components/ui/card.tsx`)

#### Variantes de Superficie
- `dense`: Para Coach Studio. Padding reducido (`p-3 sm:p-4`), esquinas de 8px (`rounded-lg`), fondo `--surface-container`, borde fino `--border`.
- `tactile`: Para Athlete App. Padding cómodo (`p-5`), esquinas de 12px (`rounded-xl`), sombra de elevación limpia.

#### Implementación Completa
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "dense" | "tactile";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "border text-card-foreground transition-all duration-150",
        variant === "dense" &&
          "rounded-lg border-border bg-surface-container p-3 sm:p-4 shadow-elevation-low",
        variant === "tactile" &&
          "rounded-xl border-border bg-surface-container-high p-5 shadow-elevation-card",
        variant === "default" &&
          "rounded-lg border-border bg-card p-5 shadow-elevation-card",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 pb-3", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-base sm:text-lg font-bold leading-tight tracking-tight text-foreground",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-muted-foreground leading-relaxed", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center pt-3 border-t border-border/50", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
```

---

### 3.4 `Table` — Sistema de Cuadros Estadísticos INDEC (`src/components/ui/table.tsx`)

#### Principios INDEC Implementados
1. **Cabezal Sticky (`sticky top-0`):** Con fondo `--surface-container-low` y z-index 10 para navegación en nóminas de 100+ alumnos sin perder las referencias de columna.
2. **Columna Matriz Fija (`sticky left-0`):** Nombre del alumno o ejercicio anclado visualmente con sombra lateral sutil para scroll horizontal en tablets o notebooks.
3. **Alineación Numérica Decimal a la Derecha:** Uso obligatorio de `text-right font-mono tabular-nums` para kilos, repeticiones, 1RM y fechas.
4. **Unidades Explícitas:** Indicadas en el cabezal entre corchetes rectos (`[kg]`, `[reps]`, `[1RM]`, `[días]`).
5. **Filas Compactas (32px-36px):** Optimizadas para escaneo rápido con hover discreto (`hover:bg-surface-container-highest/50`).
6. **Llamadas y Notas al Pie:** Sección de notas metodológicas en `TableCaption` o `TableFooter`.

#### Implementación Completa
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto rounded-lg border border-border bg-surface-container-low">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-xs text-left", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "sticky top-0 z-10 border-b border-border bg-surface-container-low/95 backdrop-blur-xs text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("divide-y divide-border/50 bg-card", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

export const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-border bg-surface-container-low font-medium text-muted-foreground text-[11px]",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement> & { isZebra?: boolean }
>(({ className, isZebra, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "h-9 transition-colors hover:bg-surface-container-highest/60 data-[state=selected]:bg-muted",
      isZebra && "even:bg-surface-container/40",
      className,
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { isNumeric?: boolean; isMatrix?: boolean }
>(({ className, isNumeric, isMatrix, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-9 px-3 text-xs font-bold tracking-tight text-muted-foreground uppercase select-none",
      isNumeric && "text-right font-mono",
      isMatrix && "sticky left-0 z-20 bg-surface-container-low shadow-[1px_0_0_0_hsl(var(--border))]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { isNumeric?: boolean; isMatrix?: boolean }
>(({ className, isNumeric, isMatrix, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "py-2 px-3 align-middle text-xs text-foreground",
      isNumeric && "text-right font-mono tabular-nums font-semibold",
      isMatrix && "sticky left-0 z-10 bg-card font-medium shadow-[1px_0_0_0_hsl(var(--border))]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

export const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-2 text-[10px] text-muted-foreground text-left px-3 pb-2", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";
```

---

### 3.5 `Drawer` & `Dialog` (`src/components/ui/drawer.tsx` & `dialog.tsx`)

#### Filosofía y Casos de Uso
- **Mobile Bottom Sheet (`Drawer`):** Para Athlete App en celular. Se desliza desde el fondo con handle táctil ergonómico (`h-1.5 w-12 bg-muted rounded-full`), perfecto para:
  - Temporizador multimodal de descanso.
  - Calculadora de discos (`PlateCalculatorModal`).
  - Video de técnica (`ExerciseVideoModal`).
- **Desktop Side Drawer (`Drawer` lateral):** Para Coach Studio. Se desliza desde el lateral derecho ocupando un ancho fijo de `480px` a `540px` (utilizado en `HistoricalLoadsDrawer` y `StudentDetail`), permitiendo que el entrenador consulte el historial de 1RM sin perder el contexto de la tabla de alumnos.
- **Centrado (`Dialog`):** Modal clásico con backdrop oscuro para confirmaciones de negocio (clonar rutina, confirmar baja, etc.).

#### Implementación Completa de `Drawer`
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  position?: "bottom" | "right";
  className?: string;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  position = "bottom",
  className,
}: DrawerProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex"
    >
      {/* Backdrop con desenfoque suave y oscurecimiento */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Contenedor del Drawer */}
      <div
        className={cn(
          "relative z-50 flex flex-col bg-surface-container-high border-border text-foreground shadow-elevation-modal transition-transform duration-250 ease-out",
          position === "bottom" &&
            "mt-auto w-full max-h-[88vh] rounded-t-2xl border-t pb-safe overflow-y-auto animate-in slide-in-from-bottom",
          position === "right" &&
            "ml-auto h-full w-full max-w-lg border-l overflow-y-auto animate-in slide-in-from-right",
          className,
        )}
      >
        {/* Handle de arrastre superior para móviles */}
        {position === "bottom" && (
          <div className="flex justify-center py-2.5">
            <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          </div>
        )}

        {/* Encabezado del Drawer */}
        <div className="flex items-center justify-between border-b border-border/70 p-4 sm:p-5">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="rounded-lg p-2 text-muted-foreground hover:bg-surface-container-highest hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
```

---

### 3.6 `Input` — Numeric Fast-Stepper (`src/components/ui/input.tsx`)

#### Ergonomía y Atributos para Gimnasio
- `inputmode="decimal"` y `pattern="[0-9]*[.,]?[0-9]*"` para desplegar teclado numérico táctil inmediato en iOS y Android.
- Fuentes monoespaciadas de alto contraste (`font-mono tabular-nums`).
- Variantes para incremento rápido (`+1`, `+2.5`, `+5 kg`) sin tener que borrar y tipear repetitivamente en series pesadas.

#### Implementación Completa
```tsx
import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  isInvalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", isInvalid, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-md border border-input bg-surface-container px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 font-medium transition-colors",
          type === "number" && "font-mono tabular-nums text-right",
          isInvalid && "border-destructive focus-visible:ring-destructive",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export interface NumberStepperProps {
  value: number;
  onChange: (newValue: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  increments?: number[];
  label?: string;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 500,
  step = 2.5,
  unit = "kg",
  increments = [1, 2.5, 5],
  label,
}: NumberStepperProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <span className="text-xs font-semibold text-muted-foreground">
          {label} ({unit})
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - step))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-container text-base font-bold text-foreground hover:bg-surface-container-highest active:scale-95"
          aria-label="Restar carga"
        >
          -
        </button>

        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const parsed = parseFloat(e.target.value.replace(",", "."));
            if (!isNaN(parsed)) onChange(parsed);
          }}
          className="h-11 w-full rounded-lg border border-input bg-surface-container px-2 text-center font-mono text-base font-bold text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary"
        />

        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + step))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-container text-base font-bold text-foreground hover:bg-surface-container-highest active:scale-95"
          aria-label="Sumar carga"
        >
          +
        </button>
      </div>

      {/* Botones de incremento rápido (Thumb friendly) */}
      {increments && (
        <div className="flex items-center justify-center gap-1 pt-0.5">
          {increments.map((inc) => (
            <button
              key={inc}
              type="button"
              onClick={() => onChange(Math.min(max, value + inc))}
              className="rounded border border-border/80 bg-surface-container-low px-2 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground hover:text-primary hover:border-primary/50"
            >
              +{inc}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## 4. Guía de Implementación Quirúrgica para `@frontend-eng` (Metodología Karpathy)

Para mantener la estabilidad total del código y no romper ninguna de las 276 pruebas existentes de Vitest, la implementación debe ejecutarse en el siguiente orden estricto:

### Paso 1: Actualizar `src/app/globals.css`
- **Acción:** Incorporar los tokens HSL estandarizados (`--background`, `--surface-container-*`, `--primary`, `--secondary`, `--destructive`, `--warning`, `--info`, `--overload-purple`, `--border`, `--border-subtle`).
- **Verificación:** Verificar que los fondos se mantengan en Deep Onyx y no haya parpadeos de contraste.

### Paso 2: Actualizar `tailwind.config.ts`
- **Acción:** Mapear los colores semánticos, extender la escala de `borderRadius` (`sm`, `md`, `lg`, `xl`, `2xl`) y registrar las elevaciones limpias (`elevation-low`, `elevation-card`, `elevation-modal`, `glow-primary`).
- **Verificación:** Ejecutar `npm run lint` / `npx tsc --noEmit` para confirmar que TypeScript reconozca el archivo de configuración.

### Paso 3: Actualizar Componentes UI Base
- **Archivos:**
  - `src/components/ui/button.tsx`: Agregar variantes `compact-table` y `touch-action`.
  - `src/components/ui/badge.tsx`: Agregar variantes de negocio (`membership-*`, `set-*`, `metric-tag`).
  - `src/components/ui/card.tsx`: Agregar variantes `dense` y `tactile`.

### Paso 4: Crear Nuevos Componentes Shadcn Requeridos
- **Archivos:**
  - `src/components/ui/table.tsx`: Tabla estadística INDEC 2024 con cabezal sticky y columna matriz anclada.
  - `src/components/ui/drawer.tsx`: Drawer dual (Bottom sheet para mobile / Side panel para desktop).
  - `src/components/ui/input.tsx`: Input numérico con soporte para stepper y decimales.

### Paso 5: Verificación de Calidad y Pruebas
- **Acción:** Ejecutar `npm test` en local.
- **Criterio de Éxito:** Los 17 archivos de prueba y 276 tests unitarios deben pasar al 100% en verde sin advertencias.
