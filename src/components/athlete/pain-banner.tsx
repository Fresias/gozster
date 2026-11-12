"use client";

import * as React from "react";
import { X, TriangleAlert, OctagonAlert } from "@/components/athlete/icons";

export type PainBannerRange = "1-3" | "4-6" | "7-9" | "10";

export interface PainBannerData {
  range: PainBannerRange;
  intensidadNumerica: number;
  title: string;
  message: string;
  recommendation: string;
  variant: "neutral" | "warning" | "destructive";
  testId: string;
  exerciseName?: string;
  timestamp: number;
}

export function getPainBannerConfig(
  intensidadNumerica: number,
  options?: {
    exerciseName?: string;
    sintomasAlarma?: string[];
  }
): PainBannerData {
  const roundedIntensidad = Math.max(1, Math.min(10, Math.round(intensidadNumerica || 1)));

  if (roundedIntensidad <= 3) {
    return {
      range: "1-3",
      intensidadNumerica: roundedIntensidad,
      title: "Aviso de Molestia Leve (Rango 1-3)",
      message: "Aviso neutro de que se notifica al coach, sin colores de alerta.",
      recommendation:
        "Se ha registrado el reporte y se notifica al coach. Puedes continuar con precaución según tus sensaciones.",
      variant: "neutral",
      testId: "pain-banner-range-1-3",
      exerciseName: options?.exerciseName,
      timestamp: Date.now(),
    };
  }

  if (roundedIntensidad <= 6) {
    return {
      range: "4-6",
      intensidadNumerica: roundedIntensidad,
      title: "Cartel Amarillo: Molestia Moderada (Rango 4-6)",
      message: "Cartel amarillo, recomienda reducir peso si continúa.",
      recommendation:
        "Se notificó a tu coach. Se recomienda reducir peso si continúa la molestia en las próximas series.",
      variant: "warning",
      testId: "pain-banner-range-4-6",
      exerciseName: options?.exerciseName,
      timestamp: Date.now(),
    };
  }

  if (roundedIntensidad <= 9) {
    return {
      range: "7-9",
      intensidadNumerica: roundedIntensidad,
      title: "Cartel Rojo a Prueba de Errores: Suspender Ejercicio (Rango 7-9)",
      message:
        "Cartel rojo a prueba de errores: suspender ese ejercicio y cualquiera que acentúe el dolor, seguir con lo que no moleste; no debe invitar a seguir.",
      recommendation:
        "Debes suspender de forma inequívoca este ejercicio y cualquiera que acentúe el dolor. Puedes seguir con lo que no moleste; no continúes con ningún ejercicio que acentúe el dolor.",
      variant: "destructive",
      testId: "pain-banner-range-7-9",
      exerciseName: options?.exerciseName,
      timestamp: Date.now(),
    };
  }

  // roundedIntensidad === 10
  return {
    range: "10",
    intensidadNumerica: 10,
    title: "Cartel Rojo: Cesar Entrenamiento Inmediatamente (Rango 10)",
    message: "Cartel rojo, cesar el entrenamiento y contactar al entrenador.",
    recommendation:
      "Debes cesar el entrenamiento de inmediato y contactar al entrenador. Detén por completo la sesión por tu seguridad; es una indicación inequívoca sobre detenerse.",
    variant: "destructive",
    testId: "pain-banner-range-10",
    exerciseName: options?.exerciseName,
    timestamp: Date.now(),
  };
}

export interface PainReportBannerProps {
  banner: PainBannerData;
  onDismiss?: () => void;
  className?: string;
}

export function PainReportBanner({ banner, onDismiss, className = "" }: PainReportBannerProps) {
  const isNeutral = banner.variant === "neutral";
  const isWarning = banner.variant === "warning";
  const isDestructive = banner.variant === "destructive";

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className={`rounded-2xl p-4 space-y-2 animate-in fade-in duration-300 transition-all ${
        isNeutral
          ? "border border-border/80 bg-secondary/50 text-foreground"
          : isWarning
          ? "border-2 border-warning-soft-border bg-warning-soft text-warning"
          : "border-2 border-destructive bg-destructive/15 text-destructive"
      } ${className}`}
      data-testid={banner.testId}
      id={banner.testId}
      data-range={banner.range}
      data-variant={banner.variant}
    >
      <div data-testid="pain-report-banner" className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl shrink-0" aria-hidden="true">
              {isNeutral ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-foreground text-xs font-bold border border-border">
                  ℹ️
                </span>
              ) : isWarning ? (
                <TriangleAlert className="h-6 w-6 text-warning shrink-0" />
              ) : (
                <OctagonAlert className="h-6 w-6 text-destructive shrink-0" />
              )}
            </span>
            <div>
              <h4
                className={`text-sm font-black leading-tight ${
                  isNeutral
                    ? "text-foreground"
                    : isWarning
                    ? "text-warning"
                    : "text-destructive"
                }`}
                data-testid="pain-banner-title"
              >
                {banner.title}
              </h4>
              {banner.exerciseName && (
                <p className="text-xs text-muted-foreground font-medium">
                  {banner.exerciseName} • Intensidad {banner.intensidadNumerica}/10
                </p>
              )}
            </div>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-secondary/60 transition-colors touch-manipulation cursor-pointer"
              aria-label="Cerrar aviso de dolor"
              data-testid="dismiss-pain-banner-btn"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="space-y-1 text-xs">
          <p
            className={`font-bold ${
              isNeutral
                ? "text-foreground"
                : isWarning
                ? "text-warning"
                : "text-destructive font-black"
            }`}
            data-testid="pain-banner-message"
          >
            {banner.message}
          </p>
          <p
            className="text-muted-foreground text-xs leading-relaxed"
            data-testid="pain-banner-recommendation"
          >
            {banner.recommendation}
          </p>
        </div>
      </div>
    </aside>
  );
}
