"use client";

import * as React from "react";
import { AthleteSheet } from "@/components/athlete/athlete-sheet";
import { Play } from "@/components/athlete/icons";
import { getYouTubeEmbedUrl } from "@/lib/youtube";
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
  if (!isOpen || !exercise) {
    return null;
  }

  const embedUrl = getYouTubeEmbedUrl(exercise.url_video);

  return (
    <AthleteSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Video del ejercicio"
      subtitle={exercise.nombre}
      titleId="video-modal-title"
      closeAriaLabel="Cerrar"
      dialogTestId="exercise-video-modal"
      closeTestId="close-video-modal-btn"
    >
      {embedUrl ? (
        <div className="a-vframe">
          <iframe
            src={embedUrl}
            title={`Video demostrativo de ${exercise.nombre}`}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            tabIndex={-1}
            data-testid="youtube-iframe"
          />
        </div>
      ) : (
        <div className="a-vframe" data-testid="video-demo-frame">
          <span className="a-pl">
            <Play width={24} height={24} className="a-i" />
          </span>
        </div>
      )}

      <span className="a-t-sec a-muted">Video demostrativo que cargó tu coach.</span>

      <button
        type="button"
        className="a-btn a-soft"
        onClick={onClose}
        data-testid="return-to-workout-btn"
      >
        Volver al ejercicio
      </button>
    </AthleteSheet>
  );
}
