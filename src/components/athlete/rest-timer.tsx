"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useAthleteStore } from "@/store/use-athlete-store";

export function RestTimer() {
  const {
    restTimer,
    tickTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    addTimerSeconds,
  } = useAthleteStore();

  React.useEffect(() => {
    if (!restTimer.isActive || restTimer.isPaused) {
      return;
    }

    const interval = setInterval(() => {
      tickTimer();
    }, 1000);

    return () => clearInterval(interval);
  }, [restTimer.isActive, restTimer.isPaused, tickTimer]);

  if (!restTimer.isActive) {
    return null;
  }

  const minutes = Math.floor(restTimer.secondsRemaining / 60);
  const seconds = restTimer.secondsRemaining % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const progressPercent =
    restTimer.totalSeconds > 0
      ? Math.max(
          0,
          Math.min(
            100,
            ((restTimer.totalSeconds - restTimer.secondsRemaining) /
              restTimer.totalSeconds) *
              100,
          ),
        )
      : 100;

  return (
    <aside
      aria-label="Temporizador de descanso"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-primary/40 bg-card/95 p-4 shadow-2xl backdrop-blur-md"
      data-testid="rest-timer-banner"
    >
      <div className="mx-auto max-w-md space-y-3">
        {/* Barra de progreso */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-primary animate-ping" />
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Descanso Activo
              </p>
            </div>
            <p className="truncate text-xs text-muted-foreground mt-0.5">
              {restTimer.exerciseName} • Serie #{restTimer.setNumber}
            </p>
          </div>

          <div
            className="text-3xl sm:text-4xl font-mono font-bold tracking-tight text-primary tabular-nums"
            aria-live="polite"
          >
            {formattedTime}
          </div>
        </div>

        {/* Botones táctiles grandes */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="default"
            className="text-xs font-semibold touch-manipulation"
            onClick={() => addTimerSeconds(15)}
          >
            +15s
          </Button>

          {restTimer.isPaused ? (
            <Button
              variant="default"
              size="default"
              className="text-xs font-semibold touch-manipulation"
              onClick={resumeTimer}
            >
              Reanudar
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="default"
              className="text-xs font-semibold touch-manipulation"
              onClick={pauseTimer}
            >
              Pausar
            </Button>
          )}

          <Button
            variant="ghost"
            size="default"
            className="text-xs text-muted-foreground hover:text-destructive touch-manipulation"
            onClick={stopTimer}
          >
            Omitir
          </Button>
        </div>
      </div>
    </aside>
  );
}
