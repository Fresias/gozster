"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import {
  etiquetaNivelDolor,
  tonoNivelDolor,
  nivelDesdeEva,
  type DolorActivo,
} from "@/lib/dolor";
import { useCobrosStore, type CobroItem } from "@/store/use-cobros-store";
import {
  getDemoCriticalAlerts,
  type CriticalAlert,
} from "@/components/coach/critical-alerts-data";
import { useDemoAlertEstados } from "@/components/coach/critical-alerts-store";
import { ChevronRight } from "@/components/ui/icons";

export interface ItemRevisarMolestia {
  id: string;
  alumnoId: string;
  alumnoNombre: string;
  zonaArticular: string;
  ejercicioNombre: string;
  eva: number;
  severidad?: string;
  esSintomaAlarma?: boolean;
  fecha?: string;
}

export interface ParaRevisarHoyProps {
  molestias?: DolorActivo[] | ItemRevisarMolestia[];
  cuotasVencidas?: CobroItem[];
  onSelectAlumno?: (alumnoId: string) => void;
  onGestionarCobro?: (alumnoId: string) => void;
  onVerTodasPendientes?: () => void;
  isLiveMode?: boolean;
  className?: string;
}

interface ItemFilaRevisar {
  id: string;
  tipo: "molestia" | "cuota" | "progreso";
  alumnoId: string;
  alumnoNombre: string;
  badgeTexto: string;
  badgeTono: "danger" | "warning" | "neutral";
  detalle: string;
  tiempo: string;
  prioridad: number;
}

/**
 * Bandeja única 'Para revisar hoy' en Coach Studio (08 §4.1, 07 §8 FIX-05, 09 P07).
 * Reemplaza definitivamente la bandeja roja de alertas críticas.
 * - Header 15 px font-semibold + "Ordenado por prioridad" en 12 px text-muted-foreground.
 * - Filas min-h-14 px-4 py-3 sin card propia, separadas por border-b border-border-subtle.
 * - Estructura: badge semántico suave + nombre 500 + detalle 13 px + tiempo relativo 12 px + chevron.
 * - Sin "Ver ficha →" en azul, sin EVA en mono suelto.
 * - Límite de 5 filas visibles; si hay más de 5, incluir link "Ver las {n} pendientes".
 * - Datos en vivo: consume molestias reales (v_dolor_activo / DolorActivo[]) y cuotas vencidas reales.
 */
