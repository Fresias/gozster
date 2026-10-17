# Especificación de UX Táctil y Modo Gimnasio: Athlete App
## Experiencia Móvil de Alto Rendimiento para Entrenamiento de Fuerza Bajo Condiciones Extremas

> **Regla de Negocio Innegociable:** La Athlete App es **EXCLUSIVAMENTE MÓVIL (PWA / Mobile-First)**. El alumno **NO usará la web desde una computadora**.  
> **Ámbito de Dispositivos:** Pantallas de 375px a 430px de ancho (iPhone, Android).  
> **Dirección:** `@UI/UX & Art Director`  
> **Implementación Técnica:** `@frontend-eng` (React, Next.js 15, Tailwind, Shadcn UI)

---

## 1. El Contexto Físico Real: Por qué Fallan las Apps Tradicionales

El gimnasio es un entorno hostil para la interacción digital:
- **Fatiga Neuromuscular:** Tras una serie pesada de sentadillas o peso muerto con RPE 9, el temblor en manos y dedos reduce la precisión motriz en más de un 60%.
- **Sudor y Polvo de Magnesio:** Las pantallas táctiles se vuelven resbaladizas o registran toques fantasma. Los botones pequeños (< 44px) provocan frustración inmediata.
- **Ambiente Adverso:** Iluminación deficiente en sótanos o tubos fluorescentes cenitales que generan reflejos enceguecedores sobre pantallas de vidrio.
- **Desconexión Frecuente:** Sótanos de hormigón armado donde la señal 4G/5G oscila o desaparece por completo.

Cualquier diseño que requiera más de 2 toques para registrar una serie o que use fuentes grises sobre gris medio **fracasa en el entrenamiento real**.

---

## 2. Ergonomía Táctil y "Thumb Zone" de Máxima Accesibilidad

```
┌──────────────────────────────────────┐
│  [HEADER FIJO: 54px]                 │  ZONA SUPERIOR (Solo información)
│  Modo Offline • Tonelaje • Menú      │  - Datos de lectura a distancia
├──────────────────────────────────────┤
│  [TARJETA DE EJERCICIO ACTIVO]       │  ZONA MEDIA (Inspección)
│  Press de Banca con Barra            │  - Historial de sesión anterior
│  4 series • RPE Objetivo 8.5         │  - Video de técnica (botón secundario)
├──────────────────────────────────────┤
│  [TABLA DE SERIES ERGONÓMICA]        │  ZONA DEL PULGAR (Acción Crítica)
│  ┌──┬──────┬─────┬─────┬─────┬─────┐ │  - El 85% de las interacciones
│  │# │Tipo  │Prev │Kg   │Reps │Check│ │    ocurre en los 300px inferiores
│  ├──┼──────┼─────┼─────┼─────┼─────┤ │  - Zonas táctiles ≥ 48px
│  │1 │ W    │80×8 │ 80  │  8  │ [✓] │ │  - Micro-steppers integrados
│  │2 │ N    │100×6│ 100 │  6  │ [✓] │ │
│  │3 │ N    │105×5│ 105 │  5  │ [ ] │ │
│  └──┴──────┴─────┴─────┴─────┴─────┘ │
├──────────────────────────────────────┤
│  [PANEL FLOTANTE INFERIOR: 72px]     │  ZONA ULTRA ACCESIBLE
│  TEMPORIZADOR ACTIVO / PRÓXIMA ACCIÓN│  - Tap target gigante (56px)
└──────────────────────────────────────┘
```

### Reglas de Ergonomía Táctil:
1. **Tap Targets Mínimos de 48px a 56px:**
   - Botón de confirmación de serie (`Check`): Mide **54px × 54px** como mínimo, con borde nítido y radio de 16px.
   - Micro-botones de suma y resta: Miden **48px × 48px**, separados entre sí por al menos 8px para evitar pulsar el botón equivocado.
2. **Distribución "Thumb Zone":**
   - El pulgar humano en agarre a una mano alcanza de forma natural los tercios medio e inferior de la pantalla. Las acciones destructivas o secundarias (eliminar serie, cambiar orden) se desplazan a menús contextuales para prevenir accidentes.

---

## 3. Registro de Series a Cero Fricción (Zero-Friction Logging)

El atleta promedio completa entre 18 y 25 series por sesión. Reducir la fricción por serie de 5 segundos a 1 segundo transforma la percepción de fluidez de la app.

### Optimizaciones Clave:
1. **Teclados Virtuales Dedicados:**
   - Carga de peso: `<input inputMode="decimal" type="text" pattern="[0-9]*[.,]?[0-9]*" />`. Despliega el teclado numérico grande con punto decimal, nunca el teclado QWERTY completo.
   - Carga de repeticiones: `<input inputMode="numeric" type="number" />`.
