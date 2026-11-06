"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { claveDia, horaLocal } from "@/lib/clases";
import { useClasesStore } from "@/store/use-clases-store";
import { useChatStore } from "@/store/use-chat-store";
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
  onOpenChat?: (alumnoId: string, alumnoNombre: string) => void;
  className?: string;
}

const NOMBRES_DISCIPLINA: Record<string, string> = {
  FUNCIONAL: "Funcional",
  BOXEO: "Boxeo",
  FUERZA: "Fuerza y Acondicionamiento",
  RUTINAS: "Rutinas",
};

/**
 * Bloque complementario 'Clases de hoy' y acciones rápidas de contacto (GOZS-393).
 * Muestra las clases del día actual con horario, disciplina y cupo ocupado/total.
 * Provee atajos de contacto rápido con atletas sin entrenar +7 días reutilizando ChatFab.
 */
export function ClasesHoyAtajosChat({
  clases: clasesProp,
  reservas: reservasProp,
  fechaReferencia,
  alumnosSinEntrenar: alumnosProp,
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

  // Alumnos sin entrenar +7 días por defecto si no se inyectan
  const listaAlumnosSinEntrenar = React.useMemo<AlumnoRiesgoAbandono[]>(() => {
    if (alumnosProp) return alumnosProp;
    return [
      { id: "demo-alumno-07-bautista", nombreCompleto: "Bautista Benítez", diasSinEntrenar: 9 },
      { id: "demo-alumno-09-esteban", nombreCompleto: "Esteban Papic", diasSinEntrenar: 8 },
      { id: "demo-alumno-04-sofia", nombreCompleto: "Sofía Albarracín", diasSinEntrenar: 11 },
    ];
  }, [alumnosProp]);

  // Manejador de contacto rápido que abre ChatFab sin alterar la vista principal
  const handleOpenChat = (alumnoId: string, alumnoNombre: string) => {
    if (onOpenChat) {
      onOpenChat(alumnoId, alumnoNombre);
      return;
    }
    useCoachStudioStore.getState().openChatForAlumno(alumnoId);
  };

  return (
    <section
      aria-labelledby="clases-hoy-titulo"
      data-testid="clases-hoy-container"
      className={cn("rounded-2xl border border-border bg-card p-5 space-y-5", className)}
    >
      {/* 1. Bloque Clases de hoy */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <h2 id="clases-hoy-titulo" className="text-base font-semibold tracking-tight text-foreground">
              Clases de hoy
            </h2>
            <span
              data-testid="clases-hoy-badge-count"
              className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground font-mono tabular-nums"
            >
              {clasesHoy.length}
            </span>
          </div>
          <Link
            href="/studio/agenda"
            className="text-xs font-medium text-primary hover:underline transition-colors"
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
          <div data-testid="clases-hoy-list" className="space-y-2">
            {clasesHoy.map((c) => {
              const ocupados = contarOcupados(c.id);
              const disciplina = NOMBRES_DISCIPLINA[c.actividad] || c.actividad;
              const cupoTexto = c.capacidad ? `(${ocupados}/${c.capacidad})` : `(${ocupados} anot.)`;

              return (
                <div
                  key={c.id}
                  data-testid="clase-hoy-card"
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 p-3 hover:bg-muted/40 hover:border-border transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-foreground tabular-nums">
                      {horaLocal(c.inicio)}
                    </span>
                    <span className="text-muted-foreground/60">·</span>
                    <span className="text-sm font-semibold text-foreground">
                      {disciplina}
                    </span>
                  </div>

                  <span className="font-mono text-xs font-medium text-muted-foreground tabular-nums">
                    {cupoTexto}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Atajos de Chat y Alumnos en Riesgo (+7 días sin entrenar) */}
      <div data-testid="seccion-sin-entrenar" className="space-y-3 pt-2 border-t border-border/60">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Sin entrenar (+7 días)
          </h3>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {`${listaAlumnosSinEntrenar.length} en riesgo`}
          </span>
        </div>

        <div className="space-y-2">
          {listaAlumnosSinEntrenar.map((a) => (
            <div
              key={a.id}
              data-testid="alumno-sin-entrenar-item"
              className="flex items-center justify-between rounded-xl border border-border/70 bg-background/50 p-2.5 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">
                  {a.nombreCompleto}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold tabular-nums">
                  {a.diasSinEntrenar ? `+${a.diasSinEntrenar}d` : "+7d"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleOpenChat(a.id, a.nombreCompleto)}
                data-testid="quick-contact-btn"
                aria-label={`Contactar a ${a.nombreCompleto}`}
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                Contactar rápido →
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
