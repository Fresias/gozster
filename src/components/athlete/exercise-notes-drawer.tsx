"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Lightbulb, X } from "@/components/athlete/icons";
import { parseExerciseNotes } from "@/lib/exercise-notes";

export interface ExerciseNotesDrawerProps {
  exercise: {
    id?: string;
    nombre: string;
    comentario?: string | null;
    musculos_principales?: string[];
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Bottom Sheet / Drawer táctil optimizado para atletas en gimnasio.
 * Muestra las notas técnicas del coach sin desbordes horizontales ni recortes,
 * con scroll interno, separación visual entre Configuración y Ejecución,
 * y soporte de cierre por toque en backdrop, botón o deslizamiento hacia abajo.
 */
export function ExerciseNotesDrawer({
  exercise,
  isOpen,
  onClose,
}: ExerciseNotesDrawerProps) {
  // Manejo de tecla Escape
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Gestos táctiles de arrastre hacia abajo para cerrar
  const [dragOffset, setDragOffset] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const touchStartY = React.useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartY.current = touch.clientY;
      setIsDragging(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      const deltaY = touch.clientY - touchStartY.current;
      if (deltaY > 0) {
        setDragOffset(deltaY);
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (dragOffset > 70) {
      onClose();
    }
    setDragOffset(0);
  };

  if (!isOpen || !exercise) {
    return null;
  }

  const parsed = parseExerciseNotes(exercise.comentario);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-notes-title"
      aria-describedby="exercise-notes-description"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
      data-testid="exercise-notes-drawer-backdrop"
    >
      <div
        role="document"
        className="relative w-full max-w-lg bg-card text-card-foreground border-t sm:border border-border/80 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88vh] sm:max-h-[82vh] overflow-hidden"
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: isDragging ? "none" : "transform 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="exercise-notes-drawer"
      >
        {/* Barra de arrastre táctil (Pull Handle) */}
        <div
          className="w-full pt-3 pb-1 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          data-testid="exercise-notes-drag-handle"
          title="Desliza hacia abajo para cerrar"
        >
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50 transition-colors" />
        </div>

        {/* Cabecera del Drawer */}
        <div className="flex items-start justify-between gap-3 px-5 sm:px-6 py-2 border-b border-border/60">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Notas del Coach
              </span>
              <h2
                id="exercise-notes-title"
                className="text-base sm:text-lg font-bold tracking-tight text-foreground truncate mt-0.5"
              >
                {exercise.nombre}
              </h2>
              {exercise.musculos_principales && exercise.musculos_principales.length > 0 && (
                <p className="text-[11px] text-muted-foreground truncate">
                  Músculos: {exercise.musculos_principales.join(", ")}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 shrink-0 rounded-xl bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground flex items-center justify-center transition-colors touch-manipulation cursor-pointer"
            aria-label="Cerrar notas del coach"
            data-testid="close-exercise-notes-btn"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo scrolleable con secciones estructuradas */}
        <div
          id="exercise-notes-description"
          className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-4 overscroll-contain text-xs sm:text-sm break-words"
          data-testid="exercise-notes-content"
        >
          {parsed.hasStructuredSections ? (
            <>
              {/* Sección: Configuración y Postura */}
              {parsed.configuracion.length > 0 && (
                <div
                  className="rounded-2xl border border-border/80 bg-secondary/30 p-4 space-y-2.5 shadow-xs"
                  data-testid="notes-section-configuracion"
                >
                  <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-primary">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-primary text-[11px]">
                      ⚙️
                    </span>
                    <span>Configuración y Postura</span>
                  </div>
                  <ul className="space-y-2 pt-0.5">
                    {parsed.configuracion.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-foreground/90 leading-relaxed"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/70 mt-2 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sección: Ejecución del Movimiento */}
              {parsed.ejecucion.length > 0 && (
                <div
                  className="rounded-2xl border border-border/80 bg-secondary/30 p-4 space-y-2.5 shadow-xs"
                  data-testid="notes-section-ejecucion"
                >
                  <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-primary">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-primary text-[11px]">
                      ⚡
                    </span>
                    <span>Ejecución del Movimiento</span>
                  </div>
                  <ol className="space-y-2 pt-0.5">
                    {parsed.ejecucion.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-foreground/90 leading-relaxed"
                      >
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold font-mono shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Sección: Otras indicaciones */}
              {parsed.indicaciones.length > 0 && (
                <div
                  className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2 shadow-xs"
                  data-testid="notes-section-adicionales"
                >
                  <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-primary">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-primary text-[11px]">
                      💬
                    </span>
                    <span>Indicaciones Adicionales</span>
                  </div>
                  <div className="space-y-1.5 pt-0.5">
                    {parsed.indicaciones.map((item, idx) => (
                      <p
                        key={idx}
                        className="text-foreground/90 leading-relaxed"
                      >
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Vista libre para comentarios sin estructura rígida */
            <div
              className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-2.5 shadow-xs"
              data-testid="notes-section-general"
            >
              <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-primary">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-primary text-[11px]">
                  📋
                </span>
                <span>Indicación del Entrenador</span>
              </div>
              <div className="space-y-2 pt-0.5">
                {parsed.indicaciones.length > 0 ? (
                  parsed.indicaciones.map((parr, idx) => (
                    <p
                      key={idx}
                      className="text-foreground/90 leading-relaxed whitespace-pre-line"
                    >
                      {parr}
                    </p>
                  ))
                ) : (
                  <p className="text-foreground/90 leading-relaxed whitespace-pre-line">
                    {parsed.rawText}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer táctil de confirmación */}
        <div className="border-t border-border/60 p-4 sm:p-5 bg-card/50">
          <Button
            variant="default"
            size="touch"
            className="w-full text-sm font-bold shadow-md touch-manipulation min-h-12 rounded-xl"
            onClick={onClose}
            data-testid="exercise-notes-close-action-btn"
          >
            Entendido, volver al entrenamiento
          </Button>
        </div>
      </div>
    </div>
  );
}
