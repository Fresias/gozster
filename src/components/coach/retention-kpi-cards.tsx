import * as React from "react";
import type { MetricasRetencion } from "@/store/use-coach-studio";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface RetentionKpiCardsProps {
  metricas: MetricasRetencion;
  onAssignPlanClick: () => void;
  className?: string;
}

export function RetentionKpiCards({
  metricas,
  onAssignPlanClick,
  className,
}: RetentionKpiCardsProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
        className ?? ""
      }`}
    >
      {/* KPI 1: cantActivas */}
      <Card className="flex flex-col justify-between border-border/80 bg-card/90 shadow-sm transition-all hover:border-primary/50">
        <CardHeader className="p-4 sm:p-5 pb-2">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Alumnos Activos
            </CardDescription>
            <Badge variant="success">Al día</Badge>
          </div>
          <CardTitle
            data-testid="kpi-cant-activas"
            className="text-3xl font-extrabold tracking-tight text-primary mt-1"
          >
            {metricas.cantActivas}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0">
          <p className="text-xs text-muted-foreground">
            Total de alumnos con plan y cuota activa en el ciclo actual.
          </p>
        </CardContent>
      </Card>

      {/* KPI 2: cantSinPlanEntrenamiento */}
      <Card
        className={`flex flex-col justify-between border-border/80 bg-card/90 shadow-sm transition-all ${
          metricas.cantSinPlanEntrenamiento > 0
            ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-500/60"
            : "hover:border-primary/50"
        }`}
      >
        <CardHeader className="p-4 sm:p-5 pb-2">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Sin Plan Asignado
            </CardDescription>
            <Badge
              variant={
                metricas.cantSinPlanEntrenamiento > 0 ? "warning" : "outline"
              }
            >
              {metricas.cantSinPlanEntrenamiento > 0
                ? "Urgente"
                : "Planificación al 100%"}
            </Badge>
          </div>
          <CardTitle
            data-testid="kpi-cant-sin-plan"
            className="text-3xl font-extrabold tracking-tight text-amber-400 mt-1"
          >
            {metricas.cantSinPlanEntrenamiento}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0 flex flex-col justify-between flex-1">
          <p className="text-xs text-muted-foreground">
            Alumnos que requieren asignación urgente de rutina.
          </p>
          <div className="mt-3">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onAssignPlanClick}
              className="w-full min-h-11 font-semibold text-xs bg-amber-500 hover:bg-amber-600 text-black shadow active:scale-95 transition-transform"
              aria-label="Asignar rutina a alumnos sin plan"
            >
              ⚡ Asignar Plan Urgente
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI 3: cantClientesPerdidosMes */}
      <Card className="flex flex-col justify-between border-border/80 bg-card/90 shadow-sm transition-all hover:border-primary/50 sm:col-span-2 lg:col-span-1">
        <CardHeader className="p-4 sm:p-5 pb-2">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Deserción Mensual (Churn)
            </CardDescription>
            <Badge
              variant={
                metricas.cantClientesPerdidosMes > 0
                  ? "destructive"
                  : "outline"
              }
            >
              {metricas.cantClientesPerdidosMes > 0
                ? "Bajas Detectadas"
                : "Cero Bajas"}
            </Badge>
          </div>
          <CardTitle
            data-testid="kpi-cant-perdidos-mes"
            className="text-3xl font-extrabold tracking-tight text-rose-400 mt-1"
          >
            {metricas.cantClientesPerdidosMes}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 pt-0">
          <p className="text-xs text-muted-foreground">
            Tasa de deserción (churn) del mes en curso. Atletas inactivos o dados de baja.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
