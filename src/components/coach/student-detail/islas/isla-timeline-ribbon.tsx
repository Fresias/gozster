import * as React from "react";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";

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
  onHide?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
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
  onHide,
  canMoveUp,
  canMoveDown,
}: IslaTimelineRibbonProps) {
  // Orden cronológico de las sesiones
  const sortedSessions = React.useMemo(() => {
    return [...historialCargas].sort(
      (a, b) => new Date(a.sesion.fecha).getTime() - new Date(b.sesion.fecha).getTime()
    );
  }, [historialCargas]);

  // Encontrar el récord personal de carga (peso máximo absoluto levantado en cualquier serie)
  const maxPesoLevantado = React.useMemo(() => {
    let best = 0;
    sortedSessions.forEach((s) => {
      s.series.forEach((ser) => {
        if (ser.peso_kg > best) best = ser.peso_kg;
      });
    });
    return best;
  }, [sortedSessions]);

  const ultimaSesion = sortedSessions[sortedSessions.length - 1];
  const ultimaSeriePico = ultimaSesion?.series?.length
    ? [...ultimaSesion.series].sort((a, b) => b.peso_kg - a.peso_kg)[0]
    : null;

  return (
    <IslaCardShell
      id="timeline"
      dataTestId="isla-timeline-ribbon"
      title="Timeline Biomecánico Ribbon"
      icon={<span>⏱️</span>}
      badge={
        <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary">
          {sortedSessions.length} {sortedSessions.length === 1 ? "sesión" : "sesiones"}
        </Badge>
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
      onHide={onHide}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
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
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            [^ Expandir Ribbon]
          </button>
        </div>
      }
    >
      <div className="relative p-3 sm:p-4">
        {/* Conector horizontal estilo timeline */}
        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-border/80 z-0 pointer-events-none" />

        {/* Franja horizontal con scroll suave de 80px */}
        <div className="relative z-10 flex items-center gap-3 overflow-x-auto pb-1 pt-1 scrollbar-thin">
          {sortedSessions.length === 0 ? (
            <div className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-border/70 text-xs text-muted-foreground bg-secondary/20">
              No se registran sesiones de entrenamiento para el timeline.
            </div>
          ) : (
            sortedSessions.map((entry, index) => {
              const fecha = new Date(entry.sesion.fecha);
              const fechaCorta = fecha.toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "short",
              });
              const seriePico = entry.series?.length
                ? [...entry.series].sort((a, b) => b.peso_kg - a.peso_kg)[0]
                : null;
              const esPR =
                seriePico && maxPesoLevantado > 0 && seriePico.peso_kg >= maxPesoLevantado;

              return (
                <div
                  key={entry.sesion.id || `ribbon-node-${index}`}
                  data-testid="ribbon-node"
                  className="flex h-20 min-w-[145px] shrink-0 flex-col justify-between rounded-lg border border-border bg-card p-2 shadow-xs hover:border-primary/50 transition-all text-xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-foreground text-[11px] capitalize">
                      {fechaCorta}
                    </span>
                    {esPR && (
                      <Badge
                        variant="default"
                        data-testid="ribbon-node-pr"
                        className="bg-amber-500/20 text-amber-500 border border-amber-500/30 text-[9px] px-1 py-0 h-4 font-black"
                      >
                        PR
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <p className="font-mono text-[11px] font-bold text-foreground tabular-nums truncate" title={seriePico ? `${seriePico.ejercicioNombre}: ${seriePico.peso_kg} kg × ${seriePico.reps_hechas}` : `${entry.series.length} series`}>
                      {seriePico
                        ? `${seriePico.ejercicioNombre.replace("Press de ", "").replace("Trasera", "").trim()}: ${seriePico.peso_kg}kg × ${seriePico.reps_hechas}`
                        : `${entry.series.length} series`}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {entry.series.length} series • {entry.sesion.duracion_minutos ? `${entry.sesion.duracion_minutos}m` : "45m"}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </IslaCardShell>
  );
}
