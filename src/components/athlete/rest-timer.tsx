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
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-emerald-500/30 bg-card/95 p-4 shadow-m3-3 backdrop-blur-xl"
      data-testid="rest-timer-banner"
    >
      <div className="mx-auto max-w-md space-y-3">
        {/* Barra de progreso de descanso con gradiente Material 3 */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/90 border border-border/50">
          <div
            className={`h-full transition-all duration-300 ease-linear rounded-full ${
              restTimer.isPaused
                ? "bg-amber-400"
                : "bg-gradient-to-r from-emerald-500 to-teal-400"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  restTimer.isPaused
                    ? "bg-amber-400"
                    : "bg-emerald-400 animate-ping"
                }`}
              />
              <p
                className={`text-xs font-bold uppercase tracking-wider ${
                  restTimer.isPaused ? "text-amber-400" : "text-emerald-400"
                }`}
              >
                {restTimer.isPaused ? "Descanso Pausado" : "Descanso Activo"}
              </p>
            </div>
            <p className="truncate text-xs text-muted-foreground mt-0.5">
              {restTimer.exerciseName} • Serie #{restTimer.setNumber}
            </p>
          </div>

          <div
            className="text-4xl sm:text-5xl font-mono font-black tracking-tight text-emerald-400 tabular-nums drop-shadow-sm"
            aria-live="polite"
          >
            {formattedTime}
          </div>
        </div>

        {/* Botones táctiles ergonómicos de gran formato (Thumb Zone) */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Button
            variant="outline"
            size="default"
            className="text-xs font-bold touch-manipulation min-h-12 border-border/80 hover:border-emerald-500/40"
            onClick={() => addTimerSeconds(15)}
          >
            +15s
          </Button>

          {restTimer.isPaused ? (
            <Button
              variant="default"
              size="default"
              className="text-xs font-bold touch-manipulation min-h-12 bg-emerald-600 hover:bg-emerald-500 text-white"
              onClick={resumeTimer}
            >
              ▶ Reanudar
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="default"
              className="text-xs font-bold touch-manipulation min-h-12 border border-border/60"
              onClick={pauseTimer}
            >
              ⏸ Pausar
            </Button>
          )}

          <Button
            variant="ghost"
            size="default"
            className="text-xs font-semibold text-muted-foreground hover:text-destructive touch-manipulation min-h-12"
            onClick={stopTimer}
          >
            Omitir ✕
          </Button>
        </div>
      </div>
    </aside>
  );
}

