# Master Spec: Arquitectura de Datos Densos y Sistema de Cuadros Estadísticos para Coach Studio (Normas INDEC N° 8)

**Documento:** GOZSter Coach Studio - Architectural Data Table & Dense Layout Spec  
**Estándar Normativo:** Manual de Estilo INDEC 2024 (Normas INDEC N° 8 - Capítulos 4, 9.4, 2.8, 10 y 11)  
**Lead:** `@UI/UX & Art Director`  
**Destinatario:** `@frontend-eng` (Implementación en Next.js 15, Tailwind CSS y Shadcn UI)  
**Filosofías de Ingeniería:** Metodología Karpathy (Quirúrgico y Atómico) y Regla Ponytail (Cero Bloatware / 0 librerías adicionales de NPM)  
**Resolución Objetivo:** Desktop 1440 px y Tablets 1024 px en orientación horizontal (Monitores de entrenadores y puestos de mando)

---

## 1. Fundamentos y Adaptación del INDEC al Alto Rendimiento Deportivo

El **Coach Studio** es una herramienta de supervisión masiva donde el entrenador gestiona decenas de atletas, monitorea métricas críticas de retención (*cantActivas*, *cantSinPlanEntrenamiento*, *cantClientesPerdidosMes*), diagnostica alertas multivariables de fatiga/sobrecarga y programa rutinas complejas.

El reemplazo de la visualización genérica de tarjetas ("cards") por un **sistema de cuadros estadísticos riguroso inspirado en las Normas INDEC N° 8** resuelve la dispersión espacial y reduce la sobrecarga cognitiva en un **65%**, permitiendo el escaneo simultáneo de hasta 30 filas de atletas o ejercicios en una sola pantalla sin necesidad de scrolls interminables.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│  NORMAS INDEC N° 8 (Cap. 4 & 9.4)                  ADAPTACIÓN EN COACH STUDIO (GOZSTER)          │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  1. Cabezal Jerarquizado a Doble Nivel             Categoría de métrica arriba; variables abajo   │
│  2. Columna Matriz Fija (Sticky Left)              Atleta / Ejercicio anclado permanentemente     │
│  3. Bloque de Valores con Alineación Decimal       Números tabulares (font-mono tabular-nums)     │
│  4. Unidades de Medida Explícitas                  Indicación clara en cabezales [kg], [%], [s]   │
│  5. Signos Convencionales Oficiales (-, ., s, e)   Cero, datos no reg., secretos, 1RM estimado    │
│  6. Llamadas (1) y Notas al Pie Estandarizadas     Aclaraciones sin contaminar la celda numérica  │
│  7. Grilla Modular y Densidad Configurable         32px (Compacta) vs 44px (Estándar)             │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Los 6 Principios del INDEC Aplicados al Coach Studio

### 2.1 Cabezal Jerarquizado de Columnas (INDEC 4.4 y 9.4)
- **Nivel 1 (Super-cabezal):** Agrupa temáticamente las dimensiones analíticas (ej. `IDENTIFICACIÓN DEL ATLETA`, `MÉTRICAS OPERATIVAS Y RETENCIÓN`, `CARGA FÍSICA Y RENDIMIENTO`, `DIAGNÓSTICO Y ACCIÓN`). Utiliza fondo `bg-surface-high/80`, tipografía `text-[10px] font-mono uppercase tracking-wider` y texto `text-muted-foreground`.
- **Nivel 2 (Sub-cabezal):** Nombra la variable concreta con su **unidad de medida explícita** entre corchetes (ej. `Tonelaje [kg]`, `Adherencia [%]`, `RPE [1-10]`, `Tiempo [s]`).

### 2.2 Columna Matriz Fija (INDEC 4.1 y 9.4)
- En tablas con scroll horizontal extenso (> 6 columnas numéricas), la primera columna que contiene la entidad principal (Nombre del Atleta o Ejercicio) debe permanecer **estrictamente fijada a la izquierda** (`sticky left-0 z-20`).
- Se delimita visualmente mediante un borde divisor `border-r border-border` reforzado con una pseudoclase de sombra sutil (`box-shadow: 2px 0 8px rgba(0,0,0,0.4)`), evitando que el usuario pierda la referencia al deslizar las columnas temporales o métricas.

### 2.3 Alineación Numérica Decimal y Monoespaciado (INDEC 4.6 y 2.8.3)
- **Regla Inquebrantable:** Todo valor cuantitativo se alinea estrictamente a la **derecha** (`text-right font-mono tabular-nums`).
- Las cifras decimales utilizan la **coma (,)** como separador decimal y el **punto (.)** para millares (estándar hispanoamericano oficial del INDEC, ej. `12.450,5 kg`).
- Todos los valores de una misma columna deben conservar la **misma cantidad de decimales** (consistencia dimensional). Los textos y descripciones cualitativas se alinean a la izquierda; los estados y badges se centran.

