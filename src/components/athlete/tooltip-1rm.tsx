"use client";

import * as React from "react";
import { HelpCircle, X } from "@/components/athlete/icons";

export interface Tooltip1RMProps {
  className?: string;
  size?: "sm" | "md";
}

/**
 * Tooltip / Popover interactivo "?" para 1RM (Una Repetición Máxima).
 * Cumple ergonomía táctil en móviles (tap para abrir/cerrar) y hover/focus en desktop.
 * Cero librerías externas (Ponytail).
 */
export function Tooltip1RM({ className = "", size = "sm" }: Tooltip1RMProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLSpanElement>(null);

  // Cerrar con Escape o click fuera
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const btnSize = size === "sm" ? "h-5 w-5" : "h-6 w-6";

  return (
    <span ref={containerRef} className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-label="¿Qué es 1RM? Ver explicación"
        aria-expanded={isOpen}
        title="1RM: repetición máxima teórica calculada por fórmula a partir del peso y reps realizadas"
        data-testid="tooltip-1rm-trigger"
        className={`inline-flex ${btnSize} items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/70 focus:outline-none focus:ring-2 focus:ring-primary/40 active:scale-95 transition-all cursor-pointer touch-manipulation`}
      >
        <HelpCircle className={iconSize} />
      </button>

      {isOpen && (
        <span
          role="tooltip"
          data-testid="tooltip-1rm-content"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-64 p-3 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl text-left text-xs leading-relaxed animate-in fade-in zoom-in-95 duration-150 pointer-events-auto"
        >
          <span className="flex items-start justify-between gap-1.5 mb-1">
            <span className="font-bold text-foreground flex items-center gap-1">
              <span>🎯</span>
              <span>¿Qué es 1RM?</span>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              aria-label="Cerrar explicación"
              className="p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
          <span className="block text-[11px] text-muted-foreground">
            Es la <strong>repetición máxima teórica</strong> que podrías alcanzar, calculada por fórmula matemática (Epley / Brzycki) a partir del peso y las repeticiones que realizaste.
          </span>
          {/* Flecha indicadora */}
          <span
            aria-hidden="true"
            className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-popover"
          />
        </span>
      )}
    </span>
  );
}
