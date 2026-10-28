"use client";

import * as React from "react";
import type { Clase, Reserva } from "@/types/database.types";
import type { DiaSemana } from "@/lib/clases";
import { detectarSolapes, ocupaCupo } from "@/lib/clases";
import { ClaseBlock } from "@/components/coach/clase-block";

export interface ClassAgendaWeekProps {
  dias: DiaSemana[];
  clases: Clase[];
  reservas: Array<Reserva & { alumno_nombre?: string }>;
  hoyClave: string;
  ahoraMs?: number;
  claseSeleccionadaId?: string | null;
  onSelectClase?: (clase: Clase) => void;
  onSelectDia?: (diaClave: string) => void;
  className?: string;
}

const H = 56; // Altura de hora estándar (56px)
const C = 36; // Altura de la banda colapsada (36px)
const PAD = 8; // Respiro superior

export function ClassAgendaWeek({
  dias,
  clases,
  reservas,
  hoyClave,
  ahoraMs = Date.now(),
  claseSeleccionadaId,
  onSelectClase,
  onSelectDia,
  className = "",
}: ClassAgendaWeekProps) {
  const [bandaColapsada, setBandaColapsada] = React.useState(true);

  // Función de mapeo de hora a posición Y (px)
  const calcY = React.useCallback(
    (h: number) => {
      if (!bandaColapsada) {
        return PAD + (h - 7) * H;
      }
      // Colapsa el tramo de 12:00 a 17:00 (5 horas sin clases en el horario habitual)
      if (h <= 12) {
        return PAD + (h - 7) * H;
      }
      if (h < 17) {
        return PAD + 5 * H + ((h - 12) / 5) * C;
      }
      return PAD + 5 * H + C + (h - 17) * H;
    },
    [bandaColapsada]
  );

  // Altura total del contenedor de grilla
  const totalGridHeight = React.useMemo(() => {
    return calcY(21.5) + PAD;
  }, [calcY]);

  // Lista de horas a mostrar en el eje
  const horasEje = React.useMemo(() => {
    if (!bandaColapsada) {
      return [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
    }
    return [7, 8, 9, 10, 11, 12, 17, 18, 19, 20, 21];
  }, [bandaColapsada]);

  // Ocupación por clase
  const getOcupacion = (id: string) =>
    reservas.filter((r) => r.clase_id === id && ocupaCupo(r)).length;

  const getEnEspera = (id: string) =>
    reservas.filter((r) => r.clase_id === id && r.estado === "EN_ESPERA").length;

  // Hora actual decimal
  const ahoraDate = new Date(ahoraMs);
  const horaActualDec = ahoraDate.getHours() + ahoraDate.getMinutes() / 60;
  const hoyIndex = dias.findIndex((d) => d.clave === hoyClave);

  return (
    <div className={`flex flex-col bg-card select-none ${className}`}>
      {/* Cabecera de días (7 columnas) */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border text-xs sm:text-sm bg-card sticky top-0 z-20">
        <div className="border-r border-border" />
        {dias.map((d, idx) => {
          const esHoy = d.clave === hoyClave;
          const esFinDeSemana = idx >= 5;
          return (
            <button
              key={d.clave}
              type="button"
              onClick={() => onSelectDia?.(d.clave)}
              className={`border-r border-border px-2 py-2.5 text-center transition-colors hover:bg-muted/50 ${
                esHoy ? "bg-primary/5" : esFinDeSemana ? "bg-muted/30" : ""
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <span
                  className={`text-xs uppercase font-medium ${
                    esHoy ? "text-primary font-bold" : "text-muted-foreground"
                  }`}
                >
                  {d.etiqueta}
                </span>
                {esHoy ? (
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary px-1 font-mono font-bold text-xs text-primary-foreground shadow-xs">
                    {d.numero}
                  </span>
                ) : (
                  <span className="font-mono font-semibold text-foreground">
                    {d.numero}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Contenedor con grilla horaria */}
      <div className="relative overflow-x-auto overflow-y-hidden" style={{ minHeight: `${totalGridHeight}px` }}>
        <div className="grid grid-cols-[56px_repeat(7,1fr)] relative" style={{ height: `${totalGridHeight}px` }}>
          {/* Eje de Horas */}
          <div className="relative border-r border-border font-mono text-[11px] text-muted-foreground bg-card">
            {horasEje.map((h) => {
              const top = calcY(h);
              const horaStr = `${String(h).padStart(2, "0")}:00`;
              return (
                <div
                  key={h}
                  style={{ top: `${top - 7}px` }}
                  className="absolute right-2 leading-none tabular-nums text-[10px] sm:text-[11px]"
                >
                  {horaStr}
                </div>
              );
            })}

            {/* Botón de banda colapsada */}
            {bandaColapsada ? (
              <button
                type="button"
                onClick={() => setBandaColapsada(false)}
                style={{ top: `${calcY(12) + 6}px` }}
                className="absolute left-1 right-1 text-[10px] leading-tight text-primary underline underline-offset-2 font-sans text-center hover:opacity-80"
                title="Expandir horas sin clases"
              >
                +5 h<br />sin clases
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setBandaColapsada(true)}
                style={{ top: `${calcY(12) + 2}px` }}
                className="absolute left-1 right-1 text-[9px] leading-tight text-muted-foreground underline underline-offset-2 font-sans text-center hover:opacity-80"
                title="Colapsar horas sin clases"
              >
                Colapsar
              </button>
            )}
          </div>

          {/* Columnas de los 7 días */}
          {dias.map((d, colIndex) => {
            const esHoy = d.clave === hoyClave;
            const esFinDeSemana = colIndex >= 5;
            const clasesDia = clases.filter((c) => c.inicio.slice(0, 10) === d.clave);
            const solapes = detectarSolapes(clasesDia);

            return (
              <div
                key={d.clave}
                className={`relative border-r border-border ${
                  esHoy ? "bg-primary/[0.03]" : esFinDeSemana ? "bg-muted/20" : ""
                }`}
              >
                {/* Líneas divisorias horizontales por cada hora */}
                {horasEje.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-border/50"
                    style={{ top: `${calcY(h)}px` }}
                  />
                ))}

                {/* Banda colapsada visual (12:00 - 17:00) */}
                {bandaColapsada && (
                  <div
                    className="absolute inset-x-0 border-y border-dashed border-border/70 bg-[repeating-linear-gradient(135deg,hsl(var(--muted))_0_6px,hsl(var(--card))_6px_12px)] pointer-events-none"
                    style={{
                      top: `${calcY(12)}px`,
                      height: `${C}px`,
                    }}
                  />
                )}

                {/* Línea de "Ahora" (solo en la columna de hoy) */}
                {esHoy && horaActualDec >= 7 && horaActualDec <= 21.5 && (
                  <div
                    className="absolute left-0 right-0 z-30 h-0.5 bg-primary pointer-events-none"
                    style={{ top: `${calcY(horaActualDec)}px` }}
                  >
                    <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
                  </div>
                )}

                {/* Bloques de clases del día */}
                {clasesDia.map((c) => {
                  const inicioDate = new Date(c.inicio);
                  const horaDec = inicioDate.getHours() + inicioDate.getMinutes() / 60;
                  const duracionH = (c.duracion_minutos || 60) / 60;
                  const top = calcY(horaDec) + 2;
                  const bottom = calcY(horaDec + duracionH);
                  const height = Math.max(38, bottom - top - 4);
                  const solape = solapes.get(c.id);

                  return (
                    <ClaseBlock
                      key={c.id}
                      clase={c}
                      ocupados={getOcupacion(c.id)}
                      enEspera={getEnEspera(c.id)}
                      activa={claseSeleccionadaId === c.id}
                      ahoraMs={ahoraMs}
                      solape={solape}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                      }}
                      onSelect={onSelectClase}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
