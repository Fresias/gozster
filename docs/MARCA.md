# Manual de Marca y Dirección de Arte: GOZSter Performance
## Sistema de Identidad Visual No Genérica, Biomecánica y de Alto Rendimiento

> **Gobierno de Marca:** GOZSter Open Source Athletic Platform  
> **Dirección:** `@UI/UX & Art Director`  
> **Estado:** Aprobado / Vigente  
> **Filosofías Rectoras:** Metodología Karpathy (precisión quirúrgica) y Regla Ponytail (cero bloatware visual)

---

## 1. Declaración de Intención y Tesis Visual

El entrenamiento de fuerza de élite no es una simulación gamer ni una aplicación bancaria con fondo oscuro. Es **física aplicada, biología humana y precisión milimétrica**: barras de acero estriado, placas de hierro calibradas, tensión mecánica sobre el tejido muscular y progresión aritmética rigurosa.

GOZSter rompe con los dos grandes vicios del diseño actual de software deportivo:
1. **El cliché gamer / neón:** Colores púrpuras chillones, gradientes descontrolados, bordes luminosos y tipografías ilegibles que transmiten inmadurez.
2. **El "AI design slop":** Plantillas genéricas de Shadcn copiadas y pegadas sin adaptación, bordes decorativos excesivos, emojis como iconos (`📊`, `🏋️‍♂️`, `🔥`) y fondos con polígonos difusos (`polygon clip-path`) que no aportan valor operativo.

### La Tesis Visual: *Precision Mechanical Strength*
Una estética inspirada en el instrumental de laboratorio biomecánico, las máquinas de mecanizado CNC de alta precisión y el equipamiento olímpico de halterofilia (Eleiko, Rogue, Ivanko). Sobria, industrial, utilitaria y con un contraste óptico implacable pensado para el entorno físico real.

---

## 2. Benchmark de Referencias Top de la Industria

| Plataforma | Fortaleza Detectada | Qué Adoptamos en GOZSter | Qué Descartamos Radicalmente |
| :--- | :--- | :--- | :--- |
| **Hevy** | Registro de series a máxima velocidad y micro-interacciones de confirmación. Exclusión estricta de series de calentamiento en el volumen total. | Ergonomía táctil de series, feedback inmediato al tildar y distinción entre volumen bruto y volumen efectivo. | Interfaz con sobrecarga de badges sociales que distraen durante el descanso. |
| **Everfit** | Matriz web densa para seguimiento de decenas de atletas en simultáneo. | Arquitectura de tabla centralizada con filtros rápidos y asignación de planes en un solo clic. | Formularios modales anidados profundos que provocan pérdida de contexto al programar. |
| **Strong App & RP Hypertrophy** | Foco científico en RIR/RPE y tipografía monoespaciada/tabular para cifras de tonelaje. | Alineación estricta a la derecha con fuentes tabulares (`tabular-nums font-mono`) y selector visual de RPE de 1 a 10. | Aspecto visual excesivamente crudo y desprovisto de ritmo jerárquico. |
| **Whoop & Gentler Streak** (Apple Design Awards) | Sensibilidad en el contraste oscuro, jerarquía de fatiga y feedback sensorial auditivo/háptico. | Modo oscuro deportivo con ratios de contraste WCAG AAA y beeps/vibración táctil para el cronómetro de descanso. | Curvas decorativas abstractas que consumen CPU y degradan el rendimiento offline en celulares económicos. |
| **Linear.app & TradingView** | Densidad de información limpia, cabezales fijos, navegación horizontal sin fricción y atajos de teclado. | Grilla de 12/16 columnas para Coach Studio, atajos de tabulación en constructor de rutinas y paleta neutra de capas. | Complejidad de menús contextuales multinivel no necesarios para un entrenador deportivo. |

---

## 3. Auditoría Anti-Slop del Código Actual de GOZSter

La auditoría del frontend previo (`src/app/page.tsx`, `src/app/globals.css`, `src/components/ui/`) reveló los siguientes elementos genéricos a eliminar:

