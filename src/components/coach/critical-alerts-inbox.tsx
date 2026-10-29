"use client";

import * as React from "react";
import {
  getDemoCriticalAlerts,
  ordenarAlertasPorPrioridad,
  type CriticalAlert,
} from "@/components/coach/critical-alerts-data";
import { applyDemoEstados, useDemoAlertEstados } from "@/components/coach/critical-alerts-store";

export type {
  AlertaEstado,
  AlertaSeveridad,
  CriticalAlert,
} from "@/components/coach/critical-alerts-data";

export interface CriticalAlertsInboxProps {
  onSelectAlumno?: (alumnoId: string) => void;
  onQuickSwap?: (alert: CriticalAlert) => void;
}

/**
 * Bandeja de Alertas Críticas Compacta (Exclusiva Dolor Articular y Red Flags).
 * Permite gestionar el ciclo de vida del reporte (PENDIENTE, ATENDIDO, CERRADO),
 * con visualización destacada de severidad CRÍTICA y Síntomas de Alarma.
 */
export function CriticalAlertsInbox({
  onSelectAlumno,
  onQuickSwap,
}: CriticalAlertsInboxProps) {
  const [rawAlerts, setAlerts] = React.useState<CriticalAlert[]>([]);
  const demoEstados = useDemoAlertEstados((s) => s.estados);
  const alerts = applyDemoEstados(rawAlerts, demoEstados);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(false);
  // Degradado inferior: solo cuando la lista scrolleable tiene contenido oculto
  const listRef = React.useRef<HTMLDivElement>(null);
  const [hasHiddenBelow, setHasHiddenBelow] = React.useState(false);
  const updateHiddenBelow = React.useCallback(() => {
    const el = listRef.current;
    setHasHiddenBelow(!!el && el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  React.useEffect(() => {
    setAlerts(getDemoCriticalAlerts());
    setIsLoading(false);
  }, []);

  // Contadores por estado
  const countPendientes = alerts.filter((a) => (a.estado || "PENDIENTE") === "PENDIENTE").length;
  const countAtendidos = alerts.filter((a) => a.estado === "ATENDIDO").length;
  const countCerrados = alerts.filter((a) => a.estado === "CERRADO" || a.estado === "RESUELTO").length;

  // Filtrado según la pestaña activa (estrictamente alertas rojas de dolor articular)
  const filteredAlerts = ordenarAlertasPorPrioridad(alerts).filter((a) => {
    if (a.type !== "DOLOR" && !(a.type === "DOLOR")) return false;
    const estado = a.estado || "PENDIENTE";
    return estado === "PENDIENTE" && a.type === "DOLOR";
  });

  React.useEffect(() => {
    updateHiddenBelow();
    window.addEventListener("resize", updateHiddenBelow);
    return () => window.removeEventListener("resize", updateHiddenBelow);
  }, [updateHiddenBelow, isExpanded, filteredAlerts.length]);

  if (alerts.length === 0 && !isLoading) return null;

  return (
    <div
      className={`${
        "xl:absolute xl:inset-x-0 xl:top-0 xl:max-h-full flex flex-col"
      } rounded-2xl border border-destructive/40 bg-destructive/5 p-4 space-y-3 shadow-md backdrop-blur-sm`}
      data-testid="critical-alerts-inbox"
    >
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        className="w-full min-h-12 flex items-center justify-between shrink-0 border-b border-destructive/20 pb-2.5"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-black">
            {countPendientes}
          </span>
          <span className="text-sm font-bold text-foreground">Bandeja de alertas críticas</span>
        </span>
        <span aria-hidden="true" className="text-xs text-muted-foreground">
          {isExpanded ? "▲" : "▼"}
        </span>
      </button>

      {isExpanded && (
        <div className="relative min-h-0 flex flex-col">
        <div
          ref={listRef}
          onScroll={updateHiddenBelow}
          tabIndex={0}
          aria-label="Alertas pendientes"
          className="min-h-0 max-h-80 xl:max-h-none overflow-y-auto overscroll-contain divide-y divide-border/60"
          data-testid="alerts-compact-list"
        >
          {filteredAlerts.map((alert) => {
            const redFlag = alert.severidad === "CRITICA" || Boolean(alert.esSintomaAlarma);
            const etiqueta = redFlag
              ? "Síntoma de alarma"
              : alert.severidad === "BAJA"
              ? "Dolor leve"
              : "Dolor moderado";
            return (
              <button
                key={alert.id}
                type="button"
                onClick={() => onSelectAlumno?.(alert.alumnoId)}
                className="w-full min-h-12 px-4 py-2 flex items-center gap-3 text-left hover:bg-muted/40"
                data-testid={`alert-row-${alert.id}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${redFlag ? "bg-destructive" : "bg-amber-400"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">{alert.alumnoNombre}</span>
                  <span
                    className={`block text-[11px] ${
                      redFlag ? "text-destructive font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {etiqueta}
                    {alert.zona ? ` · ${alert.zona}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{alert.fecha}</span>
                <span aria-hidden="true" className="shrink-0 text-muted-foreground">›</span>
              </button>
            );
          })}
        </div>
        {hasHiddenBelow && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-card"
            data-testid="alerts-scroll-hint"
          />
        )}
        </div>
      )}
    </div>
  );
}
