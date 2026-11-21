import * as React from "react";
import type { LabelActividadItem } from "@/lib/alumno-actividades";

export interface ActivityLabelsProps {
  labels: LabelActividadItem[];
  className?: string;
}

/**
 * Labels monocromáticos neutros sin color (B = Boxeo, F = Funcional, P = Plan/Rutina).
 */
export function ActivityLabels({ labels, className }: ActivityLabelsProps): React.JSX.Element | null {
  if (!labels || labels.length === 0) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 shrink-0 ${className ?? ""}`.trim()}
      data-testid="activity-labels"
    >
      {labels.map((item) => (
        <span
          key={item.codigo}
          title={item.titulo}
          aria-label={item.titulo}
          data-testid={`activity-label-${item.codigo}`}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-transparent px-1 font-mono text-[11px] font-semibold leading-none text-foreground"
        >
          {item.codigo}
        </span>
      ))}
    </span>
  );
}
