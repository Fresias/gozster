"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  BARBELL_OPTIONS,
  calculateBarbellPlates,
  type BarbellWeightKg,
  type PlateCalculatorResult,
} from "@/lib/strength-metrics";

export interface PlateCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetWeightKg: number;
  onApplyWeight?: (weightKg: number) => void;
  initialBarWeightKg?: BarbellWeightKg;
}

export function PlateCalculatorModal({
  isOpen,
  onClose,
  targetWeightKg,
  onApplyWeight,
  initialBarWeightKg = 20,
}: PlateCalculatorModalProps) {
  const [selectedBar, setSelectedBar] = React.useState<BarbellWeightKg>(initialBarWeightKg);
  const [weight, setWeight] = React.useState(Math.max(initialBarWeightKg, targetWeightKg || 100));

  React.useEffect(() => {
    if (targetWeightKg > 0) {
      setWeight(Math.max(selectedBar, targetWeightKg));
    }
  }, [targetWeightKg, selectedBar]);

  if (!isOpen) return null;

  const result: PlateCalculatorResult = calculateBarbellPlates(weight, selectedBar);

  const handleBarChange = (newBarWeight: BarbellWeightKg) => {
    setSelectedBar(newBarWeight);
    if (weight < newBarWeight) {
      setWeight(newBarWeight);
    }
  };

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

  const fallbackOption = BARBELL_OPTIONS[0] as (typeof BARBELL_OPTIONS)[number];
  const activeBarOption =
    BARBELL_OPTIONS.find((b) => b.weightKg === selectedBar) ?? fallbackOption;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in"
      data-testid="plate-calculator-modal"
    >
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
        {/* Cabecera */}
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-lg">
              🏋️
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Calculadora de Discos
              </h2>
              <p
                className="text-xs text-muted-foreground"
                data-testid="active-barbell-label"
              >
                Barra activa:{" "}
                <span className="font-semibold text-foreground">
                  {activeBarOption.name}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            className="text-muted-foreground hover:text-foreground text-sm font-bold p-1 rounded-md hover:bg-secondary/60 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Selector de Barra */}
        <div className="space-y-1.5" data-testid="barbell-selector-container">
          <label className="text-xs font-semibold text-muted-foreground block">
            Seleccionar Barra Disponible:
          </label>
          <div
            className="grid grid-cols-3 gap-2"
            role="radiogroup"
            aria-label="Tipo de barra"
          >
            {BARBELL_OPTIONS.map((opt) => {
              const isSelected = selectedBar === opt.weightKg;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  data-testid={`barbell-btn-${opt.weightKg}`}
                  onClick={() => handleBarChange(opt.weightKg)}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all touch-manipulation cursor-pointer ${
                    isSelected
                      ? "border-primary bg-primary/15 text-primary shadow-xs ring-1 ring-primary"
                      : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <span className="text-sm font-bold font-mono">
                    {opt.weightKg} kg
                  </span>
                  <span className="text-xs leading-tight line-clamp-1">
                    {opt.shortName.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Input de Peso Total */}
        <div className="space-y-1.5 bg-secondary/30 p-3 rounded-xl border border-border/40">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground block">
              Peso Total en Barra (kg):
            </label>
            <span className="text-xs font-mono font-medium text-muted-foreground">
              Mínimo: {selectedBar} kg
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="2.5"
              min={selectedBar}
              value={weight}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                setWeight(
                  isNaN(parsed) ? selectedBar : Math.max(selectedBar, parsed),
                );
              }}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-center text-lg font-bold tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-target-weight"
            />
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={weight <= selectedBar}
                onClick={() => setWeight((w) => Math.max(selectedBar, w - 2.5))}
                data-testid="btn-decrement-weight"
              >
                -2.5
              </Button>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setWeight((w) => w + 2.5)}
                data-testid="btn-increment-weight"
              >
                +2.5
              </Button>
            </div>
          </div>
        </div>

        {/* Resumen por Lado y Normalización de Peso */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Carga Por Cada Lado:
          </span>
          <div
            className="text-3xl font-black font-mono text-primary"
            data-testid="per-side-weight"
          >
            {result.perSideWeightKg} kg
          </div>
          <p className="text-xs text-muted-foreground">
            (Barra: {result.barWeightKg} kg + {result.perSideWeightKg * 2} kg en discos = {result.totalWeightKg} kg total)
          </p>
          <div
            className="mt-2 pt-2 border-t border-primary/10 text-xs text-success font-medium flex items-center justify-center gap-1.5"
            data-testid="pr-normalization-badge"
          >
            <span>⚖️</span>
            <span>
              Peso real normalizado:{" "}
              <strong className="font-mono">{result.totalWeightKg} kg</strong>{" "}
              (protege PRs y tonelaje)
            </span>
          </div>
        </div>

        {/* Representación Visual de Discos por Lado */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Discos Exactos a Colocar por Lado:
          </p>

          {result.platesPerSide.length === 0 ? (
            <div
              className="p-4 text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border"
              data-testid="empty-plates-notice"
            >
              Solo la {activeBarOption.name.toLowerCase()} (sin discos adicionales).
            </div>
          ) : (
            <div className="space-y-1.5" data-testid="plates-list">
              {result.platesPerSide.map((p) => (
                <div
                  key={p.weight}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-background/50 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`inline-flex items-center justify-center font-bold font-mono px-2 py-0.5 rounded text-xs border shadow-xs ${getPlateColor(
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
            <p className="text-xs text-warning font-medium pt-1">
              ⚠️ Sobrante de {result.remainderKg} kg por lado no divisible con discos disponibles.
            </p>
          )}
        </div>

        {/* Acciones del Modal */}
        <div className="pt-2 border-t border-border/60 flex flex-col gap-2">
          {onApplyWeight && (
            <Button
              className="w-full font-bold h-12 text-sm shadow-md"
              onClick={() => {
                onApplyWeight(result.totalWeightKg);
                onClose();
              }}
              data-testid="transferir-peso-btn"
            >
              Transferir {result.totalWeightKg} kg a la serie
            </Button>
          )}
          <Button
            variant={onApplyWeight ? "outline" : "default"}
            className="w-full"
            onClick={onClose}
            data-testid="close-plate-calculator-btn"
          >
            {onApplyWeight
              ? "Cancelar / Volver"
              : "Entendido, volver al entrenamiento"}
          </Button>
        </div>
      </div>
    </div>
  );
}
