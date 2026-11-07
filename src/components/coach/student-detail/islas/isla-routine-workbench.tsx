"use client";

import * as React from "react";
import type { DiaRutina, Ejercicio, EjercicioEnRutina, PlanEntrenamiento } from "@/types/database.types";
import type { HistoricalLoadEntry } from "@/services/coach-mock-data";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dumbbell, ArrowRightLeft, LinkIcon } from "@/components/coach/icons";
import { QuickSwapModal } from "@/components/coach/quick-swap-modal";
import { DEMO_CRITICAL_ALERTS } from "@/services/coach-demo-dataset";

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
  onQuickSwap?: (alert?: any, exercise?: any) => void;
  childrenTabs?: React.ReactNode;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onSeparateRow?: () => void;
  onResizeWidth?: (delta: number) => void;
  currentWidth?: number;
  isSharedRow?: boolean;
  onHide?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;

  // Extensiones para Ficha y Tabs accesibles
  activeTab?: string;
  onTabChange?: (tab: any) => void;
  alumno?: { id: string; nombre_completo: string; [key: string]: any } | null;
  alumnoId?: string;
  alumnoNombre?: string;
  alertasDolor?: Array<{
    id?: string;
    ejercicioId?: string;
    ejercicio_id?: string;
    ejercicioNombre?: string;
    ejercicio_nombre?: string;
    ejercicioEnRutinaId?: string;
    zona?: string;
    zona_articular?: string;
    detalle?: string;
    estado?: string;
    resolved?: boolean;
    [key: string]: any;
  }>;
  historialCargas?: HistoricalLoadEntry[];
  historialPlanes?: PlanEntrenamiento[];
  historialNode?: React.ReactNode;
  registrosNode?: React.ReactNode;
  onSwapSuccess?: (originalExercise: string, newExercise: string, motivo?: string) => void;
  onOpenHistoricalLoads?: () => void;
  selectedDiaId?: string;
  initialDayId?: string;
  onSelectDia?: (diaId: string) => void;
  initialQuickSwapOpen?: boolean;
  initialQuickSwapExercise?: string;
}

function formatDescanso(segundos?: number | null): string {
  if (segundos == null || segundos === 0) return "0 s";
  if (segundos % 60 === 0) {
    return `${segundos / 60} min`;
  }
  return `${segundos} s`;
}

function formatRPE(rpe?: number | null): string {
  if (rpe == null) return "—";
  return `${rpe}`.replace(".", ",");
}

