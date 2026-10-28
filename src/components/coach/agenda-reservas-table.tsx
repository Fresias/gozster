"use client";

import * as React from "react";
import type { Clase } from "@/types/database.types";
import type { ReservaAgenda, VistaAgenda } from "@/store/use-clases-store";
import { horaLocal } from "@/lib/clases";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface AgendaReservasTableProps {
  vista: VistaAgenda;
  reservas: ReservaAgenda[];
  clases: Clase[];
  todasReservas: ReservaAgenda[];
  filtroEstado?: "todas" | "confirmadas" | "ausentes" | "canceladas";
  onFiltroEstadoChange?: (filtro: "todas" | "confirmadas" | "ausentes" | "canceladas") => void;
  onMarcarAusente: (reservaId: string) => Promise<unknown> | void;
  onQuitarReserva: (reservaId: string) => Promise<unknown> | void;
  onVerAlumno: (alumnoId: string) => void;
  onAnotarAlumno: () => void;
  isOnline: boolean;
  isTestMode: boolean;
  ahoraMs: number;
}

export function AgendaReservasTable({
  vista,
  reservas,
  clases,
  todasReservas,
  filtroEstado: controlledFiltro,
  onFiltroEstadoChange,
  onMarcarAusente,
  onQuitarReserva,
  onVerAlumno,
  onAnotarAlumno,
  isOnline,
  isTestMode,
  ahoraMs,
}: AgendaReservasTableProps) {
  const [uncontrolledFiltro, setUncontrolledFiltro] = React.useState<
    "todas" | "confirmadas" | "ausentes" | "canceladas"
  >("todas");
  const filtroEstado = controlledFiltro ?? uncontrolledFiltro;

  const setFiltro = (f: "todas" | "confirmadas" | "ausentes" | "canceladas") => {
    if (onFiltroEstadoChange) onFiltroEstadoChange(f);
    else setUncontrolledFiltro(f);
  };

  const [buscador, setBuscador] = React.useState("");

  const clasesMap = React.useMemo(() => {
    return new Map<string, Clase>(clases.map((c) => [c.id, c]));
  }, [clases]);

  // Contadores por filtro para el badge numérico
  const counts = React.useMemo(() => {
    const total = reservas.length;
    const confirmadas = reservas.filter((r) => r.estado === "ANOTADO").length;
    const ausentes = reservas.filter((r) => r.estado === "AUSENTE").length;
    const canceladas = reservas.filter(
      (r) => r.estado === "CANCELADO" || r.estado === "ANULADO",
    ).length;
    return { total, confirmadas, ausentes, canceladas };
  }, [reservas]);

  // Filtrado
  const reservasFiltradas = React.useMemo(() => {
    return reservas.filter((r) => {
      // Filtro por estado
      if (filtroEstado === "confirmadas" && r.estado !== "ANOTADO") return false;
      if (filtroEstado === "ausentes" && r.estado !== "AUSENTE") return false;
      if (
        filtroEstado === "canceladas" &&
        r.estado !== "CANCELADO" &&
        r.estado !== "ANULADO"
      ) {
        return false;
      }

      // Filtro por buscador de alumno
      if (buscador.trim()) {
        const query = buscador.toLowerCase().trim();
        const coincide = r.alumno_nombre.toLowerCase().includes(query);
        if (!coincide) return false;
      }

      return true;
    });
  }, [reservas, filtroEstado, buscador]);

  const tituloTabla =
    vista === "dia"
      ? "Reservas del día"
      : vista === "mes"
        ? "Reservas del mes"
        : "Reservas de la semana";

  const emptyText =
    vista === "dia"
      ? "Sin reservas este día"
      : vista === "mes"
        ? "Sin reservas este mes"
        : "Sin reservas esta semana";

  return (
    <section
      className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 space-y-4 shadow-xs"
      data-testid="agenda-reservas-table"
      aria-label={tituloTabla}
    >
      {/* Barra de cabecera: Título, Filtros segmentados, Buscador y Botón de filtros */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h2 className="text-base font-bold tracking-tight text-foreground">{tituloTabla}</h2>
          <p className="text-xs text-muted-foreground">
            {reservasFiltradas.length}{" "}
            {reservasFiltradas.length === 1 ? "reserva listada" : "reservas listadas"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Filtros segmentados */}
          <div
            className="inline-flex h-9 items-center rounded-lg bg-muted p-1 gap-1"
            role="tablist"
            aria-label="Filtro de reservas"
          >
            <button
              type="button"
              role="tab"
              aria-selected={filtroEstado === "todas"}
              onClick={() => setFiltro("todas")}
              className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                filtroEstado === "todas"
                  ? "bg-card text-foreground font-semibold ring-1 ring-border shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Todas <span className="font-mono tabular-nums opacity-80">{counts.total}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filtroEstado === "confirmadas"}
              onClick={() => setFiltro("confirmadas")}
              className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                filtroEstado === "confirmadas"
                  ? "bg-card text-foreground font-semibold ring-1 ring-border shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Confirmadas{" "}
              <span className="font-mono tabular-nums opacity-80">{counts.confirmadas}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filtroEstado === "ausentes"}
              onClick={() => setFiltro("ausentes")}
              className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                filtroEstado === "ausentes"
                  ? "bg-card text-foreground font-semibold ring-1 ring-border shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Ausentes{" "}
              <span className="font-mono tabular-nums opacity-80">{counts.ausentes}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filtroEstado === "canceladas"}
              onClick={() => setFiltro("canceladas")}
              className={`rounded-md px-2.5 py-1 text-xs transition-all ${
                filtroEstado === "canceladas"
                  ? "bg-card text-foreground font-semibold ring-1 ring-border shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Canceladas{" "}
              <span className="font-mono tabular-nums opacity-80">{counts.canceladas}</span>
            </button>
          </div>

          {/* Buscador por alumno w-60 h-9 */}
          <div className="relative w-60">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              value={buscador}
              onChange={(e) => setBuscador(e.target.value)}
              placeholder="Buscar alumno…"
              className="w-60 h-9 rounded-lg border border-border/80 bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
              aria-label="Buscar alumno en reservas"
            />
          </div>

          {/* Botón de filtros */}
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/80 bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
          >
            <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span>Filtros</span>
          </button>
        </div>
      </div>

      {/* Tabla de Reservas */}
      {reservasFiltradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 text-center space-y-3 rounded-xl border border-dashed border-border/80">
          <p className="text-sm font-medium text-muted-foreground">{emptyText}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAnotarAlumno}
            className="text-xs font-semibold"
          >
            + Anotar alumno
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Estado</TableHead>
              <TableHead>Alumno</TableHead>
              <TableHead>Clase</TableHead>
              <TableHead>Día</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead className="text-right">Cupo</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="w-[48px] text-right" aria-label="Acciones">
                ⋯
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reservasFiltradas.map((r) => {
              const clase = clasesMap.get(r.clase_id);
              const inicioDate = clase ? new Date(clase.inicio) : null;
              const claseIniciada = inicioDate ? ahoraMs >= inicioDate.getTime() : false;

              // Ocupación de la clase
              const ocupados = todasReservas.filter(
                (x) =>
                  x.clase_id === r.clase_id &&
                  (x.estado === "ANOTADO" || x.estado === "AUSENTE"),
              ).length;

              // Formato de día (Lun 26 oct)
              const diaTexto = inicioDate
                ? inicioDate.toLocaleDateString("es-AR", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })
                : "—";

              const horarioTexto = inicioDate ? horaLocal(clase!.inicio) : "—";
              const cupoTexto = clase
                ? clase.capacidad !== null
                  ? `${ocupados}/${clase.capacidad}`
                  : `${ocupados} anot.`
                : "—";

              const notas = (r as { notas?: string }).notas || "—";

              return (
                <TableRow key={r.id} className="h-12 hover:bg-muted/50 transition-colors">
                  {/* Columna Estado */}
                  <TableCell>
                    {r.estado === "ANOTADO" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Confirmada
                      </span>
                    ) : r.estado === "AUSENTE" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Ausente
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        Cancelada
                      </span>
                    )}
                  </TableCell>

                  {/* Columna Alumno */}
                  <TableCell className="font-medium text-foreground">
                    {r.alumno_nombre}
                  </TableCell>

                  {/* Columna Clase (dot + nombre) */}
                  <TableCell>
                    <span className="inline-flex items-center gap-2 font-medium">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          clase?.actividad === "BOXEO" ? "bg-orange-500" : "bg-sky-500"
                        }`}
                      />
                      {clase?.actividad === "BOXEO" ? "Boxeo" : "Funcional"}
                    </span>
                  </TableCell>

                  {/* Columna Día */}
                  <TableCell className="text-muted-foreground capitalize">
                    {diaTexto}
                  </TableCell>

                  {/* Columna Horario */}
                  <TableCell className="font-mono tabular-nums text-xs">
                    {horarioTexto}
                  </TableCell>

                  {/* Columna Cupo */}
                  <TableCell className="font-mono tabular-nums text-xs text-right">
                    {cupoTexto}
                  </TableCell>

                  {/* Columna Notas */}
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[140px]">
                    {notas}
                  </TableCell>

                  {/* Columna Menú ⋯ */}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors font-bold text-base"
                        aria-label={`Acciones para reserva de ${r.alumno_nombre}`}
                      >
                        ⋯
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={
                            r.estado !== "ANOTADO" ||
                            (!isOnline && !isTestMode) ||
                            !claseIniciada
                          }
                          title={
                            !claseIniciada
                              ? "Disponible solo después del inicio de la clase"
                              : undefined
                          }
                          onClick={() => void onMarcarAusente(r.id)}
                          className="text-rose-600 dark:text-rose-400"
                        >
                          Marcar ausente
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void onQuitarReserva(r.id)}>
                          Quitar de la clase
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onVerAlumno(r.alumno_id)}>
                          Ver alumno
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
