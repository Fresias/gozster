"use client";

import * as React from "react";
import type { Clase, Reserva } from "@/types/database.types";
import type { DiaSemana } from "@/lib/clases";
import { ocupaCupo } from "@/lib/clases";
import { NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";

export interface ClassAgendaMobileProps {
  vista: "dia" | "semana" | "mes";
  setVista: (v: "dia" | "semana" | "mes") => void;
  dias: DiaSemana[];
  diaSeleccionado: string;
  onSelectDia: (diaClave: string) => void;
  clases: Clase[];
  reservas: Array<Reserva & { alumno_nombre?: string }>;
  hoyClave: string;
  ahoraMs?: number;
  claseSeleccionadaId?: string | null;
  onSelectClase: (clase: Clase) => void;
  onAbrirCrear: () => void;
  className?: string;
}

export function ClassAgendaMobile({
  vista,
  setVista,
  dias,
  diaSeleccionado,
  onSelectDia,
  clases,
  reservas,
  hoyClave,
  ahoraMs = Date.now(),
  claseSeleccionadaId,
  onSelectClase,
  onAbrirCrear,
  className = "",
}: ClassAgendaMobileProps) {
  const getOcupacion = (id: string) =>
    reservas.filter((r) => r.clase_id === id && ocupaCupo(r)).length;

  const getEnEspera = (id: string) =>
    reservas.filter((r) => r.clase_id === id && r.estado === "EN_ESPERA").length;

  const ahoraDate = new Date(ahoraMs);
  const horaActualDec = ahoraDate.getHours() + ahoraDate.getMinutes() / 60;
  const esHoy = ahoraDate.toISOString().slice(0, 10) === diaSeleccionado;

  // Clases del día seleccionado
  const clasesDia = clases
    .filter((c) => c.inicio.slice(0, 10) === diaSeleccionado)
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

  // Stats rápidas para carrusel
  const clasesSemana = clases.filter((c) => c.estado !== "CANCELADA");
  let totalCapacidad = 0;
  let totalOcupados = 0;
  let sobrecupoHoy = 0;
  let cuposLibresHoy = 0;

  for (const c of clasesSemana) {
    if (c.capacidad !== null) {
      totalCapacidad += c.capacidad;
      const oc = reservas.filter((r) => r.clase_id === c.id && ocupaCupo(r)).length;
      totalOcupados += oc;
      if (c.inicio.slice(0, 10) === hoyClave) {
        cuposLibresHoy += Math.max(0, c.capacidad - oc);
        if (oc > c.capacidad) sobrecupoHoy++;
      }
    }
  }

  const porcentajeOcupacion = totalCapacidad > 0
    ? Math.round((totalOcupados / totalCapacidad) * 100)
    : 0;

  return (
    <div className={`lg:hidden flex flex-col bg-background pb-20 ${className}`}>
      {/* Tira de 7 días (Objetivos táctiles grandes) */}
      <div className="grid grid-cols-7 border-b border-border bg-card p-2 text-center gap-1">
        {dias.map((d) => {
          const activo = d.clave === diaSeleccionado;
          const esDiaHoy = d.clave === hoyClave;
          const clasesEsteDia = clases.filter((c) => c.inicio.slice(0, 10) === d.clave);
          const tieneFuncional = clasesEsteDia.some((c) => c.actividad === "FUNCIONAL");
          const tieneBoxeo = clasesEsteDia.some((c) => c.actividad === "BOXEO");

          return (
            <button
              key={d.clave}
              type="button"
              onClick={() => onSelectDia(d.clave)}
              className={`flex h-14 flex-col items-center justify-center rounded-xl transition-all touch-manipulation ${
                activo
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-foreground hover:bg-muted"
              }`}
            >
              <span
                className={`text-[10px] uppercase font-semibold ${
                  activo ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {d.etiqueta}
              </span>
              <span className="font-mono text-sm font-black tabular-nums">
                {d.numero}
              </span>
              <span className="mt-0.5 flex gap-1 h-1.5 items-center">
                {tieneFuncional && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      activo ? "bg-primary-foreground" : "bg-sky-500"
                    }`}
                  />
                )}
                {tieneBoxeo && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      activo ? "bg-primary-foreground/80" : "bg-orange-500"
                    }`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stats rápidas: Carrusel horizontal */}
      <div className="flex gap-2.5 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
        <div className="flex min-w-[150px] items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-xs">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="9" cy="8" r="4" />
              <path d="M2 21c0-4 3-6 7-6M17 14v6M14 17h6" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="font-mono text-base font-bold text-foreground tabular-nums">
              {cuposLibresHoy}
            </p>
            <p className="text-[11px] text-muted-foreground">cupos libres hoy</p>
          </div>
        </div>

        <div className="flex min-w-[150px] items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-xs">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="font-mono text-base font-bold text-foreground tabular-nums">
              {sobrecupoHoy}
            </p>
            <p className="text-[11px] text-muted-foreground">sobrecupo hoy</p>
          </div>
        </div>

        <div className="flex min-w-[150px] items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-xs">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 17l6-6 4 4 8-8" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="font-mono text-base font-bold text-foreground tabular-nums">
              {porcentajeOcupacion}%
            </p>
            <p className="text-[11px] text-muted-foreground">ocupación sem.</p>
          </div>
        </div>
      </div>

      {/* Lista-agenda: 48px hora | Tarjeta de clase */}
      <section className="px-4 pt-1" aria-label="Lista de clases del día">
        <p className="pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {clasesDia.length} {clasesDia.length === 1 ? "clase programada" : "clases programadas"}
        </p>

        {clasesDia.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
            No hay clases programadas para este día.
          </div>
        ) : (
          <ol className="space-y-3">
            {clasesDia.map((c) => {
              const inicio = new Date(c.inicio);
              const fin = new Date(inicio.getTime() + (c.duracion_minutos || 60) * 60 * 1000);
              const horaInicio = inicio.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
              const horaFin = fin.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });

              const ocupados = getOcupacion(c.id);
              const enEspera = getEnEspera(c.id);
              const isCancelada = c.estado === "CANCELADA";
              const isFinalizada = !isCancelada && fin.getTime() < ahoraMs;
              const isSobrecupo = !isCancelada && c.capacidad !== null && ocupados > c.capacidad;
              const isLlena = !isCancelada && c.capacidad !== null && ocupados === c.capacidad;

              let themeClass = "";
              let barClass = "";

              if (isCancelada) {
                themeClass = "bg-card border-dashed border-slate-400 dark:border-slate-600 text-muted-foreground";
                barClass = "bg-slate-300 dark:bg-slate-600";
              } else if (isFinalizada) {
                themeClass = "bg-muted text-muted-foreground border-border";
                barClass = "bg-slate-300 dark:bg-slate-600";
              } else if (c.actividad === "FUNCIONAL") {
                themeClass = "bg-act-funcional-bg text-act-funcional-fg border-act-funcional-bar/30";
                barClass = "bg-act-funcional-bar";
              } else {
                themeClass = "bg-act-boxeo-bg text-act-boxeo-fg border-act-boxeo-bar/30";
                barClass = "bg-act-boxeo-bar";
              }

              return (
                <li key={c.id} className="grid grid-cols-[48px_1fr] gap-2.5 items-start">
                  <span className="pt-2 font-mono text-xs font-semibold text-muted-foreground tabular-nums">
                    {horaInicio}
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelectClase(c)}
                    className={`relative min-h-[64px] overflow-hidden rounded-xl border py-2.5 pl-4 pr-3 text-left transition-all touch-manipulation hover:brightness-[0.98] ${themeClass} ${
                      claseSeleccionadaId === c.id ? "ring-2 ring-primary ring-offset-1" : ""
                    }`}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1 ${barClass}`} />

                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-[15px] font-bold ${isCancelada ? "line-through" : ""}`}>
                        {NOMBRE_ACTIVIDAD[c.actividad] || c.actividad}
                      </span>

                      <div className="flex items-center gap-1">
                        {isSobrecupo && (
                          <span className="rounded bg-amber-400 px-1.5 text-[10px] font-semibold text-amber-950 font-mono">
                            Sobrecupo +{ocupados - c.capacidad!}
                          </span>
                        )}
                        {isLlena && !isFinalizada && (
                          <span className="rounded bg-foreground px-1.5 text-[10px] font-semibold text-background">
                            Llena
                          </span>
                        )}
                        {isCancelada ? (
                          <span className="text-xs font-medium text-destructive">Cancelada</span>
                        ) : isFinalizada ? (
                          <span className="text-xs font-medium">Finalizada</span>
                        ) : (
                          <span className="font-mono text-xs font-semibold tabular-nums">
                            {c.capacidad === null ? `${ocupados} anot.` : `${ocupados}/${c.capacidad}`}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="block font-mono text-xs text-muted-foreground mt-0.5 tabular-nums">
                      {horaInicio} – {horaFin}
                      {enEspera > 0 && ` · ${enEspera} en espera`}
                    </span>

                    {/* Barra de progreso de ocupación */}
                    {!isCancelada && c.capacidad !== null && (
                      <span className="mt-2 block h-1.5 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                        <span
                          className={`block h-full rounded-full ${
                            isSobrecupo
                              ? "bg-amber-500 w-full"
                              : isLlena
                                ? "bg-emerald-600 w-full"
                                : "bg-primary"
                          }`}
                          style={{
                            width: `${Math.min(100, Math.round((ocupados / c.capacidad) * 100))}%`,
                          }}
                        />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* FAB Nueva clase móvil (>= 48px target) */}
      <button
        type="button"
        onClick={onAbrirCrear}
        data-testid="mobile-create-class-fab"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-all touch-manipulation active:scale-95"
        aria-label="Nueva clase"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
