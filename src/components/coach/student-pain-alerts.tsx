"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getDemoCriticalAlerts,
  persistAlertEstado,
  type AlertaEstado,
  type CriticalAlert,
} from "@/components/coach/critical-alerts-data";
import { applyDemoEstados, useDemoAlertEstados } from "@/components/coach/critical-alerts-store";

const ESTADOS: { value: AlertaEstado; label: string; active: string }[] = [
  { value: "PENDIENTE", label: "Pendiente", active: "bg-amber-500 text-slate-950" },
  { value: "ATENDIDO", label: "Atendido", active: "bg-blue-600 text-white" },
  { value: "CERRADO", label: "Cerrado", active: "bg-emerald-600 text-white" },
];

const isPendiente = (a: CriticalAlert) => (a.estado || "PENDIENTE") === "PENDIENTE";

export interface StudentPainAlertsProps {
  alumnoId: string;
  onQuickSwap?: (alert: CriticalAlert) => void;
}

/** Sección "Alertas de dolor" de la ficha del alumno (dataset demo). */
export function StudentPainAlerts({ alumnoId, onQuickSwap }: StudentPainAlertsProps) {
  const [baseAlerts, setBaseAlerts] = React.useState<CriticalAlert[]>([]);
  const { estados, setEstado } = useDemoAlertEstados();
  const alerts = applyDemoEstados(baseAlerts, estados);

  React.useEffect(() => {
    setBaseAlerts(getDemoCriticalAlerts().filter((a) => a.alumnoId === alumnoId));
  }, [alumnoId]);

  const handleUpdateStatus = async (alertId: string, nuevoEstado: AlertaEstado) => {
    setEstado(alertId, nuevoEstado);
    await persistAlertEstado(alertId, nuevoEstado);
  };

  if (alerts.length === 0) return null;

  // Pendientes primero (orden estable entre el resto)
  const sorted = [...alerts].sort((a, b) => Number(isPendiente(b)) - Number(isPendiente(a)));

  return (
    <section
      className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 space-y-3"
      data-testid="student-pain-alerts"
    >
      <h3 className="text-sm font-bold text-foreground">Alertas de dolor</h3>
      <div className="space-y-2">
        {sorted.map((alert) => {
          const isCritical = alert.severidad === "CRITICA" || alert.esSintomaAlarma;
          const estado = alert.estado || "PENDIENTE";
          return (
            <div
              key={alert.id}
              className={`flex flex-col gap-3 p-3.5 rounded-xl border text-xs ${
                isCritical ? "border-destructive/50 bg-destructive/15" : "border-border/80 bg-card"
              }`}
              data-testid={`student-pain-alert-${alert.id}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground/90">
                  {alert.ejercicioNombre} (Serie {alert.setNumber})
                </span>
                {alert.zona && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-secondary text-secondary-foreground border border-border/60">
                    {alert.zona}
                  </span>
                )}
                {alert.severidad && (
                  <Badge variant={isCritical ? "destructive" : "secondary"} className="text-[10px] px-2 py-0.5 font-bold">
                    Dolor {alert.severidad}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground">{alert.fecha}</span>
              </div>

              <p className="text-xs text-foreground/90 font-medium leading-relaxed">{alert.detalle}</p>

              {alert.sintomasAlarma && alert.sintomasAlarma.length > 0 && (
                <div className="p-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-[11px] text-destructive font-bold flex items-center gap-1.5 flex-wrap">
                  <span>🚩 Síntomas de Alarma:</span>
                  <span className="font-semibold">{alert.sintomasAlarma.join(", ")}</span>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                {onQuickSwap && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onQuickSwap(alert)}
                    className="min-h-11 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 rounded-lg gap-1"
                    data-testid={`student-quick-swap-btn-${alert.id}`}
                  >
                    🔄 Sustituir Ejercicio
                  </Button>
                )}
                <div
                  className="flex items-center gap-1 bg-secondary/40 p-1 rounded-lg border border-border/60"
                  role="group"
                  aria-label="Estado de la alerta"
                >
                  {ESTADOS.map((e) => {
                    const selected = estado === e.value || (e.value === "CERRADO" && estado === "RESUELTO");
                    return (
                      <button
                        key={e.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => handleUpdateStatus(alert.id, e.value)}
                        className={`min-h-11 px-3 text-[11px] rounded font-bold transition-all ${
                          selected ? e.active : "text-muted-foreground hover:text-foreground"
                        }`}
                        data-testid={`student-status-btn-${e.value.toLowerCase()}-${alert.id}`}
                      >
                        {e.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
