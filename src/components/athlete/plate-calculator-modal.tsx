"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  calculateBarbellPlates,
  type PlateCalculatorResult,
} from "@/lib/strength-metrics";

interface PlateCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetWeightKg: number;
}

export function PlateCalculatorModal({
  isOpen,
  onClose,
  targetWeightKg,
}: PlateCalculatorModalProps) {
  const [weight, setWeight] = React.useState(targetWeightKg || 100);

  React.useEffect(() => {
    if (targetWeightKg > 0) {
      setWeight(targetWeightKg);
    }
  }, [targetWeightKg]);

  if (!isOpen) return null;

  const result: PlateCalculatorResult = calculateBarbellPlates(weight, 20);

  // Colores visuales estándar de powerlifting / halterofilia
  const getPlateColor = (kg: number) => {
    switch (kg) {
      case 25:
        return "bg-red-600 text-white border-red-700";
      case 20:
        return "bg-blue-600 text-white border-blue-700";
      case 15:
        return "bg-amber-500 text-black border-amber-600";
      case 10:
        return "bg-emerald-600 text-white border-emerald-700";
      case 5:
        return "bg-zinc-100 text-zinc-900 border-zinc-300";
      case 2.5:
        return "bg-zinc-800 text-white border-zinc-950";
      case 1.25:
        return "bg-neutral-400 text-black border-neutral-500";
      default:
        return "bg-primary text-primary-foreground border-primary";
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in"
      data-testid="plate-calculator-modal"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-lg">
              🏋️
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Calculadora de Discos
              </h2>
              <p className="text-xs text-muted-foreground">
                Barra Olímpica de 20 kg
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm font-bold p-1"
          >
            ✕
          </button>
        </div>

        {/* Input de Peso Total */}
        <div className="space-y-1.5 bg-secondary/30 p-3 rounded-xl border border-border/40">
          <label className="text-xs font-semibold text-muted-foreground block">
            Peso Total en Barra (kg):
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="2.5"
              min="20"
              value={weight}
              onChange={(e) => setWeight(parseFloat(e.target.value) || 20)}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-center text-lg font-bold tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeight((w) => Math.max(20, w - 2.5))}
              >
                -2.5
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeight((w) => w + 2.5)}
              >
                +2.5
              </Button>
            </div>
          </div>
        </div>

        {/* Resumen por Lado */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Carga Por Cada Lado:
          </span>
          <div className="text-2xl font-black font-mono text-primary">
            {result.perSideWeightKg} kg
          </div>
          <p className="text-[11px] text-muted-foreground">
            (Barra: 20 kg + {result.perSideWeightKg * 2} kg en discos)
          </p>
        </div>

        {/* Representación Visual de Discos por Lado */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Discos Exactos a Colocar por Lado:
          </p>

          {result.platesPerSide.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border">
              Solo la barra olímpica de 20 kg (sin discos adicionales).
            </div>
          ) : (
            <div className="space-y-1.5">
              {result.platesPerSide.map((p) => (
                <div
                  key={p.weight}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-background/50 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`inline-flex items-center justify-center font-bold font-mono px-2 py-0.5 rounded text-xs border shadow-sm ${getPlateColor(
                        p.weight,
                      )}`}
                    >
                      {p.weight} kg
                    </span>
                    <span className="font-semibold text-foreground">
                      Disco de {p.weight} kg
                    </span>
                  </div>
                  <span className="font-mono font-bold text-sm text-primary">
                    × {p.count} por lado ({p.count * 2} en total)
                  </span>
                </div>
              ))}
            </div>
          )}

          {result.remainderKg > 0 && (
            <p className="text-[11px] text-amber-400 font-medium pt-1">
              ⚠️ Sobrante de {result.remainderKg} kg por lado no divisible con discos disponibles.
            </p>
          )}
        </div>

        {/* Botón cerrar */}
        <div className="pt-2 border-t border-border/60">
          <Button className="w-full" onClick={onClose}>
            Entendido, volver al entrenamiento
          </Button>
        </div>
      </div>
    </div>
  );
}
