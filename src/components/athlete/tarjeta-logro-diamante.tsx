"use client";

import * as React from "react";
import { RachaFlama } from "@/components/athlete/icons";
import { especificacionRacha } from "@/lib/racha-flama";

export interface TarjetaLogroDiamanteProps {
  diamantes: number;
  semanas?: number;
}

/**
 * Tarjeta de logro permanente "Llama Diamante ×N" en el perfil/progreso del alumno.
 * No se pierde si la racha se corta después; si hay un ciclo 2+ activo, muestra el curso actual.
 */
export function TarjetaLogroDiamante({ diamantes, semanas = 0 }: TarjetaLogroDiamanteProps) {
  const spec = especificacionRacha(semanas, diamantes);
  if (spec.diamantes < 1) return null;

  return (
    <section
      className="grid gap-2"
      aria-label="Logro permanente Llama Diamante"
      data-testid="tarjeta-llama-diamante"
    >
      <div className="a-racha-perm-card" data-category="diamante" data-level="4">
        <div className="a-racha-perm-head">
          <div className="a-racha-perm-icon">
            <RachaFlama semanas={52} permanente width={54} height={54} className="a-i" />
          </div>
          <div className="min-w-0">
            <span className="a-racha-perm-eyebrow">Logro permanente</span>
            <h2 className="a-racha-perm-title">Llama Diamante ×{spec.diamantes}</h2>
            <p className="a-racha-perm-sub">
              52 semanas selladas · fija en máximo
            </p>
          </div>
        </div>
      </div>

      {spec.esChipDual && (
        <div
          className="a-card a-racha-ciclo-card"
          data-testid="tarjeta-racha-ciclo-actual"
          data-category={spec.categoria}
          data-level={spec.nivel}
        >
          <div className="flex items-center gap-3 min-w-0">
            <RachaFlama
              semanas={spec.semanaCiclo}
              width={36}
              height={36}
              className="a-i shrink-0"
            />
            <div className="min-w-0">
              <b className="a-t-bs block">
                Racha en curso · Ciclo {spec.cicloActual}
              </b>
              <p className="a-t-sec a-muted">
                {spec.etiquetaCategoria} · Semana {spec.semanaCiclo} ({spec.porcentajeLlenado}%)
              </p>
            </div>
          </div>
          <span
            className="a-racha-btn"
            data-category={spec.categoria}
            data-level={spec.nivel}
          >
            <RachaFlama semanas={spec.semanaCiclo} width={16} height={16} className="a-i" />
            <span>{spec.semanaCiclo} SEM</span>
          </span>
        </div>
      )}
    </section>
  );
}
