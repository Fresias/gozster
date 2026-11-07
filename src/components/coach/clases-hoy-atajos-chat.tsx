"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { claveDia, horaLocal } from "@/lib/clases";
import { useClasesStore } from "@/store/use-clases-store";
import { useCoachStudioStore } from "@/store/use-coach-studio";
import { generarDemoClasesSemana } from "@/services/coach-demo-dataset";
import type { Clase } from "@/types/database.types";
import { EmptyState } from "@/components/ui/empty-state";

export interface AlumnoRiesgoAbandono {
  id: string;
  nombreCompleto: string;
  diasSinEntrenar?: number;
}

export interface ClasesHoyAtajosChatProps {
  clases?: Clase[];
  reservas?: Array<{ clase_id: string; estado: string }>;
  fechaReferencia?: Date | string;
  alumnosSinEntrenar?: AlumnoRiesgoAbandono[];
  totalSinEntrenar?: number;
  /** En vivo nunca se completa con clases de demo (FIX-08). */
  isLiveMode?: boolean;
  onOpenChat?: (alumnoId: string, alumnoNombre: string) => void;
  className?: string;
}

const NOMBRES_DISCIPLINA: Record<string, string> = {
  FUNCIONAL: "Funcional",
  BOXEO: "Boxeo",
  FUERZA: "Fuerza y Acondicionamiento",
  RUTINAS: "Rutinas",
};

const getInitials = (nombre: string) =>
  nombre
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/**
 * Clases del día (no canceladas) ordenadas por hora. Fuente única para el bloque
 * "Clases de hoy" y para el subtítulo del saludo ("{n} clases hoy").
 */
