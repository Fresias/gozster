"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  calculateWarmupSets,
  type WarmupSetProgression,
} from "@/lib/strength-metrics";

interface WarmupModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName: string;
  workingWeightKg: number;
  onApplyWarmupSets: (warmupSets: WarmupSetProgression[]) => void;
  onRegisterWarmupSet?: (warmupSet: WarmupSetProgression) => void;
}

export function WarmupModal({
  isOpen,
  onClose,
  exerciseName,
  workingWeightKg,
  onApplyWarmupSets,
  onRegisterWarmupSet,
}: WarmupModalProps) {
  const [targetWeight, setTargetWeight] = React.useState(workingWeightKg || 80);

  React.useEffect(() => {
    if (workingWeightKg > 0) {
      setTargetWeight(workingWeightKg);
    }
  }, [workingWeightKg]);

  if (!isOpen) return null;

  const progressions = calculateWarmupSets(targetWeight, 20);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in"
      data-testid="warmup-calculator-modal"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 text-lg">
              🔥
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Calculadora de Calentamiento
              </h2>
              <p className="text-xs text-muted-foreground">{exerciseName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm font-bold p-1"
          >
            ✕
          </button>
        </div>

        {/* Input de peso de trabajo efectivo */}
        <div className="space-y-1.5 bg-secondary/30 p-3 rounded-xl border border-border/40">
          <label className="text-xs font-semibold text-muted-foreground block">
            Peso de Trabajo Efectivo (kg):
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="2.5"
              min="20"
              value={targetWeight}
              onChange={(e) => setTargetWeight(parseFloat(e.target.value) || 20)}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-center text-lg font-bold tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTargetWeight((w) => Math.max(20, w - 5))}
              >
                -5kg
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTargetWeight((w) => w + 5)}
              >
                +5kg
              </Button>
            </div>
          </div>
        </div>

        {/* Tabla de 4 series progresivas */}
        <div className="space-y-2">
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

        {/* Acciones */}
        <div className="flex gap-2 pt-2 border-t border-border/60">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-black font-bold"
            onClick={() => {
              onApplyWarmupSets(progressions);
              onClose();
            }}
            data-testid="apply-warmup-sets-btn"
          >
            ✓ Cargar 4 Series (W)
          </Button>
        </div>
      </div>
    </div>
  );
}
