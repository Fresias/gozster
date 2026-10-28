"use client";

import * as React from "react";
import type { DiaSemana } from "@/lib/clases";

// Selector lunes a domingo con objetivos táctiles grandes (Agenda y Clases, #113).
export function DaysStrip({
  dias,
  seleccionado,
  hoy,
  conMarca,
  onSeleccionar,
}: {
  dias: DiaSemana[];
  seleccionado: string;
  hoy: string;
  conMarca?: Set<string>;
  onSeleccionar: (clave: string) => void;
}) {
  return (
    <div role="tablist" aria-label="Días de la semana" className="grid grid-cols-7 gap-1.5" data-testid="days-strip">
      {dias.map((d) => {
        const activo = d.clave === seleccionado;
        return (
          <button
            key={d.clave}
            type="button"
            role="tab"
            aria-selected={activo}
            onClick={() => onSeleccionar(d.clave)}
            className={`relative flex min-h-[58px] min-w-12 flex-col items-center justify-center rounded-xl border text-xs font-semibold transition-all touch-manipulation ${
              activo
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            <span>{d.etiqueta}</span>
            <span className="text-base font-black tabular-nums">{d.numero}</span>
            {d.clave === hoy && !activo && <span className="sr-only">(hoy)</span>}
            {d.clave === hoy && (
              <span className={`absolute top-1 right-1 h-1.5 w-1.5 rounded-full ${activo ? "bg-primary-foreground" : "bg-primary"}`} aria-hidden="true" />
            )}
            {conMarca?.has(d.clave) && (
              <span className={`absolute bottom-1 h-1.5 w-4 rounded-full ${activo ? "bg-primary-foreground" : "bg-emerald-500"}`} aria-label="Con reserva" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export const COLOR_ACTIVIDAD: Record<"FUNCIONAL" | "BOXEO", string> = {
  FUNCIONAL: "border-act-funcional-bar/30 bg-act-funcional-bg text-act-funcional-fg",
  BOXEO: "border-act-boxeo-bar/30 bg-act-boxeo-bg text-act-boxeo-fg",
};

export const NOMBRE_ACTIVIDAD: Record<"FUNCIONAL" | "BOXEO", string> = {
  FUNCIONAL: "Funcional",
  BOXEO: "Boxeo",
};
