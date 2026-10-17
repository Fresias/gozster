import * as React from "react";
import type { MetricasRetencion } from "@/store/use-coach-studio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface RetentionKpiCardsProps {
  metricas: MetricasRetencion;
  onAssignPlanClick: () => void;
  className?: string;
}

/**
 * Banner Ejecutivo Compacto de Alumnos Activos (M3 Surface).
 * Poda de bloatware: elimina las tarjetas gigantes redundantes de Churn y Sin Plan Asignado,
 * consolidando el estado operativo en un único banner de alta densidad visual.
 */
export function RetentionKpiCards({
  metricas,
  onAssignPlanClick,
  className,
}: RetentionKpiCardsProps) {
  return (
    <div
      data-testid="retention-executive-banner"
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-border/80 bg-card/95 p-4 sm:p-5 shadow-xs backdrop-blur-sm transition-all duration-150 ${
        className ?? ""
      }`}
    >
      {/* Alumnos Activos (Métrica Principal) */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs">
          <svg
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Alumnos Activos
            </span>
            <Badge variant="success" className="text-[10px] px-2 py-0.5">
              Al día
            </Badge>
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span
              data-testid="kpi-cant-activas"
              className="text-3xl sm:text-4xl font-black tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums"
            >
              {metricas.cantActivas}
            </span>
            <span className="text-xs text-muted-foreground">
              atletas con membresía vigente
            </span>
          </div>
        </div>
      </div>

      {/* Alerta compacta si existen alumnos que requieren plan urgente */}
      {metricas.cantSinPlanEntrenamiento > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            <span className="font-semibold text-amber-500 dark:text-amber-400">
              {metricas.cantSinPlanEntrenamiento} sin rutina
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={onAssignPlanClick}
            className="min-h-10 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 rounded-lg shadow-xs"
            aria-label="Asignar rutina a alumnos sin plan"
          >
            Asignar Urgente →
          </Button>
        </div>
      )}
    </div>
  );
}
