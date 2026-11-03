"use client";

import * as React from "react";
import Link from "next/link";
import { useRolActual } from "@/lib/use-rol-actual";

export interface ModeSwitcherProps {
  current: "studio" | "athlete";
  showReturnButton?: boolean;
  className?: string;
}

/**
 * Selector de modo dual para usuarios con rol ADMIN (GOZS-336).
 * Permite conmutar fluidamente entre Coach Studio y la Athlete App (Mi Entrenamiento).
 */
export function ModeSwitcher({
  current,
  showReturnButton = false,
  className = "",
}: ModeSwitcherProps) {
  const rol = useRolActual();

  // Solo se despliega para administradores con rol dual
  if (rol !== "ADMIN") return null;

  return (
    <div
      data-testid="admin-mode-container"
      className={`inline-flex flex-wrap items-center gap-2 ${className}`}
    >
      <nav
        aria-label="Selector de modo"
        data-testid="admin-mode-switcher"
        className="inline-flex items-center rounded-xl border border-border/80 bg-secondary/50 p-1 text-xs font-semibold shadow-xs"
      >
        {current === "studio" ? (
          <span
            aria-current="page"
            data-testid="mode-studio-active"
            className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-xs"
          >
            Modo Studio
          </span>
        ) : (
          <Link
            href="/studio"
            data-testid="mode-studio-link"
            className="rounded-lg px-2.5 py-1 text-xs font-bold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            Modo Studio
          </Link>
        )}

        <span
          className="px-1 text-muted-foreground text-[11px] select-none"
          aria-hidden="true"
        >
          ↔
        </span>

        {current === "athlete" ? (
          <span
            aria-current="page"
            data-testid="mode-athlete-active"
            className="rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground shadow-xs"
          >
            Modo Entrenamiento
          </span>
        ) : (
          <Link
            href="/athlete"
            data-testid="mode-athlete-link"
            className="rounded-lg px-2.5 py-1 text-xs font-bold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            Modo Entrenamiento
          </Link>
        )}
      </nav>

      {showReturnButton && current === "athlete" && (
        <Link
          href="/studio"
          data-testid="return-to-studio"
          className="inline-flex min-h-9 items-center rounded-xl border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/20 transition-colors shadow-xs"
        >
          Volver a Coach Studio
        </Link>
      )}
    </div>
  );
}
