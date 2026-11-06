"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export interface AthleteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AthleteError({ error, reset }: AthleteErrorProps) {
  React.useEffect(() => {
    console.error("Athlete App Error Boundary:", error);
  }, [error]);

  return (
    <main
      data-testid="athlete-error-boundary"
      className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground font-outfit">
            No pudimos cargar la vista
          </h2>
          <p className="text-sm text-muted-foreground">
            Ocurrió un error inesperado al cargar la pantalla del atleta.
          </p>
        </div>

        <div className="pt-2">
          <Button
            type="button"
            size="touch"
            onClick={() => reset()}
            className="w-full"
            data-testid="athlete-error-retry-btn"
          >
            Reintentar
          </Button>
        </div>
      </div>
    </main>
  );
}
