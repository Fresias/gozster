import * as React from "react";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Check,
  TriangleAlert,
  ClipboardList,
  ArrowRightLeft,
  FileText,
  Save,
  ChevronDown,
  ChevronUp,
} from "@/components/coach/icons";

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
      icon={<Activity className="h-4 w-4 text-primary" aria-label="Salud" />}
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
            {isPainResolved ? (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 inline" aria-hidden="true" /> Atendido
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <TriangleAlert className="h-3 w-3 inline" aria-hidden="true" /> Molestia: {zonaDolorActual}
              </span>
            )}
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
              <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
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
              <span>{anamnesisCollapsed ? "Ver cuestionario completo" : "Ocultar cuestionario"}</span>
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

        {/* Notificación de Dolor en Ejercicio con Segmented Control Zen (Pendiente / Atendido) */}
        <div className="rounded-lg border border-border/80 bg-card p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {isPainResolved ? (
                <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              ) : (
                <TriangleAlert className="h-4 w-4 text-amber-500" aria-hidden="true" />
              )}
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
              {/* Segmented Control Zen */}
              <div className="inline-flex rounded-md border border-border/70 bg-muted/30 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    if (isPainResolved) handleTogglePainStatus();
                  }}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    !isPainResolved
                      ? "bg-amber-500/20 text-amber-500 border border-amber-500/40 shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <TriangleAlert className="h-3 w-3 inline" aria-hidden="true" /> Pendiente
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isPainResolved) handleTogglePainStatus();
                  }}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                    isPainResolved
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3 w-3 inline" aria-hidden="true" /> Atendido
                  </span>
                </button>
              </div>

              {onQuickSwap && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onQuickSwap}
                  className="h-7 text-xs font-semibold text-rose-400 border-rose-500/40 hover:bg-rose-500/10 cursor-pointer"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ArrowRightLeft className="h-3.5 w-3.5 inline" aria-hidden="true" /> Cambiar ejercicio
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Bitácora de Intervención del Entrenador con Auto-guardado */}
        <div className="rounded-lg border border-border/80 bg-secondary/15 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-xs font-bold text-foreground">
                Bitácora de Intervención del Entrenador
              </span>
            </div>
            {saveSuccess && (
              <span className="text-[11px] font-bold text-emerald-500 animate-in fade-in inline-flex items-center gap-1">
                <Check className="h-3 w-3 inline" aria-hidden="true" /> Guardado automático en la ficha
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Anotá qué acción tomaste (sustitución, ajuste de agarre, deload o pausa) para recordar qué se hizo ante la molestia:
          </p>
          <textarea
            value={coachLog}
            onChange={(e) => setCoachLog(e.target.value)}
            onBlur={handleSaveCoachLog}
            rows={3}
            placeholder="Ej.: Se sustituyó Press Banca por Landmine Press a 45°..."
            className="w-full rounded-md border border-border bg-card px-2.5 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-muted-foreground">
              {saveSuccess ? (
                <span className="text-emerald-500 font-medium inline-flex items-center gap-1">
                  <Check className="h-3 w-3 inline" aria-hidden="true" /> Guardado al desenfocar
                </span>
              ) : (
                "Se guarda automáticamente al escribir o salir."
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSaveCoachLog}
              className="h-6 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <span className="inline-flex items-center gap-1">
                <Save className="h-3.5 w-3.5 inline" aria-hidden="true" /> Guardar Registro en la Ficha
              </span>
            </Button>
          </div>
        </div>

        {/* Alertas secundarias de dolor solo si no hay molestia principal activa */}
        {painAlertsNode && (!zonaDolorActual || zonaDolorActual === "Ninguna") && (
          <div>{painAlertsNode}</div>
        )}

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
              <ClipboardList className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span className="text-xs font-bold text-foreground">
                Cuestionario Inicial Completo del Alumno
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {anamnesisCollapsed ? (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              )}
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
