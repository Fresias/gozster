import * as React from "react";
import { cn } from "@/lib/utils";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "@/components/coach/icons";
import { HelpCircle } from "@/components/ui/icons";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  estimar1RM,
  calcularProgresion,
  type ProgresionEjercicio,
} from "@/lib/progresion";

export interface IslaMetricas1RMProps {
  historialCargas?: HistoricalLoadEntry[];
  pesoCorporalActual?: number | null;
  pesoHistorial?: Array<{ fecha: string; peso: number }>;
  cargasRecientes?: Array<{ fecha: string; carga: number; ejercicio?: string }>;
  tooltipOpen?: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isCanvasMode?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  adherenciaNode?: React.ReactNode;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onSeparateRow?: () => void;
  onResizeWidth?: (delta: number) => void;
  currentWidth?: number;
  isSharedRow?: boolean;
  onHide?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
}

interface SparklineSvgProps {
  data: number[];
  width?: number;
  height?: number;
  padding?: number;
  unit?: string;
  variant?: "primary" | "emerald" | "amber";
  label: string;
  testId?: string;
}

function SparklineSvg({
  data,
  width = 280,
  height = 44,
  padding = 8,
  unit = "kg",
  variant = "primary",
  label,
  testId,
}: SparklineSvgProps) {
  if (!data || data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const n = data.length;

  const points = data.map((val, idx) => {
    const x =
      n > 1 ? padding + (idx / (n - 1)) * (width - 2 * padding) : width / 2;
    const y = height - padding - ((val - min) / range) * (height - 2 * padding);
    return {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      val,
    };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const firstPoint = points[0]!;
  const lastPoint = points[points.length - 1]!;
  const areaPoints = `${firstPoint.x},${height - padding} ${polylinePoints} ${lastPoint.x},${height - padding}`;

  const strokeClass =
    variant === "emerald"
      ? "stroke-success"
      : variant === "amber"
      ? "stroke-warning"
      : "stroke-primary";

  const fillClass =
    variant === "emerald"
      ? "fill-success/10"
      : variant === "amber"
      ? "fill-warning/10"
      : "fill-primary/10";

  const dotClass =
    variant === "emerald"
      ? "fill-success"
      : variant === "amber"
      ? "fill-warning"
      : "fill-primary";

  return (
    <svg
      role="img"
      aria-label={`${label}: de ${firstPoint.val} ${unit} a ${lastPoint.val} ${unit}`}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-11 overflow-visible select-none"
      data-testid={testId}
    >
      <title>{label}</title>
      <desc>{`${label}: valores entre ${min} ${unit} y ${max} ${unit}`}</desc>
      <polygon points={areaPoints} className={fillClass} />
      <polyline
        fill="none"
        points={polylinePoints}
        className={cn(strokeClass, "stroke-2")}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, idx) => (
        <circle
          key={idx}
          cx={p.x}
          cy={p.y}
          r="3"
          className={cn(dotClass, "stroke-card stroke-2")}
        />
      ))}
    </svg>
  );
}

