"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { getYouTubeEmbedUrl, getYouTubeSearchUrl } from "@/lib/youtube";
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

const CHIP =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-neutral-soft text-neutral-soft-foreground border border-neutral-soft-border";

export function ExercisePreviewModal({
  exercise,
  isOpen,
  onClose,
  onAddExercise,
}: ExercisePreviewModalProps) {
  if (!isOpen || !exercise) return null;

  // Desmontar el iframe al cerrar detiene el audio en segundo plano.
  const embedUrl = getYouTubeEmbedUrl(exercise.url_video);
  const secundarios = exercise.musculos_secundarios ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-preview-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      data-testid="exercise-preview-modal"
    >
      <div
        className="relative w-full max-w-lg sm:max-w-xl max-h-[90vh] overflow-y-auto space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
          <div>
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
              🎬 Guía Técnica
            </span>
            <h2
              id="exercise-preview-title"
              className="mt-1 text-lg font-bold tracking-tight text-foreground"
            >
              {exercise.nombre}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            autoFocus
            className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Cerrar vista previa"
            data-testid="close-exercise-preview-btn"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {embedUrl ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border/80 bg-black">
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
            className="space-y-2 rounded-xl border border-dashed border-border bg-secondary/30 p-5 text-center"
            data-testid="exercise-preview-no-video"
          >
            <p className="text-xs font-bold text-foreground">
              Sin video oficial en el catálogo
            </p>
            <a
              href={getYouTubeSearchUrl(exercise.nombre)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
            >
              🔍 Buscar técnica en YouTube ↗
            </a>
          </div>
        )}

        <div className="space-y-1.5">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Músculos involucrados
          </span>
          <div className="flex flex-wrap gap-1.5" data-testid="exercise-preview-muscles">
            {exercise.musculos_principales.map((m) => (
              <span key={`p-${m}`} className={CHIP}>
                {m}
              </span>
            ))}
            {secundarios.map((m) => (
              <span key={`s-${m}`} className={CHIP}>
                {m}
              </span>
            ))}
          </div>
        </div>

        {exercise.comentario && (
          <div
            className="space-y-1 rounded-xl border border-border bg-secondary/30 p-3.5 text-xs"
            data-testid="exercise-preview-comentario"
          >
            <p className="font-bold text-foreground">📖 Guía biomecánica</p>
            <p className="whitespace-pre-line leading-relaxed text-foreground/90">
              {exercise.comentario}
            </p>
          </div>
        )}

        {exercise.notas && (
          <div
            className="space-y-1 rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-xs"
            data-testid="exercise-preview-notas"
          >
            <p className="font-bold text-primary">💡 Indicaciones del coach</p>
            <p className="whitespace-pre-line leading-relaxed text-foreground">
              {exercise.notas}
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-2">
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
              data-testid="exercise-preview-add-btn"
            >
              + Añadir a la Rutina
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
