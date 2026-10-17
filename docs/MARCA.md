# Manual de Marca, Dirección de Arte y Auditoría Anti-Slop: GOZSter

**Versión:** 2.0 (Dirección de Arte Singularity)  
**Autor:** `@UI/UX & Art Director`  
**Destinatarios:** `@PM-GOZster`, Gabriel Sánchez (Owner), `@frontend-eng`  
**Skill de Referencia:** `no-ai-design-slop` • `design-system` • `ui-styling` • `ui-ux-pro-max`  
**Filosofías de Gobierno:** Metodología Karpathy (quirúrgico y simple) • Regla Ponytail (cero bloatware visual)

---

## 1. Manifiesto de Marca & Concepto Rector: "Industrial Precision & Biomechanical Rigor"

El entrenamiento de fuerza de alto rendimiento no es un videojuego infantil ni un template SaaS corporativo con degradados morados genéricos. Es física newtoniana, fricción de moleteado de acero olímpico, tensión neuromuscular, fatiga sistémica y telemetría de datos crudos.

GOZSter abandona el look de "starter kit de IA con sombras Material 3 pegadas a Shadcn" y establece una identidad visual singular: **Precisión Industrial y Rigor Biomecánico (Industrial Precision & Biomechanical Rigor)**.

### Los Dos Mundos Tajantes de GOZSter

1. **Athlete App (PWA Mobile-First en el Gimnasio — 390 px):**
   - **Contexto real:** Luz de tubo fluorescente parpadeante, manos con magnesio, sudor, fatiga cerebral aguda (RPE 9-10), sótanos sin cobertura 4G/5G.
   - **Mandato ergonómico:** Operación 100% con el pulgar en la zona baja de la pantalla (*Thumb Zone*), botones de acción de 48 px a 56 px, contraste visual extremo (WCAG AAA) legible a 2 metros de distancia, feedback instantáneo sin depender de red (*Offline-First Telemetry*).
2. **Coach Studio (Desktop Workstation — 1440 px):**
   - **Contexto real:** El entrenador planifica durante 4 a 6 horas diarias frente a un monitor de escritorio.
   - **Mandato ergonómico:** Densidad de información pura (estilo Linear.app y Bloomberg), adopción estricta de las normas de cuadros estadísticos del **Manual de Estilo INDEC 2024**, cabezales de tabla fijos, alineación numérica tabular a la derecha (`tabular-nums`), eliminación de scrolls innecesarios y tarjetas sobredimensionadas.

---

## 2. Benchmark Competitivo & Arquitectura de Referencia

| Plataforma | Puntos Fuertes Identificados | Errores / Vicios a Evitar en GOZSter | Aplicación en GOZSter |
| :--- | :--- | :--- | :--- |
| **Hevy** | Registro ultra veloz de series en 1 toque; cálculo estricto de tonelaje efectivo excluyendo calentamiento (*Warmup*); feedback de tilde instantáneo. | Enfoque puramente social / consumo masivo; carece de panel de control denso para entrenadores profesionales y periodización multivariable. | Adoptamos la taxonomía cuádruple de series (W, N, F, D) y la microinteracción de confirmación rápida, adaptada a estética de forja pesada. |
| **Everfit** | Panel web estructurado para entrenadores; roster centralizado de atletas y asignación de rutinas. | Sobrecarga de clics para acciones simples; modales superpuestos pesados; paleta corporativa genérica sin vibra de hierro real. | Creamos un panel de doble columna en 1440px donde la nómina y el detalle del atleta conviven sin abrir modales bloqueantes. |
| **Strong App & RP Hypertrophy** | Foco científico sin adornos; tablas monoespaciadas para cálculo de 1RM, RIR y sobrecarga progresiva. | Strong luce abandonado y anticuado (iOS 10); RP Hypertrophy parece una planilla de Excel monocromática sin jerarquía táctil. | Fusionamos el rigor científico del RIR/1RM con tipografía angular moderna y controles táctiles de 48px. |
| **Gentler Streak & Whoop (ADA Winners)** | Uso maestro del contraste sobrio en fondos oscuros; datos biométricos con peso contundente; feedback háptico/sensorial elegante. | Tendencia a la abstracción estética excesiva que oculta números concretos detrás de aros de colores. | Priorizamos siempre el valor numérico en kilogramos y repeticiones sobre cualquier gráfico puramente decorativo. |
| **Linear.app & Bloomberg Terminal** | Máxima densidad de datos sin fatiga cognitiva; bordes nítidos de 1px maquinado; alineación tabular impecable de números. | Ninguno para desktop. Son el estándar de oro de productividad profesional. | Base directa de la arquitectura de tablas del Coach Studio bajo normas INDEC. |

