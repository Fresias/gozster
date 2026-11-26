"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { reportarErrorApp } from "@/lib/reportar-error-app";
import "./globals.css";

export interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const ultimoErrorReportadoRef = React.useRef<unknown>(null);

  React.useEffect(() => {
    console.error("Global Error Boundary:", error);
    if (ultimoErrorReportadoRef.current === error) return;
    ultimoErrorReportadoRef.current = error;
    void reportarErrorApp({
      contexto: "global_error_boundary",
      mensajeHumano: "Error inesperado crítico en GOZSter",
      error,
    });
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <main
          data-testid="global-error-boundary"
          className="flex min-h-dvh flex-col items-center justify-center p-6 text-center"
          role="alert"
          aria-live="assertive"
        >
          <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
            <div className="space-y-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground font-outfit">
                No pudimos cargar GOZSter
              </h1>
              <p className="text-sm text-muted-foreground">
                Ocurrió un error inesperado al iniciar la aplicación. Podés reintentar o volver al inicio de sesión.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              <Button
                type="button"
                size="touch"
                onClick={() => reset()}
                className="w-full"
                data-testid="global-error-retry-btn"
              >
                Reintentar
              </Button>
              <a
                href="/login"
                className="block text-sm text-muted-foreground underline underline-offset-4"
                data-testid="global-error-login-link"
              >
                Ir al inicio de sesión
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
