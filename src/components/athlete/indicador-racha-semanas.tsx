"use client";

import * as React from "react";
import { RachaFlama, nivelRachaFlama } from "@/components/athlete/icons";

export interface IndicadorRachaSemanasProps {
  semanas: number;
  initialPopoverOpen?: boolean;
  descripcion?: string;
}

const DESCRIPCION_DEFAULT =
  "Sumás racha completando al menos 1 sesión por semana. La semana en curso no corta tu racha mientras siga abierta.";

/**
 * Indicador compacto de racha semanal con Flama Geométrica Progresiva (Opción B)
 * y popover accesible explicativo al tocar.
 */
export function IndicadorRachaSemanas({
  semanas,
  initialPopoverOpen = false,
  descripcion = DESCRIPCION_DEFAULT,
}: IndicadorRachaSemanasProps) {
  const [popoverOpen, setPopoverOpen] = React.useState(initialPopoverOpen);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const nivel = nivelRachaFlama(semanas);

  React.useEffect(() => {
    if (!popoverOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      const isNode = typeof Node !== "undefined" ? target instanceof Node : Boolean(target);
      if (wrapRef.current && isNode && !wrapRef.current.contains(target as Node)) {
        setPopoverOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPopoverOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [popoverOpen]);

  return (
    <div ref={wrapRef} className="a-racha-wrap">
      <button
        ref={buttonRef}
        type="button"
        className="a-racha-btn"
        data-testid="racha-semanas-chip"
        data-level={nivel}
        aria-label={`Racha de ${semanas} ${semanas === 1 ? "semana" : "semanas"}`}
        aria-expanded={popoverOpen}
        aria-haspopup="dialog"
        onClick={() => setPopoverOpen((prev) => !prev)}
      >
        <RachaFlama semanas={semanas} width={15} height={15} className="a-i" />
        <span>{semanas} SEM</span>
      </button>

      {popoverOpen && (
        <div
          role="dialog"
          aria-label="Detalle de racha semanal"
          className="a-racha-popover"
          data-testid="racha-popover"
        >
          <b className="a-t-bs block">
            {semanas} {semanas === 1 ? "semana consecutiva" : "semanas consecutivas"}
          </b>
          <small className="a-t-sec a-muted">{descripcion}</small>
        </div>
      )}
    </div>
  );
}
