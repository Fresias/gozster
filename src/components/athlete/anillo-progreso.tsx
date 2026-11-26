"use client";

import * as React from "react";

export interface AnilloProgresoProps {
  completadas: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  ariaLabel: string;
  testId?: string;
}

/**
 * Anillo de progreso monocromático (M3 Expressive + v7):
 * - Trazo en color tinta (--a-fg): negro en Claro, blanco en Oscuro.
 * - Sin texto numérico ni tilde interior.
 * - Transición suave (1.25s) respetando prefers-reduced-motion en athlete-v7.css.
 */
export function AnilloProgreso({
  completadas,
  total,
  size = 26,
  strokeWidth = 2.8,
  ariaLabel,
  testId,
}: AnilloProgresoProps) {
  const safeTotal = Math.max(0, total);
  const safeDone = Math.max(0, Math.min(safeTotal, completadas));
  const pct = safeTotal > 0 ? Math.round((safeDone / safeTotal) * 100) : 0;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - (safeTotal > 0 ? safeDone / safeTotal : 0));

  return (
    <span
      className="a-ring"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="a-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={Number(r.toFixed(2))}
          strokeWidth={strokeWidth}
        />
        <circle
          className="a-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={Number(r.toFixed(2))}
          strokeWidth={strokeWidth}
          strokeDasharray={Number(c.toFixed(2))}
          strokeDashoffset={Number(offset.toFixed(2))}
        />
      </svg>
    </span>
  );
}
