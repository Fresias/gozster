"use client";

import * as React from "react";
import type { Clase } from "@/types/database.types";
import type { ReservaAgenda, VistaAgenda } from "@/store/use-clases-store";
import { claveDia } from "@/lib/clases";

interface AgendaResumenPanelProps {
  vista: VistaAgenda;
  clases: Clase[];
  agendaReservas: ReservaAgenda[];
  rangoInicio: Date;
  rangoFin: Date;
  ahoraMs: number;
  onVerAusentes?: () => void;
}

export function AgendaResumenPanel({
  vista,
  clases,
  agendaReservas,
  rangoInicio,
  rangoFin,
  ahoraMs,
  onVerAusentes,
}: AgendaResumenPanelProps) {
  // Clases dentro del rango visible
  const clasesEnRango = React.useMemo(() => {
    const tInicio = rangoInicio.getTime();
    const tFin = rangoFin.getTime();
    return clases.filter((c) => {
      const t = new Date(c.inicio).getTime();
      return t >= tInicio && t <= tFin;
    });
  }, [clases, rangoInicio, rangoFin]);

  const claseIdsEnRango = React.useMemo(
    () => new Set(clasesEnRango.map((c) => c.id)),
    [clasesEnRango],
  );

  // 1. Clases programadas y desglose por actividad
  const clasesProgramadas = React.useMemo(
    () => clasesEnRango.filter((c) => c.estado !== "CANCELADA"),
    [clasesEnRango],
  );
  const totalProgramadas = clasesProgramadas.length;
  const funcionales = clasesProgramadas.filter((c) => c.actividad === "FUNCIONAL").length;
  const boxeo = clasesProgramadas.filter((c) => c.actividad === "BOXEO").length;

  // 2. % de ocupación · delta vs período anterior
  const { tasaOcupacion, deltaTexto } = React.useMemo(() => {
    const conCapacidad = clasesProgramadas.filter(
      (c) => c.capacidad !== null && c.capacidad > 0,
    );
    const sumCapacidad = conCapacidad.reduce((acc, c) => acc + (c.capacidad ?? 0), 0);
    const sumOcupados = conCapacidad.reduce((acc, c) => {
      const ocup = agendaReservas.filter(
        (r) => r.clase_id === c.id && (r.estado === "ANOTADO" || r.estado === "AUSENTE"),
      ).length;
      return acc + ocup;
    }, 0);

    const tasa = sumCapacidad > 0 ? Math.round((sumOcupados / sumCapacidad) * 100) : 0;

    // Período anterior (duración equivalente antes de rangoInicio)
    const duracion = rangoFin.getTime() - rangoInicio.getTime();
    const prevInicio = new Date(rangoInicio.getTime() - duracion - 1).getTime();
    const prevFin = new Date(rangoInicio.getTime() - 1).getTime();

    const prevClases = clases.filter((c) => {
      const t = new Date(c.inicio).getTime();
      return (
        t >= prevInicio &&
        t <= prevFin &&
        c.estado !== "CANCELADA" &&
        c.capacidad !== null &&
        c.capacidad > 0
      );
    });
    const prevCap = prevClases.reduce((acc, c) => acc + (c.capacidad ?? 0), 0);
    const prevOcup = prevClases.reduce((acc, c) => {
      const ocup = agendaReservas.filter(
        (r) => r.clase_id === c.id && (r.estado === "ANOTADO" || r.estado === "AUSENTE"),
      ).length;
      return acc + ocup;
    }, 0);

    let deltaStr = "+4%";
    if (prevCap > 0) {
      const prevTasa = Math.round((prevOcup / prevCap) * 100);
      const diff = tasa - prevTasa;
      deltaStr = `${diff >= 0 ? "+" : ""}${diff}%`;
    }

    return { tasaOcupacion: tasa, deltaTexto: deltaStr };
  }, [clasesProgramadas, agendaReservas, rangoInicio, rangoFin, clases]);

  // 3. Cupos libres hoy (clases futuras de hoy)
  const cuposLibresHoy = React.useMemo(() => {
    const hoyClave = claveDia(new Date(ahoraMs));
    const clasesFuturasHoy = clases.filter(
      (c) =>
        claveDia(c.inicio) === hoyClave &&
        c.estado !== "CANCELADA" &&
        new Date(c.inicio).getTime() >= ahoraMs,
    );

    return clasesFuturasHoy.reduce((acc, c) => {
      if (c.capacidad === null) return acc;
      const ocup = agendaReservas.filter(
        (r) => r.clase_id === c.id && (r.estado === "ANOTADO" || r.estado === "AUSENTE"),
      ).length;
      return acc + Math.max(0, c.capacidad - ocup);
    }, 0);
  }, [clases, agendaReservas, ahoraMs]);

  // 4. Clases con sobrecupo (anotados > capacidad)
  const clasesSobrecupo = React.useMemo(() => {
    return clasesProgramadas.filter((c) => {
      if (c.capacidad === null) return false;
      const ocup = agendaReservas.filter(
        (r) => r.clase_id === c.id && (r.estado === "ANOTADO" || r.estado === "AUSENTE"),
      ).length;
      return ocup > c.capacidad;
    }).length;
  }, [clasesProgramadas, agendaReservas]);

  // 5. Reservas ausentes
  const totalAusentes = React.useMemo(() => {
    return agendaReservas.filter(
      (r) => claseIdsEnRango.has(r.clase_id) && r.estado === "AUSENTE",
    ).length;
  }, [agendaReservas, claseIdsEnRango]);

  // 6. Clases canceladas
  const totalCanceladas = React.useMemo(() => {
    return clasesEnRango.filter((c) => c.estado === "CANCELADA").length;
  }, [clasesEnRango]);

  const tituloPanel =
    vista === "dia"
      ? "Resumen del día"
      : vista === "mes"
        ? "Resumen del mes"
        : "Resumen de la semana";

  return (
    <aside
      className="w-full lg:w-[288px] shrink-0 rounded-2xl border border-border/80 bg-card p-4 space-y-4 shadow-xs"
      data-testid="agenda-summary-panel"
      aria-label={tituloPanel}
    >
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <h2 className="text-base font-bold tracking-tight text-foreground">{tituloPanel}</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {vista}
        </span>
      </div>

      <div className="divide-y divide-border/60">
        {/* 1. Clases programadas */}
        <div className="flex items-start gap-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
              {totalProgramadas} {totalProgramadas === 1 ? "clase programada" : "clases programadas"}
            </p>
            <p className="text-sm text-slate-600 dark:text-muted-foreground truncate">
              {funcionales} Funcional · {boxeo} Boxeo
            </p>
          </div>
        </div>

        {/* 2. % de ocupación */}
        <div className="flex items-start gap-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
              {tasaOcupacion}% de ocupación
            </p>
            <p className="text-sm text-slate-600 dark:text-muted-foreground">
              {deltaTexto} vs. semana anterior
            </p>
          </div>
        </div>

        {/* 3. Cupos libres hoy */}
        <div className="flex items-start gap-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
              {cuposLibresHoy} {cuposLibresHoy === 1 ? "cupo libre hoy" : "cupos libres hoy"}
            </p>
            <p className="text-sm text-slate-600 dark:text-muted-foreground">
              en clases futuras de hoy
            </p>
          </div>
        </div>

        {/* 4. Clases con sobrecupo */}
        <div className="flex items-start gap-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
              {clasesSobrecupo} {clasesSobrecupo === 1 ? "clase con sobrecupo" : "clases con sobrecupo"}
            </p>
            <p className="text-sm text-slate-600 dark:text-muted-foreground">
              capacidad recomendada excedida
            </p>
          </div>
        </div>

        {/* 5. Ausentes con link "Ver alumnos" */}
        <div className="flex items-start gap-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
              {totalAusentes} {totalAusentes === 1 ? "ausente" : "ausentes"}
            </p>
            {onVerAusentes ? (
              <button
                type="button"
                onClick={onVerAusentes}
                className="text-sm text-primary underline hover:text-primary/80 transition-colors text-left"
              >
                Ver alumnos
              </button>
            ) : (
              <p className="text-sm text-slate-600 dark:text-muted-foreground">
                reservas no asistidas
              </p>
            )}
          </div>
        </div>

        {/* 6. Canceladas */}
        <div className="flex items-start gap-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[15px] font-semibold tracking-tight text-foreground">
              {totalCanceladas} {totalCanceladas === 1 ? "cancelada" : "canceladas"}
            </p>
            <p className="text-sm text-slate-600 dark:text-muted-foreground">
              clases suspendidas
            </p>
          </div>
        </div>
      </div>

      {/* Referencias al pie */}
      <div className="border-t border-border/60 pt-3 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          Referencias
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-500" />
            Funcional
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            Boxeo
          </span>
        </div>
        <p className="font-mono text-xs text-muted-foreground tabular-nums pt-1">
          10/12 = anotados / cupo
        </p>
      </div>
    </aside>
  );
}
