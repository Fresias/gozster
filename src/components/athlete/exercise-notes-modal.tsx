"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { ClipboardList, X } from "@/components/athlete/icons";
import type { LiveWorkoutExercise } from "@/store/use-athlete-store";

export interface ExerciseNotesModalProps {
  exercise: LiveWorkoutExercise | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ExerciseNotesModal({
  exercise,
  isOpen,
  onClose,
}: ExerciseNotesModalProps) {
  // Manejo de tecla Escape para accesibilidad
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

  if (!isOpen || !exercise) {
    return null;
  }

  const coachNotes = exercise.notas?.trim();
  const libraryNotes = exercise.comentario?.trim();
  const hasBoth = Boolean(coachNotes && libraryNotes && coachNotes !== libraryNotes);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notes-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
      data-testid="exercise-notes-modal"
    >
      <div
        className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                <ClipboardList className="h-3.5 w-3.5" />
                Notas del Ejercicio
              </span>
            </div>
            <h2
              id="notes-modal-title"
              className="text-lg sm:text-xl font-bold tracking-tight text-foreground mt-1"
              data-testid="exercise-notes-modal-title"
            >
              {exercise.nombre}
            </h2>
            {exercise.musculos_principales.length > 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Músculos: {exercise.musculos_principales.join(", ")}
              </p>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:bg-secondary hover:text-foreground touch-manipulation cursor-pointer"
            aria-label="Cerrar notas"
            data-testid="close-notes-modal-btn"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Contenido de las Notas */}
        <div className="space-y-3" data-testid="exercise-notes-content">
          {hasBoth ? (
            <>
              {coachNotes && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs sm:text-sm space-y-1">
                  <p className="font-bold text-primary flex items-center gap-1.5">
                    <span>📋</span>
                    <span>Indicaciones del Coach:</span>
                  </p>
                  <p className="text-foreground/90 whitespace-pre-line leading-relaxed">
                    {coachNotes}
                  </p>
                </div>
              )}
              {libraryNotes && (
                <div className="rounded-xl border border-border bg-secondary/30 p-3.5 text-xs sm:text-sm space-y-1">
                  <p className="font-semibold text-muted-foreground flex items-center gap-1.5">
                    <span>📖</span>
                    <span>Guía técnica de biblioteca:</span>
                  </p>
                  <p className="text-foreground/80 whitespace-pre-line leading-relaxed">
                    {libraryNotes}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs sm:text-sm space-y-1.5">
              <p className="font-bold text-primary flex items-center gap-1.5">
                <span>💡</span>
                <span>Indicaciones del Ejercicio:</span>
              </p>
              <p className="text-foreground/90 whitespace-pre-line leading-relaxed text-sm">
                {coachNotes || libraryNotes}
              </p>
            </div>
          )}
        </div>

        {/* Botón de Cierre / Volver a la Rutina */}
        <div className="pt-2">
          <Button
            variant="default"
            size="touch"
            className="w-full bg-secondary font-semibold text-secondary-foreground hover:bg-secondary/80 touch-manipulation cursor-pointer"
            onClick={onClose}
            data-testid="return-to-workout-from-notes-btn"
          >
            Volver a la Rutina
          </Button>
        </div>
      </div>
    </div>
  );
}
