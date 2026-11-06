"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { nivelDesdeEva, type DolorActivo } from "@/lib/dolor";
import { useCobrosStore, type CobroItem } from "@/store/use-cobros-store";
import {
  getDemoCriticalAlerts,
  type CriticalAlert,
} from "@/components/coach/critical-alerts-data";
import { useDemoAlertEstados } from "@/components/coach/critical-alerts-store";

export interface ItemRevisarMolestia {
  id: string;
  alumnoId: string;
  alumnoNombre: string;
  zonaArticular: string;
  ejercicioNombre: string;
  eva: number;
  esSintomaAlarma?: boolean;
  fecha?: string;
}

export interface ParaRevisarHoyProps {
  molestias?: DolorActivo[] | ItemRevisarMolestia[];
  cuotasVencidas?: CobroItem[];
  onSelectAlumno?: (alumnoId: string) => void;
  className?: string;
}

/**
 * Bloque central 'Para revisar hoy' en Coach Studio (GOZS-392).
 * Consolida y prioriza los elementos que requieren atención inmediata del entrenador:
 * 1. Alertas de molestia activas ordenadas por severidad clínica (EVA 8-10 primero con badge 'Alto' y zona articular, luego EVA 4-7 con 'Moderado'/'Alto').
 * 2. Cuotas vencidas prioritarias que superen el umbral de cobranza.
 * 3. Si no hay elementos pendientes, renderiza el EmptyState con "Nada urgente por hoy.".
 */
