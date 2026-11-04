"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import type { LiveSupabaseDataset } from "@/services/alumnos-service";
import type {
  DiaRutina,
  Ejercicio,
  EjercicioEnRutina,
  Perfil,
  PlanEntrenamiento,
} from "@/types/database.types";

export interface AthletePreviewModalProps {
  isOpen: boolean;
  alumnoId?: string | null;
  alumnoNombre?: string | null;
  onClose: () => void;
  dataset: LiveSupabaseDataset;
  onSelectAlumno?: (alumnoId: string) => void;
}

export function AthletePreviewModal({
  isOpen,
  alumnoId,
  alumnoNombre,
  onClose,
  dataset,
  onSelectAlumno,
}: AthletePreviewModalProps) {
  // Encontrar alumno por id o por nombre aproximado (ej: "Miguel")
  const alumno: Perfil | undefined = React.useMemo(() => {
    if (alumnoId) {
      const found = dataset.alumnos.find((a) => a.id === alumnoId);
      if (found) return found;
    }
    if (alumnoNombre) {
      const q = alumnoNombre.trim().toLowerCase();
      const found = dataset.alumnos.find(
        (a) =>
          a.nombre_completo.toLowerCase().includes(q) ||
          a.nombre_completo.toLowerCase().startsWith(q),
      );
      if (found) return found;
    }
    // Fallback: primer alumno con plan o primero de la lista
    return dataset.alumnos[0];
  }, [alumnoId, alumnoNombre, dataset.alumnos]);

  // Plan activo o primer plan del alumno
  const plan: PlanEntrenamiento | undefined = React.useMemo(() => {
    if (!alumno) return undefined;
    return (
      dataset.planes.find((p) => p.alumno_id === alumno.id && p.estado === "ACTIVO") ??
      dataset.planes.find((p) => p.alumno_id === alumno.id)
    );
  }, [alumno, dataset.planes]);

  // Días del plan ordenados
  const dias: DiaRutina[] = React.useMemo(() => {
    if (!plan) return [];
    return dataset.dias
      .filter((d) => d.plan_id === plan.id)
      .sort((a, b) => a.orden - b.orden);
  }, [plan, dataset.dias]);

  const [selectedDiaId, setSelectedDiaId] = React.useState<string | null>(null);
  const [completedSeries, setCompletedSeries] = React.useState<Record<string, boolean>>({});

  // Resetear día seleccionado cuando cambia el alumno o plan
  React.useEffect(() => {
    if (dias.length > 0) {
      setSelectedDiaId(dias[0]!.id);
    } else {
      setSelectedDiaId(null);
    }
  }, [alumno?.id, plan?.id, dias]);

  if (!isOpen) return null;

  const currentDia = dias.find((d) => d.id === selectedDiaId) ?? dias[0];

  const ejerciciosDia: EjercicioEnRutina[] = currentDia
    ? dataset.ejerciciosEnRutina
        .filter((e) => e.dia_id === currentDia.id)
        .sort((a, b) => a.orden - b.orden)
    : [];

  const getEjercicioCatalogo = (ejId: string): Ejercicio | undefined => {
    return dataset.ejercicios.find((e) => e.id === ejId);
  };

  const nombreMostrado = alumno?.nombre_completo ?? alumnoNombre ?? "Miguel Sanchez";

  const toggleSerie = (clave: string) => {
    setCompletedSeries((prev) => ({ ...prev, [clave]: !prev[clave] }));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Vista previa de ${nombreMostrado}`}
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200"
      data-testid="athlete-simulator-modal"
    >
      {/* Banner superior claro de modo entrenador */}
      <header
        className="sticky top-0 z-30 w-full border-b border-primary/30 bg-primary/10 px-4 py-3 backdrop-blur-md shadow-xs"
        data-testid="banner-modo-entrenador"
      >
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 text-xs sm:text-sm font-semibold text-primary">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xs font-black">
              👁️
            </span>
            <span className="text-foreground">
              Modo Entrenador: Vista previa de{" "}
              <strong className="text-primary font-bold">{nombreMostrado}</strong> •{" "}
              <button
                type="button"
                onClick={onClose}
                className="underline hover:text-primary transition-colors cursor-pointer"
              >
                Volver a Studio
              </button>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <label htmlFor="preview-alumno-select" className="sr-only">
              Cambiar alumno
            </label>
            <select
              id="preview-alumno-select"
              value={alumno?.id ?? ""}
              onChange={(e) => {
                if (onSelectAlumno && e.target.value) {
                  onSelectAlumno(e.target.value);
                }
              }}
              className="min-h-10 rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-foreground font-medium shadow-xs"
              data-testid="preview-selector-alumno"
            >
              {dataset.alumnos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre_completo}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onClose}
              data-testid="return-to-studio-btn"
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
            >
              Volver a Studio
            </button>
          </div>
        </div>
      </header>

      {/* Marco de Dispositivo Móvil */}
      <main className="flex-1 flex items-center justify-center p-3 sm:p-6">
        <div
          className="w-full max-w-md rounded-[38px] border-4 border-border/80 bg-background shadow-2xl overflow-hidden flex flex-col min-h-[780px]"
          data-testid="mobile-device-frame"
        >
          {/* Barra de estado simulada móvil */}
          <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[11px] font-bold text-muted-foreground select-none bg-card/60">
            <span>09:41</span>
            <div className="flex items-center gap-1.5">
              <span>5G</span>
              <span className="text-xs">🔋 100%</span>
            </div>
          </div>

          {/* Header Mobile Athlete App */}
          <div className="flex items-center justify-between border-b border-border/80 bg-card/90 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-black">
                G
              </span>
              <span className="text-sm font-black tracking-tight text-foreground">
                GOZSter <span className="text-primary font-bold">Athlete</span>
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Online
            </div>
          </div>

          {/* Contenido de la rutina del alumno */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="athlete-preview-content">
            {/* Saludo al alumno */}
            <div className="pt-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Hola, {alumno?.nombre_completo?.split(" ")[0] ?? "Miguel"}
              </p>
              <h2 className="text-xl font-black text-foreground mt-0.5">
                {plan?.nombre ?? "Rutina de Entrenamiento"}
              </h2>
              {plan?.estado && (
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant={plan.estado === "ACTIVO" ? "success" : "secondary"}>
                    {plan.estado}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    Semana 1 · Modo Atleta
                  </span>
                </div>
              )}
            </div>

            {/* Selector de Días del Alumno */}
            {dias.length > 0 ? (
              <div className="space-y-3">
                <div className="flex gap-2 overflow-x-auto pb-1" data-testid="preview-dias-list">
                  {dias.map((d, index) => {
                    const isSelected = currentDia?.id === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelectedDiaId(d.id)}
                        className={`min-h-11 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                          isSelected
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground border border-border/60"
                        }`}
                        data-testid={`preview-dia-tab-${index}`}
                      >
                        {d.nombre || `Día ${d.orden || index + 1}`}
                      </button>
                    );
                  })}
                </div>

                {/* Comentarios y notas del plan */}
                {plan?.comentarios && (
                  <div
                    className="p-3.5 rounded-2xl bg-secondary/40 border border-border/70 text-xs space-y-1"
                    data-testid="preview-coach-notes"
                  >
                    <p className="text-[11px] font-bold text-primary uppercase tracking-wider">
                      Notas del Entrenador
                    </p>
                    <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                      {plan.comentarios}
                    </p>
                  </div>
                )}

                {/* Ejercicios del Día */}
                <div className="space-y-3 pt-1">
                  <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    Ejercicios ({ejerciciosDia.length})
                  </p>

                  {ejerciciosDia.length === 0 ? (
                    <div className="p-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-2xl">
                      Este día no tiene ejercicios asignados aún.
                    </div>
                  ) : (
                    ejerciciosDia.map((ej, ejIdx) => {
                      const catalogo = getEjercicioCatalogo(ej.ejercicio_id);
                      const totalSeries = ej.series || 3;
                      const seriesArray = Array.from({ length: totalSeries }, (_, i) => i + 1);

                      return (
                        <div
                          key={ej.id}
                          className="rounded-2xl border border-border/70 bg-card p-3.5 space-y-3 shadow-xs"
                          data-testid={`preview-exercise-card-${ejIdx}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-bold text-primary tracking-wider uppercase">
                                Ejercicio {ejIdx + 1}
                              </span>
                              <h3 className="text-sm font-bold text-foreground">
                                {catalogo?.nombre || ej.notas || "Ejercicio"}
                              </h3>
                              {catalogo?.musculos_principales && (
                                <p className="text-[11px] text-muted-foreground">
                                  {catalogo.musculos_principales.join(", ")}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <span className="inline-block px-2 py-0.5 rounded-lg bg-secondary text-[11px] font-semibold text-foreground">
                                {ej.descanso_segundos || 90}s descanso
                              </span>
                            </div>
                          </div>

                          {/* Notas específicas del ejercicio */}
                          {ej.notas && (
                            <p className="text-xs text-muted-foreground bg-secondary/30 p-2 rounded-xl italic">
                              💡 {ej.notas}
                            </p>
                          )}

                          {/* Series interactivas del atleta */}
                          <div className="space-y-1.5 pt-1">
                            <div className="grid grid-cols-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2">
                              <span>Serie</span>
                              <span>Objetivo</span>
                              <span>RPE</span>
                              <span className="text-right">Listo</span>
                            </div>

                            {seriesArray.map((num) => {
                              const serieKey = `${ej.id}-${num}`;
                              const isCompleted = !!completedSeries[serieKey];

                              return (
                                <div
                                  key={num}
                                  className={`grid grid-cols-4 items-center p-2 rounded-xl border text-xs transition-colors ${
                                    isCompleted
                                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                      : "border-border/60 bg-secondary/20 text-foreground"
                                  }`}
                                >
                                  <span className="font-bold">#{num}</span>
                                  <span className="font-mono">
                                    {ej.repeticiones || "10"} reps
                                  </span>
                                  <span className="font-mono text-muted-foreground">
                                    {ej.rpe_objetivo ? `@ ${ej.rpe_objetivo}` : "—"}
                                  </span>
                                  <div className="text-right">
                                    <button
                                      type="button"
                                      onClick={() => toggleSerie(serieKey)}
                                      className={`h-7 w-7 rounded-lg inline-flex items-center justify-center font-bold text-xs transition-all ${
                                        isCompleted
                                          ? "bg-emerald-500 text-white shadow-xs"
                                          : "bg-secondary hover:bg-primary/20 text-muted-foreground hover:text-primary"
                                      }`}
                                      aria-label={`Marcar serie ${num}`}
                                      data-testid={`check-serie-${serieKey}`}
                                    >
                                      {isCompleted ? "✓" : "○"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Widget simulado de cronómetro de descanso */}
                          <div className="flex items-center justify-between p-2 rounded-xl bg-secondary/30 border border-border/40 text-[11px] text-muted-foreground">
                            <span>⏱️ Descanso automático: {ej.descanso_segundos || 90} seg</span>
                            <span className="font-semibold text-primary">Listo para calibrar</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-2xl">
                El alumno {nombreMostrado} no posee un plan activo con días asignados actualmente.
              </div>
            )}
          </div>

          {/* Barra inferior simulada */}
          <div className="border-t border-border/80 bg-card/95 p-3 flex items-center justify-around text-xs text-muted-foreground font-semibold">
            <span className="text-primary font-bold">🏋️ Entrenar</span>
            <span>📅 Historial</span>
            <span>📈 Progreso</span>
            <span>💬 Chat</span>
          </div>
        </div>
      </main>
    </div>
  );
}
