import * as React from "react";
import type { MetricasRetencion } from "@/store/use-coach-studio";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { KpisNegocio, KpisNegocioDatos } from "@/lib/kpis-negocio";

export interface RetentionKpiCardsProps {
  metricas: MetricasRetencion;
  kpis?: KpisNegocio | KpisNegocioDatos;
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
  kpis,
  onAssignPlanClick,
  className,
}: RetentionKpiCardsProps) {
  const cantActivasValor =
    kpis !== undefined
      ? (kpis.cantActivas ?? kpis.alumnos_activos ?? metricas.cantActivas)
      : metricas.cantActivas;

  return (
    <div
      data-testid="retention-executive-banner"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div>
        <p className="text-[13px] text-muted-foreground">Alumnos activos</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span
            data-testid="kpi-cant-activas"
            className="text-[28px] font-semibold leading-8 tracking-[-0.02em] tabular-nums text-foreground"
          >
            {cantActivasValor}
          </span>
          <span className="text-[13px] text-muted-foreground">con membresía vigente</span>
        </p>
      </div>

      {metricas.cantSinPlanEntrenamiento > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-warning-soft-border bg-warning-soft py-2 pl-3 pr-2">
          <span className="text-sm font-medium text-warning-soft-foreground">
            <span className="tabular-nums">{metricas.cantSinPlanEntrenamiento}</span> sin rutina
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={onAssignPlanClick}
            aria-label="Asignar rutina a alumnos sin plan"
          >
            Asignar rutina
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
