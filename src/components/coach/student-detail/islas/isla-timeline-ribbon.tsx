import * as React from "react";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";
import { Timer } from "@/components/coach/icons";

export interface IslaTimelineRibbonProps {
  historialCargas?: HistoricalLoadEntry[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isCanvasMode?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onSeparateRow?: () => void;
  onResizeWidth?: (delta: number) => void;
  currentWidth?: number;
  isSharedRow?: boolean;
  onHide?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
}

export function IslaTimelineRibbon({
  historialCargas = [],
  isCollapsed,
  onToggleCollapse,
  isCanvasMode = false,
  isDragTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onMoveUp,
  onMoveDown,
  onMoveLeft,
  onMoveRight,
  onSeparateRow,
  onResizeWidth,
  currentWidth,
  isSharedRow,
  onHide,
  canMoveUp,
  canMoveDown,
  canMoveLeft,
  canMoveRight,
}: IslaTimelineRibbonProps) {
  // Orden cronológico de las sesiones
  const sortedSessions = React.useMemo(() => {
    return [...historialCargas].sort(
      (a, b) => new Date(a.sesion.fecha).getTime() - new Date(b.sesion.fecha).getTime()
    );
  }, [historialCargas]);

  // Frecuencia semanal estimada
  const frecuenciaSemanal = React.useMemo(() => {
    if (sortedSessions.length < 2) return null;
    const first = sortedSessions[0];
    const last = sortedSessions[sortedSessions.length - 1];
    if (!first || !last) return null;
    const primera = new Date(first.sesion.fecha).getTime();
    const ultima = new Date(last.sesion.fecha).getTime();
    const semanas = Math.max(1, (ultima - primera) / (1000 * 60 * 60 * 24 * 7));
    return (sortedSessions.length / semanas).toFixed(1).replace(".", ",");
  }, [sortedSessions]);

  // Detección biomecánica de récord personal (PR) por ejercicio en orden cronológico
  const prSessionMap = React.useMemo(() => {
    const historicalBest = new Map<string, number>();
    const map = new Map<string, { esPR: boolean; ejercicio: string; peso: number }>();

    let globalMaxAll = 0;
    sortedSessions.forEach((s) => {
      s.series?.forEach((ser) => {
        if (ser.peso_kg > globalMaxAll) globalMaxAll = ser.peso_kg;
      });
    });

    sortedSessions.forEach((s, idx) => {
      let isPr = false;
      let prExName = "";
      let prWeight = 0;

      const seriePico = s.series?.length
        ? [...s.series].sort((a, b) => b.peso_kg - a.peso_kg)[0]
        : null;

      s.series?.forEach((ser) => {
        const prev = historicalBest.get(ser.ejercicioNombre) ?? 0;
        if (prev > 0 && ser.peso_kg > prev) {
          isPr = true;
          prExName = ser.ejercicioNombre;
          prWeight = ser.peso_kg;
        }
        if (ser.peso_kg > prev) {
          historicalBest.set(ser.ejercicioNombre, ser.peso_kg);
        }
      });

      // Compatibilidad con registros estáticos y picos globales
      if (!isPr && seriePico) {
        if (globalMaxAll > 0 && seriePico.peso_kg >= globalMaxAll && (sortedSessions.length > 1 || idx > 0)) {
          isPr = true;
          prExName = seriePico.ejercicioNombre;
          prWeight = seriePico.peso_kg;
        }
      }

      map.set(s.sesion.id || `ses-${idx}`, {
        esPR: isPr,
        ejercicio: prExName || seriePico?.ejercicioNombre || "",
        peso: prWeight || seriePico?.peso_kg || 0,
      });
    });

    return map;
  }, [sortedSessions]);

  const ultimaSesion = sortedSessions[sortedSessions.length - 1];
  const ultimaSeriePico = ultimaSesion?.series?.length
    ? [...ultimaSesion.series].sort((a, b) => b.peso_kg - a.peso_kg)[0]
    : null;

  return (
    <IslaCardShell
      id="timeline"
      dataTestId="isla-timeline-ribbon"
      title="Últimas sesiones"
      icon={<Timer className="h-4 w-4 text-primary" aria-label="Sesiones" />}
      meta={
        <>
          {sortedSessions.length} en total
          {frecuenciaSemanal ? ` · ${frecuenciaSemanal} por semana` : ""}
        </>
      }
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      isCanvasMode={isCanvasMode}
      isDragTarget={isDragTarget}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onMoveLeft={onMoveLeft}
      onMoveRight={onMoveRight}
      onSeparateRow={onSeparateRow}
      onResizeWidth={onResizeWidth}
      currentWidth={currentWidth}
      isSharedRow={isSharedRow}
      onHide={onHide}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      canMoveLeft={canMoveLeft}
      canMoveRight={canMoveRight}
      compactSummary={
        <div className="flex items-center justify-between py-0.5">
          <span>
            {sortedSessions.length > 0 && ultimaSesion
              ? `Última sesión: ${new Date(ultimaSesion.sesion.fecha).toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "short",
                })}${
                  ultimaSeriePico
                    ? ` • ${ultimaSeriePico.ejercicioNombre} ${ultimaSeriePico.peso_kg} kg × ${ultimaSeriePico.reps_hechas} (${ultimaSesion.series.length} series)`
                    : ` • ${ultimaSesion.series.length} series registradas`
                }`
              : "Sin sesiones previas registradas"}
          </span>
          <button
            type="button"
            onClick={onToggleCollapse}
            data-testid="ribbon-collapse-btn"
            className="text-xs font-semibold text-primary hover:underline cursor-pointer"
          >
            Expandir sesiones
          </button>
        </div>
      }
    >
      <div className="p-4">
        {/* Franja horizontal, la sesión más reciente primero (objetivo Ficha.html) */}
        <div className="flex items-stretch gap-3 overflow-x-auto pb-1 scrollbar-thin">
          {sortedSessions.length === 0 ? (
            <div className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              Todavía no registró sesiones.
            </div>
          ) : (
            sortedSessions
              .map((entry, index) => ({ entry, index }))
              .reverse()
              .map(({ entry, index }) => {
                const fecha = new Date(entry.sesion.fecha);
                const fechaCorta = `${String(fecha.getDate()).padStart(2, "0")} ${fecha
                  .toLocaleDateString("es-AR", { month: "short" })
                  .replace(".", "")}`;
                const seriePico = entry.series?.length
                  ? [...entry.series].sort((a, b) => b.peso_kg - a.peso_kg)[0]
                  : null;

                const prInfo = prSessionMap.get(entry.sesion.id || `ses-${index}`);
                const esPR = !!prInfo?.esPR;
                const ejercicioPR = prInfo?.ejercicio || seriePico?.ejercicioNombre || "";
                const duracion = entry.sesion.duracion_minutos ? `${entry.sesion.duracion_minutos} min` : null;

                return (
                  <div
                    key={entry.sesion.id || `ribbon-node-${index}`}
                    data-testid="ribbon-node"
                    title={`${entry.series.length} series${duracion ? ` · ${duracion}` : ""}`}
                    className="flex min-w-[168px] shrink-0 flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground">{fechaCorta}</span>
                      {esPR && (
                        <span
                          data-testid="ribbon-node-pr"
                          aria-label={`Nuevo PR: ${ejercicioPR}`}
                          title={`Nuevo PR: ${ejercicioPR} (${prInfo?.peso || seriePico?.peso_kg} kg)`}
                          className="font-semibold text-success-soft-foreground"
                        >
                          PR
                        </span>
                      )}
                    </div>
                    <p className="m-0 truncate text-sm font-medium text-foreground">
                      {seriePico ? seriePico.ejercicioNombre : `${entry.series.length} series`}
                    </p>
                    {seriePico && (
                      <p className="m-0 font-mono text-xs text-muted-foreground tabular-nums">
                        {`${String(seriePico.peso_kg).replace(".", ",")} kg × ${seriePico.reps_hechas}`}
                      </p>
                    )}
                  </div>
                );
              })
          )}
        </div>
      </div>
    </IslaCardShell>
  );
}