1. **Gradientes difusos con polígonos decorativos:**
   - *Hallazgo:* En `src/app/page.tsx:15-26`, existía un contenedor absoluto con `blur-3xl`, `bg-gradient-to-tr from-primary/30 to-emerald-500/10` y un polígono SVG de 16 vértices.
   - *Diagnóstico de Slop:* Es el patrón más reconocible de plantillas generadas por IA de 2023-2024. No comunica estado, fatiga ni contexto deportivo.
   - *Resolución:* Eliminación total. Los fondos deben ser superficies sólidas o mallas de textura técnica ultra sutil con contraste controlado.

2. **Emojis utilizados como iconos:**
   - *Hallazgo:* Presencia de emojis Unicode (`📊`, `👥`, `📈`, `⚡`, `🏋️`) en encabezados de tarjetas y secciones clave.
   - *Diagnóstico de Slop:* Los emojis cambian de aspecto y tamaño según el sistema operativo (iOS, Android, Windows, macOS), rompen la seriedad atlética y degradan la accesibilidad con lectores de pantalla.
   - *Resolución:* Prohibición absoluta de emojis en el layout. Uso exclusivo de iconos SVG vectoriales con trazo consistente (1.5px / 2px) de la librería Lucide.

3. **Bordes múltiples anidados ("Border Fatigue"):**
   - *Hallazgo:* Tarjetas con `border border-border/80` que contenían sub-bloques con `border border-border/60`, generando una sensación de "cajas dentro de cajas".
   - *Resolución:* Jerarquía por proximidad y superficies tonales (*Surface Elevation*). El espaciado negativo y los cambios de luminancia tonal separan los grupos, reduciendo las líneas de borde a las estrictamente necesarias para el contraste.

4. **Falta de contraste deportivo real bajo luz adversa:**
   - *Hallazgo:* Textos secundarios con clases `text-muted-foreground` con contraste de apenas 3.8:1 sobre fondos oscuros, ilegibles bajo tubos fluorescentes de gimnasio o con sudor en los ojos.
   - *Resolución:* Escala de contraste recalibrada con ratios mínimos de **7:1 (WCAG AAA)** para valores métricos clave (peso, repeticiones, timer).

---

## 4. Nueva Dirección de Arte: Paleta Cromática de Alto Rendimiento

La nueva paleta de GOZSter abandona los tonos púrpura gamer y los azules genéricos de SaaS. Adopta una arquitectura tonal basada en materiales biomecánicos y metales industriales:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        GOZSTER PALETA CROMÁTICA                        │
├────────────────────────────────┬─────────────────┬─────────────────────┤
│ Color Semántico                │ HSL Token       │ Hex Ref / Rol       │
├────────────────────────────────┼─────────────────┼─────────────────────┤
│ Obsidian Black (Background)    │ 224 25% 4%      │ #080A0D (Fondo)     │
│ Cast Iron Dark (Surface Low)   │ 224 22% 7%      │ #0E1117 (Tarjetas)  │
│ Plate Steel (Surface High)     │ 224 18% 11%     │ #161A24 (Contenedor)│
│ Elevated Steel (Surface High+) │ 224 16% 16%     │ #222736 (Popovers)  │
│ Border Steel                   │ 224 14% 20%     │ #2B3245 (Líneas)    │
├────────────────────────────────┼─────────────────┼─────────────────────┤
│ Forged Gold / Amber (Primary)  │ 42 100% 50%     │ #FFB800 (Foco/Timer)│
│ Primary Foreground             │ 224 30% 6%      │ #0A0D14 (Contraste) │
│ Hypertrophy Green (Success)    │ 152 76% 46%     │ #1BC47D (Completado)│
│ Fatigue Red (Destructive/Pain) │ 354 85% 56%     │ #F02D4E (Fallo/Dolor│
│ Tension Blue (Info / RPE)      │ 210 90% 56%     │ #2B87F7 (Técnica)   │
├────────────────────────────────┼─────────────────┼─────────────────────┤
│ Chalk White (Foreground 100%)  │ 210 40% 98%     │ #F8FAFC (Lectura)   │
│ Light Steel (Foreground 80%)   │ 215 25% 82%     │ #CBD5E1 (Secundario)│
│ Muted Steel (Foreground 60%)   │ 215 16% 62%     │ #8B98AD (Metadatos) │
└────────────────────────────────┴─────────────────┴─────────────────────┘
```

### Justificación Funcional de los Colores
- **Forged Gold / Amber (`#FFB800`):** Máxima visibilidad cromática en la retina humana bajo fatiga periférica. Utilizado en el temporizador activo, el botón de acción principal y los estados de foco.
- **Hypertrophy Green (`#1BC47D`):** Confirmación visual instantánea de series logradas. Al pulsar "check", la serie vira a este tono para una recompensa dopaminérgica limpia.
- **Fatigue Red (`#F02D4E`):** Alertas de dolor articular, fallos técnicos y estados vencidos de membresía. No se usa para decoración.
- **Obsidian Black (`#080A0D`):** Fondo optimizado para pantallas OLED que ahorra batería en el celular del alumno y elimina el brillo enceguecedor en sótanos oscuros.

