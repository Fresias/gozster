"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface PainReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName: string;
  setNumber: number;
  onSavePainReport: (notes: string) => void;
}

const BODY_PARTS = [
  "Espalda Baja / Lumbar",
  "Hombro",
  "Rodilla",
  "Codo",
  "Muñeca",
  "Cadera",
  "Cuello / Cervical",
  "Tobillo",
  "Pectoral / Tendón",
];

export function PainReportModal({
  isOpen,
  onClose,
  exerciseName,
  setNumber,
  onSavePainReport,
}: PainReportModalProps) {
  const [selectedPart, setSelectedPart] = React.useState<string>(
    BODY_PARTS[0] || "Espalda Baja / Lumbar"
  );
  const [severity, setSeverity] = React.useState<"LEVE" | "MODERADO" | "AGUDO">("MODERADO");
  const [additionalNotes, setAdditionalNotes] = React.useState("");

  if (!isOpen) return null;

  const handleConfirm = () => {
    const reportText = `[Dolor: ${severity}] ${selectedPart}${
      additionalNotes.trim() ? ` - ${additionalNotes.trim()}` : ""
    }`;
    onSavePainReport(reportText);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in"
      data-testid="pain-report-modal"
    >
      <div className="w-full max-w-md rounded-2xl border border-destructive/40 bg-card p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive text-lg">
              ⚠️
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Reportar Molestia o Dolor Articular
              </h2>
              <p className="text-xs text-muted-foreground">
                {exerciseName} • Serie {setNumber}
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

        {/* Severidad */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground block">
            Nivel de Molestia:
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["LEVE", "MODERADO", "AGUDO"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                  severity === s
                    ? "bg-destructive text-destructive-foreground border-destructive shadow-sm"
                    : "bg-secondary text-secondary-foreground border-border/60 hover:bg-secondary/80"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Zona Corporal */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground block">
            Zona Afectada:
          </label>
          <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
            {BODY_PARTS.map((part) => (
              <button
                key={part}
                type="button"
                onClick={() => setSelectedPart(part)}
                className={`px-2.5 py-1.5 text-[11px] rounded-lg border text-left font-medium transition-all ${
                  selectedPart === part
                    ? "bg-primary/20 text-primary border-primary font-bold"
                    : "bg-secondary/40 text-muted-foreground border-border/40 hover:bg-secondary/80"
                }`}
              >
                {part}
              </button>
            ))}
          </div>
        </div>

        {/* Detalle adicional */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground block">
            Detalle adicional para el Coach (opcional):
          </label>
          <textarea
            rows={2}
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="Ej: Pinchazo en la fase concéntrica al subir..."
            className="w-full rounded-lg border border-input bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Acciones */}
        <div className="flex gap-2 pt-2 border-t border-border/60">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
            onClick={handleConfirm}
            data-testid="submit-pain-report-btn"
          >
            ✓ Alertar al Coach
          </Button>
        </div>
      </div>
    </div>
  );
}