export function ParaRevisarHoy({
  molestias: molestiasProp,
  cuotasVencidas: cuotasProp,
  onSelectAlumno,
  onGestionarCobro,
  onVerTodasPendientes,
  isLiveMode = false,
  className,
}: ParaRevisarHoyProps) {
  const cobrosStore = useCobrosStore((s) => s.cobros);
  const demoEstados = useDemoAlertEstados((s) => s.estados);

  // 1. Molestias activas: normalización desde props reales o fallback demo solo en modo no-live
  const listaMolestias = React.useMemo<ItemRevisarMolestia[]>(() => {
    if (molestiasProp !== undefined) {
      return (molestiasProp as any[]).map((m) => {
        const eva = typeof m.eva === "number" ? m.eva : m.setNumber || 5;
        const esAlarma = Boolean(m.esSintomaAlarma || m.es_sintoma_alarma || m.severidad === "CRITICA");
        return {
          id: m.id || `molestia-${m.alumnoId || m.alumno_id}`,
          alumnoId: m.alumnoId || m.alumno_id || "demo-alumno",
          alumnoNombre: m.alumnoNombre || m.alumno_nombre || "Atleta",
          zonaArticular: m.zonaArticular || m.zona_articular || m.zona || "Articular",
          ejercicioNombre: m.ejercicioNombre || m.ejercicio_nombre || "Ejercicio general",
          eva,
          severidad: m.severidad,
          esSintomaAlarma: esAlarma,
          fecha: m.fecha || m.fecha_reporte || "Hoy",
        };
      }).sort((a, b) => b.eva - a.eva);
    }

    if (isLiveMode) {
      return [];
    }

    // Datos por defecto derivados del modelo demo para tests unitarios / offline
    const alerts = getDemoCriticalAlerts();
    return alerts
      .filter((a) => {
        const estado = demoEstados[a.id] || a.estado || "PENDIENTE";
        return estado === "PENDIENTE" && a.type === "DOLOR";
      })
      .map((a, idx) => {
        const evaCalculado = a.severidad === "CRITICA" || a.esSintomaAlarma ? 8 : (idx === 1 ? 7 : 5);
        return {
          id: a.id,
          alumnoId: a.alumnoId,
          alumnoNombre: a.alumnoNombre,
          zonaArticular: a.zona || "Articular",
          ejercicioNombre: a.ejercicioNombre,
          eva: evaCalculado,
          severidad: a.severidad,
          esSintomaAlarma: Boolean(a.esSintomaAlarma),
          fecha: a.fecha,
        };
      })
      .sort((a, b) => b.eva - a.eva);
  }, [molestiasProp, demoEstados, isLiveMode]);

  // 2. Cuotas vencidas: desde props o cobrosStore
  const listaCuotasVencidas = React.useMemo<CobroItem[]>(() => {
    if (cuotasProp !== undefined) return cuotasProp;
    if (isLiveMode) return [];
    return cobrosStore.filter((c) => c.estado === "VENCIDO");
  }, [cuotasProp, cobrosStore, isLiveMode]);

  // 3. Fusión unificada y priorización estricta (Molestias primero por EVA, luego Cuotas por vencimiento)
  const { totalPendientes, filasVisibles } = React.useMemo(() => {
    const filasMolestias: ItemFilaRevisar[] = [];
    const filasCuotas: ItemFilaRevisar[] = [];

    // Molestias primero (prioridad 100 + eva)
    for (const m of listaMolestias) {
      const nivel = nivelDesdeEva(m.eva, m.esSintomaAlarma || m.severidad === "CRITICA");
      const etiqueta = etiquetaNivelDolor(nivel);
      const tono = tonoNivelDolor(nivel);
      const badgeTexto = etiqueta === "alto" ? "Alto" : etiqueta === "moderado" ? "Moderado" : "Leve";
      const zonaCap = m.zonaArticular
        ? m.zonaArticular.charAt(0).toUpperCase() + m.zonaArticular.slice(1).toLowerCase()
        : "Articular";

      filasMolestias.push({
        id: `m-${m.id}`,
        tipo: "molestia",
        alumnoId: m.alumnoId,
        alumnoNombre: m.alumnoNombre,
        badgeTexto,
        badgeTono: tono,
        detalle: `${m.ejercicioNombre} · ${zonaCap} · EVA ${m.eva}/10`,
        tiempo: m.fecha ?? "Hoy",
        prioridad: 100 + m.eva,
      });
    }

    // Cuotas después
    for (const c of listaCuotasVencidas) {
      const montoFormateado = `$${Number(c.monto).toLocaleString("es-AR")}`;
      filasCuotas.push({
        id: `c-${c.contratacionId || c.id}`,
        tipo: "cuota",
        alumnoId: c.alumnoId,
        alumnoNombre: c.alumnoNombre,
        badgeTexto: "Cuota",
        badgeTono: "danger",
        detalle: `${c.servicioNombre || "Cuota"} · ${montoFormateado} · Vencido ${c.fechaVencimiento || ""}`.trim(),
        tiempo: c.fechaVencimiento ? `Vencido` : "Vencido",
        prioridad: 50,
      });
    }

    const total = filasMolestias.length + filasCuotas.length;

    // En las 5 filas visibles: prioriza molestias primero, y si hay cuotas vencidas
    // asegura que las cuotas tengan visibilidad inmediata (ej. hasta 3-4 molestias + cuotas)
    let visibles: ItemFilaRevisar[] = [];
    if (filasCuotas.length > 0 && filasMolestias.length >= 4) {
      visibles = [...filasMolestias.slice(0, 3), ...filasCuotas.slice(0, 2)];
    } else {
      visibles = [...filasMolestias, ...filasCuotas].slice(0, 5);
    }

    return { totalPendientes: total, filasVisibles: visibles };
  }, [listaMolestias, listaCuotasVencidas]);

  const tieneMasDeCinco = totalPendientes > 5;

  if (totalPendientes === 0) {
    return (
      <section
        aria-labelledby="hoy-t"
        data-testid="para-revisar-hoy-container"
        className={cn(
          "rounded-xl border border-border bg-card flex flex-col overflow-hidden",
          className
        )}
      >
        <div className="flex items-center justify-between p-3.5 px-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 id="hoy-t" className="text-[15px] font-semibold text-foreground m-0">
              Para revisar hoy
            </h2>
            <span
              data-testid="para-revisar-hoy-badge-count"
              className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-semibold rounded-full bg-secondary text-secondary-foreground"
            >
              0
            </span>
          </div>
          <span className="text-xs text-muted-foreground">0 pendientes · Ordenado por prioridad</span>
        </div>
        <EmptyState
          data-testid="para-revisar-hoy-empty"
          title="Nada urgente por hoy."
          description="No hay molestias activas ni cobros vencidos que requieran tu atención inmediata."
          className="py-8"
        />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="hoy-t"
      data-testid="para-revisar-hoy-container"
      className={cn(
        "rounded-xl border border-border bg-card flex flex-col overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between p-3.5 px-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 id="hoy-t" className="text-[15px] font-semibold text-foreground m-0">
            Para revisar hoy
          </h2>
          <span
            data-testid="para-revisar-hoy-badge-count"
            className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-semibold rounded-full bg-secondary text-secondary-foreground"
          >
            {totalPendientes}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">Ordenado por prioridad</span>
      </div>

      <div data-testid="para-revisar-hoy-list" className="flex flex-col divide-y divide-border/60">
        {filasVisibles.map((item) => {
          const badgeClass =
            item.badgeTono === "danger"
              ? "bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA] dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
              : item.badgeTono === "warning"
              ? "bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
              : "bg-[#F4F4F5] text-[#3F3F46] border border-[#E4E4E7] dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";

          const testId =
            item.tipo === "molestia"
              ? "revisar-item-molestia"
              : "revisar-item-cuota";

          const handleClick = () => {
            if (item.tipo === "cuota" && onGestionarCobro) {
              onGestionarCobro(item.alumnoId);
            } else if (onSelectAlumno) {
              onSelectAlumno(item.alumnoId);
            }
          };

          return (
            <button
              key={item.id}
              type="button"
              data-testid={testId}
              onClick={handleClick}
              className="flex items-center gap-3 w-full px-4 py-3 text-left cursor-pointer min-h-14 bg-card hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {/* Badge semántico suave con vocabulario exacto P07 */}
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap",
                  badgeClass
                )}
              >
                {item.badgeTexto}
              </span>

              {/* Contenido principal: nombre en font-medium + detalle explicativo 13px */}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium text-foreground truncate">
                  {item.alumnoNombre}
                </span>
                <span className="text-[13px] text-muted-foreground truncate">
                  {item.detalle}
                </span>
              </div>

              {/* Tiempo relativo 12 px */}
              <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
                {item.tiempo}
              </span>

              {/* Chevron minimalista (sin links azules ni EVA en mono suelto) */}
              <ChevronRight
                className="h-4 w-4 text-muted-foreground shrink-0"
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {tieneMasDeCinco && (
        <div className="p-3 px-4 text-center border-t border-border">
          <button
            type="button"
            onClick={onVerTodasPendientes}
            className="text-[13px] text-muted-foreground hover:text-foreground hover:underline font-medium cursor-pointer"
          >
            Ver las {totalPendientes} pendientes
          </button>
        </div>
      )}
    </section>
  );
}
