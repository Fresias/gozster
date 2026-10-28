"use client";

import * as React from "react";
import type { Clase, Reserva } from "@/types/database.types";
import { ocupaCupo } from "@/lib/clases";

export interface ClassAgendaStatsProps {
  clases: Clase[];
  reservas: Array<Reserva & { alumno_nombre?: string }>;
  ahoraMs?: number;
  rangoTitulo?: string;
  onFiltrarAusentes?: () => void;
  onFiltrarEspera?: () => void;
  className?: string;
}

export function ClassAgendaStats({
  clases,
  reservas,
  ahoraMs = Date.now(),
  rangoTitulo = "la semana",
  onFiltrarAusentes,
  onFiltrarEspera,
  className = "",
}: ClassAgendaStatsProps) {
  // Clases
  const programadas = clases.filter((c) => c.estado !== "CANCELADA");
  const canceladas = clases.filter((c) => c.estado === "CANCELADA");
  const funcCount = programadas.filter((c) => c.actividad === "FUNCIONAL").length;
  const boxCount = programadas.filter((c) => c.actividad === "BOXEO").length;

  // Reservas del set
  const reservasClases = React.useMemo(() => {
    const ids = new Set(clases.map((c) => c.id));
    return reservas.filter((r) => ids.has(r.clase_id));
  }, [clases, reservas]);

  const ausentes = reservasClases.filter((r) => r.estado === "AUSENTE");
  const enEspera = reservasClases.filter((r) => r.estado === "EN_ESPERA");
  const confirmadas = reservasClases.filter((r) => r.estado === "ANOTADO");

  // Ocupación
  let totalCapacidad = 0;
  let totalOcupados = 0;
  let sobrecupoClases = 0;

  for (const c of programadas) {
    if (c.capacidad !== null) {
      totalCapacidad += c.capacidad;
      const oc = reservasClases.filter((r) => r.clase_id === c.id && ocupaCupo(r)).length;
      totalOcupados += oc;
      if (oc > c.capacidad) {
        sobrecupoClases++;
      }
    }
  }

  const porcentajeOcupacion = totalCapacidad > 0
    ? Math.round((totalOcupados / totalCapacidad) * 100)
    : 0;

  // Cupos libres hoy
  const hoyStr = new Date(ahoraMs).toISOString().slice(0, 10);
  const clasesHoy = programadas.filter((c) => c.inicio.slice(0, 10) === hoyStr);
  let cuposLibresHoy = 0;
  for (const c of clasesHoy) {
    if (c.capacidad !== null) {
      const oc = reservasClases.filter((r) => r.clase_id === c.id && ocupaCupo(r)).length;
      cuposLibresHoy += Math.max(0, c.capacidad - oc);
    }
  }

  // Próxima clase
  const proximas = programadas
    .filter((c) => new Date(c.inicio).getTime() >= ahoraMs)
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  const proxima = proximas[0] || null;

  return (
    <aside
      className={`flex flex-col bg-card border-l border-border ${className}`}
      aria-labelledby="stats-titulo"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <h2 id="stats-titulo" className="text-[15px] font-semibold text-foreground">
          Resumen de {rangoTitulo}
        </h2>
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          {programadas.length} ses.
        </span>
      </div>

      <ul className="space-y-1 p-3 flex-1 overflow-y-auto">
        {/* 1. Clases programadas */}
        <li className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="17" rx="2" />
              <path d="M3 9h18" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[14px] font-semibold text-foreground">
              <span className="font-mono text-[15px] tabular-nums">{programadas.length}</span> clases programadas
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {funcCount} Funcional · {boxCount} Boxeo
            </p>
          </div>
        </li>

        {/* 2. % de ocupación */}
        <li className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 17l6-6 4 4 8-8" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[14px] font-semibold text-foreground">
              <span className="font-mono text-[15px] tabular-nums">{porcentajeOcupacion}%</span> de ocupación
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono tabular-nums">
              {totalOcupados}/{totalCapacidad} cupos utilizados
            </p>
          </div>
        </li>

        {/* 3. Cupos libres hoy */}
        <li className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="9" cy="8" r="4" />
              <path d="M2 21c0-4 3-6 7-6M17 14v6M14 17h6" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[14px] font-semibold text-foreground">
              <span className="font-mono text-[15px] tabular-nums">{cuposLibresHoy}</span> cupos libres hoy
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              En {clasesHoy.length} clases de hoy
            </p>
          </div>
        </li>

        {/* 4. Sobrecupo */}
        <li className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[14px] font-semibold text-foreground">
              <span className="font-mono text-[15px] tabular-nums">{sobrecupoClases}</span> {sobrecupoClases === 1 ? "clase con sobrecupo" : "clases con sobrecupo"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {sobrecupoClases > 0 ? "Cupo flexible activo" : "Sin sobrecupo reportado"}
            </p>
          </div>
        </li>

        {/* 5. Ausentes */}
        <li className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="9" cy="8" r="4" />
              <path d="M2 21c0-4 3-6 7-6M15 15l5 5M20 15l-5 5" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[14px] font-semibold text-foreground">
              <span className="font-mono text-[15px] tabular-nums">{ausentes.length}</span> ausentes
            </p>
            {onFiltrarAusentes && ausentes.length > 0 ? (
              <button
                type="button"
                onClick={onFiltrarAusentes}
                className="text-xs font-medium text-primary underline underline-offset-2 mt-0.5 hover:opacity-80"
              >
                Ver alumnos
              </button>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                {ausentes.length === 0 ? "Sin inasistencias" : "Alumnos ausentes"}
              </p>
            )}
          </div>
        </li>

        {/* 6. Canceladas */}
        <li className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" />
              <path d="m15 9-6 6M9 9l6 6" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[14px] font-semibold text-foreground">
              <span className="font-mono text-[15px] tabular-nums">{canceladas.length}</span> {canceladas.length === 1 ? "clase cancelada" : "clases canceladas"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {canceladas[0]?.motivo_cancelacion || "Feriados o cancelaciones"}
            </p>
          </div>
        </li>

        {/* 7. Lista de espera (si hay) */}
        {enEspera.length > 0 && (
          <li className="flex gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 6v6l4 2" />
              </svg>
            </span>
            <div className="leading-tight">
              <p className="text-[14px] font-semibold text-foreground">
                <span className="font-mono text-[15px] tabular-nums">{enEspera.length}</span> en lista de espera
              </p>
              {onFiltrarEspera ? (
                <button
                  type="button"
                  onClick={onFiltrarEspera}
                  className="text-xs font-medium text-primary underline underline-offset-2 mt-0.5 hover:opacity-80"
                >
                  Ver en espera
                </button>
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Esperando liberación de cupo
                </p>
              )}
            </div>
          </li>
        )}

        {/* 8. Próxima clase */}
        {proxima && (
          <li className="flex gap-3 rounded-lg px-2 py-2.5 bg-muted/30 border border-border/50">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </span>
            <div className="leading-tight truncate">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Próxima sesión
              </p>
              <p className="text-[13px] font-semibold text-foreground truncate mt-0.5">
                {proxima.actividad === "FUNCIONAL" ? "Funcional" : "Boxeo"}
              </p>
              <p className="text-xs font-mono text-muted-foreground mt-0.5 tabular-nums">
                {new Date(proxima.inicio).toLocaleDateString("es-AR", { weekday: "short" })}{" "}
                {new Date(proxima.inicio).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}
              </p>
            </div>
          </li>
        )}
      </ul>

      {/* Referencias al pie */}
      <div className="border-t border-border p-4 text-xs text-muted-foreground">
        <p className="pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground">
          Referencias
        </p>
        <ul className="grid grid-cols-2 gap-y-2 text-sm text-foreground">
          <li className="flex items-center gap-2 text-xs">
            <span className="h-3 w-3 rounded-sm bg-act-funcional-bg border border-act-funcional-bar" />
            Funcional
          </li>
          <li className="flex items-center gap-2 text-xs">
            <span className="h-3 w-3 rounded-sm bg-act-boxeo-bg border border-act-boxeo-bar" />
            Boxeo
          </li>
          <li className="flex items-center gap-2 text-xs">
            <span className="h-3 w-3 rounded-sm border border-dashed border-slate-400 bg-card" />
            Cancelada
          </li>
          <li className="flex items-center gap-2 text-xs">
            <span className="h-3 w-3 rounded-sm bg-muted border border-border" />
            Finalizada
          </li>
          <li className="col-span-2 pt-1 text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums font-semibold text-foreground">10/12</span> = anotados / cupo ·{" "}
            <span className="rounded bg-amber-400 px-1 font-mono text-[10px] font-semibold text-amber-950">
              +1
            </span>{" "}
            sobrecupo
          </li>
        </ul>
      </div>
    </aside>
  );
}
