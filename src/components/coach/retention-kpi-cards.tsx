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
      <Card className="flex flex-col justify-between border-border/80 bg-card shadow-xs hover:border-emerald-500/40 hover:shadow-sm transition-all duration-150">
        <CardHeader className="p-5 pb-2">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Alumnos Activos
            </CardDescription>
            <Badge variant="success">Al día</Badge>
          </div>
          <CardTitle
            data-testid="kpi-cant-activas"
            className="text-4xl font-black tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-1"
          >
            {metricas.cantActivas}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Total de alumnos con plan y cuota activa en el ciclo actual.
          </p>
        </CardContent>
      </Card>

      {/* KPI 2: cantSinPlanEntrenamiento */}
      <Card
        className={`flex flex-col justify-between border shadow-xs transition-all duration-150 ${
          metricas.cantSinPlanEntrenamiento > 0
            ? "border-amber-500/40 bg-amber-500/5 hover:border-amber-400 hover:shadow-sm"
            : "border-border/80 bg-card hover:border-primary/40"
        }`}
      >
        <CardHeader className="p-5 pb-2">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Sin Plan Asignado
            </CardDescription>
            <Badge
              variant={
                metricas.cantSinPlanEntrenamiento > 0 ? "warning" : "outline"
              }
            >
              {metricas.cantSinPlanEntrenamiento > 0 ? (
                <span className="inline-flex items-center gap-1 font-semibold">
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  Urgente
                </span>
              ) : (
                "Planificación al 100%"
              )}
            </Badge>
          </div>
          <CardTitle
            data-testid="kpi-cant-sin-plan"
            className="text-4xl font-black tracking-tight text-amber-500 dark:text-amber-400 font-mono tabular-nums mt-1"
          >
            {metricas.cantSinPlanEntrenamiento}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 flex flex-col justify-between flex-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Alumnos que requieren asignación urgente de rutina para entrenar.
          </p>
          <div className="mt-4">
            <Button
              type="button"
              variant="default"
              size="default"
              onClick={onAssignPlanClick}
              className="w-full min-h-12 font-bold text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs active:scale-[0.98] transition-all rounded-xl gap-2"
              aria-label="Asignar rutina a alumnos sin plan"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <span>Asignar Plan Urgente</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI 3: cantClientesPerdidosMes */}
      <Card className="flex flex-col justify-between border-border/80 bg-card shadow-xs hover:border-rose-500/40 hover:shadow-sm transition-all duration-150 sm:col-span-2 lg:col-span-1">
        <CardHeader className="p-5 pb-2">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
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
            className="text-4xl font-black tracking-tight text-rose-500 dark:text-rose-400 font-mono tabular-nums mt-1"
          >
            {metricas.cantClientesPerdidosMes}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tasa de deserción (churn) del mes en curso. Atletas inactivos o dados de baja.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
