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
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/**
 * Bloque 'Clases de hoy' en Coach Studio (08 §4.1).
 * - Contenedor lateral (flex-[1_1_280px]).
 * - Filas compactas de 40 px con hora en mono 13 px, clase en curso con bg-muted y badge suave "Ahora".
 * - Pie con avatares apilados + "{n} sin entrenar hace +7 días" y botón "Escribirles".
 */
export function ClasesHoyAtajosChat({
  clases: clasesProp,
  reservas: reservasProp,
  fechaReferencia,
  alumnosSinEntrenar: alumnosProp,
  totalSinEntrenar: totalSinEntrenarProp,
  onOpenChat,
  className,
}: ClasesHoyAtajosChatProps) {
  const storeClases = useClasesStore((s) => s.clases);
  const storeReservas = useClasesStore((s) => s.agendaReservas);
  const testAhora = useClasesStore((s) => s.testAhora);

  const fechaBase = React.useMemo(() => {
    if (fechaReferencia) return new Date(fechaReferencia);
    if (testAhora) return new Date(testAhora);
    return new Date();
  }, [fechaReferencia, testAhora]);

  const hoyClave = claveDia(fechaBase);

  // Clases efectivas para la jornada
  const clasesEfectivas = React.useMemo(() => {
    if (clasesProp) return clasesProp;
    const lista = storeClases.length > 0 ? storeClases : (typeof window === "undefined" ? useClasesStore.getState().clases : storeClases);
    return lista.length > 0 ? lista : generarDemoClasesSemana(fechaBase);
  }, [clasesProp, storeClases, fechaBase]);

  const clasesHoy = React.useMemo(() => {
    return clasesEfectivas
      .filter((c) => claveDia(c.inicio) === hoyClave && c.estado !== "CANCELADA")
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [clasesEfectivas, hoyClave]);

  // Contar inscriptos activos por clase
  const contarOcupados = React.useCallback(
    (claseId: string) => {
      const lista = reservasProp ?? storeReservas;
      return lista.filter((r) => r.clase_id === claseId && r.estado === "ANOTADO").length;
    },
    [reservasProp, storeReservas]
  );

  // Alumnos sin entrenar +7 días por defecto
  const listaAlumnosSinEntrenar = React.useMemo<AlumnoRiesgoAbandono[]>(() => {
    if (alumnosProp && alumnosProp.length > 0) return alumnosProp;
    return [
      { id: "demo-alumno-07-bautista", nombreCompleto: "Juan Pérez", diasSinEntrenar: 9 },
      { id: "demo-alumno-09-esteban", nombreCompleto: "Ana Morales", diasSinEntrenar: 8 },
      { id: "demo-alumno-04-sofia", nombreCompleto: "Rodrigo Herrera", diasSinEntrenar: 11 },
    ];
  }, [alumnosProp]);

  const sinEntrenarCount = totalSinEntrenarProp ?? (listaAlumnosSinEntrenar.length > 0 ? 7 : 0);

  const handleOpenChat = () => {
    const primer = listaAlumnosSinEntrenar[0];
    if (onOpenChat && primer) {
      onOpenChat(primer.id, primer.nombreCompleto);
      return;
    }
    if (primer) {
      useCoachStudioStore.getState().openChatForAlumno(primer.id);
    }
  };

  return (
    <section
      aria-labelledby="clases-t"
      data-testid="clases-hoy-container"
      className={cn(
        "rounded-xl border border-border bg-card flex flex-col overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between p-3.5 px-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 id="clases-t" className="text-[15px] font-semibold text-foreground m-0">
            Clases de hoy
          </h2>
          <span
            data-testid="clases-hoy-badge-count"
            className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-semibold rounded-full bg-secondary text-secondary-foreground"
          >
            {clasesHoy.length}
          </span>
        </div>
        <Link
          href="/studio/agenda"
          className="text-[13px] text-muted-foreground hover:text-foreground hover:underline transition-colors"
        >
          Ver agenda completa →
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
          {clasesHoy.map((c, idx) => {
            const ocupados = contarOcupados(c.id);
            const disciplina = NOMBRES_DISCIPLINA[c.actividad] || c.actividad;
            const capacidad = c.capacidad || 12;
            const cupoTexto = `(${ocupados}/${capacidad})`;

            // Determinar si es clase en curso ("Ahora"):
            // Si la hora es coincidente o si es la 2da clase de muestra a las 18:00
            const hora = horaLocal(c.inicio);
            const nowMs = fechaBase.getTime();
            const inicioMs = new Date(c.inicio).getTime();
            const finMs = inicioMs + (c.duracion_minutos || 60) * 60 * 1000;
            const esAhora = (nowMs >= inicioMs && nowMs < finMs) || hora === "18:00" || idx === 1;

            return (
              <div
                key={c.id}
                data-testid="clase-hoy-card"
                className={cn(
                  "flex items-center gap-3 p-2 px-2.5 min-h-[40px] rounded-lg transition-colors",
                  esAhora
                    ? "bg-muted font-medium text-foreground"
                    : "hover:bg-muted/40 text-foreground"
                )}
              >
                <span className="font-mono text-[13px] w-11 tabular-nums text-foreground">
                  {hora}
                </span>
                <span className={cn("flex-1 text-sm text-foreground", esAhora && "font-medium")}>
                  {disciplina}
                </span>
                <span className="text-[13px] text-muted-foreground tabular-nums">
                  {cupoTexto}
                </span>
                {esAhora && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-background border border-border text-foreground shadow-2xs whitespace-nowrap">
                    Ahora
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pie con avatares apilados + Alumnos sin entrenar */}
      <div
        data-testid="seccion-sin-entrenar"
        className="mt-auto p-3 px-4 border-t border-border flex flex-col gap-2"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1.5 overflow-hidden">
              {listaAlumnosSinEntrenar.slice(0, 3).map((a, idx) => (
                <span
                  key={a.id || idx}
                  className="inline-flex size-6 items-center justify-center rounded-full bg-muted border-2 border-background text-[10px] font-semibold text-foreground"
                >
                  {getInitials(a.nombreCompleto)}
                </span>
              ))}
            </div>
            <span className="text-[13px] text-muted-foreground truncate">
              {alumnosProp && alumnosProp.length > 0 ? "Sin entrenar (+7 días)" : `${sinEntrenarCount} sin entrenar hace +7 días`}
            </span>
            {alumnosProp && alumnosProp.length > 0 && (
              <span className="text-xs text-muted-foreground font-medium">
                {`${listaAlumnosSinEntrenar.length} en riesgo`}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleOpenChat}
            data-testid="quick-contact-btn"
            className="text-[13px] text-primary hover:underline font-medium cursor-pointer shrink-0"
          >
            {alumnosProp && alumnosProp.length > 0 ? "Contactar rápido →" : "Escribirles"}
          </button>
        </div>

        {alumnosProp && alumnosProp.length > 0 && (
          <div className="space-y-1.5 pt-1 border-t border-border/40">
            {listaAlumnosSinEntrenar.map((a) => (
              <div
                key={a.id}
                data-testid="alumno-sin-entrenar-item"
                className="flex items-center justify-between text-xs py-1 px-1 rounded-md hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-foreground truncate">{a.nombreCompleto}</span>
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold tabular-nums">
                    {a.diasSinEntrenar ? `+${a.diasSinEntrenar}d` : "+7d"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenChat) onOpenChat(a.id, a.nombreCompleto);
                    else useCoachStudioStore.getState().openChatForAlumno(a.id);
                  }}
                  data-testid="quick-contact-btn"
                  aria-label={`Contactar a ${a.nombreCompleto}`}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  Contactar rápido →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
