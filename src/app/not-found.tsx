import * as React from "react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main
      data-testid="not-found-page"
      className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Error 404
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-outfit">
            Página no encontrada
          </h1>
          <p className="text-sm text-muted-foreground">
            La dirección que buscás no existe o fue movida. Podés volver al inicio de sesión o ir directo a tu espacio.
          </p>
        </div>

        <nav aria-label="Enlaces de recuperación" className="space-y-3 pt-1">
          <Link
            href="/login"
            data-testid="not-found-login-link"
            className="inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-base font-bold tracking-wide text-primary-foreground transition-all duration-150 select-none touch-manipulation hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Ir al inicio de sesión
          </Link>

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/athlete"
              data-testid="not-found-athlete-link"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-all duration-150 hover:bg-muted/60 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              App de Atleta
            </Link>
            <Link
              href="/studio"
              data-testid="not-found-studio-link"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-background px-3.5 text-sm font-medium text-foreground transition-all duration-150 hover:bg-muted/60 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Coach Studio
            </Link>
          </div>
        </nav>
      </div>
    </main>
  );
}
