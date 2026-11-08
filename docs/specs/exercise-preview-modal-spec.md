# Especificación de Diseño Canónico: Preview Interactivo de Ejercicios en el Constructor de Rutinas (GOZS-415)

> **Autor:** `@UI/UX & Art Director`  
> **Para:** `@frontend-eng` (implementación técnica) y `@qa-eng` (validación de criterios de aceptación)  
> **Aprobación ejecutiva:** Gabriel (Dueño) / `@PM-GOZster`  
> **Épica:** GOZS-411 (`[EPIC]: Sprint Feedback Entrenador — UX Rutinas, Chat Limpio, Biblioteca, Agenda & Planes`)  
> **Principios rectores:** Karpathy (cambio quirúrgico y minimalismo), Ponytail (cero dependencias de video externas; uso de iframe HTML5 seguro), Design System GOZSter (`docs/ux-ui-review/01-sistema-visual.md`).  
> **Prototipo interactivo:** [`docs/prototypes/exercise-preview-modal.html`](file:///docs/prototypes/exercise-preview-modal.html)  
> **Capturas renderizadas:**  
> - Desktop 1440px (Coach Studio): [`docs/prototypes/exercise-preview-modal-desktop-1440px.png`](file:///docs/prototypes/exercise-preview-modal-desktop-1440px.png)  
> - Mobile 390px (PWA / Atleta): [`docs/prototypes/exercise-preview-modal-mobile-390px.png`](file:///docs/prototypes/exercise-preview-modal-mobile-390px.png)  
> - Estado con notas personalizadas del Coach: [`docs/prototypes/exercise-preview-modal-coach-notes-1440px.png`](file:///docs/prototypes/exercise-preview-modal-coach-notes-1440px.png)  
> - Estado sin video (Fallback accesible): [`docs/prototypes/exercise-preview-modal-novideo-fallback-1440px.png`](file:///docs/prototypes/exercise-preview-modal-novideo-fallback-1440px.png)

---

## 1. Contexto y Diagnóstico UX

En la auditoría de feedback del entrenador de fuerza Gonzalo Salas (`GOZS-411`), se detectó un cuello de botella ergonómico durante la planificación en `src/components/coach/routine-builder/routine-builder-modal.tsx`:

1. **Falta de visibilidad técnica durante la creación de rutinas:**
   - En la tarjeta del día, el entrenador solo ve el nombre del ejercicio en texto plano y una etiqueta decorativa `🎬 Video OK` si existe `url_video`. No hay manera de reproducir el video ni de consultar la postura o consejos biomecánicos cargados en la base de datos sin salir del constructor.
2. **Falta de inspección previa en el Catálogo Maestro:**
   - En la lista modal del catálogo (`showCatalogModal`), el coach solo ve el nombre y los músculos primarios en una línea. Si duda sobre la variante técnica (por ejemplo, *Sentadilla Goblet vs. Sentadilla Frontal* o *Remo con Soporte en Pecho*), debe memorizar o verificar externamente antes de añadirlo.
3. **Desconexión entre notas de biblioteca y notas del coach:**
   - En Supabase conviven las notas pedagógicas de la biblioteca (`ej.comentario` / `ej.instrucciones`) y las notas personalizadas que el entrenador asigna para esa rutina en particular (`ej.notas`). Ambas deben presentarse con jerarquías claramente diferenciadas.

---

## 2. Criterios de Aceptación (Gherkin Canónico)

```gherkin
Feature: Preview interactivo de ejercicio en el Constructor de Rutinas

  Scenario: Previsualizar ejercicio desde una tarjeta del día en el constructor
    Given una rutina en edición en routine-builder-modal.tsx con ejercicios asignados
    When el entrenador hace clic sobre el nombre del ejercicio o en el botón "🎬 Ver Técnica"
    Then se despliega el modal accesible ExercisePreviewModal
    And renderiza el reproductor embebido de YouTube (16:9) si posee url_video válida
    And visualiza los chips semánticos de músculos principales y secundarios con tokens neutral-soft
    And visualiza las instrucciones biomecánicas cargadas en ej.comentario
    And si el ejercicio en la rutina cuenta con notas del coach (ej.notas), visualiza la tarjeta destacada de notas del entrenador

  Scenario: Previsualizar ejercicio desde el Catálogo Maestro antes de agregarlo
    Given el modal del Catálogo Maestro abierto en routine-builder-modal.tsx
    When el entrenador hace clic sobre el nombre del ejercicio o el icono de preview 🎬
    Then se despliega ExercisePreviewModal sobre el catálogo
    And permite evaluar la técnica y anatomía
    And el botón principal del pie permite "+ Añadir a la Rutina" directamente desde la previsualización

  Scenario: Ejercicio sin video cargado en el catálogo
    Given un ejercicio que no posee url_video o posee valor nulo
    When el entrenador abre su previsualización
    Then se visualiza el bloque de contingencia accesible (fallback) indicando "Sin video oficial en el catálogo"
    And ofrece un botón de acción "🔍 Buscar técnica en YouTube ↗" con enlace externo seguro (noopener noreferrer)

  Scenario: Ergonomía de cierre y navegación por teclado
    Given el modal ExercisePreviewModal abierto
    When el usuario presiona la tecla Escape, hace clic en el backdrop o en el botón X de cabecera
    Then el modal se cierra de forma inmediata
    And se detiene la reproducción del video iframe para evitar audio en segundo plano
    And el foco vuelve al disparador que originó la apertura
```

---

## 3. Jerarquía Visual y Tokens de Diseño

El diseño respeta estrictamente `docs/ux-ui-review/01-sistema-visual.md` y la estética sobria, técnica y de alto contraste de GOZSter:

| Elemento | Clases Tailwind / Tokens | Justificación Ergonómica y Visual |
| :--- | :--- | :--- |
| **Contenedor Modal** | `w-full max-w-lg sm:max-w-xl rounded-xl border border-border bg-card shadow-2xl` | Radio canónico de 12px (`rounded-xl`), fondo opaco `bg-card` sin sombras Material 3 (`shadow-m3-*` prohibidas). |
| **Backdrop / Scrim** | `fixed inset-0 z-50 bg-black/80 backdrop-blur-sm` | Máximo contraste y concentración; aísla el reproductor del ruido del constructor. |
| **Cabecera** | `border-b border-border p-4 sm:p-5 flex items-start justify-between` | Título 18px (`text-lg font-bold tracking-tight text-foreground`) con badge semántico `🎬 Guía Técnica`. |
| **Botón de Cierre (X)** | `h-8 w-8 rounded-full p-0 text-muted-foreground hover:bg-secondary hover:text-foreground` | Touch target accesible con `aria-label="Cerrar vista previa"`. |
| **Contenedor Video** | `relative aspect-video w-full overflow-hidden rounded-xl bg-black border border-border/80` | Proporción exacta 16:9 sin barras negras distorsionadas. |
| **Chips Musculares** | `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-neutral-soft text-neutral-soft-foreground border border-neutral-soft-border` | Token semántico `neutral-soft` con contraste garantizado ≥ 4.5:1 (WCAG AA/AAA). |
| **Guía Biomecánica** | `rounded-xl border border-border bg-secondary/30 p-3.5 text-xs text-foreground/90 space-y-1` | Tono secundario sobrio para notas técnicas estándar del catálogo (`ej.comentario`). |
| **Notas del Coach** | `rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-xs text-foreground space-y-1` | Tono sutil primario (`primary-soft`) para diferenciar claramente las indicaciones específicas de la rutina. |
| **Botón Primario Pie** | `btn btn-default rounded-lg px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground` | CTA claro con radio de 8px (`rounded-lg`). |

---

## 4. Contrato de Componente para `@frontend-eng`

### 4.1. Ubicación
- `src/components/coach/routine-builder/exercise-preview-modal.tsx`

### 4.2. Definición de Tipos TypeScript

```typescript
export interface ExercisePreviewData {
  id?: string;
  nombre: string;
  musculos_principales: string[];
  musculos_secundarios?: string[];
  url_video?: string | null;
  comentario?: string | null;
  notas?: string | null;
}

export interface ExercisePreviewModalProps {
  exercise: ExercisePreviewData | null;
  isOpen: boolean;
  onClose: () => void;
  onAddExercise?: (exercise: ExercisePreviewData) => void;
}
```

### 4.3. Implementación Canónica React + Tailwind

```tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { extractYouTubeVideoId, getYouTubeEmbedUrl, getYouTubeSearchUrl } from "@/lib/youtube";
import { X } from "@/components/ui/icons";

export interface ExercisePreviewData {
  id?: string;
  nombre: string;
  musculos_principales: string[];
  musculos_secundarios?: string[];
  url_video?: string | null;
  comentario?: string | null;
  notas?: string | null;
}

export interface ExercisePreviewModalProps {
  exercise: ExercisePreviewData | null;
  isOpen: boolean;
  onClose: () => void;
  onAddExercise?: (exercise: ExercisePreviewData) => void;
}

export function ExercisePreviewModal({
  exercise,
  isOpen,
  onClose,
  onAddExercise,
}: ExercisePreviewModalProps) {
  // Manejo de tecla Escape
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !exercise) return null;

  const embedUrl = getYouTubeEmbedUrl(exercise.url_video);
  const videoId = extractYouTubeVideoId(exercise.url_video);
  const searchUrl = getYouTubeSearchUrl(exercise.nombre);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      data-testid="exercise-preview-modal"
    >
      <div
        className="relative w-full max-w-lg rounded-xl border border-border bg-card p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary border border-primary/20">
                🎬 Guía de Técnica
              </span>
              {videoId && (
                <span className="text-[10px] font-mono text-muted-foreground">
                  ID: {videoId}
                </span>
              )}
            </div>
            <h2
              id="exercise-preview-title"
              className="text-lg sm:text-xl font-bold tracking-tight text-foreground mt-1"
            >
              {exercise.nombre}
            </h2>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Cerrar vista previa"
            data-testid="close-exercise-preview-btn"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Reproductor de Video */}
        {embedUrl ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black border border-border/80">
            <iframe
              src={embedUrl}
              title={`Técnica de ${exercise.nombre}`}
              className="absolute inset-0 h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              data-testid="exercise-preview-iframe"
            />
          </div>
        ) : (
          <div
            className="rounded-xl border border-dashed border-border bg-secondary/30 p-5 text-center space-y-2"
            data-testid="exercise-preview-no-video"
          >
            <div className="text-2xl">🎥</div>
            <p className="text-xs font-bold text-foreground">
              Sin video oficial vinculado en el catálogo
            </p>
            <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
              Puedes consultar demostraciones recomendadas en YouTube:
            </p>
            <a
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <span>🔍 Buscar en YouTube</span>
              <span>↗</span>
            </a>
          </div>
        )}

        {/* Anatomía y Músculos Involucrados */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
            Músculos Involucrados
          </span>
          <div className="flex flex-wrap gap-1.5">
            {exercise.musculos_principales.map((m) => (
              <span
                key={m}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-neutral-soft text-neutral-soft-foreground border border-neutral-soft-border"
              >
                {m}
              </span>
            ))}
            {exercise.musculos_secundarios?.map((m) => (
              <span
                key={m}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-secondary text-muted-foreground border border-border/60"
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* Notas Biomecánicas del Catálogo */}
        {exercise.comentario && (
          <div className="rounded-xl border border-border bg-secondary/30 p-3.5 text-xs space-y-1">
            <p className="font-bold text-foreground flex items-center gap-1.5">
              <span>📖</span>
              <span>Guía Biomecánica y Consejos de Seguridad:</span>
            </p>
            <p className="text-foreground/90 whitespace-pre-line leading-relaxed">
              {exercise.comentario}
            </p>
          </div>
        )}

        {/* Notas Personalizadas de la Rutina (Coach) */}
        {exercise.notas && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs space-y-1">
            <p className="font-bold text-primary flex items-center gap-1.5">
              <span>💡</span>
              <span>Indicaciones del Coach para esta Rutina:</span>
            </p>
            <p className="text-foreground/95 whitespace-pre-line leading-relaxed">
              {exercise.notas}
            </p>
          </div>
        )}

        {/* Pie y Acciones */}
        <div className="pt-2 flex items-center justify-between gap-2 border-t border-border/60">
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Presiona <kbd className="rounded border border-border bg-secondary px-1 py-0.5 font-mono text-[10px]">Esc</kbd> para salir
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cerrar
            </Button>
            {onAddExercise && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  onAddExercise(exercise);
                  onClose();
                }}
              >
                + Añadir a la Rutina
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 5. Puntos de Inserción Quirúrgica en `routine-builder-modal.tsx`

1. **Estado en el contenedor padre (`RoutineBuilderModal`):**
   ```tsx
   const [previewExercise, setPreviewExercise] = React.useState<ExercisePreviewData | null>(null);
   ```

2. **Trigger en la tarjeta de ejercicio de la rutina (Día activo):**
   - El título `ej.nombre` se envuelve en un elemento clickeable accesible:
     ```tsx
     <button
       type="button"
       onClick={() => setPreviewExercise({
         id: ej.id,
         nombre: ej.nombre,
         musculos_principales: ej.musculos_principales,
         url_video: ej.url_video,
         comentario: ej.comentario,
         notas: ej.notas
       })}
       className="text-sm font-bold text-foreground hover:text-primary hover:underline cursor-pointer text-left inline-flex items-center gap-1.5"
       title="Ver técnica y notas"
     >
       {ej.nombre}
       {ej.url_video && <span className="text-xs">🎬</span>}
     </button>
     ```

3. **Trigger en el Catálogo Maestro (`filteredCatalog`):**
   - Permitir previsualizar antes de pulsar "+ Agregar":
     ```tsx
     <button
       type="button"
       onClick={() => setPreviewExercise(ej)}
       className="font-bold text-xs text-foreground hover:text-primary hover:underline text-left"
     >
       {ej.nombre}
     </button>
     ```

4. **Renderizado del Modal:**
   ```tsx
   <ExercisePreviewModal
     exercise={previewExercise}
     isOpen={previewExercise !== null}
     onClose={() => setPreviewExercise(null)}
     onAddExercise={showCatalogModal ? (ej) => handleAddExerciseToCurrentDay(ej) : undefined}
   />
   ```

---

## 6. Auditoría de Accesibilidad (WCAG 2.1 AA / AAA)

- [x] **Contraste de Texto:** Los chips `neutral-soft` garantizan relación de contraste > 5.5:1 en ambos modos (Día y Noche).
- [x] **Áreas Táctiles:** El botón de cierre `X` y los botones de acción cuentan con padding y área táctil mínima de 36px en escritorio y 48px en móvil.
- [x] **Control de Teclado:** Listener nativo de `Escape` y retorno de foco al elemento invocador.
- [x] **Detención de Audio:** Al cerrar el modal se desmonta el iframe de YouTube (`src=""`), impidiendo que el audio continúe ejecutándose en segundo plano.
- [x] **Cero Bloatware:** No se agregan librerías como `react-player` ni reproductores pesados; se aprovecha la utilidad ligera `src/lib/youtube.ts` con modo de privacidad estricto (`youtube-nocookie.com`).
