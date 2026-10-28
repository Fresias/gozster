"use client";

import * as React from "react";
import type { Clase, Reserva } from "@/types/database.types";
import type { DiaSemana } from "@/lib/clases";
import { ocupaCupo } from "@/lib/clases";
import { NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";
import { ClassAgendaMonth } from "./class-agenda-month";

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
  fechaRef?: Date;
  onIrHoy?: () => void;
  onNavegarSemana?: (deltaSemanas: number) => void;
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
  fechaRef,
  onIrHoy,
  onNavegarSemana,
  className = "",
}: ClassAgendaMobileProps) {
  const [buscadorAbierto, setBuscadorAbierto] = React.useState(false);
  const [filtroBusqueda, setFiltroBusqueda] = React.useState("");

  const getOcupacion = (id: string) =>
    reservas.filter((r) => r.clase_id === id && ocupaCupo(r)).length;

  const getEnEspera = (id: string) =>
    reservas.filter((r) => r.clase_id === id && r.estado === "EN_ESPERA").length;

  const ahoraDate = new Date(ahoraMs);
  const horaActualStr = ahoraDate.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const esHoy = hoyClave === diaSeleccionado;

  // Fecha y semana para App Bar
  const refDate = fechaRef || ahoraDate;
  const mesAnio = refDate.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });

  const getNumeroSemana = (d: Date) => {
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  };

  const numeroSemana = getNumeroSemana(refDate);
  const primerDiaSemana = dias[0]?.numero || 1;
  const ultimoDiaSemana = dias[6]?.numero || 7;
  const mesCorto = refDate.toLocaleDateString("es-AR", { month: "short" });
  const semanaTexto = `Semana ${numeroSemana} · ${primerDiaSemana} ${mesCorto} – ${ultimoDiaSemana} ${mesCorto}`;

  // Clases filtradas por búsqueda
  const clasesFiltradas = React.useMemo(() => {
    if (!filtroBusqueda.trim()) return clases;
    const q = filtroBusqueda.toLowerCase();
    return clases.filter(
      (c) =>
        c.actividad.toLowerCase().includes(q) ||
        (NOMBRE_ACTIVIDAD[c.actividad] || "").toLowerCase().includes(q)
    );
  }, [clases, filtroBusqueda]);

  // Clases del día seleccionado
  const clasesDia = React.useMemo(() => {
    return clasesFiltradas
      .filter((c) => c.inicio.slice(0, 10) === diaSeleccionado)
      .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
  }, [clasesFiltradas, diaSeleccionado]);

  // Stats rápidas para carrusel (3 primeras métricas)
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

  // Gestión de swipe horizontal para tira de 7 días (navegación entre semanas)
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    // Solo si el gesto horizontal supera 45px y predomina sobre el vertical
    if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      if (deltaX < 0) {
        // Deslizar izquierda -> siguiente semana
        onNavegarSemana?.(1);
      } else {
        // Deslizar derecha -> semana anterior
        onNavegarSemana?.(-1);
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Render individual de tarjeta de clase
  const renderClaseCard = (c: Clase) => {
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
  };

  return (
    <div className={`lg:hidden flex flex-col bg-background pb-20 max-w-full overflow-x-hidden ${className}`}>
      {/* 1. App Bar Sticky (<1024px) */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur px-4 pt-3 pb-2 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground capitalize">
              {mesAnio}
            </h1>
            <p className="text-xs text-muted-foreground font-mono">
              {semanaTexto}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onIrHoy}
              data-testid="mobile-today-btn"
              className="flex h-12 min-w-12 items-center justify-center rounded-lg px-3 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors touch-manipulation"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setBuscadorAbierto((prev) => !prev)}
              data-testid="mobile-search-btn"
              aria-label="Buscar"
              className="flex h-12 w-12 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors touch-manipulation"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Buscador desplegable */}
        {buscadorAbierto && (
          <div className="mt-2 pt-1 pb-1">
            <input
              type="search"
              value={filtroBusqueda}
              onChange={(e) => setFiltroBusqueda(e.target.value)}
              placeholder="Buscar actividad…"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>
        )}

        {/* Segmented control Día / Semana / Mes (h-10 a todo el ancho) */}
        <div
          role="tablist"
          aria-label="Selector de vista"
          className="mt-2 grid h-10 w-full grid-cols-3 rounded-lg bg-muted p-1 text-sm select-none"
        >
          <button
            type="button"
            role="tab"
            aria-selected={vista === "dia"}
            data-testid="view-day-btn"
            onClick={() => setVista("dia")}
            className={`flex min-h-[32px] items-center justify-center rounded-md text-xs font-semibold transition-all touch-manipulation ${
              vista === "dia"
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Día
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={vista === "semana"}
            data-testid="view-week-btn"
            onClick={() => setVista("semana")}
            className={`flex min-h-[32px] items-center justify-center rounded-md text-xs font-semibold transition-all touch-manipulation ${
              vista === "semana"
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Semana
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={vista === "mes"}
            data-testid="view-month-btn"
            onClick={() => setVista("mes")}
            className={`flex min-h-[32px] items-center justify-center rounded-md text-xs font-semibold transition-all touch-manipulation ${
              vista === "mes"
                ? "bg-card text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mes
          </button>
        </div>
      </header>

      {/* 2. Tira de 7 días (h-14, targets táctiles grandes, dots y soporte swipe) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="grid grid-cols-7 border-b border-border bg-card p-2 text-center gap-1 select-none"
        data-testid="mobile-days-strip"
      >
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
              onClick={() => {
                onSelectDia(d.clave);
                if (vista !== "dia") setVista("dia");
              }}
              className={`flex h-14 min-w-[44px] flex-col items-center justify-center rounded-xl transition-all touch-manipulation ${
                activo
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : esDiaHoy
                    ? "bg-primary/10 text-primary border border-primary/30"
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

      {/* 3. Stats rápidas: Carrusel horizontal de tarjetas (min-w-[150px]) */}
      <div className="flex gap-2.5 overflow-x-auto px-4 py-3 [scrollbar-width:none] touch-pan-x">
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

      {/* 4. Cuerpo de contenido según la vista (Día por defecto / Semana agrupada / Mes) */}
      {vista === "mes" ? (
        <div className="px-2 pt-1" data-testid="mobile-month-container">
          <ClassAgendaMonth
            fechaRef={refDate}
            clases={clasesFiltradas}
            reservas={reservas}
            hoyClave={hoyClave}
            onSelectDia={(d) => {
              onSelectDia(d);
              setVista("dia");
            }}
            onSelectClase={(c) => {
              onSelectClase(c);
              setVista("dia");
            }}
          />
        </div>
      ) : vista === "semana" ? (
        <div className="px-4 pt-1 space-y-5" data-testid="mobile-week-grouped">
          {dias.map((d) => {
            const clasesEsteDia = clasesFiltradas
              .filter((c) => c.inicio.slice(0, 10) === d.clave)
              .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());

            return (
              <section key={d.clave} className="space-y-2">
                <div className="flex items-center justify-between border-b border-border pb-1">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {d.etiqueta} {d.numero} {d.clave === hoyClave ? "· Hoy" : ""}
                  </p>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {clasesEsteDia.length} {clasesEsteDia.length === 1 ? "clase" : "clases"}
                  </span>
                </div>

                {clasesEsteDia.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-1 pl-1">
                    Sin clases programadas
                  </p>
                ) : (
                  <ol className="space-y-2.5">
                    {clasesEsteDia.map(renderClaseCard)}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        /* Vista Día (Por defecto en mobile): Lista-agenda grid-cols-[48px_1fr] */
        <section className="px-4 pt-1" aria-label="Lista de clases del día" data-testid="mobile-day-agenda">
          <p className="pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {clasesDia.length} {clasesDia.length === 1 ? "clase programada" : "clases programadas"}
          </p>

          {clasesDia.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-xs text-muted-foreground">
              No hay clases programadas para este día.
            </div>
          ) : (
            <ol className="space-y-3">
              {(() => {
                const elementos: React.ReactNode[] = [];
                let lineaAhoraInsertada = false;

                clasesDia.forEach((c) => {
                  const inicioMs = new Date(c.inicio).getTime();

                  // Si es hoy, insertar línea de "ahora" en la posición cronológica correcta
                  if (esHoy && !lineaAhoraInsertada && ahoraMs < inicioMs) {
                    elementos.push(
                      <li
                        key="linea-ahora"
                        data-testid="current-time-indicator"
                        className="relative grid grid-cols-[48px_1fr] gap-2.5 py-1 items-center"
                        aria-label={`Hora actual: ${horaActualStr}`}
                      >
                        <span className="font-mono text-xs font-bold text-primary tabular-nums">
                          {horaActualStr}
                        </span>
                        <div className="relative h-0.5 rounded bg-primary">
                          <span className="absolute -left-1 -top-[3px] block h-2 w-2 rounded-full bg-primary" />
                        </div>
                      </li>
                    );
                    lineaAhoraInsertada = true;
                  }

                  elementos.push(renderClaseCard(c));
                });

                // Si aún no se insertó y es hoy (todas las clases ya empezaron)
                if (esHoy && !lineaAhoraInsertada) {
                  elementos.push(
                    <li
                      key="linea-ahora"
                      data-testid="current-time-indicator"
                      className="relative grid grid-cols-[48px_1fr] gap-2.5 py-1 items-center"
                      aria-label={`Hora actual: ${horaActualStr}`}
                    >
                      <span className="font-mono text-xs font-bold text-primary tabular-nums">
                        {horaActualStr}
                      </span>
                      <div className="relative h-0.5 rounded bg-primary">
                        <span className="absolute -left-1 -top-[3px] block h-2 w-2 rounded-full bg-primary" />
                      </div>
                    </li>
                  );
                }

                return elementos;
              })()}
            </ol>
          )}
        </section>
      )}

      {/* 5. FAB "Nueva clase" móvil (>= 48px target: h-14 w-14 = 56px) */}
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
