"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useAthleteStore } from "@/store/use-athlete-store";
import { cn } from "@/lib/utils";
import { Play, Pause } from "@/components/athlete/icons";

export function RestTimer() {
  const {
    restTimer,
    mostrarTimerDescanso,
    tickTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    addTimerSeconds,
  } = useAthleteStore();

  React.useEffect(() => {
    if (!restTimer.isActive || restTimer.isPaused || mostrarTimerDescanso === false) {
      return;
    }

    const interval = setInterval(() => {
      tickTimer();
    }, 1000);

    return () => clearInterval(interval);
  }, [restTimer.isActive, restTimer.isPaused, mostrarTimerDescanso, tickTimer]);

  if (!restTimer.isActive || mostrarTimerDescanso === false) {
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

  const handleSubtract30 = () => {
    const deduct = Math.min(30, restTimer.secondsRemaining);
    if (deduct > 0) {
      addTimerSeconds(-deduct);
    }
  };

  const pausado = restTimer.isPaused;

  return (
    <aside
      aria-label="Temporizador de descanso"
      data-testid="rest-timer-banner"
      className="fixed inset-x-0 bottom-0 z-40 overflow-hidden border-t border-border bg-rest-timer pb-[env(safe-area-inset-bottom)] lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-[400px] lg:rounded-2xl lg:border lg:shadow-m3-2"
    >
      <div
        role="progressbar"
        aria-label="Progreso del descanso"
        aria-valuemin={0}
        aria-valuemax={restTimer.totalSeconds}
        aria-valuenow={restTimer.totalSeconds - restTimer.secondsRemaining}
        className="h-1.5 w-full bg-rest-timer-track"
      >
        <div
          className={cn(
            "h-full transition-[width] duration-300 ease-linear motion-reduce:transition-none",
            pausado ? "bg-rest-timer-paused" : "bg-rest-timer-fill",
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mx-auto max-w-md space-y-3 p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm font-bold uppercase tracking-wider",
                pausado ? "text-rest-timer-paused" : "text-foreground",
              )}
            >
              {pausado ? "Pausado" : "Descanso"}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {restTimer.exerciseName} · Serie {restTimer.setNumber}
            </p>
          </div>
          <div
            role="timer"
            aria-live="off"
            aria-label={`Quedan ${minutes} minutos y ${seconds} segundos`}
            className="font-mono text-6xl font-black leading-none tracking-tight tabular-nums text-rest-timer-time"
          >
            {formattedTime}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <Button
            variant="outline"
            size="quick"
            className="font-mono"
            aria-label="Restar 30 segundos"
            disabled={restTimer.secondsRemaining <= 5}
            onClick={handleSubtract30}
          >
            −30 s
          </Button>
          <Button
            variant="outline"
            size="quick"
            className="font-mono"
            aria-label="Sumar 30 segundos"
            onClick={() => addTimerSeconds(30)}
          >
            +30 s
          </Button>
          <Button
            variant={pausado ? "default" : "outline"}
            size="quick"
            aria-label={pausado ? "Reanudar descanso" : "Pausar descanso"}
            onClick={pausado ? resumeTimer : pauseTimer}
          >
            {pausado ? <Play className="size-6" /> : <Pause className="size-6" />}
          </Button>
          <Button variant="secondary" size="quick" onClick={stopTimer}>
            Omitir
          </Button>
        </div>
      </div>
    </aside>
  );
}