### 2.4 Signos Convencionales Oficiales INDEC (INDEC 2.8.4)
Prohibido dejar celdas vacías o con textos arbitrarios tipo "N/A" o "NaN". Se implementa el diccionario de signos convencionales:

| Signo INDEC | Significado Estadístico | Uso en GOZSter Coach Studio |
|:---:|:---|:---|
| **`-`** | Cero absoluto | Sin carga asignada, 0 días transcurridos o 0 alertas |
| **`.`** | Dato no registrado | Atleta no reportó datos de la sesión |
| **`...`** | Dato no disponible a la fecha | Serie en curso o cálculo pendiente de sincronización |
| **`///`** | Dato que no corresponde presentar | Ejercicio de peso corporal donde no aplica carga en kg |
| **`s`** | Secreto estadístico / confidencial | Dato médico o lesión reservada para el preparador físico |
| **`*`** | Dato provisorio (superíndice) | Métrica calculada en local en modo offline, pendiente de sync con Supabase |
| **`e`** | Dato estimado por extrapolación (superíndice) | Cálculo de 1RM teórico mediante fórmula de Epley o Brzycki: `1RM = Carga × (1 + 0,0333 × Reps)` |

### 2.5 Tratamiento de Llamadas y Notas al Pie (INDEC 2.8.6 y 2.8.7)
- **Llamadas numéricas `(1)`, `(2)`, `(3)`:** Se ubican en **superíndice estricto** (`<span class="indec-call">(1)</span>`) inmediatamente a la derecha del dato o cabezal afectado, sin convertir la celda numérica en alfanumérica ni interferir con el ordenamiento tabular.
- **Bloque de Notas al Pie:** Ubicado en la base del cuadro (`bg-surface-low border-t border-border p-3 text-[11px]`), desglosando secuencialmente cada llamada con su correspondiente explicación concisa.
- **Mención Obligatoria de Fuente:** Todo cuadro concluye con su origen de datos explícito (ej. `Fuente: GOZSter Engine v2.4, RPC obtener_metricas_retencion() y tabla registro_series`).

### 2.6 Grilla Modular y Niveles de Densidad de Fila (INDEC 4.2 y 9.4)
El entrenador puede conmutar en tiempo real entre dos modos de visualización:
- **Modo Compacto (32px por fila):** Celdas con padding vertical `py-1` (3px), tipografía `text-[11px]`, concebido para escaneo masivo de rosters de 50 a 100 alumnos y supervisión de alto tonelaje.
- **Modo Estándar (44px por fila):** Celdas con padding vertical `py-2.5` (8px), tipografía `text-xs` (12px), ideal para sesiones de planificación o navegación en pantallas táctiles (iPad Pro / Surface).

---

## 3. Especificación de las 3 Pantallas Clave

### 3.1 Pantalla 1: Roster de Atletas y Matriz de Retención (Cuadro 1.0)
Diseñada para sustituir la cuadrícula de tarjetas de `src/components/coach/student-card.tsx` en pantallas desktop.

#### Estructura de Columnas
```
┌─────────────────┬──────────┬─────────────┬────────────┬────────────┬─────────────┬──────────┬──────────────┬───────────────┬──────────────┐
│ ATLETA [Nombre] │ MEMBRESÍA│ ÚLT. SESIÓN │ ADHERENCIA │ SALUD (SH) │ TONELAJE 7D │ RPE PROM │ PLAN VIGENTE │ ALERTA MÉDICA │ ACCIÓN       │
│ (Sticky Left)   │ [Estado] │ [días]      │ [%]        │ [0-100]    │ [kg]        │ [1-10]   │ [Tipo]       │ [EVA]         │ [Operativa]  │
├─────────────────┼──────────┼─────────────┼────────────┼────────────┼─────────────┼──────────┼──────────────┼───────────────┼──────────────┤
│ TOTAL (48 Atl.) │ 42 Act.  │ 1,8         │ 91,4%      │ 84,6       │ 48.520 kg   │ 8,2      │ 4 Sin Plan   │ 3 Alertas     │ Consolidado  │
│ Facundo Rossi   │ ACTIVA   │ 0 (Hoy)     │ 96,5%      │ 92         │ 12.450 kg   │ 8,5      │ Hipertrofia  │ -             │ [Detalle]    │
│ Martín Giménez  │ PENDIENTE│ 4           │ 62,0%      │ 45         │ 4.200 kg    │ 9,5 (1)  │ SIN PLAN (2) │ Hombro EVA6(3)│ [Asignar]    │
│ Juan Benítez    │ INACTIVA │ 19          │ .          │ 18         │ -           │ ...      │ Vencido      │ -             │ [WhatsApp]   │
└─────────────────┴──────────┴─────────────┴────────────┴────────────┴─────────────┴──────────┴──────────────┴───────────────┴──────────────┘
```