export function ParaRevisarHoy({
  molestias: molestiasProp,
  cuotasVencidas: cuotasProp,
  onSelectAlumno,
  className,
}: ParaRevisarHoyProps) {
  // Store de cobros reactivo (o prop provista)
  const cobrosStore = useCobrosStore((s) => s.cobros);
  const demoEstados = useDemoAlertEstados((s) => s.estados);

  // Molestias activas: normalización desde props o demo crítico
  const listaMolestias = React.useMemo<ItemRevisarMolestia[]>(() => {
    if (molestiasProp) {
      return (molestiasProp as any[]).map((m) => {
        // Soporta contrato DolorActivo o ItemRevisarMolestia
        const eva = typeof m.eva === "number" ? m.eva : m.setNumber || 5;
        return {
          id: m.id || `molestia-${m.alumnoId || m.alumno_id}`,
          alumnoId: m.alumnoId || m.alumno_id || "demo-alumno",
          alumnoNombre: m.alumnoNombre || m.alumno_nombre || "Atleta",
          zonaArticular: m.zonaArticular || m.zona_articular || m.zona || "Articular",
          ejercicioNombre: m.ejercicioNombre || m.ejercicio_nombre || "Ejercicio general",
          eva,
          esSintomaAlarma: Boolean(m.esSintomaAlarma || m.es_sintoma_alarma),
          fecha: m.fecha || m.fecha_reporte || "Hoy",
        };
      }).sort((a, b) => b.eva - a.eva);
    }

    // Datos por defecto derivados del modelo de alertas críticas
    const alerts = getDemoCriticalAlerts();
    return alerts
      .filter((a) => {
        const estado = demoEstados[a.id] || a.estado || "PENDIENTE";
        return estado === "PENDIENTE" && a.type === "DOLOR";
      })
      .map((a, idx) => {
        // Si el mock trae severidad crítica asignamos EVA 8, moderado 6, etc.
        const evaCalculado = a.severidad === "CRITICA" || a.esSintomaAlarma ? 8 : (idx === 1 ? 7 : 5);
        return {
          id: a.id,
          alumnoId: a.alumnoId,
          alumnoNombre: a.alumnoNombre,
          zonaArticular: a.zona || "Articular",
          ejercicioNombre: a.ejercicioNombre,
          eva: evaCalculado,
          esSintomaAlarma: Boolean(a.esSintomaAlarma),
          fecha: a.fecha,
        };
      })
      .sort((a, b) => b.eva - a.eva);
  }, [molestiasProp, demoEstados]);

  // Cuotas vencidas: desde props o cobrosStore
  const listaCuotasVencidas = React.useMemo<CobroItem[]>(() => {
    if (cuotasProp) return cuotasProp;
    return cobrosStore.filter((c) => c.estado === "VENCIDO");
  }, [cuotasProp, cobrosStore]);

  const totalPendientes = listaMolestias.length + listaCuotasVencidas.length;

  if (totalPendientes === 0) {
    return (
      <section
        aria-labelledby="para-revisar-hoy-titulo"
        data-testid="para-revisar-hoy-container"
        className={cn("rounded-2xl border border-border bg-card p-5 space-y-4", className)}
      >
        <div className="flex items-center justify-between">
          <h2 id="para-revisar-hoy-titulo" className="text-base font-semibold tracking-tight text-foreground">
            Para revisar hoy
          </h2>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">0 pendientes</span>
        </div>
        <EmptyState
          data-testid="para-revisar-hoy-empty"
          title="Nada urgente por hoy."
          description="No hay molestias activas ni cobros vencidos que requieran tu atención inmediata."
          className="py-10"
        />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="para-revisar-hoy-titulo"
      data-testid="para-revisar-hoy-container"
      className={cn("rounded-2xl border border-border bg-card p-5 space-y-4", className)}
    >
      <div className="flex items-center justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <h2 id="para-revisar-hoy-titulo" className="text-base font-semibold tracking-tight text-foreground">
            Para revisar hoy
          </h2>
          <span
            data-testid="para-revisar-hoy-badge-count"
            className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary font-mono tabular-nums"
          >
            {totalPendientes}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">Priorizado por urgencia clínica y cobros</span>
      </div>

      <div data-testid="para-revisar-hoy-list" className="space-y-2.5">
        {/* 1. Alertas de molestia activas (ordenadas por severidad clínica) */}
        {listaMolestias.map((m) => {
          const nivel = nivelDesdeEva(m.eva);
          const badgeText = nivel === "alto" ? "Alto" : nivel === "medio" ? "Moderado" : "Leve";
          const badgeVariant = nivel === "alto" ? "destructive" : nivel === "medio" ? "warning" : "info";

          return (
            <div
              key={m.id}
              data-testid="revisar-item-molestia"
              onClick={() => onSelectAlumno?.(m.alumnoId)}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/80 bg-background/60 p-3.5 hover:bg-muted/40 hover:border-border transition-colors cursor-pointer"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {m.alumnoNombre}
                  </span>
                  <StatusBadge variant={badgeVariant} size="sm" dot>
                    {badgeText}
                  </StatusBadge>
                  <span className="text-xs font-mono font-medium text-muted-foreground tabular-nums">
                    {`EVA ${m.eva}/10`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/90">{m.zonaArticular}</span>
                  {" · "}
                  <span>{m.ejercicioNombre}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {m.fecha && (
                  <span className="text-[11px] text-muted-foreground/80 font-mono">
                    {m.fecha}
                  </span>
                )}
                <span className="text-xs font-medium text-primary hover:underline">
                  Ver ficha →
                </span>
              </div>
            </div>
          );
        })}

        {/* 2. Cuotas vencidas prioritarias que superen el umbral */}
        {listaCuotasVencidas.map((c) => (
          <div
            key={c.contratacionId}
            data-testid="revisar-item-cuota"
            onClick={() => onSelectAlumno?.(c.alumnoId)}
            className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border/80 bg-background/60 p-3.5 hover:bg-muted/40 hover:border-border transition-colors cursor-pointer"
          >
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                  {c.alumnoNombre}
                </span>
                <StatusBadge variant="warning" size="sm" dot>
                  Vencido
                </StatusBadge>
                <span className="text-xs font-mono font-bold text-foreground tabular-nums">
                  {`$${c.monto.toLocaleString("es-AR")}`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground/90">{c.servicioNombre}</span>
                {" · Venció el "}
                <span className="font-mono">{c.fechaVencimiento}</span>
              </p>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <span className="text-xs font-medium text-primary hover:underline">
                Gestionar cobro →
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
