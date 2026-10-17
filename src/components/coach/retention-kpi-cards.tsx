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
      <Card className="flex flex-col justify-between border-border/80 bg-card shadow-m3-1 hover:border-emerald-500/50 hover:shadow-m3-2 transition-all">
        <CardHeader className="p-5 pb-2">
          <div className="flex items-center justify-between">
            <CardDescription className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Alumnos Activos
            </CardDescription>
            <Badge variant="success">Al día</Badge>
          </div>
          <CardTitle
            data-testid="kpi-cant-activas"
            className="text-4xl font-black tracking-tight text-emerald-400 font-mono tabular-nums mt-1"
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
        className={`flex flex-col justify-between border shadow-m3-1 transition-all ${
          metricas.cantSinPlanEntrenamiento > 0
            ? "border-amber-500/50 bg-amber-500/10 hover:border-amber-400 hover:shadow-m3-2"
            : "border-border/80 bg-card hover:border-primary/50"
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
              {metricas.cantSinPlanEntrenamiento > 0
                ? "⚠️ Urgente"
                : "Planificación al 100%"}
            </Badge>
          </div>
          <CardTitle
            data-testid="kpi-cant-sin-plan"
            className="text-4xl font-black tracking-tight text-amber-400 font-mono tabular-nums mt-1"
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
              className="w-full min-h-12 font-bold text-xs bg-amber-500 hover:bg-amber-400 text-black shadow-sm active:scale-[0.98] transition-all rounded-xl"
              aria-label="Asignar rutina a alumnos sin plan"
            >
              ⚡ Asignar Plan Urgente
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI 3: cantClientesPerdidosMes */}
      <Card className="flex flex-col justify-between border-border/80 bg-card shadow-m3-1 hover:border-rose-500/50 hover:shadow-m3-2 transition-all sm:col-span-2 lg:col-span-1">
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
            className="text-4xl font-black tracking-tight text-rose-400 font-mono tabular-nums mt-1"
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
