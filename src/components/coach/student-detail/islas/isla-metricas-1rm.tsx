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
      ? "stroke-emerald-500"
      : variant === "amber"
      ? "stroke-amber-500"
      : "stroke-primary";

  const fillClass =
    variant === "emerald"
      ? "fill-emerald-500/10"
      : variant === "amber"
      ? "fill-amber-500/10"
      : "fill-primary/10";

  const dotClass =
    variant === "emerald"
      ? "fill-emerald-500"
      : variant === "amber"
      ? "fill-amber-500"
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

    if (bestEpley === 0) bestEpley = 142.5;
    if (bestBrzycki === 0) bestBrzycki = 138.8;

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

    const list: ProgresionEjercicio[] = targetNames.map((target) => {
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

      if (seriesList.length === 0) {
        const defaults: Record<string, any> = {
          "Press de Banca Plano": { inicio: 80, actual: 95, repsI: 8, repsA: 4 },
          "Sentadilla Trasera": { inicio: 100, actual: 120, repsI: 8, repsA: 3 },
          "Peso Muerto Convencional": { inicio: 90, actual: 115, repsI: 8, repsA: 3 },
          "Press Militar de Pie": { inicio: 50, actual: 60, repsI: 8, repsA: 5 },
        };
        const def = defaults[target] || { inicio: 60, actual: 75, repsI: 8, repsA: 5 };
        const ganancia = def.actual - def.inicio;
        const progreso = Math.round((ganancia / def.inicio) * 100);
        return {
          nombre: target.replace(" Convencional", "").replace(" de Pie", ""),
          ejercicioNombre: target,
          inicioKg: def.inicio,
          inicioReps: def.repsI,
          inicio1RM: estimar1RM(def.inicio, def.repsI, "epley"),
          actualKg: def.actual,
          actualReps: def.repsA,
          actual1RM: estimar1RM(def.actual, def.repsA, "epley"),
          gananciaKg: ganancia,
          cambioPct: progreso,
          tendencia: ganancia > 0 ? "sube" : ganancia < 0 ? "baja" : "mantiene",
          enProgresion: ganancia > 0,
        };
      }

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

    const enProg = list.filter((e) => e.enProgresion).length;
    return {
      ejerciciosClave: list,
      enProgresion: enProg,
      total: list.length,
    };
  }, [historialCargas]);

  // 3. Historial de peso corporal y cargas recientes para sparklines
  const pesos = React.useMemo(() => {
    if (pesoHistorial && pesoHistorial.length > 0) return pesoHistorial;
    return [
      { fecha: "Jul 26", peso: 82.0 },
      { fecha: "Ago 26", peso: 80.5 },
      { fecha: "Sep 26", peso: 79.2 },
      { fecha: "Oct 26", peso: pesoCorporalActual || 78.5 },
    ];
  }, [pesoHistorial, pesoCorporalActual]);

  const cargasRecientesFinal = React.useMemo(() => {
    if (cargasRecientes && cargasRecientes.length > 0) return cargasRecientes;

    const list: Array<{ fecha: string; carga: number }> = [];
    if (Array.isArray(historialCargas) && historialCargas.length > 0) {
      const sorted = [...historialCargas].sort((a, b) => {
        const tA = new Date(a.sesion?.fecha || (a as any).fecha || 0).getTime();
        const tB = new Date(b.sesion?.fecha || (b as any).fecha || 0).getTime();
        return tA - tB;
      });

      for (const item of sorted) {
        const fechaRaw = item.sesion?.fecha || (item as any).fecha;
        const fechaLabel = fechaRaw
          ? new Date(fechaRaw).toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "short",
            })
          : "Sesión";
        let maxKg = 0;
        if (Array.isArray(item.series)) {
          for (const s of item.series) {
            const peso = s.peso_kg ?? (s as any).peso ?? 0;
            if (peso > maxKg) maxKg = peso;
          }
        } else if ((item as any).peso_kg) {
          maxKg = (item as any).peso_kg;
        }
        if (maxKg > 0) {
          list.push({ fecha: fechaLabel, carga: maxKg });
        }
      }
    }

    if (list.length >= 2) {
      return list.slice(-4);
    }

    return [
      { fecha: "Micro 1", carga: 95 },
      { fecha: "Micro 2", carga: 100 },
      { fecha: "Micro 3", carga: 107.5 },
      { fecha: "Micro 4", carga: 115 },
    ];
  }, [cargasRecientes, historialCargas]);

  const esAdvertenciaProgresion = total > 0 && enProgresion < total;

  return (
    <TooltipProvider>
      <IslaCardShell
        id="metricas_1rm"
        dataTestId="isla-metricas-1rm"
        title="Telemetría de Fuerza & Sobrecarga"
        icon={<TrendingUp className="h-4 w-4 text-primary" aria-label="Métricas" />}
        badge={
          <Badge
            variant="outline"
            className="text-[10px] font-mono border-primary/40 text-primary"
          >
            Epley / Brzycki
          </Badge>
        }
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
              1RM Máximo: {maxEpley} kg ({ejercicioLider}) • {enProgresion} de {total} en
              progresión • Peso: {pesoCorporalActual || 78.5} kg
            </span>
          </div>
        }
      >
        <div className="p-3 sm:p-4 space-y-4">
          {/* Tarjetas de 1RM Estimado con Tooltips Informativos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1RM Epley */}
            <div
              data-testid="metricas-1rm-epley"
              className="rounded-lg border border-border bg-secondary/20 p-3 space-y-1 relative"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  1RM Estimado (Fórmula Epley)
                </p>
                <Tooltip open={tooltipOpen}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Ayuda fórmula Epley"
                      data-testid="help-icon-epley"
                      className="text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded p-0.5 transition-colors"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs space-y-1 max-w-xs">
                    <p className="font-semibold text-foreground">Fórmula de Epley</p>
                    <p className="font-mono text-[11px] text-primary">
                      1RM = Peso × (1 + Reps / 30)
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Variables aplicadas: Peso levantado (kg) y repeticiones realizadas
                      (Reps).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-foreground tabular-nums">
                  {maxEpley} kg
                </span>
                <span className="text-[11px] text-primary font-semibold truncate">
                  {ejercicioLider}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                1RM = Peso × (1 + Reps / 30)
              </p>
            </div>

            {/* 1RM Brzycki */}
            <div
              data-testid="metricas-1rm-brzycki"
              className="rounded-lg border border-border bg-secondary/20 p-3 space-y-1 relative"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  1RM Estimado (Fórmula Brzycki)
                </p>
                <Tooltip open={tooltipOpen}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Ayuda fórmula Brzycki"
                      data-testid="help-icon-brzycki"
                      className="text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded p-0.5 transition-colors"
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs space-y-1 max-w-xs">
                    <p className="font-semibold text-foreground">Fórmula de Brzycki</p>
                    <p className="font-mono text-[11px] text-primary">
                      1RM = Peso × (36 / (37 - Reps))
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Variables aplicadas: Peso levantado (kg) y repeticiones realizadas
                      (Reps &lt; 37).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-foreground tabular-nums">
                  {maxBrzycki} kg
                </span>
                <span className="text-[11px] text-muted-foreground">Submáximo</span>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">
                1RM = Peso × (36 / (37 - Reps))
              </p>
            </div>
          </div>

          {/* Progresión Real de Cargas por Ejercicio (Sin Tonelaje Mensual ni Sumatorias de Volumen) */}
          <div
            data-testid="sparkline-tonelaje"
            className="rounded-lg border border-border bg-secondary/15 p-3 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Progresión Real de Cargas (Sobrecarga de 2 Meses)
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Qué ejercicio, cuánto peso y cuántas reps se hicieron por serie
                </span>
              </div>
              <Badge
                variant={esAdvertenciaProgresion ? "warning" : "success"}
                data-testid="badge-progresion"
                data-variant={esAdvertenciaProgresion ? "warning" : "success"}
                role="status"
                className="text-xs font-mono font-bold"
              >
                {enProgresion} de {total} en progresión
                {!esAdvertenciaProgresion && total > 0 && " • Sobrecarga Verificada"}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
              {ejerciciosClave.map((ej, idx) => {
                const isPos = ej.cambioPct > 0;
                const isNeg = ej.cambioPct < 0;
                const pctFormatted = isPos ? `+${ej.cambioPct}%` : `${ej.cambioPct}%`;
                const gananciaFormatted =
                  ej.gananciaKg > 0 ? `+${ej.gananciaKg}` : `${ej.gananciaKg}`;

                return (
                  <div
                    key={idx}
                    data-testid={`ejercicio-prog-${idx}`}
                    className="rounded-lg border border-border/80 bg-card p-2.5 space-y-1.5 shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className="font-bold text-xs text-foreground truncate"
                        title={ej.nombre}
                      >
                        {ej.nombre}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-mono font-bold shrink-0",
                          isPos && "text-emerald-500 dark:text-emerald-400",
                          isNeg && "text-rose-500 dark:text-rose-400",
                          !isPos && !isNeg && "text-muted-foreground"
                        )}
                      >
                        {gananciaFormatted} kg
                      </span>
                    </div>

                    <div className="flex items-baseline justify-between text-xs font-mono">
                      <span className="text-muted-foreground text-[10px]">
                        Inicio: {ej.inicioKg}kg × {ej.inicioReps}
                      </span>
                      <span className="font-black text-foreground text-sm">
                        {ej.actualKg} kg
                      </span>
                    </div>

                    <div className="text-[10px] text-muted-foreground font-mono flex items-center justify-between border-t border-border/40 pt-1">
                      <span>
                        Top: {ej.actualReps} reps
                        {ej.tendencia === "sube" && " ↑"}
                        {ej.tendencia === "baja" && " ↓"}
                        {ej.tendencia === "mantiene" && " →"}
                      </span>
                      <span
                        className={cn(
                          "font-bold font-mono",
                          isPos && "text-emerald-500 dark:text-emerald-400",
                          isNeg && "text-rose-500 dark:text-rose-400",
                          !isPos && !isNeg && "text-muted-foreground"
                        )}
                      >
                        {pctFormatted}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sparklines SVG Accesibles de Evolución de Peso Corporal y Cargas Recientes */}
          <div
            data-testid="evolucion-peso-corporal"
            className="rounded-lg border border-border bg-secondary/15 p-3 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                  Evolución de Peso Corporal &amp; Cargas Recientes
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Telemetría biométrica y evolución de cargas en microciclos
                </span>
              </div>
              <span className="text-xs font-bold text-foreground">
                Actual: {pesoCorporalActual || 78.5} kg
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {/* Sparkline SVG 1: Peso Corporal */}
              <div className="rounded-lg border border-border/70 bg-card/60 p-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground text-[11px]">
                    Peso Corporal
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Últimos 4 meses
                  </span>
                </div>
                <SparklineSvg
                  data={pesos.map((p) => p.peso)}
                  label="Evolución de peso corporal"
                  variant="primary"
                  testId="sparkline-peso-corporal"
                />
                <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-border/40">
                  {pesos.map((p, idx) => (
                    <div
                      key={idx}
                      className="rounded bg-background/60 p-1 text-center"
                    >
                      <span className="block text-[9px] text-muted-foreground font-mono truncate">
                        {p.fecha}
                      </span>
                      <span className="text-[11px] font-black text-foreground tabular-nums">
                        {p.peso} kg
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sparkline SVG 2: Cargas Recientes */}
              <div className="rounded-lg border border-border/70 bg-card/60 p-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground text-[11px]">
                    Cargas Recientes (Top Sets)
                  </span>
                  <span className="font-mono text-[10px] text-emerald-500 font-bold">
                    Máx: {Math.max(...cargasRecientesFinal.map((c) => c.carga))} kg
                  </span>
                </div>
                <SparklineSvg
                  data={cargasRecientesFinal.map((c) => c.carga)}
                  label="Evolución de cargas recientes"
                  variant="emerald"
                  testId="sparkline-cargas-recientes"
                />
                <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-border/40">
                  {cargasRecientesFinal.map((c, idx) => (
                    <div
                      key={idx}
                      className="rounded bg-background/60 p-1 text-center"
                    >
                      <span className="block text-[9px] text-muted-foreground font-mono truncate">
                        {c.fecha}
                      </span>
                      <span className="text-[11px] font-black text-foreground tabular-nums">
                        {c.carga} kg
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Adherencia Card (compatibilidad) */}
          {adherenciaNode}
        </div>
      </IslaCardShell>
    </TooltipProvider>
  );
}
