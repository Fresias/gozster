"use client";

import * as React from "react";
import type { Clase, Reserva } from "@/types/database.types";
import { diasDelMes, ocupaCupo } from "@/lib/clases";
import { NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";

export interface ClassAgendaMonthProps {
  fechaRef: Date;
  clases: Clase[];
  reservas: Array<Reserva & { alumno_nombre?: string }>;
  hoyClave: string;
  onSelectDia: (diaClave: string) => void;
  onSelectClase: (clase: Clase) => void;
  className?: string;
}

export function ClassAgendaMonth({
  fechaRef,
  clases,
  reservas,
  hoyClave,
  onSelectDia,
  onSelectClase,
  className = "",
}: ClassAgendaMonthProps) {
  const dias = React.useMemo(() => diasDelMes(fechaRef), [fechaRef]);

  const diasHeader = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

  const getOcupacion = (id: string) =>
    reservas.filter((r) => r.clase_id === id && ocupaCupo(r)).length;

  return (
    <div className={`flex flex-col bg-card select-none ${className}`}>
      {/* Header de días de la semana */}
      <div className="grid grid-cols-7 border-b border-border bg-card text-center text-xs font-semibold uppercase text-muted-foreground py-2.5">
        {diasHeader.map((etiqueta, idx) => (
          <div key={etiqueta} className={idx >= 5 ? "text-muted-foreground/60" : ""}>
            {etiqueta}
          </div>
        ))}
      </div>

      {/* Grilla de días del mes */}
      <div className="grid grid-cols-7 auto-rows-fr border-b border-border divide-x divide-y divide-border">
        {dias.map((d) => {
          const esHoy = d.clave === hoyClave;
          const clasesDia = clases.filter((c) => c.inicio.slice(0, 10) === d.clave);
          const maxChips = 3;
          const visibles = clasesDia.slice(0, maxChips);
          const restantes = clasesDia.length - maxChips;

          return (
            <div
              key={d.clave}
              role="button"
              tabIndex={0}
              data-testid={esHoy ? "month-today-cell" : "month-day-cell"}
              onClick={() => onSelectDia(d.clave)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectDia(d.clave);
                }
              }}
              className={`min-h-[108px] sm:min-h-[120px] p-1.5 sm:p-2 flex flex-col justify-between transition-colors hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                d.esMesActual ? "bg-card" : "bg-muted/20 opacity-60"
              } ${esHoy ? "bg-primary/[0.04]" : ""}`}
            >
              {/* Encabezado del día: Número */}
              <div className="flex items-center justify-between">
                {esHoy ? (
                  <span
                    data-testid="month-today-pill"
                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary px-1 font-mono font-bold text-xs text-primary-foreground shadow-xs"
                  >
                    {d.numero}
                  </span>
                ) : (
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {d.numero}
                  </span>
                )}
                {clasesDia.length > 0 && (
                  <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                    {clasesDia.length}
                  </span>
                )}
              </div>

              {/* Chips de clases (hasta 3) */}
              <div className="space-y-1 mt-1 flex-1">
                {visibles.map((c) => {
                  const inicio = new Date(c.inicio);
                  const horaStr = `${String(inicio.getHours()).padStart(2, "0")}:${String(inicio.getMinutes()).padStart(2, "0")}`;
                  const isCancelada = c.estado === "CANCELADA";

                  const themeClass = isCancelada
                    ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 line-through"
                    : c.actividad === "FUNCIONAL"
                      ? "bg-act-funcional-bg text-act-funcional-fg"
                      : "bg-act-boxeo-bg text-act-boxeo-fg";

                  return (
                    <button
                      key={c.id}
                      type="button"
                      data-testid="month-class-chip"
                      aria-label={`${NOMBRE_ACTIVIDAD[c.actividad] || c.actividad}, ${horaStr}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectClase(c);
                      }}
                      className={`w-full flex h-5 items-center justify-between rounded px-1.5 text-[11px] font-medium leading-tight truncate text-left transition-all hover:brightness-95 ${themeClass}`}
                    >
                      <span className="truncate">
                        {NOMBRE_ACTIVIDAD[c.actividad] || c.actividad}
                      </span>
                      <span className="font-mono text-[10px] opacity-80 tabular-nums shrink-0 ml-1">
                        {horaStr}
                      </span>
                    </button>
                  );
                })}

                {restantes > 0 && (
                  <p
                    data-testid="month-more-chips"
                    className="text-[10px] font-semibold text-primary font-mono pt-0.5"
                  >
                    +{restantes} más
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