2. **Micro-Steppers de 1 Toque:**
   - Al lado o encima del input de peso, se ofrecen micro-botones de acceso directo: `+1 kg`, `+2.5 kg`, `+5 kg` (saltos típicos de discos de gimnasio).
3. **Tipos de Serie Codificados Visualmente:**
   - **`W` (Warmup / Calentamiento):** Badge gris acerado con borde cyan tenue. Excluido matemáticamente del tonelaje efectivo para seguir el estándar científico de Hevy.
   - **`N` (Normal / Serie Efectiva):** Estilo base de alto contraste. Computa para el volumen efectivo.
   - **`D` (Drop Set):** Borde ámbar con flecha descendente indicando reducción de peso sin descanso previo.
   - **`F` (Failure / Al Fallo):** Badge rojo carmesí indicando esfuerzo máximo (RPE 10 / RIR 0).
4. **Selector RPE Asistido (Escala Borg Modificada 1-10):**
   - Selector deslizante o botones de paso horizontal con explicación contextual inmediata:
     - `RPE 10`: Cero repeticiones en reserva (Fallo absoluto).
     - `RPE 9`: Podría haber hecho 1 repetición más.
     - `RPE 8`: Podría haber hecho 2 repeticiones más.
     - `RPE 7`: Velocidad de barra rápida, 3 repeticiones en reserva.

---

## 4. Temporizador de Descanso Inteligente Multimodal

El descanso entre series de fuerza pesada (2 a 5 minutos) es el momento donde el atleta suele desenfocarse o mirar el teléfono. El cronómetro de GOZSter mantiene el control sin requerir atención visual constante:

1. **Visibilidad a 2 Metros:**
   - Anillo de progreso circular SVG de 220px de diámetro con números tabulares de 48px en color `Forged Gold` (`#FFB800`).
   - El atleta puede dejar el teléfono en el piso o en un banco a 2 metros de distancia y leer claramente los segundos restantes mientras toma agua o camina.
2. **Feedback Auditivo y Háptico Progresivo:**
   - **Últimos 3 segundos (3, 2, 1):** Un beep sonoro corto de 880 Hz (tono A5) y una vibración háptica breve de 80ms alertan que debe colocarse bajo la barra.
   - **Tiempo cumplido (0s):** Beep prolongado de 1760 Hz (tono A6) y doble vibración enérgica (`[150ms, 100ms, 250ms]`).
3. **Controles Táctiles de Compensación Rápida:**
   - Tres botones de 48px en la base: `+30s` (si la respiración aún no se normalizó), `-30s` y `Omitir Descanso`.

---

## 5. Herramientas Integradas de Sesión en Vivo

### 5.1. Calculadora de Discos (Plate Calculator)
- Resuelve instantáneamente el cálculo mental de qué discos cargar a la barra olímpica estándar de 20 kg.
- **Visualización Gráfica:** Dibuja la manga de la barra con los discos codificados por colores reglamentarios de halterofilia (IWF):
  - 25 kg: Rojo
  - 20 kg: Azul
  - 15 kg: Amarillo
  - 10 kg: Verde
  - 5 kg: Blanco
  - 2.5 kg: Negro
  - 1.25 kg: Cromo / Gris
- Incluye botón rápido para barra olímpica de 20kg o barra corta de 10kg/15kg.

### 5.2. Reproductor de Técnica (YouTube Modal No Invasivo)
- Permite ver el clip corto de ejecución técnica prescrito por el entrenador sin abandonar la pantalla del entrenamiento.
- **Garantía Operativa:** El temporizador de descanso y el cronómetro de la sesión continúan corriendo en segundo plano sin reiniciar ni pausar el entrenamiento.

### 5.3. Reporte de Dolor Articular en 2 Toques
- Si el atleta siente una punzada o molestia articular durante una serie, no necesita escribir un párrafo de texto:
  - *Toque 1:* Selección de la articulación (Hombro, Codo, Muñeca, Lumbar, Cadera, Rodilla).
  - *Toque 2:* Nivel de dolor (Leve 1-3, Moderado 4-6, Agudo 7-10) y tipo (Punzante, Sobrecarga, Tirón).
- Se adjunta automáticamente a la serie y genera una alerta prioritaria inmediata en la bandeja del Coach Studio.

---

## 6. Estado Offline-First Visible y Tranquilizador

En sótanos sin señal, el atleta teme perder los datos de su entrenamiento al cerrar la app o quedarse sin batería.

- **Banner Sutil en el Header:**
  - Cuando se pierde la conexión: Un pill sobrio en color ámbar indica `⚡ Modo Gimnasio Offline (3 eventos guardados localmente)`.
  - Cero alertas modales bloqueantes que impidan continuar entrenando.
  - Al recuperar la señal, el pill se torna verde durante 3 segundos: `🟢 Sincronizado con Supabase`.
