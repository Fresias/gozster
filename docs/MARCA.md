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

## 4. Nueva Dirección de Arte: Arquitectura Cromática Bimodal (Coach Studio Zinc + `.theme-athlete`)

Tras el review UX/UI (GOZS-368, `08-fidelidad-visual.md §2` y `09-respuesta-pm.md P01`), la dirección de arte adopta como base global la **paleta de neutros zinc de shadcn/ui** para **Coach Studio**, mientras que el **Azul Atlántico (`#2563EB`)** queda reservado para la **Athlete App** (`/athlete`) y la **landing pública** mediante el scope `.theme-athlete`.

### 4.0 Identidad de Coach Studio vs. Athlete App / Landing (`P01`)

- **Coach Studio (Base Global `:root` / `.dark`):**
  - **Paleta:** Neutros zinc con fondo y tarjetas en el mismo blanco (`#FFFFFF` / `--background: 0 0% 100%`), bordes `#E4E4E7` (`--border: 240 5.9% 90%`), sidebar `#FAFAFA` (`--sidebar: 0 0% 98%`) y **primario negro zinc `#18181B`** (`--primary: 240 5.9% 10%`, texto `#FAFAFA`). En `.dark`, fondo `#09090B` (`240 10% 3.9%`) y primario `#FAFAFA` (`0 0% 98%`).
  - **Isotipo / Logo de Coach Studio:** Cuadrado negro `"G"` de `32×32 px` (`size-8 rounded-lg bg-primary text-primary-foreground`, `"G"` en `14/700`) acompañado de `"GOZSter"` (`14/600`) y `"Coach Studio"` (`12 px text-muted-foreground`), sin `"Studio"` en azul.
- **Athlete App y Landing Pública (`.theme-athlete`):**
  - Envuelven su contenedor raíz en `.theme-athlete`, que redefine `--primary: 221 83% 53%` (Azul Atlántico `#2563EB`), `--primary-foreground: 210 40% 98%` y `--ring: 221 83% 53%` en modo claro, y `--primary: 199 89% 48%` (Cian `#38BDF8`) en `.dark .theme-athlete`.

### 4.1 Principios del Sistema Bimodal

1. **Modo Día Suave (Light Mode / Studio Calm):**
   - **Propósito:** Diseñado para entrenadores que pasan horas frente a monitores de escritorio planificando semanas de entrenamiento, así como para atletas entrenando en exteriores o gimnasios con iluminación natural.
   - **Superficies:** Fondo off-white cálido (`#F8FAFC`), tarjetas en blanco puro (`#FFFFFF`) y bordes nítidos ultra-suaves (`#E2E8F0`). Elimina el blanco "hospital" que fatiga la vista.
   - **Tipografía:** Grafito profundo (`#0F172A` / Slate 900), evitando el negro puro (`#000000`) para una lectura tipográfica editorial y descansada.
   - **Acento:** Azul Atlántico (`#2563EB` / Blue 600), que evoca precisión técnica, sobriedad y profesionalismo deportivo.

2. **Modo Noche Pulido (Refined Dark Mode / Athletic Night):**
   - **Propósito:** Optimizado para la Athlete App en sótanos y sesiones nocturnas, y para coaches en salas de baja luminosidad.
   - **Superficies:** Sustituye el negro abisal (`#080A0D`) por un carbón grafito azulado elegante (`#0F172A` / Slate 900) y tarjetas elevadas en azul pizarra (`#1E293B` / Slate 800) con bordes translúcidos de baja tensión (`rgba(255, 255, 255, 0.08)`).
   - **Tipografía:** Tiza suave (`#F8FAFC`) con soporte en gris frío (`#94A3B8`).
   - **Acento:** Cian Suave (`#38BDF8` / Sky 400), técnico, aerodinámico y con excelente ratio de contraste (8.2:1) sin la estridencia visual del amarillo forjado anterior.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        GOZSTER MATRIZ CROMÁTICA BIMODAL                                │
├──────────────────────┬──────────────────────┬──────────────────────┬───────────────────┤
│ Token Semántico      │ MODO DÍA SUAVE (Hex) │ MODO NOCHE PULIDO(Hex│ Función y Rol     │
├──────────────────────┼──────────────────────┼──────────────────────┼───────────────────┤
│ --background         │ #F8FAFC (Slate 50)   │ #0F172A (Slate 900)  │ Lienzo base       │
│ --card / --surface   │ #FFFFFF (Pure White) │ #1E293B (Slate 800)  │ Tarjetas/módulos  │
│ --surface-container  │ #F1F5F9 (Slate 100)  │ #243247 (Slate 750)  │ Bloques internos  │
│ --surface-elevated   │ #FFFFFF + Shadow     │ #334155 (Slate 700)  │ Popovers/modales  │
│ --border             │ #E2E8F0 (Slate 200)  │ rgba(255,255,255,0.08│ Separadores finos │
│ --foreground         │ #0F172A (Slate 900)  │ #F8FAFC (Slate 50)   │ Lectura principal │
│ --muted-foreground   │ #64748B (Slate 500)  │ #94A3B8 (Slate 400)  │ Etiquetas y notas │
├──────────────────────┼──────────────────────┼──────────────────────┼───────────────────┤
│ --primary            │ #2563EB (Azul Atl.)  │ #38BDF8 (Cian Suave) │ Foco, CTA, Timer  │
│ --primary-foreground │ #FFFFFF (Pure White) │ #0F172A (Slate 900)  │ Texto sobre CTA   │
│ --success (Series)   │ #10B981 (Esmeralda)  │ #34D399 (Esmeralda L)│ Series OK / Cuota │
│ --warning (Alertas)  │ #F59E0B (Ámbar)      │ #FBBF24 (Ámbar L)    │ Pagos pendientes  │
│ --destructive (Fallo)│ #EF4444 (Rosa/Rojo)  │ #F87171 (Rojo Suave) │ Dolor / Sin plan  │
│ --info (Técnica/RPE) │ #3B82F6 (Azul Vivo)  │ #60A5FA (Azul Claro) │ Videos y notas    │
└──────────────────────┴──────────────────────┴──────────────────────┴───────────────────┘
```

### 4.2 Justificación Funcional de los Colores Bimodales

- **Azul Atlántico (`#2563EB`) & Cian Suave (`#38BDF8`):** Representan el rigor analítico del software de ingeniería y biomecánica deportiva. En modo claro, el azul 600 aporta presencia y peso institucional sin fatiga; en modo oscuro, el cian 400 brilla con sutileza matemática y nitidez extrema sin quemar la pupila.
- **Esmeralda (`#10B981` / `#34D399`):** Validación dopaminérgica instantánea de series logradas y estado de atleta al día. A diferencia de un verde lima flúo, la esmeralda equilibra calidez y vigor atlético.
- **Ámbar Cálido (`#F59E0B` / `#FBBF24`):** Diseñado para alertar sin provocar pánico: cuotas en vencimiento próximo, 1RM provisorio y advertencias de volumen.
- **Rosa / Rojo Suave (`#EF4444` / `#F87171`):** Indicador quirúrgico para dolor articular, fallos técnicos y alumnos sin plan de entrenamiento. Elimina el rojo chillón agresivo previo.
- **Superficies Slate (`#0F172A`, `#1E293B`, `#F8FAFC`, `#FFFFFF`):** Base de temperatura de color neutra-fría que previene la sensación de "software sucio" o amarillento.

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
