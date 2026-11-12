"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export interface PainReportData {
  exerciseId?: string;
  exerciseName?: string;
  setNumber?: number;
  zonaArticular: "HOMBRO" | "RODILLA" | "LUMBAR" | "CODO" | "CUELLO" | "CADERA" | "TOBILLO" | "OTRO";
  severidad: "LEVE" | "MODERADO" | "AGUDO";
  intensidadNumerica: number;
  momentoAparicion: "CALENTAMIENTO" | "EN_SERIE" | "POST_EJERCICIO";
  sintomasAlarma: string[];
  esSintomaAlarma: boolean;
  notasAlumno: string;
}

export interface PainReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName?: string;
  exerciseId?: string;
  setNumber?: number;
  onSavePainReport: (report: PainReportData | string) => void;
}

export const JOINT_ZONES: Array<{ id: PainReportData["zonaArticular"]; label: string }> = [
  { id: "HOMBRO", label: "Hombro" },
  { id: "RODILLA", label: "Rodilla" },
  { id: "LUMBAR", label: "Espalda Baja / Lumbar" },
  { id: "CODO", label: "Codo" },
  { id: "CUELLO", label: "Cuello / Cervical" },
  { id: "CADERA", label: "Cadera" },
  { id: "TOBILLO", label: "Tobillo" },
  { id: "OTRO", label: "Otro" },
];

export const MOMENTOS_APARICION: Array<{
  id: PainReportData["momentoAparicion"];
  label: string;
}> = [
  { id: "CALENTAMIENTO", label: "Calentamiento" },
  { id: "EN_SERIE", label: "Durante la Serie" },
  { id: "POST_EJERCICIO", label: "Post-Ejercicio" },
];

export const RED_FLAG_SYMPTOMS = [
  { id: "Dolor punzante/súbito", label: "Dolor punzante/súbito" },
  { id: "Irradiación/adormecimiento", label: "Irradiación/adormecimiento" },
  { id: "Mareo/falta de aire", label: "Mareo/falta de aire" },
  { id: "Inestabilidad articular", label: "Inestabilidad articular" },
] as const;