export function useClasesDeHoy({
  clases: clasesProp,
  fechaReferencia,
  isLiveMode = false,
}: Pick<ClasesHoyAtajosChatProps, "clases" | "fechaReferencia" | "isLiveMode"> = {}) {
  const storeClases = useClasesStore((s) => s.clases);
  const testAhora = useClasesStore((s) => s.testAhora);

  const fechaBase = React.useMemo(() => {
    if (fechaReferencia) return new Date(fechaReferencia);
    if (testAhora) return new Date(testAhora);
    return new Date();
  }, [fechaReferencia, testAhora]);

  const hoyClave = claveDia(fechaBase);

  const clasesHoy = React.useMemo(() => {
    let lista: Clase[];
    if (clasesProp) lista = clasesProp;
    else if (storeClases.length > 0 || isLiveMode) lista = storeClases;
    else lista = generarDemoClasesSemana(fechaBase);
    return lista
      .filter((c) => claveDia(c.inicio) === hoyClave && c.estado !== "CANCELADA")
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [clasesProp, storeClases, isLiveMode, fechaBase, hoyClave]);

  return { clasesHoy, fechaBase };
}

/**
 * Bloque 'Clases de hoy' en Coach Studio (08 §4.1, objetivo Inicio.html).
 * - Cabecera con título 15 px y link "Ver agenda".
 * - Filas de 40 px: hora mono 13 px, clase, cupos "ocupados / capacidad"; la clase en curso
 *   lleva fondo muted y badge "Ahora".
 * - Pie con avatares apilados, "{n} sin entrenar hace +7 días" y "Escribirles" (solo si hay alumnos reales).
 */
export function ClasesHoyAtajosChat({
  clases: clasesProp,
  reservas: reservasProp,
  fechaReferencia,
  alumnosSinEntrenar: alumnosProp,
  totalSinEntrenar: totalSinEntrenarProp,
  isLiveMode = false,
  onOpenChat,
  className,
}: ClasesHoyAtajosChatProps) {
  const storeReservas = useClasesStore((s) => s.agendaReservas);
  const { clasesHoy, fechaBase } = useClasesDeHoy({ clases: clasesProp, fechaReferencia, isLiveMode });

  const contarOcupados = React.useCallback(
    (claseId: string) => {
      const lista = reservasProp ?? storeReservas;
      return lista.filter((r) => r.clase_id === claseId && r.estado === "ANOTADO").length;
    },
    [reservasProp, storeReservas]
  );

  const listaAlumnosSinEntrenar = alumnosProp ?? [];
  const sinEntrenarCount = totalSinEntrenarProp ?? listaAlumnosSinEntrenar.length;

  const abrirChat = (a: AlumnoRiesgoAbandono) => {
    if (onOpenChat) onOpenChat(a.id, a.nombreCompleto);
    else useCoachStudioStore.getState().openChatForAlumno(a.id);
  };

  return (
    <section
      aria-labelledby="clases-t"
      data-testid="clases-hoy-container"
      className={cn("rounded-xl border border-border bg-card flex flex-col overflow-hidden h-full", className)}
    >
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <h2 id="clases-t" className="text-[15px] font-semibold text-foreground m-0">
          Clases de hoy
        </h2>
        <Link
          href="/studio/agenda"
          className="text-[13px] text-foreground underline underline-offset-2 hover:text-muted-foreground"
        >
          Ver agenda
        </Link>
      </div>

      {clasesHoy.length === 0 ? (
        <EmptyState
          data-testid="clases-hoy-empty"
          title="Sin clases programadas para hoy."
          description="No hay actividades pautadas en la agenda de la jornada."
          className="py-6"
        />
      ) : (
        <div data-testid="clases-hoy-list" className="p-2 flex flex-col gap-1">
          {clasesHoy.map((c) => {
            const ocupados = contarOcupados(c.id);
            const disciplina = NOMBRES_DISCIPLINA[c.actividad] || c.actividad;
            const hora = horaLocal(c.inicio);
            const nowMs = fechaBase.getTime();
            const inicioMs = new Date(c.inicio).getTime();
            const finMs = inicioMs + (c.duracion_minutos || 60) * 60 * 1000;
            const esAhora = nowMs >= inicioMs && nowMs < finMs;

            return (
              <div
                key={c.id}
                data-testid="clase-hoy-card"
                className={cn(
                  "flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-foreground",
                  esAhora && "bg-muted"
                )}
              >
                <span className="font-mono text-[13px] w-11 tabular-nums">{hora}</span>
                <span className={cn("flex-1 min-w-0 truncate", esAhora && "font-medium")}>{disciplina}</span>
                {esAhora ? (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-background border border-border whitespace-nowrap">
                    Ahora
                  </span>
                ) : (
                  <span className="text-[13px] text-muted-foreground tabular-nums whitespace-nowrap">
                    {`${ocupados} / ${c.capacidad}`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sinEntrenarCount > 0 && listaAlumnosSinEntrenar.length > 0 && (
        <div
          data-testid="seccion-sin-entrenar"
          className="mt-auto px-4 py-3 border-t border-border flex items-center gap-2"
        >
          <div className="flex -space-x-1.5">
            {listaAlumnosSinEntrenar.slice(0, 3).map((a) => (
              <span
                key={a.id}
                title={a.nombreCompleto}
                className="inline-flex size-6 items-center justify-center rounded-full bg-muted border-2 border-card text-[10px] font-semibold text-foreground"
              >
                {getInitials(a.nombreCompleto)}
              </span>
            ))}
          </div>
          <span className="text-[13px] text-neutral-soft-foreground truncate">
            {sinEntrenarCount} sin entrenar hace +7 días
          </span>
          <button
            type="button"
            onClick={() => {
              const primero = listaAlumnosSinEntrenar[0];
              if (primero) abrirChat(primero);
            }}
            data-testid="quick-contact-btn"
            aria-label={`Escribirles a los ${sinEntrenarCount} alumnos sin entrenar`}
            className="ml-auto text-[13px] text-foreground underline underline-offset-2 hover:text-muted-foreground cursor-pointer shrink-0"
          >
            Escribirles
          </button>
        </div>
      )}
    </section>
  );
}
