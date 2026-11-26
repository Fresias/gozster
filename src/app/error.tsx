"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { reportarErrorApp } from "@/lib/reportar-error-app";

export interface RootErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: RootErrorProps) {
  const ultimoErrorReportadoRef = React.useRef<unknown>(null);

  React.useEffect(() => {
    console.error("Root Error Boundary:", error);
    if (ultimoErrorReportadoRef.current === error) return;
    ultimoErrorReportadoRef.current = error;
    void reportarErrorApp({
      contexto: "root_error_boundary",
      mensajeHumano: "Error inesperado en pantalla de GOZSter",
      error,
    });
  }, [error]);

  return (
    <main
      data-testid="root-error-boundary"
      className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground font-outfit">
            No pudimos cargar la pantalla
          </h2>
          <p className="text-sm text-muted-foreground">
            Ocurrió un error inesperado. Podés reintentar o volver al inicio.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <Button
            type="button"
            size="touch"
            onClick={() => reset()}
            className="w-full"
            data-testid="root-error-retry-btn"
          >
            Reintentar
          </Button>
          <a
            href="/login"
            className="block text-sm text-muted-foreground underline underline-offset-4"
            data-testid="root-error-home-link"
          >
            Ir al inicio
          </a>
        </div>
      </div>
    </main>
  );
}
