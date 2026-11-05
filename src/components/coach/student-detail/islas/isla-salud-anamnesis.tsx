import * as React from "react";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface IslaSaludAnamnesisProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isCanvasMode?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  cuestionarioNode?: React.ReactNode;
  painAlertsNode?: React.ReactNode;
  evaDolorActual?: number;
  zonaDolorActual?: string;
  onQuickSwap?: () => void;
}

export function IslaSaludAnamnesis({
  isCollapsed,
  onToggleCollapse,
  isCanvasMode = false,
  isDragTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  cuestionarioNode,
  painAlertsNode,
  evaDolorActual = 3,
  zonaDolorActual = "Hombro derecho",
  onQuickSwap,
}: IslaSaludAnamnesisProps) {
  const [anamnesisCollapsed, setAnamnesisCollapsed] = React.useState(false);

  // Determinar color y severidad de escala EVA
  const getEvaColor = (eva: number) => {
    if (eva <= 3) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/40";
    if (eva <= 6) return "bg-amber-500/20 text-amber-400 border-amber-500/40";
    return "bg-rose-500/20 text-rose-400 border-rose-500/40";
  };

  return (
    <IslaCardShell
      id="salud_anamnesis"
      dataTestId="isla-salud-anamnesis"
      title="Clínica, Anamnesis &amp; Red Flags"
      icon={<span>🩺</span>}
      badge={
        evaDolorActual > 0 ? (
          <Badge
            variant="outline"
            data-testid="red-flags-alert"
            className={`text-[10px] font-bold border ${getEvaColor(evaDolorActual)}`}
          >
            EVA {evaDolorActual}/10 • {zonaDolorActual}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Sin red flags
          </Badge>
        )
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
            Clínica: {zonaDolorActual} (EVA {evaDolorActual}/10) • Anamnesis revisada
          </span>
        </div>
      }
    >
      <div className="p-3 sm:p-4 space-y-4">
        {/* Monitor Escala EVA (1-10) y Acceso a Sustitución Quirúrgica */}
        <div
          data-testid="eva-scale-display"
          className="rounded-lg border border-border bg-secondary/15 p-3.5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Escala Visual Analógica de Dolor (EVA 1-10)
              </p>
              <p className="text-xs font-semibold text-foreground mt-0.5">
                Zona activa: <span className="text-amber-400">{zonaDolorActual}</span>
              </p>
            </div>
            {onQuickSwap && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onQuickSwap}
                className="h-7 text-xs font-semibold text-rose-400 border-rose-500/40 hover:bg-rose-500/10"
              >
                ⚡ Sustitución Quirúrgica
              </Button>
            )}
          </div>

          {/* Barra visual graduada de 1 a 10 */}
          <div className="space-y-1">
            <div className="grid grid-cols-10 gap-1 h-3 rounded overflow-hidden">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                const isActive = num <= evaDolorActual;
                const bgClass =
                  num <= 3
                    ? isActive ? "bg-emerald-500" : "bg-emerald-950/40"
                    : num <= 6
                    ? isActive ? "bg-amber-500" : "bg-amber-950/40"
                    : isActive ? "bg-rose-500" : "bg-rose-950/40";
                return (
                  <div
                    key={num}
                    className={`h-full rounded-xs transition-all ${bgClass}`}
                    title={`Nivel EVA ${num}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] font-mono text-muted-foreground px-0.5">
              <span>1 (Leve)</span>
              <span>5 (Moderado)</span>
              <span>10 (Agudo/Freno)</span>
            </div>
          </div>
        </div>

        {/* Alertas de dolor de alumnos (StudentPainAlerts con Quick Swap) */}
        {painAlertsNode}

        {/* Resumen colapsable de Anamnesis inicial */}
        <div
          data-testid="anamnesis-summary-collapsible"
          className="rounded-lg border border-border bg-secondary/10 overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setAnamnesisCollapsed((prev) => !prev)}
            className="flex w-full items-center justify-between p-3 text-left hover:bg-secondary/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground">
                📋 Resumen de Anamnesis Inicial
              </span>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {anamnesisCollapsed ? "[+]" : "[-]"}
            </span>
          </button>

          {!anamnesisCollapsed && (
            <div className="p-3 pt-0 border-t border-border/40">
              {cuestionarioNode}
            </div>
          )}
        </div>
      </div>
    </IslaCardShell>
  );
}
