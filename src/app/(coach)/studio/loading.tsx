import * as React from "react";

export default function StudioLoading() {
  return (
    <div
      data-testid="studio-loading-skeleton"
      className="space-y-6 animate-pulse"
      aria-busy="true"
      aria-label="Cargando Coach Studio"
    >
      {/* Header skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-44 rounded-xl bg-muted" />
          <div className="h-4 w-72 sm:w-96 rounded-lg bg-muted/60" />
        </div>
      </div>

      {/* KPI Cards Strip skeleton */}
      <div className="grid grid-cols-2 min-[1700px]:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border/80 bg-card/60 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 rounded-md bg-muted" />
              <div className="h-8 w-8 rounded-lg bg-muted/70" />
            </div>
            <div className="h-8 w-24 rounded-md bg-muted" />
            <div className="h-3.5 w-36 rounded-md bg-muted/50" />
          </div>
        ))}
      </div>

      {/* Directorio de Atletas skeleton */}
      <div className="rounded-2xl border border-border bg-card space-y-4 p-5">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-28 rounded-lg bg-muted" />
            <div className="h-5 w-8 rounded-full bg-muted/70" />
          </div>
          <div className="h-4 w-4 rounded bg-muted/50" />
        </div>

        {/* Toolbar: search + filter buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-10 w-full sm:max-w-xs rounded-xl bg-muted/60" />
          <div className="flex items-center gap-2">
            <div className="h-9 w-20 rounded-lg bg-muted/50" />
            <div className="h-9 w-24 rounded-lg bg-muted/50" />
            <div className="h-9 w-20 rounded-lg bg-muted/50" />
          </div>
        </div>

        {/* Rows skeleton */}
        <div className="space-y-3 pt-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 p-4"
            >
              <div className="flex items-center gap-3.5">
                <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
                <div className="space-y-1.5">
                  <div className="h-4 w-32 sm:w-44 rounded-md bg-muted" />
                  <div className="h-3 w-20 sm:w-28 rounded-md bg-muted/60" />
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-3">
                <div className="h-5 w-20 rounded-full bg-muted/60" />
                <div className="h-5 w-16 rounded-full bg-muted/50" />
              </div>
              <div className="h-9 w-24 rounded-lg bg-muted/80" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