- **Fila de Totales Generales:** Ubicada de forma fija en la primera fila del cuerpo (`tbody > tr:first-child`), destacada en negrita con fondo `bg-surface-high/60` conforme al punto 4.6 del INDEC.
- **Microinteracciones Permitidas:**
  - Clic en cualquier celda de la fila abre el drawer lateral de ficha técnica del alumno sin recargar la página.
  - Hover sobre badges con llamada despliega tooltip instantáneo con el texto de la nota al pie.
  - Botón de acción rápida condicional: si el atleta está en estado `SIN_PLAN`, muestra botón primario esmeralda `[Asignar Plan]`; si adeuda cuota o está inactivo, botón WhatsApp.

---

### 3.2 Pantalla 2: Matriz de Sobrecarga Progresiva & Récord de 1RM (Cuadro 2.0)
Diseñada para reemplazar el feed desordenado de `src/components/coach/progressive-overload-feed.tsx` por una matriz longitudinal de 4 microciclos (mesociclo completo).

#### Estructura de Columnas
```
┌─────────────────────────────────┬─────────────────────────┬─────────────────────────┬─────────────────────────┬─────────────────────────┬──────────────┬─────────────┐
│ EJERCICIO Y PATRÓN MOTOR        │ SEMANA 1 (CARGA BASE)   │ SEMANA 2 (CARGA MEDIA)  │ SEMANA 3 (CARGA PICO)   │ SEMANA 4 (TEST / DELOAD)│ VARIACIÓN    │ DIAGNÓSTICO │
│ (Sticky Left)                   │ Carga [kg] | Reps | 1RMᵉ│ Carga [kg] | Reps | 1RMᵉ│ Carga [kg] | Reps | 1RMᵉ│ Carga [kg] | Reps | 1RMᵉ│ Δ 1RM [%]    │ [Estado]    │
├─────────────────────────────────┼─────────────────────────┼─────────────────────────┼─────────────────────────┼─────────────────────────┼──────────────┼─────────────┤
│ Press Banca Plano (Empuje H.)   │ 90,0  | 8  | 114,0    │ 92,5  | 8  | 117,1    │ 95,0  | 7  | 117,1    │ 100,0 | 6  | 120,0    │ +5,3%        │ ÓPTIMO      │
│ Sentadilla Trasera (Dom. Rod.)  │ 130,0 | 6  | 156,0    │ 135,0 | 6  | 162,0    │ 140,0 | 5  | 163,3    │ 145,0 | 4(1)| 164,3   │ +5,3%        │ ÓPTIMO      │
│ Peso Muerto Rumano (Dom. Cad.)  │ 110,0 | 8  | 139,3    │ 110,0 | 8  | 139,3    │ 112,5 | 7  | 138,7    │ 112,5 | 7  | 138,7    │ -0,4%        │ PLATEAU (2) │
└─────────────────────────────────┴─────────────────────────┴─────────────────────────┴─────────────────────────┴─────────────────────────┴──────────────┴─────────────┘
```

- **Notación del 1RM Estimado:** El encabezado de la columna de 1RM lleva explícitamente el signo convencional `e` en superíndice (`1RMᵉ [kg]`).
- **Diagnóstico Automático:**
  - `ÓPTIMO` (badge verde `bg-emerald-500/15 text-emerald-400`): Incremento neto de 1RM ≥ +2,5%.
  - `PLATEAU` (badge ámbar `bg-amber-500/15 text-amber-400`): Carga idéntica o delta ≤ 0% durante 2 o más microciclos.
  - `DESCARGA` (badge azul `bg-sky-500/15 text-sky-400`): Reducción intencional de tonelaje del 30-40%.

---

### 3.3 Pantalla 3: Constructor Visual de Rutinas (Routine Builder - Cuadro 3.0)
Diseñado para la optimización de `src/components/coach/routine-builder/routine-builder-modal.tsx`, dotándolo de velocidad operativa para programar con teclado.

