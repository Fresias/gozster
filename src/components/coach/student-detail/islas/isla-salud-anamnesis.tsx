import * as React from "react";
import { IslaCardShell } from "./isla-card-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Segmented } from "@/components/ui/segmented";
import {
  Activity,
  Check,
  TriangleAlert,
  ClipboardList,
  ArrowRightLeft,
  FileText,
  Save,
  ChevronDown,
  ChevronUp,
} from "@/components/coach/icons";
import {
  actualizarEstadoDolor,
  derivarSeveridadDesdeEva,
  nivelDesdeEva,
  type DolorActivo,
  type EstadoDolor,
  type NivelDolor,
  type SeveridadDolor,
} from "@/lib/dolor";
import { cn } from "@/lib/utils";

export interface AnamnesisData {
  objetivo?: string;
  frecuencia?: string;
  molestiaPrevia?: string;
  cirugias?: string;
}

export interface IslaSaludAnamnesisProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isCanvasMode?: boolean;
  isDragTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  cuestionarioNode?: React.ReactNode;
  painAlertsNode?: React.ReactNode;
  evaDolorActual?: number;
  zonaDolorActual?: string;
  ejercicioNombre?: string;
  fechaReporte?: string;
  reporteId?: string;
  dolorActivo?: Partial<DolorActivo> | null;
  estadoInicial?: EstadoDolor;
  onQuickSwap?: () => void;
  alumnoId?: string;
  anamnesisData?: AnamnesisData;
  onEstadoChange?: (nuevoEstado: EstadoDolor) => Promise<boolean | void> | void;
  onSaveNota?: (nota: string) => Promise<void> | void;
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
}

const SEGMENTED_OPTIONS = [
  { value: "PENDIENTE" as EstadoDolor, label: "Pendiente" },
  { value: "ATENDIDO" as EstadoDolor, label: <span title="Atendido">Atendida</span> },
  { value: "RESUELTO" as EstadoDolor, label: "Resuelta" },
];

