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
      title="Sesiones"
      icon={<Timer className="h-4 w-4 text-primary" aria-label="Sesiones" />}
      badge={
        <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary">
          {sortedSessions.length} {sortedSessions.length === 1 ? "sesión" : "sesiones"}
          {frecuenciaSemanal ? ` · ${frecuenciaSemanal} por sem.` : ""}
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
            className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
          >
            Expandir sesiones
          </button>
        </div>
      }
    >
      <div className="relative p-3 sm:p-4">
        {/* Conector horizontal estilo timeline */}
        <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-border/80 z-0 pointer-events-none" />

        {/* Franja horizontal con scroll suave */}
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

              const prInfo = prSessionMap.get(entry.sesion.id || `ses-${index}`);
              const esPR = !!prInfo?.esPR;
              const ejercicioPR = prInfo?.ejercicio || seriePico?.ejercicioNombre || "";
              const volumenTotalKg = entry.sesion.volumen_total_kg;
              const duracion = entry.sesion.duracion_minutos ? `${entry.sesion.duracion_minutos}m` : "45m";

              // Nombre limpio sin prefijos redundantes
              const nombreLimpio = (seriePico?.ejercicioNombre || "")
                .replace("Press de ", "")
                .replace("Trasera", "")
                .trim();

              return (
                <div
                  key={entry.sesion.id || `ribbon-node-${index}`}
                  data-testid="ribbon-node"
                  className="flex h-24 min-w-[155px] shrink-0 flex-col justify-between rounded-lg border border-border bg-card p-2.5 shadow-xs hover:border-primary/50 transition-all text-xs"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-foreground text-[11px] capitalize">
                      {fechaCorta}
                    </span>
                    {esPR && (
                      <Badge
                        variant="default"
                        data-testid="ribbon-node-pr"
                        aria-label={`Nuevo PR: ${ejercicioPR}`}
                        title={`Nuevo PR: ${ejercicioPR} (${prInfo?.peso || seriePico?.peso_kg} kg)`}
                        className="bg-amber-500/20 text-amber-500 border border-amber-500/30 text-[9px] px-1.5 py-0 h-4 font-black"
                      >
                        Nuevo PR
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    <p
                      className="font-semibold text-foreground text-[11px] truncate"
                      title={seriePico ? `${seriePico.ejercicioNombre}: ${seriePico.peso_kg} kg × ${seriePico.reps_hechas}` : `${entry.series.length} series`}
                    >
                      {seriePico ? nombreLimpio : `${entry.series.length} series`}
                    </p>
                    {seriePico && (
                      <p className="font-mono text-[11px] font-bold text-foreground tabular-nums">
                        {seriePico.peso_kg}kg × {seriePico.reps_hechas}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground font-mono">
                      {entry.series.length} series • {duracion}
                      {volumenTotalKg ? ` • ${(volumenTotalKg / 1000).toFixed(1)}t` : ""}
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