---

## 5. Sistema Tipográfico Técnico

El sistema tipográfico de GOZSter combina una tipografía geométrica para títulos atléticos, una tipografía de ingeniería para la interfaz y una fuente monoespaciada obligatoria para los números tabulares.

### 1. Display & Títulos de Fuerza: `Outfit` / `Barlow Condensed`
- **Uso:** Nombre de rutinas, temporizador principal, encabezados del Coach Studio.
- **Tratamiento:** Pesos `700` y `800`, `tracking-tight` (-0.025em), mayúsculas técnicas en indicadores clave.
- **Personalidad:** Impone presencia física, sensación de bloque macizo.

### 2. Interfaz y Lectura General: `Inter`
- **Uso:** Roster de alumnos, nombres de ejercicios, notas del entrenador, navegación.
- **Tratamiento:** Pesos `400` (cuerpo), `500` (etiquetas), `600` (subtítulos).
- **Personalidad:** Máxima legibilidad neutra en tamaños reducidos (11px - 14px).

### 3. Cifras Métricas y Tabulares: `JetBrains Mono` / `Geist Mono`
- **Uso Obligatorio en:** Peso en kg, repeticiones, RPE, 1RM Brzycki/Epley, cronómetro `MM:SS`, tonelaje acumulado y cuadros del INDEC.
- **Clase Tailwind:** `font-mono tabular-nums`.
- **Justificación:** Los números tabulares garantizan que dígitos como el `1` y el `8` ocupen exactamente el mismo ancho horizontal, evitando saltos visuales durante la edición o el paso del tiempo en el timer.

---

## 6. Texturas, Ritmo Visual y Grilla

1. **Textura Técnica (Micro-Grid Sutil):**
   - En el Coach Studio (Desktop), se permite un patrón de grilla de ingeniería de 24x24 px al 2% de opacidad sobre el fondo, emulando un plano técnico o papel milimetrado de biomecánica.
2. **Elevaciones Físicas y Sombras:**
   - Quedan prohibidas las sombras difusas con desenfoques sucios mayores a 20px.
   - Se utilizan dos niveles de elevación nítidos:
     - `elevation-1`: Borde sutil `border-white/10` + sombra de contacto `0 2px 4px rgba(0,0,0,0.6)`.
     - `elevation-2` (Modales / Drawers): Borde `border-white/15` + sombra `0 12px 32px rgba(0,0,0,0.8)`.
3. **Microinteracciones Funcionales:**
   - La pulsación de botones táctiles en mobile cuenta con una reducción de escala física instantánea (`active:scale-[0.97]` en 100ms) para confirmación táctil inmediata antes de que la pantalla responda por red.