export function PainReportModal({
  isOpen,
  onClose,
  exerciseName = "Sesión General",
  exerciseId,
  setNumber = 1,
  onSavePainReport,
}: PainReportModalProps) {
  const [zonaArticular, setZonaArticular] = React.useState<PainReportData["zonaArticular"]>("RODILLA");
  const [intensidad, setIntensidad] = React.useState<number>(5);
  const [momentoAparicion, setMomentoAparicion] =
    React.useState<PainReportData["momentoAparicion"]>("EN_SERIE");
  const [sintomasAlarma, setSintomasAlarma] = React.useState<string[]>([]);
  const [notasAlumno, setNotasAlumno] = React.useState<string>("");

  if (!isOpen) return null;

  // Derivar severidad de la escala numérica (1-3: LEVE, 4-6: MODERADO, 7-10: AGUDO)
  const severidad: "LEVE" | "MODERADO" | "AGUDO" =
    intensidad <= 3 ? "LEVE" : intensidad <= 6 ? "MODERADO" : "AGUDO";

  const isRedFlag = sintomasAlarma.length > 0 || severidad === "AGUDO" || intensidad >= 8;

  const toggleSintomaAlarma = (sintoma: string) => {
    setSintomasAlarma((prev) =>
      prev.includes(sintoma) ? prev.filter((s) => s !== sintoma) : [...prev, sintoma]
    );
  };

  const handleConfirm = () => {
    const data: PainReportData = {
      exerciseId,
      exerciseName,
      setNumber,
      zonaArticular,
      severidad,
      intensidadNumerica: intensidad,
      momentoAparicion,
      sintomasAlarma,
      esSintomaAlarma: isRedFlag,
      notasAlumno: notasAlumno.trim(),
    };

    onSavePainReport(data);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pain-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in"
      data-testid="pain-report-modal"
    >
      <div className="w-full max-w-lg rounded-2xl border border-destructive/40 bg-card p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Cabecera del Modal */}
        <div className="flex items-start justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive text-lg font-bold border border-destructive/30">
              ⚠️
            </span>
            <div>
              <h2
                id="pain-report-title"
                className="text-base sm:text-lg font-bold text-foreground"
              >
                Reportar Molestia o Dolor Articular
              </h2>
              <p className="text-xs text-muted-foreground">
                {exerciseName} • Serie {setNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm font-bold p-1 rounded-lg hover:bg-secondary/60 transition-colors"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Zona Corporal */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground block">
            Zona Articular Afectada:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {JOINT_ZONES.map((zone) => {
              const isSelected = zonaArticular === zone.id;
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => setZonaArticular(zone.id)}
                  className={`px-2.5 py-2 text-xs rounded-xl border text-center font-semibold transition-all min-h-10 ${
                    isSelected
                      ? "bg-destructive text-destructive-foreground border-destructive shadow-xs font-bold"
                      : "bg-secondary/40 text-muted-foreground border-border/60 hover:bg-secondary/80 hover:text-foreground"
                  }`}
                  data-testid={`zona-btn-${zone.id.toLowerCase()}`}
                >
                  {zone.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Momento de Aparición */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-foreground block">
            Momento de Aparición:
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {MOMENTOS_APARICION.map((momento) => {
              const isSelected = momentoAparicion === momento.id;
              return (
                <button
                  key={momento.id}
                  type="button"
                  onClick={() => setMomentoAparicion(momento.id)}
                  className={`px-2 py-2 text-xs rounded-xl border text-center font-semibold transition-all min-h-10 ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                      : "bg-secondary/40 text-muted-foreground border-border/60 hover:bg-secondary/80 hover:text-foreground"
                  }`}
                  data-testid={`momento-btn-${momento.id.toLowerCase()}`}
                >
                  {momento.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Intensidad Percibida (Escala 1 a 10 con Severidad) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="pain-intensity-range" className="font-bold text-foreground">
              Intensidad Percibida:
            </label>
            <span
              className={`font-mono font-bold px-2 py-0.5 rounded-full text-xs ${
                severidad === "LEVE"
                  ? "bg-success-soft text-success border border-success-soft-border"
                  : severidad === "MODERADO"
                  ? "bg-warning-soft text-warning border border-warning-soft-border"
                  : "bg-destructive/20 text-destructive border border-destructive/30"
              }`}
              data-testid="pain-severity-badge"
            >
              {intensidad}/10 • {severidad}
            </span>
          </div>

          <div className="grid grid-cols-10 gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
              const isSelected = intensidad === val;
              const isHigh = val >= 7;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setIntensidad(val)}
                  className={`h-9 text-xs font-mono font-bold rounded-lg border transition-all ${
                    isSelected
                      ? isHigh
                        ? "bg-destructive text-destructive-foreground border-destructive shadow-sm"
                        : "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-secondary/40 text-muted-foreground border-border/60 hover:bg-secondary/80 hover:text-foreground"
                  }`}
                  data-testid={`intensity-chip-${val}`}
                >
                  {val}
                </button>
              );
            })}
          </div>
          <input
            id="pain-intensity-range"
            type="range"
            min="1"
            max="10"
            value={intensidad}
            onChange={(e) => setIntensidad(Number(e.target.value))}
            className="w-full accent-destructive cursor-pointer h-2 bg-secondary rounded-lg"
            aria-label="Escala de dolor de 1 a 10"
          />

          {/* Cartel según rango de intensidad (GOZS-278) */}
          <div className="pt-1" data-testid="pain-modal-range-guidance">
            {intensidad <= 3 && (
              <div
                className="rounded-xl border border-border/80 bg-secondary/40 p-3 text-xs space-y-0.5 text-foreground animate-in fade-in"
                data-testid="pain-modal-cartel-1-3"
              >
                <div className="flex items-center gap-2 font-bold">
                  <span>ℹ️</span>
                  <span>Aviso Neutro (Rango 1-3)</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Aviso neutro de que se notifica al coach, sin colores de alerta. Puedes continuar con precaución según tus sensaciones.
                </p>
              </div>
            )}

            {intensidad >= 4 && intensidad <= 6 && (
              <div
                className="rounded-xl border-2 border-warning-soft-border bg-warning-soft p-3 text-xs space-y-0.5 text-warning animate-in fade-in"
                data-testid="pain-modal-cartel-4-6"
              >
                <div className="flex items-center gap-2 font-bold">
                  <span>⚠️</span>
                  <span>Cartel Amarillo (Rango 4-6)</span>
                </div>
                <p className="text-xs font-semibold text-foreground leading-relaxed">
                  Cartel amarillo, recomienda reducir peso si continúa la molestia en las siguientes series.
                </p>
              </div>
            )}

            {intensidad >= 7 && intensidad <= 9 && (
              <div
                className="rounded-xl border-2 border-destructive bg-destructive/15 p-3 text-xs space-y-0.5 text-destructive animate-in fade-in"
                data-testid="pain-modal-cartel-7-9"
              >
                <div className="flex items-center gap-2 font-bold">
                  <span>🛑</span>
                  <span>Cartel Rojo a Prueba de Errores (Rango 7-9)</span>
                </div>
                <p className="text-xs font-bold text-foreground leading-relaxed">
                  Cartel rojo a prueba de errores: suspender ese ejercicio y cualquiera que acentúe el dolor, seguir con lo que no moleste; no debe invitar a seguir.
                </p>
              </div>
            )}

            {intensidad === 10 && (
              <div
                className="rounded-xl border-2 border-destructive bg-destructive/20 p-3 text-xs space-y-0.5 text-destructive animate-in fade-in"
                data-testid="pain-modal-cartel-10"
              >
                <div className="flex items-center gap-2 font-bold">
                  <span>🚨</span>
                  <span>Cartel Rojo: Parada Total (Rango 10)</span>
                </div>
                <p className="text-xs font-bold text-foreground leading-relaxed">
                  Cartel rojo, cesar el entrenamiento y contactar al entrenador de inmediato.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Checkboxes de Síntomas de Alarma (Red Flags) */}
        <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🚩</span>
            <label className="text-xs font-black uppercase tracking-wider text-destructive">
              Síntomas de Alarma (Red Flags)
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Marca si experimentas alguno de estos síntomas críticos durante el ejercicio:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {RED_FLAG_SYMPTOMS.map((rf) => {
              const isChecked = sintomasAlarma.includes(rf.id);
              return (
                <label
                  key={rf.id}
                  className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                    isChecked
                      ? "border-destructive bg-destructive/20 text-destructive font-bold"
                      : "border-border/60 bg-card hover:bg-secondary/60 text-foreground"
                  }`}
                  data-testid={`red-flag-label-${rf.id}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSintomaAlarma(rf.id)}
                    className="h-4 w-4 rounded border-border accent-destructive focus:ring-destructive cursor-pointer"
                    data-testid={`red-flag-checkbox-${rf.id}`}
                  />
                  <span>{rf.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Protocolo de Freno: Cartel de advertencia médica ante Red Flags o Dolor Agudo */}
        {isRedFlag && (
          <div
            className="rounded-xl border-2 border-destructive bg-destructive/15 p-4 text-destructive space-y-2 animate-in fade-in"
            data-testid="protocolo-freno-alert"
          >
            <div className="flex items-center gap-2 font-black text-sm">
              <span className="text-xl">🛑</span>
              <span>PROTOCOLO DE FRENO POR SEGURIDAD MÉDICA</span>
            </div>
            <p className="text-xs font-bold leading-relaxed text-foreground">
              Te recomendamos frenar el entrenamiento por hoy y avisar inmediatamente al personal del gimnasio o a tu entrenador.
            </p>
            <p className="text-xs text-muted-foreground">
              Ante síntomas de alarma o dolor agudo, no se sugieren sustituciones automáticas sin supervisión presencial. Se enviará una alerta CRÍTICA a tu coach.
            </p>
          </div>
        )}

        {/* Detalle Adicional */}
        <div className="space-y-1">
          <label htmlFor="pain-notes-input" className="text-xs font-bold text-foreground block">
            Comentario opcional para el Coach:
          </label>
          <textarea
            id="pain-notes-input"
            rows={2}
            value={notasAlumno}
            onChange={(e) => setNotasAlumno(e.target.value)}
            placeholder="Ej: Pinchazo en la cara anterior del hombro al descender..."
            className="w-full rounded-xl border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            data-testid="pain-notes-input"
          />
        </div>

        {/* Acciones del Modal */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 sm:flex-1 text-xs font-semibold"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className={`min-h-11 sm:flex-1 text-xs font-bold transition-all shadow-xs ${
              isRedFlag
                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground animate-pulse"
                : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            }`}
            onClick={handleConfirm}
            data-testid="submit-pain-report-btn"
          >
            {isRedFlag ? "🛑 Frenar y Enviar Alerta CRÍTICA" : "✓ Alertar al Coach"}
          </Button>
        </div>
      </div>
    </div>
  );
}
