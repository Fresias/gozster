"use client";

import * as React from "react";
import { useAthleteStore } from "@/store/use-athlete-store";
import { Play, Pause } from "@/components/athlete/icons";

const fmt = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.max(0, Math.round(t)) % 60).padStart(2, "0")}`;

// Panel de descanso v7 (.a-restbar): muestra el tiempo TRANSCURRIDO sobre el total.
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

  const total = restTimer.totalSeconds;
  const faltan = restTimer.secondsRemaining;
  const transcurrido = Math.max(0, total - faltan);
  const progressPercent = total > 0 ? Math.max(0, Math.min(100, (transcurrido / total) * 100)) : 100;
  const pausado = restTimer.isPaused;

  const handleSubtract30 = () => {
    const deduct = Math.min(30, restTimer.secondsRemaining);
    if (deduct > 0) {
      addTimerSeconds(-deduct);
    }
  };

  return (
    <aside role="timer" aria-label="Descanso" data-testid="rest-timer-banner" className="a-restbar">
      <div
        role="progressbar"
        aria-label="Progreso del descanso"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={transcurrido}
        className="a-rb-track"
      >
        <i style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="a-rb-top">
        <span className="a-rt">
          <span className="a-t-label">{pausado ? "Pausado" : "Descanso"}</span>
          <small className="a-t-sec a-muted">
            {restTimer.exerciseName} · Serie {restTimer.setNumber}
          </small>
        </span>
        <span style={{ textAlign: "right" }}>
          <span className="a-t-ml" style={{ fontSize: "2.75rem" }} data-testid="rest-timer-elapsed">
            {fmt(transcurrido)}
          </span>
          <br />
          <small className="a-t-sec a-muted">
            de {fmt(total)} · faltan {fmt(faltan)}
          </small>
        </span>
      </div>
      <div className="a-rb-ctrl">
        <button type="button" aria-label="Restar 30 segundos" disabled={faltan <= 5} onClick={handleSubtract30}>
          −30 s
        </button>
        <button type="button" aria-label="Sumar 30 segundos" onClick={() => addTimerSeconds(30)}>
          +30 s
        </button>
        <button
          type="button"
          className="a-pp"
          aria-label={pausado ? "Reanudar descanso" : "Pausar descanso"}
          onClick={pausado ? resumeTimer : pauseTimer}
        >
          {pausado ? <Play className="size-5" /> : <Pause className="size-5" />}
        </button>
        <button type="button" onClick={stopTimer}>
          Omitir
        </button>
      </div>
    </aside>
  );
}