---

## 3. Auditoría Anti-Slop del Código Actual de GOZSter

Aplicando los principios de la skill `no-ai-design-slop`, identificamos los siguientes defectos en la base de código actual:

### Hallazgo 1: Fondo Cliché "Deep Space" y Verde Menta Genérico
- **Ubicación:** `src/app/globals.css` (`--background: 222 47% 6%`, `--primary: 158 64% 48%`) y `tailwind.config.ts`.
- **Diagnóstico:** El tono de fondo tiene un matiz azul espacial saturado típico de plantillas de IA tipo "Supabase Dark / Vercel Starter". El verde esmeralda brillante (`158 64% 48%`) es el default de startups genéricas de salud o crypto.
- **Acción Correctiva:** Migrar a **Obsidian Crucible** (`#0A0B0C`, HSL 210 9% 4%), un negro profundo neutro optimizado para paneles OLED, y reemplazar el acento primario por **Kinetic Amber** (`#FF9E1B`), color de señalética pesada y metal forjado al calor con contraste 10.5:1.

### Hallazgo 2: Degradado Flotante en 30° con Polígono ClipPath (AI Template Slop)
- **Ubicación:** `src/app/page.tsx` (líneas 15-26):
  ```tsx
  <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] ... bg-gradient-to-tr from-primary/30 to-emerald-500/10 opacity-30" style={{ clipPath: "polygon(...)" }} />
  ```
- **Diagnóstico:** Copia directa del hero template estándar de Tailwind UI. No comunica ningún concepto atlético, no aporta valor de producto y distorsiona el renderizado en móviles modestos.
- **Acción Correctiva:** Eliminar completamente el polígono. Reemplazarlo por una micro-retícula sutil de ingeniería (*engineering grid*) o un fondo sobrio de acero mate.

### Hallazgo 3: Epidemia de Emojis Infantiles como Sustitutos de Iconografía
- **Ubicación:** `src/app/page.tsx`, `live-workout.tsx`, `student-detail.tsx`, `retention-kpi-cards.tsx` (`⚡`, `📊`, `📱`, `👥`, `📈`, `🛠️`, `⏱️`, `🏋️`, `🔥`, `🛡️`, `📐`, `✨`).
- **Diagnóstico:** El uso desmedido de emojis de chat resta seriedad profesional y denota un prototipo no terminado. Además, se renderizan de forma inconsistente entre iOS, Android y Windows.
- **Acción Correctiva:** Reemplazar por iconografía técnica vectorial limpia (Lucide Icons o Phosphor Icons en tono monocromo de 16px/18px) o prescindir del icono cuando el texto ya es autoexplicativo (jerarquía antes que ornamentación).

### Hallazgo 4: Conflicto Estructural entre Sombras Material 3 y Bordes Shadcn
- **Ubicación:** `tailwind.config.ts` (`shadow-m3-1`, `shadow-m3-2`, `surface-container-*`) y `src/app/globals.css`.
- **Diagnóstico:** Shadcn UI está diseñado bajo un modelo de superficies planas con bordes de 1px (`border-border`). Aplicarle sombras flotantes difusas de Material 3 crea un híbrido sucio, donde las tarjetas tienen tanto borde grisáceo pesado (`border-border/80`) como sombra negra difusa, generando ruido visual innecesario.
- **Acción Correctiva:** Eliminar sombras difusas en componentes de datos. Utilizar elevación mediante **color de superficie tonal** (`#111316` → `#16191D` → `#1B1F24`) y bordes mecanizados nítidos de 1px (`border: 1px solid rgba(255, 255, 255, 0.08)`).