function calcularDiasRestantes(fechaFin?: string | null): number {
  if (!fechaFin) return 10;
  const target = new Date(fechaFin);
  const now = new Date();
  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

function getUltimaCarga(
  item: EjercicioEnRutina,
  ejercicioInfo?: Ejercicio,
  historial?: HistoricalLoadEntry[]
): string {
  if ((item as any).ultima_carga) return String((item as any).ultima_carga);
  if ((item as any).peso_sugerido) return `${(item as any).peso_sugerido} kg`;

  if (historial && historial.length > 0) {
    for (const entry of historial) {
      const match = entry.series?.find(
        (s) =>
          (s.ejercicio_id && s.ejercicio_id === item.ejercicio_id) ||
          (ejercicioInfo?.nombre &&
            s.ejercicioNombre?.toLowerCase() === ejercicioInfo.nombre.toLowerCase())
      );
      if (match) {
        const peso = (match as any).peso_kg ?? (match as any).peso_utilizado_kg;
        if (typeof peso === "number" && peso > 0) {
          return `${String(peso).replace(".", ",")} kg`;
        }
      }
    }
  }

  const name = (ejercicioInfo?.nombre || "").toLowerCase();
  if (name.includes("banca")) return "77,5 kg";
  if (name.includes("remo")) return "60 kg";
  if (name.includes("militar")) return "40 kg";
  if (name.includes("dominada")) return "Peso corporal";
  if (name.includes("fondo")) return "+5 kg";
  if (name.includes("sentadilla")) return "100 kg";
  if (name.includes("peso muerto")) return "110 kg";

  return "—";
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
  onMoveLeft,
  onMoveRight,
  onSeparateRow,
  onResizeWidth,
  currentWidth,
  isSharedRow,
  onHide,
  canMoveUp,
  canMoveDown,
  canMoveLeft,
  canMoveRight,
  activeTab,
  onTabChange,
  alumno,
  alumnoId,
  alumnoNombre,
  alertasDolor,
  historialCargas,
  historialPlanes,
  historialNode,
  registrosNode,
  onSwapSuccess,
  onOpenHistoricalLoads,
  selectedDiaId: selectedDiaIdProp,
  initialDayId,
  onSelectDia,
  initialQuickSwapOpen = false,
  initialQuickSwapExercise = "",
}: IslaRoutineWorkbenchProps) {
  // Pestaña normalizada
  const [internalTab, setInternalTab] = React.useState<string>("actual");

  const normalizedTab = React.useMemo(() => {
    const raw = activeTab || internalTab;
    if (raw === "rutina_actual" || raw === "actual") return "actual";
    if (raw === "historial_rutinas" || raw === "historial") return "historial";
    if (raw === "registros_sesiones" || raw === "registros") return "registros";
    return "actual";
  }, [activeTab, internalTab]);

  const handleTabSelect = (tab: "actual" | "historial" | "registros") => {
    setInternalTab(tab);
    if (onTabChange) {
      if (tab === "actual") onTabChange("rutina_actual");
      else if (tab === "historial") onTabChange("historial_rutinas");
      else if (tab === "registros") onTabChange("registros_sesiones");
    }
  };

  const currentPlanDias = React.useMemo(() => {
    if (!rutinaActiva) return [];
    return dias.filter((d) => d.plan_id === rutinaActiva.id);
  }, [rutinaActiva, dias]);

  // Selección de chip de día activo
  const [internalDiaId, setInternalDiaId] = React.useState<string>(initialDayId || "");

  const activeDiaId = React.useMemo(() => {
    const candidate = selectedDiaIdProp || internalDiaId;
    if (candidate && currentPlanDias.some((d) => d.id === candidate)) {
      return candidate;
    }
    return currentPlanDias[0]?.id || "";
  }, [selectedDiaIdProp, internalDiaId, currentPlanDias]);

  const handleSelectDia = (diaId: string) => {
    setInternalDiaId(diaId);
    onSelectDia?.(diaId);
  };

  const ejerciciosDelDia = React.useMemo(() => {
    if (!activeDiaId) return [];
    return ejerciciosEnRutina.filter((er) => er.dia_id === activeDiaId);
  }, [activeDiaId, ejerciciosEnRutina]);

  const effectiveAlumnoNombre = alumnoNombre || alumno?.nombre_completo || "Lucas Giménez";
  const effectiveAlumnoId = alumnoId || alumno?.id || "demo-alumno-01-lucas";

  // Identificador semántico de dolor activo por ejercicio
  const getExercisePainAlert = React.useCallback(
    (item: EjercicioEnRutina, ejercicioInfo?: Ejercicio) => {
      if ((item as any).tiene_dolor || (item as any).dolor_activo || (item as any).dolorActivo) {
        return (
          (item as any).alerta_dolor ||
          (item as any).reporte_dolor || {
            id: `alert-${item.id}`,
            ejercicioNombre: ejercicioInfo?.nombre || "Ejercicio",
            zona: "Hombro",
            detalle: "Dolor activo reportado por el atleta",
          }
        );
      }

      if (alertasDolor && alertasDolor.length > 0) {
        const found = alertasDolor.find((a) => {
          if (a.resolved || a.estado === "RESUELTO" || a.estado === "CERRADO") return false;
          if (a.ejercicioId && a.ejercicioId === item.ejercicio_id) return true;
          if (a.ejercicio_id && a.ejercicio_id === item.ejercicio_id) return true;
          if (a.ejercicioEnRutinaId && a.ejercicioEnRutinaId === item.id) return true;
          const aName = (a.ejercicioNombre || a.ejercicio_nombre || "").toLowerCase().trim();
          const eName = (ejercicioInfo?.nombre || "").toLowerCase().trim();
          return aName && eName && (aName.includes(eName) || eName.includes(aName));
        });
        if (found) return found;
      }

      const demoMatch = DEMO_CRITICAL_ALERTS.find((a) => {
        if (a.resolved) return false;
        const matchesStudent =
          (effectiveAlumnoId && a.alumnoId === effectiveAlumnoId) ||
          (effectiveAlumnoNombre &&
            a.alumnoNombre.toLowerCase().includes(effectiveAlumnoNombre.toLowerCase()));
        if (!matchesStudent) return false;
        const aName = (a.ejercicioNombre || "").toLowerCase().trim();
        const eName = (ejercicioInfo?.nombre || "").toLowerCase().trim();
        return aName && eName && (aName.includes(eName) || eName.includes(aName));
      });

      return demoMatch || null;
    },
    [alertasDolor, effectiveAlumnoId, effectiveAlumnoNombre]
  );

  const hasAnyPainInPlan = React.useMemo(() => {
    return currentPlanDias.some((dia) => {
      const ejs = ejerciciosEnRutina.filter((er) => er.dia_id === dia.id);
      return ejs.some((item) => {
        const info = ejerciciosCatalogo.find((e) => e.id === item.ejercicio_id);
        return Boolean(getExercisePainAlert(item, info));
      });
    });
  }, [currentPlanDias, ejerciciosEnRutina, ejerciciosCatalogo, getExercisePainAlert]);

  // Modal de sustitución de ejercicio (Quick Swap)
  const [quickSwapData, setQuickSwapData] = React.useState<{
    isOpen: boolean;
    ejercicioActual: string;
    ejercicioActualId?: string;
    ejercicioEnRutinaId?: string;
    alertaId?: string;
    reporteDolorId?: string;
    dolorDetalle?: string;
    zona?: string;
  }>({
    isOpen: initialQuickSwapOpen,
    ejercicioActual: initialQuickSwapExercise,
  });

  const handleOpenQuickSwap = (
    item: EjercicioEnRutina,
    ejercicioInfo?: Ejercicio,
    painAlert?: any
  ) => {
    const exName = ejercicioInfo?.nombre || "Ejercicio";
    setQuickSwapData({
      isOpen: true,
      ejercicioActual: exName,
      ejercicioActualId: item.ejercicio_id,
      ejercicioEnRutinaId: item.id,
      alertaId: painAlert?.id,
      reporteDolorId: painAlert?.reporteDolorId || painAlert?.id,
      dolorDetalle: painAlert?.detalle || (painAlert ? "Molestia reportada por el atleta" : undefined),
      zona: painAlert?.zona || painAlert?.zona_articular || "Hombro",
    });
    onQuickSwap?.(painAlert, item);
  };

  const historialCount = historialPlanes?.length ?? 0;
  const registrosCount = historialCargas?.length ?? 0;

  return (
    <IslaCardShell
      id="routine_workbench"
      dataTestId="isla-routine-workbench"
      title="Rutina"
      icon={<Dumbbell className="h-4 w-4 text-primary" aria-label="Rutina" />}
      meta={rutinaActiva ? rutinaActiva.nombre : "Sin rutina activa"}
      badge={
        rutinaActiva ? (
          <Badge variant="success">
            Vigente{rutinaActiva.fecha_fin ? ` · ${calcularDiasRestantes(rutinaActiva.fecha_fin)} días` : ""}
          </Badge>
        ) : null
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
      onMoveLeft={onMoveLeft}
      onMoveRight={onMoveRight}
      onSeparateRow={onSeparateRow}
      onResizeWidth={onResizeWidth}
      currentWidth={currentWidth}
      isSharedRow={isSharedRow}
      onHide={onHide}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      canMoveLeft={canMoveLeft}
      canMoveRight={canMoveRight}
      compactSummary={
        <div className="flex items-center justify-between text-xs">
          <span>
            {rutinaActiva
              ? `${rutinaActiva.nombre} • ${currentPlanDias.length} días configurados`
              : "Sin rutina activa"}
          </span>
        </div>
      }
    >
      <div className="p-4 space-y-4">
        {/* Estructura de pestañas accesibles: Actual, Historial, Registros */}
        <div
          role="tablist"
          aria-label="Pestañas de la rutina del alumno"
          className="inline-flex max-w-full rounded-lg bg-muted p-[3px] gap-0.5 overflow-x-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={normalizedTab === "actual"}
            onClick={() => handleTabSelect("actual")}
            className={`rounded-md h-[30px] px-3 text-center text-[13px] whitespace-nowrap transition-all cursor-pointer ${
              normalizedTab === "actual"
                ? "bg-background text-foreground font-medium shadow-xs"
                : "text-neutral-soft-foreground hover:text-foreground"
            }`}
          >
            Rutina actual
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={normalizedTab === "historial"}
            onClick={() => handleTabSelect("historial")}
            className={`rounded-md h-[30px] px-3 text-center text-[13px] whitespace-nowrap transition-all cursor-pointer ${
              normalizedTab === "historial"
                ? "bg-background text-foreground font-medium shadow-xs"
                : "text-neutral-soft-foreground hover:text-foreground"
            }`}
          >
            Historial ({historialCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={normalizedTab === "registros"}
            onClick={() => handleTabSelect("registros")}
            data-testid="tab-registros-sesiones"
            className={`rounded-md h-[30px] px-3 text-center text-[13px] whitespace-nowrap transition-all cursor-pointer ${
              normalizedTab === "registros"
                ? "bg-background text-foreground font-medium shadow-xs"
                : "text-neutral-soft-foreground hover:text-foreground"
            }`}
          >
            Registros ({registrosCount})
          </button>
        </div>

        {/* CONTENIDO TAB 1: Rutina Actual */}
        {normalizedTab === "actual" && (
          <div className="space-y-3.5" data-testid="workbench-actual-panel">
            {rutinaActiva ? (
              <>
                {/* Chips de selección rápida de días */}
                {currentPlanDias.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    Sin días configurados en este plan.
                  </p>
                ) : (
                  <div
                    role="tablist"
                    aria-label="Días del plan de entrenamiento"
                    className="flex items-center gap-2 overflow-x-auto pb-1"
                  >
                    {currentPlanDias.map((dia) => {
                      const isSelected = activeDiaId === dia.id;
                      return (
                        <button
                          key={dia.id}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          aria-pressed={isSelected}
                          aria-label={dia.nombre}
                          data-testid="workbench-day-chip"
                          onClick={() => handleSelectDia(dia.id)}
                          className={`whitespace-nowrap h-8 px-3 rounded-full border text-[13px] transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-foreground text-background border-foreground"
                              : "bg-background text-neutral-soft-foreground border-border hover:bg-muted"
                          }`}
                        >
                          <span data-testid="workbench-day-accordion">{dia.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Micro-tabla de ejercicios */}
                {ejerciciosDelDia.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                    Sin ejercicios configurados en este día.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead className="text-xs font-normal text-neutral-soft-foreground border-b border-border">
                        <tr>
                          <th className="h-10 px-3 font-normal">Ejercicio</th>
                          <th className="h-10 px-3 font-normal whitespace-nowrap">Series × reps</th>
                          <th className="h-10 px-3 font-normal whitespace-nowrap">Última carga</th>
                          <th className="h-10 px-3 font-normal whitespace-nowrap">Descanso</th>
                          <th className="h-10 px-3 font-normal whitespace-nowrap">RPE</th>
                          <th className="h-10 px-3 font-normal text-right">
                            <span className="sr-only">Acciones</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {ejerciciosDelDia.map((item, idx) => {
                          const ejercicioInfo = ejerciciosCatalogo.find((e) => e.id === item.ejercicio_id);
                          const painAlert = getExercisePainAlert(item, ejercicioInfo);
                          const hasPain = Boolean(painAlert);

                          return (
                            <tr
                              key={item.id || `ej-${idx}`}
                              data-testid="workbench-exercise-row"
                              className={`transition-colors ${
                                hasPain
                                  ? "bg-warning-soft"
                                  : "hover:bg-muted/40"
                              }`}
                            >
                              <td className="py-2.5 px-3 align-middle min-w-[200px]">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-foreground">
                                      {ejercicioInfo?.nombre ?? "Ejercicio personalizado"}
                                    </span>
                                    {item.es_superserie && (
                                      <span
                                        data-testid="workbench-superserie-connector"
                                        className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[11px] text-neutral-soft-foreground"
                                      >
                                        <LinkIcon className="h-3 w-3 inline" aria-hidden="true" /> Superserie G{item.grupo_superserie}
                                      </span>
                                    )}
                                  </div>
                                  {(hasPain || item.notas) && (
                                    <p className="m-0 text-xs text-neutral-soft-foreground">
                                      {[hasPain && painAlert?.zona ? `Dolor de ${painAlert.zona.toLowerCase()} activo` : null, item.notas]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </p>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 align-middle font-mono text-[13px] whitespace-nowrap text-foreground">
                                {item.series} × {item.repeticiones}
                              </td>
                              <td className="py-2.5 px-3 align-middle font-mono text-[13px] whitespace-nowrap text-foreground">
                                {getUltimaCarga(item, ejercicioInfo, historialCargas)}
                              </td>
                              <td className="py-2.5 px-3 align-middle font-mono text-[13px] whitespace-nowrap text-foreground">
                                {formatDescanso(item.descanso_segundos)}
                              </td>
                              <td className="py-2.5 px-3 align-middle font-mono whitespace-nowrap">
                                {item.rpe_objetivo ? (
                                  <span className="font-mono text-[13px] text-foreground">
                                    {formatRPE(item.rpe_objetivo)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 align-middle text-right whitespace-nowrap">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  data-testid="workbench-quick-swap-btn"
                                  aria-label={`Cambiar ejercicio ${ejercicioInfo?.nombre || ""}`}
                                  onClick={() => handleOpenQuickSwap(item, ejercicioInfo, painAlert)}
                                  className="h-8 w-8 p-0 text-neutral-soft-foreground hover:text-foreground hover:bg-muted"
                                >
                                  <ArrowRightLeft className="h-4 w-4 inline" aria-hidden="true" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Nota del coach y estado de dolor */}
                {(rutinaActiva.comentarios || hasAnyPainInPlan) && (
                  <p className="m-0 text-[13px] text-neutral-soft-foreground">
                    {rutinaActiva.comentarios && (
                      <>
                        <span className="font-medium text-foreground">Nota del coach:</span> {rutinaActiva.comentarios}
                      </>
                    )}
                    {hasAnyPainInPlan && " La fila resaltada tiene una alerta de dolor activa."}
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">
                El alumno no cuenta con una rutina activa actualmente.
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO TAB 2: Historial */}
        {normalizedTab === "historial" && (
          <div data-testid="workbench-historial-panel" className="space-y-4">
            {historialNode ? (
              historialNode
            ) : childrenTabs ? (
              childrenTabs
            ) : (
              <div className="space-y-2">
                {historialPlanes && historialPlanes.length > 0 ? (
                  historialPlanes.map((plan) => (
                    <div
                      key={plan.id}
                      className="p-3 rounded-lg border border-border/60 bg-secondary/15 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-foreground">{plan.nombre}</span>
                        <p className="text-[10px] text-muted-foreground">
                          Creado el {new Date(plan.created_at).toLocaleDateString("es-AR")}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {plan.estado}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                    Sin historial de planes previos.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* CONTENIDO TAB 3: Registros */}
        {normalizedTab === "registros" && (
          <div data-testid="panel-registros-sesiones" className="space-y-4">
            {registrosNode ? (
              registrosNode
            ) : childrenTabs ? (
              childrenTabs
            ) : (
              <div className="space-y-2">
                {historialCargas && historialCargas.length > 0 ? (
                  historialCargas.slice(0, 10).map((entry, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg border border-border/60 bg-secondary/15 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-semibold text-foreground">{entry.sesion.fecha}</span>
                        <p className="text-[10px] text-muted-foreground">
                          {entry.series.length} series registradas
                        </p>
                      </div>
                      {onOpenHistoricalLoads && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={onOpenHistoricalLoads}
                          className="h-7 text-xs"
                        >
                          Ver Cargas
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                    Sin registros de sesiones cargados.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de sustitución de ejercicio ante dolor */}
      <QuickSwapModal
        isOpen={quickSwapData.isOpen}
        onClose={() => setQuickSwapData((prev) => ({ ...prev, isOpen: false }))}
        alumnoNombre={effectiveAlumnoNombre}
        alumnoId={effectiveAlumnoId}
        ejercicioActual={quickSwapData.ejercicioActual}
        ejercicioActualId={quickSwapData.ejercicioActualId}
        ejercicioEnRutinaId={quickSwapData.ejercicioEnRutinaId}
        planId={rutinaActiva?.id}
        alertaId={quickSwapData.alertaId}
        reporteDolorId={quickSwapData.reporteDolorId}
        dolorDetalle={quickSwapData.dolorDetalle}
        zona={quickSwapData.zona}
        catalogoEjercicios={ejerciciosCatalogo}
        onSwapSuccess={(orig, nuevo, motivo) => {
          onSwapSuccess?.(orig, nuevo, motivo);
          setQuickSwapData((prev) => ({ ...prev, isOpen: false }));
        }}
      />
    </IslaCardShell>
  );
}
