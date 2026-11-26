import * as React from "react";

export default function AthleteLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Cargando entrenamiento"
      data-testid="athlete-loading-skeleton"
      className="mx-auto w-full max-w-md space-y-4 px-4 py-5 animate-pulse"
    >
      <span className="sr-only">Cargando entrenamiento</span>

      {/* Encabezado de pantalla */}
      <div className="space-y-2" aria-hidden="true">
        <div className="h-3.5 w-24 rounded-full bg-muted" />
        <div className="h-7 w-48 rounded-lg bg-muted" />
      </div>

      {/* Tarjeta resumen / progreso */}
      <div
        className="rounded-2xl border border-border/80 bg-card/70 p-4 space-y-3"
        aria-hidden="true"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2 flex-1">
            <div className="h-4 w-36 rounded-md bg-muted" />
            <div className="h-3.5 w-28 rounded-md bg-muted/60" />
          </div>
          <div className="h-12 w-12 shrink-0 rounded-full bg-muted" />
        </div>
        <div className="h-11 w-full rounded-full bg-muted/80" />
      </div>

      {/* Lista de bloques / ejercicios */}
      <div className="space-y-3" aria-hidden="true">
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/60 p-4"
          >
            <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded-md bg-muted" />
              <div className="h-3 w-24 rounded-md bg-muted/60" />
            </div>
            <div className="h-6 w-12 shrink-0 rounded-full bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
