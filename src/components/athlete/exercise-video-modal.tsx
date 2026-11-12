"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { extractYouTubeVideoId, getYouTubeEmbedUrl, getYouTubeSearchUrl } from "@/lib/youtube";
import type { LiveWorkoutExercise } from "@/store/use-athlete-store";

export interface ExerciseVideoModalProps {
  exercise: LiveWorkoutExercise | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ExerciseVideoModal({
  exercise,
  isOpen,
  onClose,
}: ExerciseVideoModalProps) {
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

  const embedUrl = getYouTubeEmbedUrl(exercise.url_video);
  const videoId = extractYouTubeVideoId(exercise.url_video);
  const searchUrl = getYouTubeSearchUrl(exercise.nombre);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
      data-testid="exercise-video-modal"
    >
      <div
        className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="flex items-start justify-between gap-3 border-b border-border/80 pb-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary">
                🎬 Guía de Técnica
              </span>
              {videoId && (
                <span className="text-xs font-mono text-muted-foreground">
                  ID: {videoId}
                </span>
              )}
            </div>
            <h2
              id="video-modal-title"
              className="text-lg sm:text-xl font-bold tracking-tight text-foreground mt-1"
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
            className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Cerrar reproductor"
            data-testid="close-video-modal-btn"
          >
            ✕
          </Button>
        </div>

        {/* Reproductor de Video */}
        {embedUrl ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black border border-border/60 shadow-inner">
            <iframe
              src={embedUrl}
              title={`Técnica de ${exercise.nombre}`}
              className="absolute inset-0 h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              data-testid="youtube-iframe"
            />
          </div>
        ) : (
          <div
            className="rounded-xl border border-dashed border-border bg-secondary/30 p-5 text-center space-y-3"
            data-testid="no-video-fallback"
          >
            <div className="text-3xl">🎥</div>
            <p className="text-sm font-semibold text-foreground">
              Video no disponible directamente en el catálogo
            </p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Puedes consultar demostraciones recomendadas en YouTube para este ejercicio:
            </p>
            <a
              href={searchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <span>🔍 Buscar técnica en YouTube</span>
              <span>↗</span>
            </a>
          </div>
        )}

        {/* Notas y comentarios de ejecución técnica */}
        {(exercise.notas || exercise.comentario) && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
            <p className="font-semibold text-primary mb-1 flex items-center gap-1">
              <span>💡</span>
              <span>Indicaciones del Entrenador:</span>
            </p>
            <p className="text-foreground/90 leading-relaxed">
              {exercise.notas || exercise.comentario}
            </p>
          </div>
        )}

        {/* Cierre / Volver al entrenamiento */}
        <div className="pt-1 flex gap-2">
          <Button
            variant="default"
            size="touch"
            className="w-full bg-secondary font-semibold text-secondary-foreground hover:bg-secondary/80 touch-manipulation"
            onClick={onClose}
            data-testid="return-to-workout-btn"
          >
            Volver a la Rutina
          </Button>
        </div>
      </div>
    </div>
  );
}
