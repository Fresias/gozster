"use client";

import * as React from "react";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";

export function WorkspaceModeToggle({
  showDescription = false,
  className = "",
}: {
  showDescription?: boolean;
  className?: string;
}) {
  const { mode, setMode } = useWorkspaceModeStore();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div
        className={`inline-flex h-9 items-center rounded-xl bg-secondary/80 p-0.5 border border-border/60 ${className}`}
        aria-hidden="true"
      >
        <div className="h-7 w-20 rounded-lg bg-card/60 animate-pulse" />
      </div>
    );
  }

  const isTest = mode === "TESTEO";

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div
        role="radiogroup"
        aria-label="Conmutador de Entorno: Modo Producción vs Modo Testeo"
        className="inline-flex h-9 items-center rounded-xl bg-secondary/80 p-1 border border-border/60 shadow-xs backdrop-blur-xs select-none"
        data-testid="workspace-mode-toggle"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!isTest}
          onClick={() => setMode("PRODUCCION")}
          className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition-all ${
            !isTest
              ? "bg-card text-foreground shadow-xs border border-border/40"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Modo Producción: Conectado a base en vivo Supabase"
          data-testid="toggle-mode-produccion"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              !isTest ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50"
            }`}
          />
          <span>⚡ Producción</span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={isTest}
          onClick={() => setMode("TESTEO")}
          className={`flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold transition-all ${
            isTest
              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 shadow-xs border border-amber-500/40"
              : "text-muted-foreground hover:text-foreground"
          }`}
          title="Modo Testeo: Atletas ficticios para probar todos los semáforos y alertas M3"
          data-testid="toggle-mode-testeo"
        >
          <span className="text-xs">🧪</span>
          <span>Modo Testeo</span>
          <span className="rounded bg-amber-500/25 px-1 py-0.2 text-[9px] font-extrabold uppercase tracking-wide text-amber-800 dark:text-amber-200 hidden sm:inline">
            Demo
          </span>
        </button>
      </div>

      {showDescription && (
        <span className="text-[10px] text-muted-foreground font-medium pl-1">
          {isTest
            ? "Mostrando 10 atletas de prueba con todos los semáforos M3."
            : "Conectado a datos reales de Supabase."}
        </span>
      )}
    </div>
  );
}
