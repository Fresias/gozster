# Especificación de Arquitectura de Datos Densos: Coach Studio
## Sistema de Cuadros Estadísticos y Paneles de Control según Normas INDEC 2024

> **Referencia Normativa:** Manual de Estilo INDEC 2024 (Capítulo 4: Cuadros Estadísticos y Capítulo 9.4: Normas INDEC Nº 8)  
> **Ámbito de Aplicación:** Coach Studio (Web Desktop y Tablet de 1024px a 1440px+)  
> **Dirección:** `@UI/UX & Art Director`  
> **Implementación Técnica:** `@frontend-eng` (React, Next.js 15, Tailwind, Shadcn UI)

---

## 1. Justificación y Propósito Operativo

El **Coach Studio** es la herramienta de trabajo diario de entrenadores profesionales que gestionan nóminas de entre 30 y 150 atletas de fuerza. El entrenador no busca interfaces vacías con tarjetas gigantes ("card fatigue") que requieran scroll infinito. Necesita **alta densidad de información útil por pulgada cuadrada**, escaneo visual veloz, comparabilidad horizontal y control inmediato de anomalías (adherencia deficiente, estancamiento de cargas, riesgo de lesión y cuotas vencidas).

Para garantizar la máxima pulcritud informativa, adoptamos las **Normas INDEC Nº 8 de Presentación de Cuadros Estadísticos**, adaptándolas al entorno web moderno interactivo.

---

## 2. Los 7 Principios Fundamentales del INDEC en GOZSter

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                      ANATOMÍA DE UN CUADRO ESTADÍSTICO INDEC                  │
├───────────────────────────────────────────────────────────────────────────────┤
│ [1. TÍTULO Y PERÍODO] Cuadro 1.1 - Roster de Atletas y Monitoreo de Retención.│
│                      Semana epidemiológica 42 / Octubre 2026                  │
├─────────────────┬──────────┬──────────────┬──────────────┬────────────────────┤
│ [2. COL. MATRIZ]│ [3. CABEZAL DE COLUMNAS CON UNIDADES EXPLÍCITAS]            │
│ Atleta          │ Cuota    │ Asist. [%]   │ Tonelaje [kg]│ 1RM Press [kg] (a) │
├─────────────────┼──────────┼──────────────┼──────────────┼────────────────────┤
│ [4. FILA DATOS] │          │              │              │                    │
│ González, Lucas │ ACTIVA   │        92.5  │       14.250 │              122.5 │
│ Rossi, Martín   │ PENDIENTE│        64.0  │        8.400 │               95.0*│
│ Benítez, Sofia  │ ACTIVA   │       100.0  │       18.900 │              105.0 │
│ Méndez, Juan    │ INACTIVA │         ...  │            — │                  — │
├─────────────────┴──────────┴──────────────┴──────────────┴────────────────────┤
│ [5. NOTAS Y LLAMADAS]                                                         │
│ (a) Calculado mediante fórmula de Brzycki sobre la serie efectiva más pesada. │
│ * Dato estimado a partir de RPE sub-máximo en sesión previa.                  │
│ ... Información no disponible / atleta sin registro en la semana.             │
│ — Magnitud nula o cero repeticiones efectivas registradas.                    │
│ [6. FUENTE] Fuente: GOZSter Telemetría / Registro Supabase live.              │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Detalle de Implementación de los Principios:

1. **Cabezal de Columnas Jerarquizado y Descriptivo:**
   - Textos de encabezado breves, en mayúsculas técnicas (`text-[11px] font-bold tracking-wider text-muted-foreground uppercase`).
   - Unidades de medida obligatorias explícitas entre corchetes rectangulares: `[kg]`, `[reps]`, `[%]`, `[RPE]`, `[min]`.
   - Si una columna tiene sub-métricas (ej. Volumen Semanal desglosado en Hipertrofia y Calentamiento), se utiliza un cabezal compuesto de 2 niveles.

2. **Columna Matriz Fija (Sticky Left):**
   - La primera columna contiene el identificador primario (Nombre y Apellido del atleta en Roster; Ejercicio en Rutinas).
   - En resoluciones intermedias o tablas con más de 8 columnas, la columna matriz se ancla de forma fija (`sticky left-0 bg-surface z-20`) con una sutil sombra divisoria derecha para permitir scroll horizontal sin perder la referencia del alumno.

3. **Alineación Numérica Decimal a la Derecha:**
   - Toda celda que contenga un dato cuantitativo se alinea estrictamente a la derecha (`text-right font-mono tabular-nums`).
   - Los números decimales deben conservar la misma cantidad de dígitos decimales para que las comas/puntos decimales coincidan verticalmente en la misma columna visual.

4. **Simbología Convencional INDEC para Estados Nulos:**
   - Prohibido dejar celdas en blanco o escribir `null` / `undefined`.
   - `...` (Tres puntos seguidos): Dato no disponible o ausente (ej. alumno sin entrenamiento registrado).
   - `—` (Raya larga / Em dash): Magnitud estrictamente cero o no aplicable (ej. cero series completadas).
   - `*` (Asterisco): Cifra provisional o estimada (ej. 1RM calculado matemáticamente sin testeo directo).
   - `e` (Letra e minúscula): Estimación manual del coach.