export function IslaMetricas1RM({
  historialCargas = [],
  pesoCorporalActual = 78.5,
  pesoHistorial,
  cargasRecientes,
  tooltipOpen,
  isCollapsed,
  onToggleCollapse,
  isCanvasMode = false,
  isDragTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  adherenciaNode,
  onMoveUp,
  onMoveDown,
  onMoveLeft,
  onMoveRight,
  onSeparateRow,
  onResizeWidth,
  currentWidth,
  isSharedRow,
  onHide,
  canMoveUp,
  canMoveDown,
  canMoveLeft,
  canMoveRight,
}: IslaMetricas1RMProps) {
  // 1. Cálculo de 1RM Epley y Brzycki derivado de BE-03 (src/lib/progresion.ts)
  const { maxEpley, maxBrzycki, ejercicioLider } = React.useMemo(() => {
    let bestEpley = 0;
    let bestBrzycki = 0;
    let bestEj = "Sentadilla";

    if (Array.isArray(historialCargas)) {
      for (const entry of historialCargas) {
        if (!entry) continue;
        if (Array.isArray(entry.series)) {
          for (const s of entry.series) {
            const peso = s.peso_kg ?? (s as any).peso ?? 0;
            const reps = s.reps_hechas ?? (s as any).reps ?? 0;
            if (peso > 0 && reps > 0) {
              const epley = estimar1RM(peso, reps, "epley");
              const brzycki = estimar1RM(peso, reps, "brzycki");
              if (epley > bestEpley) {
                bestEpley = epley;
                bestEj = s.ejercicioNombre || (s as any).ejercicio_nombre || bestEj;
              }
              if (brzycki > bestBrzycki) {
                bestBrzycki = brzycki;
              }
            }
          }
        } else {
          const peso = (entry as any).peso_kg ?? (entry as any).peso ?? 0;
          const reps = (entry as any).reps_hechas ?? (entry as any).reps ?? 0;
          if (peso > 0 && reps > 0) {
            const epley = estimar1RM(peso, reps, "epley");
            const brzycki = estimar1RM(peso, reps, "brzycki");
            if (epley > bestEpley) {
              bestEpley = epley;
              bestEj = (entry as any).ejercicioNombre || (entry as any).nombre || bestEj;
            }
            if (brzycki > bestBrzycki) {
              bestBrzycki = brzycki;
            }
          }
        }
      }
    }


    return {
      maxEpley: Math.round(bestEpley * 10) / 10,
      maxBrzycki: Math.round(bestBrzycki * 10) / 10,
      ejercicioLider: bestEj,
    };
  }, [historialCargas]);

  // 2. Progresión real de cargas clave consumiendo BE-03 (calcularProgresion)
  const { ejerciciosClave, enProgresion, total } = React.useMemo(() => {
    if (Array.isArray(historialCargas) && historialCargas.length > 0) {
      const resProg = calcularProgresion(historialCargas, 60);
      if (resProg.total > 0) {
        return {
          ejerciciosClave: resProg.ejercicios,
          enProgresion: resProg.enProgresion,
          total: resProg.total,
        };
      }
    }

    // Fallbacks si no hay microciclos dispersos suficientes (> 7 días) o registros vacíos
    const targetNames = [
      "Press de Banca Plano",
      "Sentadilla Trasera",
      "Peso Muerto Convencional",
      "Press Militar de Pie",
    ];

    const ascEntries = Array.isArray(historialCargas)
      ? [...historialCargas].sort(
          (a, b) =>
            new Date(a.sesion?.fecha || (a as any).fecha || 0).getTime() -
            new Date(b.sesion?.fecha || (b as any).fecha || 0).getTime()
        )
      : [];

    const list: Array<ProgresionEjercicio | null> = targetNames.map((target) => {
      const seriesList: { fecha: string; peso_kg: number; reps_hechas: number }[] = [];
      ascEntries.forEach((entry) => {
        if (Array.isArray(entry.series)) {
          entry.series.forEach((s) => {
            const nombreSerie = s.ejercicioNombre || (s as any).ejercicio_nombre || "";
            if (
              nombreSerie.toLowerCase().includes(target.toLowerCase().split(" ")[0]!) ||
              target.toLowerCase().includes(nombreSerie.toLowerCase())
            ) {
              seriesList.push({
                fecha: entry.sesion?.fecha || (entry as any).fecha || "",
                peso_kg: s.peso_kg ?? (s as any).peso ?? 0,
                reps_hechas: s.reps_hechas ?? (s as any).reps ?? 1,
              });
            }
          });
        }
      });

      if (seriesList.length === 0) return null;

      const primera = seriesList[0]!;
      const ultima = seriesList[seriesList.length - 1]!;
      const ganancia = Math.round((ultima.peso_kg - primera.peso_kg) * 10) / 10;
      const progreso =
        primera.peso_kg > 0
          ? Math.round(((ultima.peso_kg - primera.peso_kg) / primera.peso_kg) * 100)
          : 0;

      return {
        nombre: target.replace(" Convencional", "").replace(" de Pie", ""),
        ejercicioNombre: target,
        inicioKg: primera.peso_kg,
        inicioReps: primera.reps_hechas,
        inicio1RM: estimar1RM(primera.peso_kg, primera.reps_hechas, "epley"),
        actualKg: ultima.peso_kg,
        actualReps: ultima.reps_hechas,
        actual1RM: estimar1RM(ultima.peso_kg, ultima.reps_hechas, "epley"),
        gananciaKg: ganancia,
        cambioPct: progreso,
        tendencia: ganancia > 0 ? "sube" : ganancia < 0 ? "baja" : "mantiene",
        enProgresion: ganancia > 0,
      };
    });

    const conDatos = list.filter((e): e is ProgresionEjercicio => e !== null);
    const enProg = conDatos.filter((e) => e.enProgresion).length;
    return {
      ejerciciosClave: conDatos,
      enProgresion: enProg,
      total: conDatos.length,
    };
  }, [historialCargas]);

  const esAdvertenciaProgresion = total > 0 && enProgresion < total;
  const hay1RM = maxEpley > 0;
  const fmtKg = (n: number) => `${String(Math.round(n * 10) / 10).replace(".", ",")} kg`;

  // 1RM Epley por sesión del ejercicio mostrado (últimas 8 sesiones, P04)
  const serie1RM = React.useMemo(() => {
    if (!Array.isArray(historialCargas) || !hay1RM) return [] as number[];
    const asc = [...historialCargas].sort(
      (a, b) =>
        new Date(a.sesion?.fecha || (a as any).fecha || 0).getTime() -
        new Date(b.sesion?.fecha || (b as any).fecha || 0).getTime()
    );
    const out: number[] = [];
    for (const entry of asc) {
      if (!Array.isArray(entry.series)) continue;
      let best = 0;
      for (const s of entry.series) {
        const nombre = s.ejercicioNombre || (s as any).ejercicio_nombre || "";
        const reps = s.reps_hechas ?? 0;
        if (nombre === ejercicioLider && s.peso_kg > 0 && reps >= 1 && reps <= 12) {
          best = Math.max(best, estimar1RM(s.peso_kg, reps, "epley"));
        }
      }
      if (best > 0) out.push(Math.round(best * 10) / 10);
    }
    return out.slice(-8);
  }, [historialCargas, ejercicioLider, hay1RM]);

  return (
    <TooltipProvider>
      <IslaCardShell
        id="metricas_1rm"
        dataTestId="isla-metricas-1rm"
        title="Fuerza y progreso"
        icon={<TrendingUp className="h-4 w-4 text-primary" aria-label="Métricas" />}
        badge={
          total > 0 ? (
            <Badge
              variant={esAdvertenciaProgresion ? "warning" : "success"}
              data-testid="badge-progresion"
              data-variant={esAdvertenciaProgresion ? "warning" : "success"}
            >
              {enProgresion} de {total} en progresión
            </Badge>
          ) : null
        }
        meta="últimos 2 meses"
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        isCanvasMode={isCanvasMode}
        isDragTarget={isDragTarget}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onMoveLeft={onMoveLeft}
        onMoveRight={onMoveRight}
        onSeparateRow={onSeparateRow}
        onResizeWidth={onResizeWidth}
        currentWidth={currentWidth}
        isSharedRow={isSharedRow}
        onHide={onHide}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        canMoveLeft={canMoveLeft}
        canMoveRight={canMoveRight}
        compactSummary={
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {hay1RM ? `1RM estimado: ${fmtKg(maxEpley)} (${ejercicioLider})` : "Sin series registradas"} ·{" "}
              {enProgresion} de {total} en progresión
            </span>
          </div>
        }
      >
        <div className="grid gap-6 p-4 sm:grid-cols-2">
          {/* Columna izquierda: 1RM estimado del ejercicio líder (Epley) + sparkline por sesión */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="m-0 text-[13px] text-neutral-soft-foreground">
              1RM estimado{hay1RM ? ` · ${ejercicioLider}` : ""}
            </p>
            <div
              data-testid="metricas-1rm-epley"
              className="text-[32px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-foreground"
            >
              {hay1RM ? fmtKg(maxEpley) : "—"}
            </div>

            {/* "Fórmula Epley · ver detalle": detalle de ambas fórmulas (P06) */}
            <details className="group text-xs text-neutral-soft-foreground">
              <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer w-fit hover:text-foreground">
                Fórmula Epley · <span className="underline underline-offset-2">ver detalle</span>
              </summary>
              <div className="mt-2 w-full max-w-[280px] space-y-2 rounded-lg border border-border bg-popover p-3 text-foreground">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="m-0 text-xs font-medium">Fórmula de Epley · {hay1RM ? fmtKg(maxEpley) : "—"}</p>
                    <p className="m-0 font-mono text-xs text-neutral-soft-foreground">1RM = Peso × (1 + Reps / 30)</p>
                  </div>
                  <Tooltip open={tooltipOpen}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Ayuda fórmula Epley"
                        data-testid="help-icon-epley"
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-xs">
                      Variables aplicadas: Peso levantado (kg) y repeticiones realizadas (Reps).
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div data-testid="metricas-1rm-brzycki" className="flex items-start justify-between gap-2">
                  <div>
                    <p className="m-0 text-xs font-medium">Fórmula de Brzycki · {maxBrzycki > 0 ? fmtKg(maxBrzycki) : "—"}</p>
                    <p className="m-0 font-mono text-xs text-neutral-soft-foreground">1RM = Peso × (36 / (37 - Reps))</p>
                  </div>
                  <Tooltip open={tooltipOpen}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Ayuda fórmula Brzycki"
                        data-testid="help-icon-brzycki"
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[240px] text-xs">
                      Variables aplicadas: Peso levantado (kg) y repeticiones realizadas (Reps &lt; 37).
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="m-0 text-xs text-muted-foreground">Se muestra Epley.</p>
              </div>
            </details>

            {serie1RM.length >= 2 && (
              <div className="mt-2 max-w-[240px] text-foreground">
                <SparklineSvg
                  data={serie1RM}
                  label={`1RM Epley por sesión · ${ejercicioLider}`}
                  testId="sparkline-1rm-sesiones"
                  variant="primary"
                />
              </div>
            )}

            {pesoCorporalActual ? (
              <p data-testid="evolucion-peso-corporal" className="m-0 mt-1 text-[13px] text-muted-foreground">
                Peso corporal · {fmtKg(pesoCorporalActual)}
              </p>
            ) : null}
          </div>

          {/* Columna derecha: progresión por ejercicio clave (inicio → actual y % de cambio) */}
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0" aria-label="Progresión de cargas por ejercicio">
            {ejerciciosClave.length === 0 ? (
              <li className="py-3 text-sm text-muted-foreground">Sin cargas registradas en los últimos 2 meses.</li>
            ) : (
              ejerciciosClave.map((ej, idx) => {
                const sube = ej.cambioPct > 0;
                const baja = ej.cambioPct < 0;
                return (
                  <li
                    key={ej.ejercicioNombre || idx}
                    data-testid={`ejercicio-prog-${idx}`}
                    className="flex items-center gap-3 py-2.5"
                    title={`${ej.gananciaKg > 0 ? "+" : ""}${ej.gananciaKg} kg en 2 meses`}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{ej.nombre}</span>
                    <span className="font-mono text-[13px] text-neutral-soft-foreground tabular-nums whitespace-nowrap">
                      {String(ej.inicioKg).replace(".", ",")} → {String(ej.actualKg).replace(".", ",")} kg
                    </span>
                    <Badge
                      variant={sube ? "success" : baja ? "destructive" : "secondary"}
                      className="min-w-[60px] justify-center tabular-nums"
                    >
                      {sube ? "↑ " : baja ? "↓ " : ""}
                      {Math.abs(Math.round(ej.cambioPct))}%
                    </Badge>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </IslaCardShell>
    </TooltipProvider>
  );
}
