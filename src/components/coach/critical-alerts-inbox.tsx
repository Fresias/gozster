"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspaceModeStore } from "@/store/use-workspace-mode";
import {
  fetchCriticalAlerts,
  getDemoCriticalAlerts,
  persistAlertEstado,
  withAlertEstado,
  type AlertaEstado,
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
  const { mode } = useWorkspaceModeStore();
  const isTesteo = mode === "TESTEO";
  const [rawAlerts, setAlerts] = React.useState<CriticalAlert[]>([]);
  const demoEstados = useDemoAlertEstados((s) => s.estados);
  const alerts = isTesteo ? applyDemoEstados(rawAlerts, demoEstados) : rawAlerts;
  const [isLoading, setIsLoading] = React.useState(false);
  const [isExpanded, setIsExpanded] = React.useState(mode !== "TESTEO");
  const [selectedFilter, setStatusFilter] = React.useState<"PENDIENTE" | "ATENDIDO" | "CERRADO" | "TODAS">(
    "PENDIENTE"
  );
  // En Testeo el filtro efectivo es siempre PENDIENTE (sin pisar la pestaña elegida en Producción)
  const statusFilter = isTesteo ? "PENDIENTE" : selectedFilter;
  React.useEffect(() => {
    setIsExpanded(!isTesteo);
  }, [isTesteo]);

  const fetchAlerts = React.useCallback(async () => {
    setIsLoading(true);
    try {
      setAlerts(await fetchCriticalAlerts());
    } catch (e) {
      console.warn("Fallo cargando alertas críticas de dolor:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (mode === "TESTEO") {
      setAlerts(getDemoCriticalAlerts());
      setIsLoading(false);
    } else {
      fetchAlerts();
    }
  }, [mode, fetchAlerts]);

  // Cambiar estado del reporte (PENDIENTE, ATENDIDO, CERRADO)
  const handleUpdateStatus = async (alertId: string, nuevoEstado: AlertaEstado) => {
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? withAlertEstado(a, nuevoEstado) : a)));
    await persistAlertEstado(alertId, nuevoEstado);
  };

  // Contadores por estado
  const countPendientes = alerts.filter((a) => (a.estado || "PENDIENTE") === "PENDIENTE").length;
  const countAtendidos = alerts.filter((a) => a.estado === "ATENDIDO").length;
  const countCerrados = alerts.filter((a) => a.estado === "CERRADO" || a.estado === "RESUELTO").length;

  // Filtrado según la pestaña activa (estrictamente alertas rojas de dolor articular)
  const filteredAlerts = alerts.filter((a) => {
    if (a.type !== "DOLOR" && !(a.type === "DOLOR")) return false;
    const estado = a.estado || "PENDIENTE";
    if (statusFilter === "TODAS") return a.type === "DOLOR";
    if (statusFilter === "CERRADO")
      return (estado === "CERRADO" || estado === "RESUELTO") && a.type === "DOLOR";
    return estado === statusFilter && a.type === "DOLOR";
  });

  if (alerts.length === 0 && !isLoading) return null;

  return (
    <div
      className="max-w-4xl rounded-2xl border border-destructive/40 bg-destructive/5 p-4 space-y-3 shadow-md backdrop-blur-sm"
      data-testid="critical-alerts-inbox"
    >
      {isTesteo ? (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          className="w-full min-h-12 flex items-center justify-between border-b border-destructive/20 pb-2.5"
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
      ) : (
      <>
      <div className="flex items-center justify-between border-b border-destructive/20 pb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-black animate-pulse">
            {countPendientes}
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 flex-wrap">
              <span>Bandeja de Alertas Críticas (Dolor Articular &amp; Red Flags)</span>
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-bold">
                Triage Biomecánico
              </Badge>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Molestias reportadas por atletas. Protocolo de atención y sustitución trazable del Coach.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-muted-foreground hover:text-foreground font-semibold px-2 py-1 rounded transition-colors"
        >
          {isExpanded ? "Ocultar ▲" : "Mostrar ▼"}
        </button>
      </div>

      </>
      )}

      {isExpanded && isTesteo && (
        <div className="divide-y divide-border/60" data-testid="alerts-compact-list">
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
      )}

      {isExpanded && !isTesteo && (
        <div className="space-y-3 pt-1">
          {/* Pestañas de Filtrado por Estado */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
            data-testid="alerts-status-filter-container"
          >
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mr-1">
              Estado:
            </span>
            <button
              type="button"
              onClick={() => setStatusFilter("PENDIENTE")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-8 ${
                statusFilter === "PENDIENTE"
                  ? "bg-destructive text-destructive-foreground shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              data-testid="filter-tab-pendientes"
            >
              <span>Pendientes</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-background/20 font-mono">
                {countPendientes}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("ATENDIDO")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-8 ${
                statusFilter === "ATENDIDO"
                  ? "bg-amber-500 text-slate-950 shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              data-testid="filter-tab-atendidos"
            >
              <span>Atendidos</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-background/20 font-mono">
                {countAtendidos}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("CERRADO")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 min-h-8 ${
                statusFilter === "CERRADO"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              data-testid="filter-tab-cerrados"
            >
              <span>Cerrados</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-background/20 font-mono">
                {countCerrados}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("TODAS")}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all min-h-8 ${
                statusFilter === "TODAS"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
              data-testid="filter-tab-todas"
            >
              Todas ({alerts.length})
            </button>
          </div>

          {/* Lista de Alertas */}
          {filteredAlerts.length === 0 ? (
            <div className="p-4 rounded-xl border border-border/60 bg-card/60 text-center text-xs text-muted-foreground">
              No hay alertas en estado <strong>{statusFilter.toLowerCase()}</strong> en este momento.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAlerts.map((alert) => {
                const isCritical = alert.severidad === "CRITICA" || alert.esSintomaAlarma;
                const estado = alert.estado || "PENDIENTE";

                return (
                  <div
                    key={alert.id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border text-xs transition-colors ${
                      isCritical
                        ? "border-destructive/50 bg-destructive/15 hover:bg-destructive/20"
                        : "border-border/80 bg-card hover:bg-secondary/30"
                    }`}
                    data-testid={`alert-card-${alert.id}`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="text-xl pt-0.5 select-none" aria-hidden="true">
                        {isCritical ? "🚨" : "⚠️"}
                      </span>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-foreground text-xs">
                            {alert.alumnoNombre}
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="font-semibold text-foreground/90">
                            {alert.ejercicioNombre} (Serie {alert.setNumber})
                          </span>

                          {/* Badge de Zona */}
                          {alert.zona && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-secondary text-secondary-foreground border border-border/60">
                              {alert.zona}
                            </span>
                          )}

                          {/* Badge de Severidad CRÍTICA / Red Flag */}
                          {isCritical && (
                            <Badge
                              variant="destructive"
                              className="text-[10px] px-2 py-0.5 font-black uppercase tracking-wider bg-destructive text-destructive-foreground animate-pulse"
                              data-testid="red-flag-badge"
                            >
                              🚨 CRÍTICA / RED FLAG
                            </Badge>
                          )}

                          {/* Badge de Estado del Reporte */}
                          <Badge
                            className={`text-[10px] px-2 py-0.5 font-bold ${
                              estado === "PENDIENTE"
                                ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                                : estado === "ATENDIDO"
                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                                : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                            }`}
                            data-testid={`alert-estado-badge-${alert.id}`}
                          >
                            {estado}
                          </Badge>

                          <span className="text-[10px] text-muted-foreground ml-auto sm:ml-0">
                            {alert.fecha}
                          </span>
                        </div>

                        {/* Detalle y notas del atleta */}
                        <p className="text-xs text-foreground/90 font-medium leading-relaxed">
                          {alert.detalle}
                        </p>

                        {/* Síntomas de alarma explícitos */}
                        {alert.sintomasAlarma && alert.sintomasAlarma.length > 0 && (
                          <div
                            className="p-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-[11px] text-destructive font-bold flex items-center gap-1.5 flex-wrap"
                            data-testid="alert-red-flags-list"
                          >
                            <span>🚩 Síntomas de Alarma:</span>
                            <span className="font-semibold">{alert.sintomasAlarma.join(", ")}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Acciones del Coach: Gestión de Estados y Quick Swap */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center flex-wrap">
                      {/* Botón Sustituir Ejercicio (Quick Swap) */}
                      {onQuickSwap && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => onQuickSwap(alert)}
                          className="min-h-10 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 rounded-lg shadow-xs gap-1"
                          title="Sustituir Ejercicio por alternativa biomecánica clasificada"
                          data-testid={`quick-swap-btn-${alert.id}`}
                        >
                          <span>🔄 Sustituir Ejercicio</span>
                        </Button>
                      )}

                      {/* Botón Ver Alumno */}
                      {onSelectAlumno && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="min-h-10 text-[11px] font-semibold border-border/80 px-2.5 rounded-lg"
                          onClick={() => onSelectAlumno(alert.alumnoId)}
                          data-testid={`view-student-btn-${alert.id}`}
                        >
                          Ver Alumno
                        </Button>
                      )}

                      {/* Selector de Estado del Reporte (PENDIENTE, ATENDIDO, CERRADO) */}
                      <div className="flex items-center gap-1 bg-secondary/40 p-1 rounded-lg border border-border/60">
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(alert.id, "PENDIENTE")}
                          className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${
                            estado === "PENDIENTE"
                              ? "bg-amber-500 text-slate-950 shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title="Marcar como Pendiente"
                          data-testid={`status-btn-pendiente-${alert.id}`}
                        >
                          Pendiente
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(alert.id, "ATENDIDO")}
                          className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${
                            estado === "ATENDIDO"
                              ? "bg-blue-600 text-white shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title="Marcar como Atendido"
                          data-testid={`status-btn-atendido-${alert.id}`}
                        >
                          Atendido
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(alert.id, "CERRADO")}
                          className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${
                            estado === "CERRADO" || estado === "RESUELTO"
                              ? "bg-emerald-600 text-white shadow-xs"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          title="Cerrar Reporte"
                          data-testid={`status-btn-cerrado-${alert.id}`}
                        >
                          Cerrar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
