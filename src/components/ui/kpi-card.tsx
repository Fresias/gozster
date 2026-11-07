import * as React from "react";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  periodo?: React.ReactNode;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  testId?: string;
  valueTestId?: string;
  title?: string;
}

/**
 * Tarjeta de KPI unificada para Coach Studio (08 §3, §4.1, §4.3, FIX-06, P08).
 * Sin íconos de color, sin barras de progreso.
 * Estructura: etiqueta 13px + período 12px arriba a la derecha, cifra 28/600 tabular-nums y subtítulo 13px.
 */
export function KpiCard({
  label,
  periodo,
  value,
  subtitle,
  onClick,
  className,
  testId,
  valueTestId,
  title,
}: KpiCardProps) {
  const isInteractive = Boolean(onClick);

  return (
    <div
      data-testid={testId}
      title={title}
      onClick={onClick}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "p-4 rounded-xl border border-border bg-card text-card-foreground shadow-none flex flex-col gap-1.5 transition-colors",
        isInteractive && "hover:bg-muted/40 cursor-pointer text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
        <span>{label}</span>
        {periodo && (
          <span className="text-xs text-muted-foreground font-normal">{periodo}</span>
        )}
      </div>
      <div
        data-testid={valueTestId}
        className="text-[28px] leading-[32px] font-semibold tracking-[-0.02em] tabular-nums text-foreground"
      >
        {value}
      </div>
      {subtitle && (
        <div className="text-[13px] text-muted-foreground">
          {subtitle}
        </div>
      )}
    </div>
  );
}
