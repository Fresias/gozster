"use client";

import * as React from "react";
import { Trophy, Flame, Check, ArrowLeft, X, TrendingUp } from "@/components/athlete/icons";
import { Tooltip1RM } from "@/components/athlete/tooltip-1rm";

export interface RecordSesionItem {
  exerciseName: string;
  peso_kg: number;
  reps_hechas: number;
  tipo?: "peso" | "reps" | null;
  epley_kg?: number | null;
  delta_epley_kg?: number | null;
  numero_serie?: number;
}

export interface CierreDiaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVolverInicio?: () => void;
  tonelajeKg: number;
  seriesCompletadas: number;
  totalSeries: number;
  duracionMinutos?: number;
  duracionTexto?: string;
  rachaDias?: number;
  rachaPrevia?: number;
  metaDiasSemana?: number;
  diasCompletadosSemana?: number;
  recordsObtenidos?: RecordSesionItem[];
  studentName?: string;
  diaNombre?: string;
}

export function CierreDiaModal({
  isOpen,
  onClose,
  onVolverInicio,
  tonelajeKg,
  seriesCompletadas,
  totalSeries,
  duracionMinutos = 45,
  duracionTexto,
  rachaDias = 1,
  rachaPrevia = 0,
  metaDiasSemana = 3,
  diasCompletadosSemana = 1,
  recordsObtenidos = [],
  studentName = "Fernando",
  diaNombre = "Día 1",
}: CierreDiaModalProps) {
  // Manejo de tecla Escape
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tiempoTexto = duracionTexto || `${duracionMinutos} min`;

  const handleActionVolver = () => {
    if (onVolverInicio) {
      onVolverInicio();
    } else {
      onClose();
    }
  };

  const hasRecords = recordsObtenidos && recordsObtenidos.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cierre-dia-title"
      data-testid="cierre-dia-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 sm:p-6 backdrop-blur-md overflow-y-auto"
    >
      {/* Estilos CSS scoped con soporte estricto de prefers-reduced-motion: reduce */}
      <style>{`
        @keyframes celebrationPop {
          0% { transform: scale(0.92); opacity: 0; }
          60% { transform: scale(1.02); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes celebrationGlow {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
        @keyframes subtleFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        .celebration-pop {
          animation: celebrationPop 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .celebration-glow {
          animation: celebrationGlow 3s ease-in-out infinite;
        }
        .celebration-float {
          animation: subtleFloat 2.5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .celebration-pop,
          .celebration-glow,
          .celebration-float,
          .celebration-confetti-item {
            animation: none !important;
            transform: none !important;
            transition: none !important;
          }
        }
      `}</style>

      <div
        className="relative w-full max-w-md my-auto rounded-3xl border border-border bg-card p-5 sm:p-6 shadow-2xl space-y-5 text-center celebration-pop motion-reduce:animate-none"
        data-testid="cierre-dia-card"
      >
        {/* Botón cerrar sutil en esquina */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar modal"
          data-testid="cierre-dia-close-btn"
          className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-95 transition-all touch-manipulation cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Celebración Visual / Header */}
        <div className="pt-2 space-y-2">
          <div className="relative inline-flex items-center justify-center">
            {/* Resplandor decorativo con soporte reduced-motion */}
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl celebration-glow motion-reduce:animate-none" />
            <div className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl sm:rounded-3xl bg-gradient-to-tr from-primary/20 to-primary/5 border border-primary/30 text-primary shadow-inner celebration-float motion-reduce:animate-none">
              <Trophy className="h-9 w-9 sm:h-11 sm:w-11 text-primary" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
              <Check className="h-3.5 w-3.5" />
              <span>Sesión Guardada y Sincronizada</span>
            </div>
            <h2
              id="cierre-dia-title"
              className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground font-outfit"
              data-testid="cierre-dia-titulo"
            >
              ¡Gran entrenamiento, {studentName.split(" ")[0]}!
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Completaste tu sesión de <span className="font-semibold text-foreground">{diaNombre}</span>
            </p>
          </div>
        </div>

        {/* Resumen de Sesión Destacado: Series completadas y Duración (Poda de Tonelaje kg según GOZS-359) */}
        <div
          className="rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent p-4 sm:p-5 shadow-sm space-y-3"
          data-testid="hero-metric-summary-card"
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-background/80 p-3 border border-border/60 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Series
              </span>
              <span
                className="text-lg sm:text-xl font-black font-mono text-foreground"
                data-testid="hero-metric-series"
              >
                {`${seriesCompletadas}/${totalSeries}`}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                100% completadas
              </span>
            </div>

            <div className="rounded-xl bg-background/80 p-3 border border-border/60 text-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                Tiempo
              </span>
              <span
                className="text-lg sm:text-xl font-black font-mono text-foreground"
                data-testid="hero-metric-tiempo"
              >
                {tiempoTexto}
              </span>
              <span className="text-[10px] text-muted-foreground block">
                Duración de sesión
              </span>
            </div>
          </div>
        </div>

        {/* Racha Semanal & Impacto en Ranking de Constancia (ADR-003) */}
        <div className="space-y-2.5 text-left">
          {/* Card de Racha Semanal */}
          <div
            className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-amber-500/25 bg-amber-500/10 shadow-xs"
            data-testid="cierre-dia-racha-card"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500 text-xl border border-amber-500/30">
                <Flame className="h-6 w-6 text-amber-500" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">
                    Racha Semanal:
                  </span>
                  <span
                    className="text-xs font-black text-amber-500 font-mono"
                    data-testid="racha-dias-valor"
                  >
                    {`${rachaDias} ${rachaDias === 1 ? "día" : "días"}`}
                  </span>
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                    data-testid="racha-incremento-badge"
                  >
                    +1 día hoy
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground" data-testid="meta-semanal-avance">
                  {`Día ${diasCompletadosSemana} de ${metaDiasSemana} completados esta semana`}
                </p>
              </div>
            </div>

            {/* Visualizador de progreso semanal */}
            <div className="flex gap-1 shrink-0" aria-label="Progreso días de la semana">
              {Array.from({ length: metaDiasSemana }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2.5 w-2 rounded-full transition-colors ${
                    i < diasCompletadosSemana
                      ? "bg-amber-500 shadow-xs"
                      : "bg-border"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Ranking de Constancia del Gimnasio (ADR-003: sin toxicidad competitiva) */}
          <div
            className="flex items-start gap-2.5 p-3 rounded-2xl border border-border/80 bg-secondary/30 text-xs"
            data-testid="cierre-dia-ranking-constancia"
          >
            <TrendingUp className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-foreground block">
                Impacto en Ranking de Constancia
              </span>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Mantener una buena racha tendrá su recompensa.
              </p>
            </div>
          </div>
        </div>

        {/* Sección de Nuevos Récords Personales (PRs) con distintivo dorado */}
        {hasRecords && (
          <div
            className="space-y-2 text-left pt-1"
            data-testid="cierre-dia-prs-section"
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className="text-amber-500 text-sm">🏆</span>
                <span>Nuevos Récords Personales (PRs)</span>
              </span>
              <span className="text-[10px] font-bold text-amber-500 uppercase font-mono">
                {`${recordsObtenidos.length} ${recordsObtenidos.length === 1 ? "récord" : "récords"}`}
              </span>
            </div>

            <div className="space-y-2">
              {recordsObtenidos.map((rec, idx) => (
                <div
                  key={`${rec.exerciseName}-${idx}`}
                  data-testid={`cierre-dia-pr-item-${idx}`}
                  className="flex items-center justify-between p-3 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-400/10 to-amber-500/15 shadow-xs"
                >
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-foreground block">
                      {rec.exerciseName}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono inline-flex items-center gap-1">
                      <span>{`${rec.peso_kg} kg × ${rec.reps_hechas} reps`}</span>
                      {rec.epley_kg && rec.epley_kg > 0 ? (
                        <>
                          <span>{`· 1RM ~${rec.epley_kg} kg`}</span>
                          <Tooltip1RM size="sm" />
                        </>
                      ) : null}
                    </span>
                  </div>

                  {/* Distintivo dorado */}
                  <span
                    data-testid={`cierre-dia-pr-badge-${idx}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 border border-amber-300 shadow-xs tracking-wider"
                  >
                    <span>🏆</span>
                    <span>PR</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botón Principal Ergonómico: Volver a /athlete */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleActionVolver}
            data-testid="cierre-dia-volver-athlete-btn"
            className="w-full min-h-[56px] py-3.5 px-6 rounded-2xl text-base font-extrabold bg-primary text-primary-foreground shadow-xl hover:brightness-105 active:scale-[0.98] transition-all touch-manipulation cursor-pointer flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Volver a Inicio (/athlete)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
