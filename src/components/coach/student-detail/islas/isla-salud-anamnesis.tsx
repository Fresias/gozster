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
  alumnoId?: string;
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
  alumnoId = "demo-alumno-lucas",
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
}: IslaSaludAnamnesisProps) {
  const [anamnesisCollapsed, setAnamnesisCollapsed] = React.useState(true);
  const [isPainResolved, setIsPainResolved] = React.useState(false);
  const [coachLog, setCoachLog] = React.useState(
    "28 Oct: Ante molestia en hombro anterior en Press de Banca, se pautó agarre neutro y se sustituyó temporalmente por Landmine Press a 45° (3x10 con 25kg) y Facepulls (3x15). Se reforzó retracción escapular previa al descenso. Molestia remitida sin dolor en el último microciclo. Mantener agarre neutro."
  );
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const savedStatus = localStorage.getItem(`gozster_coach_pain_status_${alumnoId}`);
        if (savedStatus !== null) {
          setIsPainResolved(savedStatus === "true");
        }
        const savedLog = localStorage.getItem(`gozster_coach_clinica_log_${alumnoId}`);
        if (savedLog !== null) {
          setCoachLog(savedLog);
        }
      } catch {}
    }
  }, [alumnoId]);

  const handleTogglePainStatus = () => {
    setIsPainResolved((prev) => {
      const next = !prev;
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          localStorage.setItem(`gozster_coach_pain_status_${alumnoId}`, String(next));
        } catch {}
      }
      return next;
    });
  };

  const handleSaveCoachLog = () => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        localStorage.setItem(`gozster_coach_clinica_log_${alumnoId}`, coachLog);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } catch {}
    }
  };

  return (
    <IslaCardShell
      id="salud_anamnesis"
      dataTestId="isla-salud-anamnesis"
      title="Clínica, Anamnesis &amp; Red Flags"
      icon={<span>🩺</span>}
      badge={
        zonaDolorActual && zonaDolorActual !== "Ninguna" ? (
          <Badge
            variant="outline"
            data-testid="red-flags-alert"
            className={`text-[10px] font-bold border ${
              isPainResolved
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : "bg-amber-500/20 text-amber-400 border-amber-500/40"
            }`}
          >
            {isPainResolved ? "✓ Atendido" : `⚠️ Molestia: ${zonaDolorActual}`}
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
        <div className="flex items-center justify-between">
          <span>
            Clínica: {zonaDolorActual} • {isPainResolved ? "Atendido" : "Pendiente"} • Anamnesis revisada
          </span>
        </div>
      }
    >
      <div className="p-3 sm:p-4 space-y-4">
        {/* Acceso Rápido Visual a Cuestionario Inicial & Ficha Clínica */}
        <div className="rounded-lg border border-border/80 bg-secondary/20 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  Ficha de Anamnesis &amp; Cuestionario Inicial
                </h4>
                <p className="text-[10px] text-muted-foreground">
                  Respuestas de ingreso y condiciones de salud reportadas
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAnamnesisCollapsed((prev) => !prev)}
              className="h-7 text-xs font-semibold gap-1"
            >
              <span>{anamnesisCollapsed ? "👁️ Ver Cuestionario Completo [+]" : "[-] Ocultar Cuestionario"}</span>
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">Objetivo</span>
              <span className="font-semibold text-foreground truncate block">Hipertrofia &amp; Fuerza</span>
            </div>
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">Frecuencia</span>
              <span className="font-semibold text-foreground truncate block">4 días / semana</span>
            </div>
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">Molestia Previa</span>
              <span className="font-semibold text-amber-500 truncate block">Hombro anterior</span>
            </div>
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">Cirugías</span>
              <span className="font-semibold text-emerald-500 truncate block">Ninguna</span>
            </div>
          </div>
        </div>

        {/* Notificación de Dolor en Ejercicio con Toggle de Estado Atendido / Resuelto */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">{isPainResolved ? "🟢" : "⚠️"}</span>
              <div>
                <span className="text-xs font-bold text-foreground block">
                  Reporte de Molestia en Ejercicio
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Press de Banca Plano (Serie 2) • Hombro anterior
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                  isPainResolved
                    ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-500 border-amber-500/30 animate-pulse"
                }`}
              >
                {isPainResolved ? "✓ ATENDIDO / RESUELTO" : "⚠️ PENDIENTE DE ATENCIÓN"}
              </span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTogglePainStatus}
                className="h-7 text-xs font-semibold cursor-pointer"
              >
                {isPainResolved ? "Marcar como Pendiente" : "✓ Marcar como Atendido"}
              </Button>

              {onQuickSwap && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onQuickSwap}
                  className="h-7 text-xs font-semibold text-rose-400 border-rose-500/40 hover:bg-rose-500/10 cursor-pointer"
                >
                  ⚡ Sustitución Quirúrgica
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Bitácora de Intervención del Entrenador */}
        <div className="rounded-lg border border-border/80 bg-secondary/15 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">📝</span>
              <span className="text-xs font-bold text-foreground">
                Bitácora de Intervención del Entrenador
              </span>
            </div>
            {saveSuccess && (
              <span className="text-[11px] font-bold text-emerald-500 animate-in fade-in">
                ✓ Registro guardado en la ficha
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Anotá qué acción tomaste (sustitución, ajuste de agarre, deload o pausa) para recordar qué se hizo ante la molestia:
          </p>
          <textarea
            value={coachLog}
            onChange={(e) => setCoachLog(e.target.value)}
            rows={3}
            placeholder="Ej.: Se sustituyó Press Banca por Landmine Press a 45°..."
            className="w-full rounded-md border border-border bg-card px-2.5 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSaveCoachLog}
              className="h-7 text-xs font-bold"
            >
              💾 Guardar Registro en la Ficha
            </Button>
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
                📋 Cuestionario Inicial Completo del Alumno
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
