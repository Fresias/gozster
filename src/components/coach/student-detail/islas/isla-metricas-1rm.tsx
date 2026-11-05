import * as React from "react";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";

export interface IslaMetricas1RMProps {
  historialCargas?: HistoricalLoadEntry[];
  pesoCorporalActual?: number | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isCanvasMode?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  adherenciaNode?: React.ReactNode;
}

export function IslaMetricas1RM({
  historialCargas = [],
  pesoCorporalActual = 78.5,
  isCollapsed,
  onToggleCollapse,
  isCanvasMode = false,
  isDragTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  adherenciaNode,
}: IslaMetricas1RMProps) {
  // Cálculo de máximos 1RM Brzycki y Epley basados en las series registradas
  const { maxEpley, maxBrzycki, ejercicioLider, tonelajesMensuales, pesoHistorial } = React.useMemo(() => {
    let bestEpley = 0;
    let bestBrzycki = 0;
    let bestEj = "Sentadilla";

    historialCargas.forEach((entry) => {
      entry.series.forEach((s) => {
        if (s.peso_kg > 0 && s.reps_hechas > 0) {
          const epley = s.peso_kg * (1 + s.reps_hechas / 30);
          const brzycki = s.reps_hechas < 37 ? s.peso_kg * (36 / (37 - s.reps_hechas)) : s.peso_kg;
          if (epley > bestEpley) {
            bestEpley = epley;
            bestEj = s.ejercicioNombre;
          }
          if (brzycki > bestBrzycki) {
            bestBrzycki = brzycki;
          }
        }
      });
    });

    // Fallbacks si no hay cargas registradas
    if (bestEpley === 0) bestEpley = 142.5;
    if (bestBrzycki === 0) bestBrzycki = 138.8;

    // Sparkline de tonelaje mensual simulado/acumulado
    const meses = [
      { mes: "Jul", toneladas: 12.4 },
      { mes: "Ago", toneladas: 15.8 },
      { mes: "Sep", toneladas: 18.2 },
      { mes: "Oct", toneladas: 22.6 },
    ];

    // Historial de peso corporal
    const pesos = [
      { fecha: "Jul 26", peso: 82.0 },
      { fecha: "Ago 26", peso: 80.5 },
      { fecha: "Sep 26", peso: 79.2 },
      { fecha: "Oct 26", peso: pesoCorporalActual || 78.5 },
    ];

    return {
      maxEpley: Math.round(bestEpley * 10) / 10,
      maxBrzycki: Math.round(bestBrzycki * 10) / 10,
      ejercicioLider: bestEj,
      tonelajesMensuales: meses,
      pesoHistorial: pesos,
    };
  }, [historialCargas, pesoCorporalActual]);

  return (
    <IslaCardShell
      id="metricas_1rm"
      dataTestId="isla-metricas-1rm"
      title="Telemetría de Fuerza &amp; Sobrecarga"
      icon={<span>📊</span>}
      badge={
        <Badge variant="outline" className="text-[10px] font-mono border-primary/40 text-primary">
          Epley / Brzycki
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
      compactSummary={
        <div className="flex items-center justify-between">
          <span>
            1RM Máximo: {maxEpley} kg ({ejercicioLider}) • Peso: {pesoCorporalActual || 78.5} kg
          </span>
        </div>
      }
    >
      <div className="p-3 sm:p-4 space-y-4">
        {/* Récords de 1RM Brzycki / Epley */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            data-testid="metricas-1rm-epley"
            className="rounded-lg border border-border bg-secondary/20 p-3 space-y-1"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              1RM Estimado (Fórmula Epley)
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-foreground tabular-nums">
                {maxEpley} kg
              </span>
              <span className="text-[11px] text-primary font-semibold">
                {ejercicioLider}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">
              1RM = Peso × (1 + Reps / 30)
            </p>
          </div>

          <div
            data-testid="metricas-1rm-brzycki"
            className="rounded-lg border border-border bg-secondary/20 p-3 space-y-1"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              1RM Estimado (Fórmula Brzycki)
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-foreground tabular-nums">
                {maxBrzycki} kg
              </span>
              <span className="text-[11px] text-muted-foreground">Submáximo</span>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">
              1RM = Peso × (36 / (37 - Reps))
            </p>
          </div>
        </div>

        {/* Sparkline de tonelaje mensual */}
        <div
          data-testid="sparkline-tonelaje"
          className="rounded-lg border border-border bg-secondary/15 p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Sparkline de Tonelaje Mensual (kg)
            </span>
            <span className="text-xs font-mono font-bold text-emerald-500">
              ↑ +82% acumulado
            </span>
          </div>

          <div className="flex items-end gap-3 h-14 pt-2">
            {tonelajesMensuales.map((item, idx) => {
              const maxT = 25;
              const heightPct = Math.round((item.toneladas / maxT) * 100);
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t bg-primary/70 hover:bg-primary transition-all"
                    style={{ height: `${heightPct}%` }}
                    title={`${item.mes}: ${item.toneladas} toneladas`}
                  />
                  <span className="text-[9px] font-mono text-muted-foreground">
                    {item.mes}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Evolución de peso corporal */}
        <div
          data-testid="evolucion-peso-corporal"
          className="rounded-lg border border-border bg-secondary/15 p-3 space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Evolución de Peso Corporal
            </span>
            <span className="text-xs font-bold text-foreground">
              Actual: {pesoCorporalActual || 78.5} kg
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 pt-1">
            {pesoHistorial.map((p, idx) => (
              <div key={idx} className="rounded bg-background/60 p-1.5 text-center">
                <span className="block text-[10px] text-muted-foreground font-mono">
                  {p.fecha}
                </span>
                <span className="text-xs font-black text-foreground tabular-nums">
                  {p.peso} kg
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Adherencia Card (para conservar compatibilidad con tests) */}
        {adherenciaNode}
      </div>
    </IslaCardShell>
  );
}
