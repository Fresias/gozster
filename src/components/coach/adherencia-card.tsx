"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  badgeAdherencia,
  formatearPromedio,
  type Adherencia,
  type EstadoCelda,
  type SemanaAdherencia,
} from "@/lib/adherencia";

// Estados de la tarjeta (§5.6). "listo" se refina según el alumno tenga o no sesiones.
export type EstadoAdherencia = "cargando" | "listo" | "error";

export interface AdherenciaCardProps {
  estado: EstadoAdherencia;
  data: Adherencia | null;
  onReintentar?: () => void;
}

const CELDA_BASE = "h-3 w-3 rounded-[3px]";
const CELDA_CLASE: Record<EstadoCelda, string> = {
  entreno: "bg-primary",
  "no-entreno": "bg-surface-container",
  "antes-primera": "border border-dashed border-border bg-transparent",
  futuro: "bg-transparent",
};

// §5.4: color del número de sesiones por semana.
function claseNumero(w: SemanaAdherencia, objetivo: number | null): string {
  if (w.antesPrimera) return "text-muted-foreground"; // "…"
  if (w.esActual) return "text-muted-foreground"; // actual (incompleta): nunca en rojo
  if (objetivo === null) return "text-foreground"; // sin objetivo: nada en rojo
  if (w.sesiones === 0) return "text-destructive"; // "—" magnitud cero
  if (w.cumplido) return "text-foreground";
  return "text-destructive font-bold"; // 0 < sesiones < objetivo
}

function Titulo() {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
      Adherencia · últimas 52 semanas
    </h3>
  );
}

function Grilla({ data }: { data: Adherencia }) {
  const ref = React.useRef<HTMLDivElement>(null);
  // §5.4: arrancar scrolleado al final para que siempre se vea la semana actual.
  React.useEffect(() => {
    if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, []);

  return (
    <div
      ref={ref}
      className="overflow-x-auto"
      role="img"
      aria-label={data.ariaLabel}
      data-testid="adherencia-grilla"
    >
      {/* Etiquetas de mes sobre la primera columna de cada mes */}
      <div className="grid grid-flow-col gap-[3px] w-max">
        {data.semanas.map((w, col) => {
          const etiqueta = data.meses.find((m) => m.col === col);
          return (
            <div key={`m-${w.lunes}`} className="relative h-4 w-3">
              {etiqueta && (
                <span className="absolute left-0 top-0 whitespace-nowrap text-[11px] text-muted-foreground">
                  {etiqueta.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* 364 celdas: columna = semana (vieja→nueva), fila = lunes→domingo */}
      <div className="grid grid-flow-col grid-rows-7 gap-[3px] w-max">
        {data.semanas.map((w) =>
          w.dias.map((d) => (
            <div
              key={d.fecha}
              title={d.title}
              className={cn(
                CELDA_BASE,
                CELDA_CLASE[d.estado],
                d.esHoy && "ring-1 ring-foreground/50 ring-offset-1 ring-offset-card",
              )}
            />
          )),
        )}
      </div>
      {/* Sesiones por semana, alineadas a cada columna */}
      <div className="mt-1 grid grid-flow-col gap-[3px] w-max">
        {data.semanas.map((w) => (
          <span
            key={`n-${w.lunes}`}
            className={cn("w-3 text-center font-mono text-[10px] tabular-nums", claseNumero(w, data.objetivo))}
          >
            {w.numeroTexto}
          </span>
        ))}
      </div>
    </div>
  );
}

function Leyenda() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1">
          <span className={cn(CELDA_BASE, "bg-primary")} aria-hidden="true" /> Entrenó
        </span>
        <span className="flex items-center gap-1">
          <span className={cn(CELDA_BASE, "bg-surface-container")} aria-hidden="true" /> No entrenó
        </span>
        <span className="flex items-center gap-1">
          <span className={cn(CELDA_BASE, "border border-dashed border-border")} aria-hidden="true" /> Antes de su
          primera sesión
        </span>
      </span>
      <span>Fuente: Registro GOZSter</span>
    </div>
  );
}

function Resumen({ data }: { data: Adherencia }) {
  const num = (s: string) => <span className="font-mono tabular-nums text-foreground">{s}</span>;
  return (
    <p className="mt-1 text-xs text-muted-foreground">
      Promedio 12 sem.: {num(formatearPromedio(data.promedio12))} ses/sem
      {data.objetivo !== null && <> (obj. {data.objetivo})</>}
      {data.objetivo !== null && data.semanasCumplidas !== null && (
        <>
          <span aria-hidden="true"> · </span>
          Semanas con objetivo cumplido: {num(`${data.semanasCumplidas} de ${data.semanasEvaluadas}`)}
        </>
      )}
    </p>
  );
}

// §5.6: estado vacío (alumno sin ninguna sesión): copy + grilla punteada al 40 %.
function Vacio() {
  return (
    <div className="relative" data-testid="adherencia-vacio">
      <div className="grid grid-flow-col grid-rows-7 gap-[3px] w-max opacity-40" aria-hidden="true">
        {Array.from({ length: 364 }, (_, i) => (
          <div key={i} className={cn(CELDA_BASE, "border border-dashed border-border bg-transparent")} />
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Todavía no registró entrenamientos. El calendario se completa con cada sesión.
      </p>
    </div>
  );
}

export function AdherenciaCard({ estado, data, onReintentar }: AdherenciaCardProps) {
  const badge =
    estado === "listo" && data ? badgeAdherencia(data.diasSinEntrenar, data.nuncaEntreno) : null;

  return (
    <Card data-testid="adherencia-card">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Titulo />
            {estado === "listo" && data && !data.nuncaEntreno && <Resumen data={data} />}
          </div>
          {badge && (
            <Badge
              variant={badge.variante}
              className={cn(badge.entrenoHoy && "text-emerald-700 dark:text-emerald-400")}
              data-testid="adherencia-badge"
            >
              {badge.texto}
            </Badge>
          )}
        </div>

        {estado === "cargando" && (
          <div
            className="h-[120px] w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none"
            data-testid="adherencia-cargando"
          />
        )}

        {estado === "error" && (
          <div className="space-y-3" data-testid="adherencia-error">
            <p className="text-sm text-muted-foreground">No se pudo cargar la adherencia.</p>
            <Button variant="outline" size="sm" className="min-h-11" onClick={onReintentar}>
              Reintentar
            </Button>
          </div>
        )}

        {estado === "listo" && data && (data.nuncaEntreno ? <Vacio /> : <Grilla data={data} />)}

        {estado === "listo" && data && !data.nuncaEntreno && <Leyenda />}
      </CardContent>
    </Card>
  );
}
