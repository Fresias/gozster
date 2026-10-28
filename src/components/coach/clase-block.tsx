"use client";

import * as React from "react";
import type { Clase } from "@/types/database.types";
import { NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";

export interface ClaseBlockProps {
  clase: Clase;
  ocupados: number;
  enEspera?: number;
  activa?: boolean;
  ahoraMs?: number;
  solape?: { columna: number; totalColumnas: number };
  mostrarProgreso?: boolean;
  style?: React.CSSProperties;
  onSelect?: (clase: Clase) => void;
  className?: string;
}

export function ClaseBlock({
  clase,
  ocupados,
  enEspera = 0,
  activa = false,
  ahoraMs = Date.now(),
  solape,
  mostrarProgreso = false,
  style,
  onSelect,
  className = "",
}: ClaseBlockProps) {
  const inicioDate = new Date(clase.inicio);
  const finMs = inicioDate.getTime() + (clase.duracion_minutos || 60) * 60 * 1000;
  const finDate = new Date(finMs);

  const horaInicio = inicioDate.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const horaFin = finDate.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const fechaStr = inicioDate.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
  });

  const isCancelada = clase.estado === "CANCELADA";
  const isFinalizada = !isCancelada && finMs < ahoraMs;
  const isSobrecupo = !isCancelada && clase.capacidad !== null && ocupados > clase.capacidad;
  const isLlena = !isCancelada && clase.capacidad !== null && ocupados === clase.capacidad;

  // Estilos de actividad / estado
  let themeClass = "";
  let barClass = "";

  if (isCancelada) {
    themeClass = "bg-card border-dashed border-slate-400 dark:border-slate-600 text-muted-foreground";
    barClass = "bg-slate-300 dark:bg-slate-600";
  } else if (isFinalizada) {
    themeClass = "bg-muted text-slate-600 dark:text-slate-300 border-border";
    barClass = "bg-slate-300 dark:bg-slate-600";
  } else if (clase.actividad === "FUNCIONAL") {
    themeClass = "bg-act-funcional-bg text-act-funcional-fg border-act-funcional-bar/30";
    barClass = "bg-act-funcional-bar";
  } else {
    // BOXEO
    themeClass = "bg-act-boxeo-bg text-act-boxeo-fg border-act-boxeo-bar/30";
    barClass = "bg-act-boxeo-bar";
  }

  // Solapes
  const solapeStyle: React.CSSProperties = solape && solape.totalColumnas > 1
    ? {
        width: `calc(${100 / solape.totalColumnas}% - 4px)`,
        left: `calc(${(solape.columna / solape.totalColumnas) * 100}% + 2px)`,
        right: "auto",
      }
    : {};

  const cupoTexto = isCancelada
    ? "Cancelada"
    : clase.capacidad === null
      ? `${ocupados} anot.`
      : `${ocupados}/${clase.capacidad}`;

  const actividadNombre = NOMBRE_ACTIVIDAD[clase.actividad] || clase.actividad;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(clase)}
      style={{ ...solapeStyle, ...style }}
      aria-label={`${actividadNombre}, ${fechaStr}, ${horaInicio} a ${horaFin}, ${cupoTexto}`}
      className={`group absolute left-1 right-1 rounded-md border overflow-hidden pl-2.5 pr-1.5 py-1.5 text-left transition-all duration-150 touch-manipulation hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        activa ? "ring-2 ring-primary ring-offset-1 z-20 shadow-xs" : "z-10"
      } ${themeClass} ${className}`}
    >
      {/* Barra lateral de acento */}
      <span className={`absolute inset-y-0 left-0 w-[3px] ${barClass}`} aria-hidden="true" />

      {/* Línea 1: Actividad + Badges */}
      <div className="flex items-center justify-between gap-1 leading-tight">
        <span
          className={`text-[13px] font-semibold truncate ${
            isCancelada ? "line-through opacity-75" : ""
          }`}
        >
          {actividadNombre}
        </span>

        {isSobrecupo && (
          <span
            className="ml-auto shrink-0 rounded bg-amber-400 px-1 font-mono text-[10px] font-semibold text-amber-950"
            title="Sobrecupo"
          >
            +{ocupados - clase.capacidad!}
          </span>
        )}

        {isLlena && !isFinalizada && (
          <span
            className="ml-auto shrink-0 rounded bg-foreground px-1 text-[10px] font-semibold text-background"
            title="Cupo completo"
          >
            Llena
          </span>
        )}

        {enEspera > 0 && !isCancelada && (
          <span
            className="ml-auto shrink-0 rounded bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 px-1 font-mono text-[10px] font-semibold"
            title={`${enEspera} en lista de espera`}
          >
            {enEspera} esp.
          </span>
        )}
      </div>

      {/* Línea 2: Hora · Ocupación */}
      <span className="mt-0.5 block truncate font-mono text-[11px] font-medium leading-tight opacity-90">
        {horaInicio} · {cupoTexto}
      </span>

      {/* Línea 3: Barra de ocupación (opcional en vista Día) */}
      {mostrarProgreso && !isCancelada && clase.capacidad !== null && (
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isSobrecupo
                ? "bg-amber-500 w-full"
                : isLlena
                  ? "bg-emerald-600 w-full"
                  : "bg-primary"
            }`}
            style={{
              width: `${Math.min(100, Math.round((ocupados / clase.capacidad) * 100))}%`,
            }}
          />
        </div>
      )}
    </button>
  );
}
