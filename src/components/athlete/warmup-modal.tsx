"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Flame, TriangleAlert, X } from "@/components/athlete/icons";
import type { WarmupSetProgression } from "@/lib/strength-metrics";
import type { MarcasEjercicio } from "@/lib/record-ejercicio";
import {
  evaluarDatosAproximacion,
  calcularSeriesAproximacion,
  esEjercicioAislamiento,
  MENSAJE_SIN_DATOS,
} from "@/lib/aproximacion-pr";

interface WarmupModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName: string;
  workingWeightKg?: number;
  marcas?: MarcasEjercicio | null;
  rpeObjetivo?: number;
  repsObjetivo?: string;
  esAislamiento?: boolean;
  onApplyWarmupSets: (warmupSets: WarmupSetProgression[]) => void;
  onRegisterWarmupSet?: (warmupSet: WarmupSetProgression) => void;
}

export function WarmupModal({
  isOpen,
  onClose,
  exerciseName,
  workingWeightKg = 0,
  marcas,
  rpeObjetivo,
  repsObjetivo,
  esAislamiento,
  onApplyWarmupSets,
  onRegisterWarmupSet,
}: WarmupModalProps) {
  // Evaluamos si el alumno tiene PR previo y datos suficientes (GOZS-236 / GOZS-276)
  const evaluacion = React.useMemo(() => {
    if (marcas === undefined) return null;
    return evaluarDatosAproximacion(marcas);
  }, [marcas]);

  const esSinDatos = evaluacion ? evaluacion.estado === "sin_datos" : false;
  const esEstimada = evaluacion ? evaluacion.estado === "estimada" : false;
  const pesoDesdePR = evaluacion?.pesoSugerido ?? null;

  // Estado del peso de trabajo
  const [targetWeight, setTargetWeight] = React.useState<number>(() => {
    if (pesoDesdePR && pesoDesdePR > 0) return pesoDesdePR;
    if (workingWeightKg > 0) return workingWeightKg;
    return esSinDatos ? 0 : 80;
  });

  React.useEffect(() => {
    if (pesoDesdePR && pesoDesdePR > 0) {
      setTargetWeight(pesoDesdePR);
    } else if (workingWeightKg > 0) {
      setTargetWeight(workingWeightKg);
    }
  }, [pesoDesdePR, workingWeightKg]);

  if (!isOpen) return null;

  const aislamientoCalculado = esAislamiento ?? esEjercicioAislamiento(exerciseName);

  const progressions = targetWeight > 0
    ? calcularSeriesAproximacion(targetWeight, {
        rpeObjetivo,
        repeticionesObjetivo: repsObjetivo,
        esAislamiento: aislamientoCalculado,
        pesoBarraKg: 20,
      })
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in"
      data-testid="warmup-calculator-modal"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 text-lg">
              <Flame className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Calculadora de Aproximación
              </h2>
              <p className="text-xs text-muted-foreground">{exerciseName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm font-bold p-1 cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Resumen de cálculo desde PR previo si existe */}
        {evaluacion && !esSinDatos && (
          <div
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-primary/10 border border-primary/20 text-xs"
            data-testid="pr-summary-badge"
          >
            <span className="text-muted-foreground">Cálculo desde último PR:</span>
            <span className="font-bold text-primary">
              {evaluacion.ultimoPRKg ? `PR: ${evaluacion.ultimoPRKg} kg` : ""}
              {evaluacion.ultimoPRKg && evaluacion.mejorE1RMKg ? " · " : ""}
              {evaluacion.mejorE1RMKg ? `e1RM: ${evaluacion.mejorE1RMKg} kg` : ""}
            </span>
          </div>
        )}

        {/* Alerta de recomendación estimada (1 sesión previa o > 8 semanas) */}
        {esEstimada && evaluacion?.mensajeAviso && (
          <div
            className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-500"
            data-testid="estimada-aviso"
          >
            <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block">Recomendación Estimada</span>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {evaluacion.mensajeAviso}
              </p>
            </div>
          </div>
        )}

        {/* Aviso para el alumno sin datos suficientes (GOZS-236) */}
        {esSinDatos && (
          <div
            className="space-y-2 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs"
            data-testid="sin-datos-aviso"
          >
            <div className="flex items-center gap-1.5 font-bold text-amber-500">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              <span>Sin PR previo en este ejercicio</span>
            </div>
            <p className="text-muted-foreground leading-relaxed text-[11px]">
              {MENSAJE_SIN_DATOS}
            </p>
          </div>
        )}

        {/* Opción de cargar peso de trabajo (siempre visible para ajustar o ingresar manualmente) */}
        <div
          className="space-y-1.5 bg-secondary/30 p-3 rounded-xl border border-border/40"
          data-testid="cargar-peso-manual-section"
        >
          <label className="text-xs font-semibold text-muted-foreground block">
            {esSinDatos
              ? "Opción: Cargar peso objetivo manualmente (kg):"
              : "Peso de Trabajo Efectivo (kg):"}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="2.5"
              min="20"
              placeholder="Ej: 60"
              value={targetWeight > 0 ? targetWeight : ""}
              onChange={(e) => setTargetWeight(parseFloat(e.target.value) || 0)}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-center text-lg font-bold tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="target-weight-input"
            />
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTargetWeight((w) => Math.max(20, (w || 20) - 5))}
              >
                -5kg
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTargetWeight((w) => (w || 20) + 5)}
              >
                +5kg
              </Button>
            </div>
          </div>
        </div>

        {/* Tabla de series progresivas de aproximación */}
        {progressions.length > 0 && (
          <div className="space-y-2" data-testid="progression-table">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Series Progresivas de Aproximación:
            </p>
            <div className="space-y-1.5">
              {progressions.map((p) => (
                <div
                  key={p.setNumber}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-background/50 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/20 text-amber-500 font-bold text-[10px]">
                      W{p.setNumber}
                    </span>
                    <div>
                      <span className="font-bold text-foreground">
                        {p.peso_kg} kg × {p.reps} reps
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        {p.descripcion}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-amber-400 text-xs">
                      {p.percentage > 0 ? `${p.percentage}%` : "Barra"}
                    </span>
                    {onRegisterWarmupSet && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-[11px] font-bold border-amber-500/40 text-amber-500 hover:bg-amber-500/10 cursor-pointer"
                        onClick={() => {
                          onRegisterWarmupSet(p);
                          onClose();
                        }}
                        data-testid={`register-warmup-btn-${p.setNumber}`}
                      >
                        Registrar
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex gap-2 pt-2 border-t border-border/60">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold disabled:opacity-50"
            disabled={progressions.length === 0}
            onClick={() => {
              onApplyWarmupSets(progressions);
              onClose();
            }}
            data-testid="apply-warmup-sets-btn"
            title="✓ Cargar 4 Series (W)"
          >
            ✓ Cargar {progressions.length > 0 ? `${progressions.length} Series (Aproximación)` : "Series (Aproximación)"}
          </Button>
        </div>
      </div>
    </div>
  );
}