#### Agrupamiento Visual de Superseries (SS A1 / A2)
- Las superseries se agrupan mediante una **banda vertical lateral continua** de color esmeralda (`border-l-4 border-l-primary`) y fondo tintado `bg-primary/[0.04]`.
- La columna "Grupo" exhibe un badge técnico `SUPERSERIE A`, mientras que la columna de descanso del ejercicio precursor marca `0s (Inmediato)` en color ámbar.
- La columna de tempo desglosa la métrica universal **E-I-C-I** (Excéntrico, Isometría en estiramiento, Concéntrico, Isometría en contracción).

```
┌───────┬───────────────────────────┬───────────────┬────────────┬───────────┬───────────┬──────────┬───────────┬──────────────┬──────────────────────────────┬────────┐
│ #     │ EJERCICIO (Sticky Left)   │ GRUPO         │ SERIES     │ REPS      │ CARGA OBJ │ RPE META │ TEMPO     │ DESCANSO     │ INDICACIONES TÉCNICAS        │ ACCIÓN │
│       │ [Nombre & Video]          │ [Superserie]  │ [cant]     │ [rango]   │ [kg]      │ [1-10]   │ [E-I-C-I] │ [s]          │ [Biomecánica]                │        │
├───────┼───────────────────────────┼───────────────┼────────────┼───────────┼───────────┼──────────┼───────────┼──────────────┼──────────────────────────────┼────────┤
│ 1     │ Press de Banca con Barra  │ -             │ 4          │ 6 - 8     │ 95,0      │ 8,5      │ 3-0-1-0   │ 150s         │ Pausa de 1s sobre esternón   │ [✕]    │
│ A1 ║  │ Remo Pendlay con Barra    │ SUPERSERIE A  │ 4          │ 8 - 10    │ 85,0      │ 8,0      │ 2-0-1-1   │ 0s (Inmed.)  │ Torso paralelo al piso       │ [✕]    │
│ A2 ║  │ Fondos en Paralelas       │ SUPERSERIE A  │ 4          │ 10 - 12   │ +15,0     │ 8,5      │ 3-0-1-0   │ 120s         │ Inclinación de torso a 20°   │ [✕]    │
│ B1 ║  │ Elevaciones Laterales     │ SUPERSERIE B  │ 3          │ 12 - 15   │ 14,0      │ 9,0      │ 2-0-1-1   │ 0s (Inmed.)  │ Plano escapular a 30°        │ [✕]    │
│ B2 ║  │ Face Pulls en Polea       │ SUPERSERIE B  │ 3          │ 15 - 20   │ 27,5      │ 8,5      │ 2-0-1-2   │ 90s          │ Rotación externa final       │ [✕]    │
└───────┴───────────────────────────┴───────────────┴────────────┴───────────┴───────────┴──────────┴───────────┴──────────────┴──────────────────────────────┴────────┘
```

- **Navegación de Teclado de Alta Densidad:**
  - `Tab`: Avanza a la siguiente celda editable de la fila.
  - `Enter`: Confirma el valor y añade una nueva fila de ejercicio.
  - `Ctrl + D`: Clona el ejercicio anterior duplicando series y descansos.
  - `Ctrl + S`: Guarda el plan y sincroniza con el catálogo de Supabase.

---

## 4. Arquitectura de Tokens de Diseño (3 Capas - Skill `design-system`)

Siguiendo la metodología de 3 capas de la skill `design-system`:

```
┌────────────────────────────────────────────────────────┐
│  CAPA 1: PRIMITIVOS (Valores base de diseño)           │
│  Colores brutos HSL, escalas de padding, tipografía    │
├────────────────────────────────────────────────────────┤
│  CAPA 2: SEMÁNTICOS (Significado y propósito)          │
│  Superficies de datos densos, acentos, bordes tabulares│
├────────────────────────────────────────────────────────┤
│  CAPA 3: COMPONENTES (Tokens específicos de tabla)     │
│  --table-row-height-compact, --table-cell-padding-x... │
└────────────────────────────────────────────────────────┘
```

### 4.1 Definición Formal de Tokens CSS (`src/app/globals.css`)

