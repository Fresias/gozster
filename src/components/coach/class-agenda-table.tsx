"use client";

import * as React from "react";
import type { Clase, Reserva } from "@/types/database.types";
import { NOMBRE_ACTIVIDAD } from "@/components/ui/days-strip";

export interface ClassAgendaTableProps {
  clases: Clase[];
  reservas: Array<Reserva & { alumno_nombre?: string }>;
  filtroEstadoInicial?: string;
  onMarcarAusente?: (reservaId: string) => void;
  onQuitarReserva?: (reservaId: string) => void;
  onAbrirAnotar?: () => void;
  className?: string;
}

export function ClassAgendaTable({
  clases,
  reservas,
  filtroEstadoInicial = "TODAS",
  onMarcarAusente,
  onQuitarReserva,
  onAbrirAnotar,
  className = "",
}: ClassAgendaTableProps) {
  const [filtroEstado, setFiltroEstado] = React.useState(filtroEstadoInicial);
  const [busqueda, setBusqueda] = React.useState("");

  React.useEffect(() => {
    if (filtroEstadoInicial) {
      setFiltroEstado(filtroEstadoInicial);
    }
  }, [filtroEstadoInicial]);

  const claseMap = React.useMemo(() => {
    const map = new Map<string, Clase>();
    for (const c of clases) {
      map.set(c.id, c);
    }
    return map;
  }, [clases]);

  const filas = React.useMemo(() => {
    return reservas
      .map((r) => {
        const clase = claseMap.get(r.clase_id);
        const alumnoNombre = r.alumno_nombre || "Alumno";
        return {
          reserva: r,
          clase,
          alumnoNombre,
        };
      })
      .filter(({ clase }) => Boolean(clase));
  }, [reservas, claseMap]);

  // Contadores para filtros
  const countTodas = filas.length;
  const countConfirmadas = filas.filter((f) => f.reserva.estado === "ANOTADO").length;
  const countAusentes = filas.filter((f) => f.reserva.estado === "AUSENTE").length;
  const countCanceladas = filas.filter((f) => f.reserva.estado === "CANCELADO").length;
  const countEspera = filas.filter((f) => f.reserva.estado === "EN_ESPERA").length;

  const filasFiltradas = React.useMemo(() => {
    return filas.filter(({ reserva, alumnoNombre, clase }) => {
      // Filtro de estado
      if (filtroEstado === "CONFIRMADAS" && reserva.estado !== "ANOTADO") return false;
      if (filtroEstado === "AUSENTES" && reserva.estado !== "AUSENTE") return false;
      if (filtroEstado === "CANCELADAS" && reserva.estado !== "CANCELADO") return false;
      if (filtroEstado === "EN_ESPERA" && reserva.estado !== "EN_ESPERA") return false;

      // Filtro de búsqueda
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim();
        const coincideAlumno = alumnoNombre.toLowerCase().includes(q);
        const coincideClase = clase ? NOMBRE_ACTIVIDAD[clase.actividad]?.toLowerCase().includes(q) : false;
        if (!coincideAlumno && !coincideClase) return false;
      }

      return true;
    });
  }, [filas, filtroEstado, busqueda]);

  const getBadge = (estado: string) => {
    switch (estado) {
      case "ANOTADO":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 ring-1 ring-inset ring-emerald-200 dark:ring-emerald-800 px-2 py-0.5 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
            Confirmada
          </span>
        );
      case "AUSENTE":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 ring-1 ring-inset ring-rose-200 dark:ring-rose-800 px-2 py-0.5 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-400" />
            Ausente
          </span>
        );
      case "CANCELADO":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-inset ring-slate-300 dark:ring-slate-700 px-2 py-0.5 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            Cancelada
          </span>
        );
      case "EN_ESPERA":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 ring-1 ring-inset ring-amber-200 dark:ring-amber-800 px-2 py-0.5 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            En espera
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
            {estado}
          </span>
        );
    }
  };

  return (
    <section
      className={`border-t border-border bg-card ${className}`}
      aria-labelledby="tabla-reservas-titulo"
      data-testid="class-agenda-table-section"
    >
      {/* Controles de tabla */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-border">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="tabla-reservas-titulo" className="text-[15px] font-semibold text-foreground">
            Reservas de la semana
          </h2>

          <div
            role="tablist"
            aria-label="Filtro de reservas por estado"
            className="flex h-9 items-center rounded-lg bg-muted p-0.5 text-xs overflow-x-auto max-w-full [scrollbar-width:none]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={filtroEstado === "TODAS"}
              onClick={() => setFiltroEstado("TODAS")}
              className={`h-7 rounded-md px-2.5 font-medium transition-all ${
                filtroEstado === "TODAS"
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todas <span className="font-mono text-muted-foreground ml-0.5 tabular-nums">{countTodas}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filtroEstado === "CONFIRMADAS"}
              onClick={() => setFiltroEstado("CONFIRMADAS")}
              className={`h-7 rounded-md px-2.5 font-medium transition-all ${
                filtroEstado === "CONFIRMADAS"
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Confirmadas <span className="font-mono text-muted-foreground ml-0.5 tabular-nums">{countConfirmadas}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filtroEstado === "AUSENTES"}
              onClick={() => setFiltroEstado("AUSENTES")}
              className={`h-7 rounded-md px-2.5 font-medium transition-all ${
                filtroEstado === "AUSENTES"
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Ausentes <span className="font-mono text-muted-foreground ml-0.5 tabular-nums">{countAusentes}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filtroEstado === "CANCELADAS"}
              onClick={() => setFiltroEstado("CANCELADAS")}
              className={`h-7 rounded-md px-2.5 font-medium transition-all ${
                filtroEstado === "CANCELADAS"
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Canceladas <span className="font-mono text-muted-foreground ml-0.5 tabular-nums">{countCanceladas}</span>
            </button>
            {countEspera > 0 && (
              <button
                type="button"
                role="tab"
                aria-selected={filtroEstado === "EN_ESPERA"}
                onClick={() => setFiltroEstado("EN_ESPERA")}
                className={`h-7 rounded-md px-2.5 font-medium transition-all ${
                  filtroEstado === "EN_ESPERA"
                    ? "bg-card text-foreground shadow-xs ring-1 ring-border font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                En espera <span className="font-mono text-muted-foreground ml-0.5 tabular-nums">{countEspera}</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex h-9 w-full sm:w-60 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground">
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar alumno o clase…"
              className="bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground w-full text-xs"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda("")}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </label>
        </div>
      </div>

      {/* Vista Móvil: Lista de Tarjetas de Reservas (<1024px) */}
      <div className="block lg:hidden p-4 space-y-3" data-testid="mobile-reservations-cards">
        {filasFiltradas.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Sin reservas encontradas</p>
            <p className="text-xs text-muted-foreground mt-1">
              {busqueda
                ? `No hay coincidencias para "${busqueda}".`
                : "No hay reservas registradas con el filtro seleccionado."}
            </p>
            {onAbrirAnotar && (
              <button
                type="button"
                onClick={onAbrirAnotar}
                className="mt-3 min-h-[48px] inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted touch-manipulation"
              >
                Anotar alumno
              </button>
            )}
          </div>
        ) : (
          filasFiltradas.map(({ reserva, alumnoNombre, clase }) => {
            if (!clase) return null;
            const inicioDate = new Date(clase.inicio);
            const finDate = new Date(inicioDate.getTime() + (clase.duracion_minutos || 60) * 60 * 1000);
            const diaStr = inicioDate.toLocaleDateString("es-AR", {
              weekday: "short",
              day: "numeric",
              month: "short",
            });
            const horarioStr = `${inicioDate.toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })} – ${finDate.toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}`;
            const cupoStr = clase.capacidad === null ? "Libre" : `${clase.capacidad} max`;

            let nota = "";
            if (reserva.estado === "EN_ESPERA") {
              nota = "En lista de espera";
            } else if (reserva.estado === "AUSENTE") {
              nota = "Inasistencia registrada";
            } else if (clase.estado === "CANCELADA") {
              nota = clase.motivo_cancelacion || "Clase cancelada";
            }

            return (
              <div
                key={reserva.id}
                data-testid="reservation-mobile-card"
                className="rounded-xl border border-border bg-card p-3.5 space-y-2.5 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-foreground truncate">
                    {alumnoNombre}
                  </span>
                  {getBadge(reserva.estado)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Clase</span>
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          clase.actividad === "FUNCIONAL" ? "bg-sky-500" : "bg-orange-500"
                        }`}
                      />
                      {NOMBRE_ACTIVIDAD[clase.actividad] || clase.actividad}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Horario</span>
                    <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                      {diaStr} · {horarioStr}
                    </span>
                  </div>
                </div>

                {nota && (
                  <p className="text-[11px] text-muted-foreground italic bg-muted/30 rounded px-2 py-1">
                    {nota}
                  </p>
                )}

                {/* Acciones móviles con targets >= 48px */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-border/60">
                  {reserva.estado === "ANOTADO" && onMarcarAusente && (
                    <button
                      type="button"
                      onClick={() => onMarcarAusente(reserva.id)}
                      className="min-h-[48px] px-3 flex items-center justify-center rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 touch-manipulation"
                      data-testid="mobile-mark-absent-btn"
                    >
                      Marcar ausente
                    </button>
                  )}
                  {onQuitarReserva && (
                    <button
                      type="button"
                      onClick={() => onQuitarReserva(reserva.id)}
                      className="min-h-[48px] px-3 flex items-center justify-center rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted touch-manipulation"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Vista Desktop: Tabla con scroll horizontal suave (>=1024px) */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
            <tr>
              <th scope="col" className="px-5 py-2.5">Estado</th>
              <th scope="col" className="px-3 py-2.5">Alumno</th>
              <th scope="col" className="px-3 py-2.5">Clase</th>
              <th scope="col" className="px-3 py-2.5">Día</th>
              <th scope="col" className="px-3 py-2.5">Horario</th>
              <th scope="col" className="px-3 py-2.5 text-right">Cupo</th>
              <th scope="col" className="px-3 py-2.5">Notas</th>
              <th scope="col" className="px-3 py-2.5 text-right w-24">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Sin reservas encontradas</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {busqueda
                      ? `No hay coincidencias para "${busqueda}".`
                      : "No hay reservas registradas con el filtro seleccionado."}
                  </p>
                  {onAbrirAnotar && (
                    <button
                      type="button"
                      onClick={onAbrirAnotar}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      Anotar alumno
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              filasFiltradas.map(({ reserva, alumnoNombre, clase }) => {
                if (!clase) return null;
                const inicioDate = new Date(clase.inicio);
                const finDate = new Date(inicioDate.getTime() + (clase.duracion_minutos || 60) * 60 * 1000);
                const diaStr = inicioDate.toLocaleDateString("es-AR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                });
                const horarioStr = `${inicioDate.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })} – ${finDate.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}`;

                const cupoStr = clase.capacidad === null ? "—" : `${clase.capacidad} max`;

                let nota = "—";
                if (reserva.estado === "EN_ESPERA") {
                  nota = "En lista de espera";
                } else if (reserva.estado === "AUSENTE") {
                  nota = "Inasistencia registrada";
                } else if (clase.estado === "CANCELADA") {
                  nota = clase.motivo_cancelacion || "Clase cancelada";
                }

                return (
                  <tr
                    key={reserva.id}
                    className="h-12 transition-colors hover:bg-muted/40"
                  >
                    <td className="px-5">{getBadge(reserva.estado)}</td>
                    <td className="px-3 font-medium text-foreground whitespace-nowrap">
                      {alumnoNombre}
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            clase.actividad === "FUNCIONAL" ? "bg-sky-500" : "bg-orange-500"
                          }`}
                        />
                        {NOMBRE_ACTIVIDAD[clase.actividad] || clase.actividad}
                      </span>
                    </td>
                    <td className="px-3 text-muted-foreground whitespace-nowrap capitalize text-xs">
                      {diaStr}
                    </td>
                    <td className="px-3 font-mono text-[13px] text-foreground whitespace-nowrap tabular-nums">
                      {horarioStr}
                    </td>
                    <td className="px-3 text-right font-mono text-[13px] text-muted-foreground whitespace-nowrap tabular-nums">
                      {cupoStr}
                    </td>
                    <td className="px-3 text-xs text-muted-foreground truncate max-w-[200px]">
                      {nota}
                    </td>
                    <td className="px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {reserva.estado === "ANOTADO" && onMarcarAusente && (
                          <button
                            type="button"
                            onClick={() => onMarcarAusente(reserva.id)}
                            className="text-xs text-rose-600 dark:text-rose-400 hover:underline px-1.5 py-1"
                            data-testid="mark-absent-btn"
                            title="Marcar ausente"
                          >
                            Ausente
                          </button>
                        )}
                        {onQuitarReserva && (
                          <button
                            type="button"
                            onClick={() => onQuitarReserva(reserva.id)}
                            className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-1"
                            title="Quitar de la clase"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