### Hallazgo 5: Controles de Carga Sub-Ergonómicos en Modo Gimnasio
- **Ubicación:** `src/components/athlete/live-workout.tsx` (líneas 611, 626, 672, 687, 734, 749).
- **Diagnóstico:** Los botones de incremento (-2.5, +2.5, -1, +1, -0.5, +0.5) tienen clase `min-h-[36px]`. En el gimnasio, con el pulgar fatigado o tembloroso tras una serie pesada, un botón de 36px produce errores continuos de pulsación.
- **Acción Correctiva:** Establecer altura mínima de **48 px** para todos los steppers táctiles y **56 px** para el botón de confirmación de serie.

### Hallazgo 6: Desperdicio de Espacio Vertical en Coach Studio
- **Ubicación:** `src/components/coach/retention-kpi-cards.tsx`.
- **Diagnóstico:** Las tarjetas de métricas ocupan casi 200px verticales en la parte superior, empujando la tabla de alumnos hacia abajo y forzando al entrenador a scrollear constantemente para ver la nómina.
- **Acción Correctiva:** Convertir el bloque KPI en una **franja métrica horizontal compacta** de 80px de alto, inspirada en las normas INDEC, dejando el 85% de la pantalla para el espacio de trabajo activo.

---

## 4. Sistema de Tokens de Marca: "The Crucible & Steel"

### 4.1 Paleta de Color Cromática y Semántica

```css
:root,
.dark {
  /* ========================================================
     BASE DE SUPERFICIE: OBSIDIAN CRUCIBLE & TUNGSTEN STEEL
     ======================================================== */
  --background: 210 9% 4%;                /* #0A0B0C: Negro neutro profundo, sin azul espacial */
  --foreground: 210 20% 98%;              /* #F8FAFC: Texto blanco nítido */

  --surface-ground: 210 9% 4%;           /* Fondo de la aplicación */
  --surface-subtle: 214 12% 7%;           /* #101215: Paneles de fondo */
  --surface-card: 214 12% 10%;            /* #16191D: Tarjetas y contenedores */
  --surface-panel: 214 12% 13%;           /* #1C2025: Paneles elevados */
  --surface-high: 214 12% 17%;            /* #242930: Estados hover y chips */

  /* ========================================================
     ACENTO IDENTITARIO: KINETIC AMBER (METAL FORJADO)
     Contraste 10.5:1 sobre Obsidian Crucible (WCAG AAA)
     ======================================================== */
  --primary: 34 100% 55%;                 /* #FF9E1B: Ámbar cinético de alta visibilidad */
  --primary-foreground: 0 0% 0%;          /* #000000: Texto negro puro sobre ámbar */
  --primary-hover: 34 100% 62%;           /* #FFB144 */
  --primary-muted: 34 100% 55% / 0.15;    /* Fondo suave para badges activos */

  /* ========================================================
     SEÑALÉTICA DE RENDIMIENTO & TAXONOMÍA DE SERIES (GYM)
     ======================================================== */
  --signal-warmup: 215 16% 65%;           /* #94A3B8: Serie W (Calentamiento/Aproximación) */
  --signal-normal: 34 100% 55%;           /* #FF9E1B: Serie N (Normal efectiva) */
  --signal-failure: 350 89% 60%;          /* #EF4444: Serie F (Fallo concéntrico / RPE 10) */
  --signal-dropset: 238 84% 67%;          /* #818CF8: Serie D (Drop Set descendente) */
  --signal-timer: 187 100% 50%;           /* #00E5FF: Cronómetro de descanso (Cryo Cyan) */
  --signal-success: 152 76% 40%;          /* #10B981: Serie completada / Sincronizado */

  /* ========================================================
     BORDES MAQUINADOS & CONTROLES
     ======================================================== */
  --border: 0 0% 100% / 0.08;             /* Borde maquinado de 1px sutil */
  --border-strong: 0 0% 100% / 0.16;      /* Borde de foco o seleccionado */
  --radius: 0.5rem;                       /* 8px: Radios sobrios y mecánicos, no bulbosos */
}
```

### 4.2 Escala Tipográfica de Triple Rol

1. **Display & Títulos de Impacto:** `Chakra Petch` (Weights: 600, 700)
   - Tipografía de ingeniería deportiva, angulosa y técnica. Evoca precisión de cronometraje y calibración de maquinaria pesada.
   - Uso: Títulos de sesión, nombres de ejercicios, cabezales de marcas y números de récords.