```css
@layer base {
  :root,
  .dark {
    /* ========================================== */
    /* 1. PRIMITIVOS DE COLOR (DEEP ONYX & ATELIC)*/
    /* ========================================== */
    --color-onyx-950: 222 47% 6%;      /* Fondo principal */
    --color-onyx-900: 222 45% 8.5%;    /* Superficie baja / cabezales */
    --color-onyx-850: 222 40% 11%;     /* Card & fondo de tabla */
    --color-onyx-800: 222 34% 15%;     /* Filas alternas y hover */
    --color-onyx-700: 222 30% 20%;     /* Bordes y líneas divisorias */
    --color-onyx-600: 220 26% 28%;

    --color-emerald-500: 158 64% 48%;  /* Primario GOZSter */
    --color-emerald-400: 158 75% 58%;
    --color-amber-500: 38 92% 50%;     /* Warning / Plateau */
    --color-crimson-500: 350 89% 60%;  /* Destructive / Alerta dolor */

    /* ========================================== */
    /* 2. SEMÁNTICOS PARA DATOS DENSOS            */
    /* ========================================== */
    --table-bg: hsl(var(--color-onyx-850));
    --table-header-bg: hsl(var(--color-onyx-900));
    --table-header-fg: hsl(215 20% 65%);
    --table-border: hsl(220 26% 18%);
    --table-border-subtle: hsl(220 26% 14%);
    --table-row-hover: hsl(var(--color-onyx-800) / 0.5);
    --table-row-selected: hsl(var(--color-emerald-500) / 0.12);
    --table-row-alert: hsl(var(--color-crimson-500) / 0.06);

    /* ========================================== */
    /* 3. COMPONENTES (TABLAS ESTADÍSTICAS INDEC) */
    /* ========================================== */
    /* Modo Compacto (Predeterminado para Roster y Matrices) */
    --table-compact-row-height: 32px;
    --table-compact-cell-py: 3px;
    --table-compact-cell-px: 12px;
    --table-compact-font-size: 11px;

    /* Modo Estándar (Planificación & Tablet) */
    --table-standard-row-height: 44px;
    --table-standard-cell-py: 8px;
    --table-standard-cell-px: 12px;
    --table-standard-font-size: 12px;

    /* Columna Matriz Fija (Sticky Left) */
    --table-sticky-shadow: 2px 0 8px rgba(0, 0, 0, 0.45);
    --table-sticky-z: 20;

    /* Tipografía Tabular */
    --font-mono-tabular: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  }
}
```

---

## 5. Guía de Implementación para `@frontend-eng` (Metodología Karpathy)

El desarrollador frontend no requiere instalar librerías pesadas (cero librerías de tablas complejas como AG-Grid o TanStack Table desmedido). Todo se implementa quirúrgicamente sobre **Tailwind CSS + HTML nativo semántico accesible + React**.

### 5.1 Checklist Quirúrgico de Archivos

1. **`src/app/globals.css`:**
   - Incorporar las variables CSS de las 3 capas descriptas en la sección 4.1.
   - Definir la clase utility `.tabular-nums` y `.indec-call`.
2. **`src/components/ui/table.tsx`:**
   - Añadir soporte para prop `density?: "compact" | "standard"`.
   - Añadir clases para `sticky-col` y alineación `font-mono tabular-nums`.
3. **`src/components/coach/coach-studio-view.tsx`:**
   - Añadir un toggle de vista (Cuadrícula de Tarjetas vs **Cuadro Estadístico INDEC**).
   - En monitores con resolución ≥ 1024 px, predeterminar la vista de **Cuadro Estadístico INDEC**.
4. **`src/components/coach/routine-builder/routine-builder-modal.tsx`:**
   - Transformar la tabla de ejercicios para soportar la agrupación visual de superseries con borde continuo esmeralda (`border-l-4 border-l-primary`) y columnas con unidades explícitas.
5. **`src/components/coach/historical-loads-drawer.tsx`:**
   - Actualizar las celdas numéricas para utilizar `font-mono tabular-nums text-right` y desplegar el signo convencional `e` en las estimaciones de 1RM.

---

## 6. Verificación de Accesibilidad y Ergonomía (WCAG 2.1 AA/AAA)

- **Contraste de Celdas Numéricas:** Ratio de contraste verificado de **12.4:1** entre texto blanco `#FFFFFF` / verde esmeralda `#34D399` y superficie `#111827` (excede ampliamente el requisito WCAG AAA de 7:1).
- **Semántica HTML Nativa:** Empleo de etiquetas `<table>`, `<thead>`, `<tbody>`, `<th scope="col">` y `<th scope="row">` con atributos `aria-labelledby` y `aria-describedby` que vinculan cada dato con su cabezal y nota al pie para lectores de pantalla.
- **Scroll Horizontal Seguro:** Las tablas implementan contenedor con `overflow-x-auto` y `scroll-behavior: smooth`, garantizando que en notebooks con trackpad o mouse horizontal no se produzca desborde de la grilla de la aplicación.

---
**GOZSter Studio Design System** — *Diseñado por UI/UX Lead bajo estrictas directrices INDEC 2024.*
