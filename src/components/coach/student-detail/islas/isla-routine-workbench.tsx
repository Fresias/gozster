import * as React from "react";
import type { DiaRutina, Ejercicio, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface IslaRoutineWorkbenchProps {
  rutinaActiva: PlanEntrenamiento | null;
  dias: DiaRutina[];
  ejerciciosEnRutina: EjercicioEnRutina[];
  ejerciciosCatalogo: Ejercicio[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isCanvasMode?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onQuickSwap?: () => void;
  childrenTabs?: React.ReactNode;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onHide?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export function IslaRoutineWorkbench({
  rutinaActiva,
  dias,
  ejerciciosEnRutina,
  ejerciciosCatalogo,
  isCollapsed,
  onToggleCollapse,
  isCanvasMode = false,
  isDragTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onQuickSwap,
  childrenTabs,
  onMoveUp,
  onMoveDown,
  onHide,
  canMoveUp,
  canMoveDown,
}: IslaRoutineWorkbenchProps) {
  // Estado de acordeones por día
  const [openDays, setOpenDays] = React.useState<Record<string, boolean>>({});

  const toggleDay = (dayId: string) => {
    setOpenDays((prev) => ({
      ...prev,
      [dayId]: !prev[dayId],
    }));
  };

  const currentPlanDias = React.useMemo(() => {
    if (!rutinaActiva) return [];
    return dias.filter((d) => d.plan_id === rutinaActiva.id);
  }, [rutinaActiva, dias]);

  return (
    <IslaCardShell
      id="routine_workbench"
      dataTestId="isla-routine-workbench"
      title="Workbench de Entrenamiento Activo"
      icon={<span>⚡</span>}
      badge={
        rutinaActiva ? (
          <Badge variant="default" className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            {rutinaActiva.nombre}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Sin rutina activa
          </Badge>
        )
      }
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      isCanvasMode={isCanvasMode}
      isDragTarget={isDragTarget}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMoveUp={onMoveUp}
      onMoveDown={onMoveDown}
      onHide={onHide}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      compactSummary={
        <div className="flex items-center justify-between">
          <span>
            {rutinaActiva
              ? `${rutinaActiva.nombre} • ${currentPlanDias.length} días configurados`
              : "Sin rutina activa"}
          </span>
        </div>
      }
    >
      <div className="p-3 sm:p-4 space-y-4">
        {/* Matriz del Plan Activo con micro-tablas y acordeones por día */}
        {rutinaActiva ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-border/40">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Matriz Diaria &amp; Micro-tablas
              </span>
              {onQuickSwap && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onQuickSwap}
                  data-testid="workbench-quick-swap-btn"
                  className="h-7 text-xs font-semibold text-amber-500 border-amber-500/40 hover:bg-amber-500/10"
                >
                  ⚡ Quick Swap
                </Button>
              )}
            </div>

            {currentPlanDias.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                Sin días configurados en este plan.
              </p>
            ) : (
              currentPlanDias.map((dia) => {
                const isOpen = openDays[dia.id] ?? true;
                const ejerciciosDelDia = ejerciciosEnRutina.filter(
                  (er) => er.dia_id === dia.id,
                );

                return (
                  <div
                    key={dia.id}
                    data-testid="workbench-day-accordion"
                    className="rounded-lg border border-border bg-secondary/15 overflow-hidden"
                  >
                    {/* Cabezal de Acordeón de Día */}
                    <button
                      type="button"
                      onClick={() => toggleDay(dia.id)}
                      className="flex w-full items-center justify-between p-3 text-left hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-foreground">
                          {dia.nombre}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                          {ejerciciosDelDia.length} ej.
                        </span>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </button>

                    {/* Micro-tabla de series x reps x cargas x descansos */}
                    {isOpen && (
                      <div className="p-3 pt-0 border-t border-border/40 divide-y divide-border/30">
                        {ejerciciosDelDia.length === 0 ? (
                          <p className="py-2 text-xs text-muted-foreground italic">
                            Sin ejercicios en este día.
                          </p>
                        ) : (
                          ejerciciosDelDia.map((item, idx) => {
                            const ejercicioInfo = ejerciciosCatalogo.find(
                              (e) => e.id === item.ejercicio_id,
                            );

                            return (
                              <div
                                key={item.id || `ej-${idx}`}
                                data-testid="workbench-exercise-row"
                                className="py-2 text-xs flex flex-wrap items-center justify-between gap-2"
                              >
                                <div className="space-y-0.5 min-w-[160px]">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-foreground">
                                      {ejercicioInfo?.nombre ?? "Ejercicio personalizado"}
                                    </span>
                                    {item.es_superserie && (
                                      <span
                                        data-testid="workbench-superserie-connector"
                                        className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-black text-amber-500 border border-amber-500/30"
                                      >
                                        🔗 Superserie G{item.grupo_superserie}
                                      </span>
                                    )}
                                  </div>
                                  {item.notas && (
                                    <p className="text-[10px] text-muted-foreground">
                                      {item.notas}
                                    </p>
                                  )}
                                </div>

                                {/* Micro-tabla: Series × Reps • RPE • Descanso */}
                                <div className="flex items-center gap-2 font-mono text-[11px]">
                                  <span className="rounded bg-secondary/80 px-2 py-1 font-bold text-foreground">
                                    {item.series} × {item.repeticiones}
                                  </span>
                                  {item.rpe_objetivo && (
                                    <span className="rounded bg-primary/10 px-1.5 py-1 text-primary font-bold">
                                      RPE {item.rpe_objetivo}
                                    </span>
                                  )}
                                  <span className="text-[10px] text-muted-foreground">
                                    {item.descanso_segundos}s desc.
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
            El alumno no cuenta con una rutina activa actualmente.
          </div>
        )}

        {/* Pestañas de la Ficha (Rutina Actual, Historial, Registros) */}
        {childrenTabs}
      </div>
    </IslaCardShell>
  );
}