2. **Sistema & Lectura Contínua:** `Inter` (o `Geist`) (Weights: 400, 500, 600)
   - Neutra, sin interferencias ópticas, con soporte de *font-feature-settings: "cv02", "cv03", "cv04", "cv11"*.
   - Uso: Comentarios del entrenador, descripciones técnicas, rótulos de botones.
3. **Métricas, Tablas & Telemetría (Normas INDEC):** `JetBrains Mono` con `tabular-nums`
   - Espaciado numérico uniforme obligatorio para evitar saltos visuales al cambiar pesos o repeticiones.
   - Uso: Tonelaje, repeticiones, peso en kg, porcentajes de variación, cronómetros y tablas de alumnos.

---

## 5. Implementación de Normas INDEC 2024 en Coach Studio

El Coach Studio implementa las directrices del **Manual de Estilo del INDEC (Normas INDEC Nº 8, Edición 2024, Sección 4: Cuadros Web)**:

1. **Estructura de Cuadro Formal:**
   - Todo bloque de datos se numera e identifica formalmente: *Cuadro X.X: [Descripción de datos], [Período de referencia]*.
2. **Cabezales Fijos (*Sticky Headers*):**
   - Una única fila de encabezados que permanece visible en scroll vertical.
3. **Alineación Numérica Estricta:**
   - **Textos y nombres:** Alineación izquierda.
   - **Valores estadísticos (kg, %, reps, RPE):** Alineación estricta a la derecha con fuente monoespaciada tabular.
4. **Celdas Simples sin Fusiones Obscuras:**
   - Cero celdas combinadas que impidan la exportación limpia a CSV/Excel o el ordenamiento por columnas.
5. **Notas y Signos Convencionales al Pie:**
   - Cada cuadro incluye llamadas de notas (ej. `(1) Se excluyen series de calentamiento W`) y fuente de procedencia (`Fuente: Telemetría PWA GOZSter`).

---

## 6. Prototipos Verificados a Resolución Real

Se han construido dos prototipos HTML interactivos y capturado sus correspondientes pantallas a resolución real mediante renderizado headless:

1. **Athlete App (Modo Gym Móvil):**
   - **Archivo:** `prototypes/athlete_app_gym_mode.html`
   - **Captura:** `prototypes/athlete_app_gym_mode.png` (390 × 844 px)
   - **Características demostradas:** Header de telemetría offline, cronómetro circular de descanso de alto contraste en Cryo Cyan, tarjeta de ejercicio con series W y N completadas, serie activa con steppers de 48px y botón de confirmación ergonómico de 56px en Kinetic Amber.
2. **Coach Studio (Workstation INDEC Desktop):**
   - **Archivo:** `prototypes/coach_studio_indec_dashboard.html`
   - **Captura:** `prototypes/coach_studio_indec_dashboard.png` (1440 × 900 px)
   - **Características demostradas:** Franja compacta de KPIs (48 activos, 2 sin plan, 142.850 kg, 96.8% retención), tabla de alumnos con cabezal fijo y formato tabular INDEC, y panel derecho con gráfica sobria de sobrecarga en barras puras y tabla de récords 1RM Epley.

---

## 7. Instrucciones Quirúrgicas para `@frontend-eng` (Hand-off)

1. **Actualizar `tailwind.config.ts`:**
   - Registrar las fuentes `Chakra Petch`, `Inter` y `JetBrains Mono`.
   - Reemplazar las sombras `shadow-m3-*` por una clase utilitaria `border-steel: border border-white/10`.
   - Configurar los tokens de color HSL de acuerdo a la Sección 4.1.
2. **Refactorizar `src/app/page.tsx`:**
   - Eliminar el bloque de degradado `clipPath` de las líneas 15-26.
   - Reemplazar los emojis de los badges y botones por texto técnico limpio o iconos SVG monocromo.
3. **Ergonomía en `src/components/athlete/live-workout.tsx`:**
   - Actualizar los botones steppers (`-2.5`, `+2.5`, `-1`, `+1`) cambiando `min-h-[36px]` por `min-h-[48px]`.
   - Asegurar que el botón de completar serie mantenga `min-h-[56px]`.
4. **Densidad en `src/components/coach/`:**
   - Reemplazar el layout vertical de tarjetas de KPI por la franja métrica compacta horizontal de 80px.
   - Aplicar `tabular-nums` y `text-right` a todas las columnas numéricas de las tablas de alumnos.