export function IslaSaludAnamnesis({
  isCollapsed,
  onToggleCollapse,
  isCanvasMode = false,
  isDragTarget = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  cuestionarioNode,
  painAlertsNode: _painAlertsNode,
  evaDolorActual = 3,
  zonaDolorActual = "Hombro derecho",
  ejercicioNombre,
  fechaReporte,
  reporteId,
  dolorActivo,
  estadoInicial,
  onQuickSwap,
  alumnoId = "demo-alumno-lucas",
  anamnesisData,
  onEstadoChange,
  onSaveNota,
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
}: IslaSaludAnamnesisProps) {
  const [anamnesisCollapsed, setAnamnesisCollapsed] = React.useState(true);
  const [coachLog, setCoachLog] = React.useState(
    "28 oct: agarre neutro y Landmine Press 3x10 25 kg en lugar de banca. Sin dolor el último microciclo."
  );
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);

  const [estado, setEstado] = React.useState<EstadoDolor>(() => {
    if (dolorActivo?.estado) return dolorActivo.estado;
    if (estadoInicial) return estadoInicial;
    return "PENDIENTE";
  });

  React.useEffect(() => {
    if (dolorActivo?.estado) {
      setEstado(dolorActivo.estado);
    } else if (estadoInicial) {
      setEstado(estadoInicial);
    }
  }, [dolorActivo?.estado, estadoInicial]);

  React.useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const savedEstado = localStorage.getItem(`gozster_coach_pain_estado_${alumnoId}`);
        if (savedEstado && ["PENDIENTE", "ATENDIDO", "RESUELTO"].includes(savedEstado)) {
          setEstado(savedEstado as EstadoDolor);
        } else {
          const savedStatus = localStorage.getItem(`gozster_coach_pain_status_${alumnoId}`);
          if (savedStatus === "true") {
            setEstado("ATENDIDO");
          }
        }
        const savedLog = localStorage.getItem(`gozster_coach_clinica_log_${alumnoId}`);
        if (savedLog !== null) {
          setCoachLog(savedLog);
        }
      } catch {}
    }
  }, [alumnoId]);

  const hasActiveDolor = React.useMemo(() => {
    if (dolorActivo === null) return false;
    if (dolorActivo && dolorActivo.eva !== undefined) return dolorActivo.eva > 0;
    if (evaDolorActual !== undefined) {
      return (
        evaDolorActual > 0 &&
        Boolean(zonaDolorActual) &&
        zonaDolorActual.toLowerCase() !== "ninguna"
      );
    }
    return Boolean(zonaDolorActual && zonaDolorActual.toLowerCase() !== "ninguna");
  }, [dolorActivo, evaDolorActual, zonaDolorActual]);

  const effectiveEva = React.useMemo(() => {
    if (dolorActivo?.eva !== undefined) return dolorActivo.eva;
    if (evaDolorActual !== undefined) return evaDolorActual;
    return 5;
  }, [dolorActivo?.eva, evaDolorActual]);

  const effectiveZona = React.useMemo(() => {
    if (dolorActivo?.zona_articular) return dolorActivo.zona_articular;
    if (zonaDolorActual && zonaDolorActual !== "Ninguna") return zonaDolorActual;
    return "Hombro anterior";
  }, [dolorActivo?.zona_articular, zonaDolorActual]);

  const effectiveEjercicio = React.useMemo(() => {
    return (
      dolorActivo?.ejercicio_nombre ||
      ejercicioNombre ||
      "Press de banca plano, serie 2"
    );
  }, [dolorActivo?.ejercicio_nombre, ejercicioNombre]);

  const effectiveFecha = React.useMemo(() => {
    return dolorActivo?.fecha_reporte || fechaReporte || "ayer 18:30";
  }, [dolorActivo?.fecha_reporte, fechaReporte]);

  const activeReporteId = React.useMemo(() => {
    return dolorActivo?.id || reporteId || `reporte-${alumnoId}`;
  }, [dolorActivo?.id, reporteId, alumnoId]);

  const _nivel: NivelDolor = nivelDesdeEva(effectiveEva);
  const severidad: SeveridadDolor = derivarSeveridadDesdeEva(effectiveEva);
  const severidadLabel =
    severidad === "AGUDO" ? "Agudo" : severidad === "MODERADO" ? "Moderado" : "Leve";

  const alertVariant: "destructive" | "warning" | "default" | "info" = React.useMemo(() => {
    if (!hasActiveDolor) return "default";
    if (effectiveEva >= 7) return "destructive";
    if (effectiveEva >= 4) return "warning";
    return "info";
  }, [hasActiveDolor, effectiveEva]);

  const handleEstadoChange = async (nextVal: EstadoDolor) => {
    if (nextVal === estado) return;

    const prevEstado = estado;
    setEstado(nextVal);
    setErrorMsg(null);
    setIsUpdating(true);

    try {
      let success = true;
      let errMessage = "";

      if (onEstadoChange) {
        const res = await onEstadoChange(nextVal);
        if (res === false) {
          success = false;
          errMessage = "Error de red al actualizar estado";
        }
      } else {
        const res = await actualizarEstadoDolor({
          reporteId: activeReporteId,
          nuevoEstado: nextVal,
          nota: coachLog,
        });
        if (!res.ok) {
          success = false;
          errMessage = res.error || "Error al actualizar estado en el servidor";
        }
      }

      if (!success) {
        setEstado(prevEstado);
        setErrorMsg(errMessage || "Error de red al actualizar el estado de molestia.");
      } else {
        if (typeof window !== "undefined" && window.localStorage) {
          try {
            localStorage.setItem(`gozster_coach_pain_estado_${alumnoId}`, nextVal);
            localStorage.setItem(
              `gozster_coach_pain_status_${alumnoId}`,
              String(nextVal === "RESUELTO")
            );
          } catch {}
        }
      }
    } catch (err: any) {
      setEstado(prevEstado);
      setErrorMsg(err?.message || "Error inesperado de red al conectar con el servidor.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveCoachLog = async () => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        localStorage.setItem(`gozster_coach_clinica_log_${alumnoId}`, coachLog);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      } catch {}
    }
    if (onSaveNota) {
      try {
        await onSaveNota(coachLog);
      } catch {}
    }
  };

  const isPainResolved = estado === "RESUELTO";

  return (
    <IslaCardShell
      id="salud_anamnesis"
      dataTestId="isla-salud-anamnesis"
      title="Clínica, Anamnesis &amp; Red Flags"
      icon={<Activity className="h-4 w-4 text-primary" aria-label="Salud" />}
      badge={
        hasActiveDolor ? (
          <Badge
            variant="outline"
            data-testid="red-flags-alert"
            className={cn(
              "text-[10px] font-bold border",
              estado === "RESUELTO"
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : estado === "ATENDIDO"
                ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                : severidad === "AGUDO"
                ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                : "bg-amber-500/20 text-amber-400 border-amber-500/40"
            )}
          >
            {estado === "RESUELTO" ? (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 inline" aria-hidden="true" /> Resuelta
              </span>
            ) : estado === "ATENDIDO" ? (
              <span className="inline-flex items-center gap-1">
                <Check className="h-3 w-3 inline" aria-hidden="true" /> Atendida
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <TriangleAlert className="h-3 w-3 inline" aria-hidden="true" /> Molestia:{" "}
                {effectiveZona}
              </span>
            )}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Sin dolores activos
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
            Clínica: {hasActiveDolor ? effectiveZona : "Sin dolor activo"} •{" "}
            {estado === "RESUELTO"
              ? "Resuelta"
              : estado === "ATENDIDO"
              ? "Atendida"
              : "Pendiente"}{" "}
            • Anamnesis revisada
          </span>
        </div>
      }
    >
      <div className="p-3 sm:p-4 space-y-4">
        {/* Alert Semántico Unificado según EVA 0-10 */}
        {hasActiveDolor ? (
          <Alert
            variant={alertVariant}
            data-testid="alert-salud"
            className="p-3.5 space-y-2.5 rounded-xl border"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {effectiveEva >= 7 ? (
                  <TriangleAlert
                    className="h-4 w-4 text-destructive shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <TriangleAlert
                    className="h-4 w-4 text-amber-500 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-bold px-2 py-0.5",
                    effectiveEva >= 7
                      ? "border-destructive/40 bg-destructive/15 text-destructive"
                      : effectiveEva >= 4
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-500"
                      : "border-sky-500/40 bg-sky-500/15 text-sky-500"
                  )}
                >
                  {severidadLabel}
                </Badge>
                <span className="font-semibold text-foreground text-xs">
                  {effectiveZona}
                </span>
                <span className="text-[11px] font-semibold text-muted-foreground">
                  EVA {effectiveEva}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5",
                    estado === "RESUELTO"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                      : estado === "ATENDIDO"
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-500"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-500"
                  )}
                >
                  {estado === "RESUELTO"
                    ? "Resuelta"
                    : estado === "ATENDIDO"
                    ? "Atendida"
                    : "Pendiente"}
                </Badge>
              </div>
            </div>

            <AlertTitle className="sr-only">Reporte de Molestia en Ejercicio</AlertTitle>

            <AlertDescription className="text-xs text-muted-foreground">
              <div className="text-[11px] text-muted-foreground">
                {effectiveEjercicio} · {effectiveFecha}
              </div>
            </AlertDescription>

            {/* Segmented Control de Intervención & Acción Cambiar Ejercicio */}
            <div className="pt-1 flex flex-wrap items-center justify-between gap-2.5">
              <Segmented<EstadoDolor>
                value={estado}
                onChange={handleEstadoChange}
                options={SEGMENTED_OPTIONS}
                size="sm"
                aria-label="Estado de intervención"
                disabled={isUpdating}
              />

              {onQuickSwap && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onQuickSwap}
                  className="h-7 text-xs font-semibold text-rose-500 border-rose-500/40 hover:bg-rose-500/10 cursor-pointer"
                >
                  <ArrowRightLeft className="h-3 w-3 mr-1 inline" aria-hidden="true" />
                  Cambiar ejercicio
                </Button>
              )}
            </div>

            {errorMsg && (
              <div
                role="alert"
                data-testid="salud-error-alert"
                className="mt-2 text-xs text-destructive font-medium bg-destructive/10 border border-destructive/25 p-2 rounded-lg flex items-center justify-between gap-2"
              >
                <span>{errorMsg}</span>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-[10px] underline hover:text-foreground cursor-pointer"
                >
                  Descartar
                </button>
              </div>
            )}
          </Alert>
        ) : (
          <Alert
            variant="default"
            data-testid="alert-salud-empty"
            className="border-border/70 bg-card text-muted-foreground p-3.5 rounded-xl"
          >
            <AlertDescription className="text-xs text-muted-foreground flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden="true" />
              <span>Sin dolores activos.</span>
            </AlertDescription>
          </Alert>
        )}

        {/* Bitácora / Nota de Intervención con Auto-guardado al salir del foco (onBlur) */}
        <div className="rounded-lg border border-border/80 bg-secondary/15 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-xs font-bold text-foreground">Nota de intervención</span>
              <span className="sr-only">Bitácora de Intervención del Entrenador</span>
            </div>
            {saveSuccess && (
              <span className="text-[11px] font-bold text-emerald-500 animate-in fade-in inline-flex items-center gap-1">
                <Check className="h-3 w-3 inline" aria-hidden="true" /> Guardado automático en la ficha
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">Se guarda al salir del campo.</p>
          <textarea
            value={coachLog}
            onChange={(e) => setCoachLog(e.target.value)}
            onBlur={handleSaveCoachLog}
            rows={3}
            placeholder="Ej.: 28 oct: agarre neutro y Landmine Press 3x10 25 kg en lugar de banca. Sin dolor el último microciclo."
            aria-label="Nota de intervención"
            className="w-full rounded-md border border-border bg-card px-2.5 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-muted-foreground">
              {saveSuccess ? (
                <span className="text-emerald-500 font-medium inline-flex items-center gap-1">
                  <Check className="h-3 w-3 inline" aria-hidden="true" /> Guardado al desenfocar
                </span>
              ) : (
                "Se guarda automáticamente al escribir o salir."
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSaveCoachLog}
              className="h-6 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
            >
              <span className="inline-flex items-center gap-1">
                <Save className="h-3.5 w-3.5 inline" aria-hidden="true" /> Guardar Registro en la Ficha
              </span>
            </Button>
          </div>
        </div>

        {/* Bloque de Anamnesis accesible y colapsable */}
        <div
          data-testid="anamnesis-summary-collapsible"
          className="rounded-lg border border-border/80 bg-secondary/20 p-3 space-y-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
              <div>
                <h4 className="text-xs font-bold text-foreground">
                  Ficha de Anamnesis &amp; Cuestionario Inicial
                </h4>
                <p className="text-[10px] text-muted-foreground">
                  Respuestas de ingreso y condiciones de salud reportadas
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAnamnesisCollapsed((prev) => !prev)}
              className="h-7 text-xs font-semibold gap-1 cursor-pointer"
              aria-expanded={!anamnesisCollapsed}
            >
              <span>{anamnesisCollapsed ? "Ver cuestionario inicial completo" : "Ocultar cuestionario"}</span>
              {anamnesisCollapsed ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">
                Objetivo
              </span>
              <span className="font-semibold text-foreground truncate block">
                {anamnesisData?.objetivo || "Hipertrofia & Fuerza"}
              </span>
            </div>
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">
                Frecuencia
              </span>
              <span className="font-semibold text-foreground truncate block">
                {anamnesisData?.frecuencia || "4 días / semana"}
              </span>
            </div>
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">
                Molestia previa
              </span>
              <span className="font-semibold text-amber-500 truncate block">
                {anamnesisData?.molestiaPrevia || "Hombro anterior"}
              </span>
            </div>
            <div className="rounded bg-card/80 p-1.5 border border-border/60">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">
                Cirugías
              </span>
              <span className="font-semibold text-emerald-500 truncate block">
                {anamnesisData?.cirugias || "Ninguna"}
              </span>
            </div>
          </div>

          {!anamnesisCollapsed && cuestionarioNode && (
            <div className="p-3 pt-2 border-t border-border/40 animate-in fade-in duration-200">
              {cuestionarioNode}
            </div>
          )}
        </div>
      </div>
    </IslaCardShell>
  );
}