5. **Llamadas y Notas Estandarizadas:**
   - Las llamadas a notas explicativas se indican con letras minúsculas entre paréntesis en superíndice `(a)`, `(b)` para evitar confundirse con números de datos o multiplicadores de series.
   - El bloque de notas se ubica inmediatamente debajo de la tabla, con tipografía reducida (`text-[11px] text-muted-foreground leading-normal`).

6. **Grilla Limpia sin Jaulas Verticales:**
   - Siguiendo la recomendación expresa del INDEC: evitar líneas verticales continuas que encierran las celdas como celdas de prisión.
   - Las tablas de GOZSter utilizan únicamente líneas horizontales sutiles de separación (`border-b border-border/40`) y resaltado de fila completo al posar el cursor (`hover:bg-white/[0.03]`).

7. **Fuente al Pie:**
   - Todo cuadro culmina con la atribución explícita del origen del dato: `Fuente: GOZSter Telemetría / Registro Supabase`, aportando credibilidad institucional.

---

## 3. Niveles de Densidad y Grilla Modular

### Grilla Base: 12 y 16 Columnas
- **Escritorio Estándar (1280px - 1440px):** Grilla modular de 12 columnas con margen exterior de 32px y medianil (*gutter*) de 16px.
- **Escritorio Ultrawide (1440px+):** Grilla modular de 16 columnas que permite mantener el Roster a la izquierda (10 columnas) y el panel de detalle lateral / drawer a la derecha (6 columnas) de manera fija sin tapar la tabla.

### Selector de Densidad de Filas (Density Switcher)
El Coach Studio incluye un botón en la barra de herramientas para alternar entre dos densidades según la tarea:

| Parámetro | Modo Compacto (Supervisión Masiva) | Modo Estándar (Planificación Detallada) |
| :--- | :--- | :--- |
| **Alto de Fila (`h`)** | **34 px** | **48 px** |
| **Padding Vertical** | `py-1.5 px-3` | `py-3 px-4` |
| **Tamaño de Fuente Celdas**| `text-[12px]` | `text-[14px]` |
| **Casos de Uso** | Nóminas de más de 30 atletas, escaneo rápido de retención y alertas. | Construcción de rutinas, edición directa de cargas, asignación de ejercicios. |
| **Filas Visibles sin Scroll**| ~22 alumnos en monitor 1080p | ~14 alumnos en monitor 1080p |

---

## 4. Especificación Quirúrgica de Pantallas Clave

### 4.1. Roster de Atletas y Matriz de Retención (`/studio/dashboard`)
- **Cabezal:**
  - `ATLETA` (Columna Matriz, 220px, Sticky Left)
  - `ESTADO CUOTA` (Badge: Al Día, Pendiente, Inactivo)
  - `SEMÁFORO SALUD [SH]` (Score 0-100 con indicador circular coloreado)
  - `ÚLTIMO ENTRENO` (Fecha relativa: "Hoy", "Hace 2d", "Hace 8d")
  - `RUTINA ACTIVA` (Nombre del plan o badge rojo "SIN PLAN")
  - `VOLUMEN SEMANAS [kg]` (Valor numérico tabular)
  - `ACCIONES RÁPIDAS` (Botones compactos: Asignar Plan, WhatsApp, Historial)

### 4.2. Matriz de Sobrecarga Progresiva (`/studio?tab=sobrecarga`)
- **Estructura Tabular Multivariable:**
  - Columna 1: Ejercicio fundamental (Sentadilla, Banca, Peso Muerto, Remo, Militar).
  - Columnas 2 a 5: Bloques de 4 semanas de progresión (`Semana N-3`, `Semana N-2`, `Semana N-1`, `Semana Actual`).
  - Cada celda desglosa: `Carga pico [kg] × Reps` y `1RM Estimado [kg]`.
  - Columna Final: Delta porcentual de sobrecarga (`+4.2%` en verde o `-2.1%` en rojo tenue).

### 4.3. Constructor Visual de Rutinas (Routine Builder Modal / Drawer)
- **Organización Modular:**
  - Panel Izquierdo (30%): Selector de días del microciclo (Día 1, Día 2, Día 3...).
  - Panel Central (70%): Tabla de ejercicios por día con soporte para:
    - Agrupación visual de **Superseries**: Una barra vertical lateral continua conecta los dos ejercicios que forman la superserie (ej. *Superserie A1 + A2*).
    - Celdas de prescripción: `Series`, `Reps`, `Descanso [s]`, `RPE Objetivo`, `Tempo (e.g. 3-0-1-0)`.
    - Navegación por teclado: Al presionar `Tab`, el cursor pasa de celda en celda sin usar el mouse, permitiendo planificar una sesión de 6 ejercicios en menos de 90 segundos.
